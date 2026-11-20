"""Separation engines: the audio-separator (RoFormer / MDX23C) backend and a
deterministic DSP stand-in used by tests and ``STEM_MASTER_ENGINE=fake``.

Engine contract
---------------
``engine.separate(audio, models, ensemble_algorithm=None, overlap=None,
progress=None, *, stems=None)`` takes float32 audio shaped ``(2, n)`` at
44.1 kHz and returns ``{stem_name: (2, n) float32}``. Stem names are the
model's own output names, lower-cased (``vocals``, ``other``,
``instrumental``, ``bleed``, ``bass``, ``drums``, ``guitar``, ``piano``,
``kick``, ``snare``, ``toms``, ``hh``, ``ride``, ``crash``, ``noreverb``,
``reverb``, ``dry`` ...; see :data:`MODEL_STEMS`). Every returned array has
exactly ``n`` samples. ``stems`` optionally restricts the result to the
names the caller will use (the rest is never read into memory).

``models`` is one model filename or a list. A list is an ensemble: every
model runs on the same input and each stem is combined with
``ensemble_algorithm`` (audio-separator's own :class:`Ensembler`, so
``min_fft`` / ``avg_fft`` mean exactly what they mean there).

``progress(fraction)`` is called with 0..1 for the whole call (an ensemble of
k models reports model i over ``[i/k, (i+1)/k]``). Exceptions raised by the
callback propagate out of :meth:`separate` unchanged, so a pipeline can
cancel a long inference from inside it.

Nothing is ever normalised: stem gain is preserved bit-for-bit through the
model's float32 output files.
"""

from __future__ import annotations

import abc
import gc
import logging
import os
import re
import shutil
import tempfile
import threading
from collections import OrderedDict
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple, Union

import numpy as np
import soundfile as sf

from .config import Settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
"""All inference runs at 44.1 kHz stereo (SPEC section 2)."""

ProgressFn = Callable[[float], None]
ModelSpec = Union[str, Sequence[str]]

ENSEMBLE_ALGORITHMS: Tuple[str, ...] = (
    "avg_wave", "median_wave", "min_wave", "max_wave",
    "avg_fft", "median_fft", "min_fft", "max_fft",
)
"""Ensemble algorithms supported by both engines."""

MODEL_STEMS: Dict[str, Tuple[str, ...]] = {
    "bs_roformer_vocals_revive_v2_unwa.ckpt": ("vocals", "other"),
    "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt": ("vocals", "other"),
    "bs_roformer_vocals_resurrection_unwa.ckpt": ("vocals", "other"),
    "melband_roformer_big_beta6x.ckpt": ("vocals", "other"),
    "mel_band_roformer_bleed_suppressor_v1.ckpt": ("instrumental", "bleed"),
    "BS-Roformer-SW.ckpt": ("bass", "drums", "other", "vocals", "guitar", "piano"),
    "MDX23C-DrumSep-aufr33-jarredou.ckpt": ("kick", "snare", "toms", "hh", "ride", "crash"),
    "bs_roformer_karaoke_frazer_becruily.ckpt": ("vocals", "instrumental"),
    "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt": ("noreverb", "reverb"),
    "denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt": ("dry", "other"),
}
"""Lower-cased output stem names of every model the pipeline uses, as
audio-separator 0.48.0 writes them (verified by running each model on a real
clip: e.g. the karaoke model writes ``(Vocals)``/``(Instrumental)``, the bleed
suppressor ``(Bleed)``/``(Instrumental)``)."""

INPUT_BASENAME = "input"
"""Base name of the temporary input file; output files are
``input_(<Stem>)_<model name>.wav``."""


class EngineError(RuntimeError):
    """A model could not be downloaded or loaded, or produced unusable output.

    The message is safe to show to an end user (no paths); details are logged.
    """


# ---------------------------------------------------------------------------
# helpers shared by both engines
# ---------------------------------------------------------------------------


