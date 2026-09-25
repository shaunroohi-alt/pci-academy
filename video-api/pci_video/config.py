"""Settings, read once from environment variables (all prefixed ``PCI_``).

Kept to the stdlib on purpose: one less dependency, and every knob is
visible in ``.env.example``.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ComfyUI's default port is 8188; the ComfyUI Desktop app for macOS uses 8000.
DEFAULT_COMFYUI_CANDIDATES = ("http://127.0.0.1:8188", "http://127.0.0.1:8000")


def _default_output_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Movies" / "PCI-Academy"
    return PROJECT_ROOT / "outputs"


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(f"PCI_{name}")
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8787
    backend: str = "comfyui"  # "comfyui" or "mock"
    comfyui_url: str | None = None  # None = probe DEFAULT_COMFYUI_CANDIDATES
    output_dir: Path = field(default_factory=_default_output_dir)
    workflow_dir: Path = PROJECT_ROOT / "workflows"
    poll_interval: float = 2.0
    job_timeout: float = 3 * 60 * 60  # MPS is slow; three hours before we give up
    # Optional explicit model filenames, bypassing auto-detection.
    ltx_checkpoint: str | None = None
    ltx_text_encoder: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=_env("HOST", "127.0.0.1"),
            port=int(_env("PORT", "8787")),
            backend=_env("BACKEND", "comfyui").lower(),
            comfyui_url=(_env("COMFYUI_URL") or "").rstrip("/") or None,
            output_dir=Path(_env("OUTPUT_DIR", str(_default_output_dir()))).expanduser(),
            workflow_dir=Path(_env("WORKFLOW_DIR", str(PROJECT_ROOT / "workflows"))).expanduser(),
            poll_interval=float(_env("POLL_INTERVAL", "2.0")),
            job_timeout=float(_env("JOB_TIMEOUT", str(3 * 60 * 60))),
            ltx_checkpoint=_env("LTX_CHECKPOINT"),
            ltx_text_encoder=_env("LTX_TEXT_ENCODER"),
        )
