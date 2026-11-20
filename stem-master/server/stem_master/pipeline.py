"""The separation pipeline (SPEC section 2).

:func:`run_pipeline` turns one uploaded file into the delivered stems::

    analyze      decode at the source rate, loudness/BPM/key/artifact analysis
                 (``ctx.on_analysis`` fires here, before any model runs), then a
                 44.1 kHz stereo float32 working copy of the mix
    vocals       vocal model(s) -> vocals; instrumental = mix - vocals
    debleed      (cleanup) bleed suppressor on the instrumental; the bleed it
                 finds (instrumental - clean instrumental) -> vocal_ambience
    instruments  BS-Roformer-SW on the instrumental -> bass, drums, guitar,
                 piano, other; its "vocals" -> vocal_ambience; the residual
                 (input - all outputs) is added to other
    drums        (drum_split) DrumSep on drums -> kick, snare, toms, hihat,
                 ride, crash; residual -> drum_room; drums becomes a bus
    vocal_split  (vocal_split) karaoke model: lead = its "vocals",
                 backing = vocals - lead
    dereverb     (dereverb) per vocal part: dry = "noreverb",
                 reverb = part - dry, all reverb summed into vocal_reverb
                 (without vocal_split the dry vocal is vocals_dry)
    (fold)       vocal_ambience / drum_room more than 50 dB below the mix RMS
                 are folded into other / the loudest drum part (checked again
                 after cleanup/denoise, so a stem they emptied is not delivered)
    cleanup      (cleanup) cross-stem bleed mask on all primary stems, then
                 activity gate + range filter per stem; removed -> removed_bleed
    denoise      (denoise) neural denoise of the vocal primaries, then DSP
                 denoise of every primary stem; removed -> removed_noise
    finalize     buses = sums of their final primary children; every stem is
                 resampled to the source rate, trimmed to the source length and
                 converted to the source channel count; one common gain keeps
                 integer formats from clipping; WAV + AAC preview per stem.
                 For a source that is not 44.1 kHz, whatever the working rate
                 cannot represent (source - source resampled there and back:
                 e.g. 22-24 kHz of a 48 kHz file) is added to other, so the
                 delivered stems still sum to the source.

Every split keeps ``input - sum(outputs)`` somewhere, so at every point
``sum(primary) + sum(removed) == mix`` to float rounding (and, after the
round trip through the source rate, to about -110 dB).

Memory: everything is float32 at 44.1 kHz stereo (127 MB per stem for a
6-minute song). Arrays are dropped as soon as they are consumed and cleanup
runs in place; a 6-minute song with every option holds about 20 stem-sized
arrays at the peak (~2.5 GB) plus model memory.
"""

from __future__ import annotations

import logging
import math
import os
import shutil
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .catalog import CATALOG_ORDER, DRUM_PARTS, spec_for
from .dsp import audio_io
from .dsp.analysis import analyze, stem_stats
from .dsp.cleanup import bleed_mask, cleanup_stems
from .dsp.denoise import denoise_dsp
from .engines import EngineError, SeparationEngine, get_engine
from .jobs import PipelineCancelled, PipelineContext, PipelineError, PipelineResult
from .probe import ProbeError, probe_audio
from .schemas import STAGE_LABELS, Analysis, JobOptions, Stem, stem_preview_url, stem_wav_url

logger = logging.getLogger(__name__)

WORK_SAMPLE_RATE = 44100
"""Sample rate of all model inference and DSP (SPEC section 2)."""

NEGLIGIBLE_DB = -50.0
"""A residual stem this far (or further) below the mix RMS is folded away."""

CLIP_TARGET_PEAK = 0.999
"""Peak the common gain aims for when an integer-format stem would clip."""

INTEGER_FORMATS = frozenset({"wav24", "wav16"})

DURATION_GRACE_S = 0.5
"""Same tolerance as the API: container durations are approximate."""

UNKNOWN_KEY = "Unknown"
"""``Analysis.key`` when no key could be estimated (e.g. silence)."""

MEMORY_MESSAGE = "The server ran out of memory while processing this track. Try a shorter file or Fast quality."
GPU_MEMORY_MESSAGE = "The GPU ran out of memory while separating this track. Try again later or use Fast quality."


