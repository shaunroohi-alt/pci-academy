#!/usr/bin/env python3
"""Deploy the Stem Master server to a Hugging Face Docker Space.

What it does, in order:

1. ``create_repo`` the Space (Docker SDK) if it does not exist yet.
2. Stage ``stem-master/server`` (without tests, caches, ``space/``, ``deploy/``
   and anything that looks like a local secret or virtualenv), put
   ``space/README.md`` at the Space root as ``README.md`` (the Space card with
   ``sdk: docker`` / ``app_port: 7860``), and upload it as one commit. Files in
   the Space that are no longer in the source are deleted in the same commit.
3. Store ``STEM_MASTER_API_KEY`` (read from the environment) as a Space secret,
   when it is set.
4. Request the hardware tier and sleep time.
5. Print the Space URL, and optionally wait until the new build is running and
   ``/v1/health`` answers.

Authentication: ``huggingface_hub`` reads the token from ``HF_TOKEN`` or from a
cached ``hf auth login``. The token needs write access to the Space's owner.

Usable locally::

    pip install "huggingface_hub>=0.24"
    export HF_TOKEN=hf_...                     # write token
    export STEM_MASTER_API_KEY=...             # optional
    python stem-master/server/deploy/hf_space.py --space-id you/stem-master \\
        --hardware t4-small --sleep-time 3600 --wait 1800

``--dry-run`` stages and lists the files without contacting Hugging Face.

Exit codes: 0 ok, 1 usage / configuration error, 2 Hugging Face API error,
3 the hardware request was refused (code was uploaded), 4 the Space build or
start-up failed (only with ``--wait``).
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Iterable, List, Optional, Sequence, Tuple

DEFAULT_SPACE_ID = "MpInDaHouse/stem-master"
HARDWARE_CHOICES = (
    "cpu-basic",
    "cpu-upgrade",
    "t4-small",
    "t4-medium",
    "l4x1",
    "a10g-small",
    "a10g-large",
)
FREE_HARDWARE = ("cpu-basic",)
API_KEY_ENV = "STEM_MASTER_API_KEY"
SERVER_DIR = Path(__file__).resolve().parent.parent
BILLING_URL = "https://huggingface.co/settings/billing"
TOKENS_URL = "https://huggingface.co/settings/tokens"

# Excluded top-level entries of the server directory.
EXCLUDED_TOP_LEVEL = ("tests", "space", "deploy", "build", "dist", "README.md")
# Excluded names at any depth (fnmatch patterns on a single path component).
EXCLUDED_ANYWHERE = (
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".git",
    ".venv",
    "venv",
    "*.egg-info",
    "*.pyc",
    "*.pyo",
    ".DS_Store",
    ".env",
    ".env.*",
)

# SpaceRuntime.stage values (huggingface_hub.SpaceStage) grouped by meaning.
ERROR_STAGES = ("BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE")
BUSY_STAGES = ("BUILDING", "APP_STARTING", "RUNNING_BUILDING", "RUNNING_APP_STARTING")


class DeployError(Exception):
    """A failure with a message meant for the person running the deploy."""

    def __init__(self, message: str, exit_code: int = 2) -> None:
        super().__init__(message)
        self.exit_code = exit_code


# ---------------------------------------------------------------------------
# output helpers (GitHub Actions annotations when running in a workflow)
# ---------------------------------------------------------------------------


def _in_github_actions() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true"


def _annotate(level: str, message: str) -> None:
    """Print ``message``; inside GitHub Actions as a workflow annotation."""
    if _in_github_actions():
        escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::{level}::{escaped}", flush=True)
    else:
        stream = sys.stderr if level in ("error", "warning") else sys.stdout
        print(f"{level.upper()}: {message}", file=stream, flush=True)


def error(message: str) -> None:
    _annotate("error", message)


def warning(message: str) -> None:
    _annotate("warning", message)


def step_summary(lines: Sequence[str]) -> None:
    """Append Markdown lines to the GitHub Actions job summary, if there is one."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------------------
