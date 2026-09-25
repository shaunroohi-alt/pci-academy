"""Stand-in backend for wiring things up without models or a GPU.

Pretends every model is installed, "renders" for a couple of seconds and, if
ffmpeg is available, writes a test-pattern video of the planned size and
length so downstream tooling has a real file to handle.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import time
import uuid
from pathlib import Path

from ..engines.base import ModelFile, ModelInventory, RenderPlan
from .base import Backend, BackendError, RemoteStatus


class MockBackend(Backend):
    name = "mock"

    def __init__(self, seconds: float | None = None):
        self.seconds = seconds if seconds is not None else float(os.environ.get("PCI_MOCK_SECONDS", "2"))
        self._jobs: dict[str, dict] = {}

    async def health(self) -> dict:
        return {"type": self.name, "reachable": True, "note": "Mock backend: no real rendering.",
                "ffmpeg": shutil.which("ffmpeg") is not None}

    async def node_types(self) -> set[str]:
        return set()

    async def inventory(self, files: list[ModelFile]) -> ModelInventory:
        inv: ModelInventory = {}
        for f in files:
            inv.setdefault((f.loader, f.input), []).append(f.patterns[0].replace("*", ""))
        return inv

    async def submit(self, workflow: dict, plan: RenderPlan) -> str:
        rid = uuid.uuid4().hex
        self._jobs[rid] = {"plan": plan, "at": time.monotonic(), "cancelled": False}
        return rid

    async def status(self, remote_id: str) -> RemoteStatus:
        job = self._jobs.get(remote_id)
        if job is None:
            return RemoteStatus("unknown")
        if job["cancelled"]:
            return RemoteStatus("failed", error="Interrupted")
        elapsed = time.monotonic() - job["at"]
        if elapsed < self.seconds / 4:
            return RemoteStatus("queued", queue_position=1)
        if elapsed < self.seconds:
            return RemoteStatus("running")
        return RemoteStatus("completed", outputs=[{"filename": "mock.mp4", "subfolder": "", "type": "output"}])

    async def fetch(self, remote_id: str, output: dict, dest: Path) -> None:
        plan: RenderPlan = self._jobs[remote_id]["plan"]
        if not shutil.which("ffmpeg"):
            raise BackendError("Mock backend needs ffmpeg to write a placeholder video (brew install ffmpeg).")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
            "-i", f"testsrc2=size={plan.width}x{plan.height}:rate={plan.fps}",
            "-frames:v", str(plan.frames), "-pix_fmt", "yuv420p", "-c:v", "libx264", str(dest))
        if await proc.wait() != 0:
            raise BackendError("ffmpeg failed to write the placeholder video")

    async def cancel(self, remote_id: str) -> None:
        if remote_id in self._jobs:
            self._jobs[remote_id]["cancelled"] = True
