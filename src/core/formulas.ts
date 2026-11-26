import { evaluateDungeonResonances } from './data/synergyAndMarks';
import { ABYSS_TECH_TREE } from './data/tortureAndTech';
import type { GameState, PrestigeState, RelicId, RoomResonanceId, TechId, UnitTier } from './types';

/**
 * V2.0 Centralized Numerical Balance Table (100-300h Multi-Epoch Long-Arc Idle Economy).
 */
export const BALANCE_CONFIG = {
  // Room upgrade & output formulas
  roomCostGrowth: 1.46,
  roomOutputLinearSlope: 0.35,
  roomMilestoneMultiplier: 1.13,
  roomMilestoneStep: 5,

  // Unit progression formulas (raised cap to Lv.100 for long-arc 100-wave scaling!)
  unitLevelSlope: 0.42,
  unitStarGrowth: 1.18,
  unitMaxLevel: 100,
  unitMaxStar: 5,
  unitBaseXpPerLevel: 240,
  unitXpGrowth: 1.072,

  // Overlord explicit upgrade scaling
  overlordMaxLevel: 100,
  overlordUpgradeBaseGold: 120,
  overlordUpgradeGrowth: 1.38,
  overlordGlobalAtkAuraPerLevel: 0.04,

  // Slap buff (Bullfrog Soul)
  slapHpCostRatio: 0.05,
  slapDurationSec: 30,
  slapMoveMult: 1.4,
  slapActionMult: 1.5,
  slapMasochistCritBonus: 0.2,

  // Wave & Hero scaling (V2.0 100-wave multi-epoch curve: Lv.1 AFK stops at W4-5, Epoch 1 Prestige W50 takes ~8-16h!)
  waveIntervalSec: 88,
  heroHpLinear: 0.30,
  heroHpExp: 1.118,
  heroBaseHpMult: 9.0,
  heroAtkLinear: 0.18,
  heroAtkExp: 1.092,
  heroBaseAtkMult: 2.55,
  heroGoldLinear: 0.24,
  heroGoldExp: 1.055,
  bossHpMultiplier: 2.35,
  bossAtkMultiplier: 1.38,
  bossGoldMultiplier: 4.5,

  // Economy & Payday
  paydayIntervalSec: 300,
  paydayBaseSalaryPerTier: [2, 8, 16, 28] as readonly [number, number, number, number],
  happinessMaxBonus: 0.25,
  bankruptSpeedPenalty: 0.15,

  // Hatchery & Satiety
  satietyDrainPerSecCombat: 0.9,
  satietyDrainPerSecWork: 0.35,
  chickenHealHpRatio: 0.35,
  chickenRestoreSatiety: 55,

  // Corruption Chamber (V2.5 Rebalanced)
  baseCaptureChance: 0.06,
  captureChancePerRoomLevel: 0.01,
  lilithCaptureBonus: 0.035,
  maxCaptureChance: 0.18,
  prisonerWillBase: 500,
  prisonerWillExp: 1.04,
  baseCorruptRate: 2.0,
  corruptRatePerRoomLevel: 0.15,
  corruptionManaPerSec: 0.45,

  // Fusion Altar
  fusionLevelKeepRatio: 0.65,
  fusionManaCost: 45,

  // Overlord passives
  lilithCorruptionSpeedBonus: 0.35,
  lilithCharmLifesteal: 0.2,
  elizabethTrapDamageBonus: 0.4,
  elizabethBloodThornHealRatio: 0.08,
  seraphinaGlobalSlowRatio: 0.18,
  seraphinaChillDamageBonus: 0.4,
  aureliaGoldBonus: 0.45,
  aureliaWorkshopBonus: 0.4,

  // Offline settlement base cap (12h base + up to +12h via Offline Chronicle tech = 24h!)
  offlineMaxSeconds: 12 * 3600,

  // Prestige threshold raised from 30 -> 50 for rich multi-chapter progression (W50..W100+ Endless)
  prestigeMinWave: 50,

  // Heart reconstitution duration
  heartReviveDurationSec: 5,
} as const;

/** Runtime-toggleable feature flags (e.g. A/B testing quirks/whims & uncapped gold parity audit) */
export const SIM_RUNTIME_FLAGS = {
  whimsEnabled: true,
  uncappedGold: false,
};

/** V2.5 Workshop overflow part -> gold conversion price (shared online & offline) */
export function workshopOverflowGoldPerPart(wave: number): number {
  const w = Math.max(1, wave);
  return Math.min(4.5, 0.6 + 0.08 * w);
}

