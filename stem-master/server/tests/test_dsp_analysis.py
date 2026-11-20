"""Tests for stem_master.dsp.analysis (tempo, key, loudness, artifact level, stem stats)."""

from __future__ import annotations

import numpy as np
import pytest
from scipy import signal

from stem_master.dsp.analysis import (
    KEY_TO_CAMELOT,
    analyze,
    artifact_features,
    camelot_code,
    key_name,
    stem_stats,
)

SR = 44100
ANALYSIS_KEYS = {
    "bpm", "bpm_confidence", "key", "camelot", "key_confidence", "loudness_lufs",
    "peak_dbfs", "artifact_level", "artifact_label", "spectral_cutoff_hz",
}


# --------------------------------------------------------------- signals
def click_track(bpm: float, seconds: float = 10.0, sr: int = SR) -> np.ndarray:
    """Short decaying noise clicks every beat."""
    n = int(sr * seconds)
    x = np.zeros(n, dtype=np.float32)
    burst = int(0.01 * sr)
    env = np.exp(-np.arange(burst) / (0.002 * sr))
    rng = np.random.default_rng(1)
    t = 0.0
    while t < seconds:
        i = int(round(t * sr))
        seg = (env * rng.standard_normal(burst) * 0.8)[: n - i]
        x[i:i + seg.size] += seg
        t += 60.0 / bpm
    return x[np.newaxis]


def _midi_hz(m: int) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def chord(notes, seconds: float, sr: int = SR, amp: float = 0.15) -> np.ndarray:
    """Triad (+ bass) with 6 harmonics (1/k amplitudes) and 10 ms fades."""
    n = int(sr * seconds)
    t = np.arange(n) / sr
    y = np.zeros(n)
    for m in notes:
        f = _midi_hz(m)
        for k in range(1, 7):
            if f * k < sr / 2:
                y += np.sin(2 * np.pi * f * k * t) / k
    fade = np.minimum(1.0, np.minimum(t / 0.01, (seconds - t) / 0.01))
    return y * fade * amp


AM = [45, 57, 60, 64]   # A2 bass + A3 C4 E4
F = [41, 57, 60, 65]    # F2 + A3 C4 F4
C = [48, 60, 64, 67]    # C3 + C4 E4 G4
G = [43, 55, 59, 62]    # G2 + G3 B3 D4


def progression(seq) -> np.ndarray:
    return np.concatenate([chord(c, d) for c, d in seq]).astype(np.float32)[np.newaxis]


def tones_with_gaps(seconds: float = 8.0, sr: int = SR) -> np.ndarray:
    """A major triad with 4 harmonics, 0.7 s on / 0.3 s digital silence."""
    from scipy.ndimage import uniform_filter1d

    t = np.arange(int(sr * seconds)) / sr
    y = np.zeros(t.size)
    for f in (220.0, 277.18, 329.63):
        for k in range(1, 5):
            y += np.sin(2 * np.pi * f * k * t) / k
    gate = uniform_filter1d(((t % 1.0) < 0.7).astype(float), int(0.01 * sr))
    gate[gate < 1e-9] = 0.0
    return (y * gate * 0.2 / 3).astype(np.float32)[np.newaxis]