def normalize_models(models: ModelSpec) -> Tuple[str, ...]:
    """``"a.ckpt"`` or ``["a.ckpt", "b.ckpt"]`` -> ``("a.ckpt", ...)`` (validated)."""
    if isinstance(models, (str, os.PathLike)):
        names = (os.fspath(models),)
    else:
        names = tuple(os.fspath(m) for m in models)
    if not names:
        raise ValueError("at least one model filename is required")
    for name in names:
        if not name or os.path.basename(name) != name:
            raise ValueError(f"model must be a bare filename, got {name!r}")
    return names


def stem_name_from_filename(filename: str, input_base: str = INPUT_BASENAME) -> Optional[str]:
    """Lower-cased stem name from an audio-separator output filename.

    Files are named ``<input_base>_(<Stem>)_<model name>.<ext>`` where the
    model name is the checkpoint filename cut at its first dot (so
    ``..._sdr_19.1729.ckpt`` appears as ``..._sdr_19``). The stem is taken as
    everything between ``<input_base>_(`` and the last ``)_`` that is followed
    by a parenthesis-free model name, which also copes with stem names that
    themselves contain parentheses. Files that do not start with the input
    base fall back to the library's own rule (the first ``_(...)`` group).
    Returns ``None`` if no stem name can be found.
    """
    name = os.path.basename(filename)
    match = re.match(
        rf"^{re.escape(input_base)}_\((?P<stem>.+)\)_[^()]*\.[A-Za-z0-9]+$", name
    )
    if match is None:
        match = re.search(r"_\((?P<stem>[^)]+)\)", name)
    if match is None:
        return None
    stem = match.group("stem").strip().lower()
    return stem or None


def _as_stereo_input(audio: np.ndarray) -> np.ndarray:
    arr = np.asarray(audio)
    if arr.ndim != 2 or arr.shape[0] != 2:
        raise ValueError(f"engine input must be shaped (2, n), got {arr.shape}")
    if arr.shape[1] == 0:
        raise ValueError("engine input has no samples")
    arr = np.ascontiguousarray(arr, dtype=np.float32)
    if not np.isfinite(arr).all():
        raise ValueError("engine input contains non-finite samples")
    return arr


def _fit(x: np.ndarray, n: int) -> np.ndarray:
    """``(c, m)`` float32 -> ``(2, n)`` float32 C-contiguous (pad/trim, mono -> stereo)."""
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]
    if arr.shape[0] == 1:
        arr = np.repeat(arr, 2, axis=0)
    elif arr.shape[0] > 2:
        arr = arr[:2]
    m = arr.shape[1]
    if m != n:
        out = np.zeros((2, n), dtype=np.float32)
        out[:, : min(m, n)] = arr[:, : min(m, n)]
        arr = out
    return np.ascontiguousarray(arr)


def _sub_progress(progress: Optional[ProgressFn], index: int, count: int) -> Optional[ProgressFn]:
    """Map a 0..1 callback onto ``[index/count, (index+1)/count]`` of ``progress``."""
    if progress is None:
        return None

    def report(fraction: float) -> None:
        fraction = min(1.0, max(0.0, float(fraction)))
        progress((index + fraction) / count)

    return report


def _wanted(stems: Optional[Iterable[str]]) -> Optional[Tuple[str, ...]]:
    if stems is None:
        return None
    return tuple(dict.fromkeys(str(s).lower() for s in stems))


def _common_keys(outputs: Sequence[Dict[str, np.ndarray]]) -> List[str]:
    keys = [k for k in outputs[0] if all(k in o for o in outputs[1:])]
    if not keys:
        raise EngineError("The ensemble models produced no common stem")
    return keys


# ---------------------------------------------------------------------------
# engine interface
# ---------------------------------------------------------------------------


