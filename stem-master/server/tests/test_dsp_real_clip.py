"""DSP sanity checks on one real MUSDB18 excerpt (skipped when the clips are absent).

The clip directory can be overridden with STEM_MASTER_TEST_CLIPS; each clip
folder holds ``mixture.wav`` and the ground-truth ``vocals/drums/bass/other.wav``.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pytest

from stem_master.dsp.analysis import KEY_TO_CAMELOT, analyze, stem_stats
from stem_master.dsp.audio_io import decode_audio
from stem_master.dsp.cleanup import cleanup_stems
from stem_master.dsp.denoise import denoise_dsp

_DEFAULT_CLIPS = ("/tmp/claude-0/-home-user-pci-academy/ebd417a4-a1af-53b7-b039-acfb44b5b16e/"
                  "scratchpad/data/clips")
CLIPS = Path(os.environ.get("STEM_MASTER_TEST_CLIPS", _DEFAULT_CLIPS))
STEMS = ("vocals", "drums", "bass", "other")


def _first_clip():
    if not CLIPS.is_dir():
        return None
    for folder in sorted(p for p in CLIPS.iterdir() if p.is_dir()):
        if all((folder / f"{name}.wav").is_file() for name in ("mixture",) + STEMS):
            return folder
    return None


def _db(x) -> float:
    return 10 * np.log10(np.mean(np.asarray(x, dtype=np.float64) ** 2) + 1e-30)


@pytest.mark.skipif(_first_clip() is None, reason="real MUSDB18 test clips not available")
def test_dsp_chain_on_real_clip():
    folder = _first_clip()
    mix_dec = decode_audio(folder / "mixture.wav")
    sr = mix_dec.sample_rate
    mix = mix_dec.samples
    stems = {name: decode_audio(folder / f"{name}.wav").samples for name in STEMS}
    assert all(s.shape == mix.shape for s in stems.values())

    # analysis
    res = analyze(mix, sr)
    assert res["bpm"] is not None and 70.0 <= res["bpm"] <= 180.0
    assert res["key"] in KEY_TO_CAMELOT and res["camelot"] == KEY_TO_CAMELOT[res["key"]]
    pyln = pytest.importorskip("pyloudnorm")
    assert res["loudness_lufs"] == pytest.approx(pyln.Meter(sr).integrated_loudness(mix.T), abs=0.01)
    assert res["artifact_label"] != "high"          # a professional mix
    assert res["spectral_cutoff_hz"] is None or 11000.0 <= res["spectral_cutoff_hz"] <= 20000.0

    # cleanup: removal accounting holds and real stems are not damaged
    cleaned, removed = cleanup_stems({k: v.copy() for k, v in stems.items()}, mix, sr, "standard")
    total = sum(v.astype(np.float64) for v in cleaned.values()) + removed
    assert np.max(np.abs(total - sum(v.astype(np.float64) for v in stems.values()))) < 1e-5
    for name in STEMS:
        assert abs(_db(cleaned[name]) - _db(stems[name])) < 3.0, name
    assert _db(removed) < _db(mix) - 10.0

    # denoise on the vocal stem: identity and gentle on clean material
    clean, noise = denoise_dsp(stems["vocals"], sr, "standard")
    np.testing.assert_allclose(clean + noise, stems["vocals"], atol=1e-6)
    assert abs(_db(clean) - _db(stems["vocals"])) < 1.0

    for name in STEMS:
        st = stem_stats(cleaned[name], sr)
        assert len(st["waveform"]) == 256 and 0.0 <= st["active_ratio"] <= 1.0
