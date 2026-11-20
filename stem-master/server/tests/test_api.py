"""HTTP API contract tests (SPEC section 4) plus config/schema/catalog/probe."""

from __future__ import annotations

import io
import json
import re
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

import pytest
from fastapi.testclient import TestClient

from conftest import FakeRunner, make_wav_bytes, wait_until
from stem_master import __version__
from stem_master.api import content_disposition, create_app, parse_options
from stem_master.catalog import CATALOG_ORDER, GROUPS, STEM_CATALOG, spec_for
from stem_master.config import ConfigError, load_settings
from stem_master.jobs import JobManager
from stem_master.probe import ProbeError, probe_audio
from stem_master.schemas import WAVEFORM_POINTS, Analysis, Job, JobOptions, Stem

ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
JOB_KEYS = {
    "id", "status", "created_at", "updated_at", "filename", "options", "progress", "stage",
    "stage_label", "queue_position", "error", "analysis", "stems", "zip_url", "gain_offset_db",
}
STEM_KEYS = {
    "id", "name", "group", "role", "color", "wav_url", "preview_url", "wav_bytes", "preview_bytes",
    "peak_dbfs", "rms_dbfs", "active_ratio", "waveform",
}
ANALYSIS_KEYS = {
    "duration_seconds", "sample_rate", "channels", "codec", "bpm", "bpm_confidence", "key", "camelot",
    "key_confidence", "loudness_lufs", "peak_dbfs", "artifact_level", "artifact_label",
    "spectral_cutoff_hz",
}
SPEC_DEFAULT_OPTIONS = {
    "quality": "max", "drum_split": True, "vocal_split": True, "dereverb": False, "cleanup": True,
    "cleanup_strength": "standard", "denoise": False, "denoise_strength": "standard",
    "output_format": "wav24",
}


@pytest.fixture
def make_client(make_settings, managers):
    """``with make_client(runner, **settings) as (client, manager): ...``"""

    @contextmanager
    def factory(runner=None, **overrides) -> Iterator[tuple]:
        settings = make_settings(**overrides)
        manager = JobManager(settings, runner or FakeRunner())
        managers.append(manager)
        app = create_app(settings, manager)
        with TestClient(app) as client:
            yield client, manager

    return factory


def upload(client: TestClient, data: Optional[bytes] = None, name: str = "My Song.wav",
           options: Optional[object] = None, client_id: Optional[str] = "client-1", headers=None):
    files = {"file": (name, data if data is not None else make_wav_bytes(0.5), "audio/wav")}
    form = {}
    if options is not None:
        form["options"] = options if isinstance(options, str) else json.dumps(options)
    all_headers = dict(headers or {})
    if client_id:
        all_headers["X-Client-Id"] = client_id
    return client.post("/v1/jobs", files=files, data=form, headers=all_headers)


def wait_job(client: TestClient, job_id: str, *statuses: str, headers=None) -> dict:
    holder = {}

    def check() -> bool:
        holder["job"] = client.get(f"/v1/jobs/{job_id}", headers=headers or {}).json()
        return holder["job"]["status"] in statuses

    wait_until(check)
    return holder["job"]


# ---------------------------------------------------------------------------
# health, capabilities, auth
# ---------------------------------------------------------------------------


def test_root_banner(make_client):
    with make_client(api_key="secret") as (client, _):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["name"] == "Stem Master by MP Audio"


def test_health_and_capabilities(make_client):
    with make_client(max_upload_mb=123, max_duration_seconds=456) as (client, _):
        health = client.get("/v1/health")
        assert health.status_code == 200
        body = health.json()
        assert set(body) == {"status", "version", "device", "queue_length", "auth_required"}
        assert body["status"] == "ok"
        assert body["version"] == __version__ == "1.0.0"
        assert body["device"] in ("cuda", "mps", "cpu")
        assert body["queue_length"] == 0
        assert body["auth_required"] is False

        caps = client.get("/v1/capabilities").json()
        assert caps == {
            "max_upload_mb": 123,
            "max_duration_seconds": 456,
            "output_formats": ["wav24", "wav32f", "wav16"],
            "default_options": SPEC_DEFAULT_OPTIONS,
        }


