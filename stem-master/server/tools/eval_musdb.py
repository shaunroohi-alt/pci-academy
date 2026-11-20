"""Reproducible MUSDB18 evaluation of separation + Cleanup (SPEC 2 / 2.1).

This script is *not* part of the server; it produces the numbers quoted in
SPEC 2 / 2.1 and in the ``dsp/cleanup.py`` / ``pipeline.py`` docstrings. It
runs the **real** pipeline (``stem_master.pipeline``) with the real
audio-separator engine, wrapped in :class:`CachingEngine` so that every model
inference is stored on disk and never repeated: re-running a report, or
re-tuning the DSP, only costs DSP time.

    # 1. ground truth: MUSDB18 7-second previews -> float WAV clip folders
    python tools/eval_musdb.py extract --musdb DIR/test --out CLIPS [--tracks NAME ...]

    # 2. run variants (model outputs cached in CACHE, keyed by clip, model,
    #    overlap and a hash of the exact input audio)
    STEM_MASTER_MODEL_DIR=... python tools/eval_musdb.py run --clips CLIPS --cache CACHE \
        [--variants NAME|GROUP ...] [--json results.json]

    # 3. print the tables again from the JSON
    python tools/eval_musdb.py table --json results.json

    # 4. cleanup ablations / parameter grids on cached pre-cleanup stems
    python tools/eval_musdb.py sweep --clips CLIPS --cache CACHE [--base max/standard]

    python tools/eval_musdb.py list          # every variant and group

Clip folders hold ``mixture.wav`` and the four MUSDB targets ``vocals.wav``,
``drums.wav``, ``bass.wav``, ``other.wav`` (44.1 kHz). MUSDB data is treated
as untrusted input: it is only decoded by ffmpeg, never executed.

Metrics (per clip, then the **median over clips** per target):

* ``sdr`` - the "new SDR" of the MDX challenge / MVSEP:
  ``10 log10(|s|^2 / |s - s_hat|^2)`` over the whole clip (same as
  ``scratchpad/eval/eval_sdr.py``). Faithfulness.
* ``sir`` (and ``bss_sdr``, ``sar``) - BSSEval v4 via ``museval.evaluate``
  (1 s windows, median over windows; windows where the reference is silent
  are NaN and ignored). SIR measures how much of the *other* MUSDB sources an
  estimate contains: cleanliness / bleed.

Targets: ``vocals`` = every primary stem of the vocals group (incl.
``vocal_ambience``); ``vocal_main`` = the vocal stem(s) a user solos
(``vocals`` or ``lead_vocals + backing_vocals``, without
``vocal_ambience``); ``drums`` = drums group; ``bass``; ``other`` =
guitar + piano + other. Pipeline variants also report the energy of
``removed_bleed`` relative to the mix (``removed_db``) and the
``sum(primary) + sum(removed)`` vs mix error (``sum_err_db``, SPEC invariant).

Variant names: ``raw:sw`` (BS-Roformer-SW alone on the mix), ``voc:<models>``
(vocal model / ensemble alone; scored on vocals only), ``pipe:<quality>/<cleanup>``
(the real ``run_pipeline`` with the server defaults: drum split + vocal split
on, output wav32f), ``iso:...`` (stage isolation: the pipeline with one stage
overridden). See ``list``.
"""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import hashlib
import json
import logging
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import warnings
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from stem_master import pipeline  # noqa: E402
from stem_master.catalog import spec_for  # noqa: E402
from stem_master.config import load_settings  # noqa: E402
from stem_master.dsp import cleanup as cleanup_mod  # noqa: E402
from stem_master.engines import (  # noqa: E402
    AudioSeparatorEngine, SeparationEngine, _fit, normalize_models,
)
from stem_master.jobs import PipelineContext  # noqa: E402
from stem_master.pipeline import MODEL_PLAN, ModelStep  # noqa: E402
from stem_master.schemas import JobOptions  # noqa: E402

log = logging.getLogger("eval_musdb")

SR = 44100
TARGETS = ("vocals", "drums", "bass", "other")
REPORT_TARGETS = ("vocals", "vocal_main", "drums", "bass", "other")
MUSDB_STREAMS = {"mixture": 0, "drums": 1, "bass": 2, "other": 3, "vocals": 4}
BSS_REF_FLOOR_DB = -40.0
"""White-noise floor added to the BSSEval references (see :func:`bsseval`)."""

