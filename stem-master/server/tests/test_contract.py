"""The server <-> app contract fixture (SPEC section 4).

``stem-master/contract/job_completed.json`` is a real completed Job: a
synthetic 6-second song (120 BPM, A minor) uploaded through the FastAPI app
with every option on and processed by the real pipeline on the deterministic
``fake`` engine. The iOS test-suite decodes the same file, so a change to the
Job JSON on either side fails CI.

Volatile fields are normalised before the comparison (and in the file):

* the job id (also inside every URL) -> ``0123456789abcdef0123456789abcdef``
* ``created_at`` / ``updated_at`` -> ``2026-01-01T00:00:00Z``
* ``wav_bytes`` -> the canonical PCM size (44-byte header + frames x channels x
  bytes per sample; the real size is checked to be within 512 bytes of it);
  ``preview_bytes`` -> the nominal 256 kbps size (the real value depends on
  the ffmpeg build and is only checked to be non-trivial)
* measured numbers are rounded (dB to 0.1, ratios to 0.01, waveform to 0.001)

Comparison is exact for every key, string, enum, id, URL and integer, and
uses small per-field tolerances for measured floats, so the fixture also
holds on other platforms and library versions (e.g. the production
Python 3.11 image with librosa 0.11).

Regenerate with ``UPDATE_CONTRACT=1 pytest tests/test_contract.py`` (the file
is also written when it is missing).
"""

from __future__ import annotations

import io
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from conftest import wait_until
from stem_master.api import create_app
from stem_master.catalog import CATALOG_ORDER, GROUPS, ROLES, STEM_IDS, spec_for
from stem_master.jobs import JobManager

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contract" / "job_completed.json"
FIXED_ID = "0123456789abcdef0123456789abcdef"
FIXED_TIME = "2026-01-01T00:00:00Z"
FILENAME = "My Song.wav"
SAMPLE_RATE = 44100
SECONDS = 6.0
PREVIEW_KBPS = 256

ALL_OPTIONS = {
    "quality": "max", "drum_split": True, "vocal_split": True, "dereverb": True, "cleanup": True,
    "cleanup_strength": "standard", "denoise": True, "denoise_strength": "standard", "output_format": "wav24",
}
JOB_KEYS = {
    "id", "status", "created_at", "updated_at", "filename", "options", "progress", "stage", "stage_label",
    "queue_position", "error", "analysis", "stems", "zip_url", "gain_offset_db",
}
ANALYSIS_KEYS = {
    "duration_seconds", "sample_rate", "channels", "codec", "bpm", "bpm_confidence", "key", "camelot",
    "key_confidence", "loudness_lufs", "peak_dbfs", "artifact_level", "artifact_label", "spectral_cutoff_hz",
}
STEM_KEYS = {
    "id", "name", "group", "role", "color", "wav_url", "preview_url", "wav_bytes", "preview_bytes",
    "peak_dbfs", "rms_dbfs", "active_ratio", "waveform",
}
BYTES_PER_SAMPLE = {"wav16": 2, "wav24": 3, "wav32f": 4}

# Rounding applied to measured values (decimals), and comparison tolerances.
ROUNDING = {
    "duration_seconds": 3, "bpm": 1, "bpm_confidence": 2, "key_confidence": 2, "loudness_lufs": 1,
    "peak_dbfs": 1, "rms_dbfs": 1, "artifact_level": 2, "spectral_cutoff_hz": 0, "active_ratio": 2,
    "gain_offset_db": 2, "waveform": 3,
}
TOLERANCE = {
    "duration_seconds": 0.002, "bpm": 2.0, "bpm_confidence": 0.2, "key_confidence": 0.2, "loudness_lufs": 0.5,
    "peak_dbfs": 0.5, "rms_dbfs": 0.5, "artifact_level": 0.1, "spectral_cutoff_hz": 500.0, "active_ratio": 0.05,
    "gain_offset_db": 0.1, "waveform": 0.02,
}


# ---------------------------------------------------------------------------
# the song
# ---------------------------------------------------------------------------