# pure helpers
# ---------------------------------------------------------------------------

_SPACE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")


def validate_space_id(space_id: str) -> str:
    """Return ``space_id`` stripped, or raise :class:`DeployError` if malformed."""
    value = space_id.strip()
    if not _SPACE_ID_RE.match(value) or len(value.split("/", 1)[1]) > 96:
        raise DeployError(
            f"--space-id must look like 'owner/name' (letters, digits, '-', '_', '.'), got {space_id!r}",
            exit_code=1,
        )
    return value


def space_url(space_id: str) -> str:
    """Public URL of a Space app: ``https://<owner>-<name>.hf.space``.

    Hugging Face lowercases the subdomain and replaces ``_`` and ``.`` with ``-``.
    """
    owner, name = space_id.split("/", 1)
    sub = f"{owner}-{name}".lower().replace("_", "-").replace(".", "-")
    return f"https://{sub}.hf.space"


def parse_sleep_time(raw: str) -> Optional[int]:
    """Parse the sleep time in seconds. Empty means "leave as is"; -1 means never sleep."""
    value = (raw or "").strip()
    if not value:
        return None
    try:
        seconds = int(value)
    except ValueError:
        raise DeployError(f"--sleep-time must be a whole number of seconds, got {raw!r}", exit_code=1) from None
    if seconds != -1 and seconds <= 0:
        raise DeployError(f"--sleep-time must be -1 (never) or a positive number of seconds, got {seconds}", exit_code=1)
    return seconds


def _is_excluded(rel_parts: Tuple[str, ...]) -> bool:
    """True when a path (as parts relative to the server dir) must not be deployed."""
    if rel_parts and rel_parts[0] in EXCLUDED_TOP_LEVEL:
        return True
    return any(fnmatch.fnmatch(part, pattern) for part in rel_parts for pattern in EXCLUDED_ANYWHERE)


