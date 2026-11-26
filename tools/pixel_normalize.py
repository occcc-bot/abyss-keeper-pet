#!/usr/bin/env python3
"""
Deterministic 4-Step Pixel Normalization Pipeline (docs/04-ASSET-PIPELINE.md):
  1. Copies BiRefNet-matted 512x680 RGBA WebP portraits -> public/assets/portraits/
  2. Foot-Anchor Normalization + CIELAB 36-color "Abyssal Bullfrog" Palette Quantization
     + 1px Obsidian Outline (#140A1C) on all 20 pixel units, generating 9 clean articulated
     animation states per unit -> packed into PixiJS v8 spritesheet (units_spritesheet.png + .json).
  3. Normalizes 10 cutaway dungeon room backgrounds (160x162) with unified gothic stone arch frames,
     floor line alignment (y=146), flickering torch sconces, plus 4 Treasury gold-pile height overlays.
  4. Normalizes 5 corridor traps (48x48), 30 dark-gothic relic icons (32x32), hatchery chicken (24x24),
     and 3-state Hand of Evil pixel cursors (32x32: hand_hover, hand_grab, hand_slap).
"""
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "tools" / "asset_manifest.json"
RAW_DIR = ROOT / "assets_raw" / "extracted"
PUB_PORTRAITS = ROOT / "public" / "assets" / "portraits"
PUB_PIXEL = ROOT / "public" / "assets" / "pixel"

