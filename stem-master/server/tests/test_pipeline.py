"""Separation pipeline (SPEC section 2), model plan, engines and CLI.

Everything runs on :class:`~stem_master.engines.FakeEngine` (no models), so
the invariants checked here are the pipeline's own: stem set and roles per
option combination, alignment with the source (rate, length, channels),
``sum(primary) + sum(removed) == mix``, buses == sum of children, common
anti-clipping gain, cancellation, progress, and error mapping.
:class:`~stem_master.engines.AudioSeparatorEngine` is tested against a stub
``Separator`` that writes files exactly the way audio-separator 0.48 does.
An opt-in test (``STEM_MASTER_TEST_MODEL_DIR``) runs one real model.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import math
import os
import shutil
import subprocess
import sys
import threading
import types
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pytest
import soundfile as sf

from stem_master import engines as engines_mod
from stem_master.catalog import CATALOG_ORDER, DRUM_PARTS, spec_for
from stem_master.config import Settings, load_settings
from stem_master.engines import (
    MODEL_STEMS,
    AudioSeparatorEngine,
    EngineError,
    FakeEngine,
    get_engine,
    stem_name_from_filename,
)
from stem_master.jobs import PipelineCancelled, PipelineContext, PipelineError, PipelineResult
from stem_master.pipeline import (
    GPU_MEMORY_MESSAGE,
    MEMORY_MESSAGE,
    MODEL_PLAN,
    fold_negligible,
    models_for,
    models_for_quality,
    run_pipeline,
    stage_plan,
)
from stem_master.schemas import STAGE_IDS, WAVEFORM_POINTS, JobOptions

SERVER_DIR = Path(__file__).resolve().parents[1]
SR = 44100
CLIP_DIR = Path(os.environ.get(
    "STEM_MASTER_TEST_CLIPS",
    "/tmp/claude-0/-home-user-pci-academy/ebd417a4-a1af-53b7-b039-acfb44b5b16e/scratchpad/data/clips",
))

# ---------------------------------------------------------------------------
# signals
# ---------------------------------------------------------------------------

_TONES = [(55, .5), (110, .3), (220, .25), (440, .3), (660, .2), (880, .2), (1500, .15), (2500, .12),
          (3000, .1), (4500, .08), (6000, .06), (9000, .05), (12000, .04)]


def rich_mix(seconds: float = 2.5, sr: int = SR, channels: int = 2, peak: float = 0.5, seed: int = 7) -> np.ndarray:
    """Deterministic broadband test mix: tones across the spectrum, 16th-note
    noise bursts and a low noise floor. ``(channels, n)`` float32."""
    n = int(round(seconds * sr))
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    sig = np.zeros(n)
    for freq, amp in _TONES:
        sig += amp * np.sin(2 * np.pi * freq * t + freq / 100.0)
    length = int(0.04 * sr)
    burst = rng.standard_normal(length) * np.exp(-np.arange(length) / (0.006 * sr))
    for k in range(int(seconds * 4)):
        start = int(k * 0.25 * sr)
        m = min(length, n - start)
        sig[start:start + m] += 0.8 * burst[:m]
    sig += 0.01 * rng.standard_normal(n)
    x = np.stack([sig, 0.9 * sig + 0.05 * np.roll(sig, 37)]) if channels == 2 else sig[np.newaxis]
    return (peak * x / np.max(np.abs(x))).astype(np.float32)


def tone_mix(freq: float = 50.0, amp: float = 0.5, seconds: float = 2.0, sr: int = SR) -> np.ndarray:
    t = np.arange(int(round(seconds * sr))) / sr
    sig = amp * np.sin(2 * np.pi * freq * t)
    return np.stack([sig, sig]).astype(np.float32)


def write_source(path: Path, x: np.ndarray, sr: int = SR, subtype: str = "FLOAT") -> Path:
    sf.write(str(path), x.T, sr, subtype=subtype)
    return path


def read(path: Path) -> Tuple[np.ndarray, int]:
    data, rate = sf.read(str(path), dtype="float64", always_2d=True)
    return data.T, rate


def rel_err_db(actual: np.ndarray, expected: np.ndarray) -> float:
    err = float(np.sqrt(np.mean((actual - expected) ** 2)))
    ref = float(np.sqrt(np.mean(expected ** 2)))
    return -math.inf if err == 0 else 20 * math.log10(err / max(ref, 1e-20))


# ---------------------------------------------------------------------------
# harness
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class Run:
    ctx: PipelineContext
    engine: FakeEngine
    events: List[tuple]
    cancel: threading.Event
    source: Path

    @property
    def progress(self) -> List[tuple]:
        return [e[1:] for e in self.events if e[0] == "progress"]


class RecordingEngine(FakeEngine):
    """FakeEngine that also logs its calls into the shared event list."""

    def __init__(self, events: List[tuple]) -> None:
        super().__init__()
        self.events = events

    def separate(self, audio, models, ensemble_algorithm=None, overlap=None, progress=None, *, stems=None):
        names = (models,) if isinstance(models, str) else tuple(models)
        self.events.append(("engine", names))
        return super().separate(audio, models, ensemble_algorithm, overlap, progress, stems=stems)


@pytest.fixture
def fake_settings(tmp_path: Path) -> Settings:
    return dataclasses.replace(load_settings({"STEM_MASTER_DATA_DIR": str(tmp_path / "data")}), engine="fake")


@pytest.fixture
def make_run(tmp_path: Path, fake_settings: Settings):
    """``make_run(source_array_or_path, sr=..., cancel_when=..., engine=..., **options) -> Run``."""
    counter = {"n": 0}

    def factory(source=None, *, sr: int = SR, subtype: str = "FLOAT", settings: Optional[Settings] = None,
                cancel_when: Optional[Callable[[str, str, float], bool]] = None,
                engine: Optional[FakeEngine] = None, **options) -> Run:
        counter["n"] += 1
        job_dir = tmp_path / f"job{counter['n']}"
        job_dir.mkdir()
        if source is None:
            source = rich_mix(sr=sr)
        if isinstance(source, np.ndarray):
            input_path = write_source(job_dir / "input.wav", source, sr, subtype)
        else:
            input_path = job_dir / f"input{Path(source).suffix}"
            shutil.copyfile(source, input_path)
        events: List[tuple] = []
        cancel = threading.Event()

        def on_progress(stage: str, label: str, value: float) -> None:
            events.append(("progress", stage, label, value))
            if cancel_when is not None and cancel_when(stage, label, value):
                cancel.set()

        ctx = PipelineContext(
            job_id="ab" * 16, job_dir=job_dir, input_path=input_path, options=JobOptions(**options),
            settings=settings or fake_settings, on_progress=on_progress,
            on_analysis=lambda analysis: events.append(("analysis", analysis)),
            is_cancelled=cancel.is_set,
        )
        return Run(ctx=ctx, engine=engine or RecordingEngine(events), events=events, cancel=cancel,
                   source=input_path)

    return factory


def execute(run: Run) -> PipelineResult:
    return run_pipeline(run.ctx, engine=run.engine)


def expected_roles(opts: JobOptions, ambience: bool, room: bool = True) -> Dict[str, str]:
    """SPEC section 3 'appears when' column, written out independently."""
    roles = {"vocals": "bus" if (opts.vocal_split or opts.dereverb) else "primary"}
    if opts.vocal_split:
        roles["lead_vocals"] = roles["backing_vocals"] = "primary"
    elif opts.dereverb:
        roles["vocals_dry"] = "primary"
    if opts.dereverb:
        roles["vocal_reverb"] = "primary"
    if ambience:
        roles["vocal_ambience"] = "primary"
    roles["drums"] = "bus" if opts.drum_split else "primary"
    if opts.drum_split:
        for part in DRUM_PARTS:
            roles[part] = "primary"
        if room:
            roles["drum_room"] = "primary"
    for stem_id in ("bass", "guitar", "piano", "other"):
        roles[stem_id] = "primary"
    if opts.cleanup:
        roles["removed_bleed"] = "removed"
    if opts.denoise:
        roles["removed_noise"] = "removed"
    return roles


def load_stems(run: Run, result: PipelineResult) -> Dict[str, np.ndarray]:
    out = {}
    for stem in result.stems:
        data, rate = read(run.ctx.wav_path(stem.id))
        out[stem.id] = data
    return out


def check_invariants(run: Run, result: PipelineResult, *, sr: int, channels: int, frames: int,
                     tolerance_db: float = -60.0) -> Dict[str, np.ndarray]:
    """Alignment, sum-to-mix, buses, files and Stem records."""
    source, source_sr = read(run.source)
    assert source_sr == sr and source.shape == (channels, frames)
    stems = {}
    for stem in result.stems:
        wav, preview = run.ctx.wav_path(stem.id), run.ctx.preview_path(stem.id)
        info = sf.info(str(wav))
        assert info.samplerate == sr, stem.id
        assert info.frames == frames, stem.id
        assert info.channels == channels, stem.id
        assert info.subtype == {"wav24": "PCM_24", "wav16": "PCM_16", "wav32f": "FLOAT"}[run.ctx.options.output_format]
        assert preview.is_file() and preview.stat().st_size > 0, stem.id
        spec = spec_for(stem.id)
        assert (stem.group, stem.color) == (spec.group, spec.color)
        assert stem.wav_url == f"/v1/jobs/{run.ctx.job_id}/stems/{stem.id}.wav"
        assert stem.preview_url == f"/v1/jobs/{run.ctx.job_id}/stems/{stem.id}.m4a"
        assert stem.wav_bytes == wav.stat().st_size and stem.preview_bytes == preview.stat().st_size
        assert len(stem.waveform) == WAVEFORM_POINTS and all(0.0 <= v <= 1.0 for v in stem.waveform)
        stems[stem.id] = read(wav)[0]
    ids = [s.id for s in result.stems]
    assert ids == sorted(ids, key=CATALOG_ORDER.__getitem__), "catalogue order"
    assert len(set(ids)) == len(ids)

    gain = 10.0 ** (result.gain_offset_db / 20.0)
    summed = sum(stems[s.id] for s in result.stems if s.role in ("primary", "removed"))
    assert rel_err_db(summed, source * gain) < tolerance_db, "primary + removed must sum to the mix"
    roles = {s.id: s.role for s in result.stems}
    for bus, group in (("vocals", "vocals"), ("drums", "drums")):
        if roles.get(bus) == "bus":
            children = [sid for sid, role in roles.items() if role == "primary" and spec_for(sid).group == group]
            assert children
            # relative to the mix level: a near-silent bus is otherwise ill-conditioned
            error = sum(stems[c] for c in children) - stems[bus]
            assert rel_err_db(error, np.zeros_like(error)) - rel_err_db(source * gain, np.zeros_like(source)) \
                < tolerance_db, bus
    return stems


# ---------------------------------------------------------------------------
# model plan
# ---------------------------------------------------------------------------


def test_model_plan_uses_exact_spec_filenames():
    assert MODEL_PLAN["vocals_max_cleanup"].models == (
        "bs_roformer_vocals_revive_v2_unwa.ckpt", "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt")
    assert MODEL_PLAN["vocals_max_cleanup"].ensemble_algorithm == "min_fft"
    assert MODEL_PLAN["vocals_max"].models == (
        "bs_roformer_vocals_resurrection_unwa.ckpt", "melband_roformer_big_beta6x.ckpt")
    assert MODEL_PLAN["vocals_max"].ensemble_algorithm == "avg_fft"
    assert MODEL_PLAN["vocals_fast"].models == ("mel_band_roformer_kim_ft2_bleedless_unwa.ckpt",)
    assert MODEL_PLAN["debleed"].models == ("mel_band_roformer_bleed_suppressor_v1.ckpt",)
    assert MODEL_PLAN["instruments"].models == ("BS-Roformer-SW.ckpt",)
    assert MODEL_PLAN["drums"].models == ("MDX23C-DrumSep-aufr33-jarredou.ckpt",)
    assert MODEL_PLAN["vocal_split"].models == ("bs_roformer_karaoke_frazer_becruily.ckpt",)
    assert MODEL_PLAN["dereverb"].models == ("dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt",)
    assert MODEL_PLAN["vocal_denoise"].models == ("denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt",)
    every = {m for step in MODEL_PLAN.values() for m in step.models}
    assert every == set(MODEL_STEMS), "every planned model has a known output table"


def test_models_for_options_and_quality():
    assert models_for(JobOptions(quality="fast", cleanup=False, drum_split=False, vocal_split=False)) == [
        "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt", "BS-Roformer-SW.ckpt"]
    assert models_for(JobOptions()) == [
        "bs_roformer_vocals_revive_v2_unwa.ckpt", "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt",
        "mel_band_roformer_bleed_suppressor_v1.ckpt", "BS-Roformer-SW.ckpt",
        "MDX23C-DrumSep-aufr33-jarredou.ckpt", "bs_roformer_karaoke_frazer_becruily.ckpt"]
    full = models_for(JobOptions(dereverb=True, denoise=True, cleanup=False))
    assert full[:2] == ["bs_roformer_vocals_resurrection_unwa.ckpt", "melband_roformer_big_beta6x.ckpt"]
    assert "mel_band_roformer_bleed_suppressor_v1.ckpt" not in full
    assert set(models_for_quality("max")) == set(MODEL_STEMS)
    fast = models_for_quality("fast")
    assert "bs_roformer_vocals_revive_v2_unwa.ckpt" not in fast and len(fast) == 7
    assert set(models_for_quality("all")) == set(MODEL_STEMS)
    with pytest.raises(ValueError):
        models_for_quality("ultra")


def test_stage_plan_matches_spec_order():
    order = list(STAGE_IDS)
    for opts in (JobOptions(), JobOptions(dereverb=True, denoise=True), JobOptions(cleanup=False, quality="fast")):
        plan = [stage for stage, _ in stage_plan(opts)]
        assert plan == sorted(plan, key=order.index)
        assert plan[0] == "analyze" and plan[-1] == "finalize"
        assert ("debleed" in plan) == opts.cleanup == ("cleanup" in plan)
        assert ("denoise" in plan) == opts.denoise


# ---------------------------------------------------------------------------
# stems per option combination
# ---------------------------------------------------------------------------

COMBOS = {
    "all_on": dict(quality="max", drum_split=True, vocal_split=True, dereverb=True, cleanup=True, denoise=True),
    "all_off": dict(quality="max", drum_split=False, vocal_split=False, dereverb=False, cleanup=False, denoise=False),
    "fast": dict(quality="fast"),
    "drum_only": dict(drum_split=True, vocal_split=False, dereverb=False, cleanup=False, denoise=False),
    "vocal_split_no_dereverb": dict(drum_split=False, vocal_split=True, dereverb=False, cleanup=False),
    "dereverb_no_split": dict(drum_split=False, vocal_split=False, dereverb=True, cleanup=True),
}


@pytest.mark.parametrize("combo", list(COMBOS))
def test_stem_set_roles_and_invariants(make_run, combo):
    run = make_run(**COMBOS[combo])
    result = execute(run)
    opts = run.ctx.options
    # With this mix the residual stems sit ~30 dB above the fold threshold;
    # cleanup empties vocal_ambience (it lives under the vocals), so it is folded.
    roles = {s.id: s.role for s in result.stems}
    assert roles == expected_roles(opts, ambience=not opts.cleanup)
    check_invariants(run, result, sr=SR, channels=2, frames=int(round(2.5 * SR)))
    assert result.gain_offset_db == 0.0
    names = {s.id: s.name for s in result.stems}
    if opts.vocal_split:
        assert names["lead_vocals"] == ("Lead Vocals (Dry)" if opts.dereverb else "Lead Vocals")
        assert names["backing_vocals"] == ("Backing Vocals (Dry)" if opts.dereverb else "Backing Vocals")
    if "vocals_dry" in names:
        assert names["vocals_dry"] == "Vocals (Dry)"
    assert names["piano"] == "Piano & Keys" and names["other"] == "Synths & Other"


def test_engine_calls_follow_the_plan(make_run, fake_settings):
    run = make_run(**COMBOS["all_on"])
    execute(run)
    calls = run.engine.calls
    assert calls[0][:3] == (MODEL_PLAN["vocals_max_cleanup"].models, "min_fft", fake_settings.overlap_max)
    assert [c[0][0] for c in calls[1:]] == [
        "mel_band_roformer_bleed_suppressor_v1.ckpt", "BS-Roformer-SW.ckpt", "MDX23C-DrumSep-aufr33-jarredou.ckpt",
        "bs_roformer_karaoke_frazer_becruily.ckpt",
        "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt", "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt",
        "denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt", "denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt",
    ]
    assert all(c[3] == int(round(2.5 * SR)) for c in calls), "models always see the 44.1 kHz working copy"

    run = make_run(quality="max", cleanup=False, drum_split=False, vocal_split=False)
    execute(run)
    assert run.engine.calls[0][:2] == (MODEL_PLAN["vocals_max"].models, "avg_fft")

    run = make_run(quality="fast", cleanup=False, drum_split=False, vocal_split=False)
    execute(run)
    assert run.engine.calls[0][:3] == (MODEL_PLAN["vocals_fast"].models, None, fake_settings.overlap_fast)
    assert run.engine.calls[1][2] == fake_settings.overlap_fast


def test_48k_mono_source_keeps_rate_length_and_channels(make_run):
    sr = 48000
    source = rich_mix(seconds=2.5, sr=sr, channels=1)
    run = make_run(source, sr=sr, **COMBOS["all_on"])
    result = execute(run)
    assert result.analysis.sample_rate == sr and result.analysis.channels == 1
    assert {s.id for s in result.stems} == set(expected_roles(run.ctx.options, ambience=False))
    check_invariants(run, result, sr=sr, channels=1, frames=source.shape[1])
    assert abs(run.engine.calls[0][3] - source.shape[1] * SR / sr) <= 1, "models run on the 44.1 kHz copy"


def test_content_above_the_working_band_goes_to_other(make_run):
    # 23 kHz exists at 48 kHz but not in the 44.1 kHz working copy.
    sr = 48000
    t = np.arange(int(1.5 * sr)) / sr
    source = rich_mix(seconds=1.5, sr=sr, channels=2, peak=0.4)
    source = (source + 0.2 * np.sin(2 * np.pi * 23000 * t)).astype(np.float32)
    run = make_run(source, sr=sr, quality="fast", drum_split=False, vocal_split=False)
    result = execute(run)
    stems = check_invariants(run, result, sr=sr, channels=2, frames=source.shape[1])

    def level_23k(x: np.ndarray) -> float:
        spectrum = np.abs(np.fft.rfft(x[0] * np.hanning(x.shape[1])))
        freqs = np.fft.rfftfreq(x.shape[1], 1 / sr)
        return float(spectrum[(freqs > 22900) & (freqs < 23100)].max())

    ultrasonic = {stem_id: level_23k(audio) for stem_id, audio in stems.items()}
    assert max(ultrasonic, key=ultrasonic.get) == "other"
    assert ultrasonic["other"] == pytest.approx(level_23k(source.astype(np.float64)), rel=0.02)


def test_odd_length_22k_pcm16_source(make_run):
    sr = 22050
    source = rich_mix(seconds=1.37, sr=sr, channels=2)
    run = make_run(source, sr=sr, subtype="PCM_16", quality="fast", vocal_split=False, output_format="wav16")
    result = execute(run)
    source_read, _ = read(run.source)
    check_invariants(run, result, sr=sr, channels=2, frames=source_read.shape[1], tolerance_db=-60.0)


def test_negligible_residual_stems_are_folded(make_run):
    # A 50 Hz tone: nothing in the vocal bands (vocal_ambience ~ -100 dB) and
    # the kick takes everything below 120 Hz (drum_room ~ -100 dB).
    run = make_run(tone_mix(50.0), cleanup=False, vocal_split=False)
    result = execute(run)
    ids = {s.id for s in result.stems}
    assert "vocal_ambience" not in ids and "drum_room" not in ids
    stems = check_invariants(run, result, sr=SR, channels=2, frames=2 * SR)
    assert rel_err_db(stems["kick"], stems["drums"]) < -60, "drum_room went into the loudest part (kick)"


def test_fold_negligible_unit():
    mix_rms = 0.1
    base = {
        "vocal_ambience": np.full((2, 100), 1e-5, np.float32),  # -80 dB re mix
        "kick": np.full((2, 100), 0.05, np.float32),
        "snare": np.full((2, 100), 0.08, np.float32),
        "drum_room": np.full((2, 100), 0.002, np.float32),  # -34 dB: kept
        "other": np.full((2, 100), 0.01, np.float32),
    }
    stems = {k: v.copy() for k, v in base.items()}
    total = sum(stems.values())
    assert fold_negligible(stems, mix_rms) == ["vocal_ambience"]
    assert "drum_room" in stems and np.allclose(sum(stems.values()), total)
    assert np.allclose(stems["other"], 0.01 + 1e-5)
    stems["drum_room"] = np.full((2, 100), 1e-6, np.float32)
    assert fold_negligible(stems, mix_rms) == ["drum_room"]
    assert np.allclose(stems["snare"], 0.08 + 1e-6), "into the loudest drum part"
    silent = {k: np.zeros((2, 10), np.float32) for k in ("vocal_ambience", "other", "kick", "drum_room")}
    assert fold_negligible(silent, 0.0) == ["vocal_ambience", "drum_room"]


def test_silent_input_completes(make_run):
    run = make_run(np.zeros((2, SR), np.float32), **COMBOS["all_on"])
    result = execute(run)
    assert result.analysis.key == "Unknown" and result.analysis.camelot == ""
    assert result.analysis.bpm == 0.0 and result.analysis.loudness_lufs == -120.0
    ids = {s.id for s in result.stems}
    assert "vocal_ambience" not in ids and "drum_room" not in ids
    for stem in result.stems:
        assert stem.peak_dbfs == -120.0 and stem.active_ratio == 0.0
        assert read(run.ctx.wav_path(stem.id))[0].shape == (2, SR)


# ---------------------------------------------------------------------------
# gain
# ---------------------------------------------------------------------------


def test_common_gain_prevents_clipping_in_integer_formats(make_run):
    loud = tone_mix(60.0, amp=1.6, seconds=1.5)  # bass alone peaks at 0.85 * 1.6 = 1.36
    ref_run = make_run(loud, output_format="wav32f", cleanup=False)
    reference = execute(ref_run)
    assert reference.gain_offset_db == 0.0
    ref_stems = load_stems(ref_run, reference)
    peak = max(float(np.max(np.abs(a))) for a in ref_stems.values())
    assert peak > 1.0, "float output is not scaled"
    check_invariants(ref_run, reference, sr=SR, channels=2, frames=loud.shape[1])

    run = make_run(loud, output_format="wav24", cleanup=False)
    result = execute(run)
    expected_db = math.floor(20 * math.log10(0.999 / peak) * 100) / 100
    assert result.gain_offset_db == pytest.approx(expected_db, abs=0.011)
    assert result.gain_offset_db < 0
    stems = check_invariants(run, result, sr=SR, channels=2, frames=loud.shape[1])
    gain = 10 ** (result.gain_offset_db / 20)
    for stem_id, audio in stems.items():
        assert np.max(np.abs(audio)) <= 0.9991, stem_id
        if np.max(np.abs(ref_stems[stem_id])) > 1e-3:
            assert rel_err_db(audio, ref_stems[stem_id] * gain) < -80, f"{stem_id}: one common gain"


# ---------------------------------------------------------------------------
# progress, analysis, cancellation
# ---------------------------------------------------------------------------


def test_progress_is_monotonic_and_follows_stage_plan(make_run):
    run = make_run(**COMBOS["all_on"])
    execute(run)
    values = [p[2] for p in run.progress]
    assert values == sorted(values) and values[-1] == 1.0 and values[0] >= 0.0
    stages = []
    for stage, _label, _value in run.progress:
        assert stage in STAGE_IDS and stage not in ("queued", "done")
        if not stages or stages[-1] != stage:
            stages.append(stage)
    assert stages == [s for s, _ in stage_plan(run.ctx.options)]
    labels = {p[1] for p in run.progress}
    assert "Separating vocals (model 2 of 2)" in labels
    assert all(label.strip() for label in labels)


def test_analysis_is_reported_before_any_separation(make_run):
    run = make_run(**COMBOS["fast"])
    result = execute(run)
    kinds = [e[0] for e in run.events]
    assert kinds.index("analysis") < kinds.index("engine")
    analysis = next(e[1] for e in run.events if e[0] == "analysis")
    assert analysis == result.analysis
    assert analysis.duration_seconds == pytest.approx(2.5, abs=1e-3)
    assert (analysis.sample_rate, analysis.channels, analysis.codec) == (SR, 2, "pcm_f32le")


@pytest.mark.parametrize("stage", ["vocals", "drums", "cleanup", "denoise"])
def test_cancel_between_stages(make_run, stage):
    run = make_run(cancel_when=lambda s, label, v: s == stage, **COMBOS["all_on"])
    with pytest.raises(PipelineCancelled):
        execute(run)
    assert not run.ctx.stems_dir.exists()
    if stage == "drums":
        assert [c[0][0] for c in run.engine.calls][-1] == "BS-Roformer-SW.ckpt"


def test_cancel_inside_an_inference(make_run):
    # The ensemble reports "model 2 of 2" mid-call; the next engine progress
    # callback raises, so the cancellation comes out of engine.separate itself.
    run = make_run(cancel_when=lambda s, label, v: "model 2 of 2" in label, **COMBOS["all_on"])
    with pytest.raises(PipelineCancelled):
        execute(run)
    assert len(run.engine.calls) == 1
    assert not run.ctx.stems_dir.exists()


def test_cancel_while_writing_stems_leaves_nothing(make_run):
    seen = {"n": 0}

    def when(stage, label, value):
        if stage == "finalize":
            seen["n"] += 1
        return seen["n"] >= 25  # after conversion, part-way through writing

    run = make_run(cancel_when=when, **COMBOS["all_on"])
    with pytest.raises(PipelineCancelled):
        execute(run)
    assert seen["n"] >= 25
    assert not run.ctx.stems_dir.exists()


# ---------------------------------------------------------------------------
# errors
# ---------------------------------------------------------------------------


def test_undecodable_input_is_a_pipeline_error(make_run, tmp_path):
    bogus = tmp_path / "song.mp3"
    bogus.write_bytes(b"this is not audio" * 100)
    run = make_run(bogus)
    with pytest.raises(PipelineError, match="Unsupported or unreadable audio file"):
        execute(run)
    assert run.engine.calls == []


def test_too_long_input_is_a_pipeline_error(make_run, fake_settings):
    settings = dataclasses.replace(fake_settings, max_duration_seconds=1)
    run = make_run(rich_mix(seconds=2.5), settings=settings)
    with pytest.raises(PipelineError, match=r"0:02 long; the maximum is 0:01"):
        execute(run)


class ExplodingEngine(FakeEngine):
    def __init__(self, exc: BaseException, on_call: int = 1) -> None:
        super().__init__()
        self.exc, self.on_call = exc, on_call

    def separate(self, *args, **kwargs):
        if len(self.calls) + 1 >= self.on_call:
            self.calls.append(("boom",))
            raise self.exc
        return super().separate(*args, **kwargs)


@pytest.mark.parametrize("exc, message", [
    (MemoryError(), MEMORY_MESSAGE),
    (RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB"), GPU_MEMORY_MESSAGE),
    (EngineError("The separation model X could not be loaded on the server"),
     "The separation model X could not be loaded on the server"),
])
def test_engine_failures_become_user_messages(make_run, exc, message):
    run = make_run(engine=ExplodingEngine(exc, on_call=2), **COMBOS["fast"])
    with pytest.raises(PipelineError) as info:
        execute(run)
    assert str(info.value) == message
    assert not run.ctx.stems_dir.exists()


def test_unexpected_errors_propagate(make_run):
    run = make_run(engine=ExplodingEngine(ValueError("bug")), **COMBOS["fast"])
    with pytest.raises(ValueError, match="bug"):
        execute(run)


def test_default_engine_comes_from_settings(make_run, fake_settings):
    run = make_run(**COMBOS["fast"])
    engine = get_engine(fake_settings)
    assert isinstance(engine, FakeEngine) and get_engine(fake_settings) is engine
    before = len(engine.calls)
    result = run_pipeline(run.ctx)
    assert len(engine.calls) > before and result.stems


# ---------------------------------------------------------------------------
# FakeEngine
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("model", sorted(MODEL_STEMS))
def test_fake_engine_names_energy_and_determinism(model):
    x = rich_mix(seconds=1.0)
    engine = FakeEngine()
    out = engine.separate(x, model)
    assert tuple(out) == MODEL_STEMS[model]
    energy = float(np.sum(x.astype(np.float64) ** 2))
    for name, y in out.items():
        assert y.shape == x.shape and y.dtype == np.float32 and y.flags.c_contiguous
        assert float(np.sum(y.astype(np.float64) ** 2)) <= energy * (1 + 1e-6), name
    total = sum(out.values()).astype(np.float64)
    assert float(np.sum(total ** 2)) <= energy * (1 + 1e-6)
    again = FakeEngine().separate(x, model)
    for name in out:
        assert np.array_equal(out[name], again[name])


def test_fake_engine_ensemble_subset_and_progress():
    x = rich_mix(seconds=0.5)
    seen: List[float] = []
    out = FakeEngine().separate(x, list(MODEL_PLAN["vocals_max"].models), "avg_fft", 4, seen.append,
                                stems=("vocals",))
    assert list(out) == ["vocals"]
    assert seen == [0.0, 0.5, 0.5, 1.0]
    with pytest.raises(EngineError):
        FakeEngine().separate(x, "unknown_model.ckpt")
    with pytest.raises(ValueError):
        FakeEngine().separate(x[:1], "BS-Roformer-SW.ckpt")


# ---------------------------------------------------------------------------
# AudioSeparatorEngine against a stub Separator
# ---------------------------------------------------------------------------

LIB_STEM_NAMES = {  # capitalisation exactly as audio-separator 0.48 writes them
    "BS-Roformer-SW.ckpt": ["bass", "drums", "other", "vocals", "guitar", "piano"],
    "bs_roformer_karaoke_frazer_becruily.ckpt": ["Instrumental", "Vocals"],
    "mel_band_roformer_bleed_suppressor_v1.ckpt": ["Bleed", "Instrumental"],
    "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt": ["reverb", "noreverb"],
    "bs_roformer_vocals_resurrection_unwa.ckpt": ["other", "vocals"],
    "melband_roformer_big_beta6x.ckpt": ["other", "vocals"],
}


class StubSeparator:
    """Mimics audio_separator.separator.Separator's file behaviour."""

    instances: List["StubSeparator"] = []
    drop_stem: Optional[str] = None
    fail_load: bool = False

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.normalization_threshold = kwargs["normalization_threshold"]
        self.output_dir = kwargs["output_dir"]
        self.model_instance = None
        self.loaded = None
        self.threshold_at_load = None
        self.separations = 0
        self.logger = logging.getLogger("tests.stub_separator")
        StubSeparator.instances.append(self)

    def load_model(self, model_filename):
        if StubSeparator.fail_load:
            raise RuntimeError("download failed")
        self.threshold_at_load = self.normalization_threshold
        self.loaded = model_filename
        self.model_instance = types.SimpleNamespace(output_dir=self.output_dir)

    def download_model_files(self, model_filename):
        Path(self.kwargs["model_file_dir"], model_filename).write_bytes(b"ckpt")
        return model_filename, "MDXC", model_filename, "", None

    def separate(self, audio_file_path):
        data, rate = sf.read(audio_file_path, dtype="float32", always_2d=True)
        assert rate == SR and sf.info(audio_file_path).subtype == "FLOAT"
        self.separations += 1
        model_name = self.loaded.split(".")[0]
        files = []
        seed = sum(map(ord, self.loaded)) % 7
        for index, stem in enumerate(LIB_STEM_NAMES[self.loaded]):
            if stem == StubSeparator.drop_stem:
                continue
            name = f"input_({stem})_{model_name}.wav"
            gain = 0.5 * (index + 1) + 0.1 * seed
            sf.write(os.path.join(self.model_instance.output_dir, name), data * gain, rate, subtype="FLOAT")
            files.append(name)
        return files


