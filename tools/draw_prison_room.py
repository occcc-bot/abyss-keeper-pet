#!/usr/bin/env python3
"""
Deterministic 16-bit dark gothic pixel-art generator for the Abyssal Prison room tile:
  public/assets/pixel/rooms/prison.png (160x162, opaque RGBA)

Matches the exact cutaway frame, stone arch geometry, and floor baseline (y=146)
of the existing 10 dungeon room tiles in public/assets/pixel/rooms/.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "public" / "assets" / "pixel" / "rooms" / "prison.png"

W, H = 160, 162

# Palette from tools/asset_manifest.json
OBSIDIAN = (20, 10, 28, 255)        # #140A1C
PLUM_DARK = (33, 18, 46, 255)       # #21122E
PLUM_WALL = (33, 22, 46, 255)       # #21162E (outer side border)
PLUM_MID = (51, 28, 71, 255)        # #331C47
PLUM_LIGHT = (77, 43, 105, 255)     # #4D2B69
VIOLET = (114, 64, 150, 255)        # #724096
VIOLET_BRIGHT = (164, 100, 204, 255) # #A464CC

STONE_BLACK = (26, 20, 30, 255)     # #1A141E
STONE_DARK = (46, 37, 51, 255)      # #2E2533
STONE_MID = (74, 63, 82, 255)       # #4A3F52
STONE_LIGHT = (110, 98, 120, 255)   # #6E6278
IRON_LIGHT = (155, 144, 166, 255)   # #9B90A6
IRON_SPEC = (214, 206, 222, 255)    # #D6CEDE

GOLD_DARK = (99, 58, 20, 255)       # #633A14
GOLD_MID = (158, 99, 30, 255)       # #9E631E
GOLD_BRIGHT = (207, 147, 46, 255)   # #CF932E
GOLD_GLOW = (242, 198, 85, 255)     # #F2C655
GOLD_CORE = (255, 240, 179, 255)    # #FFF0B3
STRAW_DARK = (51, 29, 11, 255)      # #331D0B


def draw_brick_wall(draw: ImageDraw.ImageDraw) -> None:
    # Base obsidian wall fill
    draw.rectangle([0, 0, W - 1, H - 1], fill=OBSIDIAN)

    # Interior wall stone background (x=5..154, y=9..145)
    draw.rectangle([5, 9, 154, 145], fill=PLUM_DARK)

    # Staggered obsidian/stone brick courses
    brick_h = 10
    brick_w = 20
    for row_idx, y0 in enumerate(range(10, 145, brick_h)):
        y1 = min(144, y0 + brick_h - 2)
        offset = (brick_w // 2) if (row_idx % 2 == 1) else 0
        for x0 in range(5 - offset, 155, brick_w):
            bx0 = max(5, x0)
            bx1 = min(154, x0 + brick_w - 2)
            if bx1 <= bx0:
                continue
            # Deterministic subtle stone variation
            tone = STONE_DARK if ((row_idx * 7 + (x0 // brick_w) * 3) % 5 != 0) else PLUM_MID
            draw.rectangle([bx0, y0, bx1, y1], fill=tone)
            # Top highlight on occasional bricks
            if (row_idx + x0 // brick_w) % 3 == 0:
                draw.line([(bx0, y0), (bx1, y0)], fill=STONE_MID)


def draw_inner_cell_recess(draw: ImageDraw.ImageDraw) -> None:
    # Deep recessed cell interior (x=28..131, y=28..145) with arched top
    for y in range(26, 146):
        if y < 56:
            # Semicircular arch curve
            dy = 56 - y
            dx = int((30 * 30 - dy * dy) ** 0.5) if dy <= 30 else 0
            # Stretch horizontally to span x=28..131 (half-width ~51)
            hw = int(dx * 51 / 30)
            x_left = 80 - hw
            x_right = 79 + hw
        else:
            x_left, x_right = 29, 130

        if x_right > x_left:
            # Dark abyssal interior wall
            draw.line([(x_left, y), (x_right, y)], fill=STONE_BLACK)
            # Subtle inner back-wall bricks in upper/mid area
            if y % 12 == 0:
                draw.line([(x_left + 2, y), (x_right - 2, y)], fill=OBSIDIAN)
            elif y % 12 == 1 and y > 40:
                for bx in range(x_left + (6 if (y // 12) % 2 else 14), x_right - 4, 18):
                    draw.line([(bx, y + 1), (bx, min(144, y + 10))], fill=OBSIDIAN)

    # Stone arch voussoirs (arch ring around the cell opening)
    for y in range(22, 58):
        dy = 56 - y
        hw_inner = int(((max(0, 30 * 30 - dy * dy)) ** 0.5) * 51 / 30)
        hw_outer = int(((max(0, 36 * 36 - max(0, dy - 2) ** 2)) ** 0.5) * 58 / 36)
        if hw_outer > hw_inner:
            draw.line([(80 - hw_outer, y), (80 - hw_inner - 1, y)], fill=STONE_MID)
            draw.line([(79 + hw_inner + 1, y), (79 + hw_outer, y)], fill=STONE_MID)
            # Inner arch shadow rim
            draw.point((80 - hw_inner - 1, y), fill=STONE_LIGHT)
            draw.point((79 + hw_inner + 1, y), fill=STONE_LIGHT)

    # Keystone at top center of arch
    draw.rectangle([76, 18, 83, 28], fill=STONE_LIGHT)
    draw.rectangle([77, 19, 82, 26], fill=STONE_MID)
    draw.point((79, 22), fill=VIOLET_BRIGHT)
    draw.point((80, 22), fill=VIOLET_BRIGHT)

    # Left & right stone arch pillars (x=22..28 and x=131..137)
    for px0, px1 in [(22, 28), (131, 137)]:
        draw.rectangle([px0, 56, px1, 145], fill=STONE_MID)
        draw.line([(px0, 56), (px0, 145)], fill=STONE_LIGHT)
        draw.line([(px1, 56), (px1, 145)], fill=STONE_DARK)
        for py in range(64, 145, 16):
            draw.line([(px0, py), (px1, py)], fill=STONE_DARK)


def draw_straw_corner(draw: ImageDraw.ImageDraw) -> None:
    # Straw pile in bottom-left inside the cell (x=31..58, y=132..145)
    # Drawn BEFORE the iron bars so the bars sit cleanly in front of the straw!
    straw_blocks = [
        (31, 140, 56, 145, GOLD_DARK),
        (32, 137, 51, 144, GOLD_MID),
        (33, 134, 44, 141, GOLD_BRIGHT),
    ]
    for x0, y0, x1, y1, col in straw_blocks:
        draw.rectangle([x0, y0, x1, y1], fill=col)

    # Crisp straw wisps & shadow creases
    for wx, wy in [(34, 133), (36, 132), (39, 133), (42, 135), (46, 136), (50, 138), (54, 141)]:
        draw.line([(wx, wy), (wx + 2, wy + 2)], fill=GOLD_GLOW)
    for sx, sy in [(34, 142), (38, 140), (43, 142), (48, 143), (52, 144)]:
        draw.line([(sx, sy), (sx + 3, sy)], fill=STRAW_DARK)


def draw_hanging_chains(draw: ImageDraw.ImageDraw) -> None:
    # Twin iron chains with shackles hanging from the upper arch
    for cx in (48, 111):
        top_y = 35
        bot_y = 66 if cx == 48 else 58
        for y in range(top_y, bot_y, 2):
            # Alternating link width for pixel-art chain texture
            if ((y - top_y) // 2) % 2 == 0:
                draw.point((cx, y), fill=IRON_LIGHT)
                draw.point((cx, y + 1), fill=STONE_MID)
            else:
                draw.point((cx - 1, y), fill=STONE_LIGHT)
                draw.point((cx + 1, y), fill=IRON_SPEC)
                draw.point((cx - 1, y + 1), fill=STONE_DARK)
                draw.point((cx + 1, y + 1), fill=IRON_LIGHT)
        # Shackle cuff at bottom of chain
        draw.rectangle([cx - 3, bot_y, cx + 3, bot_y + 4], fill=STONE_LIGHT)
        draw.rectangle([cx - 2, bot_y + 1, cx + 2, bot_y + 3], fill=STONE_BLACK)
        draw.point((cx - 2, bot_y), fill=IRON_SPEC)
        draw.point((cx + 2, bot_y), fill=IRON_SPEC)


def draw_iron_bars_and_gate(draw: ImageDraw.ImageDraw) -> None:
    # Horizontal iron crossbars spanning the cell opening (x=29..130)
    for hy in (60, 102, 141):
        draw.rectangle([29, hy, 130, hy + 3], fill=STONE_DARK)
        draw.line([(29, hy), (130, hy)], fill=STONE_LIGHT)
        draw.line([(29, hy + 3), (130, hy + 3)], fill=STONE_BLACK)

    # Vertical cold wrought-iron bars
    bar_xs = [36, 48, 60, 72, 84, 96, 108, 120]
    for bx in bar_xs:
        # Compute top of bar against the arch curve
        dx = abs(bx - 80)
        dy_max = int(max(0, (1.0 - (dx / 51.0) ** 2)) ** 0.5 * 30)
        top_y = max(28, 56 - dy_max)

        # 3px wide bar: dark left shadow, metallic body, crisp right/center highlight
        draw.rectangle([bx - 1, top_y, bx + 1, 145], fill=STONE_MID)
        draw.line([(bx - 1, top_y), (bx - 1, 145)], fill=STONE_BLACK)
        draw.line([(bx, top_y), (bx, 145)], fill=IRON_LIGHT)
        # Specular glint bands
        for gy in range(top_y + 4, 140, 16):
            draw.line([(bx, gy), (bx, min(144, gy + 3))], fill=IRON_SPEC)
        # Rivets at crossbar intersections
        for hy in (61, 103, 142):
            if hy >= top_y:
                draw.point((bx, hy), fill=IRON_SPEC)

    # Heavy dark-gold & violet rune lockplate on the cell gate (centered at x=90, y=98)
    draw.rectangle([82, 95, 97, 110], fill=GOLD_DARK)
    draw.rectangle([83, 96, 96, 109], fill=GOLD_MID)
    draw.line([(83, 96), (96, 96)], fill=GOLD_BRIGHT)
    draw.line([(83, 96), (83, 109)], fill=GOLD_BRIGHT)
    # Keyhole + abyssal violet seal glow
    draw.rectangle([88, 99, 91, 102], fill=OBSIDIAN)
    draw.rectangle([89, 102, 90, 106], fill=OBSIDIAN)
    draw.point((89, 100), fill=VIOLET_BRIGHT)
    draw.point((90, 100), fill=VIOLET_BRIGHT)


def draw_pillar_torches(draw: ImageDraw.ImageDraw) -> None:
    # Twin dark-gold sconces with deep purple arcane flames on left & right stone pillars
    for tx in (13, 146):
        # Soft purple ambient glow on surrounding bricks
        for dy in range(-12, 9):
            for dx in range(-6, 7):
                if dx * dx + dy * dy <= 42:
                    px, py = tx + dx, 68 + dy
                    if 6 <= px <= 153 and 10 <= py <= 140:
                        if (px + py) % 2 == 0:
                            draw.point((px, py), fill=PLUM_LIGHT)

        # Iron/gold wall bracket
        draw.rectangle([tx - 2, 74, tx + 2, 86], fill=GOLD_DARK)
        draw.rectangle([tx - 1, 74, tx + 1, 84], fill=GOLD_MID)
        draw.rectangle([tx - 3, 72, tx + 3, 74], fill=GOLD_BRIGHT)
        draw.line([(tx - 3, 72), (tx + 3, 72)], fill=GOLD_GLOW)

        # Arcane violet + gold core flame
        flame = [
            (0, -10, VIOLET),
            (-1, -9, VIOLET), (0, -9, VIOLET_BRIGHT), (1, -9, VIOLET),
            (-2, -8, VIOLET), (-1, -8, VIOLET_BRIGHT), (0, -8, GOLD_GLOW), (1, -8, VIOLET_BRIGHT), (2, -8, VIOLET),
            (-2, -7, VIOLET_BRIGHT), (-1, -7, GOLD_GLOW), (0, -7, GOLD_CORE), (1, -7, GOLD_GLOW), (2, -7, VIOLET_BRIGHT),
            (-2, -6, VIOLET), (-1, -6, GOLD_BRIGHT), (0, -6, GOLD_CORE), (1, -6, GOLD_BRIGHT), (2, -6, VIOLET),
            (-1, -5, GOLD_MID), (0, -5, GOLD_GLOW), (1, -5, GOLD_MID),
            (-1, -4, VIOLET), (0, -4, GOLD_BRIGHT), (1, -4, VIOLET),
        ]
        for fx, fy, col in flame:
            draw.point((tx + fx, 75 + fy), fill=col)


def draw_cutaway_frame_and_floor(draw: ImageDraw.ImageDraw) -> None:
    # Top 8px obsidian ceiling cap (y=0..7) + stone trim (y=8)
    draw.rectangle([0, 0, W - 1, 7], fill=OBSIDIAN)
    draw.line([(4, 8), (W - 5, 8)], fill=STONE_MID)

    # Left & Right 4px outer borders (x=0..3, x=156..159) + 1px inner rim
    draw.rectangle([0, 8, 3, 145], fill=PLUM_WALL)
    draw.rectangle([W - 4, 8, W - 1, 145], fill=PLUM_WALL)
    draw.line([(4, 8), (4, 145)], fill=STONE_MID)
    draw.line([(W - 5, 8), (W - 5, 145)], fill=STONE_MID)

    # Floor baseline y=146 (matches corridor.png / corruption.png)
    draw.line([(0, 146), (W - 1, 146)], fill=STONE_LIGHT)
    draw.line([(0, 147), (W - 1, 147)], fill=PLUM_MID)
    draw.rectangle([0, 148, W - 1, H - 1], fill=PLUM_DARK)

    # Vertical floor tile seams every 24px matching existing rooms
    for sx in (16, 40, 64, 88, 112, 136):
        draw.line([(sx, 148), (sx, H - 1)], fill=OBSIDIAN)


def main() -> None:
    im = Image.new("RGBA", (W, H), OBSIDIAN)
    draw = ImageDraw.Draw(im)

    draw_brick_wall(draw)
    draw_inner_cell_recess(draw)
    draw_straw_corner(draw)
    draw_hanging_chains(draw)
    draw_iron_bars_and_gate(draw)
    draw_pillar_torches(draw)
    draw_cutaway_frame_and_floor(draw)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT_PATH, "PNG")
    print(f"[draw_prison_room] Generated {OUT_PATH} ({im.size[0]}x{im.size[1]}, mode={im.mode})")


if __name__ == "__main__":
    main()
