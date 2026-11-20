"""Tests for stem_master.dsp.denoise (DC/rumble, noise floor, high-band de-flicker)."""

from __future__ import annotations

import numpy as np
import pytest
from scipy import signal

from stem_master.dsp.denoise import denoise_dsp

SR = 44100
HARMONICS = 8
F0 = 220.0


def _db(x) -> float:
    return 10 * np.log10(np.mean(np.asarray(x, dtype=np.float64) ** 2) + 1e-30)


def _tone(seconds: float = 4.0, channels: int = 2, amp: float = 0.1) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    y = sum(np.sin(2 * np.pi * F0 * k * t + 0.4 * k) / k for k in range(1, HARMONICS + 1))
    return np.tile((amp * y).astype(np.float32), (channels, 1))


def _spectrum(x: np.ndarray):
    seg = x[0, SR:3 * SR].astype(np.float64)
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size))) ** 2
    return np.fft.rfftfreq(seg.size, 1 / SR), spec


def _tone_mask(f: np.ndarray) -> np.ndarray:
    mask = np.zeros_like(f, dtype=bool)
    for k in range(1, HARMONICS + 1):
        mask |= np.abs(f - F0 * k) < 15.0
    return mask


@pytest.mark.parametrize("strength", ["light", "standard", "strong"])
def test_clean_tone_is_left_alone(strength):
    x = _tone()
    clean, removed = denoise_dsp(x, SR, strength)
    assert clean.shape == x.shape and clean.dtype == np.float32
    assert abs(_db(clean) - _db(x)) < 0.5
    core = slice(SR // 2, -SR // 2)
    assert _db(removed[:, core]) - _db(x[:, core]) < -40.0     # practically nothing removed
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


def test_noisy_tone_noise_floor_reduced():
    x = _tone()
    rng = np.random.default_rng(0)
    noise = rng.standard_normal(x.shape) * np.sqrt(np.mean(x.astype(np.float64) ** 2)) / 10.0  # SNR 20 dB
    noisy = (x + noise).astype(np.float32)
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


def test_strength_ordering():
    x = _tone()
    rng = np.random.default_rng(1)
    noisy = (x + rng.standard_normal(x.shape) * 0.003).astype(np.float32)
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


def _shimmer(seconds: float, seed: int, spike_db: float = 10.0, fraction: float = 0.1,
             segment_ms: float = 12.0) -> np.ndarray:
    """Steady 8-14 kHz noise bed whose level jumps up by ``spike_db`` in random
    ~12 ms segments: a codec-style high-band "shimmer"."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    sos = signal.butter(8, [8000, 14000], btype="band", fs=SR, output="sos")
    hf = signal.sosfilt(sos, rng.standard_normal(n))
    hf *= 0.01 / np.sqrt(np.mean(hf ** 2))
    seg = int(segment_ms / 1000 * SR)
    gains = np.where(rng.random(-(-n // seg)) < fraction, 10 ** (spike_db / 20), 1.0)
    return hf * np.repeat(gains, seg)[:n]


def _hf_prominence(x: np.ndarray) -> float:
    """How far the 8-14 kHz band level peaks above its median (95th - 50th percentile, dB)."""
    f, _, z = signal.stft(x[0], fs=SR, nperseg=512, noverlap=384)
    band = (f >= 8000) & (f <= 14000)
    level = 10 * np.log10((np.abs(z[band]) ** 2).sum(axis=0) + 1e-20)[4:-4]
    return float(np.percentile(level, 95) - np.percentile(level, 50))


@pytest.mark.parametrize("strength,min_reduction_db", [("light", 1.0), ("standard", 2.0), ("strong", 3.0)])
def test_high_band_flicker_is_reduced(strength, min_reduction_db):
    x = (_tone(seconds=4.0, channels=1)[0] + _shimmer(4.0, 7)).astype(np.float32)[np.newaxis]
    clean, removed = denoise_dsp(x, SR, strength)
    assert _hf_prominence(x) - _hf_prominence(clean) >= min_reduction_db
    # the tone underneath is untouched
    f, before = _spectrum(x)
    _, after = _spectrum(clean)
    tone = _tone_mask(f)
    assert abs(10 * np.log10(after[tone].sum() / before[tone].sum())) < 0.5
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


def test_transients_survive_deflicker():
    """Hi-hat-like bursts on a quiet steady bed: onset protection keeps attack and early decay."""
    n = SR * 4
    rng = np.random.default_rng(4)
    sos = signal.butter(4, 7000, btype="highpass", fs=SR, output="sos")
    x = 0.002 * signal.sosfilt(sos, rng.standard_normal(n))
    burst_len = int(0.08 * SR)
    env = np.exp(-np.arange(burst_len) / (0.02 * SR))
    starts = list(range(int(0.25 * SR), n - burst_len, int(0.25 * SR)))
    for s in starts:
        x[s:s + burst_len] += 0.5 * env * signal.sosfilt(sos, rng.standard_normal(burst_len))
    x = x.astype(np.float32)[np.newaxis]
    for strength in ("light", "strong"):
        clean, _ = denoise_dsp(x, SR, strength)
        for s in starts[1:-1]:
            attack = slice(s, s + int(0.005 * SR))
            decay = slice(s + int(0.01 * SR), s + int(0.05 * SR))
            assert _db(x[:, attack]) - _db(clean[:, attack]) < 1.0
            assert _db(x[:, decay]) - _db(clean[:, decay]) < 1.0


def test_block_processing_is_exact():
    """Block-wise processing (DD state carried, de-flicker context) equals one big block."""
    x = (_tone(seconds=3.0, channels=2) + np.random.default_rng(3).standard_normal((2, 3 * SR)) * 0.003
         + _shimmer(3.0, 5)[np.newaxis]).astype(np.float32)
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
    empty = np.zeros((2, 0), dtype=np.float32)
    assert denoise_dsp(empty, SR, "light")[0].shape == (2, 0)
    with pytest.raises(ValueError):
        denoise_dsp(x, SR, "max")


def test_48k_input():
    sr = 48000
    t = np.arange(sr * 3) / sr
    rng = np.random.default_rng(2)
    tone = 0.1 * np.sin(2 * np.pi * 440 * t)
    noisy = np.stack([tone, tone]) + rng.standard_normal((2, t.size)) * 0.003
    clean, removed = denoise_dsp(noisy.astype(np.float32), sr, "standard")
    assert _db(removed) > _db(noisy) - 30.0                         # the noise went somewhere
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
