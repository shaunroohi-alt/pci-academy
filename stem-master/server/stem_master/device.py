"""Compute-device detection (``cuda`` | ``mps`` | ``cpu``) and the memory
budget that sizes the engine's model cache.

``torch`` is optional here: a server without it (or with a broken CUDA
install) reports ``cpu`` instead of crashing.
"""

from __future__ import annotations

import functools
import logging
from pathlib import Path
from typing import Dict, Optional, Union

logger = logging.getLogger(__name__)

MODEL_RESIDENT_BYTES = 1 << 30
"""Memory one loaded separation model is budgeted at (1 GiB). Measured on
CPU: the 7 models of the max chain with every option (0.2-0.9 GB
checkpoints) add 5.2 GB of resident memory together, 0.75 GB each on average."""

CUDA_INFERENCE_RESERVE_BYTES = 4 << 30
"""VRAM kept free for the activations of one inference. Not measured on a
GPU; chosen on the safe side. (audio-separator keeps the full-track buffers in
host RAM on CUDA, so this does not grow with the track length.)"""

PIPELINE_BYTES_PER_AUDIO_SECOND = 9_000_000
"""Host RAM the pipeline holds at its peak per second of audio: 8.8 MB
measured (every option, fake engine, peak RSS of a 180 s vs a 60 s input)."""

BASE_RESERVE_BYTES = 1 << 30
"""Host RAM for the interpreter, torch and the libraries."""

MAX_AUTO_MODEL_CACHE = 16


def auto_model_cache_size(device: str, available_bytes: Optional[int], max_duration_seconds: float) -> int:
    """How many loaded models the engine keeps when ``STEM_MASTER_MODEL_CACHE``
    is unset: what fits in ``available_bytes`` (free VRAM on ``cuda``, free RAM
    otherwise) after the reserve, at :data:`MODEL_RESIDENT_BYTES` each, between
    1 and :data:`MAX_AUTO_MODEL_CACHE`. On CPU / MPS the models share RAM with
    the pipeline, so the reserve covers the longest track the server accepts."""
    if available_bytes is None:
        return 1
    if device == "cuda":
        reserve = CUDA_INFERENCE_RESERVE_BYTES
    else:
        reserve = BASE_RESERVE_BYTES + PIPELINE_BYTES_PER_AUDIO_SECOND * max(0.0, float(max_duration_seconds))
    fit = int((available_bytes - reserve) // MODEL_RESIDENT_BYTES)
    return max(1, min(MAX_AUTO_MODEL_CACHE, fit))


_CGROUP_UNLIMITED = 1 << 60


def _read_int(path: Path) -> Optional[int]:
    try:
        text = path.read_text().strip()
    except OSError:
        return None
    try:
        return int(text)
    except ValueError:
        return None  # "max" (cgroup v2: no limit)


def _stat_value(path: Path, key: str) -> int:
    try:
        for line in path.read_text().splitlines():
            name, _, value = line.partition(" ")
            if name == key:
                return int(value)
    except (OSError, ValueError):
        pass
    return 0


def available_ram_bytes(meminfo: Union[str, Path] = "/proc/meminfo",
                        cgroup_root: Union[str, Path] = "/sys/fs/cgroup") -> Optional[int]:
    """Free RAM: the smaller of the host's ``MemAvailable`` and what the
    container's cgroup (v2 or v1) limit still allows (reclaimable page cache
    counted as free). ``None`` when neither can be read (e.g. macOS)."""
    candidates = []
    try:
        for line in Path(meminfo).read_text().splitlines():
            if line.startswith("MemAvailable:"):
                candidates.append(int(line.split()[1]) * 1024)
                break
    except (OSError, ValueError, IndexError):
        pass
    root = Path(cgroup_root)
    layouts: Dict[str, tuple] = {
        "v2": (root / "memory.max", root / "memory.current", root / "memory.stat", "inactive_file"),
        "v1": (root / "memory" / "memory.limit_in_bytes", root / "memory" / "memory.usage_in_bytes",
               root / "memory" / "memory.stat", "total_inactive_file"),
    }
    for limit_path, usage_path, stat_path, cache_key in layouts.values():
        limit = _read_int(limit_path)
        usage = _read_int(usage_path)
        if limit is None or usage is None or limit >= _CGROUP_UNLIMITED:
            continue
        candidates.append(max(0, limit - max(0, usage - _stat_value(stat_path, cache_key))))
        break
    return min(candidates) if candidates else None


def available_memory_bytes(device: str) -> Optional[int]:
    """Free VRAM of the current CUDA device, or free RAM for ``cpu`` / ``mps``
    (MPS shares the system RAM). ``None`` if it cannot be measured."""
    if device == "cuda":
        try:
            import torch  # noqa: PLC0415

            free, _total = torch.cuda.mem_get_info()
            return int(free)
        except Exception as exc:  # noqa: BLE001 - fall back to the safe minimum
            logger.warning("Could not read free CUDA memory: %s", exc)
            return None
    return available_ram_bytes()


@functools.lru_cache(maxsize=1)
def detect_device() -> str:
    """Return the best available torch device type. Cached after the first call
    (importing torch takes a second or two)."""
    try:
        import torch  # noqa: PLC0415 - optional, heavy import
    except Exception as exc:  # ImportError, or a broken native install
        logger.info("torch not importable (%s); reporting device=cpu", exc)
        return "cpu"

    try:
        if torch.cuda.is_available():
            return "cuda"
    except Exception as exc:
        logger.warning("CUDA probe failed: %s", exc)

    try:
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception as exc:
        logger.warning("MPS probe failed: %s", exc)

    return "cpu"
