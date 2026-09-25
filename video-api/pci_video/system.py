"""Host detection: Apple Silicon first, never assume CUDA."""

from __future__ import annotations

import functools
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass


def _sysctl(key: str) -> str | None:
    try:
        out = subprocess.run(["sysctl", "-n", key], capture_output=True, text=True, timeout=2)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None if out.returncode == 0 else None


def _memory_gb() -> float | None:
    if sys.platform == "darwin":
        raw = _sysctl("hw.memsize")
        return round(int(raw) / 1024**3, 1) if raw and raw.isdigit() else None
    try:
        pages, page_size = os.sysconf("SC_PHYS_PAGES"), os.sysconf("SC_PAGE_SIZE")
        return round(pages * page_size / 1024**3, 1)
    except (ValueError, OSError, AttributeError):
        return None


@dataclass(frozen=True)
class HostInfo:
    os: str
    arch: str
    apple_silicon: bool
    rosetta: bool
    chip: str | None
    memory_gb: float | None
    accelerator: str  # "mps", "cuda" or "cpu"
    profile: str  # "light", "standard" or "heavy"; drives default quality/model
    max_duration: float
    ffmpeg: bool
    notes: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


@functools.lru_cache(maxsize=1)
def detect() -> HostInfo:
    is_mac = sys.platform == "darwin"
    arch = platform.machine()
    # An x86_64 Python under Rosetta reports x86_64 on an M-series Mac and
    # cannot use Metal; worth shouting about.
    rosetta = is_mac and _sysctl("sysctl.proc_translated") == "1"
    apple_silicon = is_mac and (arch == "arm64" or rosetta)
    chip = _sysctl("machdep.cpu.brand_string") if is_mac else None
    memory = _memory_gb()
    notes: list[str] = []

    if apple_silicon:
        accelerator = "mps"
    elif shutil.which("nvidia-smi"):
        accelerator = "cuda"
    else:
        accelerator = "cpu"

    if rosetta:
        notes.append("Python is running under Rosetta (x86_64). Install an arm64 Python so ComfyUI can use Metal (MPS).")
    if is_mac and not apple_silicon:
        notes.append("Intel Mac detected: no Metal acceleration for PyTorch video models; expect CPU-only speeds.")
    if accelerator == "cpu":
        notes.append("No GPU acceleration detected; generation will be very slow.")

    # Unified memory is shared by the OS, ComfyUI and the model. These cut-offs
    # keep the first run inside what a Mac actually has.
    if memory is None or memory < 20:
        profile, max_duration = "light", 6.0
    elif memory < 40:
        profile, max_duration = "standard", 10.0
    else:
        profile, max_duration = "heavy", 10.0
    if memory is not None and memory < 16:
        notes.append(f"{memory:g} GB of memory is tight for LTX-Video; keep to draft quality and short clips.")

    return HostInfo(
        os=f"{platform.system()} {platform.mac_ver()[0] if is_mac else platform.release()}".strip(),
        arch=arch,
        apple_silicon=apple_silicon,
        rosetta=rosetta,
        chip=chip,
        memory_gb=memory,
        accelerator=accelerator,
        profile=profile,
        max_duration=max_duration,
        ffmpeg=shutil.which("ffmpeg") is not None,
        notes=notes,
    )
