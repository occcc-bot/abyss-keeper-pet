import {
  ALL_FEATURE_IDS,
  FEATURE_UNLOCK_WAVE,
  ROOM_TO_FEATURE,
  SPELL_TO_FEATURE,
  TRAP_TO_FEATURE,
  territoryMaxForWave,
} from '../data/progression';
import { ROOM_DEFS } from '../data/roomsAndTraps';
import { ABYSSAL_UNIT_DEFS } from '../data/units';
import { pushEvent } from '../ecs/stateFactory';
import { t } from '../i18n';
import {
  TOTAL_SLOTS,
  type BuildableRoomType,
  type FeatureId,
  type GameState,
  type HeroSpeciesId,
  type PrestigeState,
  type ProgressionState,
  type SpellId,
  type StoryId,
  type TrapType,
} from '../types';

export function createInitialProgression(
  prestige: PrestigeState,
  sandbox = false,
): ProgressionState {
  if (sandbox || prestige.epoch > 1) {
    return {
      sandbox,
      territoryMax: TOTAL_SLOTS - 1,
      unlocked: [...ALL_FEATURE_IDS],
      firstBuildDiscount: {
        prison: false,
        corruption: false,
        altar: false,
      },
      pendingUnlockPulse: [],
    };
  }
  const extraSlots = Math.min(
    6,
    Math.max(prestige.talents.extraStartingSlot, prestige.techLevels?.deep_excavation ?? 0),
  );
  return {
    sandbox: false,
    territoryMax: Math.min(TOTAL_SLOTS - 1, Math.max(12, 11 + extraSlots + 1)),
    unlocked: [],
    firstBuildDiscount: {
      prison: true,
      corruption: true,
      altar: true,
    },
    pendingUnlockPulse: [],
  };
}

export function isFeatureUnlocked(state: GameState, feature: FeatureId): boolean {
  if (!state.progression || state.progression.sandbox || state.prestige.epoch > 1) {
    return true;
  }
  if (feature === 'tab_relics' && state.relics.length > 0) {
    return true;
  }
  return state.progression.unlocked.includes(feature);
}

export function isSlotUnlocked(state: GameState, slotIndex: number): boolean {
  if (!state.progression || state.progression.sandbox || state.prestige.epoch > 1) {
    return true;
  }
  return slotIndex <= state.progression.territoryMax;
}

export function isSpellUnlocked(state: GameState, spellId: SpellId): boolean {
  const feat = SPELL_TO_FEATURE[spellId];
  return feat ? isFeatureUnlocked(state, feat) : true;
}

export function isRoomUnlocked(state: GameState, roomType: BuildableRoomType): boolean {
  const feat = ROOM_TO_FEATURE[roomType];
  return feat ? isFeatureUnlocked(state, feat) : true;
}

export function isTrapUnlocked(state: GameState, trapType: TrapType): boolean {
  const feat = TRAP_TO_FEATURE[trapType];
  return feat ? isFeatureUnlocked(state, feat) : true;
}

export function getRoomBuildCost(state: GameState, roomType: BuildableRoomType): number {
  const base = ROOM_DEFS[roomType].buildCost;
  if (!state.progression) return base;
  if (roomType === 'prison' && state.progression.firstBuildDiscount?.prison) {
    return Math.round(base * 0.5);
  }
  if (roomType === 'corruption' && state.progression.firstBuildDiscount.corruption) {
    return Math.round(base * 0.5);
  }
  if (roomType === 'altar' && state.progression.firstBuildDiscount.altar) {
    return Math.round(base * 0.5);
  }
  return base;
}

export function markStorySeen(state: GameState, storyId: StoryId): void {
  state.prestige.storySeen ??= [];
  if (!state.prestige.storySeen.includes(storyId)) {
    state.prestige.storySeen.push(storyId);
  }
}

export function triggerStoryIfUnseen(
  state: GameState,
  storyId: StoryId,
  heroSpecies?: HeroSpeciesId,
): boolean {
  state.prestige.storySeen ??= [];
  if (state.prestige.storySeen.includes(storyId)) return false;
  // Avoid pushing duplicate story_trigger events before UI marks it seen
  if (state.recentEvents.some((e) => e.type === 'story_trigger' && e.storyId === storyId)) {
    return false;
  }
  pushEvent(state, {
    type: 'story_trigger',
    storyId,
    heroSpecies,
  });
  return true;
}

