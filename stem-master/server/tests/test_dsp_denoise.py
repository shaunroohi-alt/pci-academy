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


def _flicker_band(seconds: float, seed: int, flicker_db: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    sos = signal.butter(8, [8000, 14000], btype="band", fs=SR, output="sos")
    hf = signal.sosfilt(sos, rng.standard_normal(n))
    hf *= 0.02 / np.sqrt(np.mean(hf ** 2))
    seg = int(0.02 * SR)
    gains = 10 ** (rng.uniform(-flicker_db, 0.0, -(-n // seg)) / 20)
    return hf * np.repeat(gains, seg)[:n]


def _hf_roughness(x: np.ndarray) -> float:
    """Median |level change| (dB) of the 8-14 kHz band between non-overlapping 23 ms frames."""
    f, t, z = signal.stft(x[0], fs=SR, nperseg=1024, noverlap=0)
    band = (f >= 8000) & (f <= 14000)
    level = 10 * np.log10((np.abs(z[band]) ** 2).sum(axis=0) + 1e-20)
    return float(np.median(np.abs(np.diff(level[2:-2]))))


def test_high_band_flicker_is_reduced():
    x = (_tone(seconds=4.0, channels=1)[0] + _flicker_band(4.0, 7, 12.0)).astype(np.float32)[np.newaxis]
    clean, removed = denoise_dsp(x, SR, "strong")
    assert _hf_roughness(clean) < _hf_roughness(x) - 0.5
    np.testing.assert_allclose(clean + removed, x, atol=1e-6)


def test_transients_survive_deflicker():
    """Hi-hat-like bursts on a steady bed: onset protection keeps their attack."""
    n = SR * 4
    rng = np.random.default_rng(4)
    sos = signal.butter(4, 7000, btype="highpass", fs=SR, output="sos")
    x = 0.002 * signal.sosfilt(sos, rng.standard_normal(n))       # quiet steady HF bed
    burst_len = int(0.03 * SR)
    env = np.exp(-np.arange(burst_len) / (0.006 * SR))
    starts = list(range(int(0.25 * SR), n - burst_len, int(0.25 * SR)))
    for s in starts:
        x[s:s + burst_len] += 0.5 * env * signal.sosfilt(sos, rng.standard_normal(burst_len))
    x = x.astype(np.float32)[np.newaxis]
    clean, _ = denoise_dsp(x, SR, "strong")
    for s in starts[1:-1]:
        window = slice(s, s + int(0.005 * SR))                     # first 5 ms of each hit
        assert _db(x[:, window]) - _db(clean[:, window]) < 1.5


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
