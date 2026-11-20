#!/usr/bin/env python3
"""Render the Stem Master app icon (1024x1024 PNG, RGB, no alpha channel).

The mark: a single waveform on the left reaches a split node and fans out into four
coloured stem lanes (vocals orange, drums teal, bass violet, instruments yellow), each
carrying its own short waveform. Graphite background with a soft signal-orange glow.
No text, so it stays legible down to Settings/Spotlight sizes.

Drawn at 4x and downsampled with Lanczos for clean anti-aliasing. iOS applies the
rounded-corner mask itself, so the square is filled edge to edge.

Usage:
    python3 make_icon.py [--out PATH] [--preview-dir DIR]
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import List, Sequence, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
SCALE = 4
S = SIZE * SCALE

GRAPHITE = (0x0B, 0x0C, 0x0F)
GRAPHITE_TOP = (0x17, 0x19, 0x20)
INK = (0xF4, 0xF4, 0xF5)
ORANGE = (0xFF, 0x7A, 0x1A)
TEAL = (0x3A, 0xD6, 0xC5)
VIOLET = (0x7C, 0x5C, 0xFF)
YELLOW = (0xF5, 0xD5, 0x47)

Color = Tuple[int, int, int]
Point = Tuple[float, float]

DEFAULT_OUT = (
    Path(__file__).resolve().parent.parent
    / "StemMaster/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
)


def px(fraction: float) -> float:
    """Fraction of the canvas edge -> supersampled pixels."""
    return fraction * S


def background() -> Image.Image:
    """Vertical graphite gradient with a soft orange glow behind the split node."""
    top = Image.new("RGB", (1, 2))
    top.putpixel((0, 0), GRAPHITE_TOP)
    top.putpixel((0, 1), GRAPHITE)
    image = top.resize((S, S), Image.BILINEAR)

    glow = Image.new("L", (S, S), 0)
    draw = ImageDraw.Draw(glow)
    cx, cy, r = px(0.47), px(0.5), px(0.30)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(px(0.11)))
    orange = Image.new("RGB", (S, S), ORANGE)
    return Image.composite(orange, image, glow)


def rounded_bar(draw: ImageDraw.ImageDraw, x_center: float, y_center: float, width: float, height: float, color: Color) -> None:
    """A vertical bar with fully rounded ends (never shorter than it is wide)."""
    height = max(height, width)
    left, right = x_center - width / 2, x_center + width / 2
    top, bottom = y_center - height / 2, y_center + height / 2
    draw.rounded_rectangle((left, top, right, bottom), radius=width / 2, fill=color)


def bezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: int = 200) -> List[Point]:
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
        y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        points.append((x, y))
    return points


def stroke(draw: ImageDraw.ImageDraw, points: Sequence[Point], width: float, color: Color) -> None:
    """Smooth thick stroke with round caps: stamps a round brush every ~1.5 px along the path
    (Pillow's wide polylines leave jagged seams on tight curves)."""
    r = width / 2
    spacing = 1.5
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        count = max(1, int(length / spacing))
        for i in range(count + 1):
            t = i / count
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def draw_mark(image: Image.Image) -> None:
    draw = ImageDraw.Draw(image)
    mid = px(0.5)

    # Source waveform: bold ink bars, an envelope that swells toward the split.
    source_levels = [0.20, 0.46, 0.30, 0.78, 1.00, 0.62, 0.88, 0.40]
    x_start, x_end = px(0.115), px(0.395)
    bar_w = px(0.036)
    max_h = px(0.40)
    step = (x_end - x_start) / (len(source_levels) - 1)
    for index, level in enumerate(source_levels):
        rounded_bar(draw, x_start + index * step, mid, bar_w, level * max_h, INK)

    # Fan-out from the split node to four lanes.
    node = (px(0.465), mid)
    lane_ys = [px(0.255), px(0.418), px(0.582), px(0.745)]
    lane_colors = [ORANGE, TEAL, VIOLET, YELLOW]
    lane_x = px(0.625)
    fan_w = px(0.030)
    stroke(draw, [(x_end + bar_w * 0.2, mid), node], fan_w, INK)
    for y, color in zip(lane_ys, lane_colors):
        curve = bezier(node, (px(0.545), mid), (px(0.545), y), (lane_x, y))
        stroke(draw, curve, fan_w, color)

    # Split node: ink core inside an orange ring.
    r_outer, r_inner = px(0.042), px(0.022)
    draw.ellipse((node[0] - r_outer, node[1] - r_outer, node[0] + r_outer, node[1] + r_outer), fill=ORANGE)
    draw.ellipse((node[0] - r_inner, node[1] - r_inner, node[0] + r_inner, node[1] + r_inner), fill=INK)

    # Each lane carries its own short waveform.
    lane_levels = [
        [0.55, 1.00, 0.70, 0.90, 0.45],  # vocals: phrase-like
        [1.00, 0.35, 0.85, 0.35, 1.00],  # drums: hits
        [0.80, 0.95, 0.90, 0.75, 0.85],  # bass: sustained
        [0.45, 0.75, 1.00, 0.60, 0.80],  # instruments
    ]
    lane_bar_w = px(0.030)
    lane_max_h = px(0.118)
    bx_start, bx_end = px(0.680), px(0.880)
    lane_step = (bx_end - bx_start) / 4
    for y, color, levels in zip(lane_ys, lane_colors, lane_levels):
        for index, level in enumerate(levels):
            rounded_bar(draw, bx_start + index * lane_step, y, lane_bar_w, level * lane_max_h, color)


def render() -> Image.Image:
    image = background()
    draw_mark(image)
    icon = image.resize((SIZE, SIZE), Image.LANCZOS)
    return icon.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output PNG path")
    parser.add_argument("--preview-dir", type=Path, default=None, help="also write small-size previews here")
    args = parser.parse_args()

    icon = render()
    assert icon.mode == "RGB" and icon.size == (SIZE, SIZE)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    icon.save(args.out, format="PNG", optimize=True)

    check = Image.open(args.out)
    if check.mode != "RGB" or "A" in check.getbands() or "transparency" in check.info:
        raise SystemExit(f"icon has an alpha channel: mode={check.mode}")
    print(f"wrote {args.out} ({check.size[0]}x{check.size[1]}, mode {check.mode})")

    if args.preview_dir:
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        for size in (180, 120, 60, 40):
            small = icon.resize((size, size), Image.LANCZOS)
            path = args.preview_dir / f"icon-{size}.png"
            small.save(path)
            print(f"preview {path}")
        # Contact sheet with an iOS-style rounded mask, for eyeballing.
        sheet = Image.new("RGB", (180 + 120 + 60 + 40 + 5 * 24, 228), (40, 40, 44))
        x = 24
        for size in (180, 120, 60, 40):
            small = icon.resize((size, size), Image.LANCZOS)
            mask = Image.new("L", (size, size), 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size * 0.2237, fill=255)
            sheet.paste(small, (x, 24), mask)
            x += size + 24
        sheet.save(args.preview_dir / "icon-sheet.png")


if __name__ == "__main__":
    main()