# ---------------------------------------------------------------------------
# model plan (SPEC section 2 table)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModelStep:
    """One engine call: a model, or an ensemble of models combined with
    ``ensemble_algorithm``."""

    models: Tuple[str, ...]
    ensemble_algorithm: Optional[str] = None

    @property
    def runs(self) -> int:
        """Model inferences this step costs (an ensemble runs every model)."""
        return len(self.models)


MODEL_PLAN: Dict[str, ModelStep] = {
    "vocals_max_cleanup": ModelStep(
        ("bs_roformer_vocals_revive_v2_unwa.ckpt", "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt"),
        "min_fft",
    ),
    "vocals_max": ModelStep(
        ("bs_roformer_vocals_resurrection_unwa.ckpt", "melband_roformer_big_beta6x.ckpt"),
        "avg_fft",
    ),
    "vocals_fast": ModelStep(("mel_band_roformer_kim_ft2_bleedless_unwa.ckpt",)),
    "debleed": ModelStep(("mel_band_roformer_bleed_suppressor_v1.ckpt",)),
    "instruments": ModelStep(("BS-Roformer-SW.ckpt",)),
    "drums": ModelStep(("MDX23C-DrumSep-aufr33-jarredou.ckpt",)),
    "vocal_split": ModelStep(("bs_roformer_karaoke_frazer_becruily.ckpt",)),
    "dereverb": ModelStep(("dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt",)),
    "vocal_denoise": ModelStep(("denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt",)),
}
"""Exact audio-separator 0.48.0 model filenames per pipeline step."""

# Output names taken from each model (lower-cased, as the engine returns them).
VOCALS_OUTPUT = "vocals"
DEBLEED_OUTPUT = "instrumental"
INSTRUMENT_OUTPUTS: Tuple[str, ...] = ("bass", "drums", "guitar", "piano", "other", "vocals")
DRUMSEP_OUTPUTS: Dict[str, str] = {
    "kick": "kick", "snare": "snare", "toms": "toms", "hh": "hihat", "ride": "ride", "crash": "crash",
}
KARAOKE_OUTPUT = "vocals"
DEREVERB_OUTPUT = "noreverb"
DENOISE_OUTPUT = "dry"

NEURAL_DENOISE_STEMS: Tuple[str, ...] = ("vocals", "lead_vocals", "backing_vocals", "vocals_dry")
"""Vocal primaries that get the neural denoise model before DSP denoise."""


def vocal_step(options: JobOptions) -> ModelStep:
    """The vocal/instrumental model step for ``options`` (quality x cleanup)."""
    if options.quality == "fast":
        return MODEL_PLAN["vocals_fast"]
    return MODEL_PLAN["vocals_max_cleanup" if options.cleanup else "vocals_max"]


def models_for(options: JobOptions) -> List[str]:
    """Every model filename a job with ``options`` uses, in pipeline order."""
    steps = [vocal_step(options)]
    if options.cleanup:
        steps.append(MODEL_PLAN["debleed"])
    steps.append(MODEL_PLAN["instruments"])
    if options.drum_split:
        steps.append(MODEL_PLAN["drums"])
    if options.vocal_split:
        steps.append(MODEL_PLAN["vocal_split"])
    if options.dereverb:
        steps.append(MODEL_PLAN["dereverb"])
    if options.denoise:
        steps.append(MODEL_PLAN["vocal_denoise"])
    return list(dict.fromkeys(model for step in steps for model in step.models))


def models_for_quality(quality: str) -> List[str]:
    """Every model any job of ``quality`` (``max`` | ``fast`` | ``all``) can use."""
    if quality == "all":
        qualities = ["max", "fast"]
    elif quality in ("max", "fast"):
        qualities = [quality]
    else:
        raise ValueError(f"quality must be max, fast or all, got {quality!r}")
    names: List[str] = []
    for q in qualities:
        for cleanup in (True, False):
            names += models_for(JobOptions(quality=q, cleanup=cleanup, drum_split=True, vocal_split=True,
                                           dereverb=True, denoise=True))
    return list(dict.fromkeys(names))


# ---------------------------------------------------------------------------
# progress
# ---------------------------------------------------------------------------

MODEL_RUN_WEIGHT = 10.0
"""Progress weight of one model inference (ensembles count per model)."""

DSP_WEIGHTS = {"analyze": 2.0, "cleanup": 6.0, "denoise_dsp": 3.0, "finalize": 5.0}


def _neural_denoise_runs(options: JobOptions) -> int:
    return 2 if options.vocal_split else 1


