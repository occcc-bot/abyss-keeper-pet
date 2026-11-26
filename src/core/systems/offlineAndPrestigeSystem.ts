import { ROOM_DEFS } from '../data/roomsAndTraps';
import { defaultCorruptionMarkForSpecies, getUnitRoomWorkOutputMult } from '../data/synergyAndMarks';
import { ABYSS_TECH_TREE, TORTURE_IMPLEMENTS } from '../data/tortureAndTech';
import { ABYSSAL_UNIT_DEFS, OVERLORD_DEFS } from '../data/units';
import { t } from '../i18n';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  depositGold,
  heroScaledGold,
  prestigeShardsForWave,
  roomOutput,
  techUpgradeCost,
  workshopOverflowGoldPerPart,
} from '../formulas';
import {
  createDefaultPrestige,
  createInitialGameState,
  findRoomSlotByType,
  getThroneSlot,
  grantUnitXp,
  pushEvent,
  recalcCapsAndOverlord,
  slotCenterX,
} from '../ecs/stateFactory';
import { completePrisonerCorruption } from './corruptionAndFusionSystem';
import { backfillProgressionForMigratedSave } from './progressionSystem';
import {
  SAVE_VERSION,
  THRONE_SLOT_INDEX,
  type CorruptedTargetId,
  type GameState,
  type OfflineSettlementReport,
  type OverlordId,
  type TechId,
} from '../types';