REVIVE = "bs_roformer_vocals_revive_v2_unwa.ckpt"
KIM = "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt"
RESURRECTION = "bs_roformer_vocals_resurrection_unwa.ckpt"
BETA6X = "melband_roformer_big_beta6x.ckpt"
SW = "BS-Roformer-SW.ckpt"
SHORT = {REVIVE: "revive", KIM: "kim", RESURRECTION: "res", BETA6X: "b6x", SW: "sw"}

DEFAULT_TRACKS = (
    "Al James - Schoolboy Facination", "AM Contra - Heart Peripheral", "BKS - Too Much",
    "Bobby Nobody - Stitch Up", "Raft Monk - Tiring", "The Easton Ellises - Falcon 69",
    "The Long Wait - Dark Horses", "Girls Under Glass - We Feel Alright",
    "Skelpolu - Resurrection", "Lyndsey Ollard - Catching Up",
)
"""The evaluation set: 10 MUSDB18 *test* tracks whose 7 s preview has
vocals, drums and bass active throughout (each within ~10 dB of the mix RMS)."""


# =========================================================================== IO
def _safe_name(name: str) -> str:
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in name)


def cmd_extract(args: argparse.Namespace) -> None:
    src = Path(args.musdb)
    out = Path(args.out)
    tracks = args.tracks or list(DEFAULT_TRACKS)
    for track in tracks:
        path = src / f"{track}.stem.mp4"
        if not path.is_file():
            raise SystemExit(f"missing {path}")
        dest = out / _safe_name(track)
        dest.mkdir(parents=True, exist_ok=True)
        for target, stream in MUSDB_STREAMS.items():
            wav = dest / f"{target}.wav"
            if wav.is_file():
                continue
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(path), "-map", f"0:{stream}",
                            "-c:a", "pcm_f32le", "-ar", str(SR), "-ac", "2", str(wav)], check=True)
        print(dest)


def _read(path: Path) -> np.ndarray:
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    if sr != SR:
        raise SystemExit(f"{path}: expected {SR} Hz, got {sr}")
    return np.ascontiguousarray(data.T)


@dataclasses.dataclass
class Clip:
    name: str
    dir: Path
    mix: np.ndarray
    refs: Dict[str, np.ndarray]


def load_clips(clips_dir: Path, limit: Optional[int] = None) -> List[Clip]:
    out = []
    for d in sorted(p for p in Path(clips_dir).iterdir() if (p / "mixture.wav").is_file()):
        refs = {t: _read(d / f"{t}.wav") for t in TARGETS}
        out.append(Clip(d.name, d, _read(d / "mixture.wav"), refs))
    if limit:
        out = out[:limit]
    if not out:
        raise SystemExit(f"no clip folders in {clips_dir}")
    return out


# ======================================================================= engine
class CachingEngine(SeparationEngine):
    """Wraps the real engine; caches each *single-model* inference on disk.

    The key is (clip tag, model, overlap, sha1 of the exact float32 input), so
    a downstream model that gets a different input (another vocal model ->
    another instrumental) is a different entry, and an unchanged chain is a
    cache hit all the way down. All of a model's stems are stored (``.npz``)
    whatever subset was asked for. Ensembles are recombined from the cached
    single-model outputs with audio-separator's own ``Ensembler`` exactly as
    :class:`~stem_master.engines.AudioSeparatorEngine` does.
    """

    name = "cached"

    def __init__(self, inner: Optional[SeparationEngine], cache_dir: Path) -> None:
        self.inner = inner
        self.cache_dir = Path(cache_dir)
        self.tag = "misc"
        self.hits = 0
        self.misses = 0
        self.infer_seconds = 0.0

    def _path(self, audio: np.ndarray, model: str, overlap: int) -> Path:
        h = hashlib.sha1()
        h.update(model.encode())
        h.update(SEGMENT_MODE.encode())
        h.update(str(int(overlap)).encode())
        h.update(str(audio.shape).encode())
        h.update(np.ascontiguousarray(audio, dtype=np.float32).tobytes())
        return self.cache_dir / "models" / self.tag / f"{model}@o{int(overlap)}-{h.hexdigest()[:20]}.npz"

    def single(self, audio: np.ndarray, model: str, overlap: int,
               progress: Optional[Callable[[float], None]] = None) -> Dict[str, np.ndarray]:
        path = self._path(audio, model, overlap)
        if path.is_file():
            self.hits += 1
            with np.load(path) as data:
                return {k: np.ascontiguousarray(data[k]) for k in data.files}
        if self.inner is None:
            raise RuntimeError(f"cache miss for {model} on {self.tag} and no engine configured")
        self.misses += 1
        started = time.monotonic()
        log.info("infer %s @o%d on %s", model, overlap, self.tag)
        out = self.inner.separate(audio, model, None, overlap, progress, stems=None)
        self.infer_seconds += time.monotonic() - started
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + f".{os.getpid()}.tmp.npz")
        np.savez(tmp, **out)
        os.replace(tmp, path)
        return out

    def separate(self, audio, models, ensemble_algorithm=None, overlap=None, progress=None, *, stems=None):
        names = normalize_models(models)
        overlap = int(overlap or 4)
        outs = [self.single(audio, m, overlap) for m in names]
        if len(outs) == 1:
            result = outs[0]
        else:
            algorithm = ensemble_algorithm or "avg_wave"
            keys = [k for k in outs[0] if all(k in o for o in outs[1:])]
            result = {k: _fit(AudioSeparatorEngine._ensembler(algorithm).ensemble([o[k] for o in outs]),
                              audio.shape[1]) for k in keys}
        if stems is not None:
            result = {str(s).lower(): result[str(s).lower()] for s in stems}
        return result

    def close(self) -> None:
        if self.inner is not None:
            self.inner.close()


