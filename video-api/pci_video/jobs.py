"""Job lifecycle: plan -> submit -> watch -> collect, persisted to disk.

Each job is a JSON file under ``<output_dir>/.jobs/`` so status survives a
restart; unfinished jobs are re-attached to ComfyUI on startup.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from . import naming, prompts
from .backends import Backend, BackendError
from .config import Settings
from .engines import ASPECT_RATIOS, DEFAULT_ENGINE, Engine, EngineError, RenderPlan
from .system import HostInfo

log = logging.getLogger(__name__)

AspectRatio = Literal["16:9", "9:16", "1:1", "4:3", "3:4"]
ACTIVE = ("queued", "running")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class VideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    engine: str = Field(DEFAULT_ENGINE, description="ltx | wan | hunyuan | name of a workflows/*.json file")
    model: str = Field("auto", description="Engine model variant, or 'auto' to pick the best installed one")
    concept: str = Field("general", description="PCI concept key, see GET /pci/concepts")
    prompt: str = Field(min_length=3, max_length=2000)
    negative_prompt: str | None = Field(None, max_length=1000)
    duration: float = Field(4.0, gt=0, le=30, description="Seconds; rounded to the engine's frame grid")
    aspect_ratio: AspectRatio = "16:9"
    quality: Literal["draft", "standard"] | None = Field(None, description="Default depends on the Mac's memory")
    seed: int | None = Field(None, ge=0, le=2**63 - 1, description="Omit for a seed derived from the request")
    output_name: str | None = Field(None, max_length=80)
    fps: int | None = Field(None, ge=8, le=60)
    steps: int | None = Field(None, ge=1, le=150)
    cfg: float | None = Field(None, ge=0, le=30)
    raw_prompt: bool = Field(False, description="Send the prompt as-is, without PCI templating")
    overwrite: bool = Field(False, description="Re-render even if an identical video already exists")
    dry_run: bool = Field(False, description="Return the plan and ComfyUI workflow without rendering")


class Job(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    created_at: str
    updated_at: str
    started_at: str | None = None
    finished_at: str | None = None
    engine: str
    model: str
    concept: str
    request: dict
    prompt: str
    negative_prompt: str
    plan: dict
    fingerprint: str
    output_path: str
    output_url: str | None = None
    backend: str
    remote_id: str | None = None
    queue_position: int | None = None
    cached: bool = False
    warnings: list[str] = []
    error: str | None = None


class Prepared(BaseModel):
    engine: str
    model: str
    plan: dict
    prompt: str
    negative_prompt: str
    fingerprint: str
    output_path: str
    warnings: list[str]
    workflow: dict


class RequestError(Exception):
    """Invalid request; maps to HTTP 422."""


class JobManager:
    def __init__(self, settings: Settings, backend: Backend, engines: dict[str, Engine], host: HostInfo):
        self.settings = settings
        self.backend = backend
        self.engines = engines
        self.host = host
        self.jobs: dict[str, Job] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self.jobs_dir = settings.output_dir / ".jobs"

    # -- persistence --------------------------------------------------------
    def _save(self, job: Job) -> None:
        job.updated_at = _now()
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.jobs_dir / f"{job.id}.json.tmp"
        tmp.write_text(job.model_dump_json(indent=2))
        tmp.replace(self.jobs_dir / f"{job.id}.json")

    def load(self) -> None:
        if not self.jobs_dir.is_dir():
            return
        for path in self.jobs_dir.glob("*.json"):
            try:
                job = Job.model_validate_json(path.read_text())
            except ValueError as exc:
                log.warning("Ignoring unreadable job file %s: %s", path, exc)
                continue
            self.jobs[job.id] = job
            if job.status in ACTIVE:
                if job.remote_id:
                    self._watch(job)
                else:
                    self._fail(job, "Service restarted before the job reached the backend")

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    # -- planning -----------------------------------------------------------
    async def prepare(self, req: VideoRequest, allow_offline: bool = False) -> tuple[Prepared, RenderPlan]:
        engine = self.engines.get(req.engine.lower())
        if engine is None:
            raise RequestError(f"Unknown engine '{req.engine}'. Available: {', '.join(sorted(self.engines))}")
        concept = req.concept.lower()
        if concept not in prompts.CONCEPTS:
            raise RequestError(f"Unknown concept '{req.concept}'. Available: {', '.join(prompts.CONCEPTS)}")
        if not engine.min_duration <= req.duration <= engine.max_duration:
            raise RequestError(f"{engine.key} supports {engine.min_duration:g}-{engine.max_duration:g}s clips; "
                               f"got {req.duration:g}s")

        warnings: list[str] = []
        overrides = engine.overrides(self.settings)
        all_files = [f for v in engine.variants for f in v.files]
        try:
            inventory = await self.backend.inventory(all_files)
            nodes = await self.backend.node_types()
            variant, models = engine.pick_variant(req.model.lower(), inventory, overrides, self.host.memory_gb)
        except BackendError:
            if not allow_offline:
                raise
            variant = engine.variants[0] if req.model == "auto" else engine.variant(req.model.lower())
            models = {f.role: f"<{f.role}: {f.patterns[0]}>" for f in variant.files}
            nodes = set()
            warnings.append("Backend unreachable: model filenames are placeholders.")
        if self.host.memory_gb is not None and self.host.memory_gb < variant.min_memory_gb:
            warnings.append(f"{engine.key}/{variant.key} wants {variant.min_memory_gb:g} GB; "
                            f"this machine has {self.host.memory_gb:g} GB.")

        quality = req.quality or ("standard" if self.host.profile == "heavy" else "draft")
        fps = req.fps or engine.fps
        width, height = engine.dims(req.aspect_ratio, quality)
        frames = engine.frame_count(req.duration, fps)
        if req.duration > self.host.max_duration:
            warnings.append(f"{req.duration:g}s is long for a {self.host.memory_gb or '?'} GB machine; "
                            "it may run out of memory. Try a shorter clip or quality=draft.")
        seed = req.seed if req.seed is not None else naming.derive_seed(engine.key, concept, req.prompt.strip())
        rendered = prompts.render(concept, req.prompt, req.negative_prompt, raw=req.raw_prompt,
                                  style_hint=engine.style_hint)
        plan = RenderPlan(engine=engine.key, variant=variant.key, width=width, height=height, frames=frames,
                          fps=fps, duration=round((frames - 1) / fps, 3), steps=req.steps or variant.steps,
                          cfg=req.cfg if req.cfg is not None else variant.cfg, seed=seed, models=models)
        plan_dict = {**plan.__dict__, "quality": quality, "aspect_ratio": req.aspect_ratio}
        fp = naming.fingerprint({"plan": plan_dict, "prompt": rendered.positive, "negative": rendered.negative,
                                 "workflow": getattr(engine, "path", None) and str(engine.path)})
        stem = naming.output_stem(req.output_name, req.prompt, engine.key, seed, fp)
        path = naming.output_path(self.settings.output_dir, concept, stem, ".mp4")
        workflow = engine.build_workflow(plan, rendered, f"pci/{naming.slugify(concept)}/{stem}", nodes)
        prepared = Prepared(engine=engine.key, model=variant.key, plan=plan_dict, prompt=rendered.positive,
                            negative_prompt=rendered.negative, fingerprint=fp, output_path=str(path),
                            warnings=warnings, workflow=workflow)
        return prepared, plan

    # -- lifecycle ----------------------------------------------------------
    async def create(self, req: VideoRequest) -> tuple[Job, bool]:
        """Returns (job, created). created is False for a cached or duplicate job."""
        prep, plan = await self.prepare(req)
        path = Path(prep.output_path)

        for job in sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True):
            if job.fingerprint != prep.fingerprint or Path(job.output_path).with_suffix("") != path.with_suffix(""):
                continue
            if job.status in ACTIVE or (job.status == "completed" and not req.overwrite
                                        and Path(job.output_path).is_file()):
                return job, False

        now = _now()
        job = Job(id=uuid.uuid4().hex[:12], status="queued", created_at=now, updated_at=now,
                  engine=prep.engine, model=prep.model, concept=req.concept.lower(),
                  request=req.model_dump(exclude={"dry_run"}), prompt=prep.prompt,
                  negative_prompt=prep.negative_prompt, plan=prep.plan, fingerprint=prep.fingerprint,
                  output_path=str(path), backend=self.backend.name, warnings=prep.warnings)

        existing = next((p for p in (path, path.with_suffix(".webm"), path.with_suffix(".webp")) if p.exists()), None)
        if existing and not req.overwrite:
            job.status, job.cached, job.finished_at = "completed", True, now
            job.output_path, job.output_url = str(existing), f"/pci/jobs/{job.id}/video"
            self.jobs[job.id] = job
            self._save(job)
            return job, False

        path.parent.mkdir(parents=True, exist_ok=True)
        self._write_sidecar(path, job, prep.workflow)
        job.remote_id = await self.backend.submit(prep.workflow, plan)
        self.jobs[job.id] = job
        self._save(job)
        self._watch(job)
        return job, True

    def _write_sidecar(self, path: Path, job: Job, workflow: dict) -> None:
        sidecar = {"job": job.model_dump(), "workflow": workflow}
        path.with_suffix(".json").write_text(json.dumps(sidecar, indent=2, default=str))

    def _watch(self, job: Job) -> None:
        self._tasks[job.id] = asyncio.create_task(self._run(job))
        self._tasks[job.id].add_done_callback(lambda _t, jid=job.id: self._tasks.pop(jid, None))

    def _fail(self, job: Job, error: str, status: str = "failed") -> None:
        job.status, job.error, job.finished_at, job.queue_position = status, error, _now(), None
        self._save(job)
        log.warning("Job %s %s: %s", job.id, status, error)

    async def _run(self, job: Job) -> None:
        deadline = time.monotonic() + self.settings.job_timeout
        unknown_polls = 0
        try:
            while True:
                if time.monotonic() > deadline:
                    await self._safe_cancel(job)
                    return self._fail(job, f"Timed out after {self.settings.job_timeout:g}s")
                try:
                    st = await self.backend.status(job.remote_id)
                except BackendError as exc:
                    # ComfyUI restarting or busy loading a model: keep waiting.
                    log.info("Job %s: status check failed (%s); retrying", job.id, exc)
                    await asyncio.sleep(self.settings.poll_interval * 2)
                    continue

                if job.status == "cancelled":
                    return
                if st.state == "unknown":
                    unknown_polls += 1
                    if unknown_polls > 15:
                        return self._fail(job, "Backend lost the job (was ComfyUI restarted?)")
                elif st.state in ("queued", "running"):
                    unknown_polls = 0
                    changed = (st.state, st.queue_position) != (job.status, job.queue_position)
                    if st.state == "running" and job.started_at is None:
                        job.started_at = _now()
                    job.status, job.queue_position = st.state, st.queue_position
                    if changed:
                        self._save(job)
                elif st.state == "failed":
                    return self._fail(job, st.error or "Backend failed")
                elif st.state == "completed":
                    return await self._collect(job, st.outputs)
                await asyncio.sleep(self.settings.poll_interval)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # never leave a job stuck in "running"
            log.exception("Job %s crashed", job.id)
            self._fail(job, f"Internal error: {exc}")

    async def _collect(self, job: Job, outputs: list[dict]) -> None:
        if not outputs:
            return self._fail(job, "Backend finished but produced no video output")
        output = outputs[0]
        dest = Path(job.output_path)
        ext = Path(output["filename"]).suffix.lower() or ".mp4"
        if ext != dest.suffix:
            dest = dest.with_suffix(ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            await self.backend.fetch(job.remote_id, output, dest)
        except BackendError as exc:
            return self._fail(job, str(exc))
        job.status, job.queue_position, job.finished_at = "completed", None, _now()
        job.output_path, job.output_url = str(dest), f"/pci/jobs/{job.id}/video"
        job.started_at = job.started_at or job.finished_at
        self._save(job)
        sidecar = dest.with_suffix(".json")
        if sidecar.exists():
            data = json.loads(sidecar.read_text())
            data["job"] = job.model_dump()
            sidecar.write_text(json.dumps(data, indent=2, default=str))
        log.info("Job %s completed: %s", job.id, dest)

    async def _safe_cancel(self, job: Job) -> None:
        try:
            if job.remote_id:
                await self.backend.cancel(job.remote_id)
        except BackendError as exc:
            log.warning("Cancel of %s on backend failed: %s", job.id, exc)

    async def cancel(self, job: Job) -> Job:
        if job.status not in ACTIVE:
            return job
        await self._safe_cancel(job)
        task = self._tasks.get(job.id)
        if task:
            task.cancel()
        self._fail(job, "Cancelled by request", status="cancelled")
        return job

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for job in self.jobs.values():
            out[job.status] = out.get(job.status, 0) + 1
        return out


__all__ = ["ASPECT_RATIOS", "EngineError", "Job", "JobManager", "Prepared", "RequestError", "VideoRequest"]
