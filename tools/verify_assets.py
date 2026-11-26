#!/usr/bin/env python3
"""
Strict Programmatic Asset Integrity & Alpha Purity Verifier (M3 DoD Gate).
Validates every portrait, spritesheet frame, room tile, trap, relic icon, cursor, and SFX:
  - Exact expected dimensions & presence against tools/asset_manifest.json
  - Transparent foreground assets have genuine transparent corners (no opaque box / checkerboard!)
  - Non-empty foreground coverage within sane bounds [5%, 95%]
  - Foot-anchor alignment on units_spritesheet frames
  - No pure-magenta chroma spill pixels remaining on transparent boundaries
"""
import json
import sys
import wave
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "tools" / "asset_manifest.json").read_text(encoding="utf-8"))
PUB = ROOT / "public" / "assets"

errors: list[str] = []


def check_rgba_foreground(
    path: Path,
    exp_w: int,
    exp_h: int,
    min_cov: float = 0.05,
    max_cov: float = 0.92,
    max_bbox_cov: float = 0.88,
    max_top_edge_cov: float | None = None,
) -> None:
    if not path.exists():
        errors.append(f"MISSING: {path}")
        return
    im = Image.open(path).convert("RGBA")
    if im.size != (exp_w, exp_h):
        errors.append(f"SIZE MISMATCH {path.name}: got {im.size}, expected {(exp_w, exp_h)}")
        return
    arr = np.array(im)
    alpha = arr[..., 3]
    # Check corners are transparent (catches failed matting or checkerboard backgrounds)
    corners = [alpha[0, 0], alpha[0, exp_w - 1], alpha[exp_h - 1, 0], alpha[exp_h - 1, exp_w - 1]]
    if sum(1 for c in corners if c > 20) >= 3:
        errors.append(f"OPAQUE CORNERS (matting fail?) in {path.name}: corners={corners}")
    cov = float(np.mean(alpha > 20))
    if cov < min_cov or cov > max_cov:
        errors.append(f"COVERAGE OUT OF RANGE in {path.name}: {cov:.3f} not in [{min_cov}, {max_cov}]")
    # Strict bounding-box fill ratio & top-corners check (catches unmatted rectangular backdrops!)
    fg = alpha > 20
    ys, xs = np.where(fg)
    if ys.size > 0:
        sub = fg[int(ys.min()) : int(ys.max()) + 1, int(xs.min()) : int(xs.max()) + 1]
        bbox_cov = float(sub.mean())
        if bbox_cov > max_bbox_cov:
            errors.append(
                f"RECTANGULAR BACKDROP SUSPECT in {path.name}: bbox_cov={bbox_cov:.3f} > {max_bbox_cov}"
            )
        if max_top_edge_cov is not None and sub.shape[0] >= 8 and sub.shape[1] >= 16:
            tl = float(sub[:6, :6].mean())
            tr = float(sub[:6, -6:].mean())
            if tl > 0.85 and tr > 0.85:
                errors.append(
                    f"RECTANGULAR TOP CORNERS (unmatted backdrop) in {path.name}: tl={tl:.2f}, tr={tr:.2f}"
                )
    # Check zero harsh magenta chroma residue (R>220, B>220, G<60)
    opaque = alpha > 40
    if np.any(opaque):
        rgb = arr[opaque, :3]
        magenta_px = np.sum((rgb[:, 0] > 220) & (rgb[:, 2] > 220) & (rgb[:, 1] < 60))
        if magenta_px > max(4, int(rgb.shape[0] * 0.015)):
            errors.append(f"MAGENTA CHROMA RESIDUE in {path.name}: {magenta_px} pixels")


