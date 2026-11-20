"""Job store, FIFO queue and worker threads.

Layout on disk (one directory per job)::

    <data_dir>/jobs/<id>/job.json        the job record (atomic writes)
                        input.<ext>     the uploaded file
                        stems/<stem>.wav lossless stem, written by the pipeline
                        stems/<stem>.m4a AAC preview, written by the pipeline
                        download.zip    built on first download

The in-memory index is authoritative while the process runs; ``job.json``
lets the server recover after a restart (queued jobs are re-queued, jobs that
were processing are marked failed).

Pipeline contract: a *runner* is called with a :class:`PipelineContext` and
returns a :class:`PipelineResult`. It reports progress through the context,
polls ``ctx.is_cancelled()`` and raises :class:`PipelineCancelled` to stop, or
:class:`PipelineError` with a user-facing message to fail the job. The default
runner imports ``stem_master.pipeline.run_pipeline`` lazily, inside the worker.
"""

from __future__ import annotations

import logging
import math
import os
import re
import shutil
import threading
import time
import unicodedata
import uuid
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Deque, Dict, Iterator, List, Optional, Set, Tuple, Union

from pydantic import ValidationError

from .catalog import CATALOG_ORDER
from .config import Settings
from .schemas import (
    FINAL_STATUSES,
    STAGE_IDS,
    STAGE_LABELS,
    Analysis,
    Job,
    JobOptions,
    Stem,
    stem_preview_url,
    stem_wav_url,
    utc_now,
    zip_url_for,
)

logger = logging.getLogger(__name__)

JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")
JOB_FILENAME = "job.json"
STEMS_DIRNAME = "stems"
ZIP_FILENAME = "download.zip"
DELETED_MARKER = ".deleted"

PROGRESS_WRITE_INTERVAL_S = 0.25
"""Minimum spacing of job.json writes caused by progress updates."""

STALE_UPLOAD_S = 6 * 3600.0
"""Upload staging files older than this are removed by the sweeper."""

DEFAULT_MAX_QUEUED = 100
"""Jobs that may wait in the queue before new uploads are refused."""

RESTART_ERROR = "Server restarted during processing"
CANCELLING_LABEL = "Cancelling…"
CANCELLED_LABEL = "Cancelled"
FAILED_LABEL = "Failed"


# ---------------------------------------------------------------------------
# errors
# ---------------------------------------------------------------------------


class PipelineCancelled(Exception):
    """Raised by the pipeline when ``ctx.is_cancelled()`` turned true."""


class PipelineError(Exception):
    """A processing failure whose message is safe to show to the user."""


class JobNotFound(LookupError):
    """Unknown (or malformed) job id."""


class JobNotReady(RuntimeError):
    """The job's files were requested before it completed."""


class StemNotFound(LookupError):
    """The job has no such stem (or its file is missing)."""


class QueueFull(RuntimeError):
    """Too many jobs are waiting; the upload should be retried later."""


# ---------------------------------------------------------------------------
# pipeline contract
# ---------------------------------------------------------------------------

ProgressCallback = Callable[[str, str, float], None]


def stems_dir_for(job_dir: Path) -> Path:
    return Path(job_dir) / STEMS_DIRNAME


def stem_wav_path(job_dir: Path, stem_id: str) -> Path:
    """Where the pipeline must write the lossless WAV of ``stem_id``."""
    return stems_dir_for(job_dir) / f"{stem_id}.wav"


def stem_preview_path(job_dir: Path, stem_id: str) -> Path:
    """Where the pipeline must write the AAC (m4a) preview of ``stem_id``."""
    return stems_dir_for(job_dir) / f"{stem_id}.m4a"


