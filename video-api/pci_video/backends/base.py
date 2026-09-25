from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path

from ..engines.base import ModelFile, ModelInventory, RenderPlan


class BackendError(Exception):
    """Backend unreachable or rejected the job."""


@dataclass
class RemoteStatus:
    state: str  # "queued" | "running" | "completed" | "failed" | "unknown"
    queue_position: int | None = None
    error: str | None = None
    outputs: list[dict] = field(default_factory=list)  # [{filename, subfolder, type}]


class Backend(ABC):
    name: str

    @abstractmethod
    async def health(self) -> dict: ...

    @abstractmethod
    async def node_types(self) -> set[str]: ...

    @abstractmethod
    async def inventory(self, files: list[ModelFile]) -> ModelInventory: ...

    @abstractmethod
    async def submit(self, workflow: dict, plan: RenderPlan) -> str: ...

    @abstractmethod
    async def status(self, remote_id: str) -> RemoteStatus: ...

    @abstractmethod
    async def fetch(self, remote_id: str, output: dict, dest: Path) -> None: ...

    @abstractmethod
    async def cancel(self, remote_id: str) -> None: ...

    async def close(self) -> None:
        return None