export function settleOfflineProgress(
  state: GameState,
  elapsedSeconds: number,
): OfflineSettlementReport {
  const safeElapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const offlineTech = state.prestige.techLevels?.offline_chronicle ?? 0;
  const maxOfflineSec = BALANCE_CONFIG.offlineMaxSeconds + offlineTech * 2 * 3600;
  const offlineEff = 1 + offlineTech * 0.1;
  const effectiveSeconds = Math.min(maxOfflineSec, safeElapsed);
  const farmWave = Math.max(
    1,
    state.farmMode ? state.wave : state.highestWaveCleared || state.wave,
  );

  if (effectiveSeconds < 5) {
    return {
      elapsedSeconds: safeElapsed,
      effectiveSeconds: 0,
      farmWave,
      goldGained: 0,
      bullionGained: 0,
      manaGained: 0,
      trapPartsGained: 0,
      xpPerUnit: 0,
      prisonersConverted: 0,
    };
  }

  const mods = computeGlobalModifiers(state);
  const aureliaGoldMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaGoldBonus : 1;
  const aureliaWorkshopMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaWorkshopBonus : 1;

  // Match V2.0 Farm Mode wave cycle (~56s: 42s waveTimer + ~14s walk & combat)
  const wavesPerHour = 3600 / 56;
  const estimatedWaves = (effectiveSeconds / 3600) * wavesPerHour;
  const avgHeroesPerWave = Math.min(8, 2 + Math.floor(farmWave / 4));
  const avgHeroGold = heroScaledGold(22, farmWave, false) * 1.09;
  const waveGold = estimatedWaves * avgHeroesPerWave * avgHeroGold * mods.goldMult * aureliaGoldMult;

  const impCount = state.units.filter((u) => u.species === 'imp').length;
  const impOreGold =
    impCount * (0.85 + farmWave * 0.09) * mods.impWorkSpeedMult * mods.goldMult * aureliaGoldMult * effectiveSeconds;

  let treasuryInterestGold = 0;
  for (const s of state.slots) {
    if (s.type === 'treasury') {
      const capPerSec = (0.35 + s.level * 0.18) * (1 + mods.interestBonus * 10);
      treasuryInterestGold += capPerSec * 0.65 * mods.goldMult * aureliaGoldMult * effectiveSeconds;
    }
  }

  // V2.5 Compute Workshop parts + overflow gold (identical formula to online!) before gold deposit
  let trapPartsGained = 0;
  let rawPartsTotal = 0;
  for (const s of state.slots) {
    if (s.type !== 'workshop') continue;
    const workers = state.units.filter((u) => u.assignedSlot === s.index && u.species !== 'imp');
    const effWorkers =
      workers.length > 0
        ? workers.reduce((acc, u) => acc + getUnitRoomWorkOutputMult(u), 0)
        : 0.5;
    rawPartsTotal +=
      roomOutput(ROOM_DEFS.workshop.baseOutput, s.level) *
      effWorkers *
      mods.workshopPartMult *
      aureliaWorkshopMult *
      effectiveSeconds *
      offlineEff;
  }
  let workshopOverflowGold = 0;
  if (rawPartsTotal > 0) {
    const partRoom = Math.max(0, state.trapPartsCap - state.trapParts);
    trapPartsGained = Math.min(partRoom, Math.round(rawPartsTotal));
    state.trapParts = Math.min(state.trapPartsCap, state.trapParts + trapPartsGained);
    const overflowParts = Math.max(0, rawPartsTotal - partRoom);
    if (overflowParts > 0) {
      workshopOverflowGold =
        overflowParts * workshopOverflowGoldPerPart(farmWave) * mods.goldMult * aureliaGoldMult;
    }
  }

  const paydays = Math.floor(effectiveSeconds / BALANCE_CONFIG.paydayIntervalSec);
  let billPerPayday = 0;
  for (const u of state.units) {
    const base = BALANCE_CONFIG.paydayBaseSalaryPerTier[u.tier];
    billPerPayday += Math.round(base * (1 + (u.level + 4) * 0.06) * mods.paydayCostMult);
  }
  const netGoldRaw = Math.max(
    0,
    (waveGold + impOreGold + treasuryInterestGold) * offlineEff + workshopOverflowGold - paydays * billPerPayday,
  );
  const deposited = depositGold(state, Math.round(netGoldRaw));
  const goldGained = Math.round(deposited.addedGold);
  const bullionGained = Math.round(deposited.addedBullion);

  const throne = getThroneSlot(state);
  let manaPerSec = roomOutput(ROOM_DEFS.throne.baseOutput, throne.level) * mods.manaMult;
  for (const s of state.slots) {
    if (s.type !== 'library') continue;
    const workers = state.units.filter((u) => u.assignedSlot === s.index && u.species !== 'imp');
    const effWorkers =
      workers.length > 0
        ? workers.reduce((acc, u) => acc + getUnitRoomWorkOutputMult(u), 0)
        : 0.5;
    manaPerSec += roomOutput(ROOM_DEFS.library.baseOutput, s.level) * effWorkers * mods.manaMult;
  }
  const manaGained = Math.min(
    Math.max(0, state.manaCap - state.mana),
    Math.round(manaPerSec * effectiveSeconds * offlineEff),
  );
  state.mana = Math.min(state.manaCap, state.mana + manaGained);
  state.metrics.totalManaEarned += manaGained;

  let trainXpPerSec = 0;
  for (const s of state.slots) {
    if (s.type !== 'training') continue;
    const workers = state.units.filter((u) => u.assignedSlot === s.index && u.species !== 'imp');
    const collarBoost =
      workers.length > 0
        ? workers.reduce((acc, u) => acc + getUnitRoomWorkOutputMult(u), 0) / workers.length
        : 1.0;
    trainXpPerSec += roomOutput(ROOM_DEFS.training.baseOutput, s.level) * mods.trainingXpMult * collarBoost * 0.45;
  }
  const combatXp = estimatedWaves * avgHeroesPerWave * (5 + farmWave * 1.1);
  const xpPerUnit = Math.round((combatXp + trainXpPerSec * effectiveSeconds * 0.25) * offlineEff);

  for (const u of state.units) {
    if (u.species !== 'imp') {
      grantUnitXp(state, u, xpPerUnit);
      u.hp = u.maxHp;
      u.satiety = 100;
    }
  }

  // V2.4 Invariant I2: Offline settlement ALWAYS forces Safeword Mercy (0 deaths, 0 raids)
  // Also return any eligible nemesisPool entries as lost-knock returns (will <= 0.66*max, I1)
  state.noMercyMode = false;
  if (Array.isArray(state.nemesisPool) && state.nemesisPool.length > 0) {
    const prisonSlot = findRoomSlotByType(state, 'prison');
    const maxPrison = prisonSlot ? Math.min(8, 4 + Math.floor(prisonSlot.level / 2)) : 0;
    const remaining: typeof state.nemesisPool = [];
    for (const nem of state.nemesisPool) {
      const inPrison = state.prisoners.filter((p) => p.cell === 'prison').length;
      if (prisonSlot && inPrison < maxPrison) {
        const nextWill = Math.min(nem.will, Math.round(nem.maxWill * 0.66));
        state.prisoners.push({
          id: `prisoner_nem_${nem.id}`,
          sourceHero: nem.sourceHero,
          targetSpecies: nem.targetSpecies,
          heroName: nem.heroName,
          waveCaptured: Math.max(1, farmWave),
          will: nextWill,
          maxWill: nem.maxWill,
          progress: Math.min(1, 1 - nextWill / Math.max(1, nem.maxWill)),
          hp: 100,
          cell: 'prison',
          mercy: false,
          dessertHooked: nem.grudgeTag === 'dessert',
          flavorHits: 0,
          feedCd: 0,
          ward: 0.5,
          satiety: 0,
          drowsyTimer: 0,
          overchargeTimer: 0,
          overchargeCrit: false,
          vintageWaves: nem.vintageWaves ?? 0,
          abandonedByCathedral: (nem.vintageWaves ?? 0) >= 3,
          isNemesisReturn: true,
          escortedByHeroId: null,
        });
      } else {
        remaining.push(nem);
      }
    }
    state.nemesisPool = remaining;
  }

  let prisonersConverted = 0;
  const chamber = findRoomSlotByType(state, 'corruption');
  const implement = TORTURE_IMPLEMENTS[state.equippedImplement] ?? TORTURE_IMPLEMENTS.electric_chair;
  if (chamber && state.prisoners.length > 0) {
    const chamberWorkers = state.units.filter((u) => u.assignedSlot === chamber.index && u.species !== 'imp');
    const collarMult =
      chamberWorkers.length > 0
        ? 1 + chamberWorkers.reduce((acc, u) => acc + (getUnitRoomWorkOutputMult(u) - 1), 0) * 0.5
        : 1;
    const rate =
      BALANCE_CONFIG.baseCorruptRate *
      (1 + BALANCE_CONFIG.corruptRatePerRoomLevel * (chamber.level - 1)) *
      implement.speedMult *
      mods.corruptSpeedMult *
      collarMult *
      (state.overlordId === 'lilith' ? 1 + BALANCE_CONFIG.lilithCorruptionSpeedBonus : 1);
    let totalWillDrain = rate * effectiveSeconds;
    while (state.prisoners.length > 0 && totalWillDrain > 0) {
      const p = state.prisoners[0]!;
      if (totalWillDrain >= p.will) {
        totalWillDrain -= p.will;
        p.will = 0;
        p.progress = 1;
        state.prisoners.shift();
        completePrisonerCorruption(state, p, chamber.index);
        prisonersConverted += 1;
      } else {
        p.will -= totalWillDrain;
        p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
        totalWillDrain = 0;
      }
    }
  }

  state.elapsedSeconds += effectiveSeconds;
  state.lastSaveTimestampMs = Date.now();

  pushEvent(state, {
    type: 'offline_settled',
    value: goldGained + bullionGained,
    text:
      bullionGained > 0
        ? t(
            `离线 ${Math.round(effectiveSeconds / 60)} 分钟结算：+${goldGained} 金币、▪+${bullionGained} 暗金金砖、+${manaGained} 魔力、经验 +${xpPerUnit}`,
            `Offline ${Math.round(effectiveSeconds / 60)}m summary: +${goldGained}G, ▪+${bullionGained} Bullion, +${manaGained} Mana, +${xpPerUnit} XP`,
          )
        : t(
            `离线 ${Math.round(effectiveSeconds / 60)} 分钟结算：+${goldGained} 金币、+${manaGained} 魔力、经验 +${xpPerUnit}`,
            `Offline ${Math.round(effectiveSeconds / 60)}m summary: +${goldGained}G, +${manaGained} Mana, +${xpPerUnit} XP`,
          ),
  });

  return {
    elapsedSeconds: safeElapsed,
    effectiveSeconds,
    farmWave,
    goldGained,
    bullionGained,
    manaGained,
    trapPartsGained,
    xpPerUnit,
    prisonersConverted,
  };
}