SEGMENT_MODE = "model"
"""``model``: every model runs with its own segment length (see
:func:`use_model_segments`); ``short``: audio-separator's default for inputs
under 10 s. Part of every cache key."""


def use_model_segments() -> None:
    """Make audio-separator use each model's own segment length on short clips.

    audio-separator 0.48.0 switches any input shorter than 10 s to a 256-frame
    segment (2.55-2.96 s windows, ``MDXCSeparator._use_model_segment_override``).
    Full songs never take that path in production: they run with the model's
    own ``dim_t`` (8-23 s windows). The 6.8 s MUSDB previews are therefore run
    with the model segment too, so the context the models see matches
    production (one window per clip; production adds overlapping windows on
    longer input). It is also ~3x cheaper on CPU. Only this evaluation script
    patches the library; the server does not.
    """
    from audio_separator.separator.architectures import mdxc_separator  # noqa: PLC0415

    cls = mdxc_separator.MDXCSeparator
    if not getattr(cls, "_eval_model_segments", False):
        cls._use_model_segment_override = lambda self, seconds: bool(self.override_model_segment_size)
        cls._eval_model_segments = True


def make_engine(cache: Path, offline: bool = False) -> Tuple[CachingEngine, Any]:
    settings = load_settings()
    settings = dataclasses.replace(settings, model_cache_size=max(settings.model_cache_size, 8))
    inner = None
    if not offline:
        inner = AudioSeparatorEngine(settings)
        if SEGMENT_MODE == "model":
            use_model_segments()
    return CachingEngine(inner, cache), settings


# ====================================================================== metrics
def new_sdr(ref: np.ndarray, est: np.ndarray) -> float:
    ref = ref.astype(np.float64)
    num = float(np.sum(ref ** 2)) + 1e-9
    den = float(np.sum((ref - est) ** 2)) + 1e-9
    return 10.0 * math.log10(num / den)


def _db_ratio(x: np.ndarray, ref: np.ndarray) -> float:
    e = float(np.sum(np.square(x, dtype=np.float64)))
    r = float(np.sum(np.square(ref, dtype=np.float64))) + 1e-20
    return 10.0 * math.log10(e / r) if e > 0 else float("-inf")


