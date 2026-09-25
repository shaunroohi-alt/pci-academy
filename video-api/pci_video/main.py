"""FastAPI app. Run with ``./start.sh`` or ``python -m pci_video``."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

from . import __version__, prompts, system
from .backends import BackendError, make_backend
from .config import Settings
from .engines import EngineError, load_engines
from .jobs import Job, JobManager, RequestError, VideoRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pci_video")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    host = system.detect()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.output_dir.mkdir(parents=True, exist_ok=True)
        backend = make_backend(settings)
        engines = load_engines(settings.workflow_dir)
        manager = JobManager(settings, backend, engines, host)
        manager.load()
        app.state.manager = manager
        log.info("PCI Video API %s | %s %s | %s GB | accelerator=%s | backend=%s | output=%s",
                 __version__, host.os, host.chip or host.arch, host.memory_gb, host.accelerator,
                 settings.backend, settings.output_dir)
        for note in host.notes:
            log.warning(note)
        yield
        await manager.shutdown()
        await backend.close()

    app = FastAPI(title="PCI Academy Video API", version=__version__, lifespan=lifespan,
                  description="Local text-to-video for PCI Academy, routed through ComfyUI.")

    def manager() -> JobManager:
        return app.state.manager

    def get_job(job_id: str) -> Job:
        job = manager().jobs.get(job_id)
        if job is None:
            raise HTTPException(404, f"No job '{job_id}'")
        return job

    @app.get("/health")
    async def health():
        m = manager()
        backend = await m.backend.health()
        ok = backend.get("reachable", False)
        if ok and host.apple_silicon and backend.get("devices"):
            if not any(d.get("type") == "mps" for d in backend["devices"]):
                backend["warning"] = "ComfyUI is not using Metal (MPS); it will be very slow on this Mac."
        return JSONResponse(status_code=200 if ok else 503, content={
            "status": "ok" if ok else "degraded",
            "service": {"name": "pci-video-api", "version": __version__},
            "host": host.as_dict(),
            "backend": backend,
            "engines": sorted(m.engines),
            "output_dir": str(settings.output_dir),
            "jobs": m.counts(),
        })

    @app.get("/pci/engines")
    async def engines():
        m = manager()
        out, backend_error = [], None
        for eng in m.engines.values():
            item = eng.describe()
            try:
                files = [f for v in eng.variants for f in v.files]
                item["models"] = eng.availability(await m.backend.inventory(files), eng.overrides(settings))
            except BackendError as exc:
                backend_error = str(exc)
            out.append(item)
        return {"engines": out, "backend_error": backend_error}

    @app.get("/pci/concepts")
    async def concepts():
        return {"concepts": [c.as_dict() for c in prompts.CONCEPTS.values()], "house_style": prompts.HOUSE_STYLE}

    @app.post("/pci/video", status_code=202, responses={200: {"model": Job}, 202: {"model": Job}})
    async def create_video(req: VideoRequest):
        m = manager()
        try:
            if req.dry_run:
                prep, _ = await m.prepare(req, allow_offline=True)
                return JSONResponse(status_code=200, content={"dry_run": True, **prep.model_dump()})
            job, created = await m.create(req)
        except (RequestError, EngineError) as exc:
            raise HTTPException(422, str(exc)) from exc
        except BackendError as exc:
            raise HTTPException(503, str(exc)) from exc
        return JSONResponse(status_code=202 if created else 200, content=job.model_dump())

    @app.get("/pci/jobs", response_model=list[Job])
    async def list_jobs(status: str | None = None, limit: int = Query(50, ge=1, le=500)):
        jobs = sorted(manager().jobs.values(), key=lambda j: j.created_at, reverse=True)
        if status:
            jobs = [j for j in jobs if j.status == status]
        return jobs[:limit]

    @app.get("/pci/jobs/{job_id}", response_model=Job)
    async def job_status(job_id: str):
        return get_job(job_id)

    @app.get("/pci/jobs/{job_id}/video")
    async def job_video(job_id: str):
        job = get_job(job_id)
        path = Path(job.output_path)
        if job.status != "completed" or not path.is_file():
            raise HTTPException(404, f"Job is {job.status}; no video yet")
        media = {".mp4": "video/mp4", ".webm": "video/webm", ".webp": "image/webp", ".gif": "image/gif"}
        return FileResponse(path, media_type=media.get(path.suffix, "application/octet-stream"),
                            filename=path.name)

    @app.post("/pci/jobs/{job_id}/cancel", response_model=Job)
    async def cancel_job(job_id: str):
        return await manager().cancel(get_job(job_id))

    return app


app = create_app()


def run() -> None:
    import uvicorn

    s = Settings.from_env()
    uvicorn.run("pci_video.main:app", host=s.host, port=s.port, log_level="info")