def test_auth(make_client):
    with make_client(api_key="s3cret-key") as (client, _):
        assert client.get("/v1/health").status_code == 200
        assert client.get("/v1/health").json()["auth_required"] is True

        for method, path in [
            ("GET", "/v1/capabilities"), ("GET", "/v1/jobs"), ("POST", "/v1/jobs"),
            ("GET", f"/v1/jobs/{'a' * 32}"), ("DELETE", f"/v1/jobs/{'a' * 32}"),
            ("POST", f"/v1/jobs/{'a' * 32}/cancel"), ("GET", f"/v1/jobs/{'a' * 32}/download.zip"),
            ("GET", f"/v1/jobs/{'a' * 32}/stems/vocals.wav"),
        ]:
            response = client.request(method, path)
            assert response.status_code == 401, (method, path)
            assert isinstance(response.json()["detail"], str)
            assert response.headers["www-authenticate"] == "Bearer"

        for bad in ("Bearer wrong", "Basic s3cret-key", "s3cret-key", "Bearer ", "Bearer s3cret-key2"):
            assert client.get("/v1/capabilities", headers={"Authorization": bad}).status_code == 401

        ok = {"Authorization": "Bearer s3cret-key"}
        assert client.get("/v1/capabilities", headers=ok).status_code == 200
        assert client.get("/v1/capabilities", headers={"Authorization": "bearer s3cret-key"}).status_code == 200
        response = upload(client, headers=ok)
        assert response.status_code == 202
        job_id = response.json()["id"]
        wait_job(client, job_id, "completed", headers=ok)


def test_cors_preflight_and_headers(make_client):
    with make_client(api_key="k") as (client, _):
        preflight = client.options(
            "/v1/jobs",
            headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST",
                     "Access-Control-Request-Headers": "authorization,x-client-id"},
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] in ("*", "https://example.com")
        response = client.get("/v1/health", headers={"Origin": "https://example.com"})
        assert response.headers["access-control-allow-origin"] == "*"


# ---------------------------------------------------------------------------
# full upload -> completed -> downloads
# ---------------------------------------------------------------------------


