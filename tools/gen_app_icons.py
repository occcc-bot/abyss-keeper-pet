#!/usr/bin/env python3
"""Generate crisp dark gothic abyssal crystal app icons for Tauri v2 (PNG + ICO)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def draw_abyss_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.44

    # Obsidian medallion backing
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(20, 10, 28, 255), outline=(196, 152, 72, 255), width=max(1, size // 16))
    # Inner dark purple aura
    r2 = r * 0.80
    draw.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=(46, 18, 66, 255), outline=(120, 52, 168, 255), width=max(1, size // 24))
    # Crimson abyss crystal diamond
    pts_outer = [
        (cx, cy - r * 0.68),
        (cx + r * 0.46, cy),
        (cx, cy + r * 0.68),
        (cx - r * 0.46, cy),
    ]
    draw.polygon(pts_outer, fill=(178, 28, 72, 255), outline=(245, 206, 118, 255))
    # Facet highlight
    pts_hi = [
        (cx, cy - r * 0.52),
        (cx + r * 0.22, cy - r * 0.05),
        (cx, cy + r * 0.12),
        (cx - r * 0.26, cy - r * 0.08),
    ]
    draw.polygon(pts_hi, fill=(242, 92, 138, 230))
    # Core glint
    g = max(1, int(size * 0.06))
    draw.ellipse((cx - g, cy - r * 0.22 - g, cx + g, cy - r * 0.22 + g), fill=(255, 240, 200, 255))
    return img


def main() -> None:
    img256 = draw_abyss_icon(256)
    img256.save(OUT_DIR / "128x128@2x.png")
    img256.save(OUT_DIR / "icon.png")
    draw_abyss_icon(128).save(OUT_DIR / "128x128.png")
    draw_abyss_icon(32).save(OUT_DIR / "32x32.png")
    img256.save(
        OUT_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"[gen_app_icons] Generated icons in {OUT_DIR}")


if __name__ == "__main__":
    main()