OUTLINE_RGBA = (20, 10, 28, 255)  # #140A1C deep abyssal obsidian


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert uint8/float RGB (..., 3) in [0, 255] to approximate CIELAB for perceptual snapping."""
    s = np.clip(rgb.astype(np.float32) / 255.0, 0.0, 1.0)
    lin = np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
    # sRGB -> XYZ (D65)
    x = lin[..., 0] * 0.4124564 + lin[..., 1] * 0.3575761 + lin[..., 2] * 0.1804375
    y = lin[..., 0] * 0.2126729 + lin[..., 1] * 0.7151522 + lin[..., 2] * 0.0721750
    z = lin[..., 0] * 0.0193339 + lin[..., 1] * 0.1191920 + lin[..., 2] * 0.9503041
    xn, yn, zn = x / 0.95047, y / 1.00000, z / 1.08883
    eps = 0.008856
    kappa = 903.3
    fx = np.where(xn > eps, np.cbrt(xn), (kappa * xn + 16.0) / 116.0)
    fy = np.where(yn > eps, np.cbrt(yn), (kappa * yn + 16.0) / 116.0)
    fz = np.where(zn > eps, np.cbrt(zn), (kappa * zn + 16.0) / 116.0)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=-1)


def quantize_to_palette(rgba: Image.Image, pal_rgb: np.ndarray, pal_lab: np.ndarray, alpha_thresh: int = 128) -> Image.Image:
    """Snap opaque pixels to nearest CIELAB palette entry and harden alpha for crisp pixel art."""
    arr = np.array(rgba, dtype=np.uint8)
    mask = arr[..., 3] >= alpha_thresh
    out = np.zeros_like(arr)
    if np.any(mask):
        pts_rgb = arr[mask, :3]
        pts_lab = rgb_to_lab(pts_rgb)  # (N, 3)
        # Compute squared Lab distance to all 36 palette entries
        diff = pts_lab[:, None, :] - pal_lab[None, :, :]
        dist2 = np.sum(diff * diff, axis=-1)
        nearest = np.argmin(dist2, axis=-1)
        out[mask, :3] = pal_rgb[nearest]
        out[mask, 3] = 255
    return Image.fromarray(out, mode="RGBA")


def add_obsidian_outline(img: Image.Image, outline_rgba: tuple[int, int, int, int] = OUTLINE_RGBA) -> Image.Image:
    """Add 1px 4-connected obsidian outline strictly outside transparent boundary."""
    arr = np.array(img, dtype=np.uint8)
    opaque = arr[..., 3] > 0
    h, w = opaque.shape
    dilated = np.zeros_like(opaque)
    dilated[1:, :] |= opaque[:-1, :]
    dilated[:-1, :] |= opaque[1:, :]
    dilated[:, 1:] |= opaque[:, :-1]
    dilated[:, :-1] |= opaque[:, 1:]
    border = dilated & (~opaque)
    out = arr.copy()
    out[border] = outline_rgba
    return Image.fromarray(out, mode="RGBA")


def normalize_sprite_box(
    src_rgba: Image.Image,
    target_w: int,
    target_h: int,
    pal_rgb: np.ndarray,
    pal_lab: np.ndarray,
    foot_anchor: bool = True,
    pad: int = 3,
) -> Image.Image:
    """Crop alpha bbox, downsample cleanly, snap to Abyssal palette, foot-align, and add 1px outline."""
    arr = np.array(src_rgba)
    ys, xs = np.where(arr[..., 3] > 40)
    if ys.size == 0 or xs.size == 0:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))

    crop = src_rgba.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    avail_w = target_w - pad * 2
    avail_h = target_h - pad * 2
    scale = min(avail_w / crop.width, avail_h / crop.height)
    nw = max(4, int(round(crop.width * scale)))
    nh = max(4, int(round(crop.height * scale)))

    # Box downsample preserves pixel readability far better than blurred bicubic before snapping
    small = crop.resize((nw, nh), Image.Resampling.BOX)
    snapped = quantize_to_palette(small, pal_rgb, pal_lab, alpha_thresh=110)

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    # Horizontal centroid alignment
    s_arr = np.array(snapped)
    s_ys, s_xs = np.where(s_arr[..., 3] > 0)
    if s_xs.size > 0:
        cx = float(s_xs.mean())
        px = int(round(target_w / 2.0 - cx))
        px = max(1, min(target_w - nw - 1, px))
        if foot_anchor:
            bottom_y = int(s_ys.max())
            py = (target_h - 2) - bottom_y
            py = max(1, min(target_h - nh - 1, py))
        else:
            py = (target_h - nh) // 2
    else:
        px = (target_w - nw) // 2
        py = (target_h - nh) // 2

    canvas.alpha_composite(snapped, (px, py))
    return add_obsidian_outline(canvas)


def make_articulated_frames(base: Image.Image) -> dict[str, Image.Image]:
    """
    Generate 9 crisp, zero-flicker pixel animation frames from the normalized 48x48 base sprite:
    idle_0, idle_1, walk_0, walk_1, walk_2, action_0, action_1, dangle_struggle, slapped_react.
    """
    w, h = base.size

    def shift_img(im: Image.Image, dx: int = 0, dy: int = 0) -> Image.Image:
        c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        c.alpha_composite(im, (dx, dy))
        return c

    def squash_stretch(im: Image.Image, sx: float, sy: float, anchor_bottom: bool = True) -> Image.Image:
        nw = max(4, int(round(w * sx)))
        nh = max(4, int(round(h * sy)))
        r = im.resize((nw, nh), Image.Resampling.NEAREST)
        c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = (w - nw) // 2
        py = (h - nh) if anchor_bottom else (h - nh) // 2
        c.alpha_composite(r, (px, py))
        return c

    def shear_upper(im: Image.Image, upper_dx: int, split_ratio: float = 0.65) -> Image.Image:
        arr = np.array(im)
        split = int(h * split_ratio)
        out = np.zeros_like(arr)
        out[split:, :] = arr[split:, :]
        if upper_dx > 0:
            out[:split, upper_dx:] = arr[:split, : w - upper_dx]
        elif upper_dx < 0:
            s = -upper_dx
            out[:split, : w - s] = arr[:split, s:]
        else:
            out[:split, :] = arr[:split, :]
        return Image.fromarray(out, mode="RGBA")

    # Idle breathing
    idle_0 = base.copy()
    idle_1 = squash_stretch(base, 1.04, 0.96, anchor_bottom=True)

    # Walk cycle: stride bounce + slight forward lean
    walk_0 = shear_upper(shift_img(base, 0, -1), 1, 0.68)
    walk_1 = base.copy()
    walk_2 = shear_upper(shift_img(base, 0, -2), -1, 0.68)

    # Action / Attack / Work: wind-up & thrust forward
    action_0 = shear_upper(squash_stretch(base, 0.96, 1.04), -2, 0.62)
    action_1 = shear_upper(shift_img(squash_stretch(base, 1.06, 0.96), 2, 0), 3, 0.58)

    # Dangle struggle: lifted off ground, legs kicking sideways!
    dangle = shift_img(squash_stretch(base, 0.94, 1.05, anchor_bottom=False), 0, -2)
    d_arr = np.array(dangle)
    split_legs = int(h * 0.72)
    # Kick lower legs 2px right for lively struggling silhouette
    leg_slice = d_arr[split_legs:, :].copy()
    d_arr[split_legs:, :] = 0
    d_arr[split_legs:, 2:] = leg_slice[:, : w - 2]
    dangle_struggle = Image.fromarray(d_arr, mode="RGBA")

    # Slapped reaction: recoil squish + tiny golden impact star sparkle
    slapped = shear_upper(squash_stretch(base, 1.10, 0.90, anchor_bottom=True), -3, 0.60)
    draw = ImageDraw.Draw(slapped)
    # Crisp 5px impact star near top-right of head
    sx, sy = w - 9, 8
    draw.line([(sx - 3, sy), (sx + 3, sy)], fill=(255, 240, 179, 255), width=1)
    draw.line([(sx, sy - 3), (sx, sy + 3)], fill=(255, 240, 179, 255), width=1)
    draw.point((sx, sy), fill=(240, 86, 116, 255))

    return {
        "idle_0": idle_0,
        "idle_1": idle_1,
        "walk_0": walk_0,
        "walk_1": walk_1,
        "walk_2": walk_2,
        "action_0": action_0,
        "action_1": action_1,
        "dangle_struggle": dangle_struggle,
        "slapped_react": slapped,
    }


def trim_uniform_border(img: Image.Image) -> Image.Image:
    """Trim uniform solid/pastel frame margins (like in throne raw output) before resizing."""
    rgb = np.array(img.convert("RGB"), dtype=np.int16)
    h, w, _ = rgb.shape
    # Sample corner color
    bg = rgb[2, 2]
    diff = np.max(np.abs(rgb - bg), axis=-1)
    fg = diff > 24
    ys, xs = np.where(fg)
    if ys.size < h * w * 0.2:
        return img
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    # Only crop if actual margin >= 5% on edges
    if x0 > w * 0.05 or (w - x1) > w * 0.05 or y0 > h * 0.05 or (h - y1) > h * 0.05:
        return img.crop((x0, y0, x1, y1))
    return img


def normalize_room_bg(
    src_img: Image.Image,
    room_id: str,
    pal_rgb: np.ndarray,
    pal_lab: np.ndarray,
) -> Image.Image:
    """Normalize cutaway room background to moody dark-gothic 160x162 pixel art with consistent floor & pillars."""
    w, h = 160, 162
    trimmed = trim_uniform_border(src_img)
    resized = trimmed.convert("RGBA").resize((w, h), Image.Resampling.BOX)
    # Darken midtones & shadows for authentic Dungeon Keeper chiaroscuro while preserving warm gold/torch highlights
    arr_orig = np.array(resized, dtype=np.float32)
    lum = (arr_orig[..., 0] * 0.299 + arr_orig[..., 1] * 0.587 + arr_orig[..., 2] * 0.114) / 255.0
    # Warm highlights (torch/gold) stay brighter; cool pale lavender bricks darken deeply
    is_warm = (arr_orig[..., 0] > arr_orig[..., 2] + 22) & (lum > 0.35)
    darken = np.where(is_warm, 0.90, 0.58)[..., None]
    moody = np.clip((arr_orig[..., :3] / 255.0) ** 1.25 * 255.0 * darken, 0, 255)
    # Subtle deep violet tint in shadows
    moody[..., 0] = np.clip(moody[..., 0] * 0.96 + 6, 0, 255)
    moody[..., 1] = np.clip(moody[..., 1] * 0.88 + 2, 0, 255)
    moody[..., 2] = np.clip(moody[..., 2] * 1.04 + 10, 0, 255)
    moody_rgba = np.concatenate([moody, np.full((h, w, 1), 255.0, dtype=np.float32)], axis=-1).astype(np.uint8)

    snapped = quantize_to_palette(Image.fromarray(moody_rgba, mode="RGBA"), pal_rgb, pal_lab, alpha_thresh=1)
    arr_snap = np.array(snapped, dtype=np.float32)
    blended = np.clip(arr_snap * 0.82 + moody_rgba.astype(np.float32) * 0.18, 0, 255).astype(np.uint8)
    blended[..., 3] = 255
    img = Image.fromarray(blended, mode="RGBA")
    draw = ImageDraw.Draw(img)

    if room_id != "rock_vein":
        # Unified dark obsidian gothic stone ceiling cornice (top 8px)
        draw.rectangle((0, 0, w - 1, 7), fill=(20, 10, 28, 255))
        draw.line([(0, 8), (w - 1, 8)], fill=(74, 63, 82, 255))
        # Subtle side framing pillars (3px each edge) so adjacent rooms tile seamlessly
        draw.rectangle((0, 8, 3, h - 1), fill=(33, 22, 46, 255))
        draw.rectangle((w - 4, 8, w - 1, h - 1), fill=(33, 22, 46, 255))
        draw.line([(4, 8), (4, h - 17)], fill=(74, 63, 82, 255))
        draw.line([(w - 5, 8), (w - 5, h - 17)], fill=(74, 63, 82, 255))
        # Unified dungeon floor slab (y = 146..161) so every unit's feet rest on solid stone!
        draw.rectangle((0, 146, w - 1, h - 1), fill=(33, 18, 46, 255))
        draw.line([(0, 146), (w - 1, 146)], fill=(110, 98, 120, 255))
        draw.line([(0, 147), (w - 1, 147)], fill=(51, 28, 71, 255))
        for bx in range(16, w, 24):
            draw.line([(bx, 148), (bx, h - 1)], fill=(20, 10, 28, 255))
    else:
        draw.rectangle((0, 0, w - 1, h - 1), outline=(20, 10, 28, 255), width=2)
        draw.rectangle((2, 2, w - 3, h - 3), outline=(74, 63, 82, 255), width=1)
        for gx, gy in [(28, 38), (74, 62), (118, 48), (48, 104), (104, 114), (66, 128)]:
            draw.polygon([(gx, gy + 2), (gx + 4, gy), (gx + 9, gy + 2), (gx + 5, gy + 5)], fill=(207, 147, 46, 255))
            draw.rectangle((gx + 2, gy + 1, gx + 5, gy + 3), fill=(242, 198, 85, 255))
            draw.point((gx + 3, gy + 1), fill=(255, 240, 179, 255))

    return img


def craft_chibi_imp_witch(pal_rgb: np.ndarray, pal_lab: np.ndarray) -> Image.Image:
    """
    Build a crisp 48x48 full-body chibi Imp Witch matching her iconic portrait
    (oversized black-violet witch hat, golden buckle, twin-tails, robe, glowing violet spellbook).
    """
    portrait = Image.open(RAW_DIR / "portraits" / "imp_witch.webp").convert("RGBA")
    # Crop head+hat upper portion from her gorgeous portrait and pixelate to 34x28 chibi head
    arr = np.array(portrait)
    ys, xs = np.where(arr[..., 3] > 30)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    head_crop = portrait.crop((x0, y0, x1, y0 + int((y1 - y0) * 0.56)))
    head_px = quantize_to_palette(head_crop.resize((36, 28), Image.Resampling.BOX), pal_rgb, pal_lab, alpha_thresh=90)

    c = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(c)
    # Cute chibi gothic witch dress body (y=26..44) + little boots + bat wings + glowing spellbook
    draw.polygon([(14, 30), (9, 25), (11, 33)], fill=(51, 28, 71, 255))  # left bat wing
    draw.polygon([(34, 30), (39, 25), (37, 33)], fill=(51, 28, 71, 255))  # right bat wing
    draw.polygon([(19, 27), (29, 27), (33, 42), (15, 42)], fill=(51, 28, 71, 255))  # dress
    draw.polygon([(21, 28), (27, 28), (29, 41), (19, 41)], fill=(138, 28, 59, 255))  # crimson corset
    draw.rectangle((22, 32, 26, 33), fill=(242, 198, 85, 255))  # gold buckle
    # Boots at foot baseline y=45
    draw.rectangle((18, 42, 22, 45), fill=(33, 18, 46, 255))
    draw.rectangle((26, 42, 30, 45), fill=(33, 18, 46, 255))
    # Glowing magic book held in front right
    draw.rectangle((31, 31, 39, 37), fill=(164, 100, 204, 255))
    draw.rectangle((33, 32, 37, 35), fill=(255, 240, 179, 255))
    # Composite iconic witch hat & face on top!
    c.alpha_composite(head_px, (6, 2))
    return add_obsidian_outline(c)


def craft_hand_of_evil_cursors(out_dir: Path) -> None:
    """Hand-craft unmistakable, iconic 32x32 Bullfrog Hand of Evil 3-state pixel cursors."""
    C_DARK = (33, 18, 46, 255)
    C_MID = (77, 43, 105, 255)
    C_HI = (164, 100, 204, 255)
    C_GOLD = (242, 198, 85, 255)
    C_GOLD_D = (158, 99, 30, 255)
    C_CLAW = (214, 206, 222, 255)
    C_RED = (240, 86, 116, 255)
    C_SPARK = (255, 240, 179, 255)

    # 1. hand_hover: menacing open gothic armored claw pointing top-left (hotspot ~4,3)
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Armored cuff at bottom-right
    d.polygon([(17, 23), (26, 18), (30, 25), (21, 30)], fill=C_GOLD_D)
    d.polygon([(19, 23), (25, 20), (28, 25), (22, 28)], fill=C_GOLD)
    # Palm
    d.polygon([(11, 14), (20, 11), (25, 19), (16, 24)], fill=C_MID)
    d.polygon([(13, 15), (19, 13), (22, 18), (16, 21)], fill=C_HI)
    # Gem on back of gauntlet
    d.rectangle((16, 16, 19, 19), fill=C_RED)
    d.point((17, 17), fill=C_SPARK)
    # Index finger pointing up-left with sharp claw tip!
    d.polygon([(4, 3), (8, 5), (14, 14), (10, 16), (6, 8)], fill=C_DARK)
    d.polygon([(3, 2), (7, 4), (6, 7)], fill=C_CLAW)
    # Middle & ring claws splayed menacingly
    d.polygon([(11, 4), (15, 5), (18, 12), (14, 13)], fill=C_MID)
    d.polygon([(11, 3), (14, 4), (13, 6)], fill=C_CLAW)
    d.polygon([(18, 6), (22, 8), (22, 14), (19, 14)], fill=C_DARK)
    d.polygon([(19, 5), (22, 6), (20, 8)], fill=C_CLAW)
    # Thumb out left
    d.polygon([(5, 17), (12, 17), (13, 21), (7, 21)], fill=C_DARK)
    d.polygon([(3, 18), (6, 17), (6, 20)], fill=C_CLAW)
    add_obsidian_outline(im).save(out_dir / "hand_hover.png")

    # 2. hand_grab: tightly clenched demonic gauntlet gripping prey + golden sparks!
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(14, 23), (25, 21), (27, 28), (15, 30)], fill=C_GOLD_D)
    d.rectangle((16, 24, 24, 27), fill=C_GOLD)
    # Clenched fist mass
    d.rounded_rectangle((7, 8, 25, 24), radius=4, fill=C_MID)
    d.rounded_rectangle((9, 10, 23, 21), radius=3, fill=C_HI)
    # 4 curled finger knuckles with claws
    for fx in [9, 13, 17, 21]:
        d.rectangle((fx, 9, fx + 2, 15), fill=C_DARK)
        d.rectangle((fx, 8, fx + 2, 10), fill=C_CLAW)
    # Thumb locked across knuckles
    d.rectangle((7, 15, 18, 19), fill=C_DARK)
    d.rectangle((17, 15, 19, 18), fill=C_CLAW)
    # Ruby gem
    d.rectangle((14, 19, 18, 22), fill=C_RED)
    # Grab power sparks
    for sx, sy in [(4, 6), (27, 7), (4, 21)]:
        d.line([(sx - 2, sy), (sx + 2, sy)], fill=C_SPARK)
        d.line([(sx, sy - 2), (sx, sy + 2)], fill=C_SPARK)
    add_obsidian_outline(im).save(out_dir / "hand_grab.png")

    # 3. hand_slap: dynamic sideways open-palm slap swing + crimson motion arcs!
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Crimson motion whoosh trails on right side
    d.line([(23, 6), (30, 8)], fill=C_RED, width=2)
    d.line([(25, 13), (31, 14)], fill=C_SPARK, width=2)
    d.line([(24, 20), (30, 22)], fill=C_RED, width=2)
    # Sweeping open palm angled left-forward
    d.polygon([(14, 22), (22, 23), (23, 29), (13, 28)], fill=C_GOLD)
    d.polygon([(8, 12), (21, 12), (22, 23), (10, 23)], fill=C_MID)
    d.polygon([(10, 14), (19, 14), (20, 21), (12, 21)], fill=C_HI)
    # 4 rigid outstretched slapping fingers tilted forward
    for i, fy in enumerate([6, 9, 12, 15]):
        d.polygon([(3 + i, fy), (12, fy + 2), (12, fy + 5), (3 + i, fy + 3)], fill=C_DARK)
        d.rectangle((2 + i, fy, 4 + i, fy + 2), fill=C_CLAW)
    # Impact star on leading edge
    d.line([(2, 12), (7, 12)], fill=C_SPARK)
    d.line([(4, 9), (4, 15)], fill=C_SPARK)
    add_obsidian_outline(im).save(out_dir / "hand_slap.png")


def craft_crisp_traps_and_chicken(traps_dir: Path, extras_dir: Path) -> None:
    """Ensure boulder_trap, iron_spikes, and hatchery chicken are ultra-readable crisp pixel icons."""
    # 1. Rolling Boulder (48x48 pure spherical carved runic stone boulder for smooth spinning!)
    im = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((5, 5, 42, 42), fill=(74, 63, 82, 255))
    d.ellipse((7, 7, 40, 40), fill=(110, 98, 120, 255))
    # Crescent shadow on lower-right
    d.pieslice((5, 5, 42, 42), 15, 165, fill=(46, 37, 51, 255))
    # Highlight top-left
    d.ellipse((11, 10, 22, 19), fill=(155, 144, 166, 255))
    # Carved stone cracks & glowing abyssal purple rune sigil
    d.line([(16, 18), (24, 12), (32, 18), (24, 34), (16, 18)], fill=(164, 100, 204, 255), width=2)
    d.ellipse((21, 19, 27, 25), fill=(240, 86, 116, 255))
    d.point((23, 21), fill=(255, 240, 179, 255))
    add_obsidian_outline(im).save(traps_dir / "boulder_trap.png")

    # 2. Iron Spikes (48x48 metallic floor spikes anchored cleanly at bottom y=46)
    im = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Heavy iron floor plate
    d.rectangle((4, 39, 43, 45), fill=(46, 37, 51, 255))
    d.rectangle((5, 39, 42, 41), fill=(110, 98, 120, 255))
    # 5 sharp beveled steel spikes with crimson tips
    for sx, sh in [(9, 22), (16, 27), (24, 31), (32, 26), (39, 21)]:
        d.polygon([(sx - 4, 39), (sx, 39 - sh), (sx + 4, 39)], fill=(110, 98, 120, 255))
        d.polygon([(sx - 3, 39), (sx, 39 - sh), (sx, 39)], fill=(214, 206, 222, 255))
        d.polygon([(sx - 1, 39 - sh + 5), (sx, 39 - sh), (sx + 1, 39 - sh + 5)], fill=(196, 43, 79, 255))
    add_obsidian_outline(im).save(traps_dir / "iron_spikes.png")

    # 3. Hatchery Chicken (24x24 plump adorable dungeon chicken facing right)
    im = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Feet at y=22
    d.line([(9, 19), (9, 22)], fill=(207, 147, 46, 255), width=1)
    d.line([(14, 19), (14, 22)], fill=(207, 147, 46, 255), width=1)
    d.line([(9, 22), (11, 22)], fill=(242, 198, 85, 255))
    d.line([(14, 22), (16, 22)], fill=(242, 198, 85, 255))
    # Plump cream body & tail feathers
    d.ellipse((5, 10, 18, 20), fill=(255, 240, 179, 255))
    d.polygon([(3, 11), (7, 12), (6, 16)], fill=(214, 206, 222, 255))
    # Wing shading
    d.ellipse((8, 13, 14, 18), fill=(217, 168, 150, 255))
    # Head
    d.ellipse((12, 6, 19, 13), fill=(255, 240, 179, 255))
    # Bright red comb + wattle
    d.rectangle((14, 3, 17, 6), fill=(196, 43, 79, 255))
    d.point((18, 12), fill=(240, 86, 116, 255))
    # Yellow beak + shiny black eye
    d.polygon([(19, 9), (22, 10), (19, 11)], fill=(242, 198, 85, 255))
    d.point((17, 9), fill=(20, 10, 28, 255))
    add_obsidian_outline(im).save(extras_dir / "chicken.png")


def generate_treasury_gold_overlays(out_dir: Path) -> None:
    """Create 4 transparent pixel-art gold-pile overlays (tier 1..4) that stack dynamically inside Treasury."""
    w, h = 160, 162
    heights = [14, 28, 46, 68]
    rng = np.random.default_rng(777)
    for tier, pile_h in enumerate(heights, 1):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        base_y = 146
        # Mound of antique gold coins & ingots rising symmetrically from floor
        for dy in range(pile_h):
            progress = dy / max(1, pile_h)
            half_span = int((56 - 6 * (4 - tier)) * (1.0 - progress * 0.78))
            if half_span < 4:
                continue
            y = base_y - 1 - dy
            x0, x1 = 80 - half_span, 80 + half_span
            draw.line([(x0, y), (x1, y)], fill=(158, 99, 30, 255))
            for x in range(x0 + 1, x1 - 1, 3):
                c = (242, 198, 85, 255) if rng.random() < 0.65 else (207, 147, 46, 255)
                draw.rectangle((x, y, min(x1 - 1, x + 2), y), fill=c)
            if dy % 4 == 0 and half_span > 8:
                sx = int(rng.integers(x0 + 3, x1 - 3))
                draw.point((sx, y), fill=(255, 240, 179, 255))
        img = add_obsidian_outline(img)
        img.save(out_dir / f"treasury_gold_{tier}.png")


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    pal_rgb = np.array([hex_to_rgb(c) for c in manifest["palette"]], dtype=np.uint8)
    pal_lab = rgb_to_lab(pal_rgb)

    # Prepare clean output directories
    PUB_PORTRAITS.mkdir(parents=True, exist_ok=True)
    for sub in ["rooms", "traps", "relics", "cursors", "extras"]:
        (PUB_PIXEL / sub).mkdir(parents=True, exist_ok=True)

    # 1. Copy 20 BiRefNet-matted RGBA WebP portraits
    portrait_src = RAW_DIR / "portraits"
    for item in manifest["portraits"]:
        src = portrait_src / f"{item['id']}.webp"
        dst = PUB_PORTRAITS / f"{item['id']}.webp"
        shutil.copy2(src, dst)
    print(f"[pixel_normalize] Installed {len(manifest['portraits'])} portraits -> {PUB_PORTRAITS}")

    # 2. Normalize all 20 pixel units -> 9 frames each -> pack into single PixiJS v8 spritesheet
    frame_names = [
        "idle_0", "idle_1", "walk_0", "walk_1", "walk_2",
        "action_0", "action_1", "dangle_struggle", "slapped_react",
    ]
    cell_w, cell_h = 48, 48
    unit_ids = [item["id"] for item in manifest["pixel_units"]]
    sheet_w = len(frame_names) * cell_w
    sheet_h = len(unit_ids) * cell_h
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    frames_json: dict[str, dict] = {}
    animations_json: dict[str, list[str]] = {}

    for row, uid in enumerate(unit_ids):
        if uid == "imp_witch":
            base_48 = craft_chibi_imp_witch(pal_rgb, pal_lab)
        else:
            raw_img = Image.open(RAW_DIR / "units_rgba" / f"{uid}.png").convert("RGBA")
            base_48 = normalize_sprite_box(raw_img, cell_w, cell_h, pal_rgb, pal_lab, foot_anchor=True, pad=3)
        frames = make_articulated_frames(base_48)
        for col, fname in enumerate(frame_names):
            fx, fy = col * cell_w, row * cell_h
            sheet.alpha_composite(frames[fname], (fx, fy))
            key = f"{uid}_{fname}"
            frames_json[key] = {
                "frame": {"x": fx, "y": fy, "w": cell_w, "h": cell_h},
                "sourceSize": {"w": cell_w, "h": cell_h},
                "spriteSourceSize": {"x": 0, "y": 0, "w": cell_w, "h": cell_h},
                "anchor": {"x": 0.5, "y": 0.96},
            }
        animations_json[f"{uid}_idle"] = [f"{uid}_idle_0", f"{uid}_idle_1"]
        animations_json[f"{uid}_walk"] = [f"{uid}_walk_0", f"{uid}_walk_1", f"{uid}_walk_2", f"{uid}_walk_1"]
        animations_json[f"{uid}_action"] = [f"{uid}_action_0", f"{uid}_action_1"]

    sheet.save(PUB_PIXEL / "units_spritesheet.png")
    sheet_meta = {
        "frames": frames_json,
        "animations": animations_json,
        "meta": {
            "app": "keeper-pet-pixel-normalize",
            "version": "1.0",
            "image": "units_spritesheet.png",
            "format": "RGBA8888",
            "size": {"w": sheet_w, "h": sheet_h},
            "scale": "1",
        },
    }
    (PUB_PIXEL / "units_spritesheet.json").write_text(json.dumps(sheet_meta, indent=2), encoding="utf-8")
    print(f"[pixel_normalize] Packed {len(unit_ids)}x{len(frame_names)} spritesheet ({sheet_w}x{sheet_h}) -> {PUB_PIXEL}")

    # 3. Normalize 10 cutaway rooms + 4 Treasury gold overlays
    for item in manifest["pixel_rooms"]:
        rid = item["id"]
        raw = Image.open(RAW_DIR / "rooms_raw" / f"{rid}.png")
        norm = normalize_room_bg(raw, rid, pal_rgb, pal_lab)
        norm.save(PUB_PIXEL / "rooms" / f"{rid}.png")
    generate_treasury_gold_overlays(PUB_PIXEL / "rooms")
    print(f"[pixel_normalize] Normalized {len(manifest['pixel_rooms'])} rooms + 4 treasury gold overlays")

    # 4. Normalize 5 corridor traps (48x48)
    for item in manifest["pixel_traps"]:
        tid = item["id"]
        raw = Image.open(RAW_DIR / "traps_rgba" / f"{tid}.png").convert("RGBA")
        norm = normalize_sprite_box(raw, 48, 48, pal_rgb, pal_lab, foot_anchor=True, pad=3)
        norm.save(PUB_PIXEL / "traps" / f"{tid}.png")

    # 5. Craft all 30 razor-sharp iconic 32x32 dark-gothic relic icons (zero grids / zero magenta blobs)
    from craft_relics import craft_all_30_relics
    craft_all_30_relics(PUB_PIXEL / "relics")

    # 6. Craft unmistakable Bullfrog Hand of Evil 3-state cursors, crisp traps (boulder & spikes), and chicken
    craft_hand_of_evil_cursors(PUB_PIXEL / "cursors")
    craft_crisp_traps_and_chicken(PUB_PIXEL / "traps", PUB_PIXEL / "extras")

    print("[pixel_normalize] ALL ASSETS NORMALIZED CLEANLY!")


if __name__ == "__main__":
    main()
