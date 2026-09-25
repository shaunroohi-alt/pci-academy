from __future__ import annotations

from ..config import Settings
from .base import Backend, BackendError, RemoteStatus
from .comfyui import ComfyUIBackend
from .mock import MockBackend


def make_backend(settings: Settings) -> Backend:
    if settings.backend == "comfyui":
        return ComfyUIBackend(settings.comfyui_url)
    if settings.backend == "mock":
        return MockBackend()
    raise ValueError(f"Unknown PCI_BACKEND '{settings.backend}' (use 'comfyui' or 'mock')")


__all__ = ["Backend", "BackendError", "RemoteStatus", "make_backend"]
