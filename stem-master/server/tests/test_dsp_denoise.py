"""Tests for stem_master.dsp.denoise (DC/rumble, adaptive noise floor, adaptive de-flicker).

The fixtures are small synthetic signals; the real-data evaluation (clean
MUSDB18 stems, degraded stems, Udio stems) lives in tools/eval_denoise.py.
"""

from __future__ import annotations

import numpy as np
import pytest
from scipy import signal

from stem_master.dsp.denoise import DENOISE_PARAMS, _dc_and_rumble, denoise_dsp, flicker_beta, measure_artifacts

SR = 44100
HARMONICS = 8
F0 = 220.0


def _db(x) -> float:
    return 10 * np.log10(np.mean(np.asarray(x, dtype=np.float64) ** 2) + 1e-30)


def _tone(seconds: float = 4.0, channels: int = 2, amp: float = 0.1) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    y = sum(np.sin(2 * np.pi * F0 * k * t + 0.4 * k) / k for k in range(1, HARMONICS + 1))
    return np.tile((amp * y).astype(np.float32), (channels, 1))


def _notes(seconds: float = 6.0, channels: int = 2, seed: int = 0) -> np.ndarray:
    """Plucked harmonic notes (exponential decays, gaps between them): a bass/keys-like stem."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    out = np.zeros(n)
    t0 = 0
    while t0 < n:
        f = 110.0 * 2 ** (rng.integers(0, 12) / 12)
        dur = int(rng.uniform(0.25, 0.6) * SR)
        t = np.arange(min(dur, n - t0)) / SR
        env = np.exp(-t / 0.12) * np.minimum(1.0, t / 0.003)
        out[t0:t0 + t.size] += 0.3 * env * sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9) if f * k < 6000)
        t0 += dur + int(rng.uniform(0.05, 0.3) * SR)
    return np.tile(out.astype(np.float32), (channels, 1))


def _white(shape, level_db_re: float, ref: np.ndarray, seed: int) -> np.ndarray:
    noise = np.random.default_rng(seed).standard_normal(shape)
    return noise * 10 ** ((_db(ref) + level_db_re) / 20) / np.sqrt(np.mean(noise ** 2))


def _band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Brick-wall band-pass (FFT): a coder band has sharp edges."""
    spec = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(x.shape[-1], 1 / SR)
    spec[..., (f < lo) | (f >= hi)] = 0.0
    return np.fft.irfft(spec, n=x.shape[-1], axis=-1)


def _spectrum(x: np.ndarray):
    seg = x[0, SR:3 * SR].astype(np.float64)
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size))) ** 2
    return np.fft.rfftfreq(seg.size, 1 / SR), spec


def _tone_mask(f: np.ndarray) -> np.ndarray:
    mask = np.zeros_like(f, dtype=bool)
    for k in range(1, HARMONICS + 1):
        mask |= np.abs(f - F0 * k) < 15.0
    return mask