function featureToPulseKey(feature: FeatureId): string {
  switch (feature) {
    case 'spell_frenzy':
      return 'spell:demon_frenzy';
    case 'spell_charm':
      return 'spell:charm_mist';
    case 'spell_blackhole':
      return 'spell:abyss_blackhole';
    case 'room_prison':
      return 'act:build';
    case 'room_corruption':
      return 'act:torture';
    case 'room_altar':
      return 'act:altar';
    case 'tab_relics':
      return 'act:relics';
    case 'tab_prestige':
      return 'act:prestige';
    case 'trap_frost':
    case 'trap_charm':
    case 'trap_spring':
      return 'act:build';
  }
}

export interface ProgressionEvalResult {
  newlyUnlockedFeatures: FeatureId[];
  territoryExpanded: boolean;
  prevTerritoryMax: number;
  newTerritoryMax: number;
}

export function evaluateProgression(state: GameState): ProgressionEvalResult {
  state.progression ??= createInitialProgression(state.prestige, false);
  const prog = state.progression;
  const prevTerritoryMax = prog.territoryMax;
  const newlyUnlockedFeatures: FeatureId[] = [];

  if (prog.sandbox || state.prestige.epoch > 1) {
    prog.territoryMax = TOTAL_SLOTS - 1;
    for (const f of ALL_FEATURE_IDS) {
      if (!prog.unlocked.includes(f)) prog.unlocked.push(f);
    }
  } else {
    const cleared = state.highestWaveCleared;
    const targetTerritory = territoryMaxForWave(cleared);
    if (targetTerritory > prog.territoryMax) {
      prog.territoryMax = Math.min(TOTAL_SLOTS - 1, targetTerritory);
    }
    for (const f of ALL_FEATURE_IDS) {
      if (prog.unlocked.includes(f)) continue;
      const waveReq = FEATURE_UNLOCK_WAVE[f];
      const relicEvidence = f === 'tab_relics' && state.relics.length > 0;
      if (cleared >= waveReq || relicEvidence) {
        prog.unlocked.push(f);
        newlyUnlockedFeatures.push(f);
        const pulseKey = featureToPulseKey(f);
        if (!prog.pendingUnlockPulse.includes(pulseKey)) {
          prog.pendingUnlockPulse.push(pulseKey);
        }
      }
    }
  }

  const territoryExpanded = prog.territoryMax > prevTerritoryMax;
  if (newlyUnlockedFeatures.length > 0 || territoryExpanded) {
    pushEvent(state, {
      type: 'feature_unlocked',
      value: state.highestWaveCleared,
      features: newlyUnlockedFeatures,
      slotIndex: territoryExpanded ? prog.territoryMax : undefined,
      text: territoryExpanded
        ? t(
            `深渊破壁！领地解封至 #0..#${prog.territoryMax}！`,
            `Abyssal Seal Broken! Territory expanded to #0..#${prog.territoryMax}!`,
          )
        : t(
            `深渊新设施与神迹已解封！`,
            `New Abyssal facilities & miracles unlocked!`,
          ),
    });
  }

  // Story triggers tied to wave milestones (fire even in sandbox/epoch if unseen, except archived on migration)
  const cleared = state.highestWaveCleared;
  if (cleared >= 2) triggerStoryIfUnseen(state, 'unlock_torture');
  if (cleared >= 4) triggerStoryIfUnseen(state, 'unlock_altar');
  if (cleared >= 10) triggerStoryIfUnseen(state, 'chapter1_clear_w10');
  if (cleared >= 50) triggerStoryIfUnseen(state, 'unlock_prestige_w50');

  return {
    newlyUnlockedFeatures,
    territoryExpanded,
    prevTerritoryMax,
    newTerritoryMax: prog.territoryMax,
  };
}

/**
 * Lossless v3 -> v4 save migration backfill:
 * unlocked = { wave threshold <= highestWaveCleared } ∪ { save evidence }
 * territoryMax = max(wave table, rightmost non-rock or marked rock + 1)
 * Already-passed stories are silently archived into prestige.storySeen.
 */