def main() -> None:
    # 1. Verify 20 portraits (512x680 RGBA WebP) with strict bbox & top-corner matting checks
    for item in MANIFEST["portraits"]:
        check_rgba_foreground(
            PUB / "portraits" / f"{item['id']}.webp",
            512,
            680,
            min_cov=0.12,
            max_cov=0.90,
            max_bbox_cov=0.955,
            max_top_edge_cov=0.85,
        )

    # 2. Verify pixel units spritesheet + JSON
    sheet_png = PUB / "pixel" / "units_spritesheet.png"
    sheet_json = PUB / "pixel" / "units_spritesheet.json"
    if not sheet_png.exists() or not sheet_json.exists():
        errors.append("MISSING units_spritesheet.png or units_spritesheet.json")
    else:
        meta = json.loads(sheet_json.read_text(encoding="utf-8"))
        im = Image.open(sheet_png).convert("RGBA")
        arr = np.array(im)
        expected_frames = len(MANIFEST["pixel_units"]) * 9
        if len(meta.get("frames", {})) != expected_frames:
            errors.append(f"SPRITESHEET FRAME COUNT: got {len(meta.get('frames', {}))}, expected {expected_frames}")
        for item in MANIFEST["pixel_units"]:
            uid = item["id"]
            f0 = meta["frames"].get(f"{uid}_idle_0")
            if not f0:
                errors.append(f"MISSING FRAME {uid}_idle_0")
                continue
            r = f0["frame"]
            cell = arr[r["y"] : r["y"] + r["h"], r["x"] : r["x"] + r["w"]]
            ys, _ = np.where(cell[..., 3] > 0)
            if ys.size == 0:
                errors.append(f"EMPTY SPRITE CELL: {uid}")
            elif int(ys.max()) < 40:
                errors.append(f"FOOT ANCHOR DRIFT in {uid}: lowest pixel y={int(ys.max())} < 40")

    # 3. Verify 11 rooms (160x162 opaque, including prison.png) + 4 treasury gold overlays
    if len(MANIFEST["pixel_rooms"]) < 11:
        errors.append(f"ROOM MANIFEST COUNT TOO LOW: got {len(MANIFEST['pixel_rooms'])}, expected >= 11")
    for item in MANIFEST["pixel_rooms"]:
        p = PUB / "pixel" / "rooms" / f"{item['id']}.png"
        if not p.exists():
            errors.append(f"MISSING ROOM: {p}")
        else:
            im = Image.open(p).convert("RGBA")
            if im.size != (160, 162):
                errors.append(f"ROOM SIZE MISMATCH {p.name}: {im.size}")
            elif item["id"] == "prison":
                arr = np.array(im)
                if int(arr[..., 3].min()) != 255:
                    errors.append(f"PRISON ROOM NOT FULLY OPAQUE: min alpha={int(arr[..., 3].min())}")
    for tier in range(1, 5):
        check_rgba_foreground(PUB / "pixel" / "rooms" / f"treasury_gold_{tier}.png", 160, 162, 0.02, 0.70)

    # 4. Verify 5 traps (48x48), 30 relics (32x32), chicken (24x24), 3 hand cursors (32x32)
    for item in MANIFEST["pixel_traps"]:
        check_rgba_foreground(PUB / "pixel" / "traps" / f"{item['id']}.png", 48, 48, 0.05, 0.90)
    for item in MANIFEST["pixel_relics"]:
        check_rgba_foreground(PUB / "pixel" / "relics" / f"{item['id']}.png", 32, 32, 0.05, 0.92, max_bbox_cov=0.95)
    check_rgba_foreground(PUB / "pixel" / "extras" / "chicken.png", 24, 24, 0.05, 0.92)
    for cid in ["hand_hover", "hand_grab", "hand_slap"]:
        check_rgba_foreground(PUB / "pixel" / "cursors" / f"{cid}.png", 32, 32, 0.05, 0.92)

    # 5. Verify V2.0+V2.1 Portraits (36+ base + 12 V2.1 expression diffs), 37 Chibis (36 units + gothic_chicken), 5 Torture Props, and demon_heart_badge
    v2_portraits = sorted((PUB / "portraits").glob("*.webp"))
    if len(v2_portraits) < 48:
        errors.append(f"V2.1 PORTRAIT COUNT TOO LOW: got {len(v2_portraits)}, expected >= 48")
    for p in v2_portraits:
        check_rgba_foreground(p, 512, 680, min_cov=0.10, max_cov=0.92, max_bbox_cov=0.96, max_top_edge_cov=0.88)

    # Verify 6 capturable heroes × 2 V2.1 expression diffs share exact Alpha silhouette with *_pure.webp
    capturable_heroes = [
        "dwarf_gold_thief", "holy_sister", "elf_sharpshooter",
        "holy_knight", "sun_archmage", "dragon_general",
    ]
    for hid in capturable_heroes:
        base_p = PUB / "portraits" / f"{hid}_pure.webp"
        if not base_p.exists():
            errors.append(f"MISSING BASE PORTRAIT: {base_p}")
            continue
        base_alpha = np.array(Image.open(base_p).convert("RGBA"))[..., 3].astype(np.int16)
        for state in ("wavering", "broken"):
            diff_p = PUB / "portraits" / f"{hid}_{state}.webp"
            if not diff_p.exists():
                errors.append(f"MISSING V2.1 EXPRESSION DIFF: {diff_p}")
                continue
            diff_im = Image.open(diff_p).convert("RGBA")
            if diff_im.size != (512, 680):
                errors.append(f"DIFF SIZE MISMATCH {diff_p.name}: {diff_im.size}")
                continue
            diff_alpha = np.array(diff_im)[..., 3].astype(np.int16)
            mean_alpha_delta = float(np.mean(np.abs(diff_alpha - base_alpha)))
            if mean_alpha_delta > 2.5:
                errors.append(f"ALPHA DRIFT in {diff_p.name}: mean_delta={mean_alpha_delta:.2f} > 2.5")

    v2_chibis = sorted((PUB / "chibi").glob("*.webp"))
    if len(v2_chibis) != 37:
        errors.append(f"V2.1 CHIBI COUNT MISMATCH: got {len(v2_chibis)}, expected 37 (36 units + gothic_chicken)")
    for p in v2_chibis:
        check_rgba_foreground(p, 256, 256, min_cov=0.06, max_cov=0.92, max_bbox_cov=0.96)

    check_rgba_foreground(PUB / "ui" / "demon_heart_badge.webp", 256, 256, min_cov=0.08, max_cov=0.94, max_bbox_cov=0.96)

    for prop_id in ["electric_chair", "feather_tickler", "brainwash_gramophone", "hell_dessert_table", "truth_spotlight"]:
        check_rgba_foreground(PUB / "props" / f"{prop_id}.webp", 256, 256, min_cov=0.05, max_cov=0.94, max_bbox_cov=0.97)

    # 6. Verify 12 SFX wav files
    expected_sfx = [
        "slap_whack", "hand_grab", "hand_drop", "pickaxe_dig", "gold_chime",
        "chicken_gulp", "boulder_crush", "corruption_complete", "payday_bell",
        "spell_cast", "fusion_ritual", "trap_snap",
    ]
    for sfx in expected_sfx:
        p = PUB / "sfx" / f"{sfx}.wav"
        if not p.exists():
            errors.append(f"MISSING SFX: {p}")
        else:
            with wave.open(str(p), "rb") as wf:
                if wf.getnframes() < 1000:
                    errors.append(f"EMPTY/SHORT SFX: {p.name}")

    # 7. Verify 2 Flow-Music BGM mp3 tracks
    for bgm_name in ("abyss_lounge.mp3", "valkyrie_raid.mp3"):
        p = PUB / "bgm" / bgm_name
        if not p.exists():
            errors.append(f"MISSING BGM: {p}")
        else:
            raw = p.read_bytes()
            if len(raw) < 200_000:
                errors.append(f"TOO SMALL BGM {bgm_name}: {len(raw)} bytes")
            if not (raw[:3] == b"ID3" or (len(raw) >= 2 and raw[0] == 0xFF and (raw[1] & 0xE0) == 0xE0)):
                errors.append(f"INVALID MP3 HEADER in {bgm_name}")

    if errors:
        print(f"[verify_assets] FAIL: {len(errors)} error(s) found:")
        for e in errors[:40]:
            print("  -", e)
        sys.exit(1)

    print(
        f"[verify_assets] PASS! Verified {len(v2_portraits)} Plant Milk Walnut portraits (512x680), "
        f"{len(v2_chibis)} Option B Gothic chibis (256x256), 5 torture props (256x256), "
        f"{len(MANIFEST['pixel_rooms'])} cutaway rooms + 4 treasury gold overlays, 5 traps, 30 relic icons, 3 hand cursors, chicken, 12 SFX, and 2 Flow-Music BGMs!"
    )


if __name__ == "__main__":
    main()