def contract_song(seconds: float = SECONDS, sr: int = SAMPLE_RATE) -> np.ndarray:
    """120 BPM in A minor: A bass, an A-minor pad, an arpeggio, kick on the beat,
    noise hi-hats on eighths and a low noise floor. Deterministic, (2, n)."""
    n = int(round(seconds * sr))
    t = np.arange(n) / sr
    rng = np.random.default_rng(2026)

    def tone(freq: float) -> np.ndarray:
        return np.sin(2 * np.pi * freq * t)

    mix = 0.22 * tone(110.0) + 0.10 * (tone(220.0) + tone(261.63) + tone(329.63))
    beat = 0.5
    arpeggio = (440.0, 523.25, 659.26, 523.25)
    for k in range(int(seconds / beat)):
        start = int(k * beat * sr)
        length = min(int(beat * sr), n - start)
        local = np.arange(length) / sr
        envelope = np.exp(-local / 0.18)
        mix[start:start + length] += 0.12 * envelope * np.sin(2 * np.pi * arpeggio[k % 4] * local)
        kick_len = min(int(0.25 * sr), length)
        kt = local[:kick_len]
        mix[start:start + kick_len] += 0.6 * np.exp(-kt / 0.07) * np.sin(2 * np.pi * (50 + 60 * np.exp(-kt / 0.02)) * kt)
    hat = np.diff(rng.standard_normal(int(0.05 * sr) + 1))
    hat *= np.exp(-np.arange(hat.size) / (0.012 * sr))
    for k in range(int(seconds / (beat / 2))):
        start = int(k * beat / 2 * sr)
        m = min(hat.size, n - start)
        mix[start:start + m] += 0.08 * hat[:m]
    mix += 0.003 * rng.standard_normal(n)
    stereo = np.stack([mix, 0.92 * mix + 0.08 * np.roll(mix, 60)])
    return (0.8 * stereo / np.max(np.abs(stereo))).astype(np.float32)


def song_wav_bytes() -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, contract_song().T, SAMPLE_RATE, format="WAV", subtype="PCM_24")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# normalisation, validation and comparison
# ---------------------------------------------------------------------------


def _round(value: Any, key: str) -> Any:
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    decimals = ROUNDING.get(key)
    if decimals is None:
        return value
    rounded = round(float(value), decimals)
    return rounded + 0.0  # no "-0.0"


def canonical_wav_bytes(job: Dict[str, Any]) -> int:
    analysis = job["analysis"]
    frames = int(round(analysis["duration_seconds"] * analysis["sample_rate"]))
    return 44 + frames * analysis["channels"] * BYTES_PER_SAMPLE[job["options"]["output_format"]]


def canonical_preview_bytes(job: Dict[str, Any]) -> int:
    return int(round(job["analysis"]["duration_seconds"] * PREVIEW_KBPS * 1000 / 8))


def normalise(job: Dict[str, Any]) -> Dict[str, Any]:
    """Replace volatile values (see the module docstring)."""
    data = json.loads(json.dumps(job).replace(job["id"], FIXED_ID))
    data["created_at"] = data["updated_at"] = FIXED_TIME
    data["gain_offset_db"] = _round(data["gain_offset_db"], "gain_offset_db")
    analysis = data["analysis"]
    for key in list(analysis):
        analysis[key] = _round(analysis[key], key)
    wav_bytes, preview_bytes = canonical_wav_bytes(data), canonical_preview_bytes(data)
    for stem in data["stems"]:
        stem["wav_bytes"] = wav_bytes
        stem["preview_bytes"] = preview_bytes
        for key in ("peak_dbfs", "rms_dbfs", "active_ratio"):
            stem[key] = _round(stem[key], key)
        stem["waveform"] = [_round(v, "waveform") for v in stem["waveform"]]
    return data


