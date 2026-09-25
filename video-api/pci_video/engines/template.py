"""Bridge for workflows you already have.

Export a working graph from ComfyUI with "Export (API)" and drop it in
``workflows/<engine>.json``. Replace the literal values you want the API to
control with placeholders:

    {{PROMPT}} {{NEGATIVE_PROMPT}} {{SEED}} {{WIDTH}} {{HEIGHT}} {{FRAMES}}
    {{FPS}} {{STEPS}} {{CFG}} {{DURATION}} {{FILENAME_PREFIX}}

A field that is exactly one placeholder gets the typed value (an int for
{{SEED}}, a float for {{CFG}}); placeholders inside longer strings are
substituted as text. An optional top-level ``"_pci"`` object sets engine
metadata (label, fps, frame_multiple, dim_multiple, max_duration, steps, cfg).

A file named after a built-in engine (``ltx.json``) replaces that engine's
graph but keeps its frame and resolution rules. Any other name becomes a new
engine, e.g. ``workflows/ltx2.json`` -> ``"engine": "ltx2"``.
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path

from ..prompts import RenderedPrompt
from .base import Engine, EngineError, RenderPlan, Variant

PLACEHOLDER = re.compile(r"\{\{([A-Z_]+)\}\}")
META_KEYS = ("label", "description", "status", "fps", "frame_multiple", "dim_multiple",
             "min_duration", "max_duration")


class TemplateEngine(Engine):
    def __init__(self, key: str, path: Path, base: Engine | None = None):
        data = json.loads(path.read_text())
        meta = data.pop("_pci", {}) if isinstance(data, dict) else {}
        if not isinstance(data, dict) or not all(isinstance(v, dict) and "class_type" in v for v in data.values()):
            raise EngineError(f"{path} is not a ComfyUI API-format workflow (use 'Export (API)' in ComfyUI).")
        if "{{PROMPT}}" not in path.read_text():
            raise EngineError(f"{path} has no {{{{PROMPT}}}} placeholder.")
        self.graph = data
        self.path = path
        self.key = key
        if base is not None:
            for attr in ("label", "fps", "frame_multiple", "dim_multiple", "min_duration", "max_duration",
                         "style_hint"):
                setattr(self, attr, getattr(base, attr))
            self.label = f"{base.label} (custom workflow)"
        else:
            self.label = key
        self.status = "custom"
        self.description = f"User workflow from {path.name}"
        for k in META_KEYS:
            if k in meta:
                setattr(self, k, meta[k])
        self.variants = (Variant("workflow", f"Models as set in {path.name}", (),
                                 steps=int(meta.get("steps", 30)), cfg=float(meta.get("cfg", 3.0))),)

    def pick_variant(self, requested, inventory, overrides, memory_gb):
        return self.variants[0], {}

    def availability(self, inventory, overrides):
        return [{"model": "workflow", "description": self.variants[0].description, "installed": True,
                 "files": {}, "missing": [], "min_memory_gb": 0}]

    def build_workflow(self, plan: RenderPlan, prompt: RenderedPrompt, filename_prefix: str,
                       nodes: set[str]) -> dict:
        values = {
            "PROMPT": prompt.positive, "NEGATIVE_PROMPT": prompt.negative, "SEED": plan.seed,
            "WIDTH": plan.width, "HEIGHT": plan.height, "FRAMES": plan.frames, "FPS": plan.fps,
            "STEPS": plan.steps, "CFG": plan.cfg, "DURATION": plan.duration, "FILENAME_PREFIX": filename_prefix,
        }

        def fill(value):
            if isinstance(value, str):
                whole = PLACEHOLDER.fullmatch(value)
                if whole and whole.group(1) in values:
                    return values[whole.group(1)]
                return PLACEHOLDER.sub(lambda m: str(values.get(m.group(1), m.group(0))), value)
            if isinstance(value, list):
                return [fill(v) for v in value]
            if isinstance(value, dict):
                return {k: fill(v) for k, v in value.items()}
            return value

        return fill(copy.deepcopy(self.graph))
