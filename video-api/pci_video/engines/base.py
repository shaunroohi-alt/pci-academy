"""Engine abstraction.

An engine knows three things: which model files it needs (and how to find
them among whatever ComfyUI has installed), how to turn a duration and
aspect ratio into frames and pixels the model accepts, and how to build a
ComfyUI API-format graph. Backends never look inside the graph.
"""

from __future__ import annotations

import fnmatch
import math
from dataclasses import dataclass, field

from ..prompts import RenderedPrompt

ASPECT_RATIOS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1), "4:3": (4, 3), "3:4": (3, 4)}

# Approximate pixel budgets per frame. "draft" is sized to be comfortable on a
# 16 GB Apple Silicon Mac.
QUALITY_PIXELS = {"draft": 768 * 448, "standard": 1024 * 576}


class EngineError(Exception):
    """A request an engine cannot serve (missing model, bad parameters)."""


@dataclass(frozen=True)
class ModelFile:
    role: str  # e.g. "checkpoint", "text_encoder"
    loader: str  # ComfyUI node class that lists these files
    input: str  # that node's input name
    patterns: tuple[str, ...]  # fnmatch patterns, lower-case, in preference order
    folder: str  # ComfyUI models/ sub-folder, for error messages
    hint: str  # where to get it

    def resolve(self, available: list[str], override: str | None = None) -> str | None:
        if override:
            return override if override in available else None
        lowered = {name.lower(): name for name in available}
        # fp8 weights last: Metal (MPS) cannot compute in float8.
        ordered = sorted(lowered.items(), key=lambda kv: ("fp8" in kv[0], kv[0]))
        for pattern in self.patterns:
            for low, original in ordered:
                # Match against the basename so files in sub-folders still count.
                if fnmatch.fnmatch(low.rsplit("/", 1)[-1], pattern):
                    return original
        return None


@dataclass(frozen=True)
class Variant:
    key: str
    description: str
    files: tuple[ModelFile, ...]
    steps: int
    cfg: float
    min_memory_gb: float = 0.0


@dataclass
class RenderPlan:
    engine: str
    variant: str
    width: int
    height: int
    frames: int
    fps: int
    duration: float  # actual clip length after frame rounding
    steps: int
    cfg: float
    seed: int
    models: dict[str, str] = field(default_factory=dict)


# (loader node, input) -> filenames ComfyUI offers for it
ModelInventory = dict[tuple[str, str], list[str]]


class Engine:
    key: str = ""
    label: str = ""
    status: str = "ready"  # "ready" | "experimental"
    description: str = ""
    fps: int = 24
    frame_multiple: int = 8  # frames must equal k * frame_multiple + 1
    dim_multiple: int = 32
    min_duration: float = 1.0
    max_duration: float = 10.0
    variants: tuple[Variant, ...] = ()
    style_hint: str | None = None

    # -- geometry -----------------------------------------------------------
    def dims(self, aspect_ratio: str, quality: str) -> tuple[int, int]:
        aw, ah = ASPECT_RATIOS[aspect_ratio]
        pixels = QUALITY_PIXELS[quality]
        height = math.sqrt(pixels * ah / aw)
        width = height * aw / ah
        m = self.dim_multiple
        return max(m, round(width / m) * m), max(m, round(height / m) * m)

    def frame_count(self, duration: float, fps: int) -> int:
        k = max(1, round(duration * fps / self.frame_multiple))
        return k * self.frame_multiple + 1

    # -- models -------------------------------------------------------------
    def variant(self, key: str) -> Variant:
        for v in self.variants:
            if v.key == key:
                return v
        raise EngineError(f"Unknown model '{key}' for engine '{self.key}'. "
                          f"Options: auto, {', '.join(v.key for v in self.variants)}")

    def overrides(self, settings) -> dict[str, str | None]:
        """Per-role filename overrides from settings. Engines opt in."""
        return {}

    def resolve_models(self, variant: Variant, inventory: ModelInventory,
                       overrides: dict[str, str | None]) -> tuple[dict[str, str], list[ModelFile]]:
        found, missing = {}, []
        for f in variant.files:
            name = f.resolve(inventory.get((f.loader, f.input), []), overrides.get(f.role))
            if name:
                found[f.role] = name
            else:
                missing.append(f)
        return found, missing

    def pick_variant(self, requested: str, inventory: ModelInventory, overrides: dict[str, str | None],
                     memory_gb: float | None) -> tuple[Variant, dict[str, str]]:
        candidates = self.variants if requested == "auto" else (self.variant(requested),)
        first_missing: tuple[Variant, list[ModelFile]] | None = None
        for v in candidates:
            if requested == "auto" and memory_gb is not None and memory_gb < v.min_memory_gb:
                continue
            found, missing = self.resolve_models(v, inventory, overrides)
            if not missing:
                return v, found
            first_missing = first_missing or (v, missing)
        if first_missing is None:
            raise EngineError(f"No '{self.key}' model fits in {memory_gb:g} GB of memory.")
        v, missing = first_missing
        lines = "; ".join(f"{m.role}: put a file matching {m.patterns[0]!r} in ComfyUI/models/{m.folder}/ ({m.hint})"
                          for m in missing)
        raise EngineError(f"Model files for {self.key}/{v.key} not found in ComfyUI. {lines}")

    def availability(self, inventory: ModelInventory, overrides: dict[str, str | None]) -> list[dict]:
        out = []
        for v in self.variants:
            found, missing = self.resolve_models(v, inventory, overrides)
            out.append({
                "model": v.key, "description": v.description, "min_memory_gb": v.min_memory_gb,
                "installed": not missing, "files": found,
                "missing": [{"role": m.role, "folder": m.folder, "pattern": m.patterns[0], "hint": m.hint}
                            for m in missing],
            })
        return out

    # -- graph --------------------------------------------------------------
    def build_workflow(self, plan: RenderPlan, prompt: RenderedPrompt, filename_prefix: str,
                       nodes: set[str]) -> dict:
        raise NotImplementedError

    def describe(self) -> dict:
        return {
            "engine": self.key, "label": self.label, "status": self.status,
            "description": self.description, "fps": self.fps,
            "duration": {"min": self.min_duration, "max": self.max_duration},
            "models": [v.key for v in self.variants],
        }


def add_video_output(graph: dict, images: list, fps: int, prefix: str, nodes: set[str]) -> None:
    """Append whichever video-saving nodes this ComfyUI build has.

    Core ComfyUI (2025+) ships CreateVideo/SaveVideo. Older installs often have
    VideoHelperSuite instead. Animated WebP is the always-available fallback.
    """
    if {"CreateVideo", "SaveVideo"} <= nodes or not nodes:
        graph["out_create"] = {"class_type": "CreateVideo", "inputs": {"images": images, "fps": float(fps)}}
        graph["out_save"] = {"class_type": "SaveVideo",
                             "inputs": {"video": ["out_create", 0], "filename_prefix": prefix,
                                        "format": "mp4", "codec": "h264"}}
    elif "VHS_VideoCombine" in nodes:
        graph["out_save"] = {"class_type": "VHS_VideoCombine",
                             "inputs": {"images": images, "frame_rate": float(fps), "loop_count": 0,
                                        "filename_prefix": prefix, "format": "video/h264-mp4",
                                        "pix_fmt": "yuv420p", "crf": 19, "save_metadata": True,
                                        "pingpong": False, "save_output": True}}
    else:
        graph["out_save"] = {"class_type": "SaveAnimatedWEBP",
                             "inputs": {"images": images, "filename_prefix": prefix, "fps": float(fps),
                                        "lossless": False, "quality": 90, "method": "default"}}