def bsseval(refs: Mapping[str, np.ndarray], est: Mapping[str, np.ndarray], cache: Optional[Path] = None
            ) -> Dict[str, Dict[str, float]]:
    """museval v4 per estimate in ``est`` (keys from TARGETS order). Each
    estimate is decomposed against all four references, so its numbers do not
    depend on the other estimates; missing / silent estimates are filled with
    a tiny noise placeholder whose scores are discarded.

    The references get an independent white-noise floor :data:`BSS_REF_FLOOR_DB`
    below their own RMS (fixed seed). The MUSDB previews are AAC and have no
    content above ~16 kHz, which makes BSSEval's 512-lag reference Gram matrix
    near-singular; the resulting huge distortion filters leak edge transients
    into every 1 s window, so interference and artifacts cancel and SIR/SAR
    become meaningless (raw SW drums on Al James: SIR -15.0 dB at 7.9 dB
    SDR). With the floor the 1 s-window medians agree with a single
    whole-clip window (drums SIR 15.1 vs 15.1 dB; vocals 18.8 vs 18.7 dB)
    and SDR is unchanged to 0.1 dB.
    """
    import museval  # noqa: PLC0415

    h = hashlib.sha1()
    h.update(f"v2 floor {BSS_REF_FLOOR_DB}".encode())
    for t in TARGETS:
        if t in est:
            h.update(t.encode())
            h.update(np.ascontiguousarray(est[t], dtype=np.float32).tobytes())
    for t in TARGETS:
        h.update(np.ascontiguousarray(refs[t][:, :4096], dtype=np.float32).tobytes())
    key = h.hexdigest()
    path = None
    if cache is not None:
        path = cache / "metrics" / f"{key}.json"
        if path.is_file():
            return json.loads(path.read_text())
    rng = np.random.default_rng(0)
    n = refs[TARGETS[0]].shape[1]
    R = np.stack([refs[t].T for t in TARGETS]).astype(np.float64)
    for i in range(len(TARGETS)):
        rms = float(np.sqrt(np.mean(R[i] ** 2)))
        R[i] += rms * 10.0 ** (BSS_REF_FLOOR_DB / 20.0) * rng.standard_normal(R[i].shape)
    E = []
    for t in TARGETS:
        x = est.get(t)
        if x is None or not np.any(x):
            x = 1e-6 * rng.standard_normal((2, n)).astype(np.float32)
        E.append(x[:, :n].T.astype(np.float64))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sdr, isr, sir, sar = museval.evaluate(R, np.stack(E))
    out: Dict[str, Dict[str, float]] = {}
    for i, t in enumerate(TARGETS):
        if t not in est:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            out[t] = {"bss_sdr": float(np.nanmedian(sdr[i])), "sir": float(np.nanmedian(sir[i])),
                      "sar": float(np.nanmedian(sar[i])), "isr": float(np.nanmedian(isr[i]))}
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out))
    return out


def score(clip: Clip, est: Mapping[str, np.ndarray], removed: Optional[np.ndarray] = None,
          cache: Optional[Path] = None, with_bss: bool = True) -> Dict[str, Any]:
    """Metrics of one clip. ``est`` may hold any of REPORT_TARGETS."""
    res: Dict[str, Any] = {}
    for t in REPORT_TARGETS:
        if t in est:
            ref = clip.refs["vocals" if t == "vocal_main" else t]
            res[t] = {"sdr": new_sdr(ref, est[t])}
    if with_bss:
        main = {t: est[t] for t in TARGETS if t in est}
        for t, m in bsseval(clip.refs, main, cache).items():
            res[t].update(m)
        if "vocal_main" in est:
            if "vocals" in est and np.array_equal(est["vocal_main"], est["vocals"]):
                res["vocal_main"].update({k: v for k, v in res["vocals"].items() if k != "sdr"})
            else:
                m = bsseval(clip.refs, {"vocals": est["vocal_main"]}, cache)["vocals"]
                res["vocal_main"].update(m)
    if all(t in est for t in TARGETS):
        total = sum(est[t].astype(np.float64) for t in TARGETS)
        if removed is not None:
            total = total + removed
            res["removed_db"] = _db_ratio(removed, clip.mix)
        res["sum_err_db"] = _db_ratio(total - clip.mix, clip.mix)
    return res


# ===================================================================== variants
@dataclasses.dataclass(frozen=True)
class Variant:
    name: str
    kind: str                       # raw | voc | pipe
    help: str
    quality: str = "max"
    cleanup: Optional[str] = None   # None = off, else strength
    drum_split: bool = True
    vocal_split: bool = True
    vocal_step: Optional[ModelStep] = None   # override of pipeline.vocal_step
    debleed: Optional[bool] = None           # override: run the bleed-suppressor stage or not
    dsp_cleanup: bool = True                 # False: skip the DSP cleanup (stage isolation)
    official: bool = False                   # True: plain run_pipeline, no overrides


def _ens(models: Sequence[str], algo: Optional[str] = None) -> ModelStep:
    return ModelStep(tuple(models), algo if len(models) > 1 else None)


def _voc_name(step: ModelStep, overlap_tag: str = "") -> str:
    base = "+".join(SHORT.get(m, m) for m in step.models)
    if step.ensemble_algorithm:
        base += f"/{step.ensemble_algorithm}"
    return f"voc:{base}{overlap_tag}"


