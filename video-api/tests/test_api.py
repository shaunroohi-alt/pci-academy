"""API tests against the mock backend. Run: pytest -q"""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pci_video.backends.mock import MockBackend
from pci_video.config import PROJECT_ROOT, Settings
from pci_video.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    async def fake_fetch(self, remote_id, output, dest: Path):
        dest.write_bytes(b"\x00\x00\x00\x18ftypmp42fake")

    monkeypatch.setattr(MockBackend, "fetch", fake_fetch)
    monkeypatch.setenv("PCI_MOCK_SECONDS", "0.2")
    settings = Settings(backend="mock", output_dir=tmp_path, workflow_dir=PROJECT_ROOT / "workflows",
                        poll_interval=0.05)
    with TestClient(create_app(settings)) as c:
        yield c


def wait(client, job_id, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/pci/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


BODY = {"engine": "ltx", "concept": "arrival", "prompt": "A person opens the curtains at dawn",
        "duration": 4, "aspect_ratio": "16:9", "output_name": "Arrival Intro"}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["backend"]["type"] == "mock"
    assert {"ltx", "wan", "hunyuan", "smoke"} <= set(body["engines"])
    assert "apple_silicon" in body["host"]


def test_engines_and_concepts(client):
    engines = {e["engine"]: e for e in client.get("/pci/engines").json()["engines"]}
    assert engines["ltx"]["models"][0]["model"] == "2b-distilled"
    assert engines["ltx"]["models"][0]["installed"]
    keys = [c["key"] for c in client.get("/pci/concepts").json()["concepts"]]
    assert keys[:7] == ["arrival", "attention", "expression", "judgement", "conversation", "rest", "integration"]


def test_video_job_lifecycle_and_dedupe(client, tmp_path):
    r = client.post("/pci/video", json=BODY)
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["plan"]["frames"] % 8 == 1 and job["plan"]["width"] % 32 == 0
    assert "arrival-intro__ltx__s" in job["output_path"]
    assert Path(job["output_path"]).parent == tmp_path / "arrival"

    done = wait(client, job["id"])
    assert done["status"] == "completed", done
    assert client.get(done["output_url"]).status_code == 200
    assert Path(done["output_path"]).with_suffix(".json").is_file()  # sidecar with workflow

    again = client.post("/pci/video", json=BODY)
    assert again.status_code == 200
    assert again.json()["id"] == job["id"]  # same request, same job, no re-render


def test_deterministic_seed_and_name(client):
    a = client.post("/pci/video", json={**BODY, "dry_run": True}).json()
    b = client.post("/pci/video", json={**BODY, "dry_run": True}).json()
    c = client.post("/pci/video", json={**BODY, "seed": 7, "dry_run": True}).json()
    assert a["output_path"] == b["output_path"] and a["plan"]["seed"] == b["plan"]["seed"]
    assert c["plan"]["seed"] == 7 and c["output_path"] != a["output_path"]
    assert a["workflow"]["noise"]["inputs"]["noise_seed"] == a["plan"]["seed"]


def test_templating(client):
    templated = client.post("/pci/video", json={**BODY, "dry_run": True}).json()
    raw = client.post("/pci/video", json={**BODY, "raw_prompt": True, "dry_run": True}).json()
    assert "amber" in templated["prompt"] and templated["prompt"].startswith("A person opens the curtains")
    assert raw["prompt"] == "A person opens the curtains at dawn"


def test_custom_workflow_engine(client):
    r = client.post("/pci/video", json={"engine": "smoke", "prompt": "amber", "duration": 1, "dry_run": True}).json()
    wf = r["workflow"]
    assert wf["prompt"]["inputs"]["value"].startswith("amber")
    assert wf["frames"]["inputs"]["batch_size"] == r["plan"]["frames"]  # typed substitution
    assert isinstance(wf["frames"]["inputs"]["width"], int)
    assert "_pci" not in wf


@pytest.mark.parametrize("patch,msg", [
    ({"engine": "sora"}, "Unknown engine"),
    ({"concept": "nope"}, "Unknown concept"),
    ({"duration": 12}, "supports"),
    ({"model": "99b"}, "Unknown model"),
])
def test_validation(client, patch, msg):
    r = client.post("/pci/video", json={**BODY, **patch})
    assert r.status_code == 422 and msg in r.json()["detail"]


def test_cancel(client, monkeypatch):
    monkeypatch.setenv("PCI_MOCK_SECONDS", "0.2")
    job = client.post("/pci/video", json={**BODY, "output_name": "to-cancel"}).json()
    r = client.post(f"/pci/jobs/{job['id']}/cancel")
    assert r.json()["status"] == "cancelled"
    assert client.get(f"/pci/jobs/{job['id']}/video").status_code == 404
