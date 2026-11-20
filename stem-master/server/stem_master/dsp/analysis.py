"""Track analysis (SPEC 2.3) and per-stem statistics.

:func:`analyze` returns tempo, key (+ Camelot), integrated loudness, sample
peak and an *artifact level*; :func:`stem_stats` returns the per-stem numbers
and the 256-point waveform overview used by the mixer.

Everything is computed block-wise or on reduced-rate copies, so a 15-minute
track needs only a few tens of MB on top of the input array.

Artifact level
--------------
``artifact_level`` (0..1) measures audible *processing artifacts* — a static
noise floor, a "shimmering" high band and a hard band-limit. It is a property
of the audio only and is never a statement about who or what made a track.
Three sub-scores in 0..1 are computed on a mono copy at the source rate
(STFT, ``n_fft`` ~23 ms, hop = ``n_fft/4``, Hann):

* ``s_flicker`` — high-band temporal flicker. Per frame, the energy of the
  high band ``[7 kHz, f_hi)`` and of the mid band ``[1, 4) kHz`` is taken
  (``f_hi = min(16 kHz, cutoff - 500 Hz, 0.9 * Nyquist)``). For each band the
  roughness is the median over frames of ``|L[t] - L[t-4]|`` (dB, frames one
  window length apart, i.e. non-overlapping): steady sound — including a
  stationary noise floor — barely moves, a codec "shimmer" jumps by several dB
  from one ~20 ms frame to the next, and the median ignores sparse genuine
  transients. Only frames where both bands are within 60 dB of their own
  maximum count. ``F = roughness_high - roughness_mid`` (dB): comparing with
  the mid band cancels fluctuation that the music itself has everywhere.
  ``s_flicker = clip((F - 1.5) / 2.5, 0, 1)``; the 1.5 dB dead zone is above
  what dense acoustic mixes and their separated stems reach (MUSDB18 clips
  measure -0.6..1.3 dB).
* ``s_noise`` — static noise floor. Frame mean-square levels in dB:
  ``floor`` = 5th percentile, ``programme`` = 95th percentile (digital
  silence counts as -120 dB). A floor only counts if it is audible, clearly
  below the programme (i.e. quiet frames exist) and noise-like (median
  spectral flatness, 1 kHz..f_hi, of the quietest 10 % of frames; ~0.56 for
  white noise, < 0.1 for quiet musical passages)::

      s_noise = clip((floor + 75) / 25, 0, 1)
              * clip((programme - floor - 12) / 12, 0, 1)
              * clip((flatness - 0.15) / 0.25, 0, 1)

* ``s_cutoff`` — hard spectral cut-off between 11 and 20 kHz: the long-term
  average spectrum falls by more than 30 dB from ``[f-500, f-100]`` Hz to
  ``[f+100, f+500]`` Hz while the region below carries content.
  ``s_cutoff = clip((19500 - f_cut) / 5500, 0, 1)`` (0 when none is found).

They are combined as a soft OR, weighting each cue by how strongly it
indicates audible artifacts::

    artifact_level = 1 - (1 - 0.85 s_flicker) (1 - 0.60 s_noise) (1 - 0.30 s_cutoff)

``artifact_label``: ``low`` < 0.33 <= ``moderate`` < 0.66 <= ``high``.
"""

from __future__ import annotations

import logging
import math
import warnings
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d

from ._stft import FrameGrid, hann, scaled_fft_size
from .audio_io import resample

log = logging.getLogger(__name__)

SILENCE_FLOOR_DB = -120.0
_SILENT_PEAK_DB = -90.0
_ANALYSIS_SR = 22050
_KEY_SR = 11025

# ----------------------------------------------------------------- key tables
PITCH_CLASSES_MAJOR = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
"""Tonic spelling for major keys (fewest accidentals; F# rather than Gb)."""
PITCH_CLASSES_MINOR = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B")
"""Tonic spelling for minor keys (fewest accidentals; Eb rather than D#)."""

# Krumhansl-Kessler probe-tone profiles (tonic first).
KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def camelot_code(tonic_pc: int, mode: str) -> str:
    """Camelot wheel code for a key (``mode`` 'major' -> 'B', 'minor' -> 'A').

    C major = 8B, each fifth up adds one (G = 9B ...); a minor key shares the
    number of its relative major (A minor = 8A).
    """
    tonic_pc %= 12
    if mode == "minor":
        relative_major = (tonic_pc + 3) % 12
        return f"{(7 * relative_major % 12 + 7) % 12 + 1}A"
    if mode == "major":
        return f"{(7 * tonic_pc % 12 + 7) % 12 + 1}B"
    raise ValueError(f"unknown mode {mode!r}")


def key_name(tonic_pc: int, mode: str) -> str:
    """Human-readable key name, e.g. ``'A minor'`` or ``'F# major'``."""
    names = PITCH_CLASSES_MINOR if mode == "minor" else PITCH_CLASSES_MAJOR
    return f"{names[tonic_pc % 12]} {mode}"