VOCAL_STEPS: List[ModelStep] = [
    _ens([REVIVE]), _ens([KIM]), _ens([RESURRECTION]), _ens([BETA6X]), _ens([SW]),
    _ens([REVIVE, KIM], "min_fft"), _ens([REVIVE, KIM], "avg_fft"),
    _ens([RESURRECTION, BETA6X], "avg_fft"), _ens([RESURRECTION, BETA6X], "min_fft"),
    _ens([RESURRECTION, REVIVE], "avg_fft"), _ens([RESURRECTION, KIM], "avg_fft"),
    _ens([BETA6X, KIM], "avg_fft"), _ens([RESURRECTION, BETA6X, KIM], "avg_fft"),
    _ens([RESURRECTION, BETA6X, REVIVE], "avg_fft"), _ens([RESURRECTION, BETA6X, REVIVE, KIM], "avg_fft"),
    _ens([RESURRECTION, BETA6X, SW], "avg_fft"), _ens([RESURRECTION, SW], "avg_fft"),
    _ens([RESURRECTION, BETA6X, KIM], "median_fft"),
]


def _variants() -> Dict[str, Variant]:
    v: Dict[str, Variant] = {}

    def add(x: Variant) -> None:
        v[x.name] = x

    add(Variant("raw:sw", "raw", "BS-Roformer-SW alone on the mix (overlap max); its stems do not sum to the mix"))
    for step in VOCAL_STEPS:
        add(Variant(_voc_name(step), "voc", "vocal model / ensemble alone on the mix (overlap max)",
                    vocal_step=step))
    add(Variant(_voc_name(_ens([KIM]), "@fast"), "voc", "kim alone, overlap fast", quality="fast",
                vocal_step=_ens([KIM])))
    # the real pipeline, server defaults (drum split + vocal split), wav32f
    for quality in ("max", "fast"):
        add(Variant(f"pipe:{quality}/off", "pipe", f"run_pipeline, quality {quality}, cleanup off",
                    quality=quality, official=True))
        for strength in ("light", "standard", "strong"):
            add(Variant(f"pipe:{quality}/{strength}", "pipe",
                        f"run_pipeline, quality {quality}, cleanup {strength}",
                        quality=quality, cleanup=strength, official=True))
    # stage isolation (no DSP cleanup; splits off since they do not change 4-target sums)
    for step in VOCAL_STEPS[:4] + VOCAL_STEPS[5:9] + [_ens([RESURRECTION, BETA6X, KIM], "avg_fft")]:
        if SW in step.models:
            continue
        add(Variant("iso:" + _voc_name(step)[4:], "pipe",
                    "pipeline without cleanup/debleed with this vocal step (vocal model -> SW on mix - vocals)",
                    drum_split=False, vocal_split=False, vocal_step=step, debleed=False, dsp_cleanup=False))
        add(Variant("iso:" + _voc_name(step)[4:] + "+debleed", "pipe",
                    "as above plus the bleed-suppressor stage on the instrumental",
                    cleanup="standard", drum_split=False, vocal_split=False, vocal_step=step, debleed=True,
                    dsp_cleanup=False))
    return v


VARIANTS = _variants()

GROUPS: Dict[str, List[str]] = {
    "core": ["raw:sw", "pipe:max/off", "pipe:fast/off", "pipe:max/light", "pipe:max/standard",
             "pipe:max/strong", "pipe:fast/standard"],
    "vocals": [n for n in VARIANTS if n.startswith("voc:")],
    "iso": [n for n in VARIANTS if n.startswith("iso:")],
    "pipe": [n for n in VARIANTS if n.startswith("pipe:")],
}
GROUPS["all"] = list(VARIANTS)


def resolve(names: Iterable[str]) -> List[str]:
    out: List[str] = []
    for n in names:
        if n in GROUPS:
            out += GROUPS[n]
        elif n in VARIANTS:
            out.append(n)
        else:
            raise SystemExit(f"unknown variant or group {n!r} (see `list`)")
    return list(dict.fromkeys(out))


# ---------------------------------------------------------------- pipeline run
class _EvalRun(pipeline._Run):
    """The real pipeline with optional stage overrides for isolation runs, and
    a capture of the primary stems right before cleanup (for sweeps)."""

    def __init__(self, ctx, engine, variant: Variant, capture: Optional[dict] = None) -> None:
        super().__init__(ctx, engine)
        self.variant = variant
        self.capture = capture

    def separate_vocals(self, mix):
        if self.variant.vocal_step is None:
            return super().separate_vocals(mix)
        self.progress.start("vocals")
        out = self._separate(mix, self.variant.vocal_step, (pipeline.VOCALS_OUTPUT,), "vocals")
        return out[pipeline.VOCALS_OUTPUT]

    def debleed(self, instrumental):
        if self.variant.debleed is False:
            return instrumental, np.zeros_like(instrumental)
        return super().debleed(instrumental)

    def cleanup(self, primary, mix):
        if self.capture is not None:
            self.capture["primary"] = {k: v.copy() for k, v in primary.items()}
            self.capture["mix"] = mix.copy()
        if not self.variant.dsp_cleanup:
            return np.zeros_like(mix)
        return super().cleanup(primary, mix)