/** V2.5 Engine-level Overcharge torture mana cost */
export function overchargeManaCost(wave: number): number {
  const w = Math.max(1, wave);
  return 18 + Math.round(1.4 * w);
}

/** V2.5 Opportune Overcharge golden window: will/maxWill in [0.58, 0.72] U [0.25, 0.39] */
export function isOverchargeCritWindow(will: number, maxWill: number): boolean {
  if (maxWill <= 0 || will <= 0) return false;
  const r = will / maxWill;
  return (r >= 0.58 && r <= 0.72) || (r >= 0.25 && r <= 0.39);
}

/**
 * V2.5 Single Gold Deposit Entrypoint (16 sites: 14 online + Cathedral ransom + offline settlement).
 * Overflow beyond `goldCap` is smelted into the Dark-Gold Bullion Vault via memoryless exponential
 * saturation: B <- Bmax - (Bmax - B) * exp(-x / Bmax), guaranteeing exact online/offline parity.
 */
export function depositGold(
  state: GameState,
  rawAmount: number,
): { addedGold: number; addedBullion: number } {
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return { addedGold: 0, addedBullion: 0 };
  }
  if (SIM_RUNTIME_FLAGS.uncappedGold) {
    state.gold += rawAmount;
    state.metrics.totalGoldEarned += rawAmount;
    return { addedGold: rawAmount, addedBullion: 0 };
  }

  const room = Math.max(0, state.goldCap - state.gold);
  const addedGold = Math.min(room, rawAmount);
  state.gold += addedGold;

  const overflow = rawAmount - addedGold;
  let addedBullion = 0;
  if (overflow > 0) {
    const bCap = Math.max(0, state.bullionCap || Math.round(state.goldCap * 1.5));
    state.bullionCap = bCap;
    const prevB = Math.max(0, Math.min(bCap, state.bullion ?? 0));
    if (bCap > 0 && prevB < bCap) {
      const nextB = bCap - (bCap - prevB) * Math.exp(-overflow / bCap);
      addedBullion = Math.max(0, nextB - prevB);
      state.bullion = Math.min(bCap, nextB);
    }
  }

  state.metrics.totalGoldEarned += rawAmount;
  return { addedGold, addedBullion };
}

/**
 * V2.5 Automatic 1:1 Bullion -> Gold Vault Refill whenever gold < goldCap.
 * Skipped when SIM_RUNTIME_FLAGS.uncappedGold is active.
 */
export function refillGoldFromBullion(state: GameState): number {
  if (SIM_RUNTIME_FLAGS.uncappedGold) return 0;
  const need = Math.max(0, state.goldCap - state.gold);
  const avail = Math.max(0, state.bullion ?? 0);
  const transfer = Math.min(need, avail);
  if (transfer <= 0) return 0;
  state.gold += transfer;
  state.bullion = Math.max(0, avail - transfer);
  return transfer;
}

const _milestonePowCache: number[] = Array.from({ length: 30 }, (_, m) =>
  Math.pow(BALANCE_CONFIG.roomMilestoneMultiplier, m),
);
const _starPowCache: number[] = Array.from({ length: BALANCE_CONFIG.unitMaxStar + 1 }, (_, st) =>
  st <= 1 ? 1 : Math.pow(BALANCE_CONFIG.unitStarGrowth, st - 1),
);
const _xpTableCache: number[] = Array.from({ length: BALANCE_CONFIG.unitMaxLevel + 2 }, (_, lv) =>
  lv <= 0 ? 1 : Math.round(BALANCE_CONFIG.unitBaseXpPerLevel * Math.pow(BALANCE_CONFIG.unitXpGrowth, lv - 1)),
);

export function roomUpgradeCost(baseCost: number, level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(baseCost * Math.pow(BALANCE_CONFIG.roomCostGrowth, safeLevel - 1));
}

export function overlordUpgradeCost(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(
    BALANCE_CONFIG.overlordUpgradeBaseGold * Math.pow(BALANCE_CONFIG.overlordUpgradeGrowth, safeLevel - 1),
  );
}

export function spellUpgradeCost(baseCost: number, level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(baseCost * Math.pow(1.55, safeLevel - 1));
}

export function techUpgradeCost(techId: TechId, currentLevel: number): number {
  const def = ABYSS_TECH_TREE.find((t) => t.id === techId);
  if (!def) return 999999;
  return Math.round(def.baseShardCost * Math.pow(def.costGrowth, Math.max(0, currentLevel)));
}