KEY_TO_CAMELOT: Dict[str, str] = {
    key_name(pc, mode): camelot_code(pc, mode) for mode in ("major", "minor") for pc in range(12)
}
"""All 24 key names -> Camelot code."""


# -------------------------------------------------------------------- helpers
def _as_2d(x: np.ndarray) -> np.ndarray:
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]
    if arr.ndim != 2:
        raise ValueError(f"expected audio shaped (channels, samples), got {arr.shape}")
    return arr


def _amp_db(value: float) -> float:
    if value <= 0.0 or not math.isfinite(value):
        return SILENCE_FLOOR_DB
    return max(SILENCE_FLOOR_DB, 20.0 * math.log10(value))


def _peak_abs(x: np.ndarray, chunk: int = 1 << 20) -> float:
    peak = 0.0
    for start in range(0, x.shape[1], chunk):
        block = x[:, start:start + chunk]
        if block.size:
            peak = max(peak, float(np.max(np.abs(block))))
    return peak


def _mono(x: np.ndarray) -> np.ndarray:
    if x.shape[0] == 1:
        return x[0]
    return x.mean(axis=0, dtype=np.float32)


# ------------------------------------------------------------------- loudness
def _integrated_loudness(x: np.ndarray, sr: int, chunk: int = 1 << 18) -> Optional[float]:
    """ITU-R BS.1770-4 integrated loudness (LUFS) exactly as pyloudnorm computes it.

    Uses pyloudnorm's K-weighting filter design and gating, but filters in
    chunks and integrates the 400 ms gating blocks from running sums, so memory
    stays bounded for long tracks. Returns ``None`` for input shorter than one
    gating block or with nothing above the absolute gate.
    """
    from pyloudnorm.iirfilter import IIRfilter

    n_ch, n = x.shape
    block_s, overlap = 0.400, 0.75
    step = 1.0 - overlap
    if n < block_s * sr or n_ch > 5:
        return None
    stages = [
        IIRfilter(4.0, 1 / np.sqrt(2), 1500.0, sr, "high_shelf"),
        IIRfilter(0.0, 0.5, 38.0, sr, "high_pass"),
    ]
    coeffs = [(st.b, st.a, st.passband_gain) for st in stages]
    total_s = n / sr
    n_blocks = int(np.round((total_s - block_s) / (block_s * step))) + 1
    j = np.arange(n_blocks, dtype=np.float64)
    lo = (block_s * (j * step) * sr).astype(np.int64)
    hi = np.minimum((block_s * (j * step + 1) * sr).astype(np.int64), n)
    lo = np.minimum(lo, n)
    bounds = np.unique(np.concatenate([lo, hi]))
    z = np.zeros((n_ch, n_blocks), dtype=np.float64)
    for ch in range(n_ch):
        states = [signal.lfilter_zi(b, a) * 0.0 for b, a, _ in coeffs]
        cs_at = np.zeros(bounds.size, dtype=np.float64)
        offset = 0.0
        for c0 in range(0, n, chunk):
            c1 = min(n, c0 + chunk)
            y = x[ch, c0:c1].astype(np.float64)
            for k, (b, a, gain) in enumerate(coeffs):
                y, states[k] = signal.lfilter(b, a, y, zi=states[k])
                if gain != 1.0:
                    y = y * gain
            cum = np.cumsum(y * y)
            sel = (bounds > c0) & (bounds <= c1)
            if np.any(sel):
                cs_at[sel] = offset + cum[bounds[sel] - c0 - 1]
            offset += float(cum[-1]) if cum.size else 0.0
        idx_lo = np.searchsorted(bounds, lo)
        idx_hi = np.searchsorted(bounds, hi)
        z[ch] = (cs_at[idx_hi] - cs_at[idx_lo]) / (block_s * sr)
    weights = np.array([1.0, 1.0, 1.0, 1.41, 1.41])[:n_ch]
    with np.errstate(divide="ignore", invalid="ignore"):
        block_power = np.sum(weights[:, None] * z, axis=0)
        block_lufs = -0.691 + 10.0 * np.log10(block_power)
        above_abs = block_lufs >= -70.0
        if not np.any(above_abs):
            return None
        z_abs = z[:, above_abs].mean(axis=1)
        gamma_r = -0.691 + 10.0 * np.log10(np.sum(weights * z_abs)) - 10.0
        gated = (block_lufs > gamma_r) & (block_lufs > -70.0)
        if not np.any(gated):
            return None
        z_rel = z[:, gated].mean(axis=1)
        lufs = -0.691 + 10.0 * np.log10(np.sum(weights * z_rel))
    if not math.isfinite(lufs):
        return None
    return float(lufs)