def validate_shape(job: Dict[str, Any]) -> None:
    """Everything SPEC section 4 promises about a completed Job."""
    assert set(job) == JOB_KEYS
    job_id = job["id"]
    assert re.fullmatch(r"[0-9a-f]{32}", job_id)
    assert job["status"] == "completed" and job["stage"] == "done" and job["progress"] == 1.0
    assert job["queue_position"] is None and job["error"] is None
    assert job["zip_url"] == f"/v1/jobs/{job_id}/download.zip"
    assert job["filename"] == FILENAME
    for key in ("created_at", "updated_at"):
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", job[key])
    assert job["created_at"] <= job["updated_at"]
    assert job["options"] == ALL_OPTIONS
    assert isinstance(job["gain_offset_db"], (int, float)) and job["gain_offset_db"] <= 0.0

    analysis = job["analysis"]
    assert set(analysis) == ANALYSIS_KEYS
    assert analysis["sample_rate"] == SAMPLE_RATE and analysis["channels"] == 2
    assert analysis["duration_seconds"] == pytest.approx(SECONDS, abs=0.01)
    assert analysis["key"] and analysis["artifact_label"] in ("low", "moderate", "high")
    for key in ("bpm_confidence", "key_confidence", "artifact_level"):
        assert 0.0 <= analysis[key] <= 1.0
    assert analysis["spectral_cutoff_hz"] is None or analysis["spectral_cutoff_hz"] > 0

    stems = job["stems"]
    ids = [stem["id"] for stem in stems]
    assert len(ids) == len(set(ids)) and ids == sorted(ids, key=CATALOG_ORDER.__getitem__)
    for stem in stems:
        assert set(stem) == STEM_KEYS, stem["id"]
        spec = spec_for(stem["id"])
        assert stem["id"] in STEM_IDS and stem["group"] == spec.group and stem["color"] == spec.color
        assert stem["group"] in GROUPS and stem["role"] in ROLES and stem["name"]
        assert (stem["group"] == "removed") == (stem["role"] == "removed")
        assert re.fullmatch(r"#[0-9A-Fa-f]{6}", stem["color"])
        assert stem["wav_url"] == f"/v1/jobs/{job_id}/stems/{stem['id']}.wav"
        assert stem["preview_url"] == f"/v1/jobs/{job_id}/stems/{stem['id']}.m4a"
        assert stem["wav_bytes"] > 0 and stem["preview_bytes"] > 0
        assert len(stem["waveform"]) == 256 and all(0.0 <= v <= 1.0 for v in stem["waveform"])
        assert 0.0 <= stem["active_ratio"] <= 1.0
        assert -120.0 <= stem["rms_dbfs"] <= stem["peak_dbfs"] + 1e-9
    roles = {stem["id"]: stem["role"] for stem in stems}
    names = {stem["id"]: stem["name"] for stem in stems}
    # every option is on (SPEC section 3 "appears when")
    assert roles["vocals"] == "bus" and roles["drums"] == "bus"
    for stem_id in ("lead_vocals", "backing_vocals", "vocal_reverb", "kick", "snare", "toms", "hihat", "ride",
                    "crash", "bass", "guitar", "piano", "other"):
        assert roles[stem_id] == "primary", stem_id
    assert roles["removed_bleed"] == roles["removed_noise"] == "removed"
    assert "vocals_dry" not in roles
    assert names["lead_vocals"] == "Lead Vocals (Dry)"


def assert_matches(expected: Any, actual: Any, path: str = "job") -> None:
    """Exact structure and values; per-field tolerance for measured floats."""
    key = path.rsplit(".", 1)[-1].split("[", 1)[0]
    if isinstance(expected, dict):
        assert isinstance(actual, dict), path
        assert set(expected) == set(actual), f"{path}: keys {sorted(set(expected) ^ set(actual))} differ"
        for name in expected:
            assert_matches(expected[name], actual[name], f"{path}.{name}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(expected) == len(actual), f"{path}: length differs"
        for index, (e, a) in enumerate(zip(expected, actual)):
            child = f"{path}[{index}]"
            if isinstance(e, dict) and "id" in e:
                child = f"{path}[{e['id']}]"
            assert_matches(e, a, child)
    elif isinstance(expected, float) and not isinstance(expected, bool) and key in TOLERANCE:
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), path
        assert math.isclose(expected, actual, abs_tol=TOLERANCE[key]), f"{path}: {actual} != {expected}"
    else:
        assert type(expected) is type(actual) or (
            isinstance(expected, (int, float)) and isinstance(actual, (int, float))
            and not isinstance(expected, bool) and not isinstance(actual, bool)
        ), f"{path}: type {type(actual).__name__} != {type(expected).__name__}"
        assert expected == actual, f"{path}: {actual!r} != {expected!r}"