export function getCodexBonusMult(prestige: PrestigeState): number {
  const count =
    (prestige.codexUnits?.length ?? 0) +
    (prestige.codexHeroes?.length ?? 0) +
    (prestige.unlockedRelicCodex?.length ?? 0) +
    (prestige.codexImplements?.length ?? 0);
  return 1 + count * 0.015;
}

export function roomOutput(baseOutput: number, level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const linear = 1 + BALANCE_CONFIG.roomOutputLinearSlope * (safeLevel - 1);
  const milestones = Math.floor(safeLevel / BALANCE_CONFIG.roomMilestoneStep);
  let mPow = _milestonePowCache[milestones];
  if (mPow === undefined) {
    mPow = Math.pow(BALANCE_CONFIG.roomMilestoneMultiplier, milestones);
    _milestonePowCache[milestones] = mPow;
  }
  return baseOutput * linear * mPow;
}

export function unitStat(baseStat: number, level: number, star: number): number {
  const lv = Math.max(1, Math.min(BALANCE_CONFIG.unitMaxLevel, Math.floor(level)));
  const st = Math.max(1, Math.min(BALANCE_CONFIG.unitMaxStar, Math.floor(star)));
  let sPow = _starPowCache[st];
  if (sPow === undefined) {
    sPow = Math.pow(BALANCE_CONFIG.unitStarGrowth, st - 1);
    _starPowCache[st] = sPow;
  }
  return baseStat * (1 + BALANCE_CONFIG.unitLevelSlope * (lv - 1)) * sPow;
}

export function xpForNextLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  let xp = _xpTableCache[lv];
  if (xp === undefined) {
    xp = Math.round(BALANCE_CONFIG.unitBaseXpPerLevel * Math.pow(BALANCE_CONFIG.unitXpGrowth, lv - 1));
    _xpTableCache[lv] = xp;
  }
  return xp;
}

export function computeSlapHpCost(currentHp: number, maxHp: number): number {
  if (currentHp <= 1) return 0;
  const raw = Math.ceil(BALANCE_CONFIG.slapHpCostRatio * maxHp);
  return Math.min(Math.floor(currentHp) - 1, raw);
}

export function heroScaledHp(baseHp: number, wave: number, isBoss = false): number {
  const w = Math.max(1, wave);
  const val =
    baseHp *
    BALANCE_CONFIG.heroBaseHpMult *
    (1 + BALANCE_CONFIG.heroHpLinear * w) *
    Math.pow(BALANCE_CONFIG.heroHpExp, w);
  return Math.round(isBoss ? val * BALANCE_CONFIG.bossHpMultiplier : val);
}

export function heroScaledAtk(baseAtk: number, wave: number, isBoss = false): number {
  const w = Math.max(1, wave);
  const val =
    baseAtk *
    BALANCE_CONFIG.heroBaseAtkMult *
    (1 + BALANCE_CONFIG.heroAtkLinear * w) *
    Math.pow(BALANCE_CONFIG.heroAtkExp, w);
  return Math.round(isBoss ? val * BALANCE_CONFIG.bossAtkMultiplier : val);
}

export function heroScaledGold(baseDrop: number, wave: number, isBoss = false): number {
  const w = Math.max(1, wave);
  const val =
    baseDrop *
    (1 + BALANCE_CONFIG.heroGoldLinear * w) *
    Math.pow(BALANCE_CONFIG.heroGoldExp, w);
  return Math.round(isBoss ? val * BALANCE_CONFIG.bossGoldMultiplier : val);
}

export function prisonerMaxWill(wave: number): number {
  const w = Math.max(1, wave);
  return Math.round(BALANCE_CONFIG.prisonerWillBase * Math.pow(BALANCE_CONFIG.prisonerWillExp, w));
}

export function fusionChildLevel(lvA: number, lvB: number): number {
  return Math.max(1, Math.floor(BALANCE_CONFIG.fusionLevelKeepRatio * Math.max(lvA, lvB)));
}

export function recruitCostForTier(tier: UnitTier, existingCount: number): number {
  const base = tier === 0 ? 15 : tier === 1 ? 58 : tier === 2 ? 190 : 340;
  return Math.round(base * Math.pow(1.16, Math.max(0, existingCount)));
}

export function impSummonManaCost(existingImps: number): number {
  return Math.round(12 * Math.pow(1.25, Math.max(0, existingImps - 2)));
}