# ---------------------------------------------------------------------- tempo
def _onset_envelope(y: np.ndarray, sr: int, n_fft: int = 1024, hop: int = 256,
                    n_mels: int = 64) -> np.ndarray:
    """Log-mel spectral-flux onset envelope (frame rate ``sr / hop``), block-wise."""
    import librosa

    grid = FrameGrid(y.shape[0], n_fft, hop, window=hann(n_fft))
    mel = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels, fmin=30.0,
                              fmax=min(sr / 2.0, 11000.0)).astype(np.float32)
    ref = float(np.sum(grid.window64) / 2.0) ** 2  # full-scale sine -> ~0 dB
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    floor_db = (20.0 * math.log10(peak) if peak > 0 else -120.0) - 80.0
    env = np.zeros(grid.n_frames, dtype=np.float32)
    prev: Optional[np.ndarray] = None
    done = 0
    for blk in grid.blocks(2048):
        # consecutive blocks share frames; only compute frames not yet done
        start = max(blk.m0, done)
        if start >= blk.m1:
            continue
        spec = grid.analyze(y, start, blk.m1)
        power = (spec.real ** 2 + spec.imag ** 2) / ref
        mel_db = 10.0 * np.log10(power @ mel.T + 1e-12)
        np.maximum(mel_db, floor_db, out=mel_db)
        if prev is None:
            prev = mel_db[:1]
        stacked = np.concatenate([prev, mel_db], axis=0)
        flux = np.maximum(np.diff(stacked, axis=0), 0.0).mean(axis=1)
        env[start:blk.m1] = flux
        prev = mel_db[-1:]
        done = blk.m1
    return env


def _mean_tempogram(env: np.ndarray, sr: int, hop: int, ac_size: float = 8.0,
                    chunk: int = 4096) -> np.ndarray:
    """Time-average of ``librosa.feature.tempogram`` computed in chunks.

    Every chunk carries half a window of real context on both sides, so the
    columns kept are identical to those of a one-shot tempogram; memory is
    bounded by the chunk size. Returns shape ``(win_length, 1)``.
    """
    import librosa

    win = int(librosa.time_to_frames(ac_size, sr=sr, hop_length=hop))
    half = win // 2 + 1
    n = env.shape[0]
    total = np.zeros(win, dtype=np.float64)
    for a in range(0, n, chunk):
        b = min(n, a + chunk)
        lo, hi = max(0, a - half), min(n, b + half)
        tg = librosa.feature.tempogram(onset_envelope=env[lo:hi], sr=sr, hop_length=hop, win_length=win)
        total += tg[:, a - lo:b - lo].sum(axis=1)
    return (total / max(n, 1))[:, np.newaxis]


def _refine_period(beats: np.ndarray) -> Optional[Tuple[float, float]]:
    """Least-squares beat period (frames) and relative residual spread."""
    if beats.size < 4:
        return None
    ibi = np.diff(beats.astype(np.float64))
    ibi = ibi[ibi > 0]
    if ibi.size < 3:
        return None
    med = float(np.median(ibi))
    index = np.concatenate([[0.0], np.cumsum(np.round(np.diff(beats) / med))])
    times = beats.astype(np.float64)
    keep = np.ones(times.size, dtype=bool)
    slope = med
    for _ in range(3):
        if keep.sum() < 4:
            break
        slope, intercept = np.polyfit(index[keep], times[keep], 1)
        resid = times - (slope * index + intercept)
        new_keep = np.abs(resid) < 0.25 * med
        if np.array_equal(new_keep, keep):
            break
        keep = new_keep
    if slope <= 0:
        return None
    resid = times[keep] - (slope * index[keep] + np.mean(times[keep] - slope * index[keep]))
    spread = float(np.std(resid) / slope) if keep.sum() > 2 else 1.0
    return float(slope), spread


def _autocorr_at(env: np.ndarray, lag: float) -> float:
    e = env.astype(np.float64) - float(np.mean(env))
    denom = float(np.dot(e, e))
    if denom <= 0 or lag <= 0 or lag >= e.size - 1:
        return 0.0
    lo = int(math.floor(lag))
    frac = lag - lo
    a = float(np.dot(e[:-lo], e[lo:])) if lo > 0 else denom
    b = float(np.dot(e[:-(lo + 1)], e[lo + 1:]))
    return ((1.0 - frac) * a + frac * b) / denom


def _fold_bpm(bpm: float, lo: float = 70.0, hi: float = 180.0) -> float:
    while bpm < lo:
        bpm *= 2.0
    while bpm > hi:
        bpm /= 2.0
    return bpm


