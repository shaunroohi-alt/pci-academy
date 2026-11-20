"""Server configuration, read from environment variables (SPEC section 5).

Settings are immutable. Nothing in this module touches the filesystem except
the cheap writability check used to pick the default data directory;
directories are created lazily by the components that use them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

DEFAULT_PORT = 7860
DEFAULT_MAX_UPLOAD_MB = 200
DEFAULT_MAX_DURATION_S = 900
DEFAULT_JOB_TTL_HOURS = 24.0
DEFAULT_WORKERS = 1
DEFAULT_ENGINE = "audio-separator"
DEFAULT_OVERLAP_MAX = 4
DEFAULT_OVERLAP_FAST = 2
DEFAULT_MODEL_CACHE_SIZE: Optional[int] = None
"""``None`` = auto: sized from free VRAM / RAM by the engine (:func:`stem_master.device.auto_model_cache_size`)."""

ENGINES = ("audio-separator", "fake")

_PREFERRED_DATA_DIR = Path("/data")
_FALLBACK_DATA_DIR = Path("/tmp/stem-master")


class ConfigError(ValueError):
    """An environment variable holds a value the server cannot use."""


@dataclass(frozen=True)
class Settings:
    """All runtime configuration for the server.

    Attributes mirror the env vars in SPEC section 5:

    ========================  ===============================  ==================
    attribute                 env var                          default
    ========================  ===============================  ==================
    api_key                   STEM_MASTER_API_KEY              None (no auth)
    data_dir                  STEM_MASTER_DATA_DIR             /data or /tmp/...
    model_dir                 STEM_MASTER_MODEL_DIR            <data_dir>/models
    max_upload_mb             STEM_MASTER_MAX_UPLOAD_MB        200
    max_duration_seconds      STEM_MASTER_MAX_DURATION_S       900
    job_ttl_hours             STEM_MASTER_JOB_TTL_HOURS        24 (<= 0: keep)
    workers                   STEM_MASTER_WORKERS              1
    engine                    STEM_MASTER_ENGINE               audio-separator
    overlap_max               STEM_MASTER_OVERLAP_MAX          4
    overlap_fast              STEM_MASTER_OVERLAP_FAST         2
    model_cache_size          STEM_MASTER_MODEL_CACHE          auto (None)
    host                      STEM_MASTER_HOST                 0.0.0.0
    port                      PORT                             7860
    ========================  ===============================  ==================
    """

    api_key: Optional[str] = None
    data_dir: Path = _FALLBACK_DATA_DIR
    model_dir: Path = _FALLBACK_DATA_DIR / "models"
    max_upload_mb: int = DEFAULT_MAX_UPLOAD_MB
    max_duration_seconds: int = DEFAULT_MAX_DURATION_S
    job_ttl_hours: float = DEFAULT_JOB_TTL_HOURS
    workers: int = DEFAULT_WORKERS
    engine: str = DEFAULT_ENGINE
    overlap_max: int = DEFAULT_OVERLAP_MAX
    overlap_fast: int = DEFAULT_OVERLAP_FAST
    model_cache_size: Optional[int] = DEFAULT_MODEL_CACHE_SIZE
    host: str = "0.0.0.0"
    port: int = DEFAULT_PORT

    # ------------------------------------------------------------------ paths
    @property
    def jobs_dir(self) -> Path:
        """Directory holding one sub-directory per job."""
        return self.data_dir / "jobs"

    @property
    def uploads_dir(self) -> Path:
        """Staging directory for uploads that are still being received."""
        return self.data_dir / "uploads"

    # ---------------------------------------------------------------- derived
    @property
    def auth_required(self) -> bool:
        return bool(self.api_key)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def job_ttl_seconds(self) -> Optional[float]:
        """TTL for finished jobs in seconds, or ``None`` when expiry is disabled."""
        if self.job_ttl_hours <= 0:
            return None
        return self.job_ttl_hours * 3600.0

    def overlap_for(self, quality: str) -> int:
        """RoFormer overlap to use for a ``JobOptions.quality`` value."""
        return self.overlap_fast if quality == "fast" else self.overlap_max


# ---------------------------------------------------------------------------
# env parsing helpers
# ---------------------------------------------------------------------------


def _get(env: Mapping[str, str], name: str) -> Optional[str]:
    raw = env.get(name)
    if raw is None:
        return None
    raw = raw.strip()
    return raw or None


def _int(env: Mapping[str, str], name: str, default: int, minimum: int) -> int:
    raw = _get(env, name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from None
    if value < minimum:
        raise ConfigError(f"{name} must be >= {minimum}, got {value}")
    return value


def _float(env: Mapping[str, str], name: str, default: float) -> float:
    raw = _get(env, name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None
    if value != value or value in (float("inf"), float("-inf")):
        raise ConfigError(f"{name} must be a finite number, got {raw!r}")
    return value


def _is_writable_dir(path: Path) -> bool:
    try:
        return path.is_dir() and os.access(path, os.W_OK | os.X_OK)
    except OSError:
        return False


def default_data_dir() -> Path:
    """``/data`` when it exists and is writable (HF Spaces persistent storage,
    Docker volume), otherwise ``/tmp/stem-master``."""
    if _is_writable_dir(_PREFERRED_DATA_DIR):
        return _PREFERRED_DATA_DIR
    return _FALLBACK_DATA_DIR


def load_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    """Build :class:`Settings` from ``env`` (defaults to ``os.environ``).

    Raises :class:`ConfigError` (a ``ValueError``) for malformed values so a
    misconfigured deployment fails loudly at start-up instead of misbehaving.
    """
    if env is None:
        env = os.environ

    raw_data = _get(env, "STEM_MASTER_DATA_DIR")
    data_dir = Path(raw_data).expanduser() if raw_data else default_data_dir()
    raw_models = _get(env, "STEM_MASTER_MODEL_DIR")
    model_dir = Path(raw_models).expanduser() if raw_models else data_dir / "models"

    engine = (_get(env, "STEM_MASTER_ENGINE") or DEFAULT_ENGINE).lower()
    if engine not in ENGINES:
        raise ConfigError(
            f"STEM_MASTER_ENGINE must be one of {', '.join(ENGINES)}, got {engine!r}"
        )

    port = _int(env, "PORT", DEFAULT_PORT, 1)
    if port > 65535:
        raise ConfigError(f"PORT must be <= 65535, got {port}")

    return Settings(
        api_key=_get(env, "STEM_MASTER_API_KEY"),
        data_dir=data_dir,
        model_dir=model_dir,
        max_upload_mb=_int(env, "STEM_MASTER_MAX_UPLOAD_MB", DEFAULT_MAX_UPLOAD_MB, 1),
        max_duration_seconds=_int(
            env, "STEM_MASTER_MAX_DURATION_S", DEFAULT_MAX_DURATION_S, 1
        ),
        job_ttl_hours=_float(env, "STEM_MASTER_JOB_TTL_HOURS", DEFAULT_JOB_TTL_HOURS),
        workers=_int(env, "STEM_MASTER_WORKERS", DEFAULT_WORKERS, 1),
        engine=engine,
        overlap_max=_int(env, "STEM_MASTER_OVERLAP_MAX", DEFAULT_OVERLAP_MAX, 1),
        overlap_fast=_int(env, "STEM_MASTER_OVERLAP_FAST", DEFAULT_OVERLAP_FAST, 1),
        model_cache_size=(
            None if (_get(env, "STEM_MASTER_MODEL_CACHE") or "auto").lower() == "auto"
            else _int(env, "STEM_MASTER_MODEL_CACHE", 0, 0)
        ),
        host=_get(env, "STEM_MASTER_HOST") or "0.0.0.0",
        port=port,
    )