@contextlib.contextmanager
def _patched(variant: Variant):
    """Isolation variants that turn debleed on without DSP cleanup still need
    ``options.cleanup`` true for the pipeline to call ``debleed``."""
    original = pipeline.vocal_step
    if variant.vocal_step is not None:
        pipeline.vocal_step = lambda options: variant.vocal_step  # progress weights only
    try:
        yield
    finally:
        pipeline.vocal_step = original


def run_pipeline_variant(clip: Clip, variant: Variant, engine: CachingEngine, settings,
                         capture: Optional[dict] = None) -> Tuple[Dict[str, np.ndarray], Optional[np.ndarray]]:
    options = JobOptions(quality=variant.quality, cleanup=variant.cleanup is not None,
                         cleanup_strength=variant.cleanup or "standard", drum_split=variant.drum_split,
                         vocal_split=variant.vocal_split, output_format="wav32f")
    tmp = Path(tempfile.mkdtemp(prefix="eval-musdb-"))
    try:
        ctx = PipelineContext(job_id=uuid.uuid4().hex, job_dir=tmp, input_path=clip.dir / "mixture.wav",
                              options=options, settings=settings, on_progress=lambda *a: None,
                              on_analysis=lambda a: None, is_cancelled=lambda: False)
        engine.tag = clip.name
        if variant.official and capture is None:
            result = pipeline.run_pipeline(ctx, engine=engine)
        else:
            with _patched(variant):
                result = _EvalRun(ctx, engine, variant, capture).run()
        acc: Dict[str, np.ndarray] = {}
        removed = None
        for stem in result.stems:
            if stem.role == "bus":
                continue
            x = _read(ctx.wav_path(stem.id))
            if stem.role == "removed":
                removed = x if removed is None else removed + x
                continue
            group = spec_for(stem.id).group
            target = {"vocals": "vocals", "drums": "drums", "bass": "bass", "instruments": "other"}[group]
            acc[target] = acc.get(target, 0) + x
            if group == "vocals" and stem.id != "vocal_ambience":
                acc["vocal_main"] = acc.get("vocal_main", 0) + x
        for t in TARGETS:
            acc.setdefault(t, np.zeros_like(clip.mix))
        return acc, removed
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_variant(clip: Clip, variant: Variant, engine: CachingEngine, settings
                ) -> Tuple[Dict[str, np.ndarray], Optional[np.ndarray]]:
    engine.tag = clip.name
    if variant.kind == "raw":
        out = engine.separate(clip.mix, SW, None, settings.overlap_max)
        est = {"vocals": out["vocals"], "drums": out["drums"], "bass": out["bass"],
               "other": out["guitar"] + out["piano"] + out["other"]}
        return est, None
    if variant.kind == "voc":
        assert variant.vocal_step is not None
        overlap = settings.overlap_for(variant.quality)
        out = engine.separate(clip.mix, list(variant.vocal_step.models), variant.vocal_step.ensemble_algorithm,
                              overlap, stems=("vocals",))
        return {"vocals": out["vocals"]}, None
    return run_pipeline_variant(clip, variant, engine, settings)


# ===================================================================== reports
def _median(values: Sequence[float]) -> float:
    vals = [v for v in values if v is not None and math.isfinite(v)]
    return float(np.median(vals)) if vals else float("nan")


def aggregate(per_clip: Mapping[str, Mapping[str, Any]]) -> Dict[str, Any]:
    agg: Dict[str, Any] = {}
    clips = list(per_clip.values())
    for t in REPORT_TARGETS:
        keys = sorted({k for c in clips if t in c for k in c[t]})
        if keys:
            agg[t] = {k: _median([c[t].get(k) for c in clips if t in c]) for k in keys}
    for k in ("removed_db", "sum_err_db"):
        vals = [c[k] for c in clips if k in c]
        if vals:
            agg[k] = _median(vals) if k == "removed_db" else float(max(vals))
    agg["n"] = len(clips)
    return agg


def _fmt(x: Optional[float], width: int = 6) -> str:
    if x is None or not math.isfinite(x):
        return " " * (width - 1) + "-"
    return f"{x:{width}.2f}"


