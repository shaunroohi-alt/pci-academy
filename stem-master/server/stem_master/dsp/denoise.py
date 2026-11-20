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
3. **High-band flicker** (>= 7 kHz) — on a shorter STFT (~23 ms window,
   ~5.8 ms hop, so that frame-rate "shimmer" is resolved and the 7-frame
   median spans ~35 ms) every bin is clamped to ``k`` times its 7-frame
   temporal median when it exceeds it. The level compared is the bin's
   neighbourhood (power-averaged over 5 bins, ~215 Hz), so the clamp follows
   the band envelope rather than per-bin noise texture. Frames near a
   broadband onset (mean positive spectral flux over 300 Hz..7 kHz above
   3 dB, bins within 60 dB of the frame's peak) are left alone from one frame
   before to three frames after, so transients survive.

Each stage applies a gain in a tight-frame STFT with exact overlap-add
reconstruction (see :mod:`._stft`); what was taken out is returned as
``removed = x - clean`` (time domain), so ``clean + removed == x`` exactly.

Strengths:

============ ======= ======== =============== =====
strength     alpha   g_min    de-flicker k    a
============ ======= ======== =============== =====
light        1.0     -8 dB    +6.0 dB         0.96
standard     1.5     -14 dB   +4.5 dB         0.95
strong       2.0     -20 dB   +3.0 dB         0.93
============ ======= ======== =============== =====

Processing is block-wise in time, all channels at once; memory is a few MB
per block plus three stem-sized arrays.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
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
NR_FFT_44K = 2048
DEFLICKER_FFT_44K = 1024
DEFLICKER_HZ = 7000.0
DEFLICKER_FRAMES = 7
DEFLICKER_SMOOTH_BINS = 5
ONSET_BAND_HZ = (300.0, 7000.0)
ONSET_FLUX_DB = 3.0
ONSET_RANGE_DB = 60.0
ONSET_PROTECT_BEFORE = 1
ONSET_PROTECT_AFTER = 3
STATIONARY_RATIO = 0.6
_RAYLEIGH_P10 = math.sqrt(-math.log(0.9))
_MAX_FLOOR_FRAMES = 3000
_DEFLICKER_CONTEXT = 4  # frames: 3 for the 7-frame median, +1 for the flux of the first protected frame


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


# ------------------------------------------------------------ noise floor
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


def _noise_reduction(x: np.ndarray, grid: FrameGrid, floor: np.ndarray, params: DenoiseParams) -> np.ndarray:
    """Decision-directed soft Wiener gain against ``floor`` (c, bins); returns a new array."""
    n_ch, _ = x.shape
    # bins without a noise estimate get a negligible one: gamma becomes huge, G -> 1
    inv_noise = 1.0 / np.maximum(floor ** 2, 1e-24)
    alpha = params.alpha
    a = params.dd_smoothing
    g_min = 10.0 ** (params.gmin_db / 20.0)
    out = np.empty_like(x)
    state = np.zeros((n_ch, grid.n_bins), dtype=np.float64)  # G^2 * gamma of the previous frame
    saved_state = state
    for blk in grid.blocks(512):
        spec = np.empty((n_ch, blk.m1 - blk.m0, grid.n_bins), dtype=np.complex64)
        for ch in range(n_ch):
            spec[ch] = grid.analyze(x[ch], blk.m0, blk.m1)
        power = spec.real.astype(np.float64) ** 2 + spec.imag.astype(np.float64) ** 2
        gain = np.empty(spec.shape, dtype=np.float32)
        # consecutive blocks share overlap frames; restart from the state after
        # the frame preceding this block's first frame so shared frames match
        state = saved_state
        next_m0 = blk.s1 // grid.hop
        for t in range(spec.shape[1]):
            gamma = power[:, t] * inv_noise
            xi = a * state + (1.0 - a) * np.maximum(gamma - 1.0, 0.0)
            g = np.maximum(1.0 - alpha / (1.0 + xi), g_min)
            state = g * g * gamma
            gain[:, t] = g
            if blk.m0 + t == next_m0 - 1:
                saved_state = state
        spec *= gain
        for ch in range(n_ch):
            out[ch, blk.s0:blk.s1] = grid.synthesize(spec[ch], blk.m0, blk.s0, blk.s1)
    return out


# --------------------------------------------------------------- de-flicker
def _temporal_median(mag: np.ndarray, width: int) -> np.ndarray:
    """Running median over ``width`` frames along axis 1 (edges replicated)."""
    half = width // 2
    padded = np.pad(mag, ((0, 0), (half, half), (0, 0)), mode="edge")
    windows = sliding_window_view(padded, width, axis=1)
    return np.partition(windows, half, axis=-1)[..., half]


def _onset_protection(mag: np.ndarray, band: slice, first_is_signal_start: bool) -> np.ndarray:
    """Protected-frame mask (c, F) from broadband positive spectral flux."""
    band_mag = mag[:, :, band]
    # ignore bins more than ONSET_RANGE_DB below the frame's strongest bin
    ref = np.maximum(band_mag.max(axis=2, keepdims=True) * 10.0 ** (-ONSET_RANGE_DB / 20.0), 1e-9)
    level = 20.0 * np.log10(np.maximum(band_mag, ref))
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


def _deflicker(x: np.ndarray, grid: FrameGrid, sr: int, params: DenoiseParams) -> np.ndarray:
    """Clamp high-band bins to ``k`` x their 7-frame median; returns a new array."""
    n_ch, _ = x.shape
    freqs = grid.bin_frequencies(sr)
    hf = np.flatnonzero(freqs >= DEFLICKER_HZ)
    lo_bin = int(np.searchsorted(freqs, ONSET_BAND_HZ[0]))
    hi_bin = int(np.searchsorted(freqs, min(ONSET_BAND_HZ[1], 0.95 * sr / 2.0)))
    onset_band = slice(lo_bin, max(hi_bin, lo_bin + 1))
    k_lin = np.float32(10.0 ** (params.deflicker_db / 20.0))
    out = np.empty_like(x)
    for blk in grid.blocks(1024, context=_DEFLICKER_CONTEXT):
        spec = np.empty((n_ch, blk.fb - blk.fa, grid.n_bins), dtype=np.complex64)
        for ch in range(n_ch):
            spec[ch] = grid.analyze(x[ch], blk.fa, blk.fb)
        mag = np.abs(spec)
        lo, hi = blk.m0 - blk.fa, blk.m1 - blk.fa
        protected = _onset_protection(mag, onset_band, first_is_signal_start=(blk.fa == 0))
        level = mag[:, :, hf]
        if DEFLICKER_SMOOTH_BINS > 1:
            level = np.sqrt(uniform_filter1d(level * level, size=DEFLICKER_SMOOTH_BINS, axis=2, mode="nearest"))
        limit = k_lin * _temporal_median(level, DEFLICKER_FRAMES)
        clamp = np.where(level > limit, limit / np.maximum(level, np.float32(1e-30)), np.float32(1.0))
        clamp[protected] = 1.0
        out_spec = spec[:, lo:hi]
        out_spec[:, :, hf] *= clamp[:, lo:hi]
        for ch in range(n_ch):
            out[ch, blk.s0:blk.s1] = grid.synthesize(out_spec[ch], blk.m0, blk.s0, blk.s1)
    return out


# ------------------------------------------------------------------ public
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
    clean = np.empty_like(arr)
    sos = butter_highpass(HPF_HZ, sr, order=HPF_ORDER) if HPF_HZ < 0.45 * sr else None
    for ch in range(n_ch):
        centred = arr[ch] - np.float32(np.mean(arr[ch], dtype=np.float64))
        if sos is not None:
            zero_phase_sos(sos, centred, out=clean[ch])
        else:
            clean[ch] = centred

    # 2. spectral noise-floor reduction
    n_fft = scaled_fft_size(NR_FFT_44K, sr, minimum=512)
    grid = FrameGrid(n, n_fft, n_fft // 4)
    floors = [estimate_noise_floor(clean[ch], grid) for ch in range(n_ch)]
    if any(f is not None for f in floors):
        floor = np.stack([f if f is not None else np.zeros(grid.n_bins) for f in floors])
        clean = _noise_reduction(clean, grid, floor, params)

    # 3. high-band de-flicker
    if sr / 2.0 > DEFLICKER_HZ + 1000.0 and float(np.max(np.abs(clean))) > 0.0:
        n_fft = scaled_fft_size(DEFLICKER_FFT_44K, sr, minimum=256)
        clean = _deflicker(clean, FrameGrid(n, n_fft, n_fft // 4), sr, params)

    removed = arr - clean
    return clean, removed


__all__ = ["DENOISE_PARAMS", "DenoiseParams", "STRENGTHS", "denoise_dsp", "estimate_noise_floor"]
