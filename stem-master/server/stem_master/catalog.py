"""The fixed stem catalogue (SPEC section 3).

The order of :data:`STEM_CATALOG` is the order stems appear in the job
manifest, the mixer and the ZIP. Names are the base names; the pipeline
decides the display name of ``lead_vocals`` when it is dereverbed
("Lead Vocals (Dry)") and puts that in the :class:`~stem_master.schemas.Stem`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple, TypeVar

GROUPS: Tuple[str, ...] = ("vocals", "drums", "bass", "instruments", "removed")
"""Stem groups in display order."""

ROLES: Tuple[str, ...] = ("primary", "bus", "removed")
"""Stem roles: ``primary`` plays in the mixer and sums to the mix, ``bus`` is
a sum of primaries (export only), ``removed`` is what cleanup/denoise took out."""

DRUM_PARTS: Tuple[str, ...] = ("kick", "snare", "toms", "hihat", "ride", "crash")
"""Drum-part stem ids produced by the drum split, in catalogue order."""


@dataclass(frozen=True)
class StemSpec:
    """Static description of one catalogue stem."""

    id: str
    name: str
    group: str
    color: str


STEM_CATALOG: List[StemSpec] = [
    StemSpec("vocals", "Vocals", "vocals", "#FF7A1A"),
    StemSpec("lead_vocals", "Lead Vocals", "vocals", "#FF7A1A"),
    StemSpec("backing_vocals", "Backing Vocals", "vocals", "#FFB066"),
    StemSpec("vocals_dry", "Vocals (Dry)", "vocals", "#FF9A4D"),
    StemSpec("vocal_reverb", "Vocal Reverb", "vocals", "#C46A2B"),
    StemSpec("vocal_ambience", "Vocal Ambience", "vocals", "#8F5A33"),
    StemSpec("drums", "Drums", "drums", "#3AD6C5"),
    StemSpec("kick", "Kick", "drums", "#3AD6C5"),
    StemSpec("snare", "Snare", "drums", "#5BE3D5"),
    StemSpec("toms", "Toms", "drums", "#2BA89B"),
    StemSpec("hihat", "Hi-Hat", "drums", "#9CF0E6"),
    StemSpec("ride", "Ride", "drums", "#77C9F0"),
    StemSpec("crash", "Crash", "drums", "#4FA8E0"),
    StemSpec("drum_room", "Drum Room & Perc", "drums", "#2D7F78"),
    StemSpec("bass", "Bass", "bass", "#7C5CFF"),
    StemSpec("guitar", "Guitar", "instruments", "#F5D547"),
    StemSpec("piano", "Piano & Keys", "instruments", "#E86AF0"),
    StemSpec("other", "Synths & Other", "instruments", "#A0A7B4"),
    StemSpec("removed_bleed", "Removed Bleed", "removed", "#5A5F6B"),
    StemSpec("removed_noise", "Removed Noise", "removed", "#454952"),
]

STEM_IDS: Tuple[str, ...] = tuple(spec.id for spec in STEM_CATALOG)

CATALOG_ORDER: Dict[str, int] = {spec.id: index for index, spec in enumerate(STEM_CATALOG)}
"""Stem id -> position in the catalogue, for sorting."""

GROUP_ORDER: Dict[str, int] = {group: index for index, group in enumerate(GROUPS)}

_BY_ID: Dict[str, StemSpec] = {spec.id: spec for spec in STEM_CATALOG}


def spec_for(stem_id: str) -> StemSpec:
    """Return the catalogue entry for ``stem_id``; ``KeyError`` if unknown."""
    try:
        return _BY_ID[stem_id]
    except KeyError:
        raise KeyError(f"unknown stem id {stem_id!r}") from None


def is_known_stem(stem_id: str) -> bool:
    return stem_id in _BY_ID


T = TypeVar("T")


def sort_by_catalog(items: Iterable[T], key=lambda item: item.id) -> List[T]:  # type: ignore[no-untyped-def]
    """Sort objects with a stem ``id`` (or ``key(item)``) into catalogue order.

    Unknown ids sort last, preserving their relative order.
    """
    fallback = len(STEM_CATALOG)
    return sorted(items, key=lambda item: CATALOG_ORDER.get(key(item), fallback))


def _check_catalog() -> None:
    """Guard the static table against editing mistakes (runs at import)."""
    if len(_BY_ID) != len(STEM_CATALOG):
        raise RuntimeError("duplicate stem id in STEM_CATALOG")
    groups = [GROUP_ORDER.get(spec.group, -1) for spec in STEM_CATALOG]
    if -1 in groups or groups != sorted(groups):
        raise RuntimeError("STEM_CATALOG must be grouped in GROUPS order")


_check_catalog()
