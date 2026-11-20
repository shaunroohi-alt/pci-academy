"""JobManager: queue, workers, cancellation, deletion, recovery, TTL."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path

import pytest

from conftest import FakeRunner, fake_stem, submit, wait_until
from stem_master.jobs import (
    DELETED_MARKER,
    JOB_FILENAME,
    RESTART_ERROR,
    JobManager,
    JobNotFound,
    JobNotReady,
    JobRecord,
    PipelineResult,
    QueueFull,
    StemNotFound,
    sanitize_filename,
    safe_extension,
)
from stem_master.schemas import Job, JobOptions, STAGE_LABELS, utc_now

SERVER_DIR = Path(__file__).resolve().parents[1]


def _status(manager: JobManager, job_id: str) -> str:
    return manager.get(job_id).status


def _wait_status(manager: JobManager, job_id: str, *statuses: str, timeout: float = 10.0) -> Job:
    wait_until(lambda: _status(manager, job_id) in statuses, timeout=timeout)
    return manager.get(job_id)


def _read_record(manager: JobManager, job_id: str) -> dict:
    return json.loads((manager.settings.jobs_dir / job_id / JOB_FILENAME).read_text())


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_job_runs_to_completion(make_manager, preview_m4a):
    runner = FakeRunner(preview_m4a)
    manager = make_manager(runner)
    job = submit(manager, client_id="client-a", name="Folder/My Song.wav")
    assert job.status in ("queued", "processing")
    assert job.filename == "My Song.wav"

    done = _wait_status(manager, job.id, "completed")
    assert done.progress == 1.0
    assert done.stage == "done"
    assert done.stage_label == STAGE_LABELS["done"]
    assert done.zip_url == f"/v1/jobs/{job.id}/download.zip"
    assert done.queue_position is None
    assert done.error is None
    assert done.analysis is not None and done.analysis.key == "A minor"
    # Sorted into catalogue order, URLs and byte counts made authoritative.
    assert [s.id for s in done.stems] == ["vocals", "drums", "bass", "guitar", "piano", "other"]
    job_dir = manager.settings.jobs_dir / job.id
    for stem in done.stems:
        assert stem.wav_url == f"/v1/jobs/{job.id}/stems/{stem.id}.wav"
        assert stem.preview_url == f"/v1/jobs/{job.id}/stems/{stem.id}.m4a"
        assert stem.wav_bytes == (job_dir / "stems" / f"{stem.id}.wav").stat().st_size
        assert stem.preview_bytes == preview_m4a.stat().st_size

    # Persisted record: precise timestamps, private fields kept on disk only.
    record = _read_record(manager, job.id)
    assert record["status"] == "completed"
    assert record["client_id"] == "client-a"
    assert record["input_name"] == "input.wav"
    assert "client_id" not in done.model_dump()
    assert (job_dir / "input.wav").is_file()

    ctx = runner.contexts[0]
    assert ctx.job_dir == job_dir
    assert ctx.input_path == job_dir / "input.wav"
    assert ctx.settings is manager.settings
    assert isinstance(ctx.options, JobOptions)


def test_stem_file_resolution(make_manager, preview_m4a):
    manager = make_manager(FakeRunner(preview_m4a))
    job = submit(manager)
    _wait_status(manager, job.id, "completed")
    _, stem, path = manager.stem_file(job.id, "vocals", "wav")
    assert stem.id == "vocals" and path.name == "vocals.wav" and path.is_file()
    _, _, preview = manager.stem_file(job.id, "vocals", "m4a")
    assert preview.name == "vocals.m4a"
    for bad in ("kick", "../job", "..", "", "vocals/../../job", "job"):
        with pytest.raises(StemNotFound):
            manager.stem_file(job.id, bad, "wav")
    with pytest.raises(StemNotFound):
        manager.stem_file(job.id, "vocals", "json")
    with pytest.raises(JobNotFound):
        manager.stem_file("0" * 32, "vocals", "wav")
    with pytest.raises(JobNotFound):
        manager.stem_file("../" + job.id, "vocals", "wav")


# ---------------------------------------------------------------------------
# queue
# ---------------------------------------------------------------------------


def test_queue_positions_with_single_worker(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner, workers=1)
    first = submit(manager)
    wait_until(lambda: _status(manager, first.id) == "processing")
    second = submit(manager)
    third = submit(manager)
    assert manager.get(first.id).queue_position is None
    assert manager.get(second.id).queue_position == 1
    assert manager.get(third.id).queue_position == 2
    assert manager.queue_length() == 2
    assert manager.active_count() == 1

    manager.cancel(second.id)
    assert manager.get(second.id).status == "cancelled"
    assert manager.get(second.id).queue_position is None
    assert manager.get(third.id).queue_position == 1

    runner.release.set()
    _wait_status(manager, first.id, "completed")
    _wait_status(manager, third.id, "completed")
    assert runner.calls == [first.id, third.id]  # cancelled job never ran


def test_two_workers_run_concurrently(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner, workers=2)
    a, b = submit(manager), submit(manager)
    wait_until(lambda: len(runner.calls) == 2)
    assert {_status(manager, a.id), _status(manager, b.id)} == {"processing"}
    runner.release.set()
    _wait_status(manager, a.id, "completed")
    _wait_status(manager, b.id, "completed")


def test_queue_full(make_manager, make_settings):
    manager = JobManager(make_settings(), FakeRunner(), max_queued=2)  # not started: jobs stay queued
    submit(manager)
    submit(manager)
    with pytest.raises(QueueFull):
        submit(manager)


# ---------------------------------------------------------------------------
# cancellation and failures
# ---------------------------------------------------------------------------


def test_cancel_processing_is_cooperative(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: _status(manager, job.id) == "processing")
    stems_dir = manager.settings.jobs_dir / job.id / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    (stems_dir / "vocals.wav").write_bytes(b"partial")

    snapshot = manager.cancel(job.id)
    assert snapshot.status in ("processing", "cancelled")
    done = _wait_status(manager, job.id, "cancelled")
    assert done.stems == [] and done.zip_url is None
    assert not stems_dir.exists()
    assert (manager.settings.jobs_dir / job.id / "input.wav").is_file()
    # Cancelling a finished job is a no-op.
    assert manager.cancel(job.id).status == "cancelled"


def test_cancel_wins_even_if_runner_finishes(make_manager, preview_m4a):
    runner = FakeRunner(preview_m4a, mode="block_ignore_cancel")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: _status(manager, job.id) == "processing")
    assert manager.cancel(job.id).stage_label == "Cancelling…"
    runner.release.set()
    done = _wait_status(manager, job.id, "cancelled")
    assert done.stems == []
    assert not (manager.settings.jobs_dir / job.id / "stems").exists()


def test_cancel_completed_job_is_noop(make_manager, preview_m4a):
    manager = make_manager(FakeRunner(preview_m4a))
    job = submit(manager)
    _wait_status(manager, job.id, "completed")
    assert manager.cancel(job.id).status == "completed"


def test_crash_reports_exception_type(make_manager):
    manager = make_manager(FakeRunner(mode="crash"))
    job = submit(manager)
    done = _wait_status(manager, job.id, "failed")
    assert done.error == "Processing failed: RuntimeError"
    assert done.stage_label == "Failed"


def test_pipeline_error_message_is_user_facing(make_manager):
    manager = make_manager(FakeRunner(mode="pipeline_error"))
    job = submit(manager)
    done = _wait_status(manager, job.id, "failed")
    assert done.error == "The track is silent"
    with pytest.raises(JobNotReady):
        manager.stem_file(job.id, "vocals", "wav")


def test_invalid_runner_output_fails_job(make_manager):
    def runner(ctx):  # claims a stem but writes no file
        return PipelineResult(analysis=None, stems=[fake_stem("vocals")], gain_offset_db=0.0)

    manager = make_manager(runner)
    job = submit(manager)
    done = _wait_status(manager, job.id, "failed")
    assert done.error == "Processing failed: invalid pipeline output"


def test_worker_survives_failures(make_manager, preview_m4a):
    runner = FakeRunner(preview_m4a, mode="crash")
    manager = make_manager(runner, workers=1)
    bad = submit(manager)
    _wait_status(manager, bad.id, "failed")
    runner.mode = "ok"
    good = submit(manager)
    _wait_status(manager, good.id, "completed")


# ---------------------------------------------------------------------------
# progress reporting
# ---------------------------------------------------------------------------


def test_progress_is_monotonic_clamped_and_throttled(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: len(runner.contexts) == 1)
    ctx = runner.contexts[0]

    writes = []
    original = manager._write

    def counting_write(rec, durable=False):
        writes.append(rec.stage)
        original(rec, durable)

    manager._write = counting_write  # type: ignore[method-assign]
    time.sleep(0.3)  # let the throttle window from the 'processing' write expire
    for i in range(200):
        ctx.on_progress("vocals", "Separating vocals", 0.10 + i * 0.001)
    assert 1 <= len(writes) <= 3, writes  # first call writes (stage change), the rest is throttled
    job_now = manager.get(job.id)
    assert job_now.stage == "vocals"
    assert job_now.progress == pytest.approx(0.299)

    ctx.on_progress("instruments", "Splitting", 0.05)  # stage change: written although throttled
    assert writes[-1] == "instruments"
    assert manager.get(job.id).progress == pytest.approx(0.299)  # never goes backwards
    ctx.on_progress("instruments", "Splitting", 7.0)
    assert manager.get(job.id).progress == 1.0
    ctx.on_progress("instruments", "Splitting", float("nan"))
    assert manager.get(job.id).progress == 1.0
    ctx.on_progress("warp_drive", "Engaging", 1.0)  # unknown stage: ignored, no crash
    assert manager.get(job.id).stage == "instruments"
    assert manager.get(job.id).stage_label == "Engaging"
    ctx.on_progress("done", "Done", 1.0)  # reserved for the manager
    assert manager.get(job.id).stage == "instruments"

    time.sleep(PROGRESS_WINDOW)
    ctx.on_progress("instruments", "Splitting", 1.0)
    assert _read_record(manager, job.id)["stage"] == "instruments"

    runner.release.set()
    _wait_status(manager, job.id, "completed")


PROGRESS_WINDOW = 0.3


def test_on_analysis_accepts_dict(make_manager):
    from conftest import fake_analysis

    runner = FakeRunner(mode="block")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: len(runner.contexts) == 1)
    ctx = runner.contexts[0]
    ctx.on_analysis(fake_analysis().model_dump())
    assert manager.get(job.id).analysis.camelot == "8A"
    assert _read_record(manager, job.id)["analysis"]["camelot"] == "8A"
    runner.release.set()


def test_context_helpers(make_manager):
    from stem_master.jobs import PipelineCancelled

    runner = FakeRunner(mode="block")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: len(runner.contexts) == 1)
    ctx = runner.contexts[0]
    assert ctx.wav_path("kick") == ctx.job_dir / "stems" / "kick.wav"
    assert ctx.preview_path("kick") == ctx.job_dir / "stems" / "kick.m4a"
    ctx.check_cancelled()  # not cancelled: no exception
    manager.cancel(job.id)
    assert ctx.is_cancelled()
    with pytest.raises(PipelineCancelled):
        ctx.check_cancelled()
    _wait_status(manager, job.id, "cancelled")


# ---------------------------------------------------------------------------
# deletion
# ---------------------------------------------------------------------------


def test_delete_finished_job_removes_files(make_manager, preview_m4a):
    manager = make_manager(FakeRunner(preview_m4a))
    job = submit(manager)
    _wait_status(manager, job.id, "completed")
    job_dir = manager.settings.jobs_dir / job.id
    assert job_dir.is_dir()
    manager.delete(job.id)
    assert not job_dir.exists()
    with pytest.raises(JobNotFound):
        manager.get(job.id)
    with pytest.raises(JobNotFound):
        manager.delete(job.id)


def test_delete_queued_job(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner, workers=1)
    first = submit(manager)
    wait_until(lambda: _status(manager, first.id) == "processing")
    queued = submit(manager)
    manager.delete(queued.id)
    assert manager.queue_length() == 0
    assert not (manager.settings.jobs_dir / queued.id).exists()
    runner.release.set()
    _wait_status(manager, first.id, "completed")
    assert queued.id not in runner.calls


def test_delete_processing_job_is_deferred(make_manager):
    runner = FakeRunner(mode="block_ignore_cancel")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: _status(manager, job.id) == "processing")
    job_dir = manager.settings.jobs_dir / job.id
    manager.delete(job.id)
    with pytest.raises(JobNotFound):
        manager.get(job.id)
    assert job_dir.exists()  # the worker still owns it
    assert (job_dir / DELETED_MARKER).exists()
    assert runner.contexts[0].is_cancelled()
    runner.release.set()
    wait_until(lambda: not job_dir.exists())


# ---------------------------------------------------------------------------
# restart recovery
# ---------------------------------------------------------------------------


def _write_record(settings, status: str, created_offset_s: float, client_id: str = "c") -> JobRecord:
    from uuid import uuid4

    from conftest import make_wav_bytes

    created = utc_now() + timedelta(seconds=created_offset_s)
    rec = JobRecord(
        id=uuid4().hex, status=status, created_at=created, updated_at=created,
        filename="Song.wav", options=JobOptions(), progress=0.4 if status == "processing" else 0.0,
        stage="vocals" if status == "processing" else "queued", stage_label="x",
        client_id=client_id, input_name="input.wav",
    )
    job_dir = settings.jobs_dir / rec.id
    (job_dir / "stems").mkdir(parents=True)
    (job_dir / "stems" / "vocals.wav").write_bytes(b"partial")
    (job_dir / "input.wav").write_bytes(make_wav_bytes(0.2))
    (job_dir / JOB_FILENAME).write_text(rec.model_dump_json(context={"precise_times": True}))
    return rec


def test_restart_recovery(make_settings, make_manager, preview_m4a):
    settings = make_settings(workers=1)
    settings.jobs_dir.mkdir(parents=True)
    settings.uploads_dir.mkdir(parents=True)
    processing = _write_record(settings, "processing", -30)
    queued_late = _write_record(settings, "queued", -10)
    queued_early = _write_record(settings, "queued", -20)
    completed = _write_record(settings, "completed", -40)

    deleted_dir = settings.jobs_dir / ("d" * 32)
    deleted_dir.mkdir()
    (deleted_dir / DELETED_MARKER).touch()
    orphan_dir = settings.jobs_dir / ("e" * 32)
    orphan_dir.mkdir()
    corrupt_dir = settings.jobs_dir / ("f" * 32)
    corrupt_dir.mkdir()
    (corrupt_dir / JOB_FILENAME).write_text("{not json")
    stale_upload = settings.uploads_dir / "abc.part"
    stale_upload.write_bytes(b"x")

    runner = FakeRunner(preview_m4a)
    manager = make_manager(runner, settings=settings)

    failed = manager.get(processing.id)
    assert failed.status == "failed"
    assert failed.error == RESTART_ERROR
    assert not (settings.jobs_dir / processing.id / "stems").exists()
    assert _read_record(manager, processing.id)["status"] == "failed"

    _wait_status(manager, queued_early.id, "completed")
    _wait_status(manager, queued_late.id, "completed")
    assert runner.calls == [queued_early.id, queued_late.id]  # created order
    assert manager.get(completed.id).status == "completed"

    assert not deleted_dir.exists()
    assert not orphan_dir.exists()
    assert not corrupt_dir.exists()
    assert not stale_upload.exists()
    assert [j.id for j in manager.list_jobs("c")] == [
        queued_late.id, queued_early.id, processing.id, completed.id
    ]


def test_graceful_stop_fails_running_job(make_manager):
    runner = FakeRunner(mode="block")
    manager = make_manager(runner)
    job = submit(manager)
    wait_until(lambda: _status(manager, job.id) == "processing")
    manager.stop(timeout=5)
    done = manager.get(job.id)
    assert done.status == "failed"
    assert done.error == RESTART_ERROR


def test_restart_then_start_again_keeps_working(make_manager, preview_m4a):
    runner = FakeRunner(preview_m4a)
    manager = make_manager(runner)
    manager.stop(timeout=5)
    manager.start()
    job = submit(manager)
    _wait_status(manager, job.id, "completed")


# ---------------------------------------------------------------------------
# TTL sweep
# ---------------------------------------------------------------------------


def test_ttl_sweep(make_manager, preview_m4a):
    runner = FakeRunner(preview_m4a)
    manager = make_manager(runner, job_ttl_hours=1.0)
    old = submit(manager)
    _wait_status(manager, old.id, "completed")
    runner.mode = "block"
    running = submit(manager)
    wait_until(lambda: _status(manager, running.id) == "processing")

    later = manager.get(old.id).updated_at + timedelta(minutes=59)
    assert manager.sweep(now=later) == 0
    assert manager.get(old.id).status == "completed"

    much_later = manager.get(old.id).updated_at + timedelta(hours=1, seconds=1)
    assert manager.sweep(now=much_later) == 1
    with pytest.raises(JobNotFound):
        manager.get(old.id)
    assert not (manager.settings.jobs_dir / old.id).exists()
    assert manager.get(running.id).status == "processing"  # never swept while running
    runner.release.set()
    _wait_status(manager, running.id, "completed")


def test_ttl_disabled(make_manager, preview_m4a):
    manager = make_manager(FakeRunner(preview_m4a), job_ttl_hours=0)
    job = submit(manager)
    done = _wait_status(manager, job.id, "completed")
    assert manager.sweep(now=done.updated_at + timedelta(days=365)) == 0
    assert manager.get(job.id).status == "completed"


# ---------------------------------------------------------------------------
# listing, helpers, import hygiene
# ---------------------------------------------------------------------------


def test_list_jobs_filters_by_client(make_settings):
    manager = JobManager(make_settings(), FakeRunner())  # not started
    a1 = submit(manager, client_id="a")
    b1 = submit(manager, client_id="b")
    a2 = submit(manager, client_id="a")
    assert [j.id for j in manager.list_jobs("a")] == [a2.id, a1.id]
    assert [j.id for j in manager.list_jobs("b")] == [b1.id]
    assert manager.list_jobs(None) == []
    assert manager.list_jobs("") == []
    assert manager.list_jobs("zzz") == []


def test_filename_helpers():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("C:\\Users\\me\\Song.mp3") == "Song.mp3"
    assert sanitize_filename("  Ünïcødé\x00 Song.flac ") == "Ünïcødé Song.flac"
    assert sanitize_filename("") == "audio"
    assert sanitize_filename(None) == "audio"
    assert sanitize_filename("...") == "audio"
    long_name = "x" * 500 + ".mp3"
    assert len(sanitize_filename(long_name)) <= 200 and sanitize_filename(long_name).endswith(".mp3")
    assert safe_extension("Song.MP3") == "mp3"
    assert safe_extension("Song") == "bin"
    assert safe_extension("Song.m-4_a") == "m4a"


def test_importing_api_does_not_load_pipeline_or_torch():
    code = (
        "import sys, stem_master.api, stem_master.jobs;"
        "bad = [m for m in ('stem_master.pipeline', 'torch', 'audio_separator') if m in sys.modules];"
        "assert not bad, bad"
    )
    result = subprocess.run([sys.executable, "-c", code], cwd=SERVER_DIR, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