def print_table(results: Mapping[str, Any], names: Optional[Sequence[str]] = None, file=sys.stdout) -> None:
    names = list(names or results["variants"].keys())
    head = f"{'variant':44s} " + " ".join(f"{t[:9]:>13s}" for t in REPORT_TARGETS) + "   removed  sum_err"
    print(head, file=file)
    print(f"{'':44s} " + " ".join(f"{'SDR':>6s} {'SIR':>6s}" for _ in REPORT_TARGETS) + "      (dB)     (dB)", file=file)
    for name in names:
        if name not in results["variants"]:
            continue
        a = results["variants"][name]["median"]
        cells = []
        for t in REPORT_TARGETS:
            m = a.get(t, {})
            cells.append(f"{_fmt(m.get('sdr'))} {_fmt(m.get('sir'))}")
        print(f"{name:44s} " + " ".join(cells) + f"  {_fmt(a.get('removed_db'), 8)} {_fmt(a.get('sum_err_db'), 8)}",
              file=file)
    print(f"(median over {next(iter(results['variants'].values()))['median'].get('n', '?')} clips; "
          "SDR = new SDR, SIR = museval v4)", file=file)


def cmd_run(args: argparse.Namespace) -> None:
    names = resolve(args.variants or ["core"])
    clips = load_clips(Path(args.clips), args.limit)
    cache = Path(args.cache)
    engine, settings = make_engine(cache, offline=args.offline)
    results: Dict[str, Any] = {"clips": [c.name for c in clips], "variants": {}}
    out_path = Path(args.json) if args.json else None
    if out_path is not None and out_path.is_file() and not args.fresh:
        old = json.loads(out_path.read_text())
        results["variants"].update(old.get("variants", {}))
    order = clips if not args.clip_major else clips
    for name in names:
        variant = VARIANTS[name]
        per_clip: Dict[str, Any] = {}
        started = time.monotonic()
        for clip in order:
            est, removed = run_variant(clip, variant, engine, settings)
            per_clip[clip.name] = score(clip, est, removed, cache, with_bss=not args.no_bss)
            print(f"  {name:40s} {clip.name[:40]:40s} " +
                  " ".join(f"{t[:5]} {per_clip[clip.name][t]['sdr']:6.2f}" for t in REPORT_TARGETS
                           if t in per_clip[clip.name]), flush=True)
        results["variants"][name] = {"help": variant.help, "per_clip": per_clip, "median": aggregate(per_clip)}
        print(f"{name}: {time.monotonic() - started:.0f} s (cache hits {engine.hits}, inferences {engine.misses}, "
              f"{engine.infer_seconds:.0f} s inference)", flush=True)
        if out_path is not None:
            out_path.write_text(json.dumps(results, indent=1))
    print()
    print_table(results, names)


def cmd_table(args: argparse.Namespace) -> None:
    results = json.loads(Path(args.json).read_text())
    names = resolve(args.variants) if args.variants else None
    print_table(results, names)


def cmd_list(args: argparse.Namespace) -> None:
    for name, v in VARIANTS.items():
        print(f"{name:44s} {v.help}")
    print()
    for g, names in GROUPS.items():
        print(f"group {g}: {len(names)} variants")


# ======================================================================= sweep
def _targets_from_primary(primary: Mapping[str, np.ndarray], like: np.ndarray) -> Dict[str, np.ndarray]:
    acc: Dict[str, np.ndarray] = {t: np.zeros_like(like) for t in TARGETS}
    acc["vocal_main"] = np.zeros_like(like)
    for sid, x in primary.items():
        group = spec_for(sid).group
        target = {"vocals": "vocals", "drums": "drums", "bass": "bass", "instruments": "other"}[group]
        acc[target] = acc[target] + x
        if group == "vocals" and sid != "vocal_ambience":
            acc["vocal_main"] = acc["vocal_main"] + x
    return acc


def pre_cleanup(clip: Clip, base: Variant, engine: CachingEngine, settings) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    """The primary stems the pipeline hands to cleanup for ``base`` (and the mix)."""
    capture: Dict[str, Any] = {}
    run_pipeline_variant(clip, dataclasses.replace(base, official=False), engine, settings, capture)
    return capture["primary"], capture["mix"]


def cleanup_with(primary: Mapping[str, np.ndarray], mix: np.ndarray, fn: Callable[..., Tuple[Dict, np.ndarray]]
                 ) -> Tuple[Dict[str, np.ndarray], np.ndarray]:
    stems = {k: v.copy() for k, v in primary.items()}
    return fn(stems, mix)


