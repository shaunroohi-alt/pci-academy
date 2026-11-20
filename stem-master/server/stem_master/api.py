"""HTTP API (SPEC section 4).

``create_app()`` builds the FastAPI application; the module-level ``app`` is
what ``uvicorn stem_master.api:app`` serves. Worker and sweeper threads are
started by the app's lifespan (not at import), so importing this module is
side-effect free apart from reading the environment.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Dict, List, Optional
from urllib.parse import quote

import anyio
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from python_multipart.multipart import MultipartParser, parse_options_header
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from . import PRODUCT_NAME, __version__
from .catalog import sort_by_catalog
from .config import Settings, load_settings
from .device import detect_device
from .jobs import (
    ZIP_FILENAME,
    JobManager,
    JobNotFound,
    JobNotReady,
    QueueFull,
    StemNotFound,
    stem_wav_path,
)
from .probe import ProbeError, probe_audio
from .schemas import (
    OUTPUT_FORMATS,
    Capabilities,
    Health,
    Job,
    JobList,
    JobOptions,
    format_utc,
)

logger = logging.getLogger(__name__)

UPLOAD_CHUNK_BYTES = 1024 * 1024
"""Upload data is written to disk in chunks of (at least) this size."""

MULTIPART_OVERHEAD_BYTES = 256 * 1024
"""Allowance for multipart framing and form fields when pre-checking Content-Length."""

MAX_FIELD_BYTES = 64 * 1024
MAX_FORM_PARTS = 16
DURATION_GRACE_S = 0.5
"""Container durations are approximate; a track this much over the limit still passes."""

_CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def _error(status_code: int, detail: str, headers: Optional[Dict[str, str]] = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail, headers=headers)


def _clean_client_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value if _CLIENT_ID_RE.match(value) else None


def _format_duration(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _format_validation_error(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = ".".join(str(item) for item in err.get("loc", ()) if item != "__root__")
        message = err.get("msg", "invalid value")
        parts.append(f"{loc}: {message}" if loc else message)
    return "; ".join(parts) or "invalid value"


def parse_options(raw: Optional[str]) -> JobOptions:
    """Parse the ``options`` form field (a JSON object, optional)."""
    if raw is None or not raw.strip() or raw.strip() == "null":
        return JobOptions()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise _error(422, f"Invalid options: not valid JSON ({exc.msg})") from None
    if data is None:
        return JobOptions()
    if not isinstance(data, dict):
        raise _error(422, "Invalid options: expected a JSON object")
    try:
        return JobOptions.model_validate(data)
    except ValidationError as exc:
        raise _error(422, f"Invalid options: {_format_validation_error(exc)}") from None


def _source_name(job: Job) -> str:
    stem = Path(job.filename).stem.strip()
    return stem or "Stems"


def _safe_component(name: str) -> str:
    """Make a display name safe as a single path component (ZIP entry, download name)."""
    cleaned = "".join("-" if ch in '/\\:' else ch for ch in name if ch.isprintable())
    return cleaned.strip().strip(".") or "Stem"


def content_disposition(filename: str, disposition: str = "attachment") -> str:
    """``Content-Disposition`` with an ASCII fallback and an RFC 5987
    ``filename*`` carrying the exact UTF-8 name."""
    fallback = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in filename)
    encoded = quote(filename, safe="!#$&+-.^_`|~")
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"


# ---------------------------------------------------------------------------
# streaming multipart upload
# ---------------------------------------------------------------------------


class _MultipartUpload:
    """Incremental ``multipart/form-data`` reader.

    The ``file`` part is streamed to ``dest`` in ~1 MiB writes and counted as
    it arrives, so an oversized upload is rejected (413) as soon as it crosses
    the limit, without buffering it. Other parts are small text fields.
    """

    def __init__(self, boundary: bytes, dest: Path, max_file_bytes: int) -> None:
        self.dest = dest
        self.max_file_bytes = max_file_bytes
        self.fields: Dict[str, str] = {}
        self.filename: Optional[str] = None
        self.file_bytes = 0
        self.error: Optional[HTTPException] = None
        self._ended = False
        self._parts = 0
        self._header_name = bytearray()
        self._header_value = bytearray()
        self._headers: Dict[bytes, bytes] = {}
        self._kind: Optional[str] = None  # "file" | "field" | None (ignored)
        self._field_name = ""
        self._field_data = bytearray()
        self._buffer = bytearray()
        self._handle = None
        self._parser = MultipartParser(
            boundary,
            {
                "on_part_begin": self._on_part_begin,
                "on_header_field": self._on_header_field,
                "on_header_value": self._on_header_value,
                "on_header_end": self._on_header_end,
                "on_headers_finished": self._on_headers_finished,
                "on_part_data": self._on_part_data,
                "on_part_end": self._on_part_end,
                "on_end": self._on_end,
            },
        )

    # parser callbacks (synchronous, memory only) -------------------------
    def _fail(self, status_code: int, detail: str) -> None:
        if self.error is None:
            self.error = _error(status_code, detail)

    def _on_part_begin(self) -> None:
        self._parts += 1
        if self._parts > MAX_FORM_PARTS:
            self._fail(422, "Too many form fields")
        self._headers = {}
        self._kind = None
        self._field_name = ""
        self._field_data = bytearray()

    def _on_header_field(self, data: bytes, start: int, end: int) -> None:
        self._header_name += data[start:end]

    def _on_header_value(self, data: bytes, start: int, end: int) -> None:
        self._header_value += data[start:end]

    def _on_header_end(self) -> None:
        self._headers[bytes(self._header_name).strip().lower()] = bytes(self._header_value).strip()
        self._header_name = bytearray()
        self._header_value = bytearray()

    def _on_headers_finished(self) -> None:
        _, params = parse_options_header(self._headers.get(b"content-disposition", b""))
        name = params.get(b"name", b"").decode("utf-8", "replace")
        if name == "file":
            if self.filename is not None:
                self._fail(422, "Only one file can be uploaded per job")
                return
            raw_filename = params.get(b"filename", b"")
            self.filename = raw_filename.decode("utf-8", "replace") if raw_filename else ""
            self._kind = "file"
        elif name:
            self._kind = "field"
            self._field_name = name
        else:
            self._kind = None

    def _on_part_data(self, data: bytes, start: int, end: int) -> None:
        if self.error is not None:
            return
        if self._kind == "file":
            self.file_bytes += end - start
            if self.file_bytes > self.max_file_bytes:
                limit_mb = self.max_file_bytes // (1024 * 1024)
                self._fail(413, f"The file is larger than the {limit_mb} MB upload limit")
                return
            self._buffer += data[start:end]
        elif self._kind == "field":
            if len(self._field_data) + (end - start) > MAX_FIELD_BYTES:
                self._fail(422, f"Form field '{self._field_name}' is too large")
                return
            self._field_data += data[start:end]

    def _on_part_end(self) -> None:
        if self._kind == "field" and self._field_name not in self.fields:
            self.fields[self._field_name] = bytes(self._field_data).decode("utf-8", "replace")
        self._kind = None

    def _on_end(self) -> None:
        self._ended = True

    # async driver --------------------------------------------------------
    async def feed(self, chunk: bytes) -> None:
        if not chunk:
            return
        try:
            self._parser.write(chunk)
        except Exception as exc:  # python-multipart raises on malformed framing
            logger.info("Malformed multipart upload: %s", exc)
            self._fail(400, "Malformed multipart/form-data body")
        if self.error is not None:
            raise self.error
        if len(self._buffer) >= UPLOAD_CHUNK_BYTES:
            await self._flush()

    async def finish(self) -> None:
        self._parser.finalize()
        if self.error is not None:
            raise self.error
        if not self._ended:
            raise _error(400, "The upload was incomplete (multipart body not terminated)")
        await self._flush()
        await run_in_threadpool(self._close)

    async def _flush(self) -> None:
        if not self._buffer:
            return
        data = bytes(self._buffer)
        self._buffer = bytearray()
        await run_in_threadpool(self._write, data)

    def _write(self, data: bytes) -> None:
        if self._handle is None:
            self._handle = open(self.dest, "wb")
        self._handle.write(data)

    def _close(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None

    def close(self) -> None:
        self._close()


# ---------------------------------------------------------------------------
# ZIP + README
# ---------------------------------------------------------------------------

_FORMAT_LABELS = {"wav24": "24-bit WAV", "wav32f": "32-bit float WAV", "wav16": "16-bit WAV"}
_ROLE_NOTES = {
    "primary": "",
    "bus": "sum of its parts - use instead of them, not together",
    "removed": "what cleanup/denoise took out - muted by default",
}


def _options_summary(options: JobOptions) -> str:
    items = ["Max quality" if options.quality == "max" else "Fast"]
    items.append("drum kit split" if options.drum_split else "drums as one stem")
    items.append("lead/backing split" if options.vocal_split else "vocals as one stem")
    if options.dereverb:
        items.append("vocal dereverb")
    items.append(f"cleanup ({options.cleanup_strength})" if options.cleanup else "no cleanup")
    items.append(f"denoise ({options.denoise_strength})" if options.denoise else "no denoise")
    items.append(_FORMAT_LABELS.get(options.output_format, options.output_format))
    return " | ".join(items)


def zip_entry_names(job: Job) -> List[str]:
    """``NN Stem Name.wav`` for each stem, in catalogue order."""
    return [
        f"{index:02d} {_safe_component(stem.name)}.wav"
        for index, stem in enumerate(sort_by_catalog(job.stems), start=1)
    ]


def readme_text(job: Job) -> str:
    """Human-readable notes shipped inside the ZIP."""
    lines = [PRODUCT_NAME, "=" * len(PRODUCT_NAME), ""]
    lines.append(f"Track:        {_source_name(job)}")
    analysis = job.analysis
    if analysis is not None:
        channels = {1: "mono", 2: "stereo"}.get(analysis.channels, f"{analysis.channels} ch")
        lines.append(
            f"Source file:  {job.filename} ({analysis.codec}, {analysis.sample_rate / 1000:g} kHz, "
            f"{channels}, {_format_duration(analysis.duration_seconds)})"
        )
        lines.append(f"Tempo:        {analysis.bpm:.1f} BPM (confidence {analysis.bpm_confidence:.0%})")
        lines.append(
            f"Key:          {analysis.key} / Camelot {analysis.camelot} "
            f"(confidence {analysis.key_confidence:.0%})"
        )
        lines.append(
            f"Loudness:     {analysis.loudness_lufs:.1f} LUFS integrated, "
            f"sample peak {analysis.peak_dbfs:.1f} dBFS"
        )
        artifacts = f"{analysis.artifact_label} ({analysis.artifact_level:.2f})"
        if analysis.spectral_cutoff_hz:
            artifacts += f", spectral cut-off at {analysis.spectral_cutoff_hz / 1000:.1f} kHz"
        lines.append(f"Artifacts:    {artifacts}")
    else:
        lines.append(f"Source file:  {job.filename}")
    lines.append(f"Settings:     {_options_summary(job.options)}")
    lines.append(f"Processed:    {format_utc(job.updated_at)} (job {job.id})")
    lines += ["", "Stems", "-----"]
    names = zip_entry_names(job)
    width = max((len(name) for name in names), default=0)
    for name, stem in zip(names, sort_by_catalog(job.stems)):
        note = _ROLE_NOTES.get(stem.role, "")
        row = f"{name.ljust(width)}  {stem.role:<8}"
        lines.append(f"{row}  {note}".rstrip())
    lines += ["", "How the stems fit together", "--------------------------"]
    if any(stem.role == "removed" for stem in job.stems):
        lines.append("* Primary stems + Removed stems sum to the original mix. The Removed stems")
        lines.append("  hold exactly what Cleanup/Denoise took out (muted by default in the app),")
        lines.append("  so the primary stems alone are the cleaned-up version.")
    else:
        lines.append("* Primary stems sum to the original mix: play them all at 0 dB and you get")
        lines.append("  the source back.")
    lines.append("* Bus stems are sums of primary stems (e.g. Drums = every drum part). Use a bus")
    lines.append("  instead of its parts, not together with them, or that part plays twice.")
    lines.append("* Every file has the source's sample rate and length and starts at sample 0:")
    lines.append("  drop them all at the same position in your DAW and they line up.")
    gain = job.gain_offset_db
    if abs(gain) < 0.005:
        lines.append("* gain_offset_db = 0.0: no gain was applied; stems are at their original level.")
    else:
        lines.append(
            f"* gain_offset_db = {gain:+.2f}: one common gain of {gain:+.2f} dB was applied to every"
        )
        lines.append(
            f"  stem to avoid clipping. Apply {-gain:+.2f} dB to all stems to restore the original level."
        )
    lines.append("")
    lines.append("The artifact level measures audible generation artifacts (noise floor,")
    lines.append("high-band flicker, spectral cut-off). It is not a claim about who or what")
    lines.append("made the track.")
    lines.append("")
    lines.append("manifest.json holds the full job details in machine-readable form.")
    return "\n".join(lines) + "\n"


def build_zip(manager: JobManager, job: Job) -> Path:
    """Build ``download.zip`` once (ZIP_STORED: WAV does not compress) and
    return its path. Serialised with deletion through the job lock."""
    job_dir = manager.job_dir(job.id)
    target = job_dir / ZIP_FILENAME
    with manager.job_lock(job.id):
        if target.is_file():
            return target
        tmp = job_dir / f"{ZIP_FILENAME}.tmp"
        try:
            with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                for name, stem in zip(zip_entry_names(job), sort_by_catalog(job.stems)):
                    archive.write(stem_wav_path(job_dir, stem.id), arcname=name)
                archive.writestr("manifest.json", job.model_dump_json(indent=2) + "\n")
                archive.writestr("README.txt", readme_text(job))
            os.replace(tmp, target)
        except BaseException:
            try:
                tmp.unlink()
            except OSError:
                pass
            raise
    return target


# ---------------------------------------------------------------------------
# application
# ---------------------------------------------------------------------------


def _ensure_logging() -> None:
    """Make the server's INFO logs visible when nothing configured logging
    (e.g. plain ``uvicorn stem_master.api:app``); a no-op otherwise."""
    package_logger = logging.getLogger("stem_master")
    if package_logger.handlers or logging.getLogger().handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    package_logger.addHandler(handler)
    package_logger.setLevel(logging.INFO)


def create_app(
    settings: Optional[Settings] = None, job_manager: Optional[JobManager] = None
) -> FastAPI:
    """Build the API. ``job_manager`` defaults to a :class:`JobManager` running
    the real pipeline; it is started/stopped by the app lifespan."""
    if settings is None:
        settings = job_manager.settings if job_manager is not None else load_settings()
    manager = job_manager if job_manager is not None else JobManager(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        _ensure_logging()
        device = await anyio.to_thread.run_sync(detect_device)
        await anyio.to_thread.run_sync(manager.start)
        logger.info(
            "%s %s ready (device=%s, auth=%s, data=%s)",
            PRODUCT_NAME, __version__, device, "on" if settings.api_key else "off", settings.data_dir,
        )
        try:
            yield
        finally:
            await anyio.to_thread.run_sync(manager.stop)

    app = FastAPI(
        title=PRODUCT_NAME,
        version=__version__,
        description="Stem separation API for the Stem Master iOS app.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.job_manager = manager

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges", "Content-Length", "Location"],
    )

    # -- error shape: always {"detail": "human readable message"} -----------
    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        parts = []
        for err in exc.errors():
            loc = ".".join(str(item) for item in err.get("loc", ()))
            parts.append(f"{loc}: {err.get('msg', 'invalid value')}")
        return JSONResponse(status_code=422, content={"detail": "; ".join(parts) or "Invalid request"})

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    # -- auth -----------------------------------------------------------------
    expected_key = (settings.api_key or "").encode("utf-8")

    async def require_auth(authorization: Optional[str] = Header(default=None)) -> None:
        if not expected_key:
            return
        scheme, _, token = (authorization or "").strip().partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise _error(401, "Missing API key: send 'Authorization: Bearer <key>'",
                         {"WWW-Authenticate": "Bearer"})
        if not hmac.compare_digest(token.strip().encode("utf-8"), expected_key):
            raise _error(401, "Invalid API key", {"WWW-Authenticate": "Bearer"})

    public = APIRouter()
    protected = APIRouter(dependencies=[Depends(require_auth)])

    def _get_job(job_id: str) -> Job:
        try:
            return manager.get(job_id)
        except JobNotFound:
            raise _error(404, "Job not found") from None

    # -- routes ---------------------------------------------------------------
    @app.get("/", include_in_schema=False)
    async def root() -> Dict[str, str]:
        return {"name": PRODUCT_NAME, "version": __version__, "status": "ok", "health": "/v1/health"}

    @public.get("/v1/health", response_model=Health)
    async def health() -> Health:
        return Health(
            status="ok",
            version=__version__,
            device=detect_device(),  # cached at startup
            queue_length=manager.queue_length(),
            auth_required=settings.auth_required,
        )

    @protected.get("/v1/capabilities", response_model=Capabilities)
    async def capabilities() -> Capabilities:
        return Capabilities(
            max_upload_mb=settings.max_upload_mb,
            max_duration_seconds=settings.max_duration_seconds,
            output_formats=list(OUTPUT_FORMATS),
            default_options=JobOptions(),
        )

    @protected.post("/v1/jobs", status_code=202, response_model=Job)
    async def create_job(
        request: Request,
        response: Response,
        x_client_id: Optional[str] = Header(default=None),
    ) -> Job:
        media_type, params = parse_options_header(request.headers.get("content-type", ""))
        boundary = params.get(b"boundary")
        if media_type != b"multipart/form-data" or not boundary:
            raise _error(415, "Upload the audio as multipart/form-data with a 'file' field")

        limit = settings.max_upload_bytes
        declared = request.headers.get("content-length")
        if declared is not None:
            try:
                declared_bytes = int(declared)
            except ValueError:
                raise _error(400, "Invalid Content-Length header") from None
            if declared_bytes > limit + MULTIPART_OVERHEAD_BYTES:
                raise _error(413, f"The file is larger than the {settings.max_upload_mb} MB upload limit")

        dest = manager.new_upload_path()
        upload = _MultipartUpload(boundary, dest, limit)
        try:
            try:
                async for chunk in request.stream():
                    await upload.feed(chunk)
                await upload.finish()
            except ClientDisconnect:
                logger.info("Client disconnected during upload")
                raise _error(400, "The upload was interrupted") from None
            finally:
                upload.close()

            options = parse_options(upload.fields.get("options"))
            if upload.filename is None:
                raise _error(422, "Missing 'file' field with the audio to separate")
            if upload.file_bytes == 0 or not dest.exists():
                raise _error(415, "The uploaded file is empty")

            try:
                info = await run_in_threadpool(probe_audio, dest)
            except ProbeError as exc:
                raise _error(415, f"Unsupported or unreadable audio file: {exc}") from None

            if info.duration_seconds > settings.max_duration_seconds + DURATION_GRACE_S:
                raise _error(
                    422,
                    f"The track is {_format_duration(info.duration_seconds)} long; the maximum is "
                    f"{_format_duration(settings.max_duration_seconds)}",
                )

            try:
                job = await run_in_threadpool(
                    lambda: manager.create_job(
                        upload_path=dest,
                        filename=upload.filename or "audio",
                        options=options,
                        client_id=_clean_client_id(x_client_id),
                    )
                )
            except QueueFull:
                raise _error(503, "The server queue is full; try again in a few minutes") from None
        finally:
            if dest.exists():
                try:
                    dest.unlink()
                except OSError:
                    logger.warning("Could not remove upload staging file %s", dest)

        response.headers["Location"] = f"/v1/jobs/{job.id}"
        return job

    @protected.get("/v1/jobs", response_model=JobList)
    async def list_jobs(x_client_id: Optional[str] = Header(default=None)) -> JobList:
        return JobList(jobs=manager.list_jobs(_clean_client_id(x_client_id)))

    @protected.get("/v1/jobs/{job_id}", response_model=Job)
    async def get_job(job_id: str) -> Job:
        return _get_job(job_id)

    @protected.delete("/v1/jobs/{job_id}", status_code=204)
    async def delete_job(job_id: str) -> Response:
        try:
            await run_in_threadpool(manager.delete, job_id)
        except JobNotFound:
            raise _error(404, "Job not found") from None
        return Response(status_code=204)

    @protected.post("/v1/jobs/{job_id}/cancel", response_model=Job)
    async def cancel_job(job_id: str) -> Job:
        try:
            return manager.cancel(job_id)
        except JobNotFound:
            raise _error(404, "Job not found") from None

    def _stem_response(job_id: str, stem_id: str, kind: str) -> FileResponse:
        try:
            job, stem, path = manager.stem_file(job_id, stem_id, kind)
        except JobNotFound:
            raise _error(404, "Job not found") from None
        except JobNotReady:
            raise _error(409, "The job has not completed yet") from None
        except StemNotFound:
            raise _error(404, "Stem not found") from None
        media_type = "audio/wav" if kind == "wav" else "audio/mp4"
        download_name = f"{_source_name(job)} - {_safe_component(stem.name)}.{kind}"
        disposition = "attachment" if kind == "wav" else "inline"
        return FileResponse(
            path,
            media_type=media_type,
            headers={
                "Content-Disposition": content_disposition(download_name, disposition),
                "Cache-Control": "private, max-age=86400",
            },
        )

    @protected.api_route("/v1/jobs/{job_id}/stems/{stem_id}.wav", methods=["GET", "HEAD"])
    async def stem_wav(job_id: str, stem_id: str) -> FileResponse:
        return _stem_response(job_id, stem_id, "wav")

    @protected.api_route("/v1/jobs/{job_id}/stems/{stem_id}.m4a", methods=["GET", "HEAD"])
    async def stem_preview(job_id: str, stem_id: str) -> FileResponse:
        return _stem_response(job_id, stem_id, "m4a")

    @protected.api_route("/v1/jobs/{job_id}/download.zip", methods=["GET", "HEAD"])
    async def download_zip(job_id: str) -> FileResponse:
        job = _get_job(job_id)
        if job.status != "completed":
            raise _error(409, "The job has not completed yet")
        try:
            path = await run_in_threadpool(build_zip, manager, job)
        except JobNotFound:
            raise _error(404, "Job not found") from None
        return FileResponse(
            path,
            media_type="application/zip",
            headers={
                "Content-Disposition": content_disposition(f"{_source_name(job)} - Stem Master.zip"),
                "Cache-Control": "private, max-age=86400",
            },
        )

    app.include_router(public)
    app.include_router(protected)
    return app


app = create_app()
"""ASGI entry point: ``uvicorn stem_master.api:app``."""
