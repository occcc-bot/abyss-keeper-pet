#!/usr/bin/env python3
"""Generate tools/asset_manifest.json with unified dark-gothic anime & pixel prompts."""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "asset_manifest.json"

PORTRAIT_PREFIX = (
    "masterpiece, best quality, dark gothic anime illustration, waist-up portrait, looking at viewer, "
    "solo, simple flat solid dark plum background, chiaroscuro, violet gold rim light"
)
PORTRAIT_NEG = (
    "lowres, bad anatomy, bad hands, text, watermark, blurry, multiple people, "
    "complex background, 3d render, photorealistic, checkerboard, white background"
)

PIXEL_UNIT_PREFIX = (
    "pixel art, 16-bit dark fantasy RPG sprite, cute chibi full body, facing right, solo, "
    "flat solid bright magenta background, simple background, centered"
)
PIXEL_UNIT_NEG = (
    "blurry, realistic, 3d, text, watermark, multiple characters, cropped, complex background, floor, shadow"
)

PIXEL_ROOM_PREFIX = (
    "pixel art, 16-bit dark gothic dungeon interior side-view cutaway, stone arch, torchlight, "
    "empty floor, no characters, no people, no text"
)
PIXEL_ROOM_NEG = (
    "character, girl, monster, hero, person, text, watermark, ui, blurry, 3d"
)

PIXEL_ICON_PREFIX = (
    "pixel art, 16-bit dark gothic RPG item icon, gold and violet, centered, "
    "flat solid bright magenta background, simple background, no text"
)
PIXEL_ICON_NEG = (
    "text, watermark, hand, person, blurry, complex background, frame, 3d"
)

# 36-color "Abyssal Bullfrog" dark gothic pixel palette (HEX)
ABYSSAL_PALETTE = [
    "#140A1C", "#21122E", "#331C47", "#4D2B69", "#724096", "#A464CC",  # Abyssal Obsidian -> Violet
    "#1A141E", "#2E2533", "#4A3F52", "#6E6278", "#9B90A6", "#D6CEDE",  # Cold Gothic Stone / Steel
    "#2A0B16", "#541326", "#8A1C3B", "#C42B4F", "#F05674", "#FFA3B5",  # Blood Moon Crimson -> Rose
    "#331D0B", "#633A14", "#9E631E", "#CF932E", "#F2C655", "#FFF0B3",  # Antique Gold / Torchlight
    "#0D2621", "#184A3E", "#287A62", "#42B58C", "#82E8BA",             # Emerald Slime / Venom
    "#0E1C36", "#1C3B6E", "#2F66AD", "#59A3E8", "#AEE1FF",             # Frost Rune / Mana Blue
    "#F5D6C6", "#D9A896",                                               # Anime Skin Highlights
]

