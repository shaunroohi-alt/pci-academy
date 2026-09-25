"""Deterministic seeds, fingerprints and output paths.

The same request (after defaults are filled in) always maps to the same
seed, the same fingerprint and the same file, so re-sending a request returns
the existing video instead of rendering it again.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "untitled"


def _digest(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def derive_seed(*parts: str) -> int:
    """A stable 32-bit seed for requests that did not pass one."""
    return int(_digest({"seed_parts": list(parts)})[:8], 16)


def fingerprint(payload: dict) -> str:
    return _digest(payload)[:10]


def output_stem(output_name: str | None, prompt: str, engine: str, seed: int, fp: str) -> str:
    base = slugify(output_name) if output_name else slugify(" ".join(prompt.split()[:8]), 32)
    return f"{base}__{engine}__s{seed}__{fp}"


def output_path(root: Path, concept: str, stem: str, ext: str = ".mp4") -> Path:
    return root / slugify(concept) / f"{stem}{ext}"