def _estimate_tempo(y: np.ndarray, sr: int) -> Tuple[Optional[float], float]:
    """BPM (folded into 70..180, 0.1 resolution) and a 0..1 confidence.

    Log-mel spectral-flux onset envelope at a 256-sample hop (11.6 ms);
    librosa's tempo estimator (log-normal prior around 120 BPM) on the
    time-averaged tempogram, then librosa's dynamic-programming beat tracker
    at that tempo; the tempo is finally refined by a least-squares fit of
    beat position against beat number (sub-frame accurate). Confidence =
    0.65 * pulse clarity (normalised onset autocorrelation at the beat period,
    saturating at 0.5) + 0.35 * beat regularity (1 - residual spread / 15 %).
    """
    import librosa

    hop = 256
    env = _onset_envelope(y, sr, n_fft=1024, hop=hop)
    if env.size < 16 or float(np.std(env)) <= 1e-6:
        return None, 0.0
    fps = sr / float(hop)
    # librosa's tempo estimator on a tempogram averaged chunk by chunk (its
    # one-shot tempogram of a 15-minute envelope needs ~2.7 GB), then the
    # dynamic-programming beat tracker at that tempo.
    tg = _mean_tempogram(env, sr, hop)
    tempo = float(np.atleast_1d(librosa.feature.tempo(tg=tg, sr=sr, hop_length=hop, start_bpm=120.0,
                                                      aggregate=None))[0])
    if not math.isfinite(tempo) or tempo <= 0:
        return None, 0.0
    _, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, bpm=tempo,
                                       units="frames")
    beats = np.asarray(beats, dtype=np.int64)
    refined = _refine_period(beats)
    if refined is not None:
        period, spread = refined
        bpm = 60.0 * fps / period
    else:
        period, spread = 60.0 * fps / tempo, 1.0
        bpm = tempo
    if not math.isfinite(bpm) or bpm <= 0:
        return None, 0.0
    pulse = max(_autocorr_at(env, period), _autocorr_at(env, 2.0 * period))
    clarity = min(1.0, max(0.0, pulse) / 0.5)
    regularity = min(1.0, max(0.0, 1.0 - spread / 0.15))
    confidence = 0.65 * clarity + 0.35 * regularity
    return round(_fold_bpm(bpm), 1), round(float(min(1.0, max(0.0, confidence))), 3)


# ------------------------------------------------------------------------ key
def _key_scores(chroma_profile: np.ndarray) -> np.ndarray:
    """Pearson correlation of a 12-bin profile with all 24 rotated KK profiles.

    Returns shape (2, 12): row 0 major, row 1 minor, column = tonic pitch class.
    """
    scores = np.zeros((2, 12))
    for mode, profile in enumerate((KK_MAJOR, KK_MINOR)):
        for tonic in range(12):
            rotated = np.roll(profile, tonic)
            scores[mode, tonic] = np.corrcoef(chroma_profile, rotated)[0, 1]
    return np.nan_to_num(scores, nan=-1.0)


def _estimate_key(y22: np.ndarray, sr22: int) -> Tuple[Optional[str], Optional[str], float]:
    """Krumhansl-Schmuckler key from CQT chroma.

    Chroma: ``librosa.feature.chroma_cqt`` at 11.025 kHz, C1..B7, 36 bins per
    octave, tuning estimated on (up to) the central 60 s. Each frame is
    normalised to unit sum and weighted by the square root of its energy
    (frames 40 dB below the loudest are ignored), so loud sections count more
    without letting a few very loud frames dominate.

    Confidence = 0.5 * clip(r_best, 0, 1) + 0.5 * clip((r_best - r_second) / 0.15, 0, 1)
    where ``r`` are the profile correlations of the 24 keys.
    """
    import librosa

    y = resample(y22[np.newaxis, :], sr22, _KEY_SR, quality="HQ")[0]
    if y.size < _KEY_SR:  # < 1 s: pad so the low CQT filters fit
        y = np.pad(y, (0, _KEY_SR - y.size))
    centre = y.size // 2
    half = min(y.size, 60 * _KEY_SR) // 2
    excerpt = y[centre - half:centre + half]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        tuning = float(librosa.estimate_tuning(y=excerpt, sr=_KEY_SR, bins_per_octave=36))
        if not math.isfinite(tuning):
            tuning = 0.0
        chroma = librosa.feature.chroma_cqt(
            y=y, sr=_KEY_SR, hop_length=2048, fmin=librosa.note_to_hz("C1"),
            n_octaves=7, bins_per_octave=36, n_chroma=12, tuning=tuning, norm=None)
    energy = chroma.sum(axis=0)
    if energy.size == 0 or float(energy.max()) <= 0:
        return None, None, 0.0
    active = energy > float(energy.max()) * 1e-4  # within 40 dB (power) of the loudest frame
    frames = chroma[:, active] / energy[active]
    profile = (frames * np.sqrt(energy[active])).sum(axis=1)
    if float(profile.std()) <= 1e-12:
        return None, None, 0.0
    scores = _key_scores(profile)
    order = np.argsort(scores.ravel())[::-1]
    best, second = scores.ravel()[order[0]], scores.ravel()[order[1]]
    mode_idx, tonic = divmod(int(order[0]), 12)
    mode = "major" if mode_idx == 0 else "minor"
    confidence = 0.5 * min(1.0, max(0.0, best)) + 0.5 * min(1.0, max(0.0, (best - second) / 0.15))
    return key_name(tonic, mode), camelot_code(tonic, mode), round(float(confidence), 3)


