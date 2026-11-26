import { TUTORIAL_STEPS } from '../data/tortureAndTech';
import { ABYSSAL_UNIT_DEFS, OVERLORD_DEFS } from '../data/units';
import { createInitialProgression } from '../systems/progressionSystem';
import {
  BALANCE_CONFIG,
  SIM_RUNTIME_FLAGS,
  computeRelicModifiers,
  depositGold,
  refillGoldFromBullion,
  roomOutput,
  unitStat,
  xpForNextLevel,
} from '../formulas';
import { t } from '../i18n';
import { SeededRng } from '../rng';
import {
  BACKYARD_HATCHERY_SLOT,
  BACKYARD_TREASURY_SLOT,
  SAVE_VERSION,
  SLOT_WIDTH,
  THRONE_SLOT_INDEX,
  TOTAL_SLOTS,
  type AbyssalSpeciesId,
  type AbyssalUnit,
  type ChronicleKey,
  type CorruptionMarkId,
  type DungeonEvent,
  type GameState,
  type OreTier,
  type OverlordId,
  type PrestigeState,
  type RoomSlot,
  type RoomType,
  type TechId,
  type TraitId,
  type VisualVfxEvent,
} from '../types';

export function nextEntityId(prefix: string, state: GameState): string {
  state.entitySeq += 1;
  return `${prefix}_${state.tick}_${state.entitySeq}`;
}

export function slotCenterX(slotIndex: number): number {
  const clamped = Math.max(0, Math.min(TOTAL_SLOTS - 1, slotIndex));
  return clamped * SLOT_WIDTH + SLOT_WIDTH * 0.5;
}

export function xToSlotIndex(x: number): number {
  return Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(x / SLOT_WIDTH)));
}

export function getThroneSlot(state: GameState): RoomSlot {
  return state.slots[THRONE_SLOT_INDEX] ?? state.slots.find((s) => s.type === 'throne') ?? state.slots[0]!;
}

export function getMaxCombatUnits(state: GameState): number {
  const throne = getThroneSlot(state);
  const techCrown = state.prestige.techLevels?.overlord_crown ?? 0;
  const lvBonus = Math.floor((state.overlordLevel - 1) / 4);
  return 8 + throne.level + lvBonus + techCrown;
}

export function pushEvent(state: GameState, event: Omit<DungeonEvent, 'tick'>): void {
  state.recentEvents.push({ ...event, tick: state.tick });
  if (state.recentEvents.length > 160) {
    state.recentEvents.splice(0, state.recentEvents.length - 80);
  }
}

export function pushVfx(state: GameState, vfx: VisualVfxEvent): void {
  state.vfxQueue.push(vfx);
  if (state.vfxQueue.length > 80) {
    state.vfxQueue.splice(0, state.vfxQueue.length - 50);
  }
}

export function incrementChronicle(state: GameState, key: ChronicleKey, delta = 1): void {
  state.chronicle ??= {};
  state.chronicle[key] = (state.chronicle[key] ?? 0) + delta;
}

export function advanceTutorialIfMatch(state: GameState, expectedStep: number): boolean {
  if (state.tutorialDismissed || state.tutorialStep !== expectedStep) return false;
  const def = TUTORIAL_STEPS[expectedStep];
  if (def) {
    depositGold(state, def.rewardGold);
    state.trapParts = Math.min(state.trapPartsCap, state.trapParts + def.rewardParts);
  }
  state.tutorialStep = Math.min(TUTORIAL_STEPS.length, expectedStep + 1);
  return true;
}

/** Refills gold from Dark-Gold Bullion Vault 1:1 and emits throttled floating VFX when >= 50G transfers. */
export function refillGoldAndEmitVfx(state: GameState): number {
  const transfer = refillGoldFromBullion(state);
  if (transfer >= 50 && (state.bullionRefillVfxCd ?? 0) <= 0) {
    state.bullionRefillVfxCd = 3.0;
    const amt = Math.round(transfer);
    pushVfx(state, {
      kind: 'heal',
      x: slotCenterX(BACKYARD_TREASURY_SLOT),
      value: amt,
      label: t(`▪ 拍碎金砖 +${amt}G`, `▪ Bullion +${amt}G`),
      color: 0xf2c655,
    });
  }
  return transfer;
}

export function createDefaultTechLevels(): Record<TechId, number> {
  return {
    abyssal_might: 0,
    golden_greed: 0,
    arcane_well: 0,
    trap_engineering: 0,
    torture_mastery: 0,
    overlord_crown: 0,
    deep_excavation: 0,
    offline_chronicle: 0,
    auto_slap_aura: 0,
    rare_trait_boost: 0,
  };
}

