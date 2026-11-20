"""Tests for stem_master.dsp.cleanup (bleed mask, activity gate, range filters, chain)."""

from __future__ import annotations

import tracemalloc

import numpy as np
import pytest

from stem_master.dsp.cleanup import (
    RANGE_FILTER_HZ,
    activity_gate,
    bleed_mask,
    cleanup_stems,
    gate_gain_curve,
    range_filter,
)

SR = 44100


def _db(x: np.ndarray) -> float:
    return 10 * np.log10(np.mean(np.asarray(x, dtype=np.float64) ** 2) + 1e-30)


def _harmonic(f0: float, n_harm: int, seconds: float, amp: float = 0.1, channels: int = 2) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    y = sum(np.sin(2 * np.pi * f0 * k * t + 0.3 * k) / k for k in range(1, n_harm + 1))
    return np.tile((amp * y).astype(np.float32), (channels, 1))


def _band_power(x: np.ndarray, freqs_hz, width_hz: float = 6.0) -> float:
    """Power of channel 0 in narrow bands around ``freqs_hz`` (middle of the signal)."""
    seg = x[0, SR:-SR].astype(np.float64)
    spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size))) ** 2
    f = np.fft.rfftfreq(seg.size, 1 / SR)
    sel = np.zeros_like(f, dtype=bool)
    for fc in freqs_hz:
        sel |= np.abs(f - fc) <= width_hz
    return float(spec[sel].sum())


# ============================================================ bleed mask
def _bleed_scene(seconds: float = 4.0):
    owner = _harmonic(220.0, 6, seconds, amp=0.2)                      # bins near 220..1320 Hz
    own_b = _harmonic(5000.0, 1, seconds, amp=0.05) + _harmonic(7300.0, 1, seconds, amp=0.05)
    bleed = owner * np.float32(10 ** (-30 / 20))                       # -30 dB copy of the owner
    return {"owner": owner, "victim": (own_b + bleed).astype(np.float32)}, own_b, bleed


def test_bleed_mask_removes_bleed_in_bins_the_stem_does_not_own():
    stems, own_b, bleed = _bleed_scene()
    cleaned, removed = bleed_mask(stems, SR, "standard")
    harm = [220.0 * k for k in range(1, 7)]
    before = _band_power(stems["victim"], harm)
    after = _band_power(cleaned["victim"], harm)
    assert 10 * np.log10(before / after) >= 10.0          # bleed attenuated by >= 10 dB
    # the owner and the victim's own content are untouched
    assert abs(_db(cleaned["owner"]) - _db(stems["owner"])) < 0.5
    assert abs(10 * np.log10(_band_power(cleaned["victim"], [5000.0, 7300.0])
                             / _band_power(stems["victim"], [5000.0, 7300.0]))) < 0.5
    assert removed.shape == stems["owner"].shape and removed.dtype == np.float32


@pytest.mark.parametrize("strength", ["light", "standard", "strong"])
def test_bleed_mask_exact_reconstruction_identity(strength):
    stems, _, _ = _bleed_scene(seconds=3.0)
    rng = np.random.default_rng(3)
    stems["noise"] = (rng.standard_normal(stems["owner"].shape) * 0.02).astype(np.float32)
    cleaned, removed = bleed_mask(stems, SR, strength)
    total_in = sum(v.astype(np.float64) for v in stems.values())
    total_out = sum(v.astype(np.float64) for v in cleaned.values()) + removed
    assert np.max(np.abs(total_out - total_in)) < 1e-5
    # inputs are not modified when inplace=False
    s2, _, _ = _bleed_scene(seconds=3.0)
    np.testing.assert_array_equal(stems["owner"], s2["owner"])


def test_bleed_mask_strength_ordering_and_single_stem():
    stems, _, _ = _bleed_scene(seconds=3.0)
    energy = [_db(bleed_mask(stems, SR, s)[1]) for s in ("light", "standard", "strong")]
    assert energy[0] < energy[1] < energy[2]
    only = {"vocals": stems["owner"]}
    cleaned, removed = bleed_mask(only, SR, "strong")
    np.testing.assert_array_equal(cleaned["vocals"], only["vocals"])
    assert not np.any(removed)


