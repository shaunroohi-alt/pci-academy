"""Shared fixtures for the API / job-system tests.

Nothing here loads separation models: jobs run through :class:`FakeRunner`,
which writes small WAV + m4a files the way the real pipeline does.
"""

from __future__ import annotations

import dataclasses
import io
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable, Iterable, Iterator, List, Optional

import numpy as np
import pytest
import soundfile as sf

from stem_master.catalog import spec_for
from stem_master.config import Settings, load_settings
from stem_master.jobs import (
    JobManager,
    PipelineCancelled,
    PipelineContext,
    PipelineError,
    PipelineResult,
)
from stem_master.schemas import WAVEFORM_POINTS, Analysis, Stem

SAMPLE_RATE = 44100


# ---------------------------------------------------------------------------
# audio helpers
# ---------------------------------------------------------------------------


def make_wav_bytes(seconds: float = 0.5, sample_rate: int = SAMPLE_RATE, channels: int = 2,
                   freq: float = 440.0, subtype: str = "FLOAT") -> bytes:
    """A short sine tone as an in-memory WAV file."""
    frames = int(round(seconds * sample_rate))
    t = np.arange(frames, dtype=np.float32) / sample_rate
    tone = 0.25 * np.sin(2 * np.pi * freq * t, dtype=np.float32)
    data = np.repeat(tone[:, None], channels, axis=1)
    buffer = io.BytesIO()
    sf.write(buffer, data, sample_rate, format="WAV", subtype=subtype)
    return buffer.getvalue()


def write_wav(path: Path, seconds: float = 0.5, **kwargs) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(make_wav_bytes(seconds, **kwargs))
    return path


def wait_until(predicate: Callable[[], bool], timeout: float = 10.0, interval: float = 0.01) -> None:
    """Poll ``predicate`` until it is true; fail the test on timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(interval)
    raise AssertionError(f"condition not met within {timeout} s")


@pytest.fixture(scope="session")
def preview_m4a(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A tiny real AAC/m4a file (made once with ffmpeg) for preview routes."""
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg not available")
    out = tmp_path_factory.mktemp("m4a") / "preview.m4a"
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5",
         "-ac", "2", "-c:a", "aac", "-b:a", "64k", str(out)],
        check=True,
    )
    return out


# ---------------------------------------------------------------------------
# fake pipeline
# ---------------------------------------------------------------------------

DEFAULT_FAKE_STEMS = ("bass", "vocals", "drums", "guitar", "piano", "other")  # deliberately unsorted


def fake_analysis(duration: float = 0.5) -> Analysis:
    return Analysis(
        duration_seconds=duration, sample_rate=SAMPLE_RATE, channels=2, codec="pcm_f32le",
        bpm=120.0, bpm_confidence=0.9, key="A minor", camelot="8A", key_confidence=0.7,
        loudness_lufs=-14.2, peak_dbfs=-1.3, artifact_level=0.12, artifact_label="low",
        spectral_cutoff_hz=None,
    )


def fake_stem(stem_id: str, role: str = "primary", name: Optional[str] = None) -> Stem:
    spec = spec_for(stem_id)
    return Stem(
        id=spec.id, name=name or spec.name, group=spec.group, role=role, color=spec.color,
        wav_url="", preview_url="", wav_bytes=0, preview_bytes=0,
        peak_dbfs=-6.0, rms_dbfs=-20.0, active_ratio=0.5,
        waveform=[0.5] * WAVEFORM_POINTS,
    )


