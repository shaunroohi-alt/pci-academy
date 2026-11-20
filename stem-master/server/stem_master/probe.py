"""Inspect uploaded audio with ffprobe.

Uploaded files are untrusted, so ffprobe is restricted to plain local files
and to audio container demuxers (:data:`ALLOWED_DEMUXERS`). Without the
whitelist, a "song" that is really an HLS/concat playlist could make ffmpeg
read other local files or fetch URLs. Anything else that decodes the upload
should pass :data:`FFMPEG_INPUT_GUARD` before its ``-i``.
"""

from __future__ import annotations

import json
import logging
import math
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

ALLOWED_DEMUXERS: tuple = (
    "wav", "w64", "aiff", "flac", "mp3", "mov", "aac", "ogg", "matroska",
    "caf", "wv", "ape", "asf", "ac3", "eac3", "au", "tta", "dsf", "amr",
)
"""ffmpeg demuxers accepted for uploads. ``mov`` covers m4a/mp4/alac,
``ogg`` covers vorbis/opus, ``matroska`` covers webm/mka."""

FFMPEG_INPUT_GUARD: List[str] = [
    "-protocol_whitelist", "file",
    "-format_whitelist", ",".join(ALLOWED_DEMUXERS),
]
"""Input options for ffmpeg/ffprobe when opening an uploaded file."""

PROBE_TIMEOUT_S = 60.0


class ProbeError(Exception):
    """The file is not decodable audio (no audio stream, unreadable, …)."""


@dataclass(frozen=True)
class ProbeInfo:
    duration_seconds: float
    sample_rate: int
    channels: int
    codec: str


def _run(cmd: List[str], timeout: float) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:  # ffprobe/ffmpeg missing: server problem
        raise RuntimeError(f"{cmd[0]} is not installed or not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProbeError("Timed out while reading the audio file") from exc


def _positive_float(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _decoded_duration(path: Path, timeout: float) -> Optional[float]:
    """Fallback for streams whose container reports no duration: decode the
    first audio stream to a null sink and read the final timestamp."""
    cmd = [
        "ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
        *FFMPEG_INPUT_GUARD, "-i", os.fspath(path),
        "-map", "0:a:0", "-f", "null", "-progress", "pipe:1", "-",
    ]
    proc = _run(cmd, timeout)
    if proc.returncode != 0:
        return None
    duration = None
    for line in proc.stdout.decode("utf-8", "replace").splitlines():
        key, _, value = line.partition("=")
        if key.strip() in ("out_time_us", "out_time_ms"):
            # ffmpeg reports microseconds in both keys (out_time_ms is misnamed).
            micros = _positive_float(value.strip())
            if micros is not None:
                duration = micros / 1_000_000.0
    return duration


def probe_audio(path: Union[str, "os.PathLike[str]"], timeout: float = PROBE_TIMEOUT_S) -> ProbeInfo:
    """Return duration / sample rate / channels / codec of the first audio
    stream of ``path``.

    Raises :class:`ProbeError` if the file cannot be opened as audio.
    """
    path = Path(path)
    if not path.is_file():
        raise ProbeError("Audio file not found")
    if path.stat().st_size == 0:
        raise ProbeError("The uploaded file is empty")

    cmd = [
        "ffprobe", "-hide_banner", "-v", "error",
        *FFMPEG_INPUT_GUARD,
        "-print_format", "json", "-show_streams", "-show_format",
        "-select_streams", "a",
        os.fspath(path),
    ]
    proc = _run(cmd, timeout)
    if proc.returncode != 0:
        message = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        logger.info("ffprobe rejected %s: %s", path.name, message[-1] if message else "?")
        raise ProbeError("The file could not be read as audio")

    try:
        data: Dict[str, Any] = json.loads(proc.stdout.decode("utf-8", "replace") or "{}")
    except json.JSONDecodeError as exc:
        raise ProbeError("The file could not be read as audio") from exc

    streams = [s for s in data.get("streams") or [] if s.get("codec_type") == "audio"]
    if not streams:
        raise ProbeError("The file contains no audio stream")
    stream = streams[0]

    codec = str(stream.get("codec_name") or "").strip()
    sample_rate = _positive_float(stream.get("sample_rate"))
    channels = stream.get("channels")
    if not codec or codec == "none" or sample_rate is None:
        raise ProbeError("The audio codec in this file is not supported")
    try:
        channels = int(channels)
    except (TypeError, ValueError):
        channels = 0
    if channels <= 0:
        raise ProbeError("The audio stream has no channels")

    duration = _positive_float(stream.get("duration"))
    if duration is None:
        duration = _positive_float((data.get("format") or {}).get("duration"))
    if duration is None:
        duration = _decoded_duration(path, timeout)
    if duration is None:
        raise ProbeError("Could not determine the length of the audio")

    return ProbeInfo(
        duration_seconds=duration,
        sample_rate=int(round(sample_rate)),
        channels=channels,
        codec=codec,
    )
