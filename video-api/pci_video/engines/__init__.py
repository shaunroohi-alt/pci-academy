"""Engine registry. Add an engine by subclassing Engine and listing it here,
or by dropping an API-format workflow into ``workflows/``."""

from __future__ import annotations

import logging
from pathlib import Path

from .base import ASPECT_RATIOS, Engine, EngineError, ModelInventory, RenderPlan
from .hunyuan import HunyuanEngine
from .ltx import LTXEngine
from .template import TemplateEngine
from .wan import WanEngine

log = logging.getLogger(__name__)

BUILTIN: tuple[type[Engine], ...] = (LTXEngine, WanEngine, HunyuanEngine)
DEFAULT_ENGINE = "ltx"


def load_engines(workflow_dir: Path) -> dict[str, Engine]:
    engines: dict[str, Engine] = {cls.key: cls() for cls in BUILTIN}
    if workflow_dir.is_dir():
        for path in sorted(workflow_dir.glob("*.json")):
            key = path.stem.lower()
            try:
                engines[key] = TemplateEngine(key, path, base=engines.get(key))
                log.info("Loaded custom workflow %s as engine '%s'", path.name, key)
            except (EngineError, ValueError) as exc:
                log.warning("Skipping %s: %s", path, exc)
    return engines


__all__ = ["ASPECT_RATIOS", "DEFAULT_ENGINE", "Engine", "EngineError", "ModelInventory", "RenderPlan",
           "load_engines"]