export function createDefaultPrestige(): PrestigeState {
  return {
    epoch: 1,
    abyssalShards: 0,
    totalShardsEarned: 0,
    overlordConstellation: 1,
    corruptedSoulMarks: {},
    unlockedRelicCodex: [],
    unlockedOverlords: ['lilith', 'elizabeth'],
    codexUnits: ['imp', 'slime_girl', 'skeleton_blademaid', 'imp_witch'],
    codexHeroes: [],
    codexImplements: ['electric_chair'],
    storySeen: [],
    codexQuirks: [],
    codexWeakness: [],
    obituaryBadgeUnlocked: false,
    talents: {
      extraStartingSlot: 0,
      autoSlapAura: 0,
      rareTraitBoost: 0,
      abyssalMight: 0,
    },
    techLevels: createDefaultTechLevels(),
  };
}

function oreTierForSlot(index: number): OreTier {
  if (index >= 22) return 'blood_diamond';
  if (index >= 16) return 'mithril';
  return 'dark_gold';
}

export function createRoomSlot(index: number, type: RoomType, level = 1): RoomSlot {
  const isRock = type === 'rock_vein';
  const oreTier = oreTierForSlot(index);
  const isInfiniteFrontier = isRock && index >= TOTAL_SLOTS - 2;
  const tierHpMult = oreTier === 'blood_diamond' ? 2.4 : oreTier === 'mithril' ? 1.55 : 1.0;
  const tierGoldMult = oreTier === 'blood_diamond' ? 3.2 : oreTier === 'mithril' ? 1.85 : 1.0;
  const rockHp = isRock ? Math.round((65 + index * 18) * tierHpMult) : 0;
  const rockGoldYield = isRock ? Math.round((90 + index * 24) * tierGoldMult) : 0;
  const hasRelicChest = isRock && !isInfiniteFrontier && (index === 15 || index === 20 || index === 24);

  return {
    index,
    type,
    level: isRock ? 1 : level,
    rockHp,
    rockMaxHp: rockHp,
    rockGoldYield,
    oreTier,
    isInfiniteFrontier,
    hasRelicChest,
    markedForDig: false,
    wallIntegrity: 100,
    chickens: type === 'hatchery' ? 3 : 0,
    chickenSpawnTimer: 6,
    looseGold: 0,
    trap: null,
  };
}

export function registerUnitInCodex(state: GameState, species: AbyssalSpeciesId): void {
  if (!state.prestige.codexUnits.includes(species)) {
    state.prestige.codexUnits.push(species);
  }
}

export function createAbyssalUnit(
  state: GameState,
  species: AbyssalSpeciesId,
  slotIndex: number,
  options?: {
    level?: number;
    star?: number;
    traits?: TraitId[];
    assignedSlot?: number | null;
    corruptionMark?: CorruptionMarkId;
  },
): AbyssalUnit {
  registerUnitInCodex(state, species);
  const def = ABYSSAL_UNIT_DEFS[species];
  const level = options?.level ?? 1;
  const star = options?.star ?? 1;
  const traits = options?.traits ? [...options.traits] : [...def.innateTraits];
  const mods = computeRelicModifiers(state.relics, state.prestige);
  const mightRank = state.prestige.techLevels?.abyssal_might ?? state.prestige.talents.abyssalMight;
  const overlordAura = 1 + (state.overlordLevel - 1) * BALANCE_CONFIG.overlordGlobalAtkAuraPerLevel;
  const prestigeMult =
    1 +
    mightRank * 0.12 +
    (state.prestige.overlordConstellation - 1) * 0.08 +
    Math.min(10, state.prestige.corruptedSoulMarks[species] ?? 0) * 0.025;

  const maxHp = Math.round(unitStat(def.baseHp, level, star) * mods.unitHpMult * prestigeMult);
  const atk = Math.round(
    unitStat(def.baseAtk, level, star) * mods.unitAtkMult * prestigeMult * overlordAura,
  );

  return {
    id: nextEntityId(species, state),
    species,
    name: def.name,
    tier: def.tier,
    level,
    xp: 0,
    star,
    hp: maxHp,
    maxHp,
    atk,
    attackCooldown: 0,
    attackSpeed: def.attackSpeed,
    moveSpeed: def.moveSpeed,
    range: def.range,
    x: slotCenterX(slotIndex),
    slotIndex,
    assignedSlot: options?.assignedSlot !== undefined ? options.assignedSlot : slotIndex,
    satiety: 100,
    happiness: 75,
    slapBuffTimer: 0,
    slapReactTimer: 0,
    frenzyBuffTimer: 0,
    recoveryTimer: 0,
    attackAnimTimer: 0,
    eatAnimTimer: 0,
    facing: 1,
    activity: 'idle',
    impTask: 'idle',
    impTargetSlot: null,
    carryingGold: 0,
    carryingCaptiveId: null,
    traits,
    corruptionMark: options?.corruptionMark,
    markChangedOnce: false,
    personality: def.personality,
    locked: false,
    kills: 0,
    totalDamageDealt: 0,
  };
}