export type PrestigeTalentKey = keyof GameState['prestige']['talents'];

export function prestigeTalentCost(key: PrestigeTalentKey, currentLevel: number): number {
  const base: Record<PrestigeTalentKey, number> = {
    extraStartingSlot: 12,
    autoSlapAura: 15,
    rareTraitBoost: 10,
    abyssalMight: 8,
  };
  return Math.round(base[key] * Math.pow(1.6, currentLevel));
}

export function buyPrestigeTalent(state: GameState, key: PrestigeTalentKey): boolean {
  const mapToTech: Record<PrestigeTalentKey, TechId> = {
    extraStartingSlot: 'deep_excavation',
    autoSlapAura: 'auto_slap_aura',
    rareTraitBoost: 'rare_trait_boost',
    abyssalMight: 'abyssal_might',
  };
  const ok = buyAbyssTech(state, mapToTech[key]);
  if (ok) {
    state.prestige.talents[key] = state.prestige.techLevels[mapToTech[key]];
  }
  return ok;
}

export function buyAbyssTech(state: GameState, techId: TechId): boolean {
  const def = ABYSS_TECH_TREE.find((t) => t.id === techId);
  if (!def) return false;
  const current = state.prestige.techLevels[techId] ?? 0;
  if (current >= def.maxLevel) return false;
  const cost = techUpgradeCost(techId, current);
  if (state.prestige.abyssalShards < cost) return false;
  state.prestige.abyssalShards -= cost;
  state.prestige.techLevels[techId] = current + 1;
  // Sync legacy talent mirrors
  state.prestige.talents.abyssalMight = state.prestige.techLevels.abyssal_might;
  state.prestige.talents.extraStartingSlot = state.prestige.techLevels.deep_excavation;
  state.prestige.talents.autoSlapAura = state.prestige.techLevels.auto_slap_aura;
  state.prestige.talents.rareTraitBoost = state.prestige.techLevels.rare_trait_boost;
  recalcCapsAndOverlord(state);
  return true;
}