class SeparationEngine(abc.ABC):
    """Runs separation models on in-memory audio (see the module docstring)."""

    name: str = "engine"

    @abc.abstractmethod
    def separate(
        self,
        audio: np.ndarray,
        models: ModelSpec,
        ensemble_algorithm: Optional[str] = None,
        overlap: Optional[int] = None,
        progress: Optional[ProgressFn] = None,
        *,
        stems: Optional[Sequence[str]] = None,
    ) -> Dict[str, np.ndarray]:
        """Separate ``audio`` (float32 ``(2, n)`` @ 44.1 kHz) with ``models``."""

    def prefetch(self, models: Iterable[str]) -> List[str]:
        """Make sure the model files are available locally (no inference).
        Returns the model filenames that were checked."""
        return list(models)

    def close(self) -> None:
        """Release loaded models and any other resources."""


# ---------------------------------------------------------------------------
# audio-separator backend
# ---------------------------------------------------------------------------

_hook_state = threading.local()
_hook_lock = threading.Lock()
_hook_installed = False


def _track(iterable: Any, callback: ProgressFn) -> Iterator[Any]:
    try:
        total = len(iterable)
    except TypeError:
        total = 0
    done = 0
    for item in iterable:
        yield item
        done += 1
        if total:
            callback(min(1.0, done / total))


def _install_progress_hook() -> None:
    """Replace the ``tqdm`` used by audio-separator's MDXC/RoFormer chunk loop
    with a reporter that forwards per-chunk progress to the callback of the
    current thread (and draws no console bar). Without a callback it falls back
    to the original ``tqdm`` with the bar disabled, so server logs stay clean.
    Installed once per process; a library without that hook point is left alone.
    """
    global _hook_installed
    with _hook_lock:
        if _hook_installed:
            return
        _hook_installed = True
        try:
            from audio_separator.separator.architectures import mdxc_separator  # noqa: PLC0415
        except Exception:  # noqa: BLE001 - optional nicety, never fatal
            logger.debug("audio-separator MDXC module not importable; no intra-model progress")
            return
        original = getattr(mdxc_separator, "tqdm", None)
        if original is None or getattr(original, "_stem_master_hook", False):
            return

        def tracked(iterable: Any = None, *args: Any, **kwargs: Any) -> Any:
            callback = getattr(_hook_state, "callback", None)
            if callback is None or iterable is None:
                kwargs.setdefault("disable", True)
                return original(iterable, *args, **kwargs)
            return _track(iterable, callback)

        tracked._stem_master_hook = True  # type: ignore[attr-defined]
        mdxc_separator.tqdm = tracked


@contextmanager
def _reporting(callback: Optional[ProgressFn]) -> Iterator[None]:
    previous = getattr(_hook_state, "callback", None)
    _hook_state.callback = callback
    try:
        yield
    finally:
        _hook_state.callback = previous


