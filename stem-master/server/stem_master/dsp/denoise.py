"""DSP denoise for generation artifacts (SPEC 2.2).

:func:`denoise_dsp` removes, in order:

1. **DC offset and sub-sonic rumble** — per-channel mean removal and a
   zero-phase 4th-order Butterworth high-pass at 20 Hz (-0.03 dB at 40 Hz).
2. **Static noise floor** — STFT (~46 ms sqrt-Hann, 75 % overlap). The noise
   magnitude per bin is the 10th percentile over the *active* frames (within
   60 dB of the loudest), divided by ``sqrt(-ln 0.9)`` so that it estimates
   the RMS of Rayleigh-distributed noise. Bins whose 10th/50th percentile
   ratio exceeds 0.6 are steady tones, not noise (noise sits at 0.39), and get
   no noise estimate; the estimate is then smoothed across frequency (9-bin
   median, 5-bin mean). The gain is the soft Wiener rule
   ``G = max(1 - alpha / (1 + xi), g_min)`` where ``xi`` is the
   decision-directed a-priori SNR
   ``xi_t = a * G_{t-1}^2 * gamma_{t-1} + (1 - a) * max(gamma_t - 1, 0)``,
   ``gamma = |X|^2 / N^2`` (with no smoothing ``1/(1+xi) = N^2/|X|^2``).
3. **High-band flicker** (>= 7 kHz) — each bin is clamped to ``k`` times its
   7-frame temporal median when it exceeds it, except on frames near a
   broadband onset (mean positive spectral flux over 300 Hz..7 kHz above
   3 dB; protection covers one frame before to three frames after), so
   transients survive.

Steps 2 and 3 are one multiplicative gain per bin, applied once. What was
taken out is returned as ``removed = x - clean`` (time domain), so
``clean + removed == x`` exactly.

Strengths:

============ ======= ======== =============== =====
strength     alpha   g_min    de-flicker k    a
============ ======= ======== =============== =====
light        1.0     -8 dB    +6.0 dB         0.96
standard     1.5     -14 dB   +4.5 dB         0.95
strong       2.0     -20 dB   +3.0 dB         0.93
============ ======= ======== =============== =====

Processing is block-wise in time with exact overlap-add (see :mod:`._stft`),
all channels at once; memory is bounded by a few MB per block plus the
output arrays.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d

from ._filters import butter_highpass, zero_phase_sos
from ._stft import FrameGrid, scaled_fft_size

STRENGTHS = ("light", "standard", "strong")


@dataclass(frozen=True)
class DenoiseParams:
    alpha: float          # over-subtraction factor
    gmin_db: float        # gain floor
    deflicker_db: float   # clamp level above the 7-frame median
    dd_smoothing: float   # decision-directed smoothing factor a


DENOISE_PARAMS: Dict[str, DenoiseParams] = {
    "light": DenoiseParams(1.0, -8.0, 6.0, 0.96),
    "standard": DenoiseParams(1.5, -14.0, 4.5, 0.95),
    "strong": DenoiseParams(2.0, -20.0, 3.0, 0.93),
}

HPF_HZ = 20.0
HPF_ORDER = 4
DEFLICKER_HZ = 7000.0
DEFLICKER_FRAMES = 7
ONSET_BAND_HZ = (300.0, 7000.0)
ONSET_FLUX_DB = 3.0
ONSET_PROTECT_BEFORE = 1
ONSET_PROTECT_AFTER = 3
STATIONARY_RATIO = 0.6
_RAYLEIGH_P10 = math.sqrt(-math.log(0.9))
_MAX_FLOOR_FRAMES = 3000
_CONTEXT = 4  # frames: 3 for the 7-frame median, +1 for the flux of the first protected frame


def _params(strength: str) -> DenoiseParams:
    try:
        return DENOISE_PARAMS[strength]
    except KeyError:
        raise ValueError(f"unknown denoise strength {strength!r}; expected one of {STRENGTHS}") from None


def _as_2d(x: np.ndarray) -> np.ndarray:
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]
    if arr.ndim != 2:
        raise ValueError(f"expected audio shaped (channels, samples), got {arr.shape}")
    return arr


def _frame_energy(x: np.ndarray, grid: FrameGrid) -> np.ndarray:
    """Approximate mean square of every STFT frame (unwindowed, from hop energies)."""
    n = x.shape[0]
    hop = grid.hop
    n_hops = -(-n // hop)
    padded = np.zeros(n_hops * hop, dtype=np.float32)
    padded[:n] = x
    hop_e = np.square(padded.reshape(n_hops, hop), dtype=np.float64).mean(axis=1)
    # frame m covers hops m-R+1 .. m
    csum = np.concatenate([[0.0], np.cumsum(hop_e)])
    m = np.arange(grid.n_frames)
    hi = np.clip(m + 1, 0, n_hops)
    lo = np.clip(m + 1 - grid.overlap, 0, n_hops)
    return (csum[hi] - csum[lo]) / grid.overlap


def estimate_noise_floor(x: np.ndarray, grid: FrameGrid) -> Optional[np.ndarray]:
    """Per-bin noise magnitude (RMS) of one channel, or ``None`` if nothing is active."""
    energy = _frame_energy(x, grid)
    if energy.size == 0 or energy.max() <= 1e-11:
        return None
    active = np.flatnonzero((energy > energy.max() * 1e-6) & (energy > 1e-11))
    if active.size < 8:
        return None
    if active.size > _MAX_FLOOR_FRAMES:
        active = active[np.linspace(0, active.size - 1, _MAX_FLOOR_FRAMES).round().astype(np.int64)]
    mags = np.abs(grid.analyze_indices(x, active))
    p10, p50 = np.percentile(mags, [10.0, 50.0], axis=0)
    noise = p10 / _RAYLEIGH_P10
    stationary = p10 > STATIONARY_RATIO * np.maximum(p50, 1e-12)
    noise[stationary] = 0.0
    noise = median_filter(noise, size=9, mode="nearest")
    noise = uniform_filter1d(noise, size=5, mode="nearest")
    return noise.astype(np.float64)


def _onset_protection(mag: np.ndarray, band: slice, floor: np.ndarray, first_is_signal_start: bool) -> np.ndarray:
    """Protected-frame mask (c, F) from broadband positive spectral flux."""
    ref = np.maximum(floor[:, None, band], 1e-9)
    level = 20.0 * np.log10(np.maximum(mag[:, :, band], ref))
    flux = np.zeros(mag.shape[:2], dtype=np.float64)
    if mag.shape[1] > 1:
        flux[:, 1:] = np.maximum(np.diff(level, axis=1), 0.0).mean(axis=2)
    onset = flux > ONSET_FLUX_DB
    if not first_is_signal_start:
        onset[:, 0] = False  # flux of the first context frame is unknown
    protected = np.zeros_like(onset)
    n_frames = onset.shape[1]
    for shift in range(-ONSET_PROTECT_BEFORE, ONSET_PROTECT_AFTER + 1):
        # frame u is protected if an onset happens at u - shift
        if shift >= 0:
            protected[:, shift:] |= onset[:, :n_frames - shift]
        else:
            protected[:, :n_frames + shift] |= onset[:, -shift:]
    return protected


def denoise_dsp(x: np.ndarray, sr: int, strength: str) -> Tuple[np.ndarray, np.ndarray]:
    """Remove DC/rumble, a static noise floor and high-band flicker from ``x``.

    Returns ``(clean, removed)``, float32 ``(c, n)``, with ``clean + removed == x``.
    Steady tonal material is left within a small fraction of a dB.
    """
    params = _params(strength)
    arr = _as_2d(x)
    sr = int(sr)
    n_ch, n = arr.shape
    if n == 0:
        return arr.copy(), np.zeros_like(arr)

    # 1. DC removal + 20 Hz zero-phase high-pass
    hp = np.empty_like(arr)
    sos = butter_highpass(HPF_HZ, sr, order=HPF_ORDER) if HPF_HZ < 0.45 * sr else None
    for ch in range(n_ch):
        centred = arr[ch] - np.float32(np.mean(arr[ch], dtype=np.float64))
        if sos is not None:
            zero_phase_sos(sos, centred, out=hp[ch])
        else:
            hp[ch] = centred

    # 2./3. spectral noise-floor reduction + high-band de-flicker
    n_fft = scaled_fft_size(2048, sr, minimum=512)
    grid = FrameGrid(n, n_fft, n_fft // 4)
    floors = [estimate_noise_floor(hp[ch], grid) for ch in range(n_ch)]
    if all(f is None for f in floors):
        clean = hp
    else:
        floor = np.stack([f if f is not None else np.zeros(grid.n_bins) for f in floors])
        clean = _spectral_stage(hp, grid, floor, sr, params)
    removed = arr - clean
    return clean, removed


def _spectral_stage(hp: np.ndarray, grid: FrameGrid, floor: np.ndarray, sr: int,
                    params: DenoiseParams) -> np.ndarray:
    n_ch, n = hp.shape
    freqs = grid.bin_frequencies(sr)
    # bins without a noise estimate get a negligible one: gamma becomes huge, G -> 1
    inv_noise = 1.0 / np.maximum(floor ** 2, 1e-24)        # (c, bins)
    alpha = params.alpha
    a = params.dd_smoothing
    g_min = 10.0 ** (params.gmin_db / 20.0)
    k_lin = np.float32(10.0 ** (params.deflicker_db / 20.0))
    hf = np.flatnonzero(freqs >= DEFLICKER_HZ)
    lo_bin = int(np.searchsorted(freqs, ONSET_BAND_HZ[0]))
    hi_bin = int(np.searchsorted(freqs, min(ONSET_BAND_HZ[1], 0.95 * sr / 2.0)))
    onset_band = slice(lo_bin, max(hi_bin, lo_bin + 1))

    clean = np.empty_like(hp)
    state = np.zeros((n_ch, grid.n_bins), dtype=np.float64)  # G^2 * gamma of the previous frame
    saved_state = state
    for blk in grid.blocks(512, context=_CONTEXT):
        spec = np.empty((n_ch, blk.fb - blk.fa, grid.n_bins), dtype=np.complex64)
        for ch in range(n_ch):
            spec[ch] = grid.analyze(hp[ch], blk.fa, blk.fb)
        mag = np.abs(spec)
        lo, hi = blk.m0 - blk.fa, blk.m1 - blk.fa

        # high-band de-flicker gain (from the unprocessed magnitudes)
        gain = np.ones((n_ch, hi - lo, grid.n_bins), dtype=np.float32)
        if hf.size:
            protected = _onset_protection(mag, onset_band, floor, first_is_signal_start=(blk.fa == 0))
            hf_mag = mag[:, :, hf]
            med = median_filter(hf_mag, size=(1, DEFLICKER_FRAMES, 1), mode="nearest")
            limit = k_lin * med
            with np.errstate(divide="ignore", invalid="ignore"):
                clamp = np.where(hf_mag > limit, limit / np.maximum(hf_mag, 1e-30), 1.0)
            clamp[protected] = 1.0
            gain[:, :, hf] = clamp[:, lo:hi]

        # decision-directed Wiener gain, frame by frame (state carried across blocks)
        state = saved_state
        next_m0 = blk.s1 // grid.hop  # first frame of the next block
        power = (mag[:, lo:hi].astype(np.float64)) ** 2
        for t in range(hi - lo):
            gamma = power[:, t] * inv_noise
            xi = a * state + (1.0 - a) * np.maximum(gamma - 1.0, 0.0)
            g = np.maximum(1.0 - alpha / (1.0 + xi), g_min)
            state = g * g * gamma
            gain[:, t] *= g.astype(np.float32)
            if blk.m0 + t == next_m0 - 1:
                saved_state = state
        if blk.s1 >= n:
            saved_state = state

        out_spec = spec[:, lo:hi] * gain
        for ch in range(n_ch):
            clean[ch, blk.s0:blk.s1] = grid.synthesize(out_spec[ch], blk.m0, blk.s0, blk.s1)
    return clean


__all__ = ["DENOISE_PARAMS", "DenoiseParams", "STRENGTHS", "denoise_dsp", "estimate_noise_floor"]
