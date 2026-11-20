"""Memory-bounded zero-phase IIR filtering.

:func:`zero_phase_sos` computes exactly what :func:`scipy.signal.sosfiltfilt`
computes with its defaults (odd extension, ``3 * ntaps`` padding, steady-state
initial conditions) but streams the forward and backward passes through
fixed-size chunks, so a 15-minute channel needs one float32 intermediate
buffer instead of several float64 copies of the whole signal.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
from scipy import signal

_CHUNK = 1 << 18


def butter_highpass(cutoff_hz: float, sr: int, order: int = 2) -> np.ndarray:
    """Butterworth high-pass as second-order sections (float64)."""
    nyq = 0.5 * float(sr)
    if not 0.0 < cutoff_hz < nyq:
        raise ValueError(f"cutoff {cutoff_hz} Hz outside (0, {nyq}) Hz")
    return signal.butter(order, cutoff_hz, btype="highpass", fs=float(sr), output="sos")


def _default_padlen(sos: np.ndarray) -> int:
    # identical to scipy.signal.sosfiltfilt's default
    n_sections = sos.shape[0]
    ntaps = 2 * n_sections + 1
    ntaps -= min(int((sos[:, 2] == 0).sum()), int((sos[:, 5] == 0).sum()))
    return 3 * ntaps


def zero_phase_sos(sos: np.ndarray, x: np.ndarray, out: Optional[np.ndarray] = None,
                   chunk: int = _CHUNK) -> np.ndarray:
    """Zero-phase (forward-backward) SOS filtering of a 1-D signal.

    ``out`` may be ``x`` itself (in-place). Returns float32.
    """
    x = np.asarray(x)
    if x.ndim != 1:
        raise ValueError("zero_phase_sos expects a 1-D signal")
    n = x.shape[0]
    if out is None:
        out = np.empty(n, dtype=np.float32)
    if n == 0:
        return out
    sos = np.asarray(sos, dtype=np.float64)
    edge = min(_default_padlen(sos), n - 1)
    x0 = float(x[0])
    x1 = float(x[-1])
    if edge > 0:
        left = 2.0 * x0 - x[edge:0:-1].astype(np.float64)
        right = 2.0 * x1 - x[-2:-(edge + 2):-1].astype(np.float64)
    else:
        left = right = np.zeros(0, dtype=np.float64)
    total = n + 2 * edge
    zi0 = signal.sosfilt_zi(sos)

    # forward pass over [left | x | right]
    fwd = np.empty(total, dtype=np.float32)
    zi = zi0 * (float(left[0]) if edge > 0 else x0)
    pos = 0

    def _run(segment: np.ndarray) -> None:
        nonlocal zi, pos
        if segment.size == 0:
            return
        y, zi = signal.sosfilt(sos, segment.astype(np.float64, copy=False), zi=zi)
        fwd[pos:pos + y.size] = y
        pos += y.size

    _run(left)
    for start in range(0, n, chunk):
        _run(x[start:start + chunk])
    _run(right)

    # backward pass, written straight into the output (trimming the padding)
    zi = zi0 * float(fwd[-1])
    for end in range(total, 0, -chunk):
        start = max(0, end - chunk)
        y, zi = signal.sosfilt(sos, fwd[start:end][::-1].astype(np.float64), zi=zi)
        y = y[::-1]  # back in forward order: positions start .. end-1
        lo, hi = max(start, edge), min(end, edge + n)
        if hi > lo:
            out[lo - edge:hi - edge] = y[lo - start:hi - start]
    return out