export function recalcUnitStats(state: GameState, unit: AbyssalUnit): void {
  unit.recoveryTimer ??= 0;
  unit.attackAnimTimer ??= 0;
  unit.eatAnimTimer ??= 0;
  unit.facing ??= 1;
  const def = ABYSSAL_UNIT_DEFS[unit.species];
  const mods = computeRelicModifiers(state.relics, state.prestige);
  const mightRank = state.prestige.techLevels?.abyssal_might ?? state.prestige.talents.abyssalMight;
  const overlordAura = 1 + (state.overlordLevel - 1) * BALANCE_CONFIG.overlordGlobalAtkAuraPerLevel;
  const prestigeMult =
    1 +
    mightRank * 0.12 +
    (state.prestige.overlordConstellation - 1) * 0.08 +
    Math.min(10, state.prestige.corruptedSoulMarks[unit.species] ?? 0) * 0.025;

  const prevRatio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
  unit.maxHp = Math.max(
    1,
    Math.round(unitStat(def.baseHp, unit.level, unit.star) * mods.unitHpMult * prestigeMult),
  );
  unit.hp = Math.max(1, Math.min(unit.maxHp, Math.round(unit.maxHp * prevRatio)));
  unit.atk = Math.max(
    1,
    Math.round(unitStat(def.baseAtk, unit.level, unit.star) * mods.unitAtkMult * prestigeMult * overlordAura),
  );
}

export function grantUnitXp(state: GameState, unit: AbyssalUnit, amount: number): boolean {
  if (amount <= 0 || unit.level >= BALANCE_CONFIG.unitMaxLevel) return false;
  unit.xp += amount;
  let leveled = false;
  while (unit.level < BALANCE_CONFIG.unitMaxLevel) {
    const req = xpForNextLevel(unit.level);
    if (unit.xp < req) break;
    unit.xp -= req;
    unit.level += 1;
    leveled = true;
  }
  if (leveled) {
    recalcUnitStats(state, unit);
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * 0.25));
    pushVfx(state, { kind: 'level_up', x: unit.x, label: `Lv.${unit.level}!`, color: 0xf2c655 });
  }
  return leveled;
}

export function recalcCapsAndOverlord(state: GameState): void {
  const mods = computeRelicModifiers(state.relics, state.prestige);
  const mightRank = state.prestige.techLevels?.abyssal_might ?? state.prestige.talents.abyssalMight;
  const crownRank = state.prestige.techLevels?.overlord_crown ?? 0;
  const prestigeMult =
    1 +
    mightRank * 0.12 +
    crownRank * 0.18 +
    (state.prestige.overlordConstellation - 1) * 0.12;

  let goldCap = 1500;
  let manaCap = 200;
  let trapPartsCap = 45;
  let throneLevel = 1;

  for (const slot of state.slots) {
    if (slot.type === 'throne') {
      throneLevel = slot.level;
      manaCap += Math.round(roomOutput(70, slot.level));
    } else if (slot.type === 'treasury') {
      goldCap += Math.round(
        roomOutput(2900, slot.level) * Math.pow(1.11, slot.level - 1),
      );
    } else if (slot.type === 'library') {
      manaCap += Math.round(roomOutput(120, slot.level));
    } else if (slot.type === 'workshop') {
      trapPartsCap += Math.round(roomOutput(38, slot.level));
    }
  }

  const prestigeWaveMult = 1 + 0.19 * Math.max(1, state.highestWaveCleared || 0);
  goldCap = Math.round(goldCap * prestigeWaveMult);

  if (!SIM_RUNTIME_FLAGS.uncappedGold) {
    state.goldCap = goldCap;
    state.bullionCap = Math.round(1.5 * goldCap);
    state.gold = Math.min(state.gold, state.goldCap);
    state.bullion = Math.max(0, Math.min(state.bullionCap, state.bullion ?? 0));
  }
  state.manaCap = manaCap;
  state.trapPartsCap = trapPartsCap;
  state.mana = Math.min(state.mana, state.manaCap);
  state.trapParts = Math.min(state.trapParts, state.trapPartsCap);

  const oDef = OVERLORD_DEFS[state.overlordId];
  const oLv = Math.max(1, state.overlordLevel || 1);
  const prevRatio = state.overlordMaxHp > 0 ? state.overlordHp / state.overlordMaxHp : 1;
  state.overlordMaxHp = Math.round(
    oDef.baseHp *
      (1 + 0.30 * (throneLevel - 1) + 0.24 * (oLv - 1)) *
      Math.pow(1.055, oLv - 1) *
      mods.heartHpMult *
      prestigeMult,
  );
  state.overlordAtk = Math.round(
    oDef.baseAtk *
      (1 + 0.24 * (throneLevel - 1) + 0.24 * (oLv - 1)) *
      Math.pow(1.045, oLv - 1) *
      mods.unitAtkMult *
      prestigeMult,
  );
  if (state.heartReviveTimer <= 0) {
    state.overlordHp = Math.max(
      1,
      Math.min(state.overlordMaxHp, Math.round(state.overlordMaxHp * prevRatio)),
    );
  }
}