PORTRAITS = [
    ("lilith_overlord", "1girl, demon queen overlord Lilith, long flowing silver-crimson hair, curved obsidian demon horns, glowing ruby eyes, regal black and gold gothic velvet dress, bat wings, seductive confident smirk, holding blood-red wine chalice", 1001),
    ("elizabeth_overlord", "1girl, gothic vampire necromancer queen Elizabeth, twin-braided pale lavender hair, crown of blood-red thorns, piercing crimson eyes, dark Victorian lace and black iron armor, floating spectral roses, haughty aristocratic smile", 1002),
    ("imp", "1boy, mischievous cute goblin imp servant, pointed ears, tiny horns, tattered dark leather vest, glowing yellow eyes, holding tiny golden pickaxe over shoulder, cheeky chaotic grin, dark fantasy mascot", 1003),
    ("slime_girl", "1girl, adorable translucent emerald-green slime monster girl, glossy jelly hair with floating bubbles, emerald eyes, dark gothic maid ribbon collar, shy blushing smile, soft glowing green slime droplets", 1004),
    ("skeleton_blademaid", "1girl, gothic undead skeleton blademaid, pale porcelain skin, skull hairpins, white bob hair, glowing violet eyes, black gothic maid dress with bone-rib corset, holding cursed katana blade, tsundere sharp gaze", 1005),
    ("imp_witch", "1girl, energetic little demon witch apprentice, oversized crooked pointed black witch hat with gold buckle, small bat wings, purple twin-tails, amber eyes, holding glowing violet spellbook, cheerful grin", 1006),
    ("hellforge_smith", "1girl, dark fantasy dwarf demon blacksmith girl, fiery auburn braided hair, soot-smudged cheek, glowing ember eyes, heavy black iron leather apron and gauntlets, resting massive glowing rune warhammer on shoulder", 1007),
    ("crimson_succubus", "1girl, high-tier crimson succubus butler maiden, sleek burgundy hair, curved black horns, heart-tipped tail, black gothic tuxedo-corset with crimson lace, holding ornate leather whip, teasing dominant gaze", 1008),
    ("necro_cantor", "1girl, ethereal necromancer singer maiden, long midnight-blue hair, veiled gothic crown, pale luminous eyes, tattered black cathedral robe with glowing cyan ghost flames orbiting her, solemn haunting beauty", 1009),
    ("obsidian_dragonmaid", "1girl, armored obsidian dragon girl, black crystalline dragon horns and scaled tail, fiery golden dragon eyes, heavy obsidian and gold knight-maid plate armor, glowing magma embers around gauntlets, fierce proud expression", 1010),
    ("arachne_weaver", "1girl, alluring dark arachne spider queen girl, silky jet-black hair with spider-web lace veil, multiple glowing amethyst eyes motif on hairpiece, dark purple kimono-gothic dress, shimmering toxic violet silk threads", 1011),
    ("fallen_paladin", "1girl, corrupted fallen paladin knight woman, long platinum-violet hair, shattered dark-gold halo, glowing crimson eyes, blackened gothic plate armor with purple abyssal runes, gripping dark greatsword, conflicted fierce blush", 1012),
    ("corrupted_sister", "1girl, corrupted dark gothic nun woman, black and violet lace habit veil, inverted antique gold cross necklace, flushed cheeks, ecstatic glowing violet eyes, clasping forbidden grimoire, dark alluring aura", 1013),
    ("abyssal_ranger", "1girl, corrupted dark elf shadow archer woman, long pointed elf ears, silver-black hair, hood draped over shoulders, glowing purple eyes, dark obsidian leather ranger armor, drawing cursed shadow crescent bow", 1014),
    ("holy_knight_pure", "1girl, righteous holy paladin knight woman, radiant golden hair in high ponytail, sapphire blue eyes, gleaming silver-and-white sacred plate armor, blue cape, noble determined expression, holding holy broadsword", 1015),
    ("holy_sister_pure", "1girl, pure holy cathedral nun woman, gentle brown hair under white-and-gold veil, warm amber eyes, pristine white clerical vestments with golden trim, clasping praying hands with faint golden halo light", 1016),
    ("elf_sharpshooter_pure", "1girl, noble forest elf archer woman, long blonde hair, pointed ears, emerald green eyes, silver-and-forest-green ranger cloak and filigree light armor, holding ornate ivory longbow, sharp focused gaze", 1017),
    ("lord_inquisitor", "1boy, imposing golden armored grand inquisitor boss paladin, stern scarred face, ornate winged crusader helm under arm, glowing holy aura, heavy white-and-gold cathedral plate armor, huge radiant warhammer", 1018),
    ("dwarf_gold_thief", "1boy, stout cheeky dwarf treasure hunter rogue, thick braided orange beard, dark leather hood, monocle, overflowing sack of gold coins slung over back, mischievous greedy grin", 1019),
    ("novice_adventurer", "1boy, young eager rookie adventurer swordsman, messy brown hair, simple leather tunic over chainmail, iron shortsword and wooden buckler shield, earnest brave expression", 1020),
]

PIXEL_UNITS = [
    ("lilith_overlord", "chibi demon queen girl, crimson hair, horns, black gold gown, bat wings, floating dark orb", 2001),
    ("elizabeth_overlord", "chibi vampire gothic princess, lavender hair, crimson thorn crown, black dress, blood roses", 2002),
    ("imp", "chibi mischievous purple goblin imp worker carrying shiny gold pickaxe, tiny horns", 2003),
    ("slime_girl", "chibi cute green slime monster girl with gothic bow, round bouncy jelly skirt", 2004),
    ("skeleton_blademaid", "chibi gothic undead maid girl holding glowing silver katana sword, white hair", 2005),
    ("imp_witch", "chibi little demon witch girl wearing big pointed purple hat holding glowing magic staff", 2006),
    ("hellforge_smith", "chibi red-haired dwarf smith girl holding giant glowing forge hammer, black apron", 2007),
    ("crimson_succubus", "chibi crimson succubus girl with bat wings and black whip, dark red gothic outfit", 2008),
    ("necro_cantor", "chibi necromancer ghost maiden in dark cloak surrounded by blue spirit flames", 2009),
    ("obsidian_dragonmaid", "chibi black armored dragon girl with dragon horns, tail, and fiery greatshield", 2010),
    ("arachne_weaver", "chibi dark purple spider queen girl with dark spider legs behind back and glowing web", 2011),
    ("fallen_paladin", "chibi dark fallen knight girl in black-and-gold armor holding glowing purple greatsword", 2012),
    ("corrupted_sister", "chibi dark corrupted nun girl in black-violet habit holding glowing cursed staff", 2013),
    ("abyssal_ranger", "chibi dark shadow elf archer girl in purple cloak drawing glowing violet bow", 2014),
    ("novice_adventurer", "chibi rookie hero boy in brown tunic with iron sword and wooden shield", 2015),
    ("dwarf_gold_thief", "chibi bearded dwarf thief rogue carrying big yellow sack of gold coins", 2016),
    ("holy_sister", "chibi pure white-robed holy nun girl holding golden healing staff", 2017),
    ("elf_sharpshooter", "chibi green-cloaked forest elf archer girl aiming golden bow", 2018),
    ("holy_knight", "chibi silver-armored female paladin knight with golden hair, shield and broadsword", 2019),
    ("lord_inquisitor", "chibi giant golden-armored boss inquisitor knight with winged helmet and huge holy hammer", 2020),
]

