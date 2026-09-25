"""ComfyUI HTTP client: /prompt, /queue, /history, /view, /object_info."""

from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path

import httpx

from ..config import DEFAULT_COMFYUI_CANDIDATES
from ..engines.base import ModelFile, ModelInventory, RenderPlan
from .base import Backend, BackendError, RemoteStatus

VIDEO_EXTS = (".mp4", ".webm", ".mkv", ".mov", ".gif", ".webp")
OBJECT_INFO_TTL = 30.0


def _combo_options(spec) -> list[str]:
    """Pull the option list out of an object_info input spec (V1 or V3 nodes)."""
    if not isinstance(spec, (list, tuple)) or not spec:
        return []
    if isinstance(spec[0], list):
        return [str(x) for x in spec[0]]
    if spec[0] == "COMBO" and len(spec) > 1 and isinstance(spec[1], dict):
        return [str(x) for x in spec[1].get("options", [])]
    return []


class ComfyUIBackend(Backend):
    name = "comfyui"

    def __init__(self, url: str | None):
        self._configured_url = url
        self._url: str | None = url
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=3.0))
        self._client_id = uuid.uuid4().hex
        self._object_info: dict | None = None
        self._object_info_at = 0.0
        self._lock = asyncio.Lock()

    # -- connection ---------------------------------------------------------
    async def _base(self) -> str:
        if self._url:
            return self._url
        candidates = [self._configured_url] if self._configured_url else list(DEFAULT_COMFYUI_CANDIDATES)
        for url in candidates:
            try:
                r = await self._client.get(f"{url}/system_stats", timeout=2.0)
                if r.status_code == 200:
                    self._url = url
                    return url
            except httpx.HTTPError:
                continue
        raise BackendError(f"ComfyUI is not reachable at {', '.join(candidates)}. "
                           "Start it (scripts/start_comfyui.sh) or set PCI_COMFYUI_URL.")

    async def _request(self, method: str, path: str, **kw) -> httpx.Response:
        base = await self._base()
        try:
            return await self._client.request(method, f"{base}{path}", **kw)
        except httpx.HTTPError as exc:
            if not self._configured_url:
                self._url = None  # re-probe next time; ComfyUI may have moved ports
            raise BackendError(f"ComfyUI request failed ({method} {path}): {exc}") from exc

    async def health(self) -> dict:
        try:
            r = await self._request("GET", "/system_stats", timeout=3.0)
            r.raise_for_status()
            stats = r.json()
        except (BackendError, httpx.HTTPError, ValueError) as exc:
            return {"type": self.name, "reachable": False, "url": self._url or self._configured_url,
                    "tried": [self._configured_url] if self._configured_url else list(DEFAULT_COMFYUI_CANDIDATES),
                    "error": str(exc)}
        system = stats.get("system", {})
        devices = [{"name": d.get("name"), "type": d.get("type"),
                    "vram_total_gb": round(d.get("vram_total", 0) / 1024**3, 1)} for d in stats.get("devices", [])]
        return {"type": self.name, "reachable": True, "url": self._url,
                "comfyui_version": system.get("comfyui_version"), "python": system.get("python_version"),
                "pytorch": system.get("pytorch_version"), "devices": devices}

    # -- discovery ----------------------------------------------------------
    async def _info(self) -> dict:
        async with self._lock:
            if self._object_info is None or time.monotonic() - self._object_info_at > OBJECT_INFO_TTL:
                r = await self._request("GET", "/object_info", timeout=60.0)
                r.raise_for_status()
                self._object_info = r.json()
                self._object_info_at = time.monotonic()
            return self._object_info

    async def node_types(self) -> set[str]:
        return set(await self._info())

    async def inventory(self, files: list[ModelFile]) -> ModelInventory:
        info = await self._info()
        inv: ModelInventory = {}
        for f in files:
            node = info.get(f.loader, {}).get("input", {})
            spec = node.get("required", {}).get(f.input) or node.get("optional", {}).get(f.input)
            inv[(f.loader, f.input)] = _combo_options(spec)
        return inv

    # -- jobs ---------------------------------------------------------------
    async def submit(self, workflow: dict, plan: RenderPlan) -> str:
        r = await self._request("POST", "/prompt", json={"prompt": workflow, "client_id": self._client_id})
        if r.status_code != 200:
            try:
                body = r.json()
            except ValueError:
                raise BackendError(f"ComfyUI rejected the workflow ({r.status_code}): {r.text[:500]}")
            err = body.get("error", {})
            details = []
            for node_id, node_err in (body.get("node_errors") or {}).items():
                for e in node_err.get("errors", []):
                    details.append(f"{node_id} ({node_err.get('class_type')}): {e.get('message')} {e.get('details', '')}".strip())
            raise BackendError(f"ComfyUI rejected the workflow: {err.get('message', r.text[:200])}"
                               + (f" — {'; '.join(details)}" if details else ""))
        return r.json()["prompt_id"]

    async def status(self, remote_id: str) -> RemoteStatus:
        r = await self._request("GET", f"/history/{remote_id}")
        r.raise_for_status()
        entry = r.json().get(remote_id)
        if entry:
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                return RemoteStatus("failed", error=self._error_message(st))
            if st.get("completed", True):
                return RemoteStatus("completed", outputs=self._video_outputs(entry.get("outputs", {})))
        q = await self._request("GET", "/queue")
        q.raise_for_status()
        queue = q.json()
        if any(item[1] == remote_id for item in queue.get("queue_running", [])):
            return RemoteStatus("running")
        pending = sorted(queue.get("queue_pending", []), key=lambda item: item[0])
        for pos, item in enumerate(pending, start=1):
            if item[1] == remote_id:
                return RemoteStatus("queued", queue_position=pos)
        return RemoteStatus("unknown")

    @staticmethod
    def _error_message(status: dict) -> str:
        for kind, data in status.get("messages", []):
            if kind == "execution_error":
                return f"{data.get('node_type')}: {data.get('exception_message', '').strip()}"
            if kind == "execution_interrupted":
                return "Interrupted in ComfyUI"
        return "ComfyUI reported an error"

    @staticmethod
    def _video_outputs(outputs: dict) -> list[dict]:
        found = []
        for node_out in outputs.values():
            for key in ("videos", "gifs", "images"):
                for item in node_out.get(key, []) or []:
                    if isinstance(item, dict) and str(item.get("filename", "")).lower().endswith(VIDEO_EXTS) \
                            and item.get("type", "output") == "output":
                        found.append(item)
        # Prefer mp4 when a graph saves more than one format.
        found.sort(key=lambda o: not o["filename"].lower().endswith(".mp4"))
        return found

    async def fetch(self, remote_id: str, output: dict, dest: Path) -> None:
        base = await self._base()
        params = {"filename": output["filename"], "subfolder": output.get("subfolder", ""),
                  "type": output.get("type", "output")}
        tmp = dest.with_suffix(dest.suffix + ".part")
        try:
            async with self._client.stream("GET", f"{base}/view", params=params, timeout=300.0) as r:
                r.raise_for_status()
                with tmp.open("wb") as fh:
                    async for chunk in r.aiter_bytes(1 << 20):
                        fh.write(chunk)
        except httpx.HTTPError as exc:
            tmp.unlink(missing_ok=True)
            raise BackendError(f"Could not download {output['filename']} from ComfyUI: {exc}") from exc
        tmp.replace(dest)

    async def cancel(self, remote_id: str) -> None:
        st = await self.status(remote_id)
        if st.state == "queued":
            await self._request("POST", "/queue", json={"delete": [remote_id]})
        elif st.state == "running":
            await self._request("POST", "/interrupt", json={"prompt_id": remote_id})

    async def close(self) -> None:
        await self._client.aclose()