def test_upload_to_completion_and_downloads(make_client, preview_m4a):
    runner = FakeRunner(preview_m4a, roles={"drums": "primary"}, gain_offset_db=-1.5)
    with make_client(runner) as (client, manager):
        options = {"quality": "fast", "drum_split": False, "denoise": True, "output_format": "wav16"}
        response = upload(client, options=options, name="Ünïcode Söng.wav")
        assert response.status_code == 202, response.text
        created = response.json()
        assert set(created) == JOB_KEYS
        assert re.fullmatch(r"[0-9a-f]{32}", created["id"])
        assert response.headers["location"] == f"/v1/jobs/{created['id']}"
        assert created["status"] in ("queued", "processing")
        assert created["filename"] == "Ünïcode Söng.wav"
        assert created["options"] == {**SPEC_DEFAULT_OPTIONS, **options}
        assert ISO_Z.match(created["created_at"]) and ISO_Z.match(created["updated_at"])

        job = wait_job(client, created["id"], "completed")
        job_id = job["id"]
        assert set(job) == JOB_KEYS
        assert job["progress"] == 1.0 and job["stage"] == "done" and job["error"] is None
        assert job["queue_position"] is None
        assert job["zip_url"] == f"/v1/jobs/{job_id}/download.zip"
        assert job["gain_offset_db"] == -1.5
        assert set(job["analysis"]) == ANALYSIS_KEYS
        assert job["analysis"]["spectral_cutoff_hz"] is None
        ids = [s["id"] for s in job["stems"]]
        assert ids == sorted(ids, key=CATALOG_ORDER.__getitem__)
        for stem in job["stems"]:
            assert set(stem) == STEM_KEYS
            assert len(stem["waveform"]) == WAVEFORM_POINTS
            spec = spec_for(stem["id"])
            assert (stem["group"], stem["color"]) == (spec.group, spec.color)
        Job.model_validate(job)  # round-trips through the response model

        # WAV download: full body, then a Range request.
        vocals = next(s for s in job["stems"] if s["id"] == "vocals")
        wav = client.get(vocals["wav_url"])
        assert wav.status_code == 200
        assert wav.headers["content-type"] == "audio/wav"
        assert wav.headers["accept-ranges"] == "bytes"
        assert len(wav.content) == vocals["wav_bytes"]
        assert wav.content[:4] == b"RIFF"
        assert "filename*=UTF-8''" in wav.headers["content-disposition"]

        partial = client.get(vocals["wav_url"], headers={"Range": "bytes=0-99"})
        assert partial.status_code == 206
        assert partial.content == wav.content[:100]
        assert partial.headers["content-range"] == f"bytes 0-99/{vocals['wav_bytes']}"
        tail = client.get(vocals["wav_url"], headers={"Range": "bytes=-10"})
        assert tail.status_code == 206 and tail.content == wav.content[-10:]
        unsatisfiable = client.get(vocals["wav_url"], headers={"Range": f"bytes={10 ** 9}-"})
        assert unsatisfiable.status_code == 416

        head = client.head(vocals["wav_url"])
        assert head.status_code == 200 and head.content == b""
        assert int(head.headers["content-length"]) == vocals["wav_bytes"]

        preview = client.get(vocals["preview_url"])
        assert preview.status_code == 200
        assert preview.headers["content-type"] == "audio/mp4"
        assert preview.content == preview_m4a.read_bytes()
        assert len(preview.content) == vocals["preview_bytes"]
        assert client.get(vocals["preview_url"], headers={"Range": "bytes=0-1"}).status_code == 206

        # ZIP: stems in catalogue order, manifest, README; built once.
        archive_response = client.get(job["zip_url"])
        assert archive_response.status_code == 200
        assert archive_response.headers["content-type"] == "application/zip"
        disposition = archive_response.headers["content-disposition"]
        assert disposition.startswith("attachment; ")
        assert "filename*=UTF-8''%C3%9Cn%C3%AFcode%20S%C3%B6ng%20-%20Stem%20Master.zip" in disposition
        assert 'filename="_n_code S_ng - Stem Master.zip"' in disposition

        archive = zipfile.ZipFile(io.BytesIO(archive_response.content))
        names = archive.namelist()
        expected = [f"{i:02d} {spec_for(sid).name}.wav" for i, sid in enumerate(ids, start=1)]
        assert names == expected + ["manifest.json", "README.txt"]
        assert names[0] == "01 Vocals.wav" and "06 Synths & Other.wav" in names
        assert all(info.compress_type == zipfile.ZIP_STORED for info in archive.infolist())
        assert archive.read("01 Vocals.wav") == wav.content
        assert json.loads(archive.read("manifest.json")) == client.get(f"/v1/jobs/{job_id}").json()
        readme = archive.read("README.txt").decode()
        for fragment in ("Stem Master by MP Audio", "Ünïcode Söng", "120.0 BPM", "A minor", "8A",
                         "-14.2 LUFS", "-1.50", "+1.50", "primary", "Primary stems sum to the original mix",
                         "01 Vocals.wav"):
            assert fragment in readme, fragment

        zip_path = manager.settings.jobs_dir / job_id / "download.zip"
        first_mtime = zip_path.stat().st_mtime_ns
        assert client.get(job["zip_url"]).content == archive_response.content
        assert zip_path.stat().st_mtime_ns == first_mtime
        assert client.get(job["zip_url"], headers={"Range": "bytes=0-3"}).content == b"PK\x03\x04"


def test_bus_and_removed_roles_in_readme(make_client, preview_m4a):
    runner = FakeRunner(preview_m4a, stems=("drums", "kick", "snare", "removed_bleed"),
                        roles={"drums": "bus", "removed_bleed": "removed"})
    with make_client(runner) as (client, _):
        job = wait_job(client, upload(client).json()["id"], "completed")
        archive = zipfile.ZipFile(io.BytesIO(client.get(job["zip_url"]).content))
        assert archive.namelist()[:4] == ["01 Drums.wav", "02 Kick.wav", "03 Snare.wav", "04 Removed Bleed.wav"]
        readme = archive.read("README.txt").decode()
        assert "bus" in readme and "removed" in readme
        assert "Primary stems + Removed stems sum to the original mix" in readme
        assert "no gain was applied" in readme


# ---------------------------------------------------------------------------
# upload validation
# ---------------------------------------------------------------------------


def _uploads_empty(manager: JobManager) -> bool:
    return not any(manager.settings.uploads_dir.iterdir())