def stage_space(server_dir: Path, dest: Path) -> List[str]:
    """Copy the deployable part of ``server_dir`` into ``dest``; return the relative paths.

    ``space/README.md`` becomes ``README.md`` at the root. A ``Dockerfile`` is required.
    """
    server_dir = server_dir.resolve()
    if not (server_dir / "Dockerfile").is_file():
        raise DeployError(f"{server_dir} has no Dockerfile; pass --server-dir pointing at stem-master/server", exit_code=1)
    readme = server_dir / "space" / "README.md"
    if not readme.is_file():
        raise DeployError(f"{readme} is missing (it becomes the Space card)", exit_code=1)

    copied: List[str] = []
    for root, dirnames, filenames in os.walk(server_dir):
        root_path = Path(root)
        rel_root = root_path.relative_to(server_dir).parts
        # Prune excluded directories so os.walk never descends into them.
        dirnames[:] = sorted(d for d in dirnames if not _is_excluded(rel_root + (d,)))
        for filename in sorted(filenames):
            rel = rel_root + (filename,)
            if _is_excluded(rel):
                continue
            source = root_path / filename
            if source.is_symlink() or not source.is_file():
                continue
            target = dest.joinpath(*rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.append("/".join(rel))

    shutil.copy2(readme, dest / "README.md")
    copied.append("README.md")
    return sorted(copied)


def _http_status(exc: BaseException) -> Optional[int]:
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def _server_message(exc: BaseException) -> str:
    """Best-effort one-line description of a Hugging Face HTTP error."""
    message = getattr(exc, "server_message", None) or ""
    if not message:
        response = getattr(exc, "response", None)
        try:
            payload = response.json() if response is not None else None
            if isinstance(payload, dict):
                message = str(payload.get("error") or payload.get("message") or "")
        except Exception:  # noqa: BLE001 - diagnostics only
            message = ""
    if not message:
        message = str(exc).splitlines()[0] if str(exc) else exc.__class__.__name__
    return message.strip()


def explain_hardware_refusal(hardware: str, exc: BaseException) -> str:
    status = _http_status(exc)
    detail = _server_message(exc)
    code = f"HTTP {status}: " if status else ""
    return (
        f"Hugging Face refused hardware '{hardware}' ({code}{detail}). "
        f"Every tier except cpu-basic is billed by the minute and needs a payment method on the "
        f"account or organization that owns the Space: add one at {BILLING_URL} (organizations: "
        f"the organization's Settings > Billing), then run the deploy again. The code was uploaded; "
        f"until then the Space keeps its current hardware (cpu-basic is free but separation on it is very slow)."
    )


def explain_auth_failure(exc: BaseException, action: str) -> str:
    status = _http_status(exc)
    detail = _server_message(exc)
    code = f"HTTP {status}: " if status else ""
    return (
        f"Hugging Face rejected the request to {action} ({code}{detail}). "
        f"HF_TOKEN must be a token with write access to the Space's owner: create one with the "
        f"'Write' role (or a fine-grained token with write access to that user or organization) at {TOKENS_URL}."
    )


# ---------------------------------------------------------------------------
# Hugging Face operations
# ---------------------------------------------------------------------------


def _import_hub() -> Tuple[Any, type]:
    """Import ``huggingface_hub`` lazily so ``--help`` and ``--dry-run`` work without it."""
    try:
        import huggingface_hub  # noqa: PLC0415
    except ImportError:
        raise DeployError(
            "huggingface_hub is not installed: pip install 'huggingface_hub>=0.24'", exit_code=1
        ) from None
    http_error: type = Exception
    for module_name in ("huggingface_hub.errors", "huggingface_hub.utils"):
        try:
            module = __import__(module_name, fromlist=["HfHubHTTPError"])
            http_error = getattr(module, "HfHubHTTPError")
            break
        except (ImportError, AttributeError):
            continue
    return huggingface_hub, http_error


def _stage_name(runtime: Any) -> str:
    stage = getattr(runtime, "stage", None)
    return str(getattr(stage, "value", stage) or "UNKNOWN")


def _runtime_raw(runtime: Any) -> dict:
    raw = getattr(runtime, "raw", None)
    return raw if isinstance(raw, dict) else {}


def _runtime_url(runtime: Any) -> Optional[str]:
    for domain in _runtime_raw(runtime).get("domains") or []:
        if isinstance(domain, dict) and domain.get("domain"):
            return f"https://{domain['domain']}"
    return None


def _check_health(url: str, timeout: float = 15.0) -> Optional[dict]:
    try:
        with urllib.request.urlopen(f"{url}/v1/health", timeout=timeout) as response:  # noqa: S310 - https URL
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return None


def _runtime_hardware(runtime: Any) -> Tuple[Optional[str], Optional[str]]:
    """(current, requested) hardware flavors reported by a SpaceRuntime."""

    def flavor(value: Any) -> Optional[str]:
        value = getattr(value, "value", value)
        return str(value) if value else None

    return flavor(getattr(runtime, "hardware", None)), flavor(getattr(runtime, "requested_hardware", None))


def wait_until_running(
    api: Any,
    space_id: str,
    commit_sha: Optional[str],
    url: str,
    timeout_s: float,
    expected_hardware: Optional[str] = None,
    check_health: bool = True,
    poll_s: float = 15.0,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> dict:
    """Poll the Space until the uploaded revision runs and ``/v1/health`` answers.

    A stage counts only once it belongs to the uploaded revision: the runtime's
    ``sha`` equals ``commit_sha`` or, when Hugging Face reports no sha, after a
    build/start-up stage has been seen. That way the result of an earlier
    (failed or healthy) build is not mistaken for this one. ``RUNNING`` also has
    to be on ``expected_hardware`` when given, since a hardware change restarts
    the Space.

    Returns the health JSON (``{}`` when ``check_health`` is false, e.g. for a
    private Space). Raises :class:`DeployError` (``exit_code=4``) on a build or
    runtime error, a paused Space, or timeout.
    """
    deadline = clock() + timeout_s
    last_seen: Optional[str] = None
    saw_busy = False
    while True:
        runtime = api.get_space_runtime(space_id)
        stage = _stage_name(runtime)
        running_sha = _runtime_raw(runtime).get("sha")
        current_hw, _requested = _runtime_hardware(runtime)
        if stage in BUSY_STAGES:
            saw_busy = True
        line = f"{stage} on {current_hw or '?'} (revision {(running_sha or '?')[:10]})"
        if line != last_seen:
            print(f"Space stage: {line}", flush=True)
            last_seen = line

        if commit_sha is None:
            this_revision = True
        elif running_sha:
            this_revision = running_sha == commit_sha
        else:
            this_revision = saw_busy

        if this_revision and stage in ERROR_STAGES:
            raise DeployError(
                f"The Space reported {stage}. Build log: https://huggingface.co/spaces/{space_id}?logs=build "
                f"(container log: ?logs=container).",
                exit_code=4,
            )
        if this_revision and stage in ("PAUSED", "STOPPED"):
            raise DeployError(
                f"The Space is {stage}; restart it from https://huggingface.co/spaces/{space_id}/settings.",
                exit_code=4,
            )
        if stage == "SLEEPING" and check_health:
            _check_health(url, timeout=5.0)  # any request wakes a sleeping Space
        hardware_ready = expected_hardware is None or current_hw in (None, expected_hardware)
        if this_revision and stage == "RUNNING" and hardware_ready:
            if not check_health:
                return {}
            health = _check_health(url)
            if health is not None:
                return health
        if clock() >= deadline:
            raise DeployError(
                f"Timed out after {int(timeout_s)} s waiting for the Space (last stage: {line}). "
                f"It may still be building: https://huggingface.co/spaces/{space_id}?logs=build",
                exit_code=4,
            )
        sleep(poll_s)


PRIVATE_WARNING = (
    "Private Spaces answer only requests that carry a Hugging Face token, which the iOS app does "
    "not send. Keep the Space public and protect it with the STEM_MASTER_API_KEY secret instead."
)


def _authenticate(api: Any, http_error: type) -> str:
    """Fail early, with a clear message, when there is no usable token."""
    try:
        who = api.whoami()
    except http_error as exc:
        raise DeployError(explain_auth_failure(exc, "identify the token")) from exc
    except OSError as exc:  # LocalTokenNotFoundError: no HF_TOKEN and no cached login
        raise DeployError(
            f"No Hugging Face token found ({exc}). Set HF_TOKEN to a write token from {TOKENS_URL}.",
            exit_code=1,
        ) from exc
    role = ((who.get("auth") or {}).get("accessToken") or {}).get("role")
    if role == "read":
        raise DeployError(
            f"HF_TOKEN is a read-only token; deploying needs a token with the 'Write' role ({TOKENS_URL}).",
            exit_code=1,
        )
    return str(who.get("name") or "?")


def _ensure_space(api: Any, http_error: type, space_id: str, private: bool) -> bool:
    """Create the Space if needed. Returns whether it is private."""
    try:
        existed = bool(api.repo_exists(space_id, repo_type="space"))
        api.create_repo(space_id, repo_type="space", space_sdk="docker", private=private, exist_ok=True)
    except http_error as exc:
        if _http_status(exc) in (401, 403):
            raise DeployError(explain_auth_failure(exc, f"create {space_id}")) from exc
        raise DeployError(f"Could not create Space {space_id}: {_server_message(exc)}") from exc
    print(f"{'Using existing' if existed else 'Created'} Space https://huggingface.co/spaces/{space_id}")
    if not existed:
        is_private = private
    else:
        try:
            is_private = bool(getattr(api.space_info(space_id), "private", False))
        except http_error:
            is_private = private
        if is_private != private:
            warning(
                f"{space_id} already exists and is {'private' if is_private else 'public'}; its visibility "
                f"was left unchanged (change it in the Space settings if you mean to)."
            )
    if is_private:
        warning(PRIVATE_WARNING)
    return is_private


def _upload(api: Any, http_error: type, space_id: str, staging: Path) -> Optional[str]:
    """Upload the staged tree as one commit; return the commit sha."""
    source_sha = os.environ.get("GITHUB_SHA", "")
    message = "Deploy Stem Master server" + (f" from {source_sha[:12]}" if source_sha else "")
    try:
        commit = api.upload_folder(
            repo_id=space_id,
            repo_type="space",
            folder_path=str(staging),
            commit_message=message,
            # Mirror the source: remote files that are not uploaded now are
            # deleted in the same commit (huggingface_hub keeps .gitattributes).
            delete_patterns=["*"],
        )
    except http_error as exc:
        if _http_status(exc) in (401, 403):
            raise DeployError(explain_auth_failure(exc, f"upload to {space_id}")) from exc
        raise DeployError(f"Upload to {space_id} failed: {_server_message(exc)}") from exc
    commit_sha = getattr(commit, "oid", None)
    print(f"Uploaded: {getattr(commit, 'commit_url', None) or commit_sha or 'no changes'}")
    return commit_sha


def _set_api_key(api: Any, http_error: type, space_id: str, api_key: str) -> None:
    if not api_key:
        print(f"{API_KEY_ENV} is not set: no Space secret written (an existing one is left as is).")
        return
    try:
        api.add_space_secret(
            space_id,
            API_KEY_ENV,
            api_key,
            description="Bearer key clients must send (Stem Master SPEC section 4)",
        )
    except http_error as exc:
        raise DeployError(f"Could not set the {API_KEY_ENV} secret: {_server_message(exc)}") from exc
    print(f"Set Space secret {API_KEY_ENV}; enter the same key in the app under Settings > API key.")


def _configure_hardware(
    api: Any, http_error: type, space_id: str, hardware: str, sleep_time: Optional[int]
) -> bool:
    """Request ``hardware`` and the sleep time. Returns False if Hugging Face refused the hardware."""
    effective_sleep = None if hardware in FREE_HARDWARE else sleep_time
    if sleep_time is not None and effective_sleep is None:
        print("cpu-basic has no configurable sleep time (free Spaces sleep after about 48 h idle); skipped.")
    try:
        _current, requested = _runtime_hardware(api.get_space_runtime(space_id))
    except http_error:
        requested = None
    if requested != hardware:
        try:
            api.request_space_hardware(space_id, hardware, sleep_time=effective_sleep)
        except http_error as exc:
            error(explain_hardware_refusal(hardware, exc))
            return False
        suffix = f", sleep after {effective_sleep} s idle" if effective_sleep and effective_sleep > 0 else ""
        print(f"Requested hardware {hardware}{suffix}.")
        return True
    print(f"Hardware is already {hardware}.")
    if effective_sleep is not None:
        try:
            api.set_space_sleep_time(space_id, sleep_time=effective_sleep)
            print(f"Sleep time set to {effective_sleep} s." if effective_sleep > 0 else "Sleep disabled.")
        except http_error as exc:
            warning(f"Could not set the sleep time to {effective_sleep} s: {_server_message(exc)}")
    return True


def deploy(args: argparse.Namespace) -> int:
    """Run the deploy described by the parsed CLI ``args``; return the exit code."""
    space_id = validate_space_id(args.space_id)
    sleep_time = parse_sleep_time(args.sleep_time)
    server_dir = Path(args.server_dir).resolve()
    url = space_url(space_id)
    api_key = (os.environ.get(API_KEY_ENV) or "").strip()

    with tempfile.TemporaryDirectory(prefix="stem-master-space-") as tmp:
        staging = Path(tmp)
        files = stage_space(server_dir, staging)
        print(f"Staged {len(files)} files from {server_dir}:")
        for name in files:
            print(f"  {name}")
        if args.dry_run:
            print(f"Dry run: nothing sent. Target https://huggingface.co/spaces/{space_id} on {args.hardware}.")
            print(f"Space URL: {url}")
            return 0

        hub, http_error = _import_hub()
        api = hub.HfApi()
        print(f"Authenticated as {_authenticate(api, http_error)}")
        is_private = _ensure_space(api, http_error, space_id, args.private)
        commit_sha = _upload(api, http_error, space_id, staging)

    _set_api_key(api, http_error, space_id, api_key)
    hardware_ok = _configure_hardware(api, http_error, space_id, args.hardware, sleep_time)

    try:
        live_url = _runtime_url(api.get_space_runtime(space_id)) or url
    except http_error:
        live_url = url
    if live_url != url:
        print(f"Note: Hugging Face reports the app domain as {live_url} (expected {url}).")
    print(f"Space page: https://huggingface.co/spaces/{space_id}")
    print(f"Server URL for the app (Settings > Server URL): {live_url}")
    step_summary(
        [
            "### Stem Master Space",
            f"- Space: https://huggingface.co/spaces/{space_id}",
            f"- Server URL for the app: `{live_url}`",
            f"- Hardware: `{args.hardware}`" + ("" if hardware_ok else " **refused** (see the error annotation)"),
            f"- `{API_KEY_ENV}` secret: {'set' if api_key else 'not changed'}",
        ]
    )
    if not hardware_ok:
        return 3

    if args.wait > 0:
        print(f"Waiting up to {args.wait} s for the build and start-up ...", flush=True)
        health = wait_until_running(
            api,
            space_id,
            commit_sha,
            live_url,
            float(args.wait),
            expected_hardware=args.hardware,
            check_health=not is_private,
        )
        if health:
            print(f"Healthy: {json.dumps(health)}")
            step_summary([f"- Health: `{json.dumps(health)}`"])
            if health.get("device") == "cpu" and args.hardware not in ("cpu-basic", "cpu-upgrade"):
                warning(
                    f"The server reports device 'cpu' on {args.hardware}, so PyTorch is not using the GPU. "
                    "See stem-master/DEPLOY.md, 'GPU not used'."
                )
        else:
            print("Space is running (private Space: /v1/health not checked).")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create or update the Stem Master server Space on Hugging Face (Docker SDK).",
        epilog=(
            "Environment: HF_TOKEN (write token; or a cached `hf auth login`), "
            f"{API_KEY_ENV} (optional; stored as a Space secret when set)."
        ),
    )
    parser.add_argument("--space-id", default=DEFAULT_SPACE_ID, help=f"owner/name (default: {DEFAULT_SPACE_ID})")
    parser.add_argument(
        "--hardware",
        choices=HARDWARE_CHOICES,
        default="t4-small",
        help="hardware tier to request (default: t4-small; all but cpu-basic need a payment method)",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="create the Space as private (the app cannot reach private Spaces; prefer an API key)",
    )
    parser.add_argument(
        "--sleep-time",
        default="3600",
        metavar="SECONDS",
        help="idle seconds before a paid Space sleeps; -1 = never; empty = leave unchanged (default: 3600)",
    )
    parser.add_argument(
        "--server-dir",
        default=str(SERVER_DIR),
        help="the stem-master/server directory to deploy (default: this script's parent)",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=0,
        metavar="SECONDS",
        help="wait up to this long for the new build to run and answer /v1/health (default: 0 = do not wait)",
    )
    parser.add_argument("--dry-run", action="store_true", help="stage and list the files; do not contact Hugging Face")
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    try:
        return deploy(args)
    except DeployError as exc:
        error(str(exc))
        return exc.exit_code


if __name__ == "__main__":
    sys.exit(main())