class _QuietWriteFilter(logging.Filter):
    """Drop audio-separator's per-stem "Using soundfile for writing." warning."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        return "Using soundfile for writing" not in record.getMessage()


def _release_torch_memory() -> None:
    gc.collect()
    try:
        import torch  # noqa: PLC0415

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        mps = getattr(torch, "mps", None)
        if mps is not None and getattr(torch.backends, "mps", None) is not None:
            if torch.backends.mps.is_available():
                mps.empty_cache()
    except Exception:  # noqa: BLE001 - best effort
        pass


class AudioSeparatorEngine(SeparationEngine):
    """Separation with ``audio_separator.separator.Separator``.

    * Input is written as a FLOAT WAV in a private temp dir (``$TMPDIR``); the
      model writes FLOAT WAVs at 44.1 kHz with the input's frame count.
    * ``normalization_threshold`` is raised to 1e9 after construction and
      before ``load_model`` (the model instance copies it at load time), so
      neither the input mix nor any output stem is ever peak-normalised.
    * ``overlap`` goes to ``mdxc_params["overlap"]``: for RoFormer and
      MDX23C models audio-separator steps windows by ``chunk_size // overlap``,
      so a larger value means more overlapping predictions (better, slower).
    * Ensembles run each model through its own cached single-model
      ``Separator`` and combine the stems with the library's ``Ensembler``.
      (``Separator.load_model([..])`` would reload every model from disk on
      every call and relabel stems ``Vocals``/``Instrumental``.)
    * Loaded separators are kept in an LRU cache of
      ``settings.model_cache_size`` entries keyed by
      ``((model,), None, overlap)``; the oldest is released (and the GPU cache
      emptied) *before* a new model is loaded. ``0`` disables caching.
    * One inference at a time per process (a lock around load + separate).
    """

    name = "audio-separator"

    def __init__(self, settings: Settings, *, separator_factory: Optional[Callable[..., Any]] = None) -> None:
        """``separator_factory`` replaces ``audio_separator.separator.Separator``
        (tests use a stub that writes files the way the library does)."""
        self.settings = settings
        self.model_dir = Path(settings.model_dir)
        self.cache_size = max(0, int(settings.model_cache_size))
        self._separator_factory = separator_factory
        self._cache: "OrderedDict[Tuple[Tuple[str, ...], Optional[str], int], Any]" = OrderedDict()
        self._lock = threading.RLock()

    # ------------------------------------------------------------ factories
    def _separator_class(self) -> Callable[..., Any]:
        if self._separator_factory is not None:
            return self._separator_factory
        try:
            from audio_separator.separator import Separator  # noqa: PLC0415
        except Exception as exc:  # noqa: BLE001
            logger.exception("audio-separator could not be imported")
            raise EngineError("The separation engine is not installed on the server") from exc
        _install_progress_hook()
        return Separator

    @staticmethod
    def _ensembler(algorithm: str) -> Any:
        from audio_separator.separator.ensembler import Ensembler  # noqa: PLC0415

        return Ensembler(logging.getLogger("audio_separator.ensembler"), algorithm)

    def _new_separator(self, output_dir: str, overlap: int, *, info_only: bool = False) -> Any:
        factory = self._separator_class()
        self.model_dir.mkdir(parents=True, exist_ok=True)
        sep = factory(
            log_level=logging.WARNING,
            model_file_dir=str(self.model_dir),
            output_dir=output_dir,
            output_format="WAV",
            normalization_threshold=1.0,
            amplification_threshold=0.0,
            sample_rate=SAMPLE_RATE,
            use_soundfile=True,
            mdxc_params={
                "segment_size": 256,
                "override_model_segment_size": False,
                "batch_size": None,
                "overlap": int(overlap),
                "pitch_shift": 0,
            },
            info_only=info_only,
        )
        # The constructor only accepts thresholds <= 1; lift it afterwards so the
        # model instance (which copies it in load_model) never rescales audio.
        sep.normalization_threshold = 1e9
        sep_logger = getattr(sep, "logger", None)
        if isinstance(sep_logger, logging.Logger) and not any(
            isinstance(f, _QuietWriteFilter) for f in sep_logger.filters
        ):
            sep_logger.addFilter(_QuietWriteFilter())
        return sep

    # ---------------------------------------------------------------- cache
    def _evict_one(self) -> None:
        key, sep = self._cache.popitem(last=False)
        logger.info("Unloading model %s (overlap %d)", key[0][0], key[2])
        self._release(sep)

    @staticmethod
    def _release(sep: Any) -> None:
        try:
            sep.model_instance = None
        except Exception:  # noqa: BLE001
            pass
        del sep
        _release_torch_memory()

    def _acquire(self, model: str, overlap: int, output_dir: str) -> Any:
        """A separator with ``model`` loaded (cached or freshly loaded)."""
        key = ((model,), None, int(overlap))
        sep = self._cache.get(key)
        if sep is not None:
            self._cache.move_to_end(key)
            return sep
        while self._cache and len(self._cache) >= max(1, self.cache_size):
            self._evict_one()
        logger.info("Loading model %s (overlap %d)", model, overlap)
        sep = self._new_separator(output_dir, overlap)
        try:
            sep.load_model(model)
        except Exception as exc:  # noqa: BLE001 - download / checksum / config errors
            logger.exception("Could not load model %s", model)
            self._release(sep)
            raise EngineError(f"The separation model {model} could not be loaded on the server") from exc
        if self.cache_size > 0:
            self._cache[key] = sep
        return sep

    def close(self) -> None:
        with self._lock:
            while self._cache:
                self._evict_one()

    # ------------------------------------------------------------- separate
    def separate(
        self,
        audio: np.ndarray,
        models: ModelSpec,
        ensemble_algorithm: Optional[str] = None,
        overlap: Optional[int] = None,
        progress: Optional[ProgressFn] = None,
        *,
        stems: Optional[Sequence[str]] = None,
    ) -> Dict[str, np.ndarray]:
        x = _as_stereo_input(audio)
        names = normalize_models(models)
        if len(names) > 1:
            ensemble_algorithm = ensemble_algorithm or "avg_wave"
            if ensemble_algorithm not in ENSEMBLE_ALGORITHMS:
                raise ValueError(f"unknown ensemble algorithm {ensemble_algorithm!r}")
        overlap = int(overlap or self.settings.overlap_max)
        if overlap <= 0:
            raise ValueError("overlap must be positive")
        wanted = _wanted(stems)
        n = x.shape[1]

        with self._lock:
            tmp = tempfile.mkdtemp(prefix="stem-master-sep-")
            try:
                in_path = os.path.join(tmp, f"{INPUT_BASENAME}.wav")
                sf.write(in_path, x.T, SAMPLE_RATE, subtype="FLOAT", format="WAV")
                del x
                outputs: List[Dict[str, np.ndarray]] = []
                for index, model in enumerate(names):
                    out_dir = os.path.join(tmp, f"out{index}")
                    os.makedirs(out_dir)
                    outputs.append(
                        self._run_model(model, in_path, out_dir, overlap, n, wanted,
                                        _sub_progress(progress, index, len(names)))
                    )
            finally:
                shutil.rmtree(tmp, ignore_errors=True)

        if len(outputs) == 1:
            return outputs[0]
        ensembled: Dict[str, np.ndarray] = {}
        for key in _common_keys(outputs):
            waves = [o.pop(key) for o in outputs]
            combined = self._ensembler(ensemble_algorithm).ensemble(waves)
            del waves
            ensembled[key] = _fit(combined, n)
        return ensembled

    def _run_model(self, model: str, in_path: str, out_dir: str, overlap: int, n: int,
                   wanted: Optional[Tuple[str, ...]], progress: Optional[ProgressFn]) -> Dict[str, np.ndarray]:
        sep = self._acquire(model, overlap, out_dir)
        try:
            sep.output_dir = out_dir
            if getattr(sep, "model_instance", None) is not None:
                sep.model_instance.output_dir = out_dir
            if progress is not None:
                progress(0.0)
            with _reporting(progress):
                files = sep.separate(in_path)
            result = self._read_outputs(model, files, out_dir, n, wanted)
            if progress is not None:
                progress(1.0)
            return result
        finally:
            if self.cache_size == 0:
                self._release(sep)

    @staticmethod
    def _read_outputs(model: str, files: Sequence[str], out_dir: str, n: int,
                      wanted: Optional[Tuple[str, ...]]) -> Dict[str, np.ndarray]:
        found: Dict[str, str] = {}
        candidates = list(files or [])
        if not candidates:  # be robust to a library that returns nothing
            candidates = sorted(p for p in os.listdir(out_dir) if p.lower().endswith(".wav"))
        for item in candidates:
            path = item if os.path.isabs(item) else os.path.join(out_dir, item)
            if not os.path.isfile(path):
                alt = os.path.join(out_dir, os.path.basename(item))
                path = alt if os.path.isfile(alt) else path
            stem = stem_name_from_filename(path)
            if stem is None or not os.path.isfile(path):
                logger.warning("Model %s wrote an unrecognised output %r", model, item)
                continue
            if stem in found:
                raise EngineError(f"The separation model {model} produced duplicate stems")
            found[stem] = path

        expected = MODEL_STEMS.get(model)
        if expected is not None and set(expected) - set(found):
            logger.error("Model %s outputs %s, expected %s", model, sorted(found), list(expected))
            raise EngineError(f"The separation model {model} produced incomplete output")
        keys = list(found) if wanted is None else list(wanted)
        missing = [k for k in keys if k not in found]
        if missing:
            logger.error("Model %s has no %s stem (outputs: %s)", model, missing, sorted(found))
            raise EngineError(f"The separation model {model} produced incomplete output")

        result: Dict[str, np.ndarray] = {}
        for key in keys:
            data, rate = sf.read(found[key], dtype="float32", always_2d=True)
            if rate != SAMPLE_RATE:
                raise EngineError(f"The separation model {model} wrote audio at the wrong sample rate")
            if data.shape[0] != n:
                logger.warning("Model %s stem %s has %d samples, expected %d; fitting",
                               model, key, data.shape[0], n)
            result[key] = _fit(data.T, n)
            del data
        for path in found.values():
            try:
                os.unlink(path)
            except OSError:
                pass
        return result

    # ------------------------------------------------------------- prefetch
    def prefetch(self, models: Iterable[str]) -> List[str]:
        """Download every model's checkpoint + config into ``model_dir``
        without loading it (``Separator.download_model_files``)."""
        names = list(dict.fromkeys(models))
        with self._lock:
            tmp = tempfile.mkdtemp(prefix="stem-master-prefetch-")
            try:
                sep = self._new_separator(tmp, self.settings.overlap_max, info_only=True)
                for model in names:
                    logger.info("Fetching %s into %s", model, self.model_dir)
                    try:
                        sep.download_model_files(model)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("Could not download %s", model)
                        raise EngineError(f"The separation model {model} could not be downloaded") from exc
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        return names


# ---------------------------------------------------------------------------
# deterministic stand-in
# ---------------------------------------------------------------------------

Band = Tuple[float, float, float]
"""``(low_hz, high_hz, gain)``: gain applied to rfft bins with low <= f < high."""

_NYQ = float(SAMPLE_RATE)  # any value >= Nyquist works as an open upper edge

_FAKE_FAMILY: Dict[str, str] = {
    "bs_roformer_vocals_revive_v2_unwa.ckpt": "vocals",
    "mel_band_roformer_kim_ft2_bleedless_unwa.ckpt": "vocals",
    "bs_roformer_vocals_resurrection_unwa.ckpt": "vocals",
    "melband_roformer_big_beta6x.ckpt": "vocals",
    "mel_band_roformer_bleed_suppressor_v1.ckpt": "debleed",
    "BS-Roformer-SW.ckpt": "instruments",
    "MDX23C-DrumSep-aufr33-jarredou.ckpt": "drumsep",
    "bs_roformer_karaoke_frazer_becruily.ckpt": "karaoke",
    "dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt": "dereverb",
    "denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt": "denoise",
}

_FAKE_BANDS: Dict[str, Dict[str, Tuple[Band, ...]]] = {
    # vocal models: the 300 Hz - 3.4 kHz band is "vocals", the rest "other"
    "vocals": {"vocals": ((300.0, 3400.0, 0.9),)},
    # bleed suppressor: a little of the vocal presence band is "bleed"
    "debleed": {"bleed": ((1000.0, 4000.0, 0.08),)},
    # BS-Roformer-SW: per-bin gains sum to <= 1 and "other" takes only 90 % of
    # what is left, so part of the input is a residual the pipeline must add
    # to "other"; the "vocals" remnant (-> vocal_ambience) is clearly audible
    "instruments": {
        "bass": ((0.0, 150.0, 0.85),),
        "drums": ((0.0, 150.0, 0.15), (150.0, 5000.0, 0.2), (5000.0, _NYQ, 0.6)),
        "guitar": ((150.0, 1000.0, 0.3),),
        "piano": ((1000.0, 5000.0, 0.3),),
        "vocals": ((300.0, 3000.0, 0.3),),
    },
    # drum separation: bands of the drum input; 2-4 kHz is left to the residual
    # (drum_room); below 120 Hz the kick takes everything, so a sub-only mix
    # has a negligible drum_room
    "drumsep": {
        "kick": ((0.0, 120.0, 1.0),),
        "snare": ((120.0, 2000.0, 0.5),),
        "toms": ((120.0, 400.0, 0.3),),
        "hh": ((6000.0, _NYQ, 0.6),),
        "ride": ((4000.0, 8000.0, 0.15),),
        "crash": ((8000.0, _NYQ, 0.25),),
    },
    # neural denoise: 5 % of the top octave is "noise"
    "denoise": {"other": ((8000.0, _NYQ, 0.05),)},
}

_FAKE_SCALE: Dict[str, Dict[str, float]] = {
    "karaoke": {"vocals": 0.6, "instrumental": 0.4},
    "dereverb": {"noreverb": 0.8, "reverb": 0.2},
}


class FakeEngine(SeparationEngine):
    """Deterministic, model-free stand-in for :class:`AudioSeparatorEngine`.

    It knows every model in :data:`MODEL_STEMS` and returns exactly the stem
    names the real model writes, made with fixed per-bin gains on the
    full-length spectrum (vocals = the 300 Hz-3.4 kHz band, bass < 150 Hz,
    drum parts = bands of the drum input, karaoke "vocals" = 0.6 x,
    dereverb "noreverb" = 0.8 x, ...). Gains per frequency never sum above 1,
    so the outputs never hold more energy than the input; the SW model leaves
    10 % of its input unassigned so the pipeline's residual accounting is
    exercised. Ensembles combine the per-model outputs element-wise (mean for
    ``avg_*``, median, or the smaller/larger magnitude for ``min_*``/``max_*``).

    Every call is recorded in :attr:`calls` as
    ``(models, ensemble_algorithm, overlap, n_samples)`` for tests.
    """

    name = "fake"

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings
        self.calls: List[Tuple[Tuple[str, ...], Optional[str], Optional[int], int]] = []
        self._lock = threading.Lock()

    def separate(
        self,
        audio: np.ndarray,
        models: ModelSpec,
        ensemble_algorithm: Optional[str] = None,
        overlap: Optional[int] = None,
        progress: Optional[ProgressFn] = None,
        *,
        stems: Optional[Sequence[str]] = None,
    ) -> Dict[str, np.ndarray]:
        x = _as_stereo_input(audio)
        names = normalize_models(models)
        for model in names:
            if model not in _FAKE_FAMILY:
                raise EngineError(f"The separation model {model} is not known to the fake engine")
        if len(names) > 1:
            ensemble_algorithm = ensemble_algorithm or "avg_wave"
            if ensemble_algorithm not in ENSEMBLE_ALGORITHMS:
                raise ValueError(f"unknown ensemble algorithm {ensemble_algorithm!r}")
        with self._lock:
            self.calls.append((names, ensemble_algorithm if len(names) > 1 else None, overlap, x.shape[1]))
        wanted = _wanted(stems)

        outputs: List[Dict[str, np.ndarray]] = []
        for index, model in enumerate(names):
            report = _sub_progress(progress, index, len(names))
            if report is not None:
                report(0.0)
            out = self._fake_model(model, x)
            if wanted is not None:
                missing = [k for k in wanted if k not in out]
                if missing:
                    raise EngineError(f"The separation model {model} produced incomplete output")
                out = {k: out[k] for k in wanted}
            outputs.append(out)
            if report is not None:
                report(1.0)
        if len(outputs) == 1:
            return outputs[0]
        return {key: _fake_ensemble([o[key] for o in outputs], ensemble_algorithm or "avg_wave")
                for key in _common_keys(outputs)}

    @staticmethod
    def _fake_model(model: str, x: np.ndarray) -> Dict[str, np.ndarray]:
        family = _FAKE_FAMILY[model]
        if family in _FAKE_SCALE:
            return {name: np.ascontiguousarray(x * np.float32(g)) for name, g in _FAKE_SCALE[family].items()}

        n = x.shape[1]
        spectrum = np.fft.rfft(x.astype(np.float64), axis=1)
        freqs = np.fft.rfftfreq(n, d=1.0 / SAMPLE_RATE)

        def shaped(bands: Tuple[Band, ...]) -> np.ndarray:
            mask = np.zeros(freqs.shape, dtype=np.float64)
            for low, high, gain in bands:
                mask[(freqs >= low) & (freqs < high)] += gain
            return np.ascontiguousarray(np.fft.irfft(spectrum * mask, n=n, axis=1), dtype=np.float32)

        made = {name: shaped(bands) for name, bands in _FAKE_BANDS[family].items()}
        if family == "vocals":
            made["other"] = x - made["vocals"]
        elif family == "debleed":
            made = {"instrumental": x - made["bleed"], "bleed": made["bleed"]}
        elif family == "instruments":
            assigned = sum(made.values())
            made["other"] = np.ascontiguousarray((x - assigned) * np.float32(0.9))
        elif family == "denoise":
            made["dry"] = x - made["other"]
        order = MODEL_STEMS[model]
        return {name: made[name] for name in order}


def _fake_ensemble(waves: List[np.ndarray], algorithm: str) -> np.ndarray:
    stack = np.stack(waves)
    if algorithm.startswith("avg"):
        out = stack.mean(axis=0)
    elif algorithm.startswith("median"):
        out = np.median(stack, axis=0)
    else:
        pick = np.argmin if algorithm.startswith("min") else np.argmax
        index = pick(np.abs(stack), axis=0)[np.newaxis]
        out = np.take_along_axis(stack, index, axis=0)[0]
    return np.ascontiguousarray(out, dtype=np.float32)


# ---------------------------------------------------------------------------
# factory
# ---------------------------------------------------------------------------

_ENGINES: Dict[str, SeparationEngine] = {}
_ENGINES_LOCK = threading.Lock()


def create_engine(settings: Settings) -> SeparationEngine:
    """A new engine for ``settings.engine`` (``audio-separator`` | ``fake``)."""
    if settings.engine == "fake":
        return FakeEngine(settings)
    if settings.engine == "audio-separator":
        return AudioSeparatorEngine(settings)
    raise ValueError(f"unknown engine {settings.engine!r}")


def _same_config(engine: SeparationEngine, settings: Settings) -> bool:
    current = getattr(engine, "settings", None)
    if current is None or settings.engine == "fake":
        return True
    return (Path(current.model_dir) == Path(settings.model_dir)
            and current.model_cache_size == settings.model_cache_size
            and current.overlap_max == settings.overlap_max)


def get_engine(settings: Settings) -> SeparationEngine:
    """The process-wide engine for ``settings.engine`` (created on first use).

    Loaded models live in the engine, so every job in the process shares one
    model cache. If the model directory / cache size changes (tests, CLI), the
    old engine is closed and replaced.
    """
    with _ENGINES_LOCK:
        engine = _ENGINES.get(settings.engine)
        if engine is not None and not _same_config(engine, settings):
            engine.close()
            engine = None
        if engine is None:
            engine = create_engine(settings)
            _ENGINES[settings.engine] = engine
        return engine


__all__ = [
    "AudioSeparatorEngine",
    "ENSEMBLE_ALGORITHMS",
    "EngineError",
    "FakeEngine",
    "INPUT_BASENAME",
    "MODEL_STEMS",
    "SAMPLE_RATE",
    "SeparationEngine",
    "create_engine",
    "get_engine",
    "normalize_models",
    "stem_name_from_filename",
]