def cmd_sweep(args: argparse.Namespace) -> None:
    """Score cleanup candidates on the cached pre-cleanup stems of ``--base``.

    Candidates are named ``<strength>`` (the shipped parameters) or the
    built-in ablations below; every candidate runs through
    ``stem_master.dsp.cleanup`` functions on copies of the same stems.
    """
    clips = load_clips(Path(args.clips), args.limit)
    cache = Path(args.cache)
    engine, settings = make_engine(cache, offline=args.offline)
    base = VARIANTS[f"pipe:{args.base}"]
    cands = sweep_candidates()
    names = args.candidates or list(cands)
    results: Dict[str, Any] = {"clips": [c.name for c in clips], "variants": {}}
    per: Dict[str, Dict[str, Any]] = {n: {} for n in names}
    for clip in clips:
        primary, mix = pre_cleanup(clip, base, engine, settings)
        for n in names:
            cleaned, removed = cleanup_with(primary, mix, cands[n])
            per[n][clip.name] = score(clip, _targets_from_primary(cleaned, mix), removed, cache,
                                      with_bss=not args.no_bss)
        print(f"  {clip.name}", flush=True)
    for n in names:
        results["variants"][n] = {"help": n, "per_clip": per[n], "median": aggregate(per[n])}
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=1))
    print_table(results, names)


def sweep_candidates() -> Dict[str, Callable[..., Tuple[Dict[str, np.ndarray], np.ndarray]]]:
    """Cleanup candidates for ``sweep``: off, the shipped strengths, and
    ablations of each sub-step (mask / gate / range filter alone)."""
    sr = pipeline.WORK_SAMPLE_RATE

    def off(stems, mix):
        return stems, np.zeros_like(mix)

    def shipped(strength):
        def fn(stems, mix):
            return cleanup_mod.cleanup_stems(stems, mix, sr, strength, inplace=True)
        return fn

    def mask_only(strength):
        def fn(stems, mix):
            return cleanup_mod.bleed_mask(stems, sr, strength, inplace=True)
        return fn

    def gate_only(strength):
        def fn(stems, mix):
            removed = np.zeros_like(mix)
            out = {}
            for sid, x in stems.items():
                y, r = cleanup_mod.activity_gate(x, mix, sr, strength)
                out[sid] = y
                removed += r
            return out, removed
        return fn

    def range_only(stems, mix):
        removed = np.zeros_like(mix)
        out = {}
        for sid, x in stems.items():
            y, r = cleanup_mod.range_filter(sid, x, sr)
            out[sid] = y
            removed += r
        return out, removed

    cands: Dict[str, Callable] = {"off": off, "range": range_only}
    for s in cleanup_mod.STRENGTHS:
        cands[s] = shipped(s)
        cands[f"mask/{s}"] = mask_only(s)
        cands[f"gate/{s}"] = gate_only(s)
    return cands


# ======================================================================== main
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract", help="MUSDB18 .stem.mp4 -> clip folders of float WAVs")
    e.add_argument("--musdb", required=True, help="folder with <track>.stem.mp4 (e.g. musdb7/test)")
    e.add_argument("--out", required=True)
    e.add_argument("--tracks", nargs="*", help=f"track names (default: the {len(DEFAULT_TRACKS)} below)")
    e.set_defaults(func=cmd_extract)
    for name, func in (("run", cmd_run), ("sweep", cmd_sweep)):
        r = sub.add_parser(name)
        r.add_argument("--clips", required=True)
        r.add_argument("--cache", required=True)
        r.add_argument("--limit", type=int, help="only the first N clips")
        r.add_argument("--json", help="results file")
        r.add_argument("--no-bss", action="store_true", help="skip museval (SDR only, faster)")
        r.add_argument("--offline", action="store_true", help="fail on a cache miss instead of running a model")
        r.set_defaults(func=func)
    run = sub.choices["run"]
    run.add_argument("--variants", nargs="*", help="variant names or groups (default: core)")
    run.add_argument("--fresh", action="store_true", help="do not merge into an existing --json")
    run.add_argument("--clip-major", action="store_true")
    sw = sub.choices["sweep"]
    sw.add_argument("--base", default="max/standard", help="pipeline variant whose pre-cleanup stems are used")
    sw.add_argument("--candidates", nargs="*")
    t = sub.add_parser("table")
    t.add_argument("--json", required=True)
    t.add_argument("--variants", nargs="*")
    t.set_defaults(func=cmd_table)
    sub.add_parser("list").set_defaults(func=cmd_list)
    return p


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for noisy in ("stem_master", "audio_separator"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    args = build_parser().parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