# ------------------------------------------------------------- clean input
@pytest.mark.parametrize("strength", ["light", "standard", "strong"])
def test_clean_tone_is_left_alone(strength):
    x = _tone()
    clean, removed = denoise_dsp(x, SR, strength)
    assert clean.shape == x.shape and clean.dtype == np.float32
    assert abs(_db(clean) - _db(x)) < 0.5
    core = slice(SR // 2, -SR // 2)
    assert _db(removed[:, core]) - _db(x[:, core]) < -40.0     # practically nothing removed
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


@pytest.mark.parametrize("strength", ["light", "standard", "strong"])
def test_dense_noise_like_music_is_not_mistaken_for_noise(strength):
    """A loud, stationary, noise-like texture (a pad / distorted-guitar wash) is the
    body of the stem, not a floor under it: nothing may be taken out of it."""
    rng = np.random.default_rng(11)
    n = SR * 6
    sos = signal.butter(4, [200, 6000], btype="band", fs=SR, output="sos")
    wash = signal.sosfilt(sos, rng.standard_normal((2, n)), axis=-1)
    t = np.arange(n) / SR
    wash *= 0.05 * (1.0 + 0.3 * np.sin(2 * np.pi * 0.25 * t))
    x = wash.astype(np.float32)
    clean, removed = denoise_dsp(x, SR, strength)
    assert _db(x) - _db(clean) < 0.05
    body = signal.butter(4, [300, 4000], btype="band", fs=SR, output="sos")
    assert _db(signal.sosfiltfilt(body, removed, axis=-1)) - _db(x) < -40.0
    # at most the filter skirts far above the body read as a (-50 dB) floor
    found = measure_artifacts(x, SR)["noise_db"]
    assert found is None or found < -50.0
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


# --------------------------------------------------------------- noise floor
def test_noise_floor_under_a_tone_is_reduced():
    x = _tone()
    noisy = (x + _white(x.shape, -35.0, x, 0)).astype(np.float32)        # a floor 35 dB down
    clean, removed = denoise_dsp(noisy, SR, "standard")
    f, before = _spectrum(noisy)
    _, after = _spectrum(clean)
    tone = _tone_mask(f)
    floor_bins = ~tone & (f > 100.0) & (f < 20000.0)
    reduction = 10 * np.log10(before[floor_bins].mean() / after[floor_bins].mean())
    assert reduction >= 6.0
    tone_change = 10 * np.log10(after[tone].sum() / before[tone].sum())
    assert abs(tone_change) < 0.5
    np.testing.assert_allclose(clean + removed, noisy, atol=1e-6)


def test_noise_between_notes_is_measured_and_reduced():
    x = _notes()
    noise = _white(x.shape, -40.0, x, 1)
    noisy = (x + noise).astype(np.float32)
    found = measure_artifacts(noisy, SR)
    assert found["noise_db"] is not None and abs(found["noise_db"] + 40.0) < 5.0
    assert measure_artifacts(x, SR)["noise_db"] is None
    ref = _dc_and_rumble(x, SR).astype(np.float64)       # stage 1 is not noise reduction
    for strength, min_gain in (("light", 3.0), ("standard", 4.0), ("strong", 4.0)):
        clean, _ = denoise_dsp(noisy, SR, strength)
        snr_gain = _db(noise) - _db(clean.astype(np.float64) - ref)
        assert snr_gain >= min_gain, strength


def test_strength_ordering():
    x = _tone()
    noisy = (x + _white(x.shape, -35.0, x, 2)).astype(np.float32)
    removed_db = [_db(denoise_dsp(noisy, SR, s)[1]) for s in ("light", "standard", "strong")]
    assert removed_db[0] < removed_db[1] < removed_db[2]


def test_dc_and_rumble_removed():
    x = _tone(seconds=4.0, channels=1)
    t = np.arange(x.shape[1]) / SR
    dirty = (x + 0.05 + 0.05 * np.sin(2 * np.pi * 5.0 * t)).astype(np.float32)
    clean, removed = denoise_dsp(dirty, SR, "light")
    core = slice(SR, 3 * SR)
    assert abs(float(np.mean(clean[0, core]))) < 1e-3
    seg = clean[0, core].astype(np.float64)
    f = np.fft.rfftfreq(seg.size, 1 / SR)
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size)))
    ref = np.abs(np.fft.rfft(dirty[0, core].astype(np.float64) * np.hanning(seg.size)))
    rumble = np.abs(f - 5.0) < 1.0
    assert 20 * np.log10(ref[rumble].max() / spec[rumble].max()) > 30.0
    np.testing.assert_allclose(clean + removed, dirty, atol=1e-6)


def test_abrupt_start_and_end_are_kept():
    """A stem that starts / ends at full level (an excerpt, or a song with no
    fade) keeps its edges: the rumble filter must not pull them to zero."""
    t = np.arange(SR * 2) / SR
    x = (0.5 * np.cos(2 * np.pi * 330.0 * t)).astype(np.float32)[np.newaxis]   # x[0] = 0.5
    clean, removed = denoise_dsp(x, SR, "standard")
    edge = int(0.1 * SR)
    for part in (slice(0, edge), slice(-edge, None)):
        assert _db(removed[:, part]) - _db(x[:, part]) < -30.0
    assert abs(float(clean[0, 0]) - 0.5) < 0.02


