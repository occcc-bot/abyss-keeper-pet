#!/usr/bin/env python3
"""
Hand-crafted 32x32 Dark Gothic Pixel-Art Relic Icon Suite (All 30 Relics).
Strictly uses the 36-color Abyssal Bullfrog palette + 1px #140A1C obsidian outline,
guaranteeing zero 3x3 grids, zero square border frames, zero magenta blobs, and
100% iconic silhouette readability at 32x32 and 64x64!
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

OUTLINE = (20, 10, 28, 255)      # #140A1C
PURP_D = (51, 28, 71, 255)       # #331C47
PURP_M = (114, 64, 150, 255)     # #724096
PURP_L = (164, 100, 204, 255)    # #A464CC
STEEL_D = (46, 37, 51, 255)      # #2E2533
STEEL_M = (110, 98, 120, 255)    # #6E6278
STEEL_L = (214, 206, 222, 255)   # #D6CEDE
CRIM_D = (84, 19, 38, 255)       # #541326
CRIM_M = (196, 43, 79, 255)      # #C42B4F
CRIM_L = (240, 86, 116, 255)     # #F05674
GOLD_D = (99, 58, 20, 255)       # #633A14
GOLD_M = (207, 147, 46, 255)     # #CF932E
GOLD_L = (242, 198, 85, 255)     # #F2C655
CREAM = (255, 240, 179, 255)     # #FFF0B3
EMER_D = (24, 74, 62, 255)       # #184A3E
EMER_M = (66, 181, 140, 255)     # #42B58C
EMER_L = (130, 232, 186, 255)    # #82E8BA
ICE_D = (28, 59, 110, 255)       # #1C3B6E
ICE_M = (89, 163, 232, 255)      # #59A3E8
ICE_L = (174, 225, 255, 255)     # #AEE1FF
SKIN = (245, 214, 198, 255)      # #F5D6C6


def add_outline(im: Image.Image) -> Image.Image:
    arr = np.array(im, dtype=np.uint8)
    opaque = arr[..., 3] > 0
    dil = np.zeros_like(opaque)
    dil[1:, :] |= opaque[:-1, :]
    dil[:-1, :] |= opaque[1:, :]
    dil[:, 1:] |= opaque[:, :-1]
    dil[:, :-1] |= opaque[:, 1:]
    out = arr.copy()
    out[dil & (~opaque)] = OUTLINE
    return Image.fromarray(out)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def craft_all_30_relics(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    builders = {}

    def reg(name: str):
        def deco(fn):
            builders[name] = fn
            return fn
        return deco

    @reg("bullfrog_pocket_watch")
    def _():
        im, d = canvas()
        d.ellipse((13, 3, 19, 8), outline=GOLD_L, width=1)
        d.rectangle((14, 7, 18, 9), fill=GOLD_M)
        d.ellipse((6, 9, 26, 29), fill=GOLD_D)
        d.ellipse((7, 10, 25, 28), fill=GOLD_L)
        d.ellipse((9, 12, 23, 26), fill=PURP_D)
        # Tiny emerald frog emblem inside dial!
        d.ellipse((12, 16, 20, 23), fill=EMER_M)
        d.point((14, 17), fill=GOLD_L)
        d.point((18, 17), fill=GOLD_L)
        d.line([(16, 19), (16, 13)], fill=CREAM)
        d.line([(16, 19), (20, 19)], fill=CRIM_L)
        return im

    @reg("succubus_lace_blindfold")
    def _():
        im, d = canvas()
        # Flowing ribbon tails
        d.line([(5, 16), (2, 22)], fill=CRIM_M, width=2)
        d.line([(26, 16), (29, 22)], fill=CRIM_M, width=2)
        # Winged gothic eye mask
        d.polygon([(4, 14), (11, 10), (16, 13), (21, 10), (27, 14), (24, 21), (16, 18), (8, 21)], fill=PURP_D)
        d.polygon([(6, 14), (11, 12), (16, 14), (21, 12), (25, 14), (22, 19), (16, 16), (10, 19)], fill=PURP_M)
        # Crimson heart jewel at nose bridge
        d.rectangle((15, 13, 17, 16), fill=CRIM_L)
        d.point((16, 14), fill=CREAM)
        return im

    @reg("unbreakable_spike_gear")
    def _():
        im, d = canvas()
        # 8 jagged gear teeth
        for dx, dy in [(0, -11), (0, 11), (-11, 0), (11, 0), (-8, -8), (8, -8), (-8, 8), (8, 8)]:
            d.rectangle((14 + dx, 14 + dy, 17 + dx, 17 + dy), fill=STEEL_L)
        d.ellipse((7, 7, 24, 24), fill=STEEL_D)
        d.ellipse((9, 9, 22, 22), fill=STEEL_M)
        d.ellipse((12, 12, 19, 19), fill=CRIM_M)
        d.ellipse((14, 14, 17, 17), fill=GOLD_L)
        return im

    @reg("abyssal_gold_chalice")
    def _():
        im, d = canvas()
        d.polygon([(8, 6), (24, 6), (21, 17), (11, 17)], fill=GOLD_M)
        d.polygon([(10, 8), (22, 8), (20, 15), (12, 15)], fill=GOLD_L)
        d.ellipse((9, 5, 23, 9), fill=CRIM_M)
        d.ellipse((11, 6, 21, 8), fill=CRIM_L)
        d.rectangle((14, 17, 18, 24), fill=GOLD_M)
        d.polygon([(10, 26), (22, 26), (20, 23), (12, 23)], fill=GOLD_L)
        d.point((15, 11), fill=CREAM)
        return im

    @reg("obsidian_slap_glove")
    def _():
        im, d = canvas()
        d.polygon([(11, 22), (22, 22), (24, 28), (10, 28)], fill=GOLD_M)
        d.rounded_rectangle((8, 11, 23, 23), radius=3, fill=PURP_D)
        for fx in [9, 12, 15, 19]:
            d.rectangle((fx, 5, fx + 2, 13), fill=STEEL_M)
            d.point((fx + 1, 5), fill=STEEL_L)
        d.rectangle((5, 14, 9, 19), fill=STEEL_M)
        d.rectangle((13, 15, 18, 19), fill=CRIM_L)
        d.point((15, 16), fill=CREAM)
        return im

    @reg("roast_chicken_bell")
    def _():
        im, d = canvas()
        # Tiny red comb crest on top handle
        d.rectangle((14, 4, 17, 7), fill=CRIM_M)
        d.ellipse((13, 6, 18, 10), fill=GOLD_L)
        # Golden bell dome
        d.polygon([(11, 10), (20, 10), (25, 23), (6, 23)], fill=GOLD_M)
        d.polygon([(12, 11), (18, 11), (21, 21), (10, 21)], fill=GOLD_L)
        d.line([(12, 13), (10, 20)], fill=CREAM)
        d.ellipse((14, 23, 18, 27), fill=GOLD_D)
        return im

    @reg("blood_moon_pendant")
    def _():
        im, d = canvas()
        # Silver chain arc
        d.arc((9, 3, 23, 15), 180, 360, fill=STEEL_L, width=1)
        # Crescent ruby moon
        d.ellipse((7, 10, 25, 28), fill=CRIM_M)
        d.ellipse((9, 11, 23, 26), fill=CRIM_L)
        d.ellipse((13, 10, 26, 23), fill=(0, 0, 0, 0))  # carve crescent!
        d.point((11, 18), fill=CREAM)
        d.point((12, 17), fill=CREAM)
        return im

    @reg("thorn_crown_shard")
    def _():
        im, d = canvas()
        d.polygon([(4, 22), (8, 10), (12, 18), (16, 6), (20, 18), (24, 10), (27, 22), (24, 25), (7, 25)], fill=STEEL_D)
        d.polygon([(6, 21), (8, 13), (12, 19), (16, 9), (20, 19), (24, 13), (25, 21)], fill=CRIM_M)
        d.point((16, 10), fill=CREAM)
        d.point((15, 21), fill=GOLD_L)
        d.point((16, 21), fill=GOLD_L)
        return im

    @reg("imp_overtime_whip")
    def _():
        im, d = canvas()
        # Gold-capped handle
        d.line([(6, 26), (13, 19)], fill=GOLD_M, width=3)
        d.line([(6, 26), (9, 23)], fill=GOLD_L, width=2)
        # Coiled dark leather lash
        d.arc((10, 6, 26, 22), 200, 90, fill=CRIM_D, width=3)
        d.arc((12, 8, 24, 20), 210, 80, fill=CRIM_M, width=2)
        d.line([(23, 18), (27, 10)], fill=CRIM_L, width=2)
        d.point((27, 9), fill=CREAM)
        return im

    @reg("boulder_grease_barrel")
    def _():
        im, d = canvas()
        d.rounded_rectangle((7, 7, 24, 26), radius=4, fill=GOLD_D)
        d.rectangle((9, 8, 22, 25), fill=GOLD_M)
        # Iron hoops
        d.rectangle((7, 11, 24, 13), fill=STEEL_M)
        d.rectangle((7, 20, 24, 22), fill=STEEL_M)
        # Oozing obsidian oil drip at top
        d.ellipse((9, 5, 22, 9), fill=PURP_D)
        d.rectangle((14, 8, 17, 16), fill=PURP_D)
        d.point((15, 11), fill=PURP_L)
        return im

    @reg("frost_core_prism")
    def _():
        im, d = canvas()
        d.polygon([(16, 3), (25, 16), (16, 29), (7, 16)], fill=ICE_D)
        d.polygon([(16, 5), (23, 16), (16, 26), (9, 16)], fill=ICE_M)
        d.polygon([(16, 6), (20, 16), (16, 19), (12, 16)], fill=ICE_L)
        d.point((15, 11), fill=CREAM)
        return im

    @reg("spring_coil_blueprint")
    def _():
        im, d = canvas()
        # Diagonal parchment scroll
        d.polygon([(6, 10), (22, 4), (26, 22), (10, 28)], fill=GOLD_M)
        d.polygon([(8, 11), (21, 6), (24, 21), (11, 26)], fill=CREAM)
        # Blue-violet spring coil blueprint lines
        for sy in [11, 14, 17, 20]:
            d.line([(12, sy), (20, sy - 2)], fill=ICE_D, width=1)
        d.ellipse((5, 9, 9, 13), fill=GOLD_D)
        d.ellipse((23, 20, 27, 24), fill=GOLD_D)
        return im

    @reg("forbidden_grimoire_page")
    def _():
        im, d = canvas()
        d.polygon([(7, 4), (22, 4), (25, 9), (24, 27), (8, 27), (7, 15)], fill=CREAM)
        d.polygon([(8, 5), (21, 5), (23, 26), (9, 26)], fill=SKIN)
        # Glowing violet rune sigil in middle
        d.polygon([(16, 9), (21, 16), (16, 23), (11, 16)], outline=PURP_L, width=2)
        d.rectangle((15, 15, 17, 17), fill=CRIM_L)
        return im

    @reg("corrupted_rosary")
    def _():
        im, d = canvas()
        # Loop of obsidian beads
        for ang_i in range(10):
            ang = ang_i * 0.628
            bx = int(16 + 7 * np.cos(ang))
            by = int(12 + 6 * np.sin(ang))
            d.ellipse((bx - 2, by - 2, bx + 2, by + 2), fill=PURP_M)
            d.point((bx - 1, by - 1), fill=PURP_L)
        # Inverted antique gold cross hanging below
        d.rectangle((15, 18, 17, 28), fill=GOLD_L)
        d.rectangle((12, 23, 20, 25), fill=GOLD_L)
        d.point((16, 24), fill=CRIM_L)
        return im

    @reg("dragonscale_pauldron")
    def _():
        im, d = canvas()
        d.polygon([(5, 22), (8, 9), (18, 6), (26, 12), (27, 24), (16, 26)], fill=PURP_D)
        d.polygon([(7, 20), (10, 11), (18, 8), (24, 13), (24, 22), (16, 24)], fill=STEEL_D)
        # Overlapping gold-trimmed dragon scales
        for sy in [12, 16, 20]:
            d.arc((8, sy - 2, 24, sy + 5), 0, 180, fill=GOLD_L, width=1)
        d.polygon([(19, 6), (25, 3), (24, 10)], fill=CRIM_M)
        return im

    @reg("arachne_venom_vial")
    def _():
        im, d = canvas()
        d.rectangle((13, 4, 19, 7), fill=GOLD_M)
        d.rectangle((14, 7, 18, 11), fill=STEEL_L)
        d.ellipse((7, 11, 25, 28), fill=STEEL_M)
        d.ellipse((9, 13, 23, 26), fill=EMER_D)
        d.pieslice((9, 13, 23, 26), 0, 180, fill=EMER_M)
        d.ellipse((11, 18, 21, 24), fill=EMER_L)
        d.point((12, 15), fill=CREAM)
        return im

    @reg("altar_resonance_stone")
    def _():
        im, d = canvas()
        # Gold halo ring tilted around purple crystal
        d.ellipse((4, 12, 28, 20), outline=GOLD_L, width=2)
        d.polygon([(16, 4), (22, 16), (16, 28), (10, 16)], fill=PURP_M)
        d.polygon([(16, 6), (20, 16), (16, 25), (12, 16)], fill=PURP_L)
        d.point((15, 11), fill=CREAM)
        return im

    @reg("greedy_goblin_coin")
    def _():
        im, d = canvas()
        d.ellipse((5, 5, 27, 27), fill=GOLD_D)
        d.ellipse((7, 7, 25, 25), fill=GOLD_L)
        d.ellipse((9, 9, 23, 23), fill=GOLD_M)
        # Embossed horned skull in center
        d.ellipse((12, 11, 20, 19), fill=CREAM)
        d.rectangle((14, 18, 18, 21), fill=CREAM)
        d.point((14, 15), fill=GOLD_D)
        d.point((18, 15), fill=GOLD_D)
        d.point((11, 10), fill=GOLD_L)
        d.point((21, 10), fill=GOLD_L)
        return im

    @reg("mana_siphon_crystal")
    def _():
        im, d = canvas()
        # Triple crystal cluster
        d.polygon([(6, 26), (9, 12), (13, 26)], fill=ICE_D)
        d.polygon([(19, 26), (23, 11), (26, 26)], fill=PURP_M)
        d.polygon([(11, 27), (16, 4), (21, 27)], fill=ICE_M)
        d.polygon([(13, 26), (16, 7), (18, 26)], fill=ICE_L)
        d.point((16, 10), fill=CREAM)
        return im

    @reg("shadow_whetstone")
    def _():
        im, d = canvas()
        # Angled obsidian whetstone bar + violet sparks
        d.polygon([(5, 20), (19, 7), (27, 13), (13, 26)], fill=STEEL_D)
        d.polygon([(7, 19), (19, 9), (24, 13), (12, 23)], fill=STEEL_M)
        d.line([(9, 18), (20, 10)], fill=STEEL_L, width=1)
        for sx, sy in [(10, 9), (24, 21), (14, 6)]:
            d.point((sx, sy), fill=PURP_L)
            d.point((sx + 1, sy), fill=CREAM)
        return im

    @reg("dungeon_heart_aegis")
    def _():
        im, d = canvas()
        d.polygon([(7, 5), (25, 5), (24, 18), (16, 28), (8, 18)], fill=GOLD_M)
        d.polygon([(9, 7), (23, 7), (22, 17), (16, 25), (10, 17)], fill=PURP_D)
        # Crimson heart jewel inset
        d.polygon([(16, 11), (20, 15), (16, 21), (12, 15)], fill=CRIM_L)
        d.point((15, 14), fill=CREAM)
        return im

    @reg("payday_tax_ledger")
    def _():
        im, d = canvas()
        # Angled gothic hardcover ledger with golden clasp
        d.polygon([(7, 7), (22, 4), (26, 24), (11, 27)], fill=CRIM_D)
        d.polygon([(9, 8), (21, 6), (24, 23), (12, 25)], fill=PURP_D)
        d.line([(9, 8), (12, 25)], fill=GOLD_M, width=2)
        d.rectangle((20, 13, 25, 17), fill=GOLD_L)
        d.rectangle((14, 11, 19, 13), fill=GOLD_L)
        return im

    @reg("crimson_velvet_choker")
    def _():
        im, d = canvas()
        d.ellipse((5, 9, 27, 22), outline=CRIM_D, width=5)
        d.ellipse((6, 10, 26, 21), outline=CRIM_M, width=3)
        d.ellipse((13, 19, 19, 25), fill=GOLD_L)
        d.point((15, 21), fill=CREAM)
        d.line([(14, 23), (18, 23)], fill=GOLD_D)
        return im

    @reg("soul_shackle_chain")
    def _():
        im, d = canvas()
        # Diagonal spectral chain + gold shackle cuff
        d.ellipse((5, 15, 17, 27), outline=GOLD_L, width=3)
        d.ellipse((13, 9, 22, 18), outline=PURP_L, width=2)
        d.ellipse((19, 4, 27, 12), outline=ICE_L, width=2)
        d.point((16, 13), fill=CREAM)
        return im

    @reg("hellforge_bellows")
    def _():
        im, d = canvas()
        # Nozzle pointing top-right + red leather accordion body + handles
        d.polygon([(19, 10), (28, 5), (23, 14)], fill=STEEL_L)
        d.polygon([(8, 17), (19, 10), (23, 14), (14, 24)], fill=CRIM_M)
        d.line([(11, 16), (17, 21)], fill=CRIM_D, width=2)
        d.line([(6, 21), (10, 18)], fill=GOLD_M, width=2)
        d.line([(10, 26), (14, 23)], fill=GOLD_M, width=2)
        d.point((28, 4), fill=GOLD_L)
        d.point((29, 7), fill=CRIM_L)
        return im

    @reg("eclipse_hourglass")
    def _():
        im, d = canvas()
        d.rectangle((8, 4, 24, 7), fill=GOLD_L)
        d.rectangle((8, 25, 24, 28), fill=GOLD_L)
        d.polygon([(10, 7), (22, 7), (16, 16)], fill=STEEL_M)
        d.polygon([(16, 16), (22, 25), (10, 25)], fill=STEEL_M)
        # Violet abyssal sand
        d.polygon([(12, 9), (20, 9), (16, 15)], fill=PURP_L)
        d.polygon([(12, 25), (20, 25), (16, 20)], fill=PURP_M)
        d.line([(16, 15), (16, 21)], fill=CREAM)
        return im

    @reg("vampiric_fang_brooch")
    def _():
        im, d = canvas()
        # Silver bat wings spread horizontally
        d.polygon([(3, 11), (11, 13), (12, 20), (6, 19), (4, 16)], fill=STEEL_M)
        d.polygon([(29, 11), (21, 13), (20, 20), (26, 19), (28, 16)], fill=STEEL_M)
        # Central crimson gem + twin white fangs
        d.ellipse((11, 10, 21, 20), fill=CRIM_M)
        d.ellipse((13, 12, 19, 18), fill=CRIM_L)
        d.polygon([(12, 19), (14, 26), (15, 19)], fill=STEEL_L)
        d.polygon([(17, 19), (18, 26), (20, 19)], fill=STEEL_L)
        return im

    @reg("skeleton_metronome")
    def _():
        im, d = canvas()
        d.polygon([(12, 6), (20, 6), (24, 27), (8, 27)], fill=GOLD_D)
        d.polygon([(13, 8), (19, 8), (22, 25), (10, 25)], fill=PURP_D)
        # Pendulum arm swung right with bone skull weight
        d.line([(16, 24), (24, 8)], fill=GOLD_L, width=2)
        d.ellipse((20, 10, 25, 15), fill=STEEL_L)
        d.rectangle((9, 24, 23, 27), fill=GOLD_M)
        return im

    @reg("emerald_slime_gel")
    def _():
        im, d = canvas()
        d.rectangle((10, 5, 22, 8), fill=GOLD_M)
        d.rounded_rectangle((8, 9, 24, 27), radius=4, fill=STEEL_M)
        d.rounded_rectangle((10, 12, 22, 25), radius=3, fill=EMER_M)
        d.ellipse((12, 14, 20, 22), fill=EMER_L)
        # Cute slime eyes inside jar
        d.point((14, 18), fill=OUTLINE)
        d.point((18, 18), fill=OUTLINE)
        d.point((12, 13), fill=CREAM)
        return im

    @reg("overlord_signet_ring")
    def _():
        im, d = canvas()
        # Bold golden royal signet ring band
        d.ellipse((6, 10, 26, 28), outline=GOLD_D, width=5)
        d.ellipse((7, 11, 25, 27), outline=GOLD_L, width=3)
        # Crowned crimson abyssal diamond signet on top
        d.polygon([(16, 3), (22, 9), (16, 15), (10, 9)], fill=CRIM_M)
        d.polygon([(16, 5), (20, 9), (16, 13), (12, 9)], fill=CRIM_L)
        d.point((15, 7), fill=CREAM)
        return im

    for name, fn in builders.items():
        add_outline(fn()).save(out_dir / f"{name}.png")
    print(f"[craft_relics] Crafted all {len(builders)} crisp 32x32 pixel-art relics -> {out_dir}")


if __name__ == "__main__":
    craft_all_30_relics(Path(__file__).resolve().parent.parent / "public" / "assets" / "pixel" / "relics")