export function unlockOverlordWithShards(state: GameState, overlordId: OverlordId): boolean {
  if (state.prestige.unlockedOverlords.includes(overlordId)) return true;
  const def = OVERLORD_DEFS[overlordId];
  if (state.prestige.abyssalShards < def.unlockCostShards) return false;
  state.prestige.abyssalShards -= def.unlockCostShards;
  state.prestige.unlockedOverlords.push(overlordId);
  return true;
}

export function triggerPrestige(
  state: GameState,
  nextOverlordId?: OverlordId,
): GameState | null {
  const earned = prestigeShardsForWave(state.highestWaveCleared);
  if (earned <= 0) return null;

  const nextPrestige = structuredClone(state.prestige);
  nextPrestige.epoch += 1;
  nextPrestige.abyssalShards += earned;
  nextPrestige.totalShardsEarned += earned;
  nextPrestige.overlordConstellation += 1;

  const chosenOverlord =
    nextOverlordId && nextPrestige.unlockedOverlords.includes(nextOverlordId)
      ? nextOverlordId
      : state.overlordId;

  const fresh = createInitialGameState(
    state.seed + nextPrestige.epoch * 97,
    chosenOverlord,
    nextPrestige,
  );
  pushEvent(fresh, {
    type: 'prestige_triggered',
    value: earned,
    text: t(
      `位面侵蚀完成！踏入深渊第 ${nextPrestige.epoch} 纪元，获得 ${earned} 深渊魔晶！`,
      `Planar Erosion complete! Entered Epoch ${nextPrestige.epoch} (+${earned} Abyssal Shards)!`,
    ),
  });
  return fresh;
}