# ------------------------------------------------------------ artifact level
def _detect_cutoff(ltas_db: np.ndarray, freqs: np.ndarray, sr: int) -> Optional[float]:
    """Frequency of a hard band-limit between 11 and 20 kHz, or ``None``."""
    df = freqs[1] - freqs[0] if freqs.size > 1 else 0.0
    if df <= 0:
        return None
    smooth = uniform_filter1d(ltas_db, size=max(1, int(round(100.0 / df))), mode="nearest")
    cumsum = np.concatenate([[0.0], np.cumsum(smooth)])

    def band_mean(f_lo: np.ndarray, f_hi: np.ndarray) -> np.ndarray:
        i0 = np.clip(np.round(f_lo / df).astype(int), 0, smooth.size)
        i1 = np.clip(np.round(f_hi / df).astype(int), 0, smooth.size)
        i1 = np.maximum(i1, i0 + 1)
        i1 = np.minimum(i1, smooth.size)
        return (cumsum[i1] - cumsum[i0]) / np.maximum(i1 - i0, 1)

    f_max = min(20000.0, sr / 2.0 - 600.0)
    if f_max <= 11000.0:
        return None
    cand = freqs[(freqs >= 11000.0) & (freqs <= f_max)]
    if cand.size == 0:
        return None
    below = band_mean(cand - 500.0, cand - 100.0)
    above = band_mean(cand + 100.0, cand + 500.0)
    context = band_mean(cand - 3000.0, cand - 500.0)
    drop = below - above
    program = float(np.max(smooth[: int(np.searchsorted(freqs, 11000.0))])) if freqs[0] < 11000 else -200.0
    ok = (drop > 30.0) & (context > above + 30.0) & (below > program - 70.0) & (below > -110.0)
    if not np.any(ok):
        return None
    idx = int(np.argmax(np.where(ok, drop, -np.inf)))
    # refine: steepest descent of the (lightly smoothed) spectrum near the drop
    centre = cand[idx]
    near = np.flatnonzero((freqs >= centre - 500.0) & (freqs <= centre + 500.0))
    if near.size > 2:
        slope = np.gradient(smooth[near])
        centre = float(freqs[near[int(np.argmin(slope))]])
    return float(round(centre / 10.0) * 10.0)


def _level_roughness(energy: np.ndarray, valid: np.ndarray, lag: int) -> float:
    """Median ``|L[t] - L[t-lag]|`` (dB) of a band level over valid frame pairs."""
    if energy.shape[0] <= lag:
        return float("nan")
    level = 10.0 * np.log10(np.maximum(energy.astype(np.float64), 1e-14))
    diff = np.abs(level[lag:] - level[:-lag])
    mask = valid[lag:] & valid[:-lag]
    if mask.sum() < 20:
        return float("nan")
    return float(np.median(diff[mask]))


def _spectral_flatness(power: np.ndarray) -> np.ndarray:
    """Wiener entropy (geometric / arithmetic mean) of each row of a power spectrum."""
    p = np.maximum(power.astype(np.float64), 1e-30)
    return np.exp(np.mean(np.log(p), axis=-1)) / np.mean(p, axis=-1)


HF_TEXTURE_SR = 44100
HF_TEXTURE_FFT = 4096                 # ~93 ms at 44.1 kHz
HF_TEXTURE_NEIGHBOURHOOD = 21         # bins (~226 Hz)
HF_TEXTURE_BAND_HZ = (4000.0, 16000.0)
HF_TEXTURE_RANGE = (0.58, 0.64)       # local flatness -> s_hfnoise 0..1
HF_TEXTURE_WHITE_NOISE = 0.60         # what Gaussian white noise measures (reference)
_HF_MIN_SHARE = 1e-4                  # frame's 4-16 kHz energy >= -40 dB re its total
_HF_BIN_RANGE = 1e-6                  # bins within 60 dB of the frame's strongest HF bin