def test_bleed_mask_is_block_size_invariant_and_inplace_matches():
    stems, _, _ = _bleed_scene(seconds=3.0)
    ref, ref_removed = bleed_mask(stems, SR, "standard", block_frames=4096)  # one block
    small, small_removed = bleed_mask(stems, SR, "standard", block_frames=9)  # many blocks
    for k in stems:
        assert np.max(np.abs(ref[k] - small[k])) < 1e-6
    assert np.max(np.abs(ref_removed - small_removed)) < 1e-6
    work = {k: v.copy() for k, v in stems.items()}
    ids = {k: id(v) for k, v in work.items()}
    out, out_removed = bleed_mask(work, SR, "standard", inplace=True, block_frames=9)
    for k in stems:
        assert id(out[k]) == ids[k]                         # same arrays, overwritten
        assert np.max(np.abs(out[k] - ref[k])) < 1e-6
    assert np.max(np.abs(out_removed - ref_removed)) < 1e-6


def test_bleed_mask_validates_input():
    a = np.zeros((2, 1000), dtype=np.float32)
    with pytest.raises(ValueError):
        bleed_mask({"a": a, "b": np.zeros((2, 999), dtype=np.float32)}, SR, "standard")
    with pytest.raises(ValueError):
        bleed_mask({"a": a}, SR, "extreme")
    with pytest.raises(ValueError):
        bleed_mask({}, SR, "standard")
    with pytest.raises(ValueError):
        bleed_mask({"a": a.astype(np.float64)}, SR, "standard", inplace=True)


def _measure_peak(fn) -> int:
    tracemalloc.start()
    try:
        tracemalloc.reset_peak()
        base = tracemalloc.get_traced_memory()[0]
        fn()
        return tracemalloc.get_traced_memory()[1] - base
    finally:
        tracemalloc.stop()


def test_bleed_mask_memory_is_bounded_and_independent_of_duration():
    """Working set of the block-wise mask: measured with tracemalloc (numpy reports to it).

    16 stereo stems, default block size: the working set must not grow with
    duration (2 vs 4 blocks of audio). Together with removed_total this gives
    the documented estimate for 16 stems x 6 min at 44.1 kHz with
    inplace=True: 127 MB + ~0.2 GB << 2 GB.
    """
    rng = np.random.default_rng(0)
    working = {}
    for seconds in (12.0, 24.0):
        n = int(SR * seconds)
        stems = {f"s{i}": (rng.standard_normal((2, n)) * 0.05).astype(np.float32) for i in range(16)}
        stem_bytes = 2 * n * 4
        peak = _measure_peak(lambda: bleed_mask(stems, SR, "standard", inplace=True))
        working[seconds] = peak - stem_bytes          # minus removed_total
        del stems
    assert working[12.0] < 300e6
    assert abs(working[24.0] - working[12.0]) < 20e6
    removed_total_6min = 2 * int(SR * 360) * 4          # one stereo float32 stem, 127 MB
    assert removed_total_6min + max(working.values()) < 0.5e9


# ======================================================== activity gate
def _gate_scene():
    t = np.arange(SR * 4) / SR
    rng = np.random.default_rng(5)
    x = np.zeros((2, t.size))
    x[:, : SR * 2] = 10 ** (-10 / 20) * np.sqrt(2) * np.sin(2 * np.pi * 330 * t[: SR * 2])  # -10 dBFS RMS
    x[:, SR * 2:] = rng.standard_normal((2, SR * 2)) * 10 ** (-70 / 20)                    # -70 dBFS noise
    return x.astype(np.float32)


def test_activity_gate_closes_on_low_level_noise_and_keeps_signal():
    x = _gate_scene()
    gated, removed = activity_gate(x, x, SR, "standard")
    sig = slice(0, SR * 2)
    assert abs(_db(gated[:, sig]) - _db(x[:, sig])) < 0.1
    assert np.max(np.abs(gated[:, sig] - x[:, sig])) < 1e-6
    tail = slice(int(2.25 * SR), None)        # after 120 ms hold + 80 ms release
    assert _db(x[:, tail]) - _db(gated[:, tail]) >= 40.0
    np.testing.assert_allclose(gated + removed, x, atol=1e-7)