export function prestigeShardsForWave(peakWave: number): number {
  if (peakWave < BALANCE_CONFIG.prestigeMinWave) return 0;
  return Math.floor(18 + Math.pow(peakWave - BALANCE_CONFIG.prestigeMinWave + 1, 1.4) * 3.2);
}

export interface RelicModifiers {
  goldMult: number;
  manaMult: number;
  trapDamageMult: number;
  unitAtkMult: number;
  unitHpMult: number;
  unitSpeedMult: number;
  slapDurationBonus: number;
  slapBonusMult: number;
  corruptSpeedMult: number;
  captureChanceBonus: number;
  trainingXpMult: number;
  workshopPartMult: number;
  boulderDamageMult: number;
  frostDurationBonus: number;
  springDamageBonus: number;
  critChanceBonus: number;
  lifestealBonus: number;
  chickenHealBonus: number;
  paydayCostMult: number;
  heartHpMult: number;
  impWorkSpeedMult: number;
  spellPowerMult: number;
  altarLevelKeepBonus: number;
  poisonDamageMult: number;
  interestBonus: number;
  // V2.1 Unified Room Resonance layer (global boolean once, capped <= 1.35 per stat)
  spellCooldownMult: number;
  resonanceBonusTraitOnConvert: boolean;
  resonanceChickenFrenzySec: number;
  activeResonances: RoomResonanceId[];
}

export function createDefaultRelicModifiers(): RelicModifiers {
  return {
    goldMult: 1,
    manaMult: 1,
    trapDamageMult: 1,
    unitAtkMult: 1,
    unitHpMult: 1,
    unitSpeedMult: 1,
    slapDurationBonus: 0,
    slapBonusMult: 1,
    corruptSpeedMult: 1,
    captureChanceBonus: 0,
    trainingXpMult: 1,
    workshopPartMult: 1,
    boulderDamageMult: 1,
    frostDurationBonus: 0,
    springDamageBonus: 0,
    critChanceBonus: 0,
    lifestealBonus: 0,
    chickenHealBonus: 0,
    paydayCostMult: 1,
    heartHpMult: 1,
    impWorkSpeedMult: 1,
    spellPowerMult: 1,
    altarLevelKeepBonus: 0,
    poisonDamageMult: 1,
    interestBonus: 0,
    spellCooldownMult: 1,
    resonanceBonusTraitOnConvert: false,
    resonanceChickenFrenzySec: 0,
    activeResonances: [],
  };
}