def hf_texture(mono: np.ndarray, sr: int, f_top: float = 16000.0,
               max_sampled_frames: int = 3000) -> Optional[float]:
    """Median local spectral flatness of the 4 kHz..``f_top`` band (``None`` if no such content).

    The signal is resampled to 44.1 kHz so the measurement does not depend on
    the source rate. On a Hann STFT (4096 / hop 1024, ~93 ms) every bin's
    *local flatness* is ``exp(mean log P) / mean P`` over its 21-bin
    (~226 Hz) neighbourhood. Gaussian noise measures 0.60 whatever its level
    or colour; tonal / modal fine structure (partials, cymbal modes) pulls it
    down, temporally compact energy pushes it up. Only frames at or above the
    median frame energy whose 4-16 kHz share is >= -40 dB count, and in each
    only bins within 60 dB of the frame's strongest high-band bin.
    """
    y = np.asarray(mono, dtype=np.float32)
    if sr != HF_TEXTURE_SR:
        y = resample(y[np.newaxis, :], sr, HF_TEXTURE_SR, quality="HQ")[0]
    n_fft = HF_TEXTURE_FFT
    grid = FrameGrid(y.shape[0], n_fft, n_fft // 4, window=hann(n_fft))
    if grid.n_frames < 4:
        return None
    freqs = grid.bin_frequencies(HF_TEXTURE_SR)
    f_top = min(float(f_top), HF_TEXTURE_BAND_HZ[1], 0.9 * HF_TEXTURE_SR / 2.0)
    band = (freqs >= HF_TEXTURE_BAND_HZ[0]) & (freqs < f_top)
    if np.count_nonzero(band) < 2 * HF_TEXTURE_NEIGHBOURHOOD:
        return None
    idx = np.arange(grid.n_frames)
    if idx.size > max_sampled_frames:
        idx = np.linspace(0, grid.n_frames - 1, max_sampled_frames).round().astype(np.int64)
    values: List[np.ndarray] = []
    energies: List[np.ndarray] = []
    rows: List[np.ndarray] = []
    for start in range(0, idx.size, 512):
        sel = idx[start:start + 512]
        spec = grid.analyze_indices(y, sel)
        power = spec.real.astype(np.float64) ** 2 + spec.imag.astype(np.float64) ** 2
        total = power.sum(axis=1)
        hf_power = power[:, band]
        ok = (total > 1e-12) & (hf_power.sum(axis=1) >= _HF_MIN_SHARE * total)
        energies.append(total)
        if not np.any(ok):
            rows.append(np.zeros(0, dtype=np.int64))
            continue
        hp = hf_power[ok] + 1e-30
        log_mean = uniform_filter1d(np.log(hp), HF_TEXTURE_NEIGHBOURHOOD, axis=1, mode="nearest")
        mean = uniform_filter1d(hp, HF_TEXTURE_NEIGHBOURHOOD, axis=1, mode="nearest")
        flat = np.exp(log_mean) / mean
        keep = mean >= _HF_BIN_RANGE * mean.max(axis=1, keepdims=True)
        flat[~keep] = np.nan
        values.append(flat)
        rows.append(np.flatnonzero(ok) + start)
    total = np.concatenate(energies)
    active = total > 1e-12
    if not np.any(active):
        return None
    loud_threshold = float(np.median(total[active]))
    picked = []
    for flat, row in zip(values, [r for r in rows if r.size]):
        loud = total[row] >= loud_threshold
        if np.any(loud):
            picked.append(flat[loud].ravel())
    if not picked:
        return None
    allv = np.concatenate(picked)
    allv = allv[np.isfinite(allv)]
    if allv.size < 100:
        return None
    return float(np.median(allv))


def artifact_features(mono: np.ndarray, sr: int, max_sampled_frames: int = 3000) -> Dict[str, Optional[float]]:
    """Measurements and sub-scores behind ``artifact_level`` (see the module docstring)."""
    n_fft = scaled_fft_size(1024, sr)
    hop = n_fft // 4
    grid = FrameGrid(mono.shape[0], n_fft, hop, window=hann(n_fft))
    freqs = grid.bin_frequencies(sr)
    # mean-square normalisation: sum over the one-sided spectrum = frame mean square
    weights = np.full(grid.n_bins, 2.0, dtype=np.float32)
    weights[0] = 1.0
    if n_fft % 2 == 0:
        weights[-1] = 1.0
    weights /= float(n_fft * np.sum(grid.window64 ** 2))
    band_edges_hz = np.arange(0.0, sr / 2.0 + 1.0, 1000.0)
    band_bins = np.searchsorted(freqs, band_edges_hz)
    band_bins = np.unique(np.clip(band_bins, 0, grid.n_bins))
    band_lo_hz = freqs[band_bins[:-1]]
    band_hi_hz = np.append(freqs[band_bins[1:-1]], sr / 2.0)
    n_bands = band_bins.size - 1

    frame_ms = np.zeros(grid.n_frames, dtype=np.float64)
    bands = np.zeros((grid.n_frames, n_bands), dtype=np.float32)
    ltas = np.zeros(grid.n_bins, dtype=np.float64)
    ltas_count = 0
    stride = max(1, -(-grid.n_frames // max_sampled_frames))
    sampled_idx: List[int] = []
    sampled_power: List[np.ndarray] = []
    done = 0
    for blk in grid.blocks(2048):
        start = max(blk.m0, done)
        if start >= blk.m1:
            continue
        spec = grid.analyze(mono, start, blk.m1)
        power = (spec.real ** 2 + spec.imag ** 2) * weights
        frame_ms[start:blk.m1] = power.sum(axis=1)
        bands[start:blk.m1] = np.add.reduceat(power, band_bins[:-1], axis=1)[:, :n_bands]
        audible = power.sum(axis=1) > 1e-10
        if np.any(audible):
            ltas += power[audible].sum(axis=0)
            ltas_count += int(audible.sum())
        first = -(-start // stride) * stride
        rows = np.arange(first, blk.m1, stride)
        if rows.size:
            sampled_idx.extend(rows.tolist())
            sampled_power.append(power[rows - start])
        done = blk.m1

    out: Dict[str, Optional[float]] = {
        "hf_flatness": None, "flicker_db": None, "noise_floor_db": None, "program_db": None,
        "floor_flatness": None, "cutoff_hz": None, "s_hfnoise": 0.0, "s_flicker": 0.0, "s_noise": 0.0,
    }
    if ltas_count == 0:
        return out
    ltas_db = 10.0 * np.log10(ltas / ltas_count + 1e-20)
    cutoff = _detect_cutoff(ltas_db, freqs, sr)
    out["cutoff_hz"] = cutoff
    f_hi = min(16000.0, 0.9 * sr / 2.0)
    if cutoff is not None:
        f_hi = min(f_hi, cutoff - 500.0)

    # (a) high-band texture: how noise-like the 4-16 kHz fine structure is
    hf_flat = hf_texture(mono, sr, f_top=f_hi, max_sampled_frames=max_sampled_frames)
    s_hfnoise = 0.0
    if hf_flat is not None:
        out["hf_flatness"] = round(hf_flat, 4)
        lo, hi = HF_TEXTURE_RANGE
        s_hfnoise = min(1.0, max(0.0, (hf_flat - lo) / (hi - lo)))

    # (c) static noise floor: level of the quietest frames, how far it sits
    # below the programme and whether those quiet frames are noise-like.
    level_db = np.maximum(10.0 * np.log10(np.maximum(frame_ms, 1e-12)), SILENCE_FLOOR_DB)
    floor_db = float(np.percentile(level_db, 5))
    program_db = float(np.percentile(level_db, 95))
    out["noise_floor_db"] = round(floor_db, 2)
    out["program_db"] = round(program_db, 2)
    flatness = 0.0
    if sampled_power:
        sp = np.concatenate(sampled_power, axis=0)
        sp_level = level_db[np.asarray(sampled_idx)]
        quiet = (sp_level <= np.percentile(level_db, 10) + 1.0) & (sp_level > -100.0)
        flat_bins = (freqs >= 1000.0) & (freqs <= max(f_hi, 2000.0))
        if np.any(quiet) and np.count_nonzero(flat_bins) >= 8:
            flatness = float(np.median(_spectral_flatness(sp[quiet][:, flat_bins])))
            out["floor_flatness"] = round(flatness, 4)
    s_noise = (min(1.0, max(0.0, (floor_db + 75.0) / 25.0))
               * min(1.0, max(0.0, (program_db - floor_db - 12.0) / 12.0))
               * min(1.0, max(0.0, (flatness - 0.15) / 0.25)))

    # (b) high-band flicker relative to the mid band (frames one window apart)
    hi_sel = (band_lo_hz >= 7000.0) & (band_hi_hz <= f_hi + 1e-6)
    mid_sel = (band_lo_hz >= 1000.0) & (band_hi_hz <= 4000.0 + 1e-6)
    s_flicker = 0.0
    if np.any(hi_sel) and np.any(mid_sel):
        hi_energy = bands[:, hi_sel].sum(axis=1)
        mid_energy = bands[:, mid_sel].sum(axis=1)
        valid = ((hi_energy > 1e-9) & (mid_energy > 1e-9)
                 & (hi_energy > hi_energy.max() * 1e-6) & (mid_energy > mid_energy.max() * 1e-6))
        r_hi = _level_roughness(hi_energy, valid, grid.overlap)
        r_mid = _level_roughness(mid_energy, valid, grid.overlap)
        if math.isfinite(r_hi) and math.isfinite(r_mid):
            flicker = r_hi - r_mid
            out["flicker_db"] = round(flicker, 3)
            s_flicker = min(1.0, max(0.0, (flicker - 1.5) / 2.5))

    out.update(s_hfnoise=round(s_hfnoise, 4), s_flicker=round(s_flicker, 4), s_noise=round(s_noise, 4))
    return out


ARTIFACT_WEIGHTS = {"s_hfnoise": 1.0, "s_flicker": 0.85, "s_noise": 0.60}


def artifact_level_from_features(feats: Dict[str, Optional[float]]) -> float:
    """``1 - prod(1 - w_k * s_k)`` over the sub-scores in :data:`ARTIFACT_WEIGHTS` (0..1)."""
    keep = 1.0
    for key, weight in ARTIFACT_WEIGHTS.items():
        value = feats.get(key) or 0.0
        keep *= 1.0 - weight * min(1.0, max(0.0, float(value)))
    return float(min(1.0, max(0.0, 1.0 - keep)))


def artifact_label(level: float) -> str:
    """``low`` < 0.33 <= ``moderate`` < 0.66 <= ``high``."""
    if level < 0.33:
        return "low"
    if level < 0.66:
        return "moderate"
    return "high"


# ------------------------------------------------------------------- public
def analyze(x: np.ndarray, sr: int) -> dict:
    """Analyse a whole track ``(c, n)`` at sample rate ``sr``.

    Returns a dict with exactly the keys ``bpm``, ``bpm_confidence``, ``key``,
    ``camelot``, ``key_confidence``, ``loudness_lufs``, ``peak_dbfs``,
    ``artifact_level``, ``artifact_label`` and ``spectral_cutoff_hz``.
    Silent input yields ``None`` for tempo, key, loudness and cut-off.
    Each estimator fails soft: an unexpected error is logged and its fields
    take their "unknown" value instead of failing the job.
    """
    arr = _as_2d(x)
    sr = int(sr)
    if sr <= 0:
        raise ValueError("sample rate must be positive")
    peak_dbfs = _amp_db(_peak_abs(arr))
    result = {
        "bpm": None, "bpm_confidence": 0.0,
        "key": None, "camelot": None, "key_confidence": 0.0,
        "loudness_lufs": None, "peak_dbfs": round(peak_dbfs, 2),
        "artifact_level": 0.0, "artifact_label": "low",
        "spectral_cutoff_hz": None,
    }
    if arr.shape[1] == 0 or peak_dbfs <= _SILENT_PEAK_DB:
        return result

    try:
        lufs = _integrated_loudness(arr, sr)
        result["loudness_lufs"] = None if lufs is None else round(lufs, 2)
    except Exception:  # noqa: BLE001 - analysis must not fail the job
        log.exception("loudness measurement failed")

    mono = _mono(arr)
    try:
        y22 = resample(mono[np.newaxis, :], sr, _ANALYSIS_SR, quality="HQ")[0]
    except Exception:  # noqa: BLE001
        log.exception("resampling for analysis failed")
        y22 = None
    if y22 is not None:
        try:
            bpm, bpm_conf = _estimate_tempo(y22, _ANALYSIS_SR)
            result["bpm"], result["bpm_confidence"] = bpm, bpm_conf
        except Exception:  # noqa: BLE001
            log.exception("tempo estimation failed")
        try:
            key, camelot, key_conf = _estimate_key(y22, _ANALYSIS_SR)
            result["key"], result["camelot"], result["key_confidence"] = key, camelot, key_conf
        except Exception:  # noqa: BLE001
            log.exception("key estimation failed")
    try:
        feats = artifact_features(mono, sr)
        result["artifact_level"] = round(artifact_level_from_features(feats), 3)
        result["artifact_label"] = artifact_label(result["artifact_level"])
        result["spectral_cutoff_hz"] = feats["cutoff_hz"]
    except Exception:  # noqa: BLE001
        log.exception("artifact analysis failed")
    return result


def stem_stats(x: np.ndarray, sr: int) -> dict:
    """Per-stem statistics for the manifest.

    * ``peak_dbfs`` — sample peak, floored at -120 dB.
    * ``rms_dbfs`` — RMS over all channels and samples, floored at -120 dB.
    * ``active_ratio`` — fraction of 50 ms windows whose RMS (over channels)
      is above ``max(-60 dBFS, peak_dbfs - 50 dB)``.
    * ``waveform`` — exactly 256 floats in 0..1: the peak absolute sample
      (max over channels, linear) of each of 256 equal time buckets.
    """
    arr = _as_2d(x)
    n = arr.shape[1]
    if n == 0:
        return {"peak_dbfs": SILENCE_FLOOR_DB, "rms_dbfs": SILENCE_FLOOR_DB,
                "active_ratio": 0.0, "waveform": [0.0] * 256}
    win = max(1, int(round(0.05 * sr)))
    n_win = -(-n // win)
    win_sq = np.zeros(n_win, dtype=np.float64)
    env = np.empty(n, dtype=np.float32)
    total_sq = 0.0
    chunk = win * 256
    for start in range(0, n, chunk):
        block = arr[:, start:start + chunk]
        env[start:start + block.shape[1]] = np.max(np.abs(block), axis=0)
        sq = np.square(block, dtype=np.float64).sum(axis=0)
        total_sq += float(sq.sum())
        first = start // win
        sums = np.add.reduceat(sq, np.arange(0, sq.size, win))
        win_sq[first:first + sums.size] += sums
    peak = float(env.max())
    peak_db = _amp_db(peak)
    rms_db = _amp_db(math.sqrt(total_sq / (n * arr.shape[0])))
    lengths = np.full(n_win, win, dtype=np.float64)
    lengths[-1] = n - win * (n_win - 1)
    win_rms_db = 10.0 * np.log10(np.maximum(win_sq / (lengths * arr.shape[0]), 1e-30))
    threshold = max(-60.0, peak_db - 50.0)
    active = float(np.mean(win_rms_db > threshold)) if peak > 0 else 0.0
    edges = np.linspace(0, n, 257).astype(np.int64)
    starts = np.minimum(edges[:-1], n - 1)
    waveform = np.maximum.reduceat(env, starts)
    waveform = np.clip(np.nan_to_num(waveform), 0.0, 1.0)
    return {
        "peak_dbfs": round(peak_db, 2),
        "rms_dbfs": round(rms_db, 2),
        "active_ratio": round(active, 4),
        "waveform": [round(float(v), 4) for v in waveform],
    }


__all__: List[str] = [
    "analyze", "stem_stats", "artifact_features", "artifact_label", "artifact_level_from_features",
    "hf_texture",
    "camelot_code", "key_name", "KEY_TO_CAMELOT",
]