PIXEL_ROOMS = [
    ("throne", "grand dark gothic overlord throne hall, obsidian carved throne with glowing crimson abyssal heart crystal behind it, velvet purple banners, twin flickering braziers", 3001),
    ("treasury", "dark stone subterranean dungeon treasury vault, iron-banded wooden chests, stone pedestals, torchlit gothic arches, scattered gold coin glints", 3002),
    ("hatchery", "subterranean dungeon hatchery barn, dark wooden fences, straw nests on stone tiles, warm cozy lantern glow, eggshells, gothic stone arch", 3003),
    ("training", "dark gothic dungeon training dojo, wooden combat training dummies, weapon racks with swords and halberds, iron chains, torchlit stone bricks", 3004),
    ("library", "forbidden dark gothic arcane library, towering dark oak bookshelves filled with ancient leather grimoires, glowing violet rune lectern, floating candles", 3005),
    ("workshop", "subterranean hellforge workshop, glowing orange lava furnace anvil, giant iron gears and sawblades hanging on stone wall, hammer bench", 3006),
    ("corruption", "dark gothic succubus arcane interrogation chamber, glowing violet magic circle on stone floor, antique velvet drapery, glowing purple rune restraint frame, flickering candles", 3007),
    ("altar", "abyssal fusion ritual altar room, ornate obsidian stone pedestal with glowing purple-and-gold runic circle, twin summoning obelisks, mystical mist", 3008),
    ("corridor", "dark gothic dungeon defense corridor hallway, weathered dungeon stone brick archways, iron wall sconce torches, skull relief keystone, battle-worn floor", 3009),
    ("rock_vein", "solid unmined dark subterranean basalt rock wall embedded with gleaming thick veins of raw gold ore and purple crystal shards, rough cavern stone", 3010),
]

PIXEL_TRAPS = [
    ("iron_spikes", "deadly dark iron floor spike trap mechanism with metallic sharp spikes", 4001),
    ("boulder_trap", "massive carved dark stone dungeon rolling boulder sphere with glowing purple runes", 4002),
    ("charm_censer", "ornate antique gold gothic incense censer emitting swirling pink-violet mist", 4003),
    ("frost_rune", "glowing icy cyan crystalline frost magic trap rune plate", 4004),
    ("hell_spring", "heavy iron dungeon coil spring launch pad plate with fiery orange trim", 4005),
]

PIXEL_EXTRAS = [
    ("chicken", "cute plump white-and-brown pixel art dungeon farm chicken walking right, red comb", 4101),
    ("hand_hover", "evil gothic skeletal obsidian claw hand cursor pointing open with purple magic aura", 4102),
    ("hand_grab", "evil gothic skeletal obsidian claw hand cursor clenched tightly grabbing with gold sparks", 4103),
    ("hand_slap", "evil gothic skeletal obsidian claw hand swinging sideways slap motion with crimson impact lines", 4104),
]