@dataclass
class PipelineContext:
    """Everything a pipeline run needs. Callbacks are thread-safe and cheap."""

    job_id: str
    job_dir: Path
    input_path: Path
    options: JobOptions
    settings: Settings
    on_progress: ProgressCallback
    """``(stage_id, stage_label, overall_progress 0..1)``; ``stage_id`` from SPEC §2."""
    on_analysis: Callable[[Analysis], None]
    is_cancelled: Callable[[], bool]

    @property
    def stems_dir(self) -> Path:
        return stems_dir_for(self.job_dir)

    def wav_path(self, stem_id: str) -> Path:
        return stem_wav_path(self.job_dir, stem_id)

    def preview_path(self, stem_id: str) -> Path:
        return stem_preview_path(self.job_dir, stem_id)

    def check_cancelled(self) -> None:
        """Raise :class:`PipelineCancelled` if the job was cancelled."""
        if self.is_cancelled():
            raise PipelineCancelled()


@dataclass
class PipelineResult:
    analysis: Analysis
    stems: List[Stem]
    gain_offset_db: float = 0.0


Runner = Callable[[PipelineContext], PipelineResult]


def default_runner(ctx: PipelineContext) -> PipelineResult:
    """Run the real pipeline. Imported here, at call time, so that importing
    the API never pulls in torch / audio-separator."""
    from stem_master.pipeline import run_pipeline  # noqa: PLC0415

    return run_pipeline(ctx)


# ---------------------------------------------------------------------------
# persisted record
# ---------------------------------------------------------------------------


class JobRecord(Job):
    """A :class:`Job` plus server-private fields; this is what job.json holds."""

    client_id: Optional[str] = None
    input_name: str = "input"

    def to_job(self, queue_position: Optional[int] = None) -> Job:
        """Public view (no private fields), with a freshly computed queue position."""
        data = {name: getattr(self, name) for name in Job.model_fields}
        data["stems"] = list(self.stems)
        data["queue_position"] = queue_position if self.status == "queued" else None
        return Job.model_construct(**data)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

_MAX_FILENAME_CHARS = 200


def sanitize_filename(name: Optional[str]) -> str:
    """Display name for an uploaded file: basename only, no control
    characters, bounded length. Never used as a filesystem path."""
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C")
    name = unicodedata.normalize("NFC", name).strip().strip(".").strip()
    if not name:
        return "audio"
    if len(name) > _MAX_FILENAME_CHARS:
        stem, dot, ext = name.rpartition(".")
        if dot and 0 < len(ext) <= 10:
            name = stem[: _MAX_FILENAME_CHARS - len(ext) - 1].rstrip() + "." + ext
        else:
            name = name[:_MAX_FILENAME_CHARS].rstrip()
    return name


def safe_extension(filename: Optional[str]) -> str:
    """Lower-case alphanumeric extension of ``filename`` (``bin`` if none)."""
    suffix = Path(filename or "").suffix.lower().lstrip(".")
    suffix = re.sub(r"[^a-z0-9]", "", suffix)[:8]
    return suffix or "bin"


def _is_valid_id(job_id: str) -> bool:
    return isinstance(job_id, str) and bool(JOB_ID_RE.match(job_id))


