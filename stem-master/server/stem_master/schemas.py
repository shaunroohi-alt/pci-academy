"""Pydantic models for the REST API (SPEC section 4).

JSON is snake_case and the field names here *are* the wire names. Datetimes
serialise as ISO-8601 UTC with a ``Z`` suffix and whole seconds
(``2026-11-20T10:00:00Z``), which is what Foundation's ``.iso8601`` decoding
strategy accepts. For lossless on-disk storage, dump with
``context={"precise_times": True}`` to keep microseconds.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FieldSerializationInfo,
    field_serializer,
    field_validator,
)

from .catalog import is_known_stem

# ---------------------------------------------------------------------------
# enums
# ---------------------------------------------------------------------------

Quality = Literal["max", "fast"]
Strength = Literal["light", "standard", "strong"]
OutputFormat = Literal["wav24", "wav32f", "wav16"]
JobStatus = Literal["queued", "processing", "completed", "failed", "cancelled"]
StageId = Literal[
    "queued",
    "analyze",
    "vocals",
    "debleed",
    "instruments",
    "drums",
    "vocal_split",
    "dereverb",
    "cleanup",
    "denoise",
    "finalize",
    "done",
]
StemGroup = Literal["vocals", "drums", "bass", "instruments", "removed"]
StemRole = Literal["primary", "bus", "removed"]
ArtifactLabel = Literal["low", "moderate", "high"]
Device = Literal["cuda", "mps", "cpu"]

OUTPUT_FORMATS: List[str] = ["wav24", "wav32f", "wav16"]
FINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

STAGE_IDS: tuple = (
    "queued", "analyze", "vocals", "debleed", "instruments", "drums",
    "vocal_split", "dereverb", "cleanup", "denoise", "finalize", "done",
)

STAGE_LABELS: Dict[str, str] = {
    "queued": "Waiting in queue",
    "analyze": "Analyzing track",
    "vocals": "Separating vocals",
    "debleed": "Removing vocal bleed from the instrumental",
    "instruments": "Splitting bass, drums, guitar, piano",
    "drums": "Splitting the drum kit",
    "vocal_split": "Splitting lead and backing vocals",
    "dereverb": "Removing vocal reverb",
    "cleanup": "Cleaning up stems",
    "denoise": "Removing AI artifacts and noise",
    "finalize": "Writing stems",
    "done": "Done",
}
"""Default human-readable label per stage id."""

WAVEFORM_POINTS = 256
"""Exact length of ``Stem.waveform``."""

DB_FLOOR = -120.0
"""Level reported for digital silence (instead of -inf, which JSON cannot carry)."""


def format_utc(value: datetime) -> str:
    """``2026-11-20T10:00:00Z`` (UTC, whole seconds)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_float(value: Any) -> Any:
    """Coerce numpy scalars & co. to ``float`` (leave anything else to pydantic)."""
    if value is None or isinstance(value, (bool, str)):
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def _db(value: Any) -> Any:
    if value is None:
        return DB_FLOOR
    value = _to_float(value)
    if isinstance(value, float):
        if math.isnan(value) or value < DB_FLOOR:
            return DB_FLOOR
        if math.isinf(value):  # +inf: clamp to something finite
            return 0.0
    return value


def _unit(value: Any) -> Any:
    if value is None:
        return 0.0
    value = _to_float(value)
    if isinstance(value, float):
        if math.isnan(value):
            return 0.0
        return min(1.0, max(0.0, value))
    return value


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------


class JobOptions(BaseModel):
    """Processing options chosen in the app's options sheet."""

    model_config = ConfigDict(extra="forbid")

    quality: Quality = "max"
    drum_split: bool = True
    vocal_split: bool = True
    dereverb: bool = False
    cleanup: bool = True
    cleanup_strength: Strength = "standard"
    denoise: bool = False
    denoise_strength: Strength = "standard"
    output_format: OutputFormat = "wav24"