export function exportSaveBase64(state: GameState): string {
  // Strip transient VFX queue, noMercyMode, unit whims, and hero raid states before serializing (V2.4 §5.3)
  const cleanUnits = state.units.map((u) => {
    if (!u.whim && u.activity !== 'whim') return u;
    const copy = { ...u };
    delete copy.whim;
    if (copy.activity === 'whim') copy.activity = 'idle';
    return copy;
  });
  const cleanHeroes = state.heroes.map((h) => {
    if (!h.raid) return h;
    const copy = { ...h };
    delete copy.raid;
    return copy;
  });
  const cleanPrisoners = state.prisoners.map((p) =>
    p.escortedByHeroId ? { ...p, escortedByHeroId: null } : p,
  );
  const clean = {
    ...state,
    vfxQueue: [],
    noMercyMode: false,
    units: cleanUnits,
    heroes: cleanHeroes,
    prisoners: cleanPrisoners,
  };
  const json = JSON.stringify(clean);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf-8').toString('base64');
  }
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

type SaveMigrationFn = (raw: GameState) => GameState;

export const SAVE_MIGRATIONS: Record<number, SaveMigrationFn> = {
  // v2 -> v3: harden spellCooldowns/spellLevels/hand/metrics, add V2.1 corruptionMark & cutinMuted
  2: (raw: GameState): GameState => {
    const s = raw as GameState & Record<string, unknown>;
    s.vfxQueue ??= [];
    s.overlordLevel ??= 1;
    s.spellCooldowns ??= {
      abyss_lightning: 0,
      demon_frenzy: 0,
      charm_mist: 0,
      abyss_blackhole: 0,
    };
    s.spellCooldowns.abyss_lightning ??= 0;
    s.spellCooldowns.demon_frenzy ??= 0;
    s.spellCooldowns.charm_mist ??= 0;
    s.spellCooldowns.abyss_blackhole ??= 0;
    s.spellLevels ??= {
      abyss_lightning: 1,
      demon_frenzy: 1,
      charm_mist: 1,
      abyss_blackhole: 1,
    };
    s.spellLevels.abyss_lightning ??= 1;
    s.spellLevels.demon_frenzy ??= 1;
    s.spellLevels.charm_mist ??= 1;
    s.spellLevels.abyss_blackhole ??= 1;
    s.equippedImplement ??= 'electric_chair';
    s.unlockedImplements ??= ['electric_chair'];
    s.cutinMuted ??= false;
    s.hand ??= {
      heldUnitId: null,
      heldHeroId: null,
      pointerX: slotCenterX(THRONE_SLOT_INDEX),
      pointerY: 160,
      slapCooldown: 0,
    };
    s.hand.heldHeroId ??= null;
    s.hand.heldUnitId ??= null;
    s.prestige ??= createDefaultPrestige();
    s.metrics ??= {
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
      peakWaveReached: s.wave ?? 1,
    };
    s.metrics.totalThievesCaught ??= 0;
    if (Array.isArray(s.units)) {
      for (const u of s.units) {
        const def = ABYSSAL_UNIT_DEFS[u.species];
        if (def?.tier === 3 && !u.corruptionMark) {
          u.corruptionMark = defaultCorruptionMarkForSpecies(u.species as CorruptedTargetId);
        }
        u.markChangedOnce ??= false;
      }
    }
    s.version = 3;
    return s;
  },
  // v3 -> v4: V2.3 progressive territory & feature gating + cross-epoch storySeen backfill
  3: (raw: GameState): GameState => {
    const s = raw as GameState;
    s.prestige ??= createDefaultPrestige();
    s.prestige.storySeen ??= [];
    backfillProgressionForMigratedSave(s);
    s.version = 4;
    return s;
  },
  // v4 -> v5: V2.4 Abyssal Prison, 12-hero raids, ECG dual-bar torture, 14 quirks, Gazette chronicle
  4: (raw: GameState): GameState => {
    const s = raw as GameState;
    const hasPrison = s.slots.some((sl) => sl.type === 'prison');
    if (Array.isArray(s.prisoners)) {
      for (const p of s.prisoners) {
        p.hp ??= 100;
        p.cell ??= hasPrison ? 'prison' : 'chamber';
        p.mercy ??= false;
        p.dessertHooked ??= false;
        p.flavorHits ??= 0;
        p.feedCd ??= 0;
        p.escortedByHeroId = null;
      }
    }
    s.capturesThisWave = s.capturedThisWave ? 1 : 0;
    s.wavesSinceCapture = 0;
    s.raidsThisWave = 0;
    s.nemesisPool ??= [];
    s.pendingReinforcements = 0;
    s.waveSpawnSeq = s.metrics?.peakWaveReached ?? s.wave ?? 1;
    s.noMercyMode = false;
    s.martyrBountyWaves = 0;
    s.ghostTutorTimer = 0;
    s.shatterStreak ??= { wave: 0, count: 0 };
    s.chronicle ??= {};
    s.progression ??= {
      sandbox: false,
      territoryMax: 12,
      unlocked: [],
      firstBuildDiscount: { prison: !hasPrison, corruption: true, altar: true },
      pendingUnlockPulse: [],
    };
    s.progression.firstBuildDiscount ??= { prison: !hasPrison, corruption: true, altar: true };
    if (s.progression.firstBuildDiscount.prison === undefined) {
      s.progression.firstBuildDiscount.prison = !hasPrison;
    }
    if (
      ((s.highestWaveCleared ?? 0) >= 1 || (s.prestige?.epoch ?? 1) > 1 || hasPrison) &&
      !s.progression.unlocked.includes('room_prison')
    ) {
      s.progression.unlocked.push('room_prison');
    }
    s.prestige ??= createDefaultPrestige();
    s.prestige.codexQuirks ??= [];
    s.prestige.codexWeakness ??= [];
    s.version = 5;
    return s;
  },
  // v5 -> v6: V2.5 Dark-Gold Bullion Vault, Holy Ward (migrated ward=0), Dual Chicken & Overcharge
  5: (raw: GameState): GameState => {
    const s = raw as GameState;
    s.bullion ??= 0;
    s.bullionCap ??= Math.round((s.goldCap || 1500) * 1.5);
    s.overchargeCd ??= 0;
    s.chamberSlapCd ??= 0;
    if (Array.isArray(s.prisoners)) {
      for (const p of s.prisoners) {
        p.ward ??= 0; // Zero retroactive penalty for migrated v5 captives!
        p.satiety ??= 0;
        p.drowsyTimer ??= 0;
        p.overchargeTimer ??= 0;
        p.overchargeCrit ??= false;
        p.vintageWaves ??= 0;
        p.abandonedByCathedral ??= false;
      }
    }
    s.version = 6;
    return s;
  },
};