export function backfillProgressionForMigratedSave(state: GameState): void {
  state.prestige.storySeen ??= [];
  const cleared = state.highestWaveCleared ?? 0;

  const hasPrison = state.slots.some((s) => s.type === 'prison');
  const hasCorruption = state.slots.some((s) => s.type === 'corruption');
  const hasAltar = state.slots.some((s) => s.type === 'altar');
  const hasRelics = (state.relics?.length ?? 0) > 0;
  const hasTech = Object.values(state.prestige.techLevels ?? {}).some((v) => v > 0);
  const hasTier2Plus = (state.units ?? []).some((u) => (ABYSSAL_UNIT_DEFS[u.species]?.tier ?? 0) >= 2);
  const hasExtraImpl = (state.unlockedImplements?.length ?? 0) > 1;
  const hasFrost = state.slots.some((s) => s.trap?.type === 'frost_rune');
  const hasCharm = state.slots.some((s) => s.trap?.type === 'charm_censer');
  const hasSpring = state.slots.some((s) => s.trap?.type === 'hell_spring');
  const lvFrenzy = (state.spellLevels?.demon_frenzy ?? 1) > 1;
  const lvCharm = (state.spellLevels?.charm_mist ?? 1) > 1;
  const lvBlackhole = (state.spellLevels?.abyss_blackhole ?? 1) > 1;

  if (state.prestige.epoch > 1) {
    state.progression = {
      sandbox: false,
      territoryMax: TOTAL_SLOTS - 1,
      unlocked: [...ALL_FEATURE_IDS],
      firstBuildDiscount: {
        prison: false,
        corruption: false,
        altar: false,
      },
      pendingUnlockPulse: [],
    };
  } else {
    const unlockedSet = new Set<FeatureId>();
    for (const f of ALL_FEATURE_IDS) {
      if (cleared >= FEATURE_UNLOCK_WAVE[f]) unlockedSet.add(f);
    }
    if (hasPrison || cleared >= 1) {
      unlockedSet.add('room_prison');
    }
    if (hasCorruption || hasExtraImpl || (state.prisoners?.length ?? 0) > 0) {
      unlockedSet.add('room_corruption');
    }
    if (hasAltar || hasTier2Plus || (state.metrics?.totalFusions ?? 0) > 0) {
      unlockedSet.add('room_altar');
    }
    if (hasRelics) unlockedSet.add('tab_relics');
    if (hasTech) unlockedSet.add('tab_prestige');
    if (hasFrost) unlockedSet.add('trap_frost');
    if (hasCharm) unlockedSet.add('trap_charm');
    if (hasSpring) unlockedSet.add('trap_spring');
    if (lvFrenzy) unlockedSet.add('spell_frenzy');
    if (lvCharm) unlockedSet.add('spell_charm');
    if (lvBlackhole) unlockedSet.add('spell_blackhole');

    let rightmostDugOrMarked = 11;
    for (const sl of state.slots) {
      if (sl.type !== 'rock_vein' || sl.markedForDig) {
        if (sl.index > rightmostDugOrMarked) rightmostDugOrMarked = sl.index;
      }
    }
    const territoryMax = Math.min(
      TOTAL_SLOTS - 1,
      Math.max(territoryMaxForWave(cleared), rightmostDugOrMarked + 1, 12),
    );

    state.progression = {
      sandbox: false,
      territoryMax,
      unlocked: Array.from(unlockedSet),
      firstBuildDiscount: {
        prison: !hasPrison,
        corruption: !hasCorruption,
        altar: !hasAltar,
      },
      pendingUnlockPulse: [],
    };
  }

  // Silently archive already-passed stories into prestige.storySeen so veterans aren't spammed
  const archive = (id: StoryId): void => markStorySeen(state, id);
  if (cleared >= 1 || state.tick > 100 || state.prestige.epoch > 1) archive('prologue_desk');
  if (cleared >= 2 || hasCorruption || state.prestige.epoch > 1) archive('unlock_torture');
  if (cleared >= 4 || hasAltar || state.prestige.epoch > 1) archive('unlock_altar');
  if (cleared >= 5 || state.prestige.codexHeroes?.includes('valkyrie_captain') || state.prestige.epoch > 1) {
    archive('boss_valkyrie_w5');
  }
  if (cleared >= 10 || state.prestige.epoch > 1) archive('chapter1_clear_w10');
  if ((state.metrics?.totalCaptivesConverted ?? 0) >= 1) archive('first_ace_converted');
  if (cleared >= 50 || state.prestige.epoch > 1) archive('unlock_prestige_w50');
}