class Analysis(BaseModel):
    """Track analysis produced by the ``analyze`` stage."""

    duration_seconds: float = Field(ge=0)
    sample_rate: int = Field(gt=0)
    channels: int = Field(gt=0)
    codec: str
    bpm: float = Field(ge=0)
    bpm_confidence: float = Field(ge=0, le=1)
    key: str
    camelot: str
    key_confidence: float = Field(ge=0, le=1)
    loudness_lufs: float
    peak_dbfs: float
    artifact_level: float = Field(ge=0, le=1)
    artifact_label: ArtifactLabel
    spectral_cutoff_hz: Optional[float] = None

    @field_validator("duration_seconds", "bpm", mode="before")
    @classmethod
    def _finite_non_negative(cls, value: Any) -> Any:
        if value is None:
            return 0.0
        value = _to_float(value)
        if isinstance(value, float) and not math.isfinite(value):
            return 0.0
        return value

    @field_validator("bpm_confidence", "key_confidence", "artifact_level", mode="before")
    @classmethod
    def _clamp_unit(cls, value: Any) -> Any:
        return _unit(value)

    @field_validator("loudness_lufs", "peak_dbfs", mode="before")
    @classmethod
    def _clamp_db(cls, value: Any) -> Any:
        return _db(value)

    @field_validator("spectral_cutoff_hz", mode="before")
    @classmethod
    def _cutoff(cls, value: Any) -> Any:
        value = _to_float(value)
        if isinstance(value, float) and (not math.isfinite(value) or value <= 0):
            return None
        return value


class Stem(BaseModel):
    """One delivered stem. Files live at ``<job_dir>/stems/<id>.wav`` and
    ``<job_dir>/stems/<id>.m4a``; the job manager rewrites the URLs and byte
    counts from the files on completion."""

    id: str
    name: str
    group: StemGroup
    role: StemRole
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    wav_url: str
    preview_url: str
    wav_bytes: int = Field(ge=0)
    preview_bytes: int = Field(ge=0)
    peak_dbfs: float
    rms_dbfs: float
    active_ratio: float = Field(ge=0, le=1)
    waveform: List[float]

    @field_validator("id")
    @classmethod
    def _known_id(cls, value: str) -> str:
        if not is_known_stem(value):
            raise ValueError(f"unknown stem id {value!r}")
        return value

    @field_validator("peak_dbfs", "rms_dbfs", mode="before")
    @classmethod
    def _clamp_db(cls, value: Any) -> Any:
        return _db(value)

    @field_validator("active_ratio", mode="before")
    @classmethod
    def _clamp_ratio(cls, value: Any) -> Any:
        return _unit(value)

    @field_validator("waveform", mode="before")
    @classmethod
    def _waveform(cls, value: Any) -> Any:
        if hasattr(value, "tolist"):  # numpy array
            value = value.tolist()
        if isinstance(value, (list, tuple)):
            if len(value) != WAVEFORM_POINTS:
                raise ValueError(
                    f"waveform must have exactly {WAVEFORM_POINTS} points, got {len(value)}"
                )
            return [_unit(v) for v in value]
        return value


def stem_wav_url(job_id: str, stem_id: str) -> str:
    return f"/v1/jobs/{job_id}/stems/{stem_id}.wav"


def stem_preview_url(job_id: str, stem_id: str) -> str:
    return f"/v1/jobs/{job_id}/stems/{stem_id}.m4a"


def zip_url_for(job_id: str) -> str:
    return f"/v1/jobs/{job_id}/download.zip"


class Job(BaseModel):
    """A separation job as returned by the API."""

    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    filename: str
    options: JobOptions
    progress: float = Field(ge=0, le=1)
    stage: StageId
    stage_label: str
    queue_position: Optional[int] = Field(default=None, ge=1)
    error: Optional[str] = None
    analysis: Optional[Analysis] = None
    stems: List[Stem] = Field(default_factory=list)
    zip_url: Optional[str] = None
    gain_offset_db: float = 0.0

    @field_serializer("created_at", "updated_at", when_used="json")
    def _serialize_time(self, value: datetime, info: FieldSerializationInfo) -> str:
        context = info.context or {}
        if isinstance(context, dict) and context.get("precise_times"):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).isoformat()
        return format_utc(value)

    @field_validator("created_at", "updated_at")
    @classmethod
    def _aware_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @property
    def is_finished(self) -> bool:
        return self.status in FINAL_STATUSES


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    device: Device
    queue_length: int = Field(ge=0)
    auth_required: bool


class Capabilities(BaseModel):
    max_upload_mb: int
    max_duration_seconds: int
    output_formats: List[OutputFormat]
    default_options: JobOptions


class JobList(BaseModel):
    jobs: List[Job]


__all__ = [
    "Analysis",
    "ArtifactLabel",
    "Capabilities",
    "DB_FLOOR",
    "Device",
    "FINAL_STATUSES",
    "Health",
    "Job",
    "JobList",
    "JobOptions",
    "JobStatus",
    "OUTPUT_FORMATS",
    "OutputFormat",
    "Quality",
    "STAGE_IDS",
    "STAGE_LABELS",
    "StageId",
    "Stem",
    "StemGroup",
    "StemRole",
    "Strength",
    "WAVEFORM_POINTS",
    "format_utc",
    "stem_preview_url",
    "stem_wav_url",
    "utc_now",
    "zip_url_for",
]