@pytest.fixture
def stub_engine(tmp_path, monkeypatch):
    StubSeparator.instances = []
    StubSeparator.drop_stem = None
    StubSeparator.fail_load = False
    monkeypatch.setattr("tempfile.tempdir", str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()

    def factory(cache: int = 2, **kwargs) -> AudioSeparatorEngine:
        settings = dataclasses.replace(
            load_settings({"STEM_MASTER_DATA_DIR": str(tmp_path / "data")}), model_cache_size=cache)
        return AudioSeparatorEngine(settings, separator_factory=StubSeparator, **kwargs)

    return factory


def test_audio_separator_engine_io_and_no_normalisation(stub_engine, tmp_path):
    engine = stub_engine()
    x = rich_mix(seconds=0.5, peak=0.9)
    out = engine.separate(x, "BS-Roformer-SW.ckpt", overlap=3)
    assert tuple(out) == MODEL_STEMS["BS-Roformer-SW.ckpt"]
    sep = StubSeparator.instances[0]
    seed = sum(map(ord, "BS-Roformer-SW.ckpt")) % 7
    for index, name in enumerate(LIB_STEM_NAMES["BS-Roformer-SW.ckpt"]):
        expected = x * np.float32(0.5 * (index + 1) + 0.1 * seed)
        assert np.array_equal(out[name], expected), "float32 round trip, never rescaled"
    assert max(float(np.max(np.abs(a))) for a in out.values()) > 1.0
    kw = sep.kwargs
    assert kw["normalization_threshold"] == 1.0 and sep.threshold_at_load == 1e9
    assert kw["mdxc_params"]["overlap"] == 3 and kw["sample_rate"] == SR
    assert kw["use_soundfile"] is True and kw["output_format"] == "WAV"
    assert kw["log_level"] == logging.WARNING
    assert Path(kw["model_file_dir"]) == engine.model_dir
    assert os.listdir(tmp_path / "tmp") == [], "temp files are removed"


def test_audio_separator_engine_parses_capitalised_names_and_subsets(stub_engine):
    engine = stub_engine()
    x = rich_mix(seconds=0.3)
    assert list(engine.separate(x, "bs_roformer_karaoke_frazer_becruily.ckpt")) == ["instrumental", "vocals"]
    out = engine.separate(x, "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt", stems=["noreverb"])
    assert list(out) == ["noreverb"]
    StubSeparator.drop_stem = "Bleed"
    with pytest.raises(EngineError, match="incomplete output"):
        engine.separate(x, "mel_band_roformer_bleed_suppressor_v1.ckpt")


def test_audio_separator_engine_lru_cache(stub_engine):
    x = rich_mix(seconds=0.2)
    a, b = "BS-Roformer-SW.ckpt", "bs_roformer_karaoke_frazer_becruily.ckpt"
    engine = stub_engine(cache=1)
    for model in (a, b, a):
        engine.separate(x, model)
    assert [s.loaded for s in StubSeparator.instances] == [a, b, a]
    assert StubSeparator.instances[0].model_instance is None, "evicted separator is released"

    StubSeparator.instances = []
    engine = stub_engine(cache=2)
    for model in (a, b, a, b):
        engine.separate(x, model)
    assert [s.loaded for s in StubSeparator.instances] == [a, b]
    assert StubSeparator.instances[0].separations == 2
    engine.separate(x, a, overlap=7)
    assert len(StubSeparator.instances) == 3, "overlap is part of the cache key"
    engine.close()
    assert all(s.model_instance is None for s in StubSeparator.instances)

    StubSeparator.instances = []
    engine = stub_engine(cache=0)
    engine.separate(x, a)
    engine.separate(x, a)
    assert len(StubSeparator.instances) == 2 and all(s.model_instance is None for s in StubSeparator.instances)


def test_audio_separator_engine_load_failure(stub_engine):
    engine = stub_engine()
    StubSeparator.fail_load = True
    with pytest.raises(EngineError, match="could not be loaded"):
        engine.separate(rich_mix(seconds=0.2), "BS-Roformer-SW.ckpt")
    StubSeparator.fail_load = False
    engine.separate(rich_mix(seconds=0.2), "BS-Roformer-SW.ckpt")
    assert len(StubSeparator.instances) == 2, "a failed load is not cached"


def test_audio_separator_engine_ensembles_with_the_library_ensembler(stub_engine):
    pytest.importorskip("audio_separator.separator.ensembler")
    from audio_separator.separator.ensembler import Ensembler

    engine = stub_engine()
    x = rich_mix(seconds=0.5)
    models = list(MODEL_PLAN["vocals_max"].models)
    progress: List[float] = []
    out = engine.separate(x, models, "avg_wave", progress=progress.append)
    assert list(out) == ["other", "vocals"]
    singles = [stub_engine(cache=0).separate(x, m) for m in models]
    assert np.allclose(out["vocals"], (singles[0]["vocals"] + singles[1]["vocals"]) / 2, atol=1e-6)
    assert progress[0] == 0.0 and progress[-1] == 1.0 and 0.5 in progress

    out = engine.separate(x, models, "min_fft", stems=["vocals"])
    direct = Ensembler(logging.getLogger("t"), "min_fft").ensemble([s["vocals"] for s in singles])
    assert list(out) == ["vocals"] and out["vocals"].shape == x.shape
    assert np.allclose(out["vocals"], direct[:, : x.shape[1]], atol=1e-6)


def test_audio_separator_engine_prefetch(stub_engine):
    engine = stub_engine()
    assert engine.prefetch(["BS-Roformer-SW.ckpt", "BS-Roformer-SW.ckpt"]) == ["BS-Roformer-SW.ckpt"]
    assert (engine.model_dir / "BS-Roformer-SW.ckpt").is_file()
    assert StubSeparator.instances[-1].kwargs["info_only"] is True


def test_progress_hook_reports_inference_chunks():
    pytest.importorskip("audio_separator.separator.architectures.mdxc_separator")
    from audio_separator.separator.architectures import mdxc_separator

    engines_mod._install_progress_hook()
    seen: List[float] = []
    with engines_mod._reporting(seen.append):
        assert list(mdxc_separator.tqdm([10, 20, 30, 40])) == [10, 20, 30, 40]
    assert seen == [0.25, 0.5, 0.75, 1.0]
    assert list(mdxc_separator.tqdm([1, 2])) == [1, 2], "no callback: plain (silent) iteration"

    def boom(_fraction):
        raise PipelineCancelled()

    with engines_mod._reporting(boom), pytest.raises(PipelineCancelled):
        for _ in mdxc_separator.tqdm(range(3)):
            pass


@pytest.mark.parametrize("filename, base, stem", [
    ("mixture_(bass)_BS-Roformer-SW.wav", "mixture", "bass"),
    ("mixture_(Instrumental)_bs_roformer_karaoke_frazer_becruily.wav", "mixture", "instrumental"),
    ("mixture_(noreverb)_dereverb_mel_band_roformer_anvuew_sdr_19.wav", "mixture", "noreverb"),
    ("mixture_(hh)_MDX23C-DrumSep-aufr33-jarredou.wav", "mixture", "hh"),
    ("input_(No (Dry))_some_model.wav", "input", "no (dry)"),
    ("/abs/dir/input_(Vocals)_custom_ensemble_a_b.wav", "input", "vocals"),
    ("other_(Bleed)_model.wav", "input", "bleed"),
    ("no_stem_here.wav", "input", None),
])
def test_stem_name_from_filename(filename, base, stem):
    assert stem_name_from_filename(filename, base) == stem


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def test_cli_separate_with_fake_engine(tmp_path):
    source = write_source(tmp_path / "Song.wav", rich_mix(seconds=1.5))
    out = tmp_path / "out"
    env = dict(os.environ, STEM_MASTER_DATA_DIR=str(tmp_path / "data"), PYTHONPATH=str(SERVER_DIR))
    proc = subprocess.run(
        [sys.executable, "-m", "stem_master", "separate", str(source), "-o", str(out), "--engine", "fake",
         "--quality", "fast", "--no-drum-split", "--dereverb", "--format", "wav32f", "--check-sum"],
        cwd=str(SERVER_DIR), env=env, capture_output=True, text=True, timeout=300,
    )
    assert proc.returncode == 0, proc.stderr
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["product"] == "Stem Master by MP Audio" and manifest["engine"] == "fake"
    assert manifest["options"]["dereverb"] is True and manifest["options"]["output_format"] == "wav32f"
    ids = [s["id"] for s in manifest["stems"]]
    assert ids[:4] == ["vocals", "lead_vocals", "backing_vocals", "vocal_reverb"]
    for stem in manifest["stems"]:
        assert (out / stem["wav"]).is_file() and (out / stem["preview"]).is_file()
        assert "wav_url" not in stem
    assert manifest["sum_check_db"] is None or manifest["sum_check_db"] < -100
    assert "Sum of primary + removed stems vs source" in proc.stderr
    assert not [p for p in out.iterdir() if p.name.startswith(".stem-master-")], "work dir removed"

    again = subprocess.run(
        [sys.executable, "-m", "stem_master", "separate", str(source), "-o", str(out), "--engine", "fake"],
        cwd=str(SERVER_DIR), env=env, capture_output=True, text=True, timeout=300,
    )
    assert again.returncode == 2 and "not empty" in again.stderr


def test_cli_rejects_bad_input(tmp_path):
    env = dict(os.environ, STEM_MASTER_DATA_DIR=str(tmp_path / "data"), PYTHONPATH=str(SERVER_DIR))
    bogus = tmp_path / "x.wav"
    bogus.write_bytes(b"nope" * 64)
    proc = subprocess.run(
        [sys.executable, "-m", "stem_master", "separate", str(bogus), "-o", str(tmp_path / "o"), "--engine", "fake"],
        cwd=str(SERVER_DIR), env=env, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 1 and "error:" in proc.stderr
    assert not (tmp_path / "o" / "stems").exists()
    missing = subprocess.run(
        [sys.executable, "-m", "stem_master", "separate", str(tmp_path / "missing.wav"), "-o", str(tmp_path / "o")],
        cwd=str(SERVER_DIR), env=env, capture_output=True, text=True, timeout=120,
    )
    assert missing.returncode == 2


# ---------------------------------------------------------------------------
# real model (opt-in)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not os.environ.get("STEM_MASTER_TEST_MODEL_DIR"),
                    reason="set STEM_MASTER_TEST_MODEL_DIR to a directory with BS-Roformer-SW.ckpt")
def test_real_sw_model_on_a_clip(tmp_path):
    clip = next(iter(sorted(CLIP_DIR.glob("*/mixture.wav"))), None)
    if clip is None:
        pytest.skip("no MUSDB clip available")
    data, rate = sf.read(str(clip), dtype="float32", always_2d=True)
    x = np.ascontiguousarray(data[: 3 * rate].T)
    settings = dataclasses.replace(load_settings({"STEM_MASTER_DATA_DIR": str(tmp_path / "data")}),
                                   model_dir=Path(os.environ["STEM_MASTER_TEST_MODEL_DIR"]), model_cache_size=0)
    out = AudioSeparatorEngine(settings).separate(x, "BS-Roformer-SW.ckpt", overlap=2)
    assert sorted(out) == sorted(MODEL_STEMS["BS-Roformer-SW.ckpt"])
    for y in out.values():
        assert y.shape == x.shape and y.dtype == np.float32
    assert rel_err_db(sum(out.values()), x) < -10, "the six stems roughly add back up to the input"