def degrade(x: np.ndarray, noise_dbfs=-50.0, flicker_db=12.0, hf_level_db=-35.0, seed=3) -> np.ndarray:
    """Add a static white-noise floor and/or a 7-15 kHz noise band whose level
    jumps randomly every 20 ms (a codec-style "shimmer")."""
    rng = np.random.default_rng(seed)
    c, n = x.shape
    out = x.astype(np.float64).copy()
    if noise_dbfs is not None:
        out += rng.standard_normal((c, n)) * 10 ** (noise_dbfs / 20)
    if flicker_db:
        sos = signal.butter(8, [7000, 15000], btype="band", fs=SR, output="sos")
        hf = signal.sosfilt(sos, rng.standard_normal((c, n)), axis=-1)
        hf *= 10 ** (hf_level_db / 20) / np.sqrt(np.mean(hf ** 2))
        seg = int(SR * 0.02)
        gains = 10 ** (rng.uniform(-flicker_db, 0.0, -(-n // seg)) / 20)
        out += hf * np.repeat(gains, seg)[:n]
    return out.astype(np.float32)


# ----------------------------------------------------------------- tempo
def test_analyze_returns_exact_keys_and_types():
    res = analyze(click_track(120.0, seconds=4.0), SR)
    assert set(res) == ANALYSIS_KEYS
    assert isinstance(res["peak_dbfs"], float)
    assert 0.0 <= res["bpm_confidence"] <= 1.0
    assert 0.0 <= res["key_confidence"] <= 1.0
    assert 0.0 <= res["artifact_level"] <= 1.0
    assert res["artifact_label"] in {"low", "moderate", "high"}


def test_bpm_120_click_track():
    res = analyze(click_track(120.0), SR)
    assert 119.0 <= res["bpm"] <= 121.0
    assert res["bpm_confidence"] > 0.8


@pytest.mark.parametrize("bpm", [87.0, 140.0, 174.0])
def test_bpm_other_tempi_are_accurate(bpm):
    res = analyze(click_track(bpm, seconds=8.0), SR)
    assert abs(res["bpm"] - bpm) <= 1.0


def test_bpm_is_folded_into_70_180():
    slow = analyze(click_track(55.0, seconds=12.0), SR)["bpm"]   # reported in the 70..180 octave
    assert 70.0 <= slow <= 180.0 and abs(slow - 110.0) <= 1.5


# ------------------------------------------------------------------- key
def test_key_a_minor_progression_exact():
    # Am - F - C - G - Am with the tonic chord held at both ends (2 s each),
    # triads over a bass root with 6 harmonics each.
    res = analyze(progression([(AM, 2.0), (F, 1.0), (C, 1.0), (G, 1.0), (AM, 2.0)]), SR)
    assert res["key"] == "A minor"
    assert res["camelot"] == "8A"
    assert res["key_confidence"] > 0.5


def test_key_equal_length_loop_is_a_minor_or_relative_major():
    # With all four chords equally long, the loop vi-IV-I-V has the
    # pitch-class distribution of C major (C sounds in three of the four
    # chords, G as the strong 3rd harmonic of C), so Krumhansl-Schmuckler
    # correlates it slightly better with C major (r ~0.92) than with A minor
    # (r ~0.80). Both share every pitch class and the Camelot number (8A/8B),
    # so the relative major is the accepted answer here.
    res = analyze(progression([(AM, 1.0), (F, 1.0), (C, 1.0), (G, 1.0)] * 2), SR)
    assert res["key"] in {"A minor", "C major"}
    assert res["camelot"] in {"8A", "8B"}


@pytest.mark.parametrize("name,code", [
    ("C major", "8B"), ("A minor", "8A"), ("G major", "9B"), ("E minor", "9A"),
    ("F# major", "2B"), ("Eb minor", "2A"), ("Db major", "3B"), ("Bb minor", "3A"),
    ("F major", "7B"), ("D minor", "7A"), ("B major", "1B"), ("G# minor", "1A"),
    ("E major", "12B"), ("C# minor", "12A"), ("Eb major", "5B"), ("C minor", "5A"),
])
def test_camelot_table(name, code):
    assert KEY_TO_CAMELOT[name] == code


def test_camelot_mapping_is_a_bijection():
    assert len(KEY_TO_CAMELOT) == 24
    assert len(set(KEY_TO_CAMELOT.values())) == 24
    for pc in range(12):
        # relative minor (tonic - 3 semitones) shares the Camelot number
        major = camelot_code(pc, "major")
        minor = camelot_code((pc - 3) % 12, "minor")
        assert major[:-1] == minor[:-1] and major[-1] == "B" and minor[-1] == "A"
        # a fifth up moves one step clockwise
        assert int(camelot_code((pc + 7) % 12, "major")[:-1]) % 12 == (int(major[:-1]) + 1) % 12
    assert key_name(6, "major") == "F# major"


# -------------------------------------------------------------- loudness
def test_loudness_matches_pyloudnorm():
    pyln = pytest.importorskip("pyloudnorm")
    rng = np.random.default_rng(0)
    t = np.arange(SR * 5) / SR
    x = np.stack([0.3 * np.sin(2 * np.pi * 997 * t), 0.1 * rng.standard_normal(t.size)]).astype(np.float32)
    x[:, SR:2 * SR] *= 0.01  # a quiet stretch exercises the gating
    res = analyze(x, SR)
    ref = pyln.Meter(SR).integrated_loudness(x.T)
    assert res["loudness_lufs"] == pytest.approx(ref, abs=0.01)


def test_loudness_of_reference_sine():
    t = np.arange(SR * 4) / SR
    x = (10 ** (-20 / 20) * np.sin(2 * np.pi * 997 * t)).astype(np.float32)[np.newaxis]
    # BS.1770: a mono 997 Hz sine at -20 dBFS peak reads -23.0 LKFS (+-0.1)
    assert analyze(x, SR)["loudness_lufs"] == pytest.approx(-23.0, abs=0.1)


# --------------------------------------------------------------- silence
@pytest.mark.parametrize("shape", [(2, SR * 3), (1, SR * 3), (SR * 3,)])
def test_silence_is_handled(shape):
    res = analyze(np.zeros(shape, dtype=np.float32), SR)
    assert set(res) == ANALYSIS_KEYS
    assert res["bpm"] is None and res["key"] is None and res["camelot"] is None
    assert res["loudness_lufs"] is None and res["spectral_cutoff_hz"] is None
    assert res["peak_dbfs"] == -120.0
    assert res["artifact_level"] == 0.0 and res["artifact_label"] == "low"
    assert res["bpm_confidence"] == 0.0 and res["key_confidence"] == 0.0


def test_short_mono_input_at_48k():
    sr = 48000
    t = np.arange(sr * 3) / sr
    x = (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    res = analyze(x, sr)
    assert set(res) == ANALYSIS_KEYS
    assert res["loudness_lufs"] is not None
    assert res["peak_dbfs"] == pytest.approx(20 * np.log10(0.3), abs=0.05)


# --------------------------------------------------------- artifact level
def test_artifact_level_noise_and_flicker_higher_than_clean():
    clean = tones_with_gaps()
    dirty = degrade(clean)
    a_clean = analyze(clean, SR)
    a_dirty = analyze(dirty, SR)
    assert a_clean["artifact_level"] < 0.1 and a_clean["artifact_label"] == "low"
    assert a_dirty["artifact_level"] > a_clean["artifact_level"] + 0.3
    assert a_dirty["artifact_label"] in {"moderate", "high"}


def test_each_artifact_cue_raises_the_level_on_its_own():
    clean = tones_with_gaps()
    base = analyze(clean, SR)["artifact_level"]
    noise_only = analyze(degrade(clean, flicker_db=0), SR)["artifact_level"]
    flicker_only = analyze(degrade(clean, noise_dbfs=None), SR)["artifact_level"]
    assert noise_only > base + 0.2
    assert flicker_only > base + 0.2
    f = artifact_features(degrade(clean, noise_dbfs=None)[0], SR)
    assert f["flicker_db"] is not None and f["s_flicker"] > 0.3
    f = artifact_features(degrade(clean, flicker_db=0)[0], SR)
    assert f["noise_floor_db"] == pytest.approx(-50.0, abs=2.0) and f["s_noise"] > 0.8


def test_spectral_cutoff_detected_on_brickwalled_noise():
    rng = np.random.default_rng(0)
    w = rng.standard_normal(SR * 4) * 0.1
    spec = np.fft.rfft(w)
    spec[np.fft.rfftfreq(w.size, 1 / SR) > 15000] = 0
    x = np.fft.irfft(spec, n=w.size).astype(np.float32)[np.newaxis]
    res = analyze(x, SR)
    assert res["spectral_cutoff_hz"] == pytest.approx(15000, abs=250)
    full = analyze((rng.standard_normal(SR * 4) * 0.1).astype(np.float32), SR)
    assert full["spectral_cutoff_hz"] is None
    assert res["artifact_level"] > full["artifact_level"]


# ------------------------------------------------------------ stem stats
def test_stem_stats_waveform_and_levels():
    t = np.arange(SR * 4) / SR
    x = np.stack([np.sin(2 * np.pi * 220 * t), 0.5 * np.sin(2 * np.pi * 330 * t)]).astype(np.float32)
    x[:, : SR * 2] = 0.0  # first half silent
    st = stem_stats(x, SR)
    assert set(st) == {"peak_dbfs", "rms_dbfs", "active_ratio", "waveform"}
    wf = st["waveform"]
    assert len(wf) == 256 and all(0.0 <= v <= 1.0 for v in wf)
    assert max(wf[:127]) == 0.0 and min(wf[129:]) > 0.99   # peak per bucket, max over channels
    assert st["peak_dbfs"] == pytest.approx(0.0, abs=0.01)
    # RMS over all samples and channels: (0.5 + 0.125) / 2 mean square, half the time
    expected = 10 * np.log10((0.5 + 0.125) / 2 / 2)
    assert st["rms_dbfs"] == pytest.approx(expected, abs=0.05)
    assert st["active_ratio"] == pytest.approx(0.5, abs=0.02)


def test_stem_stats_silent_and_tiny_inputs():
    st = stem_stats(np.zeros((2, SR), dtype=np.float32), SR)
    assert st["peak_dbfs"] == -120.0 and st["rms_dbfs"] == -120.0
    assert st["active_ratio"] == 0.0 and st["waveform"] == [0.0] * 256
    tiny = stem_stats(np.full((1, 100), 0.25, dtype=np.float32), SR)
    assert len(tiny["waveform"]) == 256 and max(tiny["waveform"]) == pytest.approx(0.25)
    loud = stem_stats(np.full((1, 1000), 3.0, dtype=np.float32), SR)  # float overs are clamped
    assert max(loud["waveform"]) == 1.0
    empty = stem_stats(np.zeros((2, 0), dtype=np.float32), SR)
    assert empty["waveform"] == [0.0] * 256 and empty["active_ratio"] == 0.0


def test_stem_stats_active_ratio_ignores_low_level_bleed():
    rng = np.random.default_rng(2)
    x = (rng.standard_normal((1, SR * 4)) * 10 ** (-70 / 20)).astype(np.float32)  # -70 dBFS bleed
    x[0, :SR] += 0.5 * np.sin(2 * np.pi * 440 * np.arange(SR) / SR)               # 1 s of content
    assert stem_stats(x, SR)["active_ratio"] == pytest.approx(0.25, abs=0.02)


@pytest.mark.parametrize("n", [1, 100, 4000])
def test_analyze_tiny_inputs_do_not_fail(n):
    x = (np.random.default_rng(n).standard_normal((2, n)) * 0.1).astype(np.float32)
    res = analyze(x, SR)
    assert set(res) == ANALYSIS_KEYS
    assert res["loudness_lufs"] is None or n >= int(0.4 * SR)
    assert 0.0 <= res["artifact_level"] <= 1.0