export function migrateSaveState(parsed: GameState): GameState {
  if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.slots)) {
    throw new Error('Invalid Abyss Keeper Pet save payload');
  }
  // Automatically reset incompatible v1 12-slot saves cleanly while preserving prestige progress!
  if (parsed.version < 2 || parsed.slots.length < 28) {
    return createInitialGameState(parsed.seed || 1337, parsed.overlordId || 'lilith', parsed.prestige);
  }
  let current = parsed;
  while (current.version < SAVE_VERSION) {
    const step = SAVE_MIGRATIONS[current.version];
    if (!step) break;
    current = step(current);
  }
  // Always ensure defensive defaults on v3+
  current.vfxQueue ??= [];
  current.spellCooldowns ??= {
    abyss_lightning: 0,
    demon_frenzy: 0,
    charm_mist: 0,
    abyss_blackhole: 0,
  };
  current.spellCooldowns.abyss_blackhole ??= 0;
  current.spellLevels ??= {
    abyss_lightning: 1,
    demon_frenzy: 1,
    charm_mist: 1,
    abyss_blackhole: 1,
  };
  current.cutinMuted ??= false;
  current.hand ??= {
    heldUnitId: null,
    heldHeroId: null,
    pointerX: slotCenterX(THRONE_SLOT_INDEX),
    pointerY: 160,
    slapCooldown: 0,
  };
  // Never persist transient Hand-of-Evil drag lock, noMercyMode, whims, or hero raids across reloads!
  current.hand.heldUnitId = null;
  current.hand.heldHeroId = null;
  current.noMercyMode = false;
  if (Array.isArray(current.units)) {
    for (const u of current.units) {
      if (u.activity === 'dangling' || u.activity === 'whim') u.activity = 'idle';
      delete u.whim;
    }
  }
  if (Array.isArray(current.heroes)) {
    for (const h of current.heroes) {
      delete h.raid;
      h.valkyrieWarnActive = false;
    }
  }
  if (Array.isArray(current.prisoners)) {
    const hasPrison = current.slots.some((sl) => sl.type === 'prison');
    for (const p of current.prisoners) {
      p.hp ??= 100;
      p.cell ??= hasPrison ? 'prison' : 'chamber';
      p.mercy ??= false;
      p.dessertHooked ??= false;
      p.flavorHits ??= 0;
      p.feedCd ??= 0;
      p.ward ??= 0;
      p.satiety ??= 0;
      p.drowsyTimer ??= 0;
      p.overchargeTimer ??= 0;
      p.overchargeCrit ??= false;
      p.vintageWaves ??= 0;
      p.abandonedByCathedral ??= false;
      p.escortedByHeroId = null;
    }
  }
  current.bullion ??= 0;
  current.bullionCap ??= Math.round((current.goldCap || 1500) * 1.5);
  current.overchargeCd ??= 0;
  current.chamberSlapCd ??= 0;
  current.bullionRefillVfxCd = 0;
  current.capturesThisWave ??= current.capturedThisWave ? 1 : 0;
  current.wavesSinceCapture ??= 0;
  current.raidsThisWave ??= 0;
  current.nemesisPool ??= [];
  current.pendingReinforcements ??= 0;
  current.waveSpawnSeq ??= current.metrics?.peakWaveReached ?? current.wave ?? 1;
  current.martyrBountyWaves ??= 0;
  current.ghostTutorTimer ??= 0;
  current.shatterStreak ??= { wave: 0, count: 0 };
  current.chronicle ??= {};
  current.metrics.totalThievesCaught ??= 0;
  current.metrics.prisonersDied ??= 0;
  current.metrics.raidsStarted ??= 0;
  current.metrics.prisonersEscaped ??= 0;
  current.metrics.twinSuitesTriggered ??= 0;
  current.metrics.perfectFinishes ??= 0;
  current.prestige.storySeen ??= [];
  current.prestige.codexQuirks ??= [];
  current.prestige.codexWeakness ??= [];
  if (!current.progression) {
    backfillProgressionForMigratedSave(current);
  }
  current.progression.firstBuildDiscount ??= { prison: true, corruption: true, altar: true };
  current.progression.firstBuildDiscount.prison ??= !current.slots.some((sl) => sl.type === 'prison');
  current.version = SAVE_VERSION;
  return current;
}

export function importSaveBase64(encoded: string): GameState {
  let json: string;
  if (typeof Buffer !== 'undefined') {
    json = Buffer.from(encoded.trim(), 'base64').toString('utf-8');
  } else {
    const binary = atob(encoded.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    json = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(json) as GameState;
  return migrateSaveState(parsed);
}
