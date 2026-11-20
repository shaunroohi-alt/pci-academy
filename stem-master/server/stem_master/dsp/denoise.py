"""Adaptive DSP denoise for generation artifacts (SPEC 2.2).

:func:`denoise_dsp` first *measures* what a stem contains and removes only
that, so clean material passes (almost) untouched (:func:`measure_artifacts`
reports the measurements without processing):

1. **DC offset and sub-sonic rumble** — per-channel mean removal and a
   zero-phase 4th-order Butterworth high-pass at 16 Hz (-0.67 dB at 20 Hz,
   -0.03 dB at 30 Hz), faded in / out over the first / last 250 ms so a stem
   that starts at full level keeps its edges. Always on.
2. **Stationary noise floor** — STFT (~46 ms sqrt-Hann, 75 % overlap), per
   channel. A bin is *noise floor* only when all three hold (soft scores,
   multiplied; :func:`estimate_noise_floor`):

   * *shape*: the lower tail of its magnitude over the active frames (5, 15
     and 30 % quantiles, smoothed over 5 bins) has the Rayleigh shape of
     Gaussian noise — ``q05/q15`` within 1..2.5 dB of -5.0 dB and
     ``q15/q30`` within 0.75..2 dB of -3.4 dB. A floor exposed between the
     notes / phrases that occupy the bin passes; a steady tone, a decaying
     note or a level that keeps moving does not;
   * *stationary*: its 30 % quantile over 3..16 consecutive segments
     (>= 48 frames each) varies by less than 1.5..2.5 dB (std);
   * *a floor*: its power (``2 sigma^2`` from ``q30``) is 20..30 dB or more
     below the stem's mean per-bin power, so the body of a dense, noise-like
     instrument is never taken for noise.

   Bins scoring >= 0.5 (at least 16 of them) give a noise level per
   1/3-octave band (25th percentile of the band's confident bins). Noise
   spectra are smooth, so a <= 2nd-order curve in (log2 f, dB) is fitted and
   bands more than 3 dB above it (a texture riding on the floor) are dropped,
   twice. The curve is used from 1/6 octave below the lowest to 1/6 octave
   above the highest kept band (flat beyond the outermost band centres, zero
   outside) and capped per bin by the bin's own 10th-percentile floor. The
   gain is the soft Wiener rule ``G = max(1 - alpha / (1 + xi), g_min)`` with
   the decision-directed a-priori SNR
   ``xi_t = a * G_{t-1}^2 * gamma_{t-1} + (1 - a) * max(gamma_t - 1, 0)``,
   ``gamma = |X|^2 / N^2``. No floor found -> this stage does nothing.
3. **High-band flicker** — STFT (~11.6 ms, hop ~2.9 ms; :func:`measure_flicker`).
   Per frame, the levels of the bands 7-10, 10-14, 14-20 kHz and of the
   reference band 4.5-7 kHz (all channels summed) minus their running median
   (7 frames one window apart, ~70 ms) give the excess ``x_b``. Frames where
   the reference band also jumps (``x_ref > 3 dB`` while it holds at least
   -20 dB of the high band's level; from 2 frames before to 8 after) are
   musical onsets and are never touched. The measured flicker is
   ``F = max_b [mean(max(x_b - 1.5, 0)) - mean(max(x_ref - 1.5, 0))]`` (dB, over
   the unprotected frames where band ``b`` is active): bursts the rest of the
   spectrum does not share. Bursts that recur on a beat grid (normalised
   autocorrelation of the excess at 80 ms..1 s lags, ``periodicity``) are a
   groove (hi-hats, shakers), not flicker::

       beta = clip((F - F0) / 0.2, 0, 1) * clip((0.22 - periodicity) / 0.1, 0, 1)

   Every unprotected excess above ``k`` dB is cut by ``beta * (x_b - k)`` dB
   (attenuation only, at most ``cut_max``), band-wide so the spectral shape is
   kept. ``beta = 0`` -> this stage does nothing.

Each stage applies a gain in a tight-frame STFT with exact overlap-add
reconstruction (see :mod:`._stft`); what was taken out is returned as
``removed = x - clean`` (time domain), so ``clean + removed == x`` exactly.

Strengths:

============ ======= ======== ===== ========= ====== =======
strength     alpha   g_min    a     flicker   k      cut_max
                                    F0 (dB)   (dB)   (dB)
============ ======= ======== ===== ========= ====== =======
light        1.0     -8 dB    0.96  0.45      4.0    6
standard     1.0     -12 dB   0.95  0.35      3.0    10
strong       1.25    -18 dB   0.93  0.25      2.0    14
============ ======= ======== ===== ========= ====== =======

The thresholds were set on MUSDB18 *train* stems and checked on *test* stems
(``tools/eval_denoise.py``, numbers in SPEC 2.2).

Processing is block-wise in time, all channels at once; memory is a few MB
per block plus three stem-sized arrays.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.ndimage import median_filter, uniform_filter1d

from ._filters import butter_highpass, zero_phase_sos
from ._stft import FrameGrid, scaled_fft_size

STRENGTHS = ("light", "standard", "strong")


@dataclass(frozen=True)
class DenoiseParams:
    alpha: float            # over-subtraction factor
    gmin_db: float          # gain floor
    dd_smoothing: float     # decision-directed smoothing factor a
    flicker_f0_db: float    # measured flicker below which de-flicker does nothing
    flicker_k_db: float     # excess above the running median that is left alone
    flicker_cut_db: float   # largest cut of one frame


DENOISE_PARAMS: Dict[str, DenoiseParams] = {
    "light": DenoiseParams(1.0, -8.0, 0.96, 0.45, 4.0, 6.0),
    "standard": DenoiseParams(1.0, -12.0, 0.95, 0.35, 3.0, 10.0),
    "strong": DenoiseParams(1.25, -18.0, 0.93, 0.25, 2.0, 14.0),
}

HPF_HZ = 16.0
HPF_ORDER = 4
HPF_PAD_S = 0.5                # odd reflection added at both ends before the high-pass
HPF_EDGE_S = 0.25              # what the high-pass removes fades in / out over this at the ends
NR_FFT_44K = 2048
_RAYLEIGH_P10 = math.sqrt(-math.log(0.9))       # q10 / sigma


def _rayleigh_ratio_db(p_lo: float, p_hi: float) -> float:
    """20 log10 of the ratio of two quantiles of a Rayleigh distribution."""
    return 10.0 * math.log10(math.log(1.0 - p_lo) / math.log(1.0 - p_hi))


_MAX_FLOOR_FRAMES = 3000
_ACTIVE_RANGE = 1e-8           # frames within 80 dB of the loudest
_MIN_NOISE_BINS = 16
_SEGMENT_FRAMES = 48
_LEVEL_ZERO_DB = -20.0         # noise power re the mean per-bin power: no confidence above
_LEVEL_FULL_DB = -30.0         # ... full confidence below
_TAIL_P = (0.05, 0.15, 0.30)  # lower-tail quantiles tested for the Rayleigh shape
_EXTEND_OCT = 1.0 / 6.0        # the estimate continues (flat) this far below the lowest confident band
_BAND_PCT = 25.0               # percentile of the confident bins' levels in a 1/3-octave band
_BUMP_DB = 1.5                 # 1/3-octave noise levels this far above the smooth fit are music

DEFLICKER_FFT_44K = 512
DEFLICKER_BANDS_HZ = ((7000.0, 10000.0), (10000.0, 14000.0), (14000.0, 20000.0))
DEFLICKER_REF_HZ = (4500.0, 7000.0)
DEFLICKER_HZ = DEFLICKER_BANDS_HZ[0][0]
DEFLICKER_FRAMES = 7
FLICKER_DEADZONE_DB = 1.5
FLICKER_SPAN_DB = 0.2
ONSET_REF_DB = 3.0
ONSET_REF_SHARE_DB = 20.0
PERIOD_LAGS_S = (0.08, 1.0)
PERIODICITY_RANGE = (0.12, 0.22)  # periodicity -> de-flicker scaled from 1 down to 0
ONSET_PROTECT_BEFORE = 2        # frames
ONSET_PROTECT_AFTER = 8         # frames (~23 ms at 44.1 kHz)


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


def _clip01(v):
    return np.clip(v, 0.0, 1.0)


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


@dataclass
class NoiseEstimate:
    """Result of :func:`estimate_noise_floor` for one channel."""

    floor: np.ndarray          # per-bin noise magnitude (RMS) to subtract; 0 = none
    confidence: np.ndarray     # per-bin 0..1 "this bin is a stationary noise floor"
    noise_db: Optional[float]  # noise power re the channel's mean power (dB), None if no noise found


def estimate_noise_floor(x: np.ndarray, grid: FrameGrid, sr: int) -> NoiseEstimate:
    """Detect a stationary noise floor in one channel (see the module docstring, step 2)."""
    empty = NoiseEstimate(np.zeros(grid.n_bins), np.zeros(grid.n_bins), None)
    energy = _frame_energy(x, grid)
    if energy.size == 0 or energy.max() <= 1e-11:
        return empty
    active = np.flatnonzero((energy > energy.max() * _ACTIVE_RANGE) & (energy > 1e-11))
    if active.size < 2 * _SEGMENT_FRAMES:
        return empty
    if active.size > _MAX_FLOOR_FRAMES:
        active = active[np.linspace(0, active.size - 1, _MAX_FLOOR_FRAMES).round().astype(np.int64)]
    mags = np.abs(grid.analyze_indices(x, active)).astype(np.float64)
    power = mags * mags
    freqs = grid.bin_frequencies(sr)
    body = float(power[:, freqs >= 40.0].mean()) if np.any(freqs >= 40.0) else float(power.mean())
    if body <= 0.0:
        return empty

    def smooth_db(v: np.ndarray) -> np.ndarray:
        return uniform_filter1d(20.0 * np.log10(np.maximum(v, 1e-12)), 5, axis=-1, mode="nearest")

    # Per bin, the lower tail of the active frames: where a noise floor is
    # exposed between the notes / phrases that occupy that bin.
    pa, pb, pc = _TAIL_P
    qa, qb, qc = np.percentile(mags, [100.0 * pa, 100.0 * pb, 100.0 * pc], axis=0)
    la, lb, lc = smooth_db(qa), smooth_db(qb), smooth_db(qc)
    c_shape = (_clip01(1.0 - (np.abs(la - lb - _rayleigh_ratio_db(pa, pb)) - 1.0) / 1.5)
               * _clip01(1.0 - (np.abs(lb - lc - _rayleigh_ratio_db(pb, pc)) - 0.75) / 1.25))
    n_seg = int(min(16, max(3, active.size // _SEGMENT_FRAMES)))
    seg_q = np.stack([np.percentile(mags[s], 100.0 * pc, axis=0)
                      for s in np.array_split(np.arange(active.size), n_seg)])
    spread = np.std(smooth_db(seg_q), axis=0)
    c_stat = _clip01((2.5 - spread) / 1.0)
    # Rayleigh: q_p = sigma * sqrt(-2 ln(1 - p)), E|X|^2 = 2 sigma^2
    noise_power = 2.0 * 10.0 ** (lc / 10.0) / (-2.0 * math.log(1.0 - pc))
    rel_db = 10.0 * np.log10(np.maximum(noise_power, 1e-30) / body)
    c_level = _clip01((_LEVEL_ZERO_DB - rel_db) / (_LEVEL_ZERO_DB - _LEVEL_FULL_DB))
    conf = c_shape * c_stat * c_level
    conf[freqs < 20.0] = 0.0
    sure = conf >= 0.5
    if np.count_nonzero(sure) < _MIN_NOISE_BINS:
        return NoiseEstimate(np.zeros(grid.n_bins), conf, None)

    # noise spectrum on 1/3-octave bands from the confident bins, interpolated
    # in log-frequency between the outermost confident bands
    edges = 20.0 * 2.0 ** (np.arange(0, 40) / 3.0)
    edges = edges[edges < sr / 2.0]
    centres: List[float] = []
    levels: List[float] = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = sure & (freqs >= lo) & (freqs < hi)
        if np.count_nonzero(sel) >= 3:
            centres.append(math.sqrt(lo * hi))
            levels.append(float(np.percentile(10.0 * np.log10(noise_power[sel]), _BAND_PCT)))
    if len(centres) < 2:
        return NoiseEstimate(np.zeros(grid.n_bins), conf, None)
    # noise spectra are smooth and a floor is the *lowest* thing in a band:
    # fit a low-order curve in (log2 f, dB) and drop bands that stick out
    # above it (a texture riding on the floor) until it settles on the lower
    # envelope
    xc = np.log2(np.asarray(centres))
    yc = np.asarray(levels)
    keep = np.ones(xc.size, dtype=bool)
    for _ in range(4):
        deg = int(min(2, max(0, np.count_nonzero(keep) - 2)))
        coef = np.polyfit(xc[keep], yc[keep], deg)
        resid = yc - np.polyval(coef, xc)
        new_keep = keep & (resid <= _BUMP_DB)
        if np.array_equal(new_keep, keep) or np.count_nonzero(new_keep) < 2:
            break
        keep = new_keep
    deg = int(min(2, max(0, np.count_nonzero(keep) - 2)))
    coef = np.polyfit(xc[keep], yc[keep], deg)
    lo_c, hi_c = float(xc[keep].min()), float(xc[keep].max())
    logf = np.log2(np.maximum(freqs, 1.0))
    model_db = np.polyval(coef, np.clip(logf, lo_c, hi_c))
    inside = (logf >= lo_c - _EXTEND_OCT) & (logf <= hi_c + 1.0 / 6.0)
    model = np.where(inside, np.sqrt(10.0 ** (model_db / 10.0)), 0.0)
    # never above the bin's own lower-tail floor (music that is always present
    # there keeps the estimate down)
    bin_floor = median_filter(np.percentile(mags, 10.0, axis=0) / _RAYLEIGH_P10, size=9, mode="nearest")
    bin_floor = uniform_filter1d(bin_floor, size=5, mode="nearest")
    floor = np.minimum(model, bin_floor)
    noise_db = 10.0 * math.log10(max(float(np.sum(floor ** 2)) / (body * grid.n_bins), 1e-30))
    return NoiseEstimate(floor.astype(np.float64), conf, round(noise_db, 2))


def _noise_reduction(x: np.ndarray, grid: FrameGrid, floor: np.ndarray, params: DenoiseParams,
                     block_frames: int = 512) -> np.ndarray:
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
    for blk in grid.blocks(block_frames):
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
def _temporal_median(mag: np.ndarray, width: int, stride: int = 1) -> np.ndarray:
    """Median along axis 1 of the ``width`` frames ``t + k*stride``, ``|k| <= width//2``.

    With ``stride`` = frames per window length the compared frames do not
    overlap, so a short burst occupies at most a couple of the ``width``
    samples and stands out from the median. Edges are replicated.
    """
    half = width // 2
    pad = half * stride
    padded = np.pad(mag, ((0, 0), (pad, pad), (0, 0)), mode="edge")
    n_frames = mag.shape[1]
    if width == 7:
        # Devillard's 13-exchange median-of-7 network on whole arrays
        p = [padded[:, k * stride:k * stride + n_frames].copy() for k in range(7)]
        for i, j in _MEDIAN7_NETWORK:
            lo = np.minimum(p[i], p[j])
            np.maximum(p[i], p[j], out=p[j])
            p[i] = lo
        return p[3]
    windows = sliding_window_view(padded, 2 * pad + 1, axis=1)[..., ::stride]
    return np.partition(windows, half, axis=-1)[..., half]


_MEDIAN7_NETWORK = ((0, 5), (0, 3), (1, 6), (2, 4), (0, 1), (3, 5), (2, 6),
                    (2, 3), (3, 6), (4, 5), (1, 4), (1, 3), (3, 4))


@dataclass
class FlickerEstimate:
    """High-band levels relative to their running median, and the measured flicker."""

    excess: np.ndarray          # (frames, bands) dB above the running median
    protected: np.ndarray       # (frames,) onset frames that are never touched
    bands: List[np.ndarray]     # bin indices of every high band
    flicker_db: Optional[float]  # F (module docstring), None if not measurable
    periodicity: float = 0.0     # beat-locked recurrence of the excess (0..1); musical, not flicker


def _band_slices(grid: FrameGrid, sr: int) -> Tuple[List[np.ndarray], Optional[np.ndarray]]:
    freqs = grid.bin_frequencies(sr)
    top = 0.95 * sr / 2.0
    bands = []
    for lo, hi in DEFLICKER_BANDS_HZ:
        idx = np.flatnonzero((freqs >= lo) & (freqs < min(hi, top)))
        if idx.size >= 8:
            bands.append(idx)
    ref = np.flatnonzero((freqs >= DEFLICKER_REF_HZ[0]) & (freqs < min(DEFLICKER_REF_HZ[1], top)))
    return bands, (ref if ref.size >= 8 else None)


def measure_flicker(x: np.ndarray, grid: FrameGrid, sr: int, block_frames: int = 4096) -> FlickerEstimate:
    """Per-frame high-band excess over the running median, onset protection and ``F``."""
    n_ch = x.shape[0]
    bands, ref = _band_slices(grid, sr)
    n_frames = grid.n_frames
    if not bands or ref is None or n_frames < 4 * DEFLICKER_FRAMES:
        return FlickerEstimate(np.zeros((n_frames, 0), dtype=np.float32), np.zeros(n_frames, dtype=bool), [], None)
    levels = np.zeros((n_frames, len(bands) + 1), dtype=np.float64)
    for blk in grid.blocks(block_frames):
        f0, f1 = blk.m0, blk.m1
        power = None
        for ch in range(n_ch):
            spec = grid.analyze(x[ch], f0, f1)
            p = spec.real.astype(np.float64) ** 2 + spec.imag.astype(np.float64) ** 2
            power = p if power is None else power + p
        assert power is not None
        for b, idx in enumerate(bands):
            levels[f0:f1, b] = power[:, idx].sum(axis=1)
        levels[f0:f1, -1] = power[:, ref].sum(axis=1)
    db = 10.0 * np.log10(np.maximum(levels, 1e-20))
    trend = _temporal_median(db[np.newaxis], DEFLICKER_FRAMES, grid.overlap)[0]
    excess = db - trend
    # a band-frame counts when it is within 50 dB of the band's loudest frame and
    # within 70 dB of the loudest band-frame overall (numerical dust never does)
    active = (levels > levels.max(axis=0, keepdims=True) * 1e-5) & (levels > levels.max() * 1e-7)
    # an empty reference band carries no onset information (and protects
    # nothing); nor does one 20 dB below the high band in that frame (window
    # leakage of the high band itself)
    ref_real = active[:, -1] & (db[:, -1] >= db[:, :-1].max(axis=1) - ONSET_REF_SHARE_DB)
    ref_excess = np.where(ref_real, excess[:, -1], 0.0)
    onset = ref_excess > ONSET_REF_DB
    protected = np.zeros(n_frames, dtype=bool)
    for shift in range(-ONSET_PROTECT_BEFORE, ONSET_PROTECT_AFTER + 1):
        if shift >= 0:
            protected[shift:] |= onset[:n_frames - shift] if shift else onset
        else:
            protected[:shift] |= onset[-shift:]
    flicker = None
    periodicity = 0.0
    hf_excess = np.where(active[:, :-1], excess[:, :-1], 0.0)
    per_band = []
    for b in range(len(bands)):
        use = ~protected & active[:, b]
        if np.count_nonzero(use) >= 32:
            hf = float(np.maximum(hf_excess[use, b] - FLICKER_DEADZONE_DB, 0.0).mean())
            rf = float(np.maximum(ref_excess[use] - FLICKER_DEADZONE_DB, 0.0).mean())
            per_band.append(hf - rf)
    if per_band:
        flicker = round(max(per_band), 3)
        indicator = np.where(protected, 0.0, np.maximum(hf_excess.max(axis=1) - FLICKER_DEADZONE_DB, 0.0))
        periodicity = _periodicity(indicator, grid.hop / float(sr))
    return FlickerEstimate(hf_excess.astype(np.float32), protected, bands, flicker, periodicity)


def _periodicity(indicator: np.ndarray, frame_s: float) -> float:
    """Largest normalised autocorrelation of ``indicator`` at lags 80 ms .. 1 s.

    High-band bursts of a groove (hi-hats, shakers, ride) recur on the beat
    grid; codec flicker does not.
    """
    v = indicator.astype(np.float64)
    v = v - v.mean()
    energy = float(np.dot(v, v))
    lo = int(round(PERIOD_LAGS_S[0] / frame_s))
    hi = min(v.size - 1, int(round(PERIOD_LAGS_S[1] / frame_s)))
    if energy <= 0.0 or hi <= lo:
        return 0.0
    n_fft = 1 << int(math.ceil(math.log2(2 * v.size)))
    spec = np.fft.rfft(v, n_fft)
    ac = np.fft.irfft(spec.real ** 2 + spec.imag ** 2, n_fft)[:hi + 1] / energy
    # unbiased: lag tau has v.size - tau products
    ac = ac * v.size / np.maximum(v.size - np.arange(hi + 1), 1)
    return float(max(0.0, ac[lo:hi + 1].max()))


def _deflicker(x: np.ndarray, grid: FrameGrid, est: FlickerEstimate, params: DenoiseParams,
               beta: float, block_frames: int = 4096) -> np.ndarray:
    """Cut every unprotected high-band excess above ``k`` by ``beta * (excess - k)`` dB."""
    cut_db = np.clip(beta * (est.excess - params.flicker_k_db), 0.0, params.flicker_cut_db)
    cut_db[est.protected] = 0.0
    gain = (10.0 ** (-cut_db / 20.0)).astype(np.float32)     # (frames, bands)
    out = np.empty_like(x)
    for blk in grid.blocks(block_frames):
        g = gain[blk.m0:blk.m1]
        for ch in range(x.shape[0]):
            spec = grid.analyze(x[ch], blk.m0, blk.m1)
            for b, idx in enumerate(est.bands):
                spec[:, idx] *= g[:, b:b + 1]
            out[ch, blk.s0:blk.s1] = grid.synthesize(spec, blk.m0, blk.s0, blk.s1)
    return out


def flicker_beta(flicker_db: Optional[float], params: DenoiseParams, periodicity: float = 0.0) -> float:
    """How much of the de-flicker to apply (0..1) for a measured flicker ``F``.

    Scaled down to 0 when the bursts recur on a beat grid (``periodicity``
    0.12 .. 0.22): that is a groove, not flicker.
    """
    if flicker_db is None:
        return 0.0
    beta = min(1.0, max(0.0, (flicker_db - params.flicker_f0_db) / FLICKER_SPAN_DB))
    p0, p1 = PERIODICITY_RANGE
    return float(beta * min(1.0, max(0.0, (p1 - periodicity) / (p1 - p0))))


# ------------------------------------------------------------------ public
def _dc_and_rumble(arr: np.ndarray, sr: int) -> np.ndarray:
    """Stage 1: mean removal and the 16 Hz zero-phase high-pass.

    Stem edges: the signal is extended by a 0.5 s odd reflection (so the
    filter's start-up ringing dies out before the stem starts) and what the
    high-pass takes out is faded in over the first and out over the last
    ``HPF_EDGE_S`` (raised cosine). A stem that starts or ends at full level
    (an excerpt, a song without a fade) therefore keeps its edge samples.
    """
    clean = np.empty_like(arr)
    sos = butter_highpass(HPF_HZ, sr, order=HPF_ORDER) if HPF_HZ < 0.45 * sr else None
    n = arr.shape[1]
    pad = min(n - 1, int(round(HPF_PAD_S * sr)))
    edge = min(n // 2, int(round(HPF_EDGE_S * sr)))
    ramp = (0.5 - 0.5 * np.cos(np.pi * (np.arange(edge) + 0.5) / max(edge, 1))).astype(np.float32)
    for ch in range(arr.shape[0]):
        centred = arr[ch] - np.float32(np.mean(arr[ch], dtype=np.float64))
        if sos is None:
            clean[ch] = centred
            continue
        if pad > 0:
            ext = np.concatenate([2.0 * centred[0] - centred[pad:0:-1], centred,
                                  2.0 * centred[-1] - centred[-2:-(pad + 2):-1]]).astype(np.float32)
            clean[ch] = zero_phase_sos(sos, ext, out=ext)[pad:pad + n]
        else:
            zero_phase_sos(sos, centred, out=clean[ch])
        if edge > 0:
            # clean = centred - w * (centred - hp), w rising 0 -> 1 at both ends
            for sl, w in ((slice(0, edge), ramp), (slice(n - edge, n), ramp[::-1])):
                clean[ch, sl] = centred[sl] - w * (centred[sl] - clean[ch, sl])
    return clean


def _nr_grid(n: int, sr: int) -> FrameGrid:
    n_fft = scaled_fft_size(NR_FFT_44K, sr, minimum=512)
    return FrameGrid(n, n_fft, n_fft // 4)


def _deflicker_grid(n: int, sr: int) -> FrameGrid:
    n_fft = scaled_fft_size(DEFLICKER_FFT_44K, sr, minimum=128)
    return FrameGrid(n, n_fft, n_fft // 4)


def measure_artifacts(x: np.ndarray, sr: int) -> dict:
    """What :func:`denoise_dsp` would find in ``x`` (no processing).

    ``noise_db`` — detected stationary noise power re the stem's mean power
    (dB, max over channels; ``None`` if none), ``noise_bins`` — fraction of
    bins judged to be noise floor, ``flicker_db`` — measured high-band
    flicker ``F``, and ``flicker_beta`` per strength.
    """
    arr = _as_2d(x)
    sr = int(sr)
    n = arr.shape[1]
    out: dict = {"noise_db": None, "noise_bins": 0.0, "flicker_db": None, "flicker_periodicity": None,
                 "flicker_beta": {s: 0.0 for s in STRENGTHS}}
    if n == 0 or not np.any(arr):
        return out
    base = _dc_and_rumble(arr, sr)
    grid = _nr_grid(n, sr)
    ests = [estimate_noise_floor(base[ch], grid, sr) for ch in range(arr.shape[0])]
    levels = [e.noise_db for e in ests if e.noise_db is not None]
    out["noise_db"] = max(levels) if levels else None
    out["noise_bins"] = round(float(np.mean([np.mean(e.confidence >= 0.5) for e in ests])), 4)
    if sr / 2.0 > DEFLICKER_HZ + 1000.0:
        fl = measure_flicker(base, _deflicker_grid(n, sr), sr)
        out["flicker_db"] = fl.flicker_db
        out["flicker_periodicity"] = round(fl.periodicity, 3)
        out["flicker_beta"] = {s: round(flicker_beta(fl.flicker_db, DENOISE_PARAMS[s], fl.periodicity), 3)
                               for s in STRENGTHS}
    return out


def denoise_dsp(x: np.ndarray, sr: int, strength: str, *,
                block_frames: Optional[int] = None) -> Tuple[np.ndarray, np.ndarray]:
    """Remove DC/rumble and, where measured, a stationary noise floor and high-band flicker.

    Returns ``(clean, removed)``, float32 ``(c, n)``, with ``clean + removed == x``.
    Material without a detectable noise floor or flicker only gets the DC /
    16 Hz high-pass step. ``block_frames`` only changes memory/speed (the
    result is identical); it exists so tests can prove that.
    """
    params = _params(strength)
    arr = _as_2d(x)
    sr = int(sr)
    n_ch, n = arr.shape
    if n == 0:
        return arr.copy(), np.zeros_like(arr)

    # 1. DC removal + 16 Hz zero-phase high-pass
    clean = _dc_and_rumble(arr, sr)

    # 2. stationary noise floor, only where one is detected
    grid = _nr_grid(n, sr)
    ests = [estimate_noise_floor(clean[ch], grid, sr) for ch in range(n_ch)]
    if any(e.noise_db is not None for e in ests):
        floor = np.stack([e.floor for e in ests])
        clean = _noise_reduction(clean, grid, floor, params, block_frames=block_frames or 512)

    # 3. high-band de-flicker, scaled by the measured flicker
    if sr / 2.0 > DEFLICKER_HZ + 1000.0 and float(np.max(np.abs(clean))) > 0.0:
        dgrid = _deflicker_grid(n, sr)
        est = measure_flicker(clean, dgrid, sr, block_frames=block_frames or 4096)
        beta = flicker_beta(est.flicker_db, params, est.periodicity)
        if beta > 0.0:
            clean = _deflicker(clean, dgrid, est, params, beta, block_frames=block_frames or 4096)

    removed = arr - clean
    return clean, removed


__all__ = ["DENOISE_PARAMS", "DenoiseParams", "STRENGTHS", "denoise_dsp", "estimate_noise_floor",
           "measure_artifacts", "measure_flicker"]