export function createInitialGameState(
  seed = 1337,
  overlordId: OverlordId = 'lilith',
  existingPrestige?: PrestigeState,
  sandbox = false,
): GameState {
  const rng = new SeededRng(seed);
  const prestige = existingPrestige ? structuredClone(existingPrestige) : createDefaultPrestige();
  prestige.techLevels ??= createDefaultTechLevels();
  prestige.unlockedOverlords ??= ['lilith', 'elizabeth'];
  prestige.codexUnits ??= ['imp', 'slime_girl', 'skeleton_blademaid', 'imp_witch'];
  prestige.codexHeroes ??= [];
  prestige.codexImplements ??= ['electric_chair'];
  prestige.storySeen ??= [];
  prestige.codexQuirks ??= [];
  prestige.codexWeakness ??= [];

  const extraSlots = Math.min(
    6,
    Math.max(prestige.talents.extraStartingSlot, prestige.techLevels.deep_excavation ?? 0),
  );

  // V2.0 Wide 28-Slot Scrollable Dungeon Layout:
  // Backyard Sanctuary (behind Throne!):
  //   0: Treasury (Thieves sneak here!) | 1: Hatchery | 2..3: Backyard Corridors (Corruption / Altar spots)
  //   4: Backyard Rock Vein | 5: Backyard Guard Gate
  // Citadel Core:
  //   6: THRONE (Overlord Citadel!)
  // Frontline Kill Corridor & Deep Mining Frontier:
  //   7: Training Room | 8..11 (+ extraSlots): Frontline Corridors
  //   12..25: Progressive Rock Veins (Dark Gold -> Mithril -> Blood Diamond + Hidden Relic Chests)
  //   26..27: Infinite Deep Regenerating Ore Frontier (Imps always visibly mine & haul!)
  const slots: RoomSlot[] = [];
  const dugFrontierEnd = 11 + extraSlots;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (i === BACKYARD_TREASURY_SLOT) slots.push(createRoomSlot(i, 'treasury', 1));
    else if (i === BACKYARD_HATCHERY_SLOT) slots.push(createRoomSlot(i, 'hatchery', 1));
    else if (i === 2 || i === 3 || i === 5) slots.push(createRoomSlot(i, 'corridor', 1));
    else if (i === 4) slots.push(createRoomSlot(i, 'rock_vein', 1));
    else if (i === THRONE_SLOT_INDEX) slots.push(createRoomSlot(i, 'throne', 1));
    else if (i === 7) slots.push(createRoomSlot(i, 'training', 1));
    else if (i >= 8 && i <= dugFrontierEnd) slots.push(createRoomSlot(i, 'corridor', 1));
    else slots.push(createRoomSlot(i, 'rock_vein', 1));
  }

  // Mark the nearest frontline rock vein right away so Imps immediately run out & mine!
  const firstFrontierRock = slots.find((s) => s.index > THRONE_SLOT_INDEX && s.type === 'rock_vein');
  if (firstFrontierRock) {
    firstFrontierRock.markedForDig = true;
  }

  const oDef = OVERLORD_DEFS[overlordId];

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.getState(),
    entitySeq: 0,
    tick: 0,
    elapsedSeconds: 0,
    overlordId,
    overlordLevel: 1,
    overlordHp: oDef.baseHp,
    overlordMaxHp: oDef.baseHp,
    overlordAtk: oDef.baseAtk,
    overlordAttackCooldown: 0,
    heartReviveTimer: 0,

    gold: 280,
    goldCap: 5236,
    bullion: 0,
    bullionCap: 7854,
    mana: 90,
    manaCap: 270,
    trapParts: 18,
    trapPartsCap: 45,
    overchargeCd: 0,
    chamberSlapCd: 0,
    bullionRefillVfxCd: 0,
    bullionBragTimer: 18,

    wave: 1,
    highestWaveCleared: 0,
    farmMode: false,
    farmWavesCleared: 0,
    autoRetryBoss: true,
    autoCastSpells: true,
    waveTimer: 16,
    paydayTimer: 300,
    capturesThisWave: 0,
    wavesSinceCapture: 0,
    raidsThisWave: 0,
    nemesisPool: [],
    pendingReinforcements: 0,
    waveSpawnSeq: 0,
    noMercyMode: false,
    martyrBountyWaves: 0,
    ghostTutorTimer: 0,
    shatterStreak: { wave: 0, count: 0 },
    chronicle: {},
    prepExtendedSec: 0,
    globalWhimCooldown: 0,
    globalCpCooldown: 0,
    cpPairCooldowns: {},

    spellCooldowns: {
      abyss_lightning: 0,
      demon_frenzy: 0,
      charm_mist: 0,
      abyss_blackhole: 0,
    },
    spellLevels: {
      abyss_lightning: 1,
      demon_frenzy: 1,
      charm_mist: 1,
      abyss_blackhole: 1,
    },

    equippedImplement: 'electric_chair',
    unlockedImplements: ['electric_chair'],

    tutorialStep: prestige.epoch > 1 ? TUTORIAL_STEPS.length : 0,
    tutorialDismissed: prestige.epoch > 1,
    cutinMuted: false,
    banterTimer: 9,
    tortureGagTimer: 5,

    slots,
    units: [],
    heroes: [],
    prisoners: [],
    boulders: [],
    relics: [],
    altar: { slotAUnitId: null, slotBUnitId: null },
    hand: {
      heldUnitId: null,
      heldHeroId: null,
      pointerX: slotCenterX(THRONE_SLOT_INDEX),
      pointerY: 160,
      slapCooldown: 0,
    },
    prestige,
    progression: createInitialProgression(prestige, sandbox),
    metrics: {
      totalGoldEarned: 0,
      totalManaEarned: 0,
      totalHeroesDefeated: 0,
      totalSlaps: 0,
      totalCaptivesConverted: 0,
      totalFusions: 0,
      totalTrapsTriggered: 0,
      totalTrapDamage: 0,
      totalUnitDamage: 0,
      totalSpellDamage: 0,
      totalOverlordDamage: 0,
      totalThievesCaught: 0,
      heartShatterCount: 0,
      bankruptPaydays: 0,
      peakWaveReached: 1,
      prisonersDied: 0,
      raidsStarted: 0,
      prisonersEscaped: 0,
      twinSuitesTriggered: 0,
      perfectFinishes: 0,
    },
    recentEvents: [],
    vfxQueue: [],
    lastSaveTimestampMs: Date.now(),
  };

  // Starting roster positioned naturally around Throne (Slot 6), Backyard (0..5), and Frontline (7..11)
  state.units.push(createAbyssalUnit(state, 'imp', 0, { assignedSlot: null }));
  state.units.push(createAbyssalUnit(state, 'imp', 9, { assignedSlot: null }));
  state.units.push(createAbyssalUnit(state, 'slime_girl', 9, { assignedSlot: 9 }));
  state.units.push(createAbyssalUnit(state, 'skeleton_blademaid', 7, { assignedSlot: 7 }));
  state.units.push(createAbyssalUnit(state, 'imp_witch', 8, { assignedSlot: 8 }));

  recalcCapsAndOverlord(state);
  return state;
}

export function findRoomSlotByType(state: GameState, type: RoomType): RoomSlot | undefined {
  return state.slots.find((s) => s.type === type);
}

export function findAllRoomSlotsByType(state: GameState, type: RoomType): RoomSlot[] {
  return state.slots.filter((s) => s.type === type);
}

export function isSlotPassable(slot: RoomSlot | undefined): boolean {
  return Boolean(slot && slot.type !== 'rock_vein');
}