def _dereverb_runs(options: JobOptions) -> int:
    return 2 if options.vocal_split else 1


def stage_plan(options: JobOptions) -> List[Tuple[str, float]]:
    """``[(stage_id, weight)]`` of the stages a job with ``options`` runs, in
    the order of SPEC section 2 (the order the app's checklist shows)."""
    stages: List[Tuple[str, float]] = [
        ("analyze", DSP_WEIGHTS["analyze"]),
        ("vocals", MODEL_RUN_WEIGHT * vocal_step(options).runs),
    ]
    if options.cleanup:
        stages.append(("debleed", MODEL_RUN_WEIGHT))
    stages.append(("instruments", MODEL_RUN_WEIGHT))
    if options.drum_split:
        stages.append(("drums", MODEL_RUN_WEIGHT))
    if options.vocal_split:
        stages.append(("vocal_split", MODEL_RUN_WEIGHT))
    if options.dereverb:
        stages.append(("dereverb", MODEL_RUN_WEIGHT * _dereverb_runs(options)))
    if options.cleanup:
        stages.append(("cleanup", DSP_WEIGHTS["cleanup"]))
    if options.denoise:
        stages.append(("denoise", MODEL_RUN_WEIGHT * _neural_denoise_runs(options) + DSP_WEIGHTS["denoise_dsp"]))
    stages.append(("finalize", DSP_WEIGHTS["finalize"]))
    return stages


class _Progress:
    """Maps (stage, fraction of stage) onto one monotonic 0..1 job progress
    and checks for cancellation on every report."""

    def __init__(self, ctx: PipelineContext, plan: Sequence[Tuple[str, float]]) -> None:
        self.ctx = ctx
        total = sum(weight for _, weight in plan) or 1.0
        self._span: Dict[str, Tuple[float, float]] = {}
        offset = 0.0
        for stage_id, weight in plan:
            self._span[stage_id] = (offset / total, weight / total)
            offset += weight
        self.stage: Optional[str] = None
        self._last = 0.0

    def start(self, stage_id: str, label: Optional[str] = None) -> None:
        self.ctx.check_cancelled()
        self.stage = stage_id
        self.report(0.0, label)

    def report(self, fraction: float, label: Optional[str] = None) -> None:
        """Report ``fraction`` (0..1) of the current stage; raises
        :class:`PipelineCancelled` if the job was cancelled."""
        self.ctx.check_cancelled()
        stage = self.stage or "analyze"
        start, width = self._span.get(stage, (self._last, 0.0))
        fraction = min(1.0, max(0.0, float(fraction))) if math.isfinite(fraction) else 0.0
        value = max(self._last, min(1.0, start + width * fraction))
        self._last = value
        self.ctx.on_progress(stage, label or STAGE_LABELS.get(stage, stage), value)

    def callback(self, start: float, end: float, label: str) -> Callable[[float], None]:
        """An engine progress callback covering ``[start, end]`` of the stage."""

        def report(fraction: float) -> None:
            self.report(start + (end - start) * min(1.0, max(0.0, fraction)), label)

        return report

    def done(self) -> None:
        self.ctx.check_cancelled()
        self.ctx.on_progress("finalize", STAGE_LABELS["finalize"], 1.0)
        self._last = 1.0


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SourceInfo:
    """What the delivered files must match: the decoded source."""

    sample_rate: int
    channels: int
    frames: int
    codec: str


@dataclass
class _Delivered:
    id: str
    role: str
    name: str
    audio: Optional[np.ndarray]
    stats: Dict[str, object] = field(default_factory=dict)


def _rms(x: np.ndarray) -> float:
    if x.size == 0:
        return 0.0
    total = 0.0
    for start in range(0, x.shape[1], 1 << 20):
        block = x[:, start:start + (1 << 20)]
        total += float(np.einsum("ij,ij->", block, block, dtype=np.float64))
    return math.sqrt(total / x.size)


def _peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if x.size else 0.0


