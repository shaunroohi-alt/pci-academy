"""Compute-device detection (``cuda`` | ``mps`` | ``cpu``).

``torch`` is optional here: a server without it (or with a broken CUDA
install) reports ``cpu`` instead of crashing.
"""

from __future__ import annotations

import functools
import logging

logger = logging.getLogger(__name__)


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