def test_upload_too_large_by_content_length(make_client):
    with make_client(max_upload_mb=1) as (client, manager):
        response = upload(client, data=b"\0" * (2 * 1024 * 1024))
        assert response.status_code == 413
        assert "1 MB" in response.json()["detail"]
        assert _uploads_empty(manager)
        assert client.get("/v1/jobs", headers={"X-Client-Id": "client-1"}).json() == {"jobs": []}


def test_upload_too_large_streamed(make_client):
    """Chunked body without Content-Length: the limit is enforced while streaming."""
    with make_client(max_upload_mb=1) as (client, manager):
        boundary = "stemmasterboundary"
        head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"big.wav\"\r\n"
                f"Content-Type: audio/wav\r\n\r\n").encode()
        tail = f"\r\n--{boundary}--\r\n".encode()
        sent = []

        def body():
            yield head
            for _ in range(40):  # 40 x 64 KiB = 2.5 MiB
                sent.append(1)
                yield b"\1" * 65536
            yield tail

        response = client.post(
            "/v1/jobs", content=body(),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "X-Client-Id": "c"},
        )
        assert response.status_code == 413
        assert "content-length" not in {k.lower() for k in response.request.headers.keys()}
        assert _uploads_empty(manager)


def test_full_disk_is_a_clear_507_for_uploads_and_zips(make_client, preview_m4a, monkeypatch):
    import errno

    import stem_master.api as api_module

    def no_space(*_args, **_kwargs):
        raise OSError(errno.ENOSPC, "No space left on device")

    with make_client(FakeRunner(preview_m4a)) as (client, manager):
        job_id = upload(client).json()["id"]
        wait_job(client, job_id, "completed")

        with monkeypatch.context() as patch:
            patch.setattr(api_module._MultipartUpload, "_write", no_space)
            response = upload(client)
        assert response.status_code == 507
        assert response.json() == {"detail": "The server is out of disk space. Try again later."}
        assert _uploads_empty(manager)

        with monkeypatch.context() as patch:
            patch.setattr(api_module.zipfile.ZipFile, "write", no_space)
            response = client.get(f"/v1/jobs/{job_id}/download.zip")
        assert response.status_code == 507
        job_dir = manager.job_dir(job_id)
        assert not (job_dir / "download.zip").exists() and not (job_dir / "download.zip.tmp").exists()
        assert client.get(f"/v1/jobs/{job_id}/download.zip").status_code == 200, "works once there is space"


