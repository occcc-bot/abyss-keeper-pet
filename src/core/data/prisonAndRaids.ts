import type {
  CapturableHeroId,
  HeroSpeciesId,
  PrisonerRecord,
  PrisonerStance,
  RaidArchetype,
  TortureImplementId,
} from '../types';

export interface RaidProfile {
  species: HeroSpeciesId;
  archetype: RaidArchetype;
  chance: number;
  /** Lock HP drained per second as a fraction of lock.max (0 if non-breach archetype) */
  breachRatePerSec: number;
  /** Optional channel/cast duration in seconds (e.g., chant 8s, blast fuse 3s, purge 4s) */
  channelSec?: number;
  /** Escort speed multiplier relative to hero.moveSpeed */
  escortSpeedMult?: number;
  /** Max prisoners extracted per raid */
  maxExtract?: number;
  /** Ignores blocking units while charging toward prison */
  ignoresBlockers?: boolean;
  /** Ranged snipe shots */
  snipeShots?: number;
  /** Only targets broken prisoners (Valkyrie purge) */
  requiresBroken?: boolean;
  /** Triggers on entry / death regardless of raid token (Empress) */
  alwaysTrigger?: boolean;
}

export const RAID_PROFILES: Record<HeroSpeciesId, RaidProfile> = {
  novice_adventurer: {
    species: 'novice_adventurer',
    archetype: 'flee_report',
    chance: 0.5,
    breachRatePerSec: 0,
    escortSpeedMult: 1.2,
  },
  holy_knight: {
    species: 'holy_knight',
    archetype: 'charge',
    chance: 1.0,
    breachRatePerSec: 1 / 6,
    ignoresBlockers: true,
    maxExtract: 1,
    escortSpeedMult: 0.9,
  },
  holy_sister: {
    species: 'holy_sister',
    archetype: 'chant',
    chance: 0.6,
    breachRatePerSec: 0,
    channelSec: 8,
  },
  elf_sharpshooter: {
    species: 'elf_sharpshooter',
    archetype: 'snipe',
    chance: 0.6,
    breachRatePerSec: 0,
    snipeShots: 2,
    maxExtract: 1,
    escortSpeedMult: 0.95,
  },
  dwarf_gold_thief: {
    species: 'dwarf_gold_thief',
    archetype: 'pick',
    chance: 0.7,
    breachRatePerSec: 1 / 10,
    maxExtract: 1,
    escortSpeedMult: 1.05,
  },
  crimson_assassin: {
    species: 'crimson_assassin',
    archetype: 'extract_one',
    chance: 0.5,
    breachRatePerSec: 1 / 7,
    maxExtract: 1,
    escortSpeedMult: 1.1,
  },
  sapper_engineer: {
    species: 'sapper_engineer',
    archetype: 'blast',
    chance: 0.6,
    breachRatePerSec: 0,
    channelSec: 3,
    maxExtract: 1,
    escortSpeedMult: 0.85,
  },
  shield_vanguard: {
    species: 'shield_vanguard',
    archetype: 'sled',
    chance: 0.5,
    breachRatePerSec: 1 / 8,
    maxExtract: 1,
    escortSpeedMult: 0.4,
  },
  sun_archmage: {
    species: 'sun_archmage',
    archetype: 'melt',
    chance: 0.6,
    breachRatePerSec: 1 / 9,
    maxExtract: 1,
    escortSpeedMult: 0.9,
  },
  dragon_general: {
    species: 'dragon_general',
    archetype: 'airlift',
    chance: 0.5,
    breachRatePerSec: 1 / 6,
    maxExtract: 2,
    escortSpeedMult: 0.95,
  },
  valkyrie_captain: {
    species: 'valkyrie_captain',
    archetype: 'purge',
    chance: 1.0,
    breachRatePerSec: 0,
    channelSec: 4,
    requiresBroken: true,
  },
  lord_inquisitor: {
    species: 'lord_inquisitor',
    archetype: 'excommunicate',
    chance: 1.0,
    breachRatePerSec: 0,
    alwaysTrigger: true,
  },
};

/** Closed-form HP cost coefficient k per implement: ΔHP = -k * k_mode * (Δwill / maxWill) * 100 */
export const TORTURE_HP_K: Record<TortureImplementId, number> = {
  electric_chair: 0.80,
  truth_spotlight: 0.35,
  brainwash_gramophone: 0.15,
  feather_tickler: 0,
  hell_dessert_table: -0.40,
};

/** 6 Capturable Heroes -> Signature Weakness Implement (2x will drain, same HP cost!) */
export const HERO_WEAKNESS_IMPLEMENT: Record<CapturableHeroId, TortureImplementId> = {
  dragon_general: 'electric_chair',
  elf_sharpshooter: 'feather_tickler',
  holy_sister: 'brainwash_gramophone',
  sun_archmage: 'brainwash_gramophone',
  holy_knight: 'hell_dessert_table',
  dwarf_gold_thief: 'truth_spotlight',
};

/**
 * Deterministic hero constitution factor k_hero ONLY active when Prison exists AND Extreme Mode is ON (#81).
 * On Electric Chair from 100 HP:
 * - dragon_general (0.85): 100 - 0.80*1.2*0.85*100 = 18.4 HP
 * - holy_knight (0.90):    100 - 0.80*1.2*0.90*100 = 13.6 HP
 * - dwarf_gold_thief (1.0):100 - 0.80*1.2*1.00*100 =  4.0 HP (Perfect Finish!)
 * - sun_archmage (1.08):   100 - 0.80*1.2*1.08*100 = -3.7 HP (Needs 1 chicken!)
 * - holy_sister (1.10):    100 - 0.80*1.2*1.10*100 = -5.6 HP (Needs 1 chicken!)
 * - elf_sharpshooter (1.10):100 - 0.80*1.2*1.10*100 = -5.6 HP (Vegetarian -> Dessert Table!)
 */
export const HERO_EXTREME_K: Record<CapturableHeroId, number> = {
  dragon_general: 0.85,
  holy_knight: 0.90,
  dwarf_gold_thief: 1.0,
  sun_archmage: 1.08,
  holy_sister: 1.10,
  elf_sharpshooter: 1.10,
};

export interface HeroPersonaTrait {
  vegetarian?: boolean;
  duelChallenge?: boolean;
}

export const HERO_PERSONA: Partial<Record<HeroSpeciesId, HeroPersonaTrait>> = {
  elf_sharpshooter: { vegetarian: true },
  dragon_general: { duelChallenge: true },
};

/** One-time flavor will-reduction bitmask flags on PrisonerRecord.flavorHits */
export const FLAVOR_BITS = {
  KNIGHT_SLAP: 1 << 0,
  THIEF_JAILED: 1 << 1,
  ASSASSIN_ABANDON: 1 << 2,
  MAGE_SCOLD: 1 << 3,
  PALADIN_CP: 1 << 4,
  PYRO_SAPPER: 1 << 5,
  VALKYRIE_BETRAYAL: 1 << 6,
} as const;

/** Pure derivation of Prisoner 4-stance betrayal state (never stored separately). */
export function stanceOf(p: Pick<PrisonerRecord, 'will' | 'maxWill' | 'dessertHooked'>): PrisonerStance {
  if (p.dessertHooked) return 'dessert';
  const r = p.maxWill > 0 ? p.will / p.maxWill : 0;
  if (r > 0.66) return 'resist';
  if (r >= 0.33) return 'waver';
  return 'broken';
}