def _finite(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


@dataclass
class _Active:
    """Book-keeping for a job a worker is running."""

    cancel: threading.Event = field(default_factory=threading.Event)
    warned_stages: Set[str] = field(default_factory=set)


# ---------------------------------------------------------------------------
# manager
# ---------------------------------------------------------------------------


class JobManager:
    """Owns all jobs: persistence, queue, worker threads and the TTL sweeper.

    ``runner`` defaults to :func:`default_runner`; tests inject fakes.
    Call :meth:`start` once before use (the API does this on startup).
    """

    def __init__(
        self,
        settings: Settings,
        runner: Optional[Runner] = None,
        *,
        max_queued: int = DEFAULT_MAX_QUEUED,
    ) -> None:
        self.settings = settings
        self._runner: Runner = runner or default_runner
        self._max_queued = max_queued
        self._lock = threading.RLock()
        self._cond = threading.Condition(self._lock)
        self._jobs: Dict[str, JobRecord] = {}
        self._queue: Deque[str] = deque()
        self._active: Dict[str, _Active] = {}
        self._pending_delete: Set[str] = set()
        self._last_write: Dict[str, float] = {}
        self._job_locks: Dict[str, threading.Lock] = {}
        self._threads: List[threading.Thread] = []
        self._stop = threading.Event()
        self._generation = 0
        self._recovered = False
        self._running = False

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        """Recover state from disk (first call only) and start the worker and
        sweeper threads. Idempotent while running."""
        with self._lock:
            if self._running:
                return
            self._ensure_dirs()
            if not self._recovered:
                self._recover()
                self._recovered = True
            self._stop.clear()
            self._running = True
            self._generation += 1
            generation = self._generation
            self._threads = []
            for index in range(self.settings.workers):
                thread = threading.Thread(
                    target=self._worker_loop,
                    args=(generation,),
                    name=f"stem-master-worker-{index + 1}",
                    daemon=True,
                )
                self._threads.append(thread)
            self._threads.append(
                threading.Thread(
                    target=self._sweeper_loop,
                    args=(generation,),
                    name="stem-master-sweeper",
                    daemon=True,
                )
            )
        for thread in self._threads:
            thread.start()
        logger.info(
            "Job manager started: %d worker(s), data dir %s", self.settings.workers, self.settings.data_dir
        )

    def stop(self, timeout: float = 10.0) -> None:
        """Signal workers to stop (running pipelines see ``is_cancelled()``),
        and wait up to ``timeout`` seconds for them."""
        with self._cond:
            if not self._running:
                return
            self._running = False
            self._stop.set()
            self._cond.notify_all()
            threads = list(self._threads)
        deadline = time.monotonic() + timeout
        for thread in threads:
            thread.join(max(0.0, deadline - time.monotonic()))
        alive = [t.name for t in threads if t.is_alive()]
        if alive:
            logger.warning("Threads still running at shutdown: %s", ", ".join(alive))

    @property
    def running(self) -> bool:
        return self._running

    # ---------------------------------------------------------------- paths
    def job_dir(self, job_id: str) -> Path:
        if not _is_valid_id(job_id):
            raise JobNotFound(job_id)
        return self.settings.jobs_dir / job_id

    def new_upload_path(self, suffix: str = "") -> Path:
        """A fresh, unique path in the upload staging directory."""
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        clean = re.sub(r"[^a-z0-9.]", "", suffix.lower())[:9]
        return self.settings.uploads_dir / f"{uuid.uuid4().hex}{clean}.part"

    @contextmanager
    def job_lock(self, job_id: str) -> Iterator[None]:
        """Per-job lock serialising ZIP building with job deletion."""
        with self._lock:
            lock = self._job_locks.get(job_id)
            if lock is None or job_id not in self._jobs:
                raise JobNotFound(job_id)
        with lock:
            yield

    # ------------------------------------------------------------- queries
    def get(self, job_id: str) -> Job:
        with self._lock:
            return self._snapshot(self._require(job_id))

    def list_jobs(self, client_id: Optional[str]) -> List[Job]:
        """Jobs created with ``client_id``, newest first (none if no id)."""
        if not client_id:
            return []
        with self._lock:
            records = [rec for rec in self._jobs.values() if rec.client_id == client_id]
            records.sort(key=lambda rec: rec.created_at, reverse=True)
            return [self._snapshot(rec) for rec in records]

    def queue_length(self) -> int:
        """Number of jobs waiting to start (not counting running ones)."""
        with self._lock:
            return len(self._queue)

    def active_count(self) -> int:
        with self._lock:
            return len(self._active)

    def stem_file(self, job_id: str, stem_id: str, kind: str) -> Tuple[Job, Stem, Path]:
        """Resolve a stem download. ``kind`` is ``"wav"`` or ``"m4a"``.

        Raises :class:`JobNotFound`, :class:`JobNotReady` or :class:`StemNotFound`.
        The path is built from the validated stem id, never from user input.
        """
        with self._lock:
            rec = self._require(job_id)
            if rec.status != "completed":
                raise JobNotReady(job_id)
            stem = next((s for s in rec.stems if s.id == stem_id), None)
            if stem is None:
                raise StemNotFound(stem_id)
            job = self._snapshot(rec)
        job_dir = self._dir(job.id)
        if kind == "wav":
            path = stem_wav_path(job_dir, stem.id)
        elif kind == "m4a":
            path = stem_preview_path(job_dir, stem.id)
        else:
            raise StemNotFound(stem_id)
        if path.parent != stems_dir_for(job_dir) or not path.is_file():
            raise StemNotFound(stem_id)
        return job, stem, path

    # ------------------------------------------------------------ commands
    def create_job(
        self,
        *,
        upload_path: Union[str, Path],
        filename: str,
        options: JobOptions,
        client_id: Optional[str] = None,
    ) -> Job:
        """Register an uploaded (already validated) file as a queued job.

        The file at ``upload_path`` is moved into the job directory.
        Raises :class:`QueueFull` if too many jobs are waiting.
        """
        display_name = sanitize_filename(filename)
        input_name = f"input.{safe_extension(display_name)}"
        with self._lock:
            if len(self._queue) >= self._max_queued:
                raise QueueFull()
            job_id = uuid.uuid4().hex
            while job_id in self._jobs:  # astronomically unlikely
                job_id = uuid.uuid4().hex

        self._ensure_dirs()
        job_dir = self._dir(job_id)
        job_dir.mkdir()
        try:
            shutil.move(os.fspath(upload_path), os.fspath(job_dir / input_name))
        except BaseException:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

        now = utc_now()
        record = JobRecord(
            id=job_id,
            status="queued",
            created_at=now,
            updated_at=now,
            filename=display_name,
            options=options,
            progress=0.0,
            stage="queued",
            stage_label=STAGE_LABELS["queued"],
            client_id=client_id,
            input_name=input_name,
        )
        with self._cond:
            self._jobs[job_id] = record
            self._job_locks[job_id] = threading.Lock()
            self._write(record, durable=True)
            self._queue.append(job_id)
            self._cond.notify()
            snapshot = self._snapshot(record)
        logger.info("Job %s queued (%s, %s)", job_id, display_name, options.model_dump_json())
        return snapshot

    def cancel(self, job_id: str) -> Job:
        """Cancel a job. Queued jobs are cancelled immediately; running jobs
        are flagged and stop at the pipeline's next cancellation check;
        finished jobs are left alone."""
        with self._cond:
            rec = self._require(job_id)
            if rec.status == "queued":
                self._remove_from_queue(job_id)
                rec.status = "cancelled"
                rec.stage_label = CANCELLED_LABEL
                rec.updated_at = utc_now()
                self._write(rec, durable=True)
                logger.info("Job %s cancelled while queued", job_id)
            elif rec.status == "processing":
                active = self._active.get(job_id)
                if active is not None and not active.cancel.is_set():
                    active.cancel.set()
                    rec.stage_label = CANCELLING_LABEL
                    rec.updated_at = utc_now()
                    self._write(rec)
                    logger.info("Job %s cancellation requested", job_id)
            return self._snapshot(rec)

    def delete(self, job_id: str) -> None:
        """Delete a job and its files. A running job is cancelled and its
        directory removed once the worker has let go of it."""
        with self._cond:
            rec = self._require(job_id)
            del self._jobs[job_id]
            self._remove_from_queue(job_id)
            self._last_write.pop(job_id, None)
            active = self._active.get(job_id)
            deferred = rec.status == "processing" and active is not None
            if deferred:
                active.cancel.set()
                self._pending_delete.add(job_id)
            try:  # survives a crash before the directory is gone
                (self._dir(job_id) / DELETED_MARKER).touch()
            except OSError:
                pass
        logger.info("Job %s deleted%s", job_id, " (after worker stops)" if deferred else "")
        if not deferred:
            self._remove_job_dir(job_id)

    def sweep(self, now: Optional[datetime] = None) -> int:
        """Delete finished jobs whose ``updated_at`` is older than the TTL and
        stale upload staging files. Returns the number of jobs deleted."""
        now = now or utc_now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        ttl = self.settings.job_ttl_seconds
        expired: List[str] = []
        if ttl is not None:
            cutoff = now - timedelta(seconds=ttl)
            with self._lock:
                expired = [
                    rec.id
                    for rec in self._jobs.values()
                    if rec.status in FINAL_STATUSES and rec.updated_at < cutoff
                ]
        deleted = 0
        for job_id in expired:
            try:
                self.delete(job_id)
                deleted += 1
            except JobNotFound:
                pass
        if deleted:
            logger.info("Expired %d finished job(s)", deleted)

        uploads = self.settings.uploads_dir
        if uploads.is_dir():
            cutoff_ts = now.timestamp() - STALE_UPLOAD_S
            for entry in uploads.iterdir():
                try:
                    if entry.is_file() and entry.stat().st_mtime < cutoff_ts:
                        entry.unlink()
                except OSError:
                    pass
        return deleted

    # ------------------------------------------------------------ internals
    def _dir(self, job_id: str) -> Path:
        return self.settings.jobs_dir / job_id

    def _ensure_dirs(self) -> None:
        self.settings.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    def _require(self, job_id: str) -> JobRecord:
        """Caller holds the lock."""
        if not _is_valid_id(job_id):
            raise JobNotFound(job_id)
        rec = self._jobs.get(job_id)
        if rec is None:
            raise JobNotFound(job_id)
        return rec

    def _snapshot(self, rec: JobRecord) -> Job:
        """Caller holds the lock."""
        position = None
        if rec.status == "queued":
            try:
                position = self._queue.index(rec.id) + 1
            except ValueError:
                position = None
        return rec.to_job(position)

    def _remove_from_queue(self, job_id: str) -> None:
        try:
            self._queue.remove(job_id)
        except ValueError:
            pass

    def _write(self, rec: JobRecord, durable: bool = False) -> None:
        """Atomically persist ``rec`` (temp file + ``os.replace``). Caller
        holds the lock, which serialises writers."""
        job_dir = self._dir(rec.id)
        path = job_dir / JOB_FILENAME
        tmp = job_dir / f".{JOB_FILENAME}.tmp"
        payload = rec.model_dump_json(indent=2, context={"precise_times": True})
        try:
            with open(tmp, "w", encoding="utf-8") as handle:
                handle.write(payload)
                if durable:
                    handle.flush()
                    os.fsync(handle.fileno())
            os.replace(tmp, path)
        except FileNotFoundError:
            logger.debug("Job dir of %s vanished before write", rec.id)
        except OSError:
            logger.exception("Could not persist job %s", rec.id)
        self._last_write[rec.id] = time.monotonic()

    def _remove_job_dir(self, job_id: str) -> None:
        with self._lock:
            lock = self._job_locks.get(job_id) or threading.Lock()
        with lock:
            shutil.rmtree(self._dir(job_id), ignore_errors=True)
        with self._lock:
            if job_id not in self._jobs:
                self._job_locks.pop(job_id, None)

    def _remove_outputs(self, job_id: str, input_name: str) -> None:
        """Remove everything a run produced, keeping job.json and the input."""
        job_dir = self._dir(job_id)
        keep = {JOB_FILENAME, input_name, DELETED_MARKER}
        try:
            entries = list(job_dir.iterdir())
        except OSError:
            return
        for entry in entries:
            if entry.name in keep:
                continue
            try:
                if entry.is_dir() and not entry.is_symlink():
                    shutil.rmtree(entry, ignore_errors=True)
                else:
                    entry.unlink()
            except OSError:
                logger.warning("Could not remove %s", entry)

    # -------------------------------------------------------------- recovery
    def _recover(self) -> None:
        """Rebuild the index from disk. Caller holds the lock."""
        uploads = self.settings.uploads_dir
        for entry in uploads.iterdir():  # nothing can be mid-upload at startup
            try:
                if entry.is_dir() and not entry.is_symlink():
                    shutil.rmtree(entry, ignore_errors=True)
                else:
                    entry.unlink()
            except OSError:
                pass

        records: List[JobRecord] = []
        for entry in self.settings.jobs_dir.iterdir():
            if not entry.is_dir() or not _is_valid_id(entry.name):
                continue
            if (entry / DELETED_MARKER).exists():
                shutil.rmtree(entry, ignore_errors=True)
                continue
            job_file = entry / JOB_FILENAME
            if not job_file.is_file():
                logger.warning("Removing job dir without %s: %s", JOB_FILENAME, entry.name)
                shutil.rmtree(entry, ignore_errors=True)
                continue
            try:
                rec = JobRecord.model_validate_json(job_file.read_bytes())
            except (OSError, ValueError, ValidationError) as exc:
                logger.warning("Removing unreadable job %s: %s", entry.name, exc)
                shutil.rmtree(entry, ignore_errors=True)
                continue
            if rec.id != entry.name:
                logger.warning("Removing job dir %s holding job %s", entry.name, rec.id)
                shutil.rmtree(entry, ignore_errors=True)
                continue
            for leftover in (entry / f".{JOB_FILENAME}.tmp", entry / f"{ZIP_FILENAME}.tmp"):
                try:
                    leftover.unlink()
                except OSError:
                    pass
            records.append(rec)

        records.sort(key=lambda rec: rec.created_at)
        requeued = failed = 0
        for rec in records:
            self._jobs[rec.id] = rec
            self._job_locks[rec.id] = threading.Lock()
            if rec.status == "processing":
                rec.status = "failed"
                rec.error = RESTART_ERROR
                rec.stage_label = FAILED_LABEL
                rec.updated_at = utc_now()
                self._remove_outputs(rec.id, rec.input_name)
                self._write(rec, durable=True)
                failed += 1
            elif rec.status == "queued":
                if not (self._dir(rec.id) / rec.input_name).is_file():
                    rec.status = "failed"
                    rec.error = "The uploaded file is missing"
                    rec.stage_label = FAILED_LABEL
                    rec.updated_at = utc_now()
                    self._write(rec, durable=True)
                    failed += 1
                    continue
                rec.stage = "queued"
                rec.stage_label = STAGE_LABELS["queued"]
                rec.progress = 0.0
                self._queue.append(rec.id)
                requeued += 1
        if records:
            logger.info(
                "Recovered %d job(s): %d re-queued, %d marked failed", len(records), requeued, failed
            )

    # --------------------------------------------------------------- workers
    def _worker_loop(self, generation: int) -> None:
        while True:
            with self._cond:
                while not self._queue and not self._stop.is_set() and generation == self._generation:
                    self._cond.wait()
                if self._stop.is_set() or generation != self._generation:
                    return
                job_id = self._queue.popleft()
                rec = self._jobs.get(job_id)
                if rec is None or rec.status != "queued":
                    continue
                active = _Active()
                self._active[job_id] = active
                rec.status = "processing"
                rec.stage = "analyze"
                rec.stage_label = STAGE_LABELS["analyze"]
                rec.progress = 0.0
                rec.error = None
                rec.updated_at = utc_now()
                self._write(rec, durable=True)
                ctx = self._make_context(rec, active)
            try:
                self._run(ctx, active)
            except Exception:  # never let a bookkeeping bug kill the worker
                logger.exception("Worker error while finishing job %s", job_id)
                self._finish(job_id, "failed", error="Processing failed: internal error")

    def _make_context(self, rec: JobRecord, active: _Active) -> PipelineContext:
        job_id = rec.id
        job_dir = self._dir(job_id)

        def on_progress(stage_id: str, stage_label: str, progress: float) -> None:
            self._on_progress(job_id, active, stage_id, stage_label, progress)

        def on_analysis(analysis: Analysis) -> None:
            self._on_analysis(job_id, analysis)

        def is_cancelled() -> bool:
            return active.cancel.is_set() or self._stop.is_set()

        return PipelineContext(
            job_id=job_id,
            job_dir=job_dir,
            input_path=job_dir / rec.input_name,
            options=rec.options.model_copy(),
            settings=self.settings,
            on_progress=on_progress,
            on_analysis=on_analysis,
            is_cancelled=is_cancelled,
        )

    def _on_progress(
        self, job_id: str, active: _Active, stage_id: str, stage_label: str, progress: float
    ) -> None:
        stage_id = str(stage_id)
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None or rec.status != "processing":
                return
            stage_changed = False
            if stage_id in STAGE_IDS and stage_id not in ("queued", "done"):
                if stage_id != rec.stage:
                    rec.stage = stage_id  # type: ignore[assignment]
                    stage_changed = True
            elif stage_id not in active.warned_stages:
                active.warned_stages.add(stage_id)
                logger.warning("Job %s reported unknown stage %r; ignored", job_id, stage_id)
            if not active.cancel.is_set():
                label = " ".join(str(stage_label or "").split())[:200]
                rec.stage_label = label or STAGE_LABELS.get(rec.stage, rec.stage)
            value = _finite(progress, default=rec.progress)
            rec.progress = max(rec.progress, min(1.0, max(0.0, value)))
            rec.updated_at = utc_now()
            due = time.monotonic() - self._last_write.get(job_id, 0.0) >= PROGRESS_WRITE_INTERVAL_S
            if stage_changed or due:
                self._write(rec)

    def _on_analysis(self, job_id: str, analysis: Union[Analysis, Dict[str, Any]]) -> None:
        if not isinstance(analysis, Analysis):
            analysis = Analysis.model_validate(analysis)
        with self._lock:
            rec = self._jobs.get(job_id)
            if rec is None or rec.status != "processing":
                return
            rec.analysis = analysis
            rec.updated_at = utc_now()
            self._write(rec)

    def _run(self, ctx: PipelineContext, active: _Active) -> None:
        job_id = ctx.job_id
        started = time.monotonic()
        logger.info("Job %s started", job_id)
        try:
            result = self._runner(ctx)
        except PipelineCancelled:
            self._finish(job_id, "cancelled")
            return
        except PipelineError as exc:
            message = str(exc).strip() or "Processing failed"
            logger.warning("Job %s failed: %s", job_id, message)
            self._finish(job_id, "failed", error=message)
            return
        except Exception as exc:
            logger.exception("Job %s crashed", job_id)
            self._finish(job_id, "failed", error=f"Processing failed: {type(exc).__name__}")
            return

        try:
            stems = self._validated_stems(ctx, result)
            analysis = result.analysis
            if analysis is not None and not isinstance(analysis, Analysis):
                analysis = Analysis.model_validate(analysis)
        except (PipelineError, ValidationError, TypeError, ValueError) as exc:
            logger.error("Job %s produced invalid output: %s", job_id, exc)
            self._finish(job_id, "failed", error="Processing failed: invalid pipeline output")
            return
        self._finish(
            job_id,
            "completed",
            stems=stems,
            analysis=analysis,
            gain_offset_db=_finite(getattr(result, "gain_offset_db", 0.0)),
        )
        logger.info("Job %s finished in %.1f s", job_id, time.monotonic() - started)

    def _validated_stems(self, ctx: PipelineContext, result: PipelineResult) -> List[Stem]:
        """Validate the runner's stems against the files on disk and make the
        URLs and byte counts authoritative."""
        if not isinstance(result, PipelineResult) and not hasattr(result, "stems"):
            raise PipelineError(f"runner returned {type(result).__name__}, not PipelineResult")
        stems: List[Stem] = []
        seen: Set[str] = set()
        for item in result.stems or []:
            stem = item if isinstance(item, Stem) else Stem.model_validate(item)
            if stem.id in seen:
                raise PipelineError(f"duplicate stem {stem.id!r}")
            seen.add(stem.id)
            wav = stem_wav_path(ctx.job_dir, stem.id)
            if not wav.is_file():
                raise PipelineError(f"missing WAV for stem {stem.id!r}")
            preview = stem_preview_path(ctx.job_dir, stem.id)
            preview_bytes = preview.stat().st_size if preview.is_file() else 0
            if not preview_bytes:
                logger.warning("Job %s: no preview for stem %s", ctx.job_id, stem.id)
            stems.append(
                stem.model_copy(
                    update={
                        "wav_url": stem_wav_url(ctx.job_id, stem.id),
                        "preview_url": stem_preview_url(ctx.job_id, stem.id),
                        "wav_bytes": wav.stat().st_size,
                        "preview_bytes": preview_bytes,
                    }
                )
            )
        if not stems:
            raise PipelineError("no stems produced")
        stems.sort(key=lambda s: CATALOG_ORDER.get(s.id, len(CATALOG_ORDER)))
        return stems

    def _finish(
        self,
        job_id: str,
        outcome: str,
        *,
        error: Optional[str] = None,
        stems: Optional[List[Stem]] = None,
        analysis: Optional[Analysis] = None,
        gain_offset_db: float = 0.0,
    ) -> None:
        """Record the end of a run. ``outcome``: completed | failed | cancelled.

        Outputs of a failed/cancelled run are removed *before* the final status
        is published, so a client that sees ``cancelled`` never finds stale files.
        """
        with self._lock:
            active = self._active.get(job_id)
            rec = self._jobs.get(job_id)
            input_name = rec.input_name if rec is not None else None
        cancel_requested = active is not None and active.cancel.is_set()
        cleaned = False
        if input_name is not None and (outcome != "completed" or cancel_requested):
            self._remove_outputs(job_id, input_name)
            cleaned = True

        remove_dir = False
        with self._cond:
            active = self._active.pop(job_id, None)
            user_cancelled = active is not None and active.cancel.is_set()
            if job_id in self._pending_delete:
                self._pending_delete.discard(job_id)
                remove_dir = True
            else:
                rec = self._jobs.get(job_id)
                if rec is None or rec.status != "processing":
                    return
                if user_cancelled or (outcome == "cancelled" and not self._stop.is_set()):
                    rec.status = "cancelled"
                    rec.stage_label = CANCELLED_LABEL
                    logger.info("Job %s cancelled", job_id)
                elif outcome != "completed":
                    rec.status = "failed"
                    rec.error = RESTART_ERROR if outcome == "cancelled" else (error or "Processing failed")
                    rec.stage_label = FAILED_LABEL
                else:
                    rec.status = "completed"
                    rec.progress = 1.0
                    rec.stage = "done"
                    rec.stage_label = STAGE_LABELS["done"]
                    rec.error = None
                    rec.stems = list(stems or [])
                    if analysis is not None:
                        rec.analysis = analysis
                    rec.zip_url = zip_url_for(job_id)
                    rec.gain_offset_db = gain_offset_db
                if rec.status != "completed":
                    rec.stems = []
                    rec.zip_url = None
                    if not cleaned:  # cancel arrived after the first check (rare)
                        self._remove_outputs(job_id, rec.input_name)
                rec.updated_at = utc_now()
                self._write(rec, durable=True)
        if remove_dir:
            self._remove_job_dir(job_id)

    # --------------------------------------------------------------- sweeper
    def _sweeper_loop(self, generation: int) -> None:
        ttl = self.settings.job_ttl_seconds
        interval = 600.0 if ttl is None else min(600.0, max(30.0, ttl / 10.0))
        while not self._stop.wait(interval) and generation == self._generation:
            try:
                self.sweep()
            except Exception:
                logger.exception("TTL sweep failed")


__all__ = [
    "DELETED_MARKER",
    "JOB_FILENAME",
    "JobManager",
    "JobNotFound",
    "JobNotReady",
    "JobRecord",
    "PipelineCancelled",
    "PipelineContext",
    "PipelineError",
    "PipelineResult",
    "QueueFull",
    "RESTART_ERROR",
    "Runner",
    "STEMS_DIRNAME",
    "StemNotFound",
    "ZIP_FILENAME",
    "default_runner",
    "safe_extension",
    "sanitize_filename",
    "stem_preview_path",
    "stem_wav_path",
    "stems_dir_for",
]