def test_sub_bass_is_kept():
    """The rumble filter sits at 16 Hz: a 40 Hz sub-bass loses well under 0.1 dB."""
    t = np.arange(SR * 3) / SR
    x = (0.3 * np.sin(2 * np.pi * 40.0 * t)).astype(np.float32)[np.newaxis]
    clean, _ = denoise_dsp(x, SR, "strong")
    core = slice(SR // 2, -SR // 2)
    assert abs(_db(clean[:, core]) - _db(x[:, core])) < 0.1


# ---------------------------------------------------------------- de-flicker
def _shimmer(seconds: float, seed: int, spike_db: float = 10.0, fraction: float = 0.1,
             segment_ms: float = 12.0) -> np.ndarray:
    """Steady 8-14 kHz noise bed whose level jumps up by ``spike_db`` in random
    ~12 ms segments: a codec-style high-band "shimmer"."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    hf = _band(rng.standard_normal(n), 8000.0, 14000.0)
    hf *= 0.01 / np.sqrt(np.mean(hf ** 2))
    seg = int(segment_ms / 1000 * SR)
    gains = np.where(rng.random(-(-n // seg)) < fraction, 10 ** (spike_db / 20), 1.0)
    return _band(hf * np.repeat(gains, seg)[:n], 7500.0, 15000.0)


def _hf_prominence(x: np.ndarray) -> float:
    """How far the 8-14 kHz band level peaks above its median (95th - 50th percentile, dB)."""
    f, _, z = signal.stft(x[0], fs=SR, nperseg=512, noverlap=384)
    band = (f >= 8000) & (f <= 14000)
    level = 10 * np.log10((np.abs(z[band]) ** 2).sum(axis=0) + 1e-20)[4:-4]
    return float(np.percentile(level, 95) - np.percentile(level, 50))


@pytest.mark.parametrize("strength,min_reduction_db", [("light", 1.0), ("standard", 2.0), ("strong", 3.0)])
def test_high_band_flicker_is_reduced(strength, min_reduction_db):
    x = (_tone(seconds=4.0, channels=1)[0] + _shimmer(4.0, 7)).astype(np.float32)[np.newaxis]
    assert measure_artifacts(x, SR)["flicker_beta"][strength] > 0.5
    clean, removed = denoise_dsp(x, SR, strength)
    assert _hf_prominence(x) - _hf_prominence(clean) >= min_reduction_db
    # the tone underneath is untouched
    f, before = _spectrum(x)
    _, after = _spectrum(clean)
    tone = _tone_mask(f)
    assert abs(10 * np.log10(after[tone].sum() / before[tone].sum())) < 0.5
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


def _hats(seconds: float = 4.0, seed: int = 4, period_s: float = 0.125, bed: float = 0.002,
          brickwall: bool = False) -> np.ndarray:
    n = int(SR * seconds)
    rng = np.random.default_rng(seed)
    sos = signal.butter(4, 7000, btype="highpass", fs=SR, output="sos")
    x = bed * signal.sosfilt(sos, rng.standard_normal(n))
    burst_len = int(0.08 * SR)
    env = np.exp(-np.arange(burst_len) / (0.02 * SR))
    starts = list(range(int(period_s * SR), n - burst_len, int(period_s * SR)))
    for s in starts:
        x[s:s + burst_len] += 0.5 * env * signal.sosfilt(sos, rng.standard_normal(burst_len))
    if brickwall:   # nothing below 8 kHz: no onset in the reference band to protect them
        x = _band(x, 8000.0, 20000.0)
    return x.astype(np.float32)[np.newaxis], starts


def test_transients_survive_deflicker():
    """Hi-hat-like bursts on a quiet steady bed: attack and early decay survive."""
    x, starts = _hats()
    for strength in ("light", "strong"):
        clean, _ = denoise_dsp(x, SR, strength)
        for s in starts[1:-1]:
            attack = slice(s, s + int(0.005 * SR))
            decay = slice(s + int(0.01 * SR), s + int(0.05 * SR))
            assert _db(x[:, attack]) - _db(clean[:, attack]) < 1.0
            assert _db(x[:, decay]) - _db(clean[:, decay]) < 1.0


def test_groove_is_not_flicker():
    """High-band bursts on a beat grid (a hi-hat pattern with no low-band
    onset) are music: the periodicity guard keeps de-flicker off."""
    x, _ = _hats(period_s=0.25, bed=0.01, brickwall=True)
    found = measure_artifacts(x, SR)
    assert found["flicker_db"] > DENOISE_PARAMS["light"].flicker_f0_db       # looks like flicker ...
    assert found["flicker_periodicity"] > 0.35                                # ... but recurs on the beat
    assert all(v == 0.0 for v in found["flicker_beta"].values())
    clean, _ = denoise_dsp(x, SR, "strong")
    assert _db(x) - _db(clean) < 0.05


def test_flicker_beta_scaling():
    p = DENOISE_PARAMS["standard"]
    assert flicker_beta(None, p) == 0.0
    assert flicker_beta(p.flicker_f0_db, p) == 0.0
    assert flicker_beta(p.flicker_f0_db + 1.0, p) == 1.0
    assert flicker_beta(p.flicker_f0_db + 1.0, p, periodicity=0.5) == 0.0
    assert 0.0 < flicker_beta(p.flicker_f0_db + 1.0, p, periodicity=0.17) < 1.0


# ------------------------------------------------------------------ plumbing
def test_block_processing_is_exact():
    """Block-wise processing (DD state carried, de-flicker levels) equals one big block."""
    x = (_tone(seconds=3.0, channels=2) + _white((2, 3 * SR), -35.0, _tone(seconds=3.0), 3)
         + _shimmer(3.0, 5)[np.newaxis]).astype(np.float32)
    assert measure_artifacts(x, SR)["noise_db"] is not None
    ref, _ = denoise_dsp(x, SR, "standard", block_frames=100000)
    small, _ = denoise_dsp(x, SR, "standard", block_frames=40)
    assert np.max(np.abs(ref - small)) < 1e-6


@pytest.mark.parametrize("sr", [8000, 44100, 96000])
@pytest.mark.parametrize("n", [1, 100, 1000, 5000])
def test_very_short_inputs(sr, n):
    x = (np.random.default_rng(n).standard_normal((2, n)) * 0.1).astype(np.float32)
    clean, removed = denoise_dsp(x, sr, "strong")
    assert clean.shape == x.shape
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


def test_shapes_and_validation():
    x = _tone(seconds=1.0, channels=1)
    clean, removed = denoise_dsp(x[0], SR, "standard")             # 1-D input -> (1, n)
    assert clean.shape == (1, x.shape[1]) and removed.shape == (1, x.shape[1])
    silent = np.zeros((2, SR), dtype=np.float32)
    clean, removed = denoise_dsp(silent, SR, "strong")
    assert not np.any(clean) and not np.any(removed)
    assert measure_artifacts(silent, SR)["noise_db"] is None
    empty = np.zeros((2, 0), dtype=np.float32)
    assert denoise_dsp(empty, SR, "light")[0].shape == (2, 0)
    with pytest.raises(ValueError):
        denoise_dsp(x, SR, "max")


def test_48k_input():
    sr = 48000
    t = np.arange(sr * 3) / sr
    tone = 0.1 * np.sin(2 * np.pi * 440 * t)
    noise = np.random.default_rng(2).standard_normal((2, t.size)) * 0.0007        # ~ -40 dB re the tone
    noisy = np.stack([tone, tone]) + noise
    clean, removed = denoise_dsp(noisy.astype(np.float32), sr, "standard")
    core = slice(sr // 2, -sr // 2)                                                # away from filter edges
    assert _db(clean[:, core].astype(np.float64) - tone[core]) < _db(noise[:, core]) - 6.0   # most noise went
    assert abs(_db(clean) - _db(tone)) < 0.5


@pytest.mark.parametrize("width,stride", [(7, 1), (7, 4), (5, 2)])
def test_temporal_median_matches_numpy(width, stride):
    from numpy.lib.stride_tricks import sliding_window_view

    from stem_master.dsp.denoise import _temporal_median

    rng = np.random.default_rng(width * 10 + stride)
    a = rng.random((2, 200, 31)).astype(np.float32)
    a[:, ::5] = np.round(a[:, ::5], 1)          # include ties
    pad = (width // 2) * stride
    padded = np.pad(a, ((0, 0), (pad, pad), (0, 0)), mode="edge")
    ref = np.median(sliding_window_view(padded, 2 * pad + 1, axis=1)[..., ::stride], axis=-1)
    np.testing.assert_array_equal(_temporal_median(a, width, stride), ref)
