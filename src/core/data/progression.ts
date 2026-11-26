import type { BuildableRoomType, FeatureId, SpellId, StoryId, TrapType } from '../types';

export const ALL_FEATURE_IDS: readonly FeatureId[] = [
  'spell_frenzy',
  'spell_charm',
  'spell_blackhole',
  'trap_frost',
  'trap_charm',
  'trap_spring',
  'room_prison',
  'room_corruption',
  'room_altar',
  'tab_relics',
  'tab_prestige',
] as const;

export const STORY_IDS: readonly StoryId[] = [
  'prologue_desk',
  'unlock_torture',
  'unlock_altar',
  'boss_valkyrie_w5',
  'chapter1_clear_w10',
  'first_ace_converted',
  'unlock_prestige_w50',
] as const;

export interface TerritoryTier {
  waveCleared: number;
  territoryMax: number;
}

export const TERRITORY_TIERS: readonly TerritoryTier[] = [
  { waveCleared: 0, territoryMax: 12 },
  { waveCleared: 1, territoryMax: 15 },
  { waveCleared: 4, territoryMax: 18 },
  { waveCleared: 7, territoryMax: 22 },
  { waveCleared: 10, territoryMax: 27 },
] as const;

export const FEATURE_UNLOCK_WAVE: Record<FeatureId, number> = {
  spell_frenzy: 1,
  trap_frost: 1,
  room_prison: 1,
  room_corruption: 2,
  trap_charm: 3,
  trap_spring: 3,
  tab_relics: 3,
  room_altar: 4,
  spell_charm: 4,
  spell_blackhole: 7,
  tab_prestige: 7,
};

export const SPELL_TO_FEATURE: Partial<Record<SpellId, FeatureId>> = {
  demon_frenzy: 'spell_frenzy',
  charm_mist: 'spell_charm',
  abyss_blackhole: 'spell_blackhole',
};

export const ROOM_TO_FEATURE: Partial<Record<BuildableRoomType, FeatureId>> = {
  prison: 'room_prison',
  corruption: 'room_corruption',
  altar: 'room_altar',
};

export const TRAP_TO_FEATURE: Partial<Record<TrapType, FeatureId>> = {
  frost_rune: 'trap_frost',
  charm_censer: 'trap_charm',
  hell_spring: 'trap_spring',
};

export function requiredWaveForSlot(slotIndex: number): number {
  for (const tier of TERRITORY_TIERS) {
    if (slotIndex <= tier.territoryMax) {
      return tier.waveCleared;
    }
  }
  return 10;
}

export function territoryMaxForWave(highestWaveCleared: number): number {
  let maxSlot = 12;
  for (const tier of TERRITORY_TIERS) {
    if (highestWaveCleared >= tier.waveCleared) {
      maxSlot = Math.max(maxSlot, tier.territoryMax);
    }
  }
  return maxSlot;
}
