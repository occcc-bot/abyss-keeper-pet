import { Assets, Spritesheet, Texture, type TextureSource } from 'pixi.js';
import {
  ABYSSAL_UNIT_DEFS,
  HERO_DEFS,
  OVERLORD_DEFS,
  TORTURE_IMPLEMENT_LIST,
  type RoomType,
  type TortureImplementId,
  type TrapType,
} from '../core';

export interface LoadedGameAssets {
  unitsSheet: Spritesheet;
  chibis: Record<string, Texture>;
  props: Partial<Record<TortureImplementId, Texture>>;
  rooms: Record<RoomType, Texture>;
  treasuryGold: [Texture, Texture, Texture, Texture];
  traps: Record<TrapType, Texture>;
  chicken: Texture;
  chickenIsHighRes: boolean;
  cursors: {
    hover: Texture;
    grab: Texture;
    slap: Texture;
  };
}

function forceNearest(tex: Texture): Texture {
  const src: TextureSource = tex.source;
  src.scaleMode = 'nearest';
  return tex;
}

function forceLinear(tex: Texture): Texture {
  const src: TextureSource = tex.source;
  src.scaleMode = 'linear';
  return tex;
}

async function tryLoadTexture(url: string): Promise<Texture | null> {
  try {
    const tex = (await Assets.load(url)) as Texture;
    return forceLinear(tex);
  } catch {
    return null;
  }
}

const ROOM_KEYS: readonly RoomType[] = [
  'throne',
  'treasury',
  'hatchery',
  'training',
  'library',
  'workshop',
  'prison',
  'corruption',
  'altar',
  'corridor',
  'rock_vein',
];

const TRAP_KEYS: readonly TrapType[] = [
  'iron_spikes',
  'boulder_trap',
  'charm_censer',
  'frost_rune',
  'hell_spring',
];

export async function loadGameAssets(): Promise<LoadedGameAssets> {
  // Legacy pixel spritesheet kept as zero-crash fallback
  const unitsSheet = (await Assets.load('./assets/pixel/units_spritesheet.json')) as Spritesheet;
  unitsSheet.textureSource.scaleMode = 'nearest';
  for (const tex of Object.values(unitsSheet.textures)) {
    forceNearest(tex);
  }

  // Load Option B High-Detail 2.5-Head Gothic Chibis (Plant Milk Walnut + Chibi LoRA)
  const chibiKeys = new Set<string>();
  for (const o of Object.values(OVERLORD_DEFS)) chibiKeys.add(o.chibiKey);
  for (const u of Object.values(ABYSSAL_UNIT_DEFS)) chibiKeys.add(u.chibiKey);
  for (const h of Object.values(HERO_DEFS)) chibiKeys.add(h.chibiKey);

  const chibiEntries = await Promise.all(
    Array.from(chibiKeys).map(async (k) => {
      const tex = await tryLoadTexture(`./assets/chibi/${k}.webp`);
      return [k, tex] as const;
    }),
  );
  const chibis: Record<string, Texture> = {};
  for (const [k, tex] of chibiEntries) {
    if (tex) chibis[k] = tex;
  }

  // Load 5 Torture Chamber Implement Props
  const propEntries = await Promise.all(
    TORTURE_IMPLEMENT_LIST.map(async (id) => {
      const tex = await tryLoadTexture(`./assets/props/${id}.webp`);
      return [id, tex] as const;
    }),
  );
  const props: Partial<Record<TortureImplementId, Texture>> = {};
  for (const [id, tex] of propEntries) {
    if (tex) props[id] = tex;
  }

  // Load all 10 cutaway rooms + 4 treasury gold overlays
  const roomEntries = await Promise.all(
    ROOM_KEYS.map(async (k) => {
      const tex = forceNearest((await Assets.load(`./assets/pixel/rooms/${k}.png`)) as Texture);
      return [k, tex] as const;
    }),
  );
  const rooms = Object.fromEntries(roomEntries) as Record<RoomType, Texture>;

  const treasuryGold = (await Promise.all([
    Assets.load('./assets/pixel/rooms/treasury_gold_1.png'),
    Assets.load('./assets/pixel/rooms/treasury_gold_2.png'),
    Assets.load('./assets/pixel/rooms/treasury_gold_3.png'),
    Assets.load('./assets/pixel/rooms/treasury_gold_4.png'),
  ])) as [Texture, Texture, Texture, Texture];
  treasuryGold.forEach(forceNearest);

  // Load 5 corridor traps
  const trapEntries = await Promise.all(
    TRAP_KEYS.map(async (k) => {
      const tex = forceNearest((await Assets.load(`./assets/pixel/traps/${k}.png`)) as Texture);
      return [k, tex] as const;
    }),
  );
  const traps = Object.fromEntries(trapEntries) as Record<TrapType, Texture>;

  const [gothicChicken, fallbackChicken, hover, grab, slap] = (await Promise.all([
    tryLoadTexture('./assets/chibi/gothic_chicken.webp'),
    Assets.load('./assets/pixel/extras/chicken.png'),
    Assets.load('./assets/pixel/cursors/hand_hover.png'),
    Assets.load('./assets/pixel/cursors/hand_grab.png'),
    Assets.load('./assets/pixel/cursors/hand_slap.png'),
  ])) as [Texture | null, Texture, Texture, Texture, Texture];

  return {
    unitsSheet,
    chibis,
    props,
    rooms,
    treasuryGold,
    traps,
    chicken: gothicChicken ?? forceNearest(fallbackChicken),
    chickenIsHighRes: Boolean(gothicChicken),
    cursors: {
      hover: forceNearest(hover),
      grab: forceNearest(grab),
      slap: forceNearest(slap),
    },
  };
}