def _contiguous(x: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(x, dtype=np.float32)


def _sum(arrays: Sequence[np.ndarray], like: np.ndarray) -> np.ndarray:
    total = np.zeros_like(like, dtype=np.float32)
    for arr in arrays:
        total += arr
    return total


def _is_out_of_memory(exc: BaseException) -> bool:
    return "OutOfMemory" in type(exc).__name__ or "out of memory" in str(exc).lower()


def _format_duration(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    return f"{seconds // 60}:{seconds % 60:02d}"


def fold_negligible(stems: Dict[str, np.ndarray], mix_rms: float,
                    threshold_db: float = NEGLIGIBLE_DB) -> List[str]:
    """Fold residual stems that are ``threshold_db`` or more below ``mix_rms``.

    ``vocal_ambience`` goes into ``other``; ``drum_room`` into the loudest
    drum part present. Modifies ``stems`` in place (the sum of all stems is
    unchanged) and returns the ids that were folded away.
    """
    limit = mix_rms * 10.0 ** (threshold_db / 20.0)
    folded: List[str] = []
    ambience = stems.get("vocal_ambience")
    if ambience is not None and "other" in stems and _rms(ambience) <= limit:
        stems["other"] += stems.pop("vocal_ambience")
        folded.append("vocal_ambience")
    room = stems.get("drum_room")
    parts = [p for p in DRUM_PARTS if p in stems]
    if room is not None and parts and _rms(room) <= limit:
        loudest = max(parts, key=lambda p: (_rms(stems[p]), -DRUM_PARTS.index(p)))
        stems[loudest] += stems.pop("drum_room")
        folded.append("drum_room")
    return folded


def _encode_preview(wav: Path, m4a: Path) -> None:
    try:
        audio_io.encode_preview_aac(str(wav), str(m4a))
    except RuntimeError:
        logger.warning("Preview encoding of %s failed; retrying once", wav.name, exc_info=True)
        try:
            audio_io.encode_preview_aac(str(wav), str(m4a))
        except RuntimeError as exc:
            logger.error("Preview encoding of %s failed: %s", wav.name, exc)
            raise PipelineError("Could not create the preview audio for the stems") from exc


# ---------------------------------------------------------------------------
# the pipeline
# ---------------------------------------------------------------------------


class _Run:
    """State of one pipeline run (see the module docstring for the flow)."""

    def __init__(self, ctx: PipelineContext, engine: SeparationEngine) -> None:
        self.ctx = ctx
        self.options = ctx.options
        self.settings = ctx.settings
        self.engine = engine
        self.overlap = ctx.settings.overlap_for(ctx.options.quality)
        self.progress = _Progress(ctx, stage_plan(ctx.options))
        self.band_residual: Optional[np.ndarray] = None
        """Source-rate ``source - resample(resample(source))``; goes into ``other``."""

    # ------------------------------------------------------------ engine
    def _separate(self, audio: np.ndarray, step: ModelStep, outputs: Sequence[str], label: str,
                  start: float = 0.0, end: float = 1.0) -> Dict[str, np.ndarray]:
        """Run one model step; map engine failures to user-facing errors."""
        self.ctx.check_cancelled()
        runs = step.runs
        report = self.progress.callback(start, end, label)

        def on_progress(fraction: float) -> None:
            if runs > 1:
                index = min(runs, int(min(1.0, max(0.0, fraction)) * runs) + 1)
                report_label = f"{label} (model {index} of {runs})"
                self.progress.report(start + (end - start) * min(1.0, max(0.0, fraction)), report_label)
            else:
                report(fraction)

        try:
            out = self.engine.separate(
                audio, list(step.models), step.ensemble_algorithm, self.overlap, on_progress,
                stems=tuple(outputs),
            )
        except (PipelineCancelled, PipelineError):
            raise
        except EngineError as exc:
            raise PipelineError(str(exc)) from exc
        except MemoryError:
            raise PipelineError(MEMORY_MESSAGE) from None
        except RuntimeError as exc:
            if _is_out_of_memory(exc):
                logger.error("Out of memory in %s: %s", step.models, exc)
                raise PipelineError(GPU_MEMORY_MESSAGE) from None
            raise
        missing = [name for name in outputs if name not in out]
        if missing:
            logger.error("Engine returned %s for %s, missing %s", sorted(out), step.models, missing)
            raise PipelineError("A separation model returned incomplete output")
        result = {}
        for name in outputs:
            arr = out[name]
            if arr.shape != audio.shape:
                raise PipelineError("A separation model returned audio of the wrong length")
            result[name] = _contiguous(arr)
        self.ctx.check_cancelled()
        return result

    # ----------------------------------------------------------- stages
    def analyze(self) -> Tuple[np.ndarray, SourceInfo, Analysis]:
        self.progress.start("analyze")
        path = self.ctx.input_path
        try:
            probe_audio(path)  # plain local file + audio demuxers only (untrusted upload)
        except ProbeError as exc:
            raise PipelineError(f"Unsupported or unreadable audio file: {exc}") from None
        try:
            decoded = audio_io.decode_audio(str(path))
        except audio_io.AudioDecodeError as exc:
            logger.info("Decoding %s failed: %s", path, exc)
            raise PipelineError("The file could not be decoded as audio") from None
        limit = self.settings.max_duration_seconds
        if decoded.duration_seconds > limit + DURATION_GRACE_S:
            raise PipelineError(
                f"The track is {_format_duration(decoded.duration_seconds)} long; "
                f"the maximum is {_format_duration(limit)}"
            )
        self.progress.report(0.2)
        stats = analyze(decoded.samples, decoded.sample_rate)
        analysis = Analysis(
            duration_seconds=round(decoded.duration_seconds, 3),
            sample_rate=decoded.sample_rate,
            channels=decoded.channels,
            codec=decoded.codec,
            bpm=stats["bpm"],
            bpm_confidence=stats["bpm_confidence"],
            key=stats["key"] or UNKNOWN_KEY,
            camelot=stats["camelot"] or "",
            key_confidence=stats["key_confidence"],
            loudness_lufs=stats["loudness_lufs"],
            peak_dbfs=stats["peak_dbfs"],
            artifact_level=stats["artifact_level"],
            artifact_label=stats["artifact_label"],
            spectral_cutoff_hz=stats["spectral_cutoff_hz"],
        )
        self.ctx.on_analysis(analysis)
        source = SourceInfo(decoded.sample_rate, decoded.channels, decoded.num_frames, decoded.codec)
        self.progress.report(0.8)
        work = audio_io.resample(decoded.samples, decoded.sample_rate, WORK_SAMPLE_RATE)
        if decoded.sample_rate != WORK_SAMPLE_RATE:
            # What the 44.1 kHz working copy cannot carry (content above
            # 22.05 kHz of a 48/96 kHz source, plus resampler round-trip error),
            # kept at the source rate and added to "other" when stems are written.
            back = audio_io.fit_length(
                audio_io.resample(work, WORK_SAMPLE_RATE, decoded.sample_rate), decoded.num_frames)
            self.band_residual = _contiguous(decoded.samples - back)
            del back
        del decoded
        mix = _contiguous(audio_io.to_stereo(work))
        del work
        self.progress.report(1.0)
        return mix, source, analysis

    def separate_vocals(self, mix: np.ndarray) -> np.ndarray:
        self.progress.start("vocals")
        out = self._separate(mix, vocal_step(self.options), (VOCALS_OUTPUT,), STAGE_LABELS["vocals"])
        return out[VOCALS_OUTPUT]

    def debleed(self, instrumental: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """``(clean instrumental, bleed)`` with ``clean + bleed == instrumental``."""
        self.progress.start("debleed")
        out = self._separate(instrumental, MODEL_PLAN["debleed"], (DEBLEED_OUTPUT,), STAGE_LABELS["debleed"])
        clean = out.pop(DEBLEED_OUTPUT)
        return clean, instrumental - clean

    def split_instruments(self, instrumental: np.ndarray) -> Dict[str, np.ndarray]:
        self.progress.start("instruments")
        out = self._separate(instrumental, MODEL_PLAN["instruments"], INSTRUMENT_OUTPUTS,
                             STAGE_LABELS["instruments"])
        residual = instrumental.copy()
        for arr in out.values():
            residual -= arr
        out["other"] += residual
        return out

    def split_drums(self, drums: np.ndarray) -> Dict[str, np.ndarray]:
        self.progress.start("drums")
        out = self._separate(drums, MODEL_PLAN["drums"], tuple(DRUMSEP_OUTPUTS), STAGE_LABELS["drums"])
        parts = {DRUMSEP_OUTPUTS[name]: arr for name, arr in out.items()}
        room = drums.copy()
        for arr in parts.values():
            room -= arr
        result = {part: parts[part] for part in DRUM_PARTS}
        result["drum_room"] = room
        return result

    def split_vocals(self, vocals: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """``(lead, backing)`` with ``lead + backing == vocals``."""
        self.progress.start("vocal_split")
        out = self._separate(vocals, MODEL_PLAN["vocal_split"], (KARAOKE_OUTPUT,), STAGE_LABELS["vocal_split"])
        lead = out.pop(KARAOKE_OUTPUT)
        return lead, vocals - lead

    def dereverb(self, parts: Dict[str, np.ndarray]) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
        """Dry version of every vocal part plus their summed reverb."""
        self.progress.start("dereverb")
        dry: Dict[str, np.ndarray] = {}
        reverb: Optional[np.ndarray] = None
        count = len(parts)
        for index, (stem_id, part) in enumerate(parts.items()):
            label = f"{STAGE_LABELS['dereverb']} ({spec_for(stem_id).name.lower()})" if count > 1 \
                else STAGE_LABELS["dereverb"]
            out = self._separate(part, MODEL_PLAN["dereverb"], (DEREVERB_OUTPUT,), label,
                                 index / count, (index + 1) / count)
            clean = out.pop(DEREVERB_OUTPUT)
            tail = part - clean
            reverb = tail if reverb is None else reverb + tail
            dry["vocals_dry" if stem_id == "vocals" else stem_id] = clean
            del out, tail
        assert reverb is not None
        return dry, reverb

    def cleanup(self, primary: Dict[str, np.ndarray], mix: np.ndarray) -> np.ndarray:
        """SPEC 2.1 in place on ``primary``; returns what was removed.

        Equivalent to ``cleanup_stems(primary, mix, ...)``: the cross-stem bleed
        mask needs every stem at once, the gate and range filter are per stem,
        so they run as single-stem ``cleanup_stems`` calls (for one stem the
        bleed mask is the identity), which lets the job report progress and
        honour cancellation between stems.
        """
        strength = self.options.cleanup_strength
        self.progress.start("cleanup")
        _, removed = bleed_mask(primary, WORK_SAMPLE_RATE, strength, inplace=True)
        self.progress.report(0.5)
        ids = list(primary)
        for index, stem_id in enumerate(ids):
            _, gated_out = cleanup_stems({stem_id: primary[stem_id]}, mix, WORK_SAMPLE_RATE, strength, inplace=True)
            removed += gated_out
            del gated_out
            self.progress.report(0.5 + 0.5 * (index + 1) / len(ids))
        return removed

    def denoise(self, primary: Dict[str, np.ndarray]) -> np.ndarray:
        """SPEC 2.2: neural denoise of the vocal primaries, then DSP denoise of
        every primary stem; returns what was removed."""
        strength = self.options.denoise_strength
        self.progress.start("denoise")
        neural = [sid for sid in primary if sid in NEURAL_DENOISE_STEMS]
        dsp_weight = DSP_WEIGHTS["denoise_dsp"]
        total = MODEL_RUN_WEIGHT * len(neural) + dsp_weight
        removed = np.zeros_like(next(iter(primary.values())))
        for index, stem_id in enumerate(neural):
            start = MODEL_RUN_WEIGHT * index / total
            end = MODEL_RUN_WEIGHT * (index + 1) / total
            label = f"{STAGE_LABELS['denoise']} ({spec_for(stem_id).name.lower()})"
            out = self._separate(primary[stem_id], MODEL_PLAN["vocal_denoise"], (DENOISE_OUTPUT,), label,
                                 start, end)
            clean = out.pop(DENOISE_OUTPUT)
            removed += primary[stem_id] - clean
            primary[stem_id] = clean
            del out, clean
        base = MODEL_RUN_WEIGHT * len(neural) / total
        ids = list(primary)
        for index, stem_id in enumerate(ids):
            clean, taken = denoise_dsp(primary[stem_id], WORK_SAMPLE_RATE, strength)
            removed += taken
            primary[stem_id] = _contiguous(clean)
            del clean, taken
            self.progress.report(base + (1.0 - base) * (index + 1) / len(ids))
        return removed

    def finalize(self, delivered: List[_Delivered], source: SourceInfo) -> Tuple[List[Stem], float]:
        """Write every stem at the source rate/length/channels; returns the
        Stem records and the common gain (dB) that was applied."""
        ctx = self.ctx
        fmt = self.options.output_format
        self.progress.start("finalize")
        stems_dir = ctx.stems_dir
        if stems_dir.exists():
            shutil.rmtree(stems_dir)
        stems_dir.mkdir(parents=True)

        for index, item in enumerate(delivered):
            assert item.audio is not None
            y = item.audio
            if source.sample_rate != WORK_SAMPLE_RATE:
                y = audio_io.resample(y, WORK_SAMPLE_RATE, source.sample_rate)
            y = audio_io.to_channels(audio_io.fit_length(y, source.frames), source.channels)
            if item.id == "other" and self.band_residual is not None:
                y = y + self.band_residual
                self.band_residual = None
            item.audio = _contiguous(y)
            del y
            self.progress.report(0.4 * (index + 1) / len(delivered))

        gain_db = 0.0
        if fmt in INTEGER_FORMATS:
            peak = max(_peak(item.audio) for item in delivered if item.audio is not None)
            if peak > 1.0:
                # floor to 0.01 dB so the reported value is exactly what is applied
                gain_db = math.floor(20.0 * math.log10(CLIP_TARGET_PEAK / peak) * 100.0) / 100.0
                factor = np.float32(10.0 ** (gain_db / 20.0))
                logger.info("Job %s: peak %.3f would clip %s; applying %.2f dB to every stem",
                            ctx.job_id, peak, fmt, gain_db)
                for item in delivered:
                    assert item.audio is not None
                    item.audio = item.audio * factor

        workers = max(1, min(4, os.cpu_count() or 1))
        pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="stem-preview")
        previews: List[Future] = []
        try:
            for index, item in enumerate(delivered):
                ctx.check_cancelled()
                assert item.audio is not None
                wav = ctx.wav_path(item.id)
                audio_io.write_wav(str(wav), item.audio, source.sample_rate, fmt)
                item.stats = stem_stats(item.audio, source.sample_rate)
                item.audio = None
                previews.append(pool.submit(_encode_preview, wav, ctx.preview_path(item.id)))
                self.progress.report(0.4 + 0.6 * (index + 1) / len(delivered))
            for future in previews:
                ctx.check_cancelled()
                future.result()
        finally:
            for future in previews:
                future.cancel()
            pool.shutdown(wait=True)

        stems: List[Stem] = []
        for item in sorted(delivered, key=lambda d: CATALOG_ORDER[d.id]):
            spec = spec_for(item.id)
            wav, preview = ctx.wav_path(item.id), ctx.preview_path(item.id)
            stems.append(Stem(
                id=item.id, name=item.name, group=spec.group, role=item.role, color=spec.color,
                wav_url=stem_wav_url(ctx.job_id, item.id), preview_url=stem_preview_url(ctx.job_id, item.id),
                wav_bytes=wav.stat().st_size, preview_bytes=preview.stat().st_size if preview.is_file() else 0,
                peak_dbfs=item.stats["peak_dbfs"], rms_dbfs=item.stats["rms_dbfs"],
                active_ratio=item.stats["active_ratio"], waveform=item.stats["waveform"],
            ))
        return stems, gain_db

    # -------------------------------------------------------------- flow
    def run(self) -> PipelineResult:
        opts = self.options
        mix, source, analysis = self.analyze()
        mix_rms = _rms(mix)

        vocals = self.separate_vocals(mix)
        instrumental = mix - vocals
        ambience = np.zeros_like(mix)
        if opts.cleanup:
            instrumental, bleed = self.debleed(instrumental)
            ambience += bleed
            del bleed
        inst = self.split_instruments(instrumental)
        del instrumental
        ambience += inst.pop("vocals")

        drum_parts: Dict[str, np.ndarray]
        if opts.drum_split:
            drum_parts = self.split_drums(inst["drums"])
            del inst["drums"]
        else:
            drum_parts = {"drums": inst.pop("drums")}

        vocal_parts: Dict[str, np.ndarray]
        if opts.vocal_split:
            lead, backing = self.split_vocals(vocals)
            vocal_parts = {"lead_vocals": lead, "backing_vocals": backing}
            del lead, backing
        else:
            vocal_parts = {"vocals": vocals}
        del vocals
        reverb: Optional[np.ndarray] = None
        if opts.dereverb:
            vocal_parts, reverb = self.dereverb(vocal_parts)

        # primary stems in catalogue order
        primary: Dict[str, np.ndarray] = dict(vocal_parts)
        if reverb is not None:
            primary["vocal_reverb"] = reverb
        primary["vocal_ambience"] = ambience
        primary.update(drum_parts)
        for stem_id in ("bass", "guitar", "piano", "other"):
            primary[stem_id] = inst.pop(stem_id)
        del vocal_parts, reverb, ambience, drum_parts, inst
        folded = fold_negligible(primary, mix_rms)
        if folded:
            logger.info("Job %s: folded negligible %s", self.ctx.job_id, ", ".join(folded))
        for stem_id in list(primary):
            primary[stem_id] = _contiguous(primary[stem_id])

        removed: Dict[str, np.ndarray] = {}
        if opts.cleanup:
            removed["removed_bleed"] = self.cleanup(primary, mix)
        del mix
        if opts.denoise:
            removed["removed_noise"] = self.denoise(primary)
        if opts.cleanup or opts.denoise:
            # cleanup/denoise can leave a residual stem near-silent: never deliver that
            refolded = fold_negligible(primary, mix_rms)
            if refolded:
                logger.info("Job %s: folded %s after cleanup/denoise", self.ctx.job_id, ", ".join(refolded))

        delivered = self._assemble(primary, removed)
        primary.clear()
        removed.clear()
        stems, gain_db = self.finalize(delivered, source)
        self.progress.done()
        return PipelineResult(analysis=analysis, stems=stems, gain_offset_db=gain_db)

    def _assemble(self, primary: Dict[str, np.ndarray], removed: Dict[str, np.ndarray]) -> List[_Delivered]:
        """Primary, bus and removed stems in catalogue order (buses are sums of
        their final primary children)."""
        opts = self.options
        roles: Dict[str, str] = {stem_id: "primary" for stem_id in primary}
        audio: Dict[str, np.ndarray] = dict(primary)
        like = next(iter(primary.values()))
        if opts.vocal_split or opts.dereverb:
            children = [sid for sid in primary if spec_for(sid).group == "vocals"]
            audio["vocals"] = _sum([primary[sid] for sid in children], like)
            roles["vocals"] = "bus"
        if opts.drum_split:
            children = [sid for sid in primary if spec_for(sid).group == "drums"]
            audio["drums"] = _sum([primary[sid] for sid in children], like)
            roles["drums"] = "bus"
        for stem_id, arr in removed.items():
            audio[stem_id] = arr
            roles[stem_id] = "removed"

        delivered = []
        for stem_id in sorted(audio, key=lambda sid: CATALOG_ORDER[sid]):
            delivered.append(_Delivered(id=stem_id, role=roles[stem_id], name=self._display_name(stem_id),
                                        audio=audio[stem_id]))
        return delivered

    def _display_name(self, stem_id: str) -> str:
        name = spec_for(stem_id).name
        if self.options.dereverb and stem_id in ("lead_vocals", "backing_vocals"):
            return f"{name} (Dry)"
        return name


def run_pipeline(ctx: PipelineContext, *, engine: Optional[SeparationEngine] = None) -> PipelineResult:
    """Run SPEC section 2 for ``ctx`` and return the delivered stems.

    Writes ``<job_dir>/stems/<id>.wav`` and ``<id>.m4a`` for every stem.
    Raises :class:`PipelineCancelled` when ``ctx.is_cancelled()`` turns true
    (checked between every step, between models and between inference chunks)
    and :class:`PipelineError` with a user-facing message for undecodable or
    too-long input and out-of-memory conditions. On any exception the partial
    ``stems`` directory is removed. ``engine`` overrides the process-wide
    engine for ``ctx.settings.engine`` (tests).
    """
    started = time.monotonic()
    try:
        run = _Run(ctx, engine if engine is not None else get_engine(ctx.settings))
        try:
            result = run.run()
        except MemoryError:
            raise PipelineError(MEMORY_MESSAGE) from None
    except BaseException:
        shutil.rmtree(ctx.stems_dir, ignore_errors=True)
        raise
    logger.info("Job %s: %d stems in %.1f s", ctx.job_id, len(result.stems), time.monotonic() - started)
    return result


__all__ = [
    "DEBLEED_OUTPUT",
    "DENOISE_OUTPUT",
    "DEREVERB_OUTPUT",
    "DRUMSEP_OUTPUTS",
    "INSTRUMENT_OUTPUTS",
    "KARAOKE_OUTPUT",
    "MODEL_PLAN",
    "ModelStep",
    "NEGLIGIBLE_DB",
    "SourceInfo",
    "VOCALS_OUTPUT",
    "WORK_SAMPLE_RATE",
    "fold_negligible",
    "models_for",
    "models_for_quality",
    "run_pipeline",
    "stage_plan",
    "vocal_step",
]