def dump(job: Dict[str, Any]) -> str:
    return json.dumps(job, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


# ---------------------------------------------------------------------------
# test
# ---------------------------------------------------------------------------


def run_contract_job(make_settings, managers) -> Tuple[Dict[str, Any], List[Path]]:
    settings = make_settings(engine="fake")
    manager = JobManager(settings)  # default runner: the real pipeline
    managers.append(manager)
    app = create_app(settings, manager)
    with TestClient(app) as client:
        response = client.post(
            "/v1/jobs",
            files={"file": (FILENAME, song_wav_bytes(), "audio/wav")},
            data={"options": json.dumps(ALL_OPTIONS)},
            headers={"X-Client-Id": "contract-test"},
        )
        assert response.status_code == 202, response.text
        job_id = response.json()["id"]

        def finished() -> bool:
            return client.get(f"/v1/jobs/{job_id}").json()["status"] in ("completed", "failed", "cancelled")

        wait_until(finished, timeout=300, interval=0.2)
        job = client.get(f"/v1/jobs/{job_id}").json()
        assert job["status"] == "completed", job.get("error")
        head = client.head(job["stems"][0]["wav_url"])
        assert head.status_code == 200 and int(head.headers["content-length"]) == job["stems"][0]["wav_bytes"]
    stems_dir = settings.jobs_dir / job_id / "stems"
    return job, sorted(stems_dir.iterdir())


def test_contract_fixture(make_settings, managers):
    job, files = run_contract_job(make_settings, managers)
    validate_shape(job)
    wav_bytes = canonical_wav_bytes(job)
    for stem in job["stems"]:
        assert wav_bytes <= stem["wav_bytes"] <= wav_bytes + 512, (stem["id"], stem["wav_bytes"], wav_bytes)
        assert stem["preview_bytes"] > 1_000, stem["id"]
    assert len(files) == 2 * len(job["stems"])

    fixture = normalise(job)
    validate_shape(fixture)
    if os.environ.get("UPDATE_CONTRACT") == "1" or not CONTRACT_PATH.exists():
        CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = CONTRACT_PATH.with_suffix(".json.tmp")
        tmp.write_text(dump(fixture), encoding="utf-8")
        os.replace(tmp, CONTRACT_PATH)

    stored = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    validate_shape(stored)
    assert CONTRACT_PATH.read_text(encoding="utf-8") == dump(stored), "fixture is not in canonical form"
    assert_matches(stored, fixture)


def test_normalisation_is_stable():
    job = {
        "id": "f" * 32, "created_at": "2026-11-20T10:00:00Z", "updated_at": "2026-11-20T10:01:00Z",
        "gain_offset_db": -0.0, "options": dict(ALL_OPTIONS),
        "analysis": {"duration_seconds": 6.0, "sample_rate": 44100, "channels": 2, "bpm": 119.9876,
                     "spectral_cutoff_hz": None},
        "stems": [{"id": "bass", "wav_url": f"/v1/jobs/{'f' * 32}/stems/bass.wav", "wav_bytes": 1,
                   "preview_bytes": 1, "peak_dbfs": -3.14159, "rms_dbfs": -20.0, "active_ratio": 0.123456,
                   "waveform": [0.12345] * 256}],
    }
    out = normalise(job)
    assert out["id"] == FIXED_ID and out["stems"][0]["wav_url"] == f"/v1/jobs/{FIXED_ID}/stems/bass.wav"
    assert out["created_at"] == out["updated_at"] == FIXED_TIME
    assert out["analysis"]["bpm"] == 120.0 and out["analysis"]["spectral_cutoff_hz"] is None
    assert out["stems"][0]["wav_bytes"] == 44 + 264600 * 2 * 3 and out["stems"][0]["preview_bytes"] == 192000
    assert out["stems"][0]["peak_dbfs"] == -3.1 and out["stems"][0]["waveform"][0] == 0.123
    assert math.copysign(1.0, out["gain_offset_db"]) == 1.0
    assert normalise(out) == out
    with pytest.raises(AssertionError):
        assert_matches(out, {**out, "stage_label": "x"})
    shifted = json.loads(json.dumps(out))
    shifted["stems"][0]["peak_dbfs"] += 0.3
    assert_matches(out, shifted)
    shifted["stems"][0]["peak_dbfs"] += 1.0
    with pytest.raises(AssertionError):
        assert_matches(out, shifted)