class FakeRunner:
    """Configurable stand-in for ``run_pipeline``.

    mode:
      * ``"ok"``      write stems and return a result
      * ``"block"``   wait for :attr:`release` (polling ``is_cancelled``), then behave like ok
      * ``"block_ignore_cancel"`` wait for :attr:`release` without polling, then ok
      * ``"crash"``   raise ``RuntimeError``
      * ``"pipeline_error"`` raise ``PipelineError("The track is silent")``
    """

    def __init__(self, preview_src: Optional[Path] = None, mode: str = "ok",
                 stems: Iterable[str] = DEFAULT_FAKE_STEMS, roles: Optional[dict] = None,
                 gain_offset_db: float = 0.0) -> None:
        self.preview_src = preview_src
        self.mode = mode
        self.stems = list(stems)
        self.roles = roles or {}
        self.gain_offset_db = gain_offset_db
        self.release = threading.Event()
        self.started = threading.Event()
        self.calls: List[str] = []
        self.contexts: List[PipelineContext] = []
        self.finished: List[str] = []
        self._lock = threading.Lock()

    def __call__(self, ctx: PipelineContext) -> PipelineResult:
        with self._lock:
            self.calls.append(ctx.job_id)
            self.contexts.append(ctx)
        self.started.set()
        try:
            return self._run(ctx)
        finally:
            with self._lock:
                self.finished.append(ctx.job_id)

    def _run(self, ctx: PipelineContext) -> PipelineResult:
        assert ctx.input_path.is_file()
        if self.mode == "block":
            while not self.release.wait(0.005):
                if ctx.is_cancelled():
                    raise PipelineCancelled()
        elif self.mode == "block_ignore_cancel":
            self.release.wait(10)
        elif self.mode == "crash":
            raise RuntimeError("boom")
        elif self.mode == "pipeline_error":
            raise PipelineError("The track is silent")

        info = sf.info(str(ctx.input_path))
        ctx.on_progress("analyze", "Analyzing track", 0.05)
        ctx.on_analysis(fake_analysis(info.duration))
        ctx.on_progress("instruments", "Splitting bass, drums, guitar, piano", 0.5)
        ctx.stems_dir.mkdir(parents=True, exist_ok=True)
        stems = []
        for index, stem_id in enumerate(self.stems):
            data = np.full((info.frames, 2), 0.01 * (index + 1), dtype=np.float32)
            sf.write(str(ctx.wav_path(stem_id)), data, info.samplerate, subtype="PCM_24")
            if self.preview_src is not None:
                shutil.copyfile(self.preview_src, ctx.preview_path(stem_id))
            stems.append(fake_stem(stem_id, self.roles.get(stem_id, "primary")))
        ctx.on_progress("finalize", "Writing stems", 0.95)
        return PipelineResult(analysis=fake_analysis(info.duration), stems=stems,
                              gain_offset_db=self.gain_offset_db)


# ---------------------------------------------------------------------------
# settings / manager factories
# ---------------------------------------------------------------------------


@pytest.fixture
def make_settings(tmp_path: Path) -> Callable[..., Settings]:
    """``make_settings(**overrides)`` -> Settings rooted in a temp data dir."""

    def factory(**overrides) -> Settings:
        base = load_settings({"STEM_MASTER_DATA_DIR": str(tmp_path / "data")})
        return dataclasses.replace(base, **overrides)

    return factory


@pytest.fixture
def managers() -> Iterator[List[JobManager]]:
    """Collects JobManagers created by a test and stops them afterwards."""
    created: List[JobManager] = []
    yield created
    for manager in created:
        manager.stop(timeout=5)


@pytest.fixture
def make_manager(make_settings, managers) -> Callable[..., JobManager]:
    """``make_manager(runner, start=True, **settings_overrides)``."""

    def factory(runner, start: bool = True, settings: Optional[Settings] = None, **overrides) -> JobManager:
        manager = JobManager(settings or make_settings(**overrides), runner)
        managers.append(manager)
        if start:
            manager.start()
        return manager

    return factory


def submit(manager: JobManager, name: str = "My Song.wav", seconds: float = 0.5,
           client_id: Optional[str] = None, options=None):
    """Create a job directly through the manager (bypassing HTTP)."""
    from stem_master.schemas import JobOptions

    upload = manager.new_upload_path()
    upload.write_bytes(make_wav_bytes(seconds))
    return manager.create_job(upload_path=upload, filename=name, options=options or JobOptions(),
                              client_id=client_id)