def test_activity_gate_is_click_free_and_identical_across_channels():
    x = _gate_scene()
    gated, _ = activity_gate(x, x, SR, "standard")
    # no discontinuities: the gate never creates a step larger than the input's largest one
    assert np.max(np.abs(np.diff(gated, axis=1))) <= np.max(np.abs(np.diff(x, axis=1))) * 1.001
    # and across the closing region (signal end + hold + release) the output only decays
    closing = slice(2 * SR + 10, int(2.3 * SR))
    assert np.max(np.abs(gated[:, closing])) <= np.max(np.abs(x[:, closing])) + 1e-7
    centres, gain_db = gate_gain_curve(x, x, SR, "standard")
    gain = 10 ** (np.interp(np.arange(x.shape[1]), centres, gain_db) / 20)
    assert np.max(np.abs(np.diff(gain))) < 2e-3          # smooth gain, no jumps
    assert gain_db.min() == pytest.approx(-80.0)
    # the same gain on both channels: the ratio between channels survives gating
    y = np.stack([x[0], 0.5 * x[0]])
    g2, _ = activity_gate(y, y, SR, "standard")
    np.testing.assert_allclose(g2[1], 0.5 * g2[0], atol=1e-7)


def test_activity_gate_lookahead_opens_before_onset():
    x = np.zeros((1, SR), dtype=np.float32)
    onset = SR // 2
    x[0, onset:] = 0.5 * np.sin(2 * np.pi * 440 * np.arange(SR - onset) / SR)
    gated, _ = activity_gate(x, x, SR, "standard")
    # fully open at the onset: the first cycle passes untouched
    np.testing.assert_allclose(gated[0, onset:onset + 200], x[0, onset:onset + 200], atol=1e-6)


def test_activity_gate_mix_relative_threshold():
    t = np.arange(SR * 2) / SR
    stem = (10 ** (-60 / 20) * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)[np.newaxis]
    loud_mix = (0.5 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)[np.newaxis]
    gated, _ = activity_gate(stem, loud_mix, SR, "standard")     # 54 dB under the mix: bleed
    assert _db(stem) - _db(gated) >= 40.0
    quiet_mix = stem * 4
    gated, _ = activity_gate(stem, quiet_mix, SR, "standard")    # 12 dB under the mix: kept
    assert abs(_db(gated) - _db(stem)) < 0.1


def test_activity_gate_strengths():
    t = np.arange(SR * 2) / SR
    stem = (10 ** (-45 / 20) * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)[np.newaxis]
    mix = (10 ** (-6 / 20) * np.sin(2 * np.pi * 200 * t)).astype(np.float32)[np.newaxis]
    # stem is 39 dB below the mix: light (-50) and standard (-42) keep it, strong (-36) gates it
    assert abs(_db(activity_gate(stem, mix, SR, "light")[0]) - _db(stem)) < 0.1
    assert abs(_db(activity_gate(stem, mix, SR, "standard")[0]) - _db(stem)) < 0.1
    assert _db(stem) - _db(activity_gate(stem, mix, SR, "strong")[0]) > 40.0


# ======================================================== range filters
def test_range_filter_hihat_and_untouched_stems():
    t = np.arange(SR * 3) / SR
    low = 0.3 * np.sin(2 * np.pi * 60 * t)
    high = 0.3 * np.sin(2 * np.pi * 5000 * t)
    x = np.tile((low + high).astype(np.float32), (2, 1))
    filtered, removed = range_filter("hihat", x, SR)
    lo_loss = 10 * np.log10(_band_power(x, [60.0]) / _band_power(filtered, [60.0]))
    hi_loss = 10 * np.log10(_band_power(x, [5000.0]) / _band_power(filtered, [5000.0]))
    assert lo_loss > 20.0
    assert abs(hi_loss) < 1.0
    np.testing.assert_allclose(filtered + removed, x, atol=1e-6)
    for untouched in ("kick", "bass", "drum_room", "not_a_stem"):
        out, rem = range_filter(untouched, x, SR)
        np.testing.assert_array_equal(out, x)
        assert not np.any(rem)


