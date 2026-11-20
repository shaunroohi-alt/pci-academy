"""Audio decoding, resampling, channel handling and file writing.

All arrays are float32 numpy arrays shaped ``(channels, samples)``.

Decoding goes through ``ffmpeg``/``ffprobe`` (any container/codec ffmpeg
understands) and returns audio at the *source* sample rate. The decoded PCM is
spooled to a temporary raw file and de-interleaved chunk by chunk, so peak RAM
is about one copy of the decoded audio (a 15-minute 48 kHz stereo file is
~350 MB as float32) instead of two or three.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import soundfile as sf
import soxr

log = logging.getLogger(__name__)

WAV_SUBTYPES = {"wav24": "PCM_24", "wav32f": "FLOAT", "wav16": "PCM_16"}
"""Output format id (SPEC ``output_format``) -> libsndfile subtype."""

_CHUNK_FRAMES = 1 << 18
_DEFAULT_TIMEOUT_S = 900.0
_AAC_MAX_RATE = 48000


class AudioDecodeError(ValueError):
    """The file could not be decoded or contains no audio stream."""


@dataclass
class DecodedAudio:
    """Decoded audio at the source sample rate.

    ``samples`` is float32 ``(channels, n)``; ``channels`` is 1 or 2 (sources
    with more channels are downmixed to stereo by ffmpeg's standard matrix);
    ``codec`` is ffprobe's ``codec_name`` of the decoded stream.
    """

    samples: np.ndarray
    sample_rate: int
    channels: int
    codec: str

    @property
    def num_frames(self) -> int:
        return int(self.samples.shape[1])

    @property
    def duration_seconds(self) -> float:
        return self.num_frames / float(self.sample_rate) if self.sample_rate else 0.0


# --------------------------------------------------------------------- helpers
def _as_2d(x: np.ndarray) -> np.ndarray:
    """View ``x`` as float32 ``(c, n)``; 1-D input becomes ``(1, n)``."""
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr[np.newaxis, :]
    if arr.ndim != 2:
        raise ValueError(f"expected audio shaped (channels, samples), got {arr.shape}")
    return arr


def _tail(text: str, limit: int = 600) -> str:
    text = (text or "").strip()
    return text[-limit:]


def _probe(path: str, timeout: float) -> dict:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels,duration:format=duration",
        "-of", "json", path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:  # pragma: no cover - deployment error
        raise RuntimeError("ffprobe not found on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioDecodeError("timed out while probing the file") from exc
    if proc.returncode != 0:
        raise AudioDecodeError(f"not a readable media file: {_tail(proc.stderr) or 'ffprobe failed'}")
    try:
        info = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise AudioDecodeError("could not parse ffprobe output") from exc
    streams = info.get("streams") or []
    if not streams:
        raise AudioDecodeError("the file contains no audio stream")
    stream = streams[0]
    try:
        sr = int(stream.get("sample_rate") or 0)
        ch = int(stream.get("channels") or 0)
    except (TypeError, ValueError) as exc:
        raise AudioDecodeError("unreadable audio stream parameters") from exc
    if sr <= 0 or ch <= 0:
        raise AudioDecodeError("audio stream has no valid sample rate / channel count")
    duration = None
    for source in (stream.get("duration"), (info.get("format") or {}).get("duration")):
        try:
            if source is not None:
                duration = float(source)
                break
        except (TypeError, ValueError):
            continue
    return {"codec": str(stream.get("codec_name") or "unknown"), "sample_rate": sr,
            "channels": ch, "duration": duration}


# --------------------------------------------------------------------- decode
def decode_audio(path: str, timeout: Optional[float] = _DEFAULT_TIMEOUT_S) -> DecodedAudio:
    """Decode the first audio stream of ``path`` to float32 at its source rate.

    Raises :class:`AudioDecodeError` if the file is not decodable, has no audio
    stream or decodes to zero samples.
    """
    path = os.fspath(path)
    if not os.path.isfile(path):
        raise AudioDecodeError(f"file not found: {path}")
    probe_timeout = 60.0 if timeout is None else min(60.0, float(timeout))
    info = _probe(path, probe_timeout)
    sr = info["sample_rate"]
    channels = 1 if info["channels"] == 1 else 2

    tmp_dir = os.path.dirname(os.path.abspath(path))
    if not os.access(tmp_dir, os.W_OK):
        tmp_dir = None
    fd, raw_path = tempfile.mkstemp(prefix=".decode-", suffix=".f32", dir=tmp_dir)
    os.close(fd)
    try:
        cmd = [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", path, "-map", "0:a:0", "-vn", "-sn", "-dn",
            "-ac", str(channels), "-ar", str(sr),
            "-f", "f32le", "-acodec", "pcm_f32le", raw_path,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        except FileNotFoundError as exc:  # pragma: no cover - deployment error
            raise RuntimeError("ffmpeg not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            raise AudioDecodeError("timed out while decoding the file") from exc
        if proc.returncode != 0:
            raise AudioDecodeError(f"could not decode audio: {_tail(proc.stderr) or 'ffmpeg failed'}")
        n_values = os.path.getsize(raw_path) // 4
        n = n_values // channels
        if n <= 0:
            raise AudioDecodeError("the audio stream decoded to zero samples")
        raw = np.memmap(raw_path, dtype="<f4", mode="r", shape=(n * channels,))
        try:
            samples = np.empty((channels, n), dtype=np.float32)
            for start in range(0, n, _CHUNK_FRAMES):
                stop = min(n, start + _CHUNK_FRAMES)
                block = np.asarray(raw[start * channels:stop * channels]).reshape(stop - start, channels)
                samples[:, start:stop] = block.T
            np.nan_to_num(samples, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        finally:
            del raw
    finally:
        try:
            os.unlink(raw_path)
        except OSError:  # pragma: no cover
            pass
    return DecodedAudio(samples=samples, sample_rate=sr, channels=channels, codec=info["codec"])


# ------------------------------------------------------------- sample handling
def resample(x: np.ndarray, sr_from: int, sr_to: int, quality: str = "VHQ") -> np.ndarray:
    """Resample ``(c, n)`` audio with soxr (very-high quality), channel by channel.

    Returns the input unchanged (as float32 ``(c, n)``) when the rates match.
    The output length is soxr's ``ceil(n * sr_to / sr_from)``-style length;
    use :func:`fit_length` to force an exact sample count.
    """
    arr = _as_2d(x)
    sr_from, sr_to = int(sr_from), int(sr_to)
    if sr_from <= 0 or sr_to <= 0:
        raise ValueError("sample rates must be positive")
    if sr_from == sr_to:
        return arr
    if arr.shape[1] == 0:
        return np.zeros((arr.shape[0], 0), dtype=np.float32)
    rows = [soxr.resample(np.ascontiguousarray(arr[ch]), sr_from, sr_to, quality=quality)
            for ch in range(arr.shape[0])]
    out = np.empty((arr.shape[0], rows[0].shape[0]), dtype=np.float32)
    for ch, row in enumerate(rows):
        out[ch] = row
    return out


def fit_length(x: np.ndarray, n: int) -> np.ndarray:
    """Zero-pad or trim ``(c, m)`` audio to exactly ``n`` samples."""
    arr = _as_2d(x)
    n = int(n)
    if n < 0:
        raise ValueError("length must be >= 0")
    m = arr.shape[1]
    if m == n:
        return arr
    if m > n:
        return arr[:, :n]
    out = np.zeros((arr.shape[0], n), dtype=np.float32)
    out[:, :m] = arr
    return out


def to_stereo(x: np.ndarray) -> np.ndarray:
    """``(1, n)`` -> ``(2, n)`` by duplication; ``(2, n)`` is returned unchanged."""
    arr = _as_2d(x)
    if arr.shape[0] == 2:
        return arr
    if arr.shape[0] == 1:
        return np.repeat(arr, 2, axis=0)
    raise ValueError(f"to_stereo expects 1 or 2 channels, got {arr.shape[0]}")


def to_channels(x: np.ndarray, channels: int) -> np.ndarray:
    """Convert to ``channels`` (1: mean of all channels, 2: :func:`to_stereo`)."""
    arr = _as_2d(x)
    if channels == 1:
        if arr.shape[0] == 1:
            return arr
        return arr.mean(axis=0, dtype=np.float64).astype(np.float32)[np.newaxis, :]
    if channels == 2:
        return to_stereo(arr)
    raise ValueError(f"unsupported channel count {channels}")


# ------------------------------------------------------------------- writing
def _quantize(block: np.ndarray, subtype: str) -> np.ndarray:
    """Round float samples in [-1, 1] to the integer grid that libsndfile reads
    back as ``k / 2**(bits-1)``.

    libsndfile's own float -> PCM conversion truncates toward -inf (0.6 LSB is
    written as 0, -0.4 LSB as -1), a -0.5 LSB DC bias per file that adds up
    when stems are summed; rounding here makes the error zero-mean.
    """
    if subtype == "PCM_16":
        q = np.rint(block * np.float32(32768.0))
        np.clip(q, -32768.0, 32767.0, out=q)
        return q.astype(np.int16)
    # PCM_24, written as int32 whose low byte libsndfile drops (exactly)
    q = np.rint(block.astype(np.float64) * 8388608.0)
    np.clip(q, -8388608.0, 8388607.0, out=q)
    return q.astype(np.int32) << 8


def write_wav(path: str, x: np.ndarray, sr: int, fmt: str) -> None:
    """Write ``(c, n)`` audio as WAV.

    ``fmt``: ``wav24`` (PCM_24), ``wav32f`` (FLOAT) or ``wav16`` (PCM_16).
    Integer formats are clipped to [-1, 1] (callers keep |x| <= 1 by applying
    a common gain; clipping is only a safety net). NaN/inf become 0. The file
    is written under a temporary name and atomically renamed into place.
    """
    try:
        subtype = WAV_SUBTYPES[fmt]
    except KeyError:
        raise ValueError(f"unknown output format {fmt!r}; expected one of {sorted(WAV_SUBTYPES)}") from None
    arr = _as_2d(x)
    path = os.fspath(path)
    tmp = f"{path}.part"
    clip = subtype != "FLOAT"
    try:
        with sf.SoundFile(tmp, mode="w", samplerate=int(sr), channels=arr.shape[0],
                          subtype=subtype, format="WAV") as handle:
            for start in range(0, arr.shape[1], _CHUNK_FRAMES):
                block = np.array(arr[:, start:start + _CHUNK_FRAMES].T, dtype=np.float32, order="C")
                np.nan_to_num(block, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
                if clip:
                    np.clip(block, -1.0, 1.0, out=block)
                    handle.write(_quantize(block, subtype))
                else:
                    handle.write(block)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_wav(path: str) -> Tuple[np.ndarray, int]:
    """Read a WAV (or any libsndfile format) as float32 ``(c, n)`` plus its rate."""
    data, sr = sf.read(os.fspath(path), dtype="float32", always_2d=True)
    return np.ascontiguousarray(data.T), int(sr)


def encode_preview_aac(src_wav: str, dst_m4a: str, bitrate: str = "256k") -> None:
    """Encode ``src_wav`` to AAC-LC in an MP4 container with ``+faststart``.

    Sources above 48 kHz are resampled to 48 kHz (AAC-LC's practical limit;
    previews are for in-app playback only). Raises :class:`RuntimeError` if
    ffmpeg fails. The output is written atomically.
    """
    src_wav = os.fspath(src_wav)
    dst_m4a = os.fspath(dst_m4a)
    try:
        src_rate = int(sf.info(src_wav).samplerate)
    except Exception:  # noqa: BLE001 - let ffmpeg decide below
        src_rate = 0
    tmp = f"{dst_m4a}.part"
    cmd = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", src_wav, "-map", "0:a:0", "-vn",
        "-c:a", "aac", "-b:a", str(bitrate),
    ]
    if src_rate > _AAC_MAX_RATE:
        cmd += ["-ar", str(_AAC_MAX_RATE)]
    cmd += ["-movflags", "+faststart", "-f", "mp4", tmp]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:  # pragma: no cover - deployment error
        raise RuntimeError("ffmpeg not found on PATH") from exc
    if proc.returncode != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise RuntimeError(f"AAC preview encoding failed: {_tail(proc.stderr) or 'no output'}")
    os.replace(tmp, dst_m4a)
