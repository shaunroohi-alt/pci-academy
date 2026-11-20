"""Command line for the Stem Master server.

    python -m stem_master serve [--host H] [--port P]
        Run the HTTP API (uvicorn, one worker process; job concurrency comes
        from STEM_MASTER_WORKERS threads inside it).

    python -m stem_master prefetch [--quality max|fast|all] [--model-dir DIR]
        Download every separation model a quality setting can use, without
        running any separation (for Docker images / cold starts).

    python -m stem_master separate INPUT -o OUTDIR [options]
        Run the pipeline on one file and write OUTDIR/stems/<id>.wav (+ .m4a
        previews) and OUTDIR/manifest.json. Ctrl-C cancels cleanly.

Settings come from the STEM_MASTER_* environment variables (SPEC section 5);
command-line flags override them.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import math
import os
import shutil
import signal
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from . import PRODUCT_NAME, __version__
from .config import ConfigError, Settings, load_settings

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_USAGE = 2
EXIT_CANCELLED = 130


def _settings(args: argparse.Namespace) -> Settings:
    settings = load_settings()
    overrides: Dict[str, Any] = {}
    if getattr(args, "model_dir", None):
        overrides["model_dir"] = Path(args.model_dir).expanduser()
    if getattr(args, "engine", None):
        overrides["engine"] = args.engine
    if getattr(args, "host", None):
        overrides["host"] = args.host
    if getattr(args, "port", None):
        overrides["port"] = args.port
    return dataclasses.replace(settings, **overrides) if overrides else settings


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


# ---------------------------------------------------------------------------
# serve
# ---------------------------------------------------------------------------


def cmd_serve(args: argparse.Namespace) -> int:
    settings = _settings(args)
    import uvicorn  # noqa: PLC0415

    # The app reads its settings from the environment at import time.
    os.environ["PORT"] = str(settings.port)
    os.environ["STEM_MASTER_HOST"] = settings.host
    if args.model_dir:
        os.environ["STEM_MASTER_MODEL_DIR"] = str(settings.model_dir)
    uvicorn.run(
        "stem_master.api:app",
        host=settings.host,
        port=settings.port,
        workers=1,
        log_level=args.log_level,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
    return EXIT_OK


# ---------------------------------------------------------------------------
# prefetch
# ---------------------------------------------------------------------------


def cmd_prefetch(args: argparse.Namespace) -> int:
    from .engines import AudioSeparatorEngine, EngineError  # noqa: PLC0415
    from .pipeline import models_for_quality  # noqa: PLC0415

    settings = _settings(args)
    models = models_for_quality(args.quality)
    print(f"{PRODUCT_NAME}: fetching {len(models)} model(s) for quality '{args.quality}' into {settings.model_dir}")
    engine = AudioSeparatorEngine(settings)
    started = time.monotonic()
    for index, model in enumerate(models, 1):
        print(f"  [{index}/{len(models)}] {model}", flush=True)
        try:
            engine.prefetch([model])
        except EngineError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return EXIT_FAILED
    print(f"Done in {time.monotonic() - started:.0f} s.")
    return EXIT_OK


# ---------------------------------------------------------------------------
# separate
# ---------------------------------------------------------------------------


class _ConsoleProgress:
    """One self-overwriting progress line on stderr (plain lines when not a TTY)."""

    def __init__(self, stream=sys.stderr) -> None:
        self.stream = stream
        self.tty = bool(getattr(stream, "isatty", lambda: False)())
        self._last_line = ""
        self._last_time = 0.0
        self._last_stage = ""
        self._lock = threading.Lock()

    def __call__(self, stage: str, label: str, progress: float) -> None:
        now = time.monotonic()
        line = f"[{progress * 100:5.1f}%] {label}"
        with self._lock:
            stage_changed = stage != self._last_stage
            if not stage_changed and now - self._last_time < 0.2 and progress < 1.0:
                return
            if line == self._last_line:
                return
            self._last_time, self._last_line, self._last_stage = now, line, stage
            if self.tty:
                self.stream.write("\r\033[K" + line)
            elif stage_changed or progress >= 1.0:
                self.stream.write(line + "\n")
            self.stream.flush()

    def end(self) -> None:
        with self._lock:
            if self.tty and self._last_line:
                self.stream.write("\n")
                self.stream.flush()
            self._last_line = ""


def _options_from_args(args: argparse.Namespace):
    from .schemas import JobOptions  # noqa: PLC0415

    return JobOptions(
        quality=args.quality,
        drum_split=not args.no_drum_split,
        vocal_split=not args.no_vocal_split,
        dereverb=args.dereverb,
        cleanup=not args.no_cleanup,
        cleanup_strength=args.cleanup_strength,
        denoise=args.denoise,
        denoise_strength=args.denoise_strength,
        output_format=args.format,
    )


def sum_check_db(source_path: Path, stems_dir: Path, stem_ids: Sequence[str], gain_offset_db: float) -> float:
    """Relative RMS error (dB) of ``sum(stems) / gain`` against the decoded source.

    ``stem_ids`` should be the primary and removed stems (SPEC section 2:
    they sum to the mix). Returns ``-inf`` for an exact match.
    """
    import numpy as np  # noqa: PLC0415

    from .dsp.audio_io import decode_audio, read_wav  # noqa: PLC0415

    source = decode_audio(str(source_path)).samples.astype(np.float64)
    total = np.zeros_like(source)
    for stem_id in stem_ids:
        data, _ = read_wav(str(stems_dir / f"{stem_id}.wav"))
        total += data
    total *= 10.0 ** (-gain_offset_db / 20.0)
    reference = float(np.sqrt(np.mean(source ** 2)))
    error = float(np.sqrt(np.mean((total - source) ** 2)))
    if error == 0.0:
        return float("-inf")
    return 20.0 * math.log10(error / max(reference, 1e-12))


def cmd_separate(args: argparse.Namespace) -> int:
    from .jobs import PipelineCancelled, PipelineContext, PipelineError  # noqa: PLC0415
    from .pipeline import models_for, run_pipeline  # noqa: PLC0415

    source = Path(args.input).expanduser()
    if not source.is_file():
        print(f"error: {source} is not a file", file=sys.stderr)
        return EXIT_USAGE
    settings = _settings(args)
    options = _options_from_args(args)
    out_dir = Path(args.output).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stems_dir = out_dir / "stems"
    if stems_dir.exists() and any(stems_dir.iterdir()) and not args.force:
        print(f"error: {stems_dir} is not empty (use --force to overwrite)", file=sys.stderr)
        return EXIT_USAGE

    cancel = threading.Event()

    def on_sigint(_signum, _frame) -> None:
        if cancel.is_set():
            raise KeyboardInterrupt
        cancel.set()
        print("\nCancelling… (press Ctrl-C again to abort immediately)", file=sys.stderr)

    previous = signal.signal(signal.SIGINT, on_sigint)
    console = _ConsoleProgress()
    analysis_box: Dict[str, Any] = {}

    def on_analysis(analysis) -> None:
        analysis_box["analysis"] = analysis
        console.end()
        print(
            f"Analysis: {analysis.duration_seconds:.1f} s, {analysis.sample_rate} Hz, {analysis.channels} ch, "
            f"{analysis.bpm:.0f} BPM, {analysis.key} {analysis.camelot}, {analysis.loudness_lufs:.1f} LUFS, "
            f"artifact level {analysis.artifact_level:.2f} ({analysis.artifact_label})",
            file=sys.stderr,
        )

    print(f"{PRODUCT_NAME} {__version__}: {source.name} -> {out_dir}", file=sys.stderr)
    print(f"Engine: {settings.engine}; models: {', '.join(models_for(options))}", file=sys.stderr)
    work_dir = Path(tempfile.mkdtemp(prefix=".stem-master-", dir=out_dir))
    started = time.monotonic()
    try:
        ctx = PipelineContext(
            job_id=uuid.uuid4().hex,
            job_dir=work_dir,
            input_path=source,
            options=options,
            settings=settings,
            on_progress=console,
            on_analysis=on_analysis,
            is_cancelled=cancel.is_set,
        )
        try:
            result = run_pipeline(ctx)
        except PipelineCancelled:
            console.end()
            print("Cancelled.", file=sys.stderr)
            return EXIT_CANCELLED
        except PipelineError as exc:
            console.end()
            print(f"error: {exc}", file=sys.stderr)
            return EXIT_FAILED
        console.end()
        elapsed = time.monotonic() - started

        if stems_dir.exists():
            shutil.rmtree(stems_dir)
        shutil.move(str(ctx.stems_dir), str(stems_dir))

        summed = [s.id for s in result.stems if s.role in ("primary", "removed")]
        manifest: Dict[str, Any] = {
            "product": PRODUCT_NAME,
            "version": __version__,
            "source": source.name,
            "engine": settings.engine,
            "options": options.model_dump(mode="json"),
            "analysis": result.analysis.model_dump(mode="json"),
            "gain_offset_db": result.gain_offset_db,
            "elapsed_seconds": round(elapsed, 2),
            "stems": [
                {
                    **stem.model_dump(mode="json", exclude={"wav_url", "preview_url"}),
                    "wav": f"stems/{stem.id}.wav",
                    "preview": f"stems/{stem.id}.m4a",
                }
                for stem in result.stems
            ],
        }
        if args.check_sum:
            error_db = sum_check_db(source, stems_dir, summed, result.gain_offset_db)
            manifest["sum_check_db"] = None if math.isinf(error_db) else round(error_db, 2)
        tmp_manifest = out_dir / ".manifest.json.tmp"
        tmp_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp_manifest, out_dir / "manifest.json")
    finally:
        signal.signal(signal.SIGINT, previous)
        shutil.rmtree(work_dir, ignore_errors=True)

    print(f"Wrote {len(result.stems)} stems in {elapsed:.1f} s (gain offset {result.gain_offset_db:+.2f} dB):",
          file=sys.stderr)
    for stem in result.stems:
        print(f"  {stem.role:<8} {stem.id:<16} {stem.name:<22} peak {stem.peak_dbfs:7.2f} dBFS  "
              f"rms {stem.rms_dbfs:7.2f} dBFS", file=sys.stderr)
    if args.check_sum:
        value = manifest["sum_check_db"]
        shown = "exact" if value is None else f"{value:.1f} dB"
        print(f"Sum of primary + removed stems vs source: {shown}", file=sys.stderr)
    print(str(out_dir / "manifest.json"))
    return EXIT_OK


# ---------------------------------------------------------------------------
# argument parsing
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m stem_master", description=f"{PRODUCT_NAME} server tools")
    parser.add_argument("--version", action="version", version=f"{PRODUCT_NAME} {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true", help="log progress details")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="run the HTTP API")
    serve.add_argument("--host", help="bind address (default STEM_MASTER_HOST or 0.0.0.0)")
    serve.add_argument("--port", type=int, help="port (default PORT or 7860)")
    serve.add_argument("--model-dir", help="model cache directory (default STEM_MASTER_MODEL_DIR)")
    serve.add_argument("--log-level", default="info", choices=["critical", "error", "warning", "info", "debug"])
    serve.set_defaults(func=cmd_serve)

    prefetch = sub.add_parser("prefetch", help="download the separation models")
    prefetch.add_argument("--quality", choices=["max", "fast", "all"], default="all")
    prefetch.add_argument("--model-dir", help="model cache directory (default STEM_MASTER_MODEL_DIR)")
    prefetch.set_defaults(func=cmd_prefetch)

    separate = sub.add_parser("separate", help="separate one file into stems")
    separate.add_argument("input", help="audio file (mp3 wav aiff flac m4a aac ogg opus)")
    separate.add_argument("-o", "--output", required=True, help="output directory")
    separate.add_argument("--quality", choices=["max", "fast"], default="max")
    separate.add_argument("--no-drum-split", action="store_true", help="keep drums as one stem")
    separate.add_argument("--no-vocal-split", action="store_true", help="do not split lead / backing vocals")
    separate.add_argument("--dereverb", action="store_true", help="dry vocals plus a vocal reverb stem")
    separate.add_argument("--no-cleanup", action="store_true", help="skip bleed masking, gating and range filters")
    separate.add_argument("--cleanup-strength", choices=["light", "standard", "strong"], default="standard")
    separate.add_argument("--denoise", action="store_true", help="remove AI-generation artifacts and noise")
    separate.add_argument("--denoise-strength", choices=["light", "standard", "strong"], default="standard")
    separate.add_argument("--format", choices=["wav24", "wav32f", "wav16"], default="wav24")
    separate.add_argument("--engine", choices=["audio-separator", "fake"],
                          help="separation engine (default STEM_MASTER_ENGINE or audio-separator)")
    separate.add_argument("--model-dir", help="model cache directory (default STEM_MASTER_MODEL_DIR)")
    separate.add_argument("--check-sum", action="store_true",
                          help="verify that primary + removed stems sum to the source and report the error")
    separate.add_argument("--force", action="store_true", help="overwrite existing stems in OUTDIR")
    separate.set_defaults(func=cmd_separate)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _configure_logging(args.verbose)
    try:
        return int(args.func(args))
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    except KeyboardInterrupt:
        print("\nAborted.", file=sys.stderr)
        return EXIT_CANCELLED


if __name__ == "__main__":
    sys.exit(main())