PIXEL_RELICS = [
    ("bullfrog_pocket_watch", "antique ornate golden clockwork pocket watch with tiny emerald frog emblem", 5001),
    ("succubus_lace_blindfold", "black gothic silk lace blindfold with crimson ribbon and gold charm", 5002),
    ("unbreakable_spike_gear", "sharp dark iron spiked cogwheel gear glowing red hot", 5003),
    ("abyssal_gold_chalice", "ornate golden goblet chalice overflowing with ruby abyssal liquid", 5004),
    ("obsidian_slap_glove", "spiked obsidian armored gauntlet glove crackling with red energy", 5005),
    ("roast_chicken_bell", "tiny antique gold dinner bell topped with miniature golden chicken crest", 5006),
    ("blood_moon_pendant", "crescent crimson ruby amulet pendant set in dark silver", 5007),
    ("thorn_crown_shard", "jagged piece of dark iron thorny crown dripping glowing crimson light", 5008),
    ("imp_overtime_whip", "coiled dark leather riding crop whip with gold handle", 5009),
    ("boulder_grease_barrel", "miniature iron-banded wooden barrel oozing shiny black oil", 5010),
    ("frost_core_prism", "floating faceted ice-blue crystal prism radiating cold frost", 5011),
    ("spring_coil_blueprint", "rolled parchment scroll showing golden mechanical spring coil diagram", 5012),
    ("forbidden_grimoire_page", "glowing violet runic parchment page torn from dark spellbook", 5013),
    ("corrupted_rosary", "dark obsidian bead rosary necklace with inverted antique gold cross", 5014),
    ("dragonscale_pauldron", "black obsidian dragon scale armored shoulder pauldron with gold trim", 5015),
    ("arachne_venom_vial", "gothic glass potion flask filled with glowing neon-green spider venom", 5016),
    ("altar_resonance_stone", "octahedral purple amethyst runestone encircled by gold halo ring", 5017),
    ("greedy_goblin_coin", "gleaming oversized antique gold coin stamped with horned skull", 5018),
    ("mana_siphon_crystal", "cluster of glowing bright indigo-violet mana crystals", 5019),
    ("shadow_whetstone", "dark obsidian sharpening stone emitting purple ghostly sparks", 5020),
    ("dungeon_heart_aegis", "miniature gothic kite shield inlaid with glowing crimson heart gem", 5021),
    ("payday_tax_ledger", "thick black leather accounting ledger book clasped with gold lock", 5022),
    ("crimson_velvet_choker", "crimson velvet gothic collar choker with small golden bell", 5023),
    ("soul_shackle_chain", "glowing purple spectral chain links attached to dark gold manacle", 5024),
    ("hellforge_bellows", "black iron and red leather forge bellows puffing orange sparks", 5025),
    ("eclipse_hourglass", "antique dark-gold hourglass filled with glowing violet black sand", 5026),
    ("vampiric_fang_brooch", "ornate silver bat-wing brooch set with twin white vampire fangs", 5027),
    ("skeleton_metronome", "gothic miniature bone-and-brass ticking metronome", 5028),
    ("emerald_slime_gel", "crystal jar filled with luminous bouncing emerald slime gel", 5029),
    ("overlord_signet_ring", "royal black-gold signet ring crowned with faceted crimson abyss gem", 5030),
]

manifest = {
    "version": 1,
    "portrait_model": "cagliostrolab/animagine-xl-3.1",
    "pixel_lora": "nerijs/pixel-art-xl",
    "matting_model": "ZhengPeng7/BiRefNet",
    "palette": ABYSSAL_PALETTE,
    "prompts": {
        "portrait_prefix": PORTRAIT_PREFIX,
        "portrait_neg": PORTRAIT_NEG,
        "pixel_unit_prefix": PIXEL_UNIT_PREFIX,
        "pixel_unit_neg": PIXEL_UNIT_NEG,
        "pixel_room_prefix": PIXEL_ROOM_PREFIX,
        "pixel_room_neg": PIXEL_ROOM_NEG,
        "pixel_icon_prefix": PIXEL_ICON_PREFIX,
        "pixel_icon_neg": PIXEL_ICON_NEG,
    },
    "portraits": [{"id": k, "prompt": p, "seed": s} for k, p, s in PORTRAITS],
    "pixel_units": [{"id": k, "prompt": p, "seed": s} for k, p, s in PIXEL_UNITS],
    "pixel_rooms": [{"id": k, "prompt": p, "seed": s} for k, p, s in PIXEL_ROOMS],
    "pixel_traps": [{"id": k, "prompt": p, "seed": s} for k, p, s in PIXEL_TRAPS],
    "pixel_extras": [{"id": k, "prompt": p, "seed": s} for k, p, s in PIXEL_EXTRAS],
    "pixel_relics": [{"id": k, "prompt": p, "seed": s} for k, p, s in PIXEL_RELICS],
}

OUT.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(
    f"[build_manifest] Wrote {OUT}: "
    f"{len(PORTRAITS)} portraits, {len(PIXEL_UNITS)} units, {len(PIXEL_ROOMS)} rooms, "
    f"{len(PIXEL_TRAPS)} traps, {len(PIXEL_EXTRAS)} extras, {len(PIXEL_RELICS)} relics"
)