export function computeRelicModifiers(
  relics: readonly RelicId[],
  prestige?: PrestigeState,
): RelicModifiers {
  const m = createDefaultRelicModifiers();
  for (const r of relics) {
    switch (r) {
      case 'bullfrog_pocket_watch':
        m.impWorkSpeedMult *= 1.25;
        m.unitSpeedMult *= 1.1;
        break;
      case 'succubus_lace_blindfold':
        m.corruptSpeedMult *= 1.3;
        m.captureChanceBonus += 0.08;
        break;
      case 'unbreakable_spike_gear':
        m.trapDamageMult *= 1.25;
        break;
      case 'abyssal_gold_chalice':
        m.goldMult *= 1.2;
        break;
      case 'obsidian_slap_glove':
        m.slapDurationBonus += 15;
        m.slapBonusMult *= 1.15;
        break;
      case 'roast_chicken_bell':
        m.chickenHealBonus += 0.15;
        break;
      case 'blood_moon_pendant':
        m.lifestealBonus += 0.08;
        break;
      case 'thorn_crown_shard':
        m.trapDamageMult *= 1.18;
        m.unitAtkMult *= 1.08;
        break;
      case 'imp_overtime_whip':
        m.impWorkSpeedMult *= 1.3;
        break;
      case 'boulder_grease_barrel':
        m.boulderDamageMult *= 1.45;
        break;
      case 'frost_core_prism':
        m.frostDurationBonus += 0.8;
        break;
      case 'spring_coil_blueprint':
        m.springDamageBonus += 35;
        m.trapDamageMult *= 1.12;
        break;
      case 'forbidden_grimoire_page':
        m.manaMult *= 1.25;
        break;
      case 'corrupted_rosary':
        m.corruptSpeedMult *= 1.25;
        m.unitHpMult *= 1.1;
        break;
      case 'dragonscale_pauldron':
        m.unitHpMult *= 1.22;
        break;
      case 'arachne_venom_vial':
        m.poisonDamageMult *= 1.5;
        break;
      case 'altar_resonance_stone':
        m.altarLevelKeepBonus += 0.15;
        break;
      case 'greedy_goblin_coin':
        m.goldMult *= 1.18;
        m.interestBonus += 0.01;
        break;
      case 'mana_siphon_crystal':
        m.manaMult *= 1.2;
        m.spellPowerMult *= 1.2;
        break;
      case 'shadow_whetstone':
        m.unitAtkMult *= 1.18;
        m.critChanceBonus += 0.08;
        break;
      case 'dungeon_heart_aegis':
        m.heartHpMult *= 1.35;
        break;
      case 'payday_tax_ledger':
        m.paydayCostMult *= 0.7;
        break;
      case 'crimson_velvet_choker':
        m.critChanceBonus += 0.12;
        m.lifestealBonus += 0.05;
        break;
      case 'soul_shackle_chain':
        m.captureChanceBonus += 0.12;
        break;
      case 'hellforge_bellows':
        m.workshopPartMult *= 1.35;
        break;
      case 'eclipse_hourglass':
        m.trainingXpMult *= 1.35;
        break;
      case 'vampiric_fang_brooch':
        m.lifestealBonus += 0.1;
        m.unitAtkMult *= 1.1;
        break;
      case 'skeleton_metronome':
        m.unitSpeedMult *= 1.18;
        break;
      case 'emerald_slime_gel':
        m.unitHpMult *= 1.18;
        m.chickenHealBonus += 0.1;
        break;
      case 'overlord_signet_ring':
        m.unitAtkMult *= 1.12;
        m.unitHpMult *= 1.12;
        m.goldMult *= 1.12;
        m.manaMult *= 1.12;
        break;
    }
  }

  // Apply permanent Abyssal Tech Tree & Codex Mastery multipliers
  if (prestige?.techLevels) {
    const t = prestige.techLevels;
    const codex = getCodexBonusMult(prestige);
    m.goldMult *= (1 + (t.golden_greed ?? 0) * 0.15) * codex;
    m.manaMult *= 1 + (t.arcane_well ?? 0) * 0.15;
    m.spellPowerMult *= 1 + (t.arcane_well ?? 0) * 0.15;
    m.trapDamageMult *= 1 + (t.trap_engineering ?? 0) * 0.18;
    m.workshopPartMult *= 1 + (t.trap_engineering ?? 0) * 0.15;
    m.corruptSpeedMult *= 1 + (t.torture_mastery ?? 0) * 0.22;
    m.captureChanceBonus += (t.torture_mastery ?? 0) * 0.02;
    m.unitAtkMult *= codex;
  }

  return m;
}

export const RESONANCE_STAT_CAP = 1.35;

/**
 * V2.1 Single Source of Truth Global Modifiers (Relics × Tech × Codex × Room Resonances).
 * Shared 100% by online engine `getMods()` and offline `settleOfflineProgress()`.
 * Each of the 4 room resonances activates globally at most ONCE (no stacking) and each
 * resonance stat multiplier is strictly clamped <= 1.35.
 */
export function computeGlobalModifiers(state: GameState): RelicModifiers {
  const m = computeRelicModifiers(state.relics, state.prestige);
  const res = evaluateDungeonResonances(state.slots);
  m.activeResonances = res.activeResonances;

  let resCorrupt = 1;
  let resMana = 1;
  let resTrain = 1;
  let resTrap = 1;
  let resParts = 1;

  for (const id of res.activeResonances) {
    if (id === 'dark_inquisition_rite') {
      resCorrupt = Math.min(RESONANCE_STAT_CAP, resCorrupt * 1.3);
      m.resonanceBonusTraitOnConvert = true;
    } else if (id === 'arcane_throne_corridor') {
      m.spellCooldownMult = 0.8;
      resMana = Math.min(RESONANCE_STAT_CAP, resMana * 1.25);
    } else if (id === 'demon_boot_canteen') {
      resTrain = Math.min(RESONANCE_STAT_CAP, resTrain * 1.35);
      m.resonanceChickenFrenzySec = 12;
    } else if (id === 'forge_kill_array') {
      resTrap = Math.min(RESONANCE_STAT_CAP, resTrap * 1.3);
      resParts = Math.min(RESONANCE_STAT_CAP, resParts * 1.25);
    } else if (id === 'iron_transfer_ward') {
      m.captureChanceBonus += 0.04;
    }
  }

  m.corruptSpeedMult *= resCorrupt;
  m.manaMult *= resMana;
  m.trainingXpMult *= resTrain;
  m.trapDamageMult *= resTrap;
  m.workshopPartMult *= resParts;

  return m;
}