def test_range_filter_table_matches_spec():
    assert RANGE_FILTER_HZ["lead_vocals"] == RANGE_FILTER_HZ["backing_vocals"] == RANGE_FILTER_HZ["vocals"] == 70.0
    assert RANGE_FILTER_HZ["hihat"] == 300.0
    assert RANGE_FILTER_HZ["ride"] == RANGE_FILTER_HZ["crash"] == 250.0
    assert RANGE_FILTER_HZ["snare"] == 60.0 and RANGE_FILTER_HZ["toms"] == 40.0
    assert RANGE_FILTER_HZ["guitar"] == RANGE_FILTER_HZ["piano"] == RANGE_FILTER_HZ["other"] == 30.0
    assert "kick" not in RANGE_FILTER_HZ and "bass" not in RANGE_FILTER_HZ


def test_range_filter_is_zero_phase():
    t = np.arange(SR * 2) / SR
    x = (0.3 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)[np.newaxis]
    filtered, _ = range_filter("lead_vocals", x, SR)
    core = slice(SR // 2, -SR // 2)
    assert np.max(np.abs(filtered[0, core] - x[0, core])) < 2e-3   # no phase shift at 1 kHz


# =============================================================== chain
def _chain_scene():
    seconds = 4.0
    rng = np.random.default_rng(9)
    vox = _harmonic(196.0, 8, seconds, amp=0.15)
    vox[:, : SR] = 0.0                                          # vocal enters at 1 s
    kick = np.zeros_like(vox)
    for start in range(0, kick.shape[1] - 4000, SR // 2):
        tt = np.arange(4000) / SR
        kick[:, start:start + 4000] = 0.6 * np.exp(-tt * 30) * np.sin(2 * np.pi * 55 * tt)
    hat = (rng.standard_normal(vox.shape) * 0.02).astype(np.float32)
    stems = {
        "lead_vocals": (vox + 0.03 * kick + 0.1 * hat).astype(np.float32),
        "kick": (kick + 0.02 * vox).astype(np.float32),
        "hihat": (hat + 0.05 * kick).astype(np.float32),
    }
    mix = sum(stems.values()).astype(np.float32)
    return stems, mix


@pytest.mark.parametrize("strength", ["light", "standard", "strong"])
def test_cleanup_stems_sum_identity(strength):
    stems, mix = _chain_scene()
    originals = {k: v.copy() for k, v in stems.items()}
    cleaned, removed = cleanup_stems(stems, mix, SR, strength)
    assert set(cleaned) == set(stems)
    total = sum(v.astype(np.float64) for v in cleaned.values()) + removed
    expected = sum(v.astype(np.float64) for v in originals.values())
    assert np.max(np.abs(total - expected)) < 1e-5
    for k in stems:                                              # not modified (inplace=False)
        np.testing.assert_array_equal(stems[k], originals[k])


def test_cleanup_stems_cleans_and_inplace_matches():
    stems, mix = _chain_scene()
    cleaned, removed = cleanup_stems(stems, mix, SR, "standard")
    # the vocal is silent before 1 s except for bleed: gated away
    assert _db(stems["lead_vocals"][:, : SR - 2000]) - _db(cleaned["lead_vocals"][:, : SR - 2000]) > 30.0
    # but the sung part stays (within 1 dB)
    assert abs(_db(cleaned["lead_vocals"][:, 2 * SR:]) - _db(stems["lead_vocals"][:, 2 * SR:])) < 1.0
    work = {k: v.copy() for k, v in stems.items()}
    out, out_removed = cleanup_stems(work, mix, SR, "standard", inplace=True)
    for k in stems:
        assert out[k] is work[k]
        assert np.max(np.abs(out[k] - cleaned[k])) < 1e-6
    assert np.max(np.abs(out_removed - removed)) < 1e-6


@pytest.mark.parametrize("sr", [8000, 48000])
@pytest.mark.parametrize("n", [1, 100, 5000])
def test_cleanup_handles_very_short_inputs(sr, n):
    rng = np.random.default_rng(n)
    x = (rng.standard_normal((2, n)) * 0.1).astype(np.float32)
    stems = {"lead_vocals": x, "kick": 0.5 * x, "hihat": 0.1 * x}
    cleaned, removed = cleanup_stems(stems, 1.6 * x, sr, "strong")
    assert all(v.shape == x.shape for v in cleaned.values())
    np.testing.assert_allclose(sum(cleaned.values()) + removed, 1.6 * x, atol=1e-5)