def test_options_part_after_file_part(make_client, preview_m4a):
    """A hand-built body with the options part after the file part."""
    with make_client(FakeRunner(preview_m4a)) as (client, _):
        boundary = "b0undary"
        wav = make_wav_bytes(0.3)
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n\r\n".encode()
            + wav
            + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"options\"\r\n\r\n".encode()
            + b'{"vocal_split": false}'
            + f"\r\n--{boundary}--\r\n".encode()
        )
        response = client.post("/v1/jobs", content=body,
                               headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        assert response.status_code == 202, response.text
        assert response.json()["options"]["vocal_split"] is False


def test_undecodable_uploads(make_client):
    with make_client() as (client, manager):
        garbage = upload(client, data=b"this is not audio at all" * 100, name="song.mp3")
        assert garbage.status_code == 415
        assert isinstance(garbage.json()["detail"], str)

        empty = upload(client, data=b"", name="song.wav")
        assert empty.status_code == 415

        playlist = b"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n"
        assert upload(client, data=playlist, name="evil.m3u8").status_code == 415

        not_multipart = client.post("/v1/jobs", content=make_wav_bytes(0.2),
                                    headers={"Content-Type": "audio/wav"})
        assert not_multipart.status_code == 415

        truncated = client.post(
            "/v1/jobs",
            content=b"--xyz\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n\r\nRIFF",
            headers={"Content-Type": "multipart/form-data; boundary=xyz"},
        )
        assert truncated.status_code == 400
        assert _uploads_empty(manager)
        assert not any(manager.settings.jobs_dir.iterdir())


def test_missing_file_field(make_client):
    with make_client() as (client, _):
        response = client.post("/v1/jobs", files={"options": (None, "{}")})
        assert response.status_code == 422
        assert "file" in response.json()["detail"]


@pytest.mark.parametrize(
    "options, fragment",
    [
        ({"quality": "ultra"}, "quality"),
        ({"cleanup_strength": "nuclear"}, "cleanup_strength"),
        ({"output_format": "mp3"}, "output_format"),
        ({"surprise": True}, "surprise"),
        ({"drum_split": "maybe"}, "drum_split"),
        ("[1, 2]", "JSON object"),
        ("{not json", "JSON"),
    ],
)
def test_bad_options(make_client, options, fragment):
    with make_client() as (client, manager):
        response = upload(client, options=options)
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert isinstance(detail, str) and fragment in detail, detail
        assert _uploads_empty(manager)


def test_options_defaults_and_partial(make_client):
    with make_client(FakeRunner(mode="block")) as (client, _):
        for raw, expected in [(None, SPEC_DEFAULT_OPTIONS), ("", SPEC_DEFAULT_OPTIONS),
                              ("null", SPEC_DEFAULT_OPTIONS),
                              ({"dereverb": True}, {**SPEC_DEFAULT_OPTIONS, "dereverb": True})]:
            response = upload(client, options=raw)
            assert response.status_code == 202, response.text
            assert response.json()["options"] == expected


def test_too_long_track(make_client):
    with make_client(max_duration_seconds=1) as (client, manager):
        response = upload(client, data=make_wav_bytes(3.0))
        assert response.status_code == 422
        assert "0:03" in response.json()["detail"] and "0:01" in response.json()["detail"]
        assert _uploads_empty(manager)
        assert upload(client, data=make_wav_bytes(0.8)).status_code == 202


def test_queue_full_returns_503(make_settings, managers):
    settings = make_settings()
    manager = JobManager(settings, FakeRunner(mode="block"), max_queued=1)
    managers.append(manager)
    with TestClient(create_app(settings, manager)) as client:
        first = upload(client)
        wait_until(lambda: manager.active_count() == 1)
        assert upload(client).status_code == 202  # queued
        full = upload(client)
        assert full.status_code == 503
        assert "queue" in full.json()["detail"]


# ---------------------------------------------------------------------------
# job routes
# ---------------------------------------------------------------------------


def test_client_id_filtering(make_client):
    with make_client(FakeRunner(mode="block")) as (client, _):
        a1 = upload(client, client_id="client-a").json()["id"]
        b1 = upload(client, client_id="client-b").json()["id"]
        a2 = upload(client, client_id="client-a").json()["id"]
        upload(client, client_id=None)

        listed = client.get("/v1/jobs", headers={"X-Client-Id": "client-a"}).json()
        assert [j["id"] for j in listed["jobs"]] == [a2, a1]  # newest first
        assert all(set(j) == JOB_KEYS for j in listed["jobs"])
        assert [j["id"] for j in client.get("/v1/jobs", headers={"X-Client-Id": "client-b"}).json()["jobs"]] == [b1]
        assert client.get("/v1/jobs").json() == {"jobs": []}
        assert client.get("/v1/jobs", headers={"X-Client-Id": "nobody"}).json() == {"jobs": []}


def test_queue_position_and_cancel_queued(make_client):
    runner = FakeRunner(mode="block")
    with make_client(runner, workers=1) as (client, manager):
        first = upload(client).json()["id"]
        wait_until(lambda: client.get(f"/v1/jobs/{first}").json()["status"] == "processing")
        second = upload(client).json()
        third = upload(client).json()
        assert second["status"] == "queued" and second["queue_position"] == 1
        assert third["queue_position"] == 2
        assert second["stage"] == "queued"
        assert client.get("/v1/health").json()["queue_length"] == 2

        cancelled = client.post(f"/v1/jobs/{second['id']}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert cancelled.json()["queue_position"] is None
        assert client.get(f"/v1/jobs/{third['id']}").json()["queue_position"] == 1

        # Cancel the running job: cooperative, ends as cancelled.
        response = client.post(f"/v1/jobs/{first}/cancel")
        assert response.status_code == 200
        assert response.json()["status"] in ("processing", "cancelled")
        assert wait_job(client, first, "cancelled")["stems"] == []

        runner.release.set()
        wait_job(client, third["id"], "completed")
        assert client.post(f"/v1/jobs/{third['id']}/cancel").json()["status"] == "completed"
        assert client.post(f"/v1/jobs/{'0' * 32}/cancel").status_code == 404


def test_downloads_before_completion_conflict(make_client):
    runner = FakeRunner(mode="block")
    with make_client(runner) as (client, _):
        job_id = upload(client).json()["id"]
        wait_until(lambda: client.get(f"/v1/jobs/{job_id}").json()["status"] == "processing")
        for path in ("stems/vocals.wav", "stems/vocals.m4a", "download.zip"):
            response = client.get(f"/v1/jobs/{job_id}/{path}")
            assert response.status_code == 409, path
            assert isinstance(response.json()["detail"], str)
        runner.release.set()
        wait_job(client, job_id, "completed")


def test_failed_job_reports_error(make_client):
    with make_client(FakeRunner(mode="crash")) as (client, _):
        job = wait_job(client, upload(client).json()["id"], "failed")
        assert job["error"] == "Processing failed: RuntimeError"
        assert job["stems"] == [] and job["zip_url"] is None
        assert client.get(f"/v1/jobs/{job['id']}/download.zip").status_code == 409


def test_delete_job(make_client, preview_m4a):
    with make_client(FakeRunner(preview_m4a)) as (client, manager):
        job = wait_job(client, upload(client).json()["id"], "completed")
        job_dir = manager.settings.jobs_dir / job["id"]
        assert client.get(job["zip_url"]).status_code == 200
        response = client.delete(f"/v1/jobs/{job['id']}")
        assert response.status_code == 204 and response.content == b""
        assert not job_dir.exists()
        assert client.get(f"/v1/jobs/{job['id']}").status_code == 404
        assert client.delete(f"/v1/jobs/{job['id']}").status_code == 404
        assert client.get(job["stems"][0]["wav_url"]).status_code == 404
        assert client.get("/v1/jobs", headers={"X-Client-Id": "client-1"}).json() == {"jobs": []}


def test_unknown_and_malformed_job_ids(make_client):
    with make_client() as (client, _):
        for job_id in ("0" * 32, "not-a-job", "A" * 32, "0" * 31):
            response = client.get(f"/v1/jobs/{job_id}")
            assert response.status_code == 404
            assert response.json() == {"detail": "Job not found"}
            assert client.get(f"/v1/jobs/{job_id}/download.zip").status_code == 404
            assert client.get(f"/v1/jobs/{job_id}/stems/vocals.wav").status_code == 404


def test_stem_path_traversal_is_impossible(make_client, preview_m4a):
    with make_client(FakeRunner(preview_m4a, stems=("vocals", "other"))) as (client, manager):
        job = wait_job(client, upload(client).json()["id"], "completed")
        job_id = job["id"]
        stems_dir = manager.settings.jobs_dir / job_id / "stems"
        (stems_dir / "kick.wav").write_bytes(b"RIFF not listed in the job")  # on disk, not in job
        (manager.settings.jobs_dir / job_id / "secret.wav").write_bytes(b"secret")

        attempts = [
            "kick", "..", "../input", "..%2Finput", "..%2F..%2Fjobs", "%2e%2e", "%2e%2e%2finput",
            "vocals%00", "VOCALS", "vocals.wav", "../secret", "..%5Csecret", "%252e%252e%252fsecret",
            "/etc/passwd", "....//secret",
        ]
        for attempt in attempts:
            for ext in ("wav", "m4a"):
                response = client.get(f"/v1/jobs/{job_id}/stems/{attempt}.{ext}")
                assert response.status_code == 404, (attempt, ext, response.status_code)
                assert b"secret" not in response.content
        # Sanity: the legitimate ones still work.
        assert client.get(f"/v1/jobs/{job_id}/stems/vocals.wav").status_code == 200
        assert client.get(f"/v1/jobs/{job_id}/stems/other.m4a").status_code == 200


# ---------------------------------------------------------------------------
# helpers, config, schemas, catalog, probe
# ---------------------------------------------------------------------------


def test_content_disposition():
    value = content_disposition('Bad "name" \\ é.zip')
    assert value.startswith('attachment; filename="Bad _name_ _ _.zip"; ')
    assert value.endswith("filename*=UTF-8''Bad%20%22name%22%20%5C%20%C3%A9.zip")


def test_parse_options_direct():
    assert parse_options(None) == JobOptions()
    assert parse_options('{"denoise": true, "denoise_strength": "strong"}').denoise_strength == "strong"


def test_load_settings_defaults_and_env(tmp_path):
    settings = load_settings({"STEM_MASTER_DATA_DIR": str(tmp_path)})
    assert settings.data_dir == tmp_path
    assert settings.model_dir == tmp_path / "models"
    assert settings.jobs_dir == tmp_path / "jobs"
    assert (settings.max_upload_mb, settings.max_duration_seconds) == (200, 900)
    assert (settings.job_ttl_hours, settings.workers, settings.engine) == (24.0, 1, "audio-separator")
    assert (settings.overlap_max, settings.overlap_fast, settings.model_cache_size) == (4, 2, None)  # None = auto
    assert (settings.host, settings.port) == ("0.0.0.0", 7860)
    assert settings.api_key is None and not settings.auth_required
    assert settings.overlap_for("fast") == 2 and settings.overlap_for("max") == 4
    assert not tmp_path.joinpath("jobs").exists()  # nothing created eagerly

    custom = load_settings({
        "STEM_MASTER_API_KEY": " k ", "STEM_MASTER_DATA_DIR": str(tmp_path / "d"),
        "STEM_MASTER_MODEL_DIR": str(tmp_path / "m"), "STEM_MASTER_MAX_UPLOAD_MB": "50",
        "STEM_MASTER_MAX_DURATION_S": "600", "STEM_MASTER_JOB_TTL_HOURS": "0.5",
        "STEM_MASTER_WORKERS": "2", "STEM_MASTER_ENGINE": "fake", "STEM_MASTER_OVERLAP_MAX": "8",
        "STEM_MASTER_OVERLAP_FAST": "1", "STEM_MASTER_MODEL_CACHE": "0", "PORT": "8080",
    })
    assert custom.api_key == "k" and custom.auth_required
    assert custom.model_dir == tmp_path / "m"
    assert custom.max_upload_bytes == 50 * 1024 * 1024
    assert custom.job_ttl_seconds == 1800
    assert (custom.workers, custom.engine, custom.port) == (2, "fake", 8080)
    assert (custom.overlap_max, custom.overlap_fast, custom.model_cache_size) == (8, 1, 0)
    assert load_settings({"STEM_MASTER_MODEL_CACHE": "auto"}).model_cache_size is None
    assert load_settings({"STEM_MASTER_MODEL_CACHE": "AUTO"}).model_cache_size is None
    assert load_settings({"STEM_MASTER_MODEL_CACHE": "7"}).model_cache_size == 7
    assert load_settings({"STEM_MASTER_API_KEY": "  "}).api_key is None
    assert load_settings({"STEM_MASTER_JOB_TTL_HOURS": "0"}).job_ttl_seconds is None

    data_default = load_settings({}).data_dir
    assert data_default in (Path("/data"), Path("/tmp/stem-master"))

    for env in ({"STEM_MASTER_WORKERS": "0"}, {"STEM_MASTER_WORKERS": "two"},
                {"STEM_MASTER_ENGINE": "magic"}, {"PORT": "70000"},
                {"STEM_MASTER_JOB_TTL_HOURS": "nan"}, {"STEM_MASTER_MODEL_CACHE": "-1"},
                {"STEM_MASTER_MODEL_CACHE": "lots"}):
        with pytest.raises(ConfigError):
            load_settings(env)


def test_schema_serialisation():
    from datetime import datetime, timezone

    stamp = datetime(2026, 11, 20, 10, 0, 0, 123456, tzinfo=timezone.utc)
    job = Job(id="a" * 32, status="queued", created_at=stamp, updated_at=stamp, filename="x.mp3",
              options=JobOptions(), progress=0.0, stage="queued", stage_label="Waiting in queue")
    data = json.loads(job.model_dump_json())
    assert set(data) == JOB_KEYS
    assert data["created_at"] == "2026-11-20T10:00:00Z"
    precise = json.loads(job.model_dump_json(context={"precise_times": True}))
    assert precise["created_at"] == "2026-11-20T10:00:00.123456+00:00"
    assert Job.model_validate(precise).created_at == stamp
    assert JobOptions().model_dump() == SPEC_DEFAULT_OPTIONS

    with pytest.raises(Exception):
        JobOptions.model_validate({"bogus": 1})

    analysis = Analysis(duration_seconds=1.0, sample_rate=48000, channels=2, codec="mp3", bpm=float("nan"),
                        bpm_confidence=1.7, key="C major", camelot="8B", key_confidence=-0.2,
                        loudness_lufs=float("-inf"), peak_dbfs=None, artifact_level=0.5,
                        artifact_label="moderate", spectral_cutoff_hz=0.0)
    assert (analysis.bpm, analysis.bpm_confidence, analysis.key_confidence) == (0.0, 1.0, 0.0)
    assert (analysis.loudness_lufs, analysis.peak_dbfs, analysis.spectral_cutoff_hz) == (-120.0, -120.0, None)
    json.loads(analysis.model_dump_json())  # finite, serialisable

    import numpy as np

    stem = Stem(id="kick", name="Kick", group="drums", role="primary", color="#3AD6C5", wav_url="u",
                preview_url="p", wav_bytes=1, preview_bytes=1, peak_dbfs=np.float32(-3.0),
                rms_dbfs=float("-inf"), active_ratio=np.float64(1.2),
                waveform=np.linspace(-0.5, 1.5, WAVEFORM_POINTS))
    assert stem.rms_dbfs == -120.0 and stem.active_ratio == 1.0
    assert min(stem.waveform) == 0.0 and max(stem.waveform) == 1.0
    with pytest.raises(Exception):
        Stem.model_validate({**stem.model_dump(), "waveform": [0.0] * 10})
    with pytest.raises(Exception):
        Stem.model_validate({**stem.model_dump(), "id": "cowbell"})


def test_catalog_matches_spec():
    assert [s.id for s in STEM_CATALOG] == [
        "vocals", "lead_vocals", "backing_vocals", "vocals_dry", "vocal_reverb", "vocal_ambience",
        "drums", "kick", "snare", "toms", "hihat", "ride", "crash", "drum_room",
        "bass", "guitar", "piano", "other", "removed_bleed", "removed_noise",
    ]
    assert GROUPS == ("vocals", "drums", "bass", "instruments", "removed")
    colors = {s.id: s.color for s in STEM_CATALOG}
    assert colors == {
        "vocals": "#FF7A1A", "lead_vocals": "#FF7A1A", "backing_vocals": "#FFB066",
        "vocals_dry": "#FF9A4D", "vocal_reverb": "#C46A2B", "vocal_ambience": "#8F5A33",
        "drums": "#3AD6C5", "kick": "#3AD6C5", "snare": "#5BE3D5", "toms": "#2BA89B",
        "hihat": "#9CF0E6", "ride": "#77C9F0", "crash": "#4FA8E0", "drum_room": "#2D7F78",
        "bass": "#7C5CFF", "guitar": "#F5D547", "piano": "#E86AF0", "other": "#A0A7B4",
        "removed_bleed": "#5A5F6B", "removed_noise": "#454952",
    }
    assert spec_for("piano").name == "Piano & Keys"
    assert spec_for("other").name == "Synths & Other"
    assert spec_for("drum_room").name == "Drum Room & Perc"
    assert spec_for("bass").group == "bass" and spec_for("guitar").group == "instruments"
    with pytest.raises(KeyError):
        spec_for("cowbell")


def test_probe_audio(tmp_path, preview_m4a):
    wav = tmp_path / "a.wav"
    wav.write_bytes(make_wav_bytes(1.0, sample_rate=48000, channels=1))
    info = probe_audio(wav)
    assert info.sample_rate == 48000 and info.channels == 1 and info.codec == "pcm_f32le"
    assert info.duration_seconds == pytest.approx(1.0, abs=0.01)

    m4a = probe_audio(preview_m4a)
    assert m4a.codec == "aac" and m4a.channels == 2
    assert m4a.duration_seconds == pytest.approx(0.5, abs=0.1)

    for content in (b"", b"hello world" * 50):
        bad = tmp_path / "bad.mp3"
        bad.write_bytes(content)
        with pytest.raises(ProbeError):
            probe_audio(bad)
    with pytest.raises(ProbeError):
        probe_audio(tmp_path / "missing.wav")
