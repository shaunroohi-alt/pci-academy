"""Stem cleanup (SPEC 2.1): bleed masking, activity gating, range filters.

Every function returns the cleaned audio *and* what it removed, computed in
the time domain as ``input - output``, so ``output + removed == input``
exactly (to float32 rounding). :func:`cleanup_stems` chains the three steps
and accumulates everything that was taken out into one ``removed_total``
array — the ``removed_bleed`` stem of the job.

Arrays are float32 ``(channels, samples)``; ``strength`` is one of
``"light"``, ``"standard"``, ``"strong"``.

Memory
------
:func:`bleed_mask` works per channel on time blocks of ``block_frames`` STFT
frames (default 256 frames = 5.9 s at 44.1 kHz) with 5 frames of context
(3 for the window overlap + 2 for the 5-frame time smoothing), so its working
set does not grow with duration: per stem it holds one complex64 STFT block
(263 x 2049 bins, 4.3 MB) plus float32 power/gain temporaries and the
synthesised block, ~12 MB per stem — measured with ``tracemalloc`` at
197 MB for 16 stereo stems (identical at 12 s and 24 s of audio). On top of
that come ``removed_total`` (one stem-sized array) and, unless
``inplace=True``, the cleaned outputs themselves (one new array per stem).
For 16 stereo stems of 6 minutes at 44.1 kHz (127 MB each):

* ``inplace=True``  — 127 MB (removed_total) + 0.2 GB working set ≈ 0.33 GB
* ``inplace=False`` — the above + 16 x 127 MB = 2.03 GB of new output arrays

so the pipeline should pass ``inplace=True`` (it never needs the pre-cleanup
stems again) to stay well under 2 GB of extra RAM. The gate and the range
filter add at most a few stem-sized (per channel) temporaries.
:mod:`tests.test_dsp_cleanup` measures the working set with ``tracemalloc``
and checks that it does not grow with duration.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Mapping, Optional, Tuple

import numpy as np
from scipy.ndimage import uniform_filter

from ._filters import butter_highpass, zero_phase_sos
from ._stft import FrameGrid

log = logging.getLogger(__name__)

STRENGTHS = ("light", "standard", "strong")


@dataclass(frozen=True)
class CleanupParams:
    """Per-strength cleanup parameters (SPEC 2.1)."""

    tau: float          # ownership threshold
    beta: float         # attenuation exponent below tau
    gmin_db: float      # bleed-mask gain floor
    gate_own_db: float  # gate opens above (stem peak RMS + this)
    gate_mix_db: float  # ... and above (mix envelope + this)


CLEANUP_PARAMS: Dict[str, CleanupParams] = {
    "light": CleanupParams(0.05, 1.0, -12.0, -65.0, -50.0),
    "standard": CleanupParams(0.10, 1.5, -20.0, -55.0, -42.0),
    "strong": CleanupParams(0.18, 2.0, -30.0, -48.0, -36.0),
}

# Bleed mask STFT (SPEC: n_fft 4096, hop 1024, sqrt-Hann, perfect reconstruction)
MASK_N_FFT = 4096
MASK_HOP = 1024
MASK_SMOOTH_FREQ = 3
MASK_SMOOTH_TIME = 5

# Activity gate timing
GATE_ENV_MS = 10.0
GATE_LOOKAHEAD_MS = 5.0
GATE_HOLD_MS = 120.0
GATE_RELEASE_MS = 80.0
GATE_CLOSED_DB = -80.0

RANGE_FILTER_HZ: Dict[str, float] = {
    # vocals: SPEC lists vocals / lead / backing; the other vocal-group stems
    # (dry vocal, its reverb, vocal remnants) get the same 70 Hz high-pass.
    "vocals": 70.0,
    "lead_vocals": 70.0,
    "backing_vocals": 70.0,
    "vocals_dry": 70.0,
    "vocal_reverb": 70.0,
    "vocal_ambience": 70.0,
    "hihat": 300.0,
    "ride": 250.0,
    "crash": 250.0,
    "snare": 60.0,
    "toms": 40.0,
    "guitar": 30.0,
    "piano": 30.0,
    "other": 30.0,
}
"""Zero-phase 2nd-order Butterworth high-pass per stem id (SPEC 2.1 step 3).
Stems not listed (kick, bass, drum_room, unknown ids) are left untouched."""

_CHUNK = 1 << 18


def _params(strength: str) -> CleanupParams:
    try:
        return CLEANUP_PARAMS[strength]
    except KeyError:
        raise ValueError(f"unknown cleanup strength {strength!r}; expected one of {STRENGTHS}") from None


def _as_2d(x: np.ndarray) -> np.ndarray:
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]
    if arr.ndim != 2:
        raise ValueError(f"expected audio shaped (channels, samples), got {arr.shape}")
    return arr


def _check_inplace(arr: np.ndarray, name: str) -> None:
    if not (isinstance(arr, np.ndarray) and arr.dtype == np.float32 and arr.ndim == 2
            and arr.flags.c_contiguous and arr.flags.writeable):
        raise ValueError(f"inplace=True needs writable C-contiguous float32 (c, n) arrays; {name!r} is not")


# ================================================================ bleed mask
def bleed_mask(stems: Mapping[str, np.ndarray], sr: int, strength: str, *,
               inplace: bool = False, block_frames: int = 256) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """Cross-stem Wiener-style ownership masking (SPEC 2.1 step 1).

    For every STFT bin, stem ``i`` owns ``w_i = |S_i|^2 / sum_j |S_j|^2`` of
    the energy. Where ``w_i < tau`` its bin is attenuated by
    ``(w_i / tau) ** beta`` (floored at ``g_min``); the gain is then averaged
    over a 3 (frequency) x 5 (time) neighbourhood to avoid musical noise and
    applied to stem ``i``'s own spectrum. Energy is never moved between
    stems: what a stem loses goes to ``removed_total``.

    Returns ``(cleaned, removed_total)`` with ``cleaned[k] + removed_k ==
    stems[k]`` and ``removed_total == sum_k removed_k``. All stems must share
    one shape. With ``inplace=True`` the cleaned audio is written into the
    input arrays (which must be writable C-contiguous float32) and the same
    array objects are returned — see the module docstring for memory figures.
    """
    params = _params(strength)
    if not stems:
        raise ValueError("bleed_mask needs at least one stem")
    ids = list(stems.keys())
    arrays: List[np.ndarray] = []
    for sid in ids:
        if inplace:
            _check_inplace(stems[sid], sid)
            arrays.append(stems[sid])
        else:
            arrays.append(_as_2d(stems[sid]))
    shape = arrays[0].shape
    for sid, arr in zip(ids, arrays):
        if arr.shape != shape:
            raise ValueError(f"stem {sid!r} has shape {arr.shape}, expected {shape}")
    n_ch, n = shape
    outputs = arrays if inplace else [np.empty(shape, dtype=np.float32) for _ in arrays]
    removed = np.zeros(shape, dtype=np.float32)
    if n == 0 or len(arrays) == 1:
        # a single stem owns every bin: nothing to do
        if not inplace:
            for src, dst in zip(arrays, outputs):
                dst[...] = src
        return dict(zip(ids, outputs)), removed

    grid = FrameGrid(n, MASK_N_FFT, MASK_HOP)
    tau = np.float32(params.tau)
    beta = float(params.beta)
    g_floor = np.float32(10.0 ** (params.gmin_db / 20.0))
    context = MASK_SMOOTH_TIME // 2
    k = len(arrays)
    for ch in range(n_ch):
        pending: Optional[Tuple[int, int, List[np.ndarray]]] = None
        for blk in grid.blocks(block_frames, context=context):
            spec = np.empty((k, blk.fb - blk.fa, grid.n_bins), dtype=np.complex64)
            for i, arr in enumerate(arrays):
                spec[i] = grid.analyze(arr[ch], blk.fa, blk.fb)
            # analysis of this block is done: the previous block may now be written
            if pending is not None:
                _flush(outputs, ch, pending)
                pending = None
            power = spec.real * spec.real + spec.imag * spec.imag
            total = power.sum(axis=0)
            np.maximum(total, np.float32(1e-30), out=total)
            lo, hi = blk.m0 - blk.fa, blk.m1 - blk.fa
            cleaned_blocks: List[np.ndarray] = []
            for i, arr in enumerate(arrays):
                own = power[i] / total
                gain = np.ones_like(own)
                below = own < tau
                gain[below] = np.maximum(np.power(own[below] / tau, beta), g_floor)
                gain = uniform_filter(gain, size=(MASK_SMOOTH_TIME, MASK_SMOOTH_FREQ), mode="nearest")
                y = grid.synthesize(spec[i, lo:hi] * gain[lo:hi], blk.m0, blk.s0, blk.s1)
                removed[ch, blk.s0:blk.s1] += arr[ch, blk.s0:blk.s1] - y
                cleaned_blocks.append(y)
            pending = (blk.s0, blk.s1, cleaned_blocks)
        if pending is not None:
            _flush(outputs, ch, pending)
    return dict(zip(ids, outputs)), removed


def _flush(outputs: List[np.ndarray], ch: int, pending: Tuple[int, int, List[np.ndarray]]) -> None:
    s0, s1, blocks = pending
    for out, block in zip(outputs, blocks):
        out[ch, s0:s1] = block


# ============================================================ activity gate
def _hop_mean_square(x: np.ndarray, hop: int) -> np.ndarray:
    """Mean square over channels of each ``hop``-sample block (last block partial)."""
    n_ch, n = x.shape
    n_hops = -(-n // hop)
    out = np.zeros(n_hops, dtype=np.float64)
    chunk = hop * 8192
    for start in range(0, n, chunk):
        block = x[:, start:start + chunk]
        sq = np.square(block, dtype=np.float64).sum(axis=0)
        sums = np.add.reduceat(sq, np.arange(0, sq.size, hop))
        out[start // hop:start // hop + sums.size] = sums
    counts = np.full(n_hops, float(hop * n_ch))
    counts[-1] = float((n - hop * (n_hops - 1)) * n_ch)
    return out / counts


def _any_in_window(flags: np.ndarray, before: int, after: int) -> np.ndarray:
    """``out[k] = any(flags[k - before : k + after + 1])`` (clipped at the edges)."""
    n = flags.size
    csum = np.concatenate([[0], np.cumsum(flags.astype(np.int64))])
    k = np.arange(n)
    lo = np.clip(k - before, 0, n)
    hi = np.clip(k + after + 1, 0, n)
    return (csum[hi] - csum[lo]) > 0


def _slew(target: np.ndarray, up_frames: int, down_frames: int) -> np.ndarray:
    """Slew-rate-limited 0/1 target: rises in ``up_frames``, falls in ``down_frames``."""
    n = target.size
    out = np.empty(n, dtype=np.float64)
    if n == 0:
        return out
    change = np.flatnonzero(np.diff(target.astype(np.int8))) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [n]])
    current = 1.0 if target[0] else 0.0
    for s, e in zip(starts, ends):
        steps = np.arange(1, e - s + 1, dtype=np.float64)
        if target[s]:
            seg = np.minimum(1.0, current + steps / max(1, up_frames))
        else:
            seg = np.maximum(0.0, current - steps / max(1, down_frames))
        out[s:e] = seg
        current = float(seg[-1])
    return out


def gate_gain_curve(stem: np.ndarray, mix: np.ndarray, sr: int, strength: str) -> Tuple[np.ndarray, np.ndarray]:
    """Gate gain (dB) on a 1 ms grid: returns ``(centre_sample_positions, gain_db)``.

    10 ms RMS envelope (mean square over channels); the gate is open where
    ``env >= max(peak_env + own_db, mix_env + mix_db)``; openings are
    advanced by the 5 ms look-ahead (the gain ramps up during it), held for
    120 ms after the last open frame, then released over 80 ms down to
    -80 dB. The 0..1 ramp goes through a smoothstep and maps linearly to dB,
    so the gain curve is continuous with a continuous slope (no clicks).
    """
    params = _params(strength)
    stem = _as_2d(stem)
    mix = _as_2d(mix)
    n = stem.shape[1]
    if mix.shape[1] != n:
        log.warning("activity_gate: mix has %d samples, stem %d; aligning", mix.shape[1], n)
        fixed = np.zeros((mix.shape[0], n), dtype=np.float32)
        m = min(n, mix.shape[1])
        fixed[:, :m] = mix[:, :m]
        mix = fixed
    hop = max(1, int(round(sr * 0.001)))
    env_hops = max(1, int(round(GATE_ENV_MS / 1000.0 * sr / hop)))
    look = max(1, int(round(GATE_LOOKAHEAD_MS / 1000.0 * sr / hop)))
    hold = int(round(GATE_HOLD_MS / 1000.0 * sr / hop))
    release = max(1, int(round(GATE_RELEASE_MS / 1000.0 * sr / hop)))
    from scipy.ndimage import uniform_filter1d

    e_stem = uniform_filter1d(_hop_mean_square(stem, hop), size=env_hops, mode="nearest")
    e_mix = uniform_filter1d(_hop_mean_square(mix, hop), size=env_hops, mode="nearest")
    stem_db = 10.0 * np.log10(np.maximum(e_stem, 1e-20))
    mix_db = 10.0 * np.log10(np.maximum(e_mix, 1e-20))
    threshold = np.maximum(stem_db.max() + params.gate_own_db, mix_db + params.gate_mix_db)
    open_raw = (stem_db >= threshold) & (e_stem > 1e-14)
    open_la = _any_in_window(open_raw, before=0, after=look)
    open_held = _any_in_window(open_la, before=hold, after=0)
    ramp = _slew(open_held, look, release)
    smooth = ramp * ramp * (3.0 - 2.0 * ramp)
    gain_db = GATE_CLOSED_DB * (1.0 - smooth)
    centres = (np.arange(gain_db.size, dtype=np.float64) + 0.5) * hop - 0.5
    return centres, gain_db


def _apply_gain_curve(x: np.ndarray, centres: np.ndarray, gain_db: np.ndarray,
                      out: np.ndarray, removed: np.ndarray, accumulate: bool) -> None:
    """``out = x * gain``; ``removed (+)= x - out``. ``out`` may be ``x``."""
    n = x.shape[1]
    for start in range(0, n, _CHUNK):
        stop = min(n, start + _CHUNK)
        pos = np.arange(start, stop, dtype=np.float64)
        g_db = np.interp(pos, centres, gain_db)
        gain = np.power(10.0, g_db / 20.0).astype(np.float32)
        src = x[:, start:stop]
        y = src * gain
        if accumulate:
            removed[:, start:stop] += src - y
        else:
            removed[:, start:stop] = src - y
        out[:, start:stop] = y


def activity_gate(stem: np.ndarray, mix: np.ndarray, sr: int, strength: str) -> Tuple[np.ndarray, np.ndarray]:
    """Close the stem where it is inactive (SPEC 2.1 step 2).

    Thresholds (dB): light own -65 / mix -50, standard -55 / -42, strong
    -48 / -36 — see :func:`gate_gain_curve`. The same gain is applied to
    every channel. Returns ``(gated, removed)`` with ``gated + removed == stem``.
    """
    arr = _as_2d(stem)
    gated = np.empty_like(arr)
    removed = np.empty_like(arr)
    if arr.shape[1] == 0:
        return gated, removed
    centres, gain_db = gate_gain_curve(arr, mix, sr, strength)
    _apply_gain_curve(arr, centres, gain_db, gated, removed, accumulate=False)
    return gated, removed


# ============================================================ range filters
def _range_sos(stem_id: str, sr: int) -> Optional[np.ndarray]:
    cutoff = RANGE_FILTER_HZ.get(stem_id)
    if cutoff is None or cutoff >= 0.45 * sr:
        return None
    return butter_highpass(cutoff, sr, order=2)


def range_filter(stem_id: str, x: np.ndarray, sr: int) -> Tuple[np.ndarray, np.ndarray]:
    """Per-stem zero-phase high-pass (SPEC 2.1 step 3, :data:`RANGE_FILTER_HZ`).

    Unknown ids, ``kick`` and ``bass`` are returned unchanged with
    ``removed`` all zeros. Returns ``(filtered, removed)``.
    """
    arr = _as_2d(x)
    sos = _range_sos(stem_id, sr)
    if sos is None or arr.shape[1] == 0:
        return arr.copy(), np.zeros_like(arr)
    filtered = np.empty_like(arr)
    for ch in range(arr.shape[0]):
        zero_phase_sos(sos, arr[ch], out=filtered[ch])
    return filtered, arr - filtered


# ================================================================== chain
def cleanup_stems(stems: Mapping[str, np.ndarray], mix: np.ndarray, sr: int, strength: str, *,
                  inplace: bool = False) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """Bleed mask -> activity gate -> range filter on every stem.

    ``stems`` maps catalogue stem ids (``lead_vocals``, ``kick``, ``bass`` ...)
    to primary stems of one shape; ``mix`` is the original mix (used by the
    gate). Returns ``(cleaned, removed_total)`` with
    ``sum(cleaned) + removed_total == sum(stems)`` to float32 precision.
    ``inplace=True`` overwrites the input arrays (see module docstring).
    """
    cleaned, removed_total = bleed_mask(stems, sr, strength, inplace=inplace)
    if removed_total.shape[1] == 0:
        return cleaned, removed_total
    for sid, arr in cleaned.items():
        centres, gain_db = gate_gain_curve(arr, mix, sr, strength)
        _apply_gain_curve(arr, centres, gain_db, arr, removed_total, accumulate=True)
        sos = _range_sos(sid, sr)
        if sos is None:
            continue
        for ch in range(arr.shape[0]):
            filtered = zero_phase_sos(sos, arr[ch])
            removed_total[ch] += arr[ch] - filtered
            arr[ch] = filtered
    return cleaned, removed_total


__all__ = [
    "CLEANUP_PARAMS", "RANGE_FILTER_HZ", "STRENGTHS", "CleanupParams",
    "activity_gate", "bleed_mask", "cleanup_stems", "gate_gain_curve", "range_filter",
]
