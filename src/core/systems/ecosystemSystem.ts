import { RELIC_DEFS } from '../data/relics';
import { ROOM_DEFS, TRAP_DEFS } from '../data/roomsAndTraps';
import { getUnitRoomWorkOutputMult } from '../data/synergyAndMarks';
import { evaluateProgression } from './progressionSystem';
import { locIdleBanterLines, locRelic, locUnitName, t } from '../i18n';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  depositGold,
  roomOutput,
  workshopOverflowGoldPerPart,
  type RelicModifiers,
} from '../formulas';
import {
  getMaxCombatUnits,
  getThroneSlot,
  grantUnitXp,
  pushEvent,
  pushVfx,
  recalcCapsAndOverlord,
  refillGoldAndEmitVfx,
  slotCenterX,
  xToSlotIndex,
} from '../ecs/stateFactory';
import type { SeededRng } from '../rng';
import {
  SIM_DT,
  THRONE_SLOT_INDEX,
  type AbyssalUnit,
  type GameState,
  type HeroUnit,
  type RoomSlot,
} from '../types';
import { addPrisoner } from './corruptionAndFusionSystem';
import { getPrisonCapacity, getPrisonSlot, getTotalPrisonerCapacity } from './prisonSystem';
import { stepQuirkSystem } from './quirkSystem';

const _ROOM_DEFS = ROOM_DEFS;
const _TRAP_DEFS = TRAP_DEFS;
const SLOT_WIDTH_HALF = 68;

/**
 * Fast-path 1-second (20-tick) batch advance when dungeon is completely stationary & idle
 * (primarily accelerates headless 8-hour Monte Carlo verification).
 */
export function tryStepIdleSecond(state: GameState, _mods: RelicModifiers): boolean {
  if (
    state.heroes.length > 0 ||
    state.boulders.length > 0 ||
    state.prisoners.length > 0 ||
    state.heartReviveTimer > 0 ||
    state.hand.heldUnitId !== null ||
    state.hand.heldHeroId !== null ||
    state.overlordHp < state.overlordMaxHp * 0.92 ||
    (state.prestige.techLevels?.auto_slap_aura ?? state.prestige.talents.autoSlapAura) > 0 ||
    state.waveTimer <= 1.05 ||
    state.paydayTimer <= 1.05 ||
    state.banterTimer <= 1.05
  ) {
    return false;
  }

  let treasurySlot = state.slots[0]!;
  let hatchery: RoomSlot | undefined;
  let hatcheryMaxChickens = 0;

  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i]!;
    if (slot.type === 'rock_vein') {
      if (slot.markedForDig) return false;
      continue;
    }
    if (slot.looseGold > 0 || slot.wallIntegrity < 100) return false;
    if (slot.trap) {
      if (slot.trap.cooldownTimer > 0 && slot.trap.cooldownTimer < 1.05) return false;
      if (
        slot.trap.charges < slot.trap.maxCharges &&
        state.trapParts >= _TRAP_DEFS[slot.trap.type].refillPartCost
      ) {
        return false;
      }
    }
    if (slot.type === 'treasury') treasurySlot = slot;
    else if (slot.type === 'hatchery') {
      hatchery = slot;
      hatcheryMaxChickens = Math.min(10, Math.floor(roomOutput(_ROOM_DEFS.hatchery.baseOutput, slot.level)));
      if (
        slot.chickens < hatcheryMaxChickens &&
        slot.chickenSpawnTimer <= 1.05 * (1 + (slot.level - 1) * 0.18)
      ) {
        return false;
      }
    }
  }

  const canEatChicken = Boolean(hatchery && hatchery.chickens > 0);
  let corruptedSisterCount = 0;
  for (let i = 0; i < state.units.length; i++) {
    const u = state.units[i]!;
    if (
      u.activity === 'dangling' ||
      u.activity === 'altar_bound' ||
      (u.slapBuffTimer > 0 && u.slapBuffTimer < 1.05) ||
      (u.slapReactTimer > 0 && u.slapReactTimer < 1.05) ||
      (u.frenzyBuffTimer > 0 && u.frenzyBuffTimer < 1.05) ||
      (u.recoveryTimer ?? 0) > 0 ||
      (u.attackCooldown > 0 && u.attackCooldown < 1.05) ||
      (u.attackAnimTimer ?? 0) > 0 ||
      (u.eatAnimTimer ?? 0) > 0
    ) {
      return false;
    }
    if (u.species === 'imp') {
      // Imps actively shuttle between Frontier Ore & Backyard Treasury, so only fast-step if hauling disabled
      return false;
    } else {
      if (canEatChicken && (u.satiety <= 32 || u.hp < u.maxHp * 0.55)) return false;
      if (!canEatChicken && u.satiety <= 30.2 && u.satiety > 30) return false;
      const targetSlotIdx = u.assignedSlot ?? u.slotIndex;
      const targetSlot = state.slots[targetSlotIdx];
      if (targetSlot && targetSlot.type !== 'rock_vein' && u.x !== slotCenterX(targetSlot.index)) {
        return false;
      }
      if (u.species === 'corrupted_sister' && u.hp > 0) corruptedSisterCount += 1;
    }
  }

  void treasurySlot;
  void corruptedSisterCount;
  return false;
}

export function countCorruptedSisters(state: GameState): number {
  let count = 0;
  for (let i = 0, n = state.units.length; i < n; i++) {
    const u = state.units[i]!;
    if (u.species === 'corrupted_sister' && u.hp > 0 && u.activity !== 'dangling' && (u.recoveryTimer ?? 0) <= 0) {
      count += 1;
    }
  }
  return count;
}

export function getUnitSpeedMultiplier(
  unit: AbyssalUnit,
  state: GameState,
  cachedMods?: RelicModifiers,
): number {
  const mods = cachedMods ?? computeGlobalModifiers(state);
  let mult = mods.unitSpeedMult;
  if (unit.traits.includes('swift_foot')) mult *= 1.2;
  if (unit.slapBuffTimer > 0) mult *= BALANCE_CONFIG.slapMoveMult;
  if (unit.frenzyBuffTimer > 0) mult *= 1.3;
  if (unit.happiness < 25) mult *= 1 - BALANCE_CONFIG.bankruptSpeedPenalty;
  return mult;
}

export function getUnitActionMultiplier(
  unit: AbyssalUnit,
  state: GameState,
  cachedMods?: RelicModifiers,
  cachedSisterCount?: number,
): number {
  const mods = cachedMods ?? computeGlobalModifiers(state);
  let mult = 1;
  if (unit.slapBuffTimer > 0) {
    mult *= 1 + (BALANCE_CONFIG.slapActionMult - 1) * mods.slapBonusMult;
  }
  if (unit.frenzyBuffTimer > 0) mult *= 1.45;
  if (unit.happiness >= 60) {
    mult *= 1 + ((unit.happiness - 60) / 40) * BALANCE_CONFIG.happinessMaxBonus;
  } else if (unit.happiness < 25) {
    mult *= 1 - BALANCE_CONFIG.bankruptSpeedPenalty;
  }
  if (unit.species === 'imp') {
    mult *= mods.impWorkSpeedMult;
  } else {
    const sisters = cachedSisterCount ?? countCorruptedSisters(state);
    if (sisters > 0) {
      mult *= 1 + Math.min(0.36, sisters * 0.12);
    }
  }
  return mult;
}

function moveUnitTowardX(unit: AbyssalUnit, targetX: number, speedMult: number, dt: number): boolean {
  const dx = targetX - unit.x;
  if (Math.abs(dx) > 1) {
    unit.facing = dx >= 0 ? 1 : -1;
  }
  const step = unit.moveSpeed * speedMult * dt;
  if (Math.abs(dx) <= step) {
    unit.x = targetX;
    unit.slotIndex = xToSlotIndex(unit.x);
    return true;
  }
  unit.x += Math.sign(dx) * step;
  unit.slotIndex = xToSlotIndex(unit.x);
  return false;
}

interface ImpScanCache {
  throneSlot: RoomSlot;
  treasurySlot: RoomSlot;
  prisonSlot: RoomSlot | undefined;
  corruptionSlot: RoomSlot | undefined;
  needTrapSlot: RoomSlot | undefined;
  rockSlot: RoomSlot | undefined;
  frontierRockSlot: RoomSlot | undefined;
  goldSlot: RoomSlot | undefined;
  weakWall: RoomSlot | undefined;
  downedHero: HeroUnit | undefined;
  canHaulCaptive: boolean;
}

const _impCache: ImpScanCache = {
  throneSlot: undefined as unknown as RoomSlot,
  treasurySlot: undefined as unknown as RoomSlot,
  prisonSlot: undefined,
  corruptionSlot: undefined,
  needTrapSlot: undefined,
  rockSlot: undefined,
  frontierRockSlot: undefined,
  goldSlot: undefined,
  weakWall: undefined,
  downedHero: undefined,
  canHaulCaptive: false,
};

function awardBuriedRelic(state: GameState, slot: RoomSlot, rng: SeededRng): void {
  const unowned = RELIC_DEFS.filter((r) => !state.relics.includes(r.id));
  if (unowned.length === 0) {
    // Fallback huge bonus gold chest
    const bonus = 350 + slot.index * 35;
    depositGold(state, bonus);
    return;
  }
  const picked = rng.pick(unowned);
  state.relics.push(picked.id);
  if (!state.prestige.unlockedRelicCodex.includes(picked.id)) {
    state.prestige.unlockedRelicCodex.push(picked.id);
  }
  evaluateProgression(state);
  const rLoc = locRelic(picked.id);
  pushEvent(state, {
    type: 'relic_dropped',
    slotIndex: slot.index,
    species: picked.id,
    text: t(
      `矿脉遗迹发掘！获得圣物【${rLoc.name}】：${rLoc.effect}`,
      `Relic Chest excavated! Acquired [${rLoc.name}]: ${rLoc.effect}`,
    ),
  });
  pushVfx(state, {
    kind: 'relic_banner',
    x: slotCenterX(slot.index),
    subId: picked.id,
    label: `${rLoc.name}｜${rLoc.effect}`,
    color: 0xf2c655,
  });
}

function stepImpAi(
  state: GameState,
  imp: AbyssalUnit,
  dt: number,
  mods: RelicModifiers,
  cache: ImpScanCache,
  rng: SeededRng,
): void {
  if (state.hand.heldUnitId === imp.id) return;
  const workMult = getUnitActionMultiplier(imp, state, mods, 0);
  const speedMult = getUnitSpeedMultiplier(imp, state, mods);
  const aureliaGoldMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaGoldBonus : 1;
  const deepTechBonus = 1 + (state.prestige.techLevels?.deep_excavation ?? 0) * 0.25;

  // 1. Finish dragging captive to Abyssal Prison (if built with space) or Corruption Chamber
  if (imp.carryingCaptiveId) {
    const captive = state.heroes.find((h) => h.id === imp.carryingCaptiveId);
    const prison = cache.prisonSlot;
    const prisonHasSpace =
      prison && state.prisoners.filter((p) => p.cell === 'prison').length < getPrisonCapacity(prison);
    const destSlot = prisonHasSpace ? prison : cache.corruptionSlot ?? prison;
    if (!captive || !destSlot) {
      if (captive) captive.beingHauledByImpId = null;
      imp.carryingCaptiveId = null;
      imp.impTask = 'idle';
      return;
    }
    imp.impTask = 'haul_captive';
    imp.activity = 'moving';
    const arrived = moveUnitTowardX(imp, slotCenterX(destSlot.index), speedMult * 0.85, dt);
    captive.x = imp.x;
    captive.slotIndex = imp.slotIndex;
    if (arrived) {
      addPrisoner(state, captive, destSlot.type === 'prison' ? 'prison' : 'chamber');
      state.heroes = state.heroes.filter((h) => h.id !== captive.id);
      imp.carryingCaptiveId = null;
      imp.impTask = 'idle';
    }
    return;
  }

  // 2. Haul carried gold visibly back to Backyard Treasury!
  if (imp.carryingGold > 0) {
    imp.impTask = 'haul_gold';
    imp.activity = 'moving';
    const arrived = moveUnitTowardX(imp, slotCenterX(cache.treasurySlot.index), speedMult, dt);
    if (arrived) {
      const haulerBonus = imp.traits.includes('greedy_hauler') ? 1.2 : 1;
      const delivered = Math.round(imp.carryingGold * haulerBonus * mods.goldMult * aureliaGoldMult);
      depositGold(state, delivered);
      imp.carryingGold = 0;
      imp.impTask = 'idle';
      pushEvent(state, {
        type: 'gold_delivered',
        unitId: imp.id,
        slotIndex: cache.treasurySlot.index,
        value: delivered,
      });
      pushVfx(state, {
        kind: 'heal',
        x: imp.x,
        value: delivered,
        label: `+${delivered}G`,
        color: 0xf2c655,
      });
    }
    return;
  }

  // Priority 1a: Repair damaged Dungeon Heart at Throne (Slot 6)
  if (state.heartReviveTimer <= 0 && state.overlordHp < state.overlordMaxHp * 0.92) {
    imp.impTask = 'repair_heart';
    imp.impTargetSlot = cache.throneSlot.index;
    const arrived = moveUnitTowardX(imp, slotCenterX(cache.throneSlot.index), speedMult, dt);
    if (arrived) {
      imp.activity = 'working';
      const heal = state.overlordMaxHp * 0.035 * workMult * dt;
      state.overlordHp = Math.min(state.overlordMaxHp, state.overlordHp + heal);
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Priority 1b: Refill / repair depleted Traps
  const needTrapSlot = cache.needTrapSlot;
  if (needTrapSlot && needTrapSlot.trap && state.trapParts >= TRAP_DEFS[needTrapSlot.trap.type].refillPartCost) {
    imp.impTask = 'repair_trap';
    imp.impTargetSlot = needTrapSlot.index;
    const arrived = moveUnitTowardX(imp, slotCenterX(needTrapSlot.index), speedMult, dt);
    if (arrived) {
      imp.activity = 'working';
      const cost = TRAP_DEFS[needTrapSlot.trap.type].refillPartCost;
      if (state.trapParts >= cost && needTrapSlot.trap.charges < needTrapSlot.trap.maxCharges) {
        state.trapParts -= cost;
        needTrapSlot.trap.charges += 1;
      }
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Priority 2: Drag downed elite hero to Abyssal Prison or Corruption Chamber
  if (
    (cache.prisonSlot || cache.corruptionSlot) &&
    cache.canHaulCaptive &&
    cache.downedHero &&
    !cache.downedHero.beingHauledByImpId
  ) {
    const downed = cache.downedHero;
    imp.impTask = 'haul_captive';
    imp.impTargetSlot = downed.slotIndex;
    const arrived = moveUnitTowardX(imp, downed.x, speedMult, dt);
    imp.activity = 'moving';
    if (arrived) {
      downed.beingHauledByImpId = imp.id;
      imp.carryingCaptiveId = downed.id;
    }
    return;
  }

  // Priority 3: Excavate player-marked expansion rock vein!
  const rockSlot = cache.rockSlot;
  if (rockSlot && rockSlot.type === 'rock_vein' && rockSlot.markedForDig) {
    imp.impTask = 'dig_rock';
    imp.impTargetSlot = rockSlot.index;
    // Stand on the adjacent passable side (right side if rock is in backyard left of throne, left side if frontline)
    const standX =
      rockSlot.index < THRONE_SLOT_INDEX
        ? slotCenterX(rockSlot.index) + SLOT_WIDTH_HALF
        : slotCenterX(rockSlot.index) - SLOT_WIDTH_HALF;
    const arrived = moveUnitTowardX(imp, standX, speedMult, dt);
    if (arrived) {
      imp.activity = 'working';
      imp.facing = rockSlot.index < THRONE_SLOT_INDEX ? -1 : 1;
      const digPower = 20 * workMult * dt;
      rockSlot.rockHp -= digPower;
      if (state.tick % 10 === 0) {
        pushVfx(state, { kind: 'mine_spark', x: slotCenterX(rockSlot.index), color: 0xf2c655 });
      }
      if (rockSlot.rockHp <= 0) {
        const yieldGold = Math.round(rockSlot.rockGoldYield * deepTechBonus);
        if (rockSlot.isInfiniteFrontier) {
          // Endless deep frontier vein refills with rich ore chunk instead of turning into corridor!
          rockSlot.rockHp = rockSlot.rockMaxHp;
          imp.carryingGold += Math.round(yieldGold * 0.45);
        } else {
          const hadChest = Boolean(rockSlot.hasRelicChest);
          rockSlot.type = 'corridor';
          rockSlot.rockHp = 0;
          rockSlot.markedForDig = false;
          rockSlot.hasRelicChest = false;
          imp.carryingGold += yieldGold;
          recalcCapsAndOverlord(state);
          pushEvent(state, {
            type: 'rock_mined',
            unitId: imp.id,
            slotIndex: rockSlot.index,
            value: yieldGold,
          });
          if (hadChest) {
            awardBuriedRelic(state, rockSlot, rng);
          }
        }
      }
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Priority 4: Pick up loose battle gold piles & carry to Treasury
  const goldSlot = cache.goldSlot;
  if (goldSlot && goldSlot.looseGold > 0) {
    imp.impTask = 'haul_gold';
    imp.impTargetSlot = goldSlot.index;
    const arrived = moveUnitTowardX(imp, slotCenterX(goldSlot.index), speedMult, dt);
    if (arrived) {
      imp.carryingGold += goldSlot.looseGold;
      goldSlot.looseGold = 0;
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Priority 5: Reinforce damaged walls
  const weakWall = cache.weakWall;
  if (weakWall && weakWall.wallIntegrity < 100) {
    imp.impTask = 'reinforce_wall';
    imp.impTargetSlot = weakWall.index;
    const arrived = moveUnitTowardX(imp, slotCenterX(weakWall.index), speedMult, dt);
    if (arrived) {
      imp.activity = 'working';
      weakWall.wallIntegrity = Math.min(100, weakWall.wallIntegrity + 12 * workMult * dt);
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Priority 6 (V2.0 Real Visible Mining Loop!):
  // Run out to the rightmost Frontier Rock Vein, chip off a real golden ore chunk with sparks,
  // then physically carry the glowing gold nugget all the way back to Backyard Treasury!
  const frontier = cache.frontierRockSlot;
  if (frontier) {
    imp.impTask = 'mine_frontier';
    imp.impTargetSlot = frontier.index;
    const standX = slotCenterX(frontier.index) - SLOT_WIDTH_HALF;
    const arrived = moveUnitTowardX(imp, standX, speedMult * 0.95, dt);
    if (arrived) {
      imp.activity = 'working';
      imp.facing = 1;
      // Chip ore for ~3 seconds (tracked cleanly via attackCooldown reuse on Imp)
      imp.attackCooldown += workMult * dt;
      if (state.tick % 12 === 0) {
        pushVfx(state, { kind: 'mine_spark', x: slotCenterX(frontier.index) - 24, color: 0xf2c655 });
      }
      if (imp.attackCooldown >= 4.2) {
        imp.attackCooldown = 0;
        const oreChunk = Math.round((10 + state.wave * 1.4) * deepTechBonus);
        imp.carryingGold = oreChunk;
      }
    } else {
      imp.activity = 'moving';
    }
    return;
  }

  // Fallback idle at Treasury
  imp.impTask = 'idle';
  const arrived = moveUnitTowardX(imp, slotCenterX(cache.treasurySlot.index), speedMult * 0.7, dt);
  imp.activity = arrived ? 'working' : 'moving';
}

export function stepEcosystemSystem(
  state: GameState,
  rng: SeededRng,
  cachedMods?: RelicModifiers,
  stepDt = SIM_DT,
): void {
  const dt = stepDt;
  const mods = cachedMods ?? computeGlobalModifiers(state);
  const aureliaGoldMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaGoldBonus : 1;
  const aureliaWorkshopMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaWorkshopBonus : 1;

  if (state.hand.slapCooldown > 0) state.hand.slapCooldown = Math.max(0, state.hand.slapCooldown - dt);
  if ((state.bullionRefillVfxCd ?? 0) > 0) {
    state.bullionRefillVfxCd = Math.max(0, (state.bullionRefillVfxCd ?? 0) - dt);
  }
  if (state.spellCooldowns.abyss_lightning > 0) {
    state.spellCooldowns.abyss_lightning = Math.max(0, state.spellCooldowns.abyss_lightning - dt);
  }
  if (state.spellCooldowns.demon_frenzy > 0) {
    state.spellCooldowns.demon_frenzy = Math.max(0, state.spellCooldowns.demon_frenzy - dt);
  }
  if (state.spellCooldowns.charm_mist > 0) {
    state.spellCooldowns.charm_mist = Math.max(0, state.spellCooldowns.charm_mist - dt);
  }
  if (state.spellCooldowns.abyss_blackhole > 0) {
    state.spellCooldowns.abyss_blackhole = Math.max(0, state.spellCooldowns.abyss_blackhole - dt);
  }

  // Prestige Auto-Slap Aura
  const autoSlapLv = state.prestige.techLevels?.auto_slap_aura ?? state.prestige.talents.autoSlapAura;
  if (autoSlapLv > 0 && state.tick % 160 === 0 && state.units.length > 0) {
    const candidate = rng.pick(state.units);
    candidate.slapBuffTimer = Math.max(candidate.slapBuffTimer, 8 + autoSlapLv * 4);
  }

  // Idle Micro-Banter bubbles so the dungeon feels warmly alive!
  state.banterTimer -= dt;
  if (state.banterTimer <= 0) {
    state.banterTimer = 14 + rng.next() * 10;
    const idleUnits = state.units.filter((u) => u.hp > 0 && u.activity !== 'fighting' && u.activity !== 'dangling');
    if (idleUnits.length > 0 && state.heroes.length === 0) {
      const speaker = rng.pick(idleUnits);
      const line = rng.pick(locIdleBanterLines());
      pushVfx(state, {
        kind: 'banter',
        x: speaker.x,
        speakerId: speaker.id,
        speakerName: locUnitName(speaker),
        label: line,
        color: 0xf2c655,
      });
    }
  }

  const throneSlot = getThroneSlot(state);
  let treasurySlot = state.slots[0]!;
  let hatchery: RoomSlot | undefined;
  let corruptionSlot: RoomSlot | undefined;
  let needTrapSlot: RoomSlot | undefined;
  let rockSlot: RoomSlot | undefined;
  let frontierRockSlot: RoomSlot | undefined;
  let goldSlot: RoomSlot | undefined;
  let weakWall: RoomSlot | undefined;

  for (let si = 0, sn = state.slots.length; si < sn; si++) {
    const slot = state.slots[si]!;
    if (slot.type === 'throne') {
      const manaGain = roomOutput(ROOM_DEFS.throne.baseOutput, slot.level) * mods.manaMult * dt;
      state.mana = Math.min(state.manaCap, state.mana + manaGain);
      state.metrics.totalManaEarned += manaGain;
    } else if (slot.type === 'treasury') {
      treasurySlot = slot;
      const capPerSec = (0.35 + slot.level * 0.18) * (1 + mods.interestBonus * 10);
      const ratePerSec = (0.0012 + mods.interestBonus * 0.15) / 60;
      const interest = Math.min(capPerSec, state.gold * ratePerSec) * dt * mods.goldMult * aureliaGoldMult;
      if (interest > 0) {
        depositGold(state, interest);
      }
    } else if (slot.type === 'hatchery') {
      hatchery = slot;
      const maxChickens = Math.min(10, Math.floor(roomOutput(ROOM_DEFS.hatchery.baseOutput, slot.level)));
      if (slot.chickens < maxChickens) {
        slot.chickenSpawnTimer -= dt * (1 + (slot.level - 1) * 0.18);
        if (slot.chickenSpawnTimer <= 0) {
          slot.chickens += 1;
          slot.chickenSpawnTimer = 7.5;
        }
      }
    } else if (slot.type === 'corruption') {
      corruptionSlot = slot;
    }

    if (
      !needTrapSlot &&
      slot.trap &&
      slot.trap.charges < slot.trap.maxCharges &&
      state.trapParts >= TRAP_DEFS[slot.trap.type].refillPartCost
    ) {
      needTrapSlot = slot;
    }
    if (!rockSlot && slot.type === 'rock_vein' && slot.markedForDig) {
      rockSlot = slot;
    }
    if (!frontierRockSlot && slot.type === 'rock_vein' && slot.index > THRONE_SLOT_INDEX) {
      frontierRockSlot = slot;
    }
    if (!goldSlot && slot.looseGold > 0) {
      goldSlot = slot;
    }
    if (!weakWall && slot.type !== 'rock_vein' && slot.wallIntegrity < 100) {
      weakWall = slot;
    }
  }

  let hasActiveHeroes = false;
  let downedHero: HeroUnit | undefined;
  for (let hi = 0, hn = state.heroes.length; hi < hn; hi++) {
    const h = state.heroes[hi]!;
    if (!h.downedForCapture && h.hp > 0) hasActiveHeroes = true;
    else if (!downedHero && h.downedForCapture && !h.beingHauledByImpId && h.id !== state.hand.heldHeroId) {
      downedHero = h;
    }
  }

  let corruptedSisterCount = 0;
  let combatUnitCount = 0;
  for (let ui = 0, un = state.units.length; ui < un; ui++) {
    const u = state.units[ui]!;
    if (u.species !== 'imp') {
      combatUnitCount += 1;
      if (u.species === 'corrupted_sister' && u.hp > 0 && u.activity !== 'dangling' && (u.recoveryTimer ?? 0) <= 0) {
        corruptedSisterCount += 1;
      }
    }
  }

  if (corruptedSisterCount > 0) {
    const auraHealRatio = 0.012 * Math.min(3, corruptedSisterCount) * dt;
    for (let ui = 0, un = state.units.length; ui < un; ui++) {
      const ally = state.units[ui]!;
      if (ally.hp > 0 && ally.hp < ally.maxHp) {
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * auraHealRatio);
      }
    }
  }

  const maxCombatUnits = getMaxCombatUnits(state);
  const prisonSlot = getPrisonSlot(state);
  const maxPrisoners = getTotalPrisonerCapacity(state);
  const canHaulCaptive =
    Boolean(prisonSlot || corruptionSlot) &&
    state.prisoners.length < maxPrisoners &&
    combatUnitCount + state.prisoners.length < maxCombatUnits + 3;

  const impCache = _impCache;
  impCache.throneSlot = throneSlot;
  impCache.treasurySlot = treasurySlot;
  impCache.prisonSlot = prisonSlot;
  impCache.corruptionSlot = corruptionSlot;
  impCache.needTrapSlot = needTrapSlot;
  impCache.rockSlot = rockSlot;
  impCache.frontierRockSlot = frontierRockSlot;
  impCache.goldSlot = goldSlot;
  impCache.weakWall = weakWall;
  impCache.downedHero = downedHero;
  impCache.canHaulCaptive = canHaulCaptive;

  for (let ui = 0, un = state.units.length; ui < un; ui++) {
    const unit = state.units[ui]!;
    if (unit.slapBuffTimer > 0) unit.slapBuffTimer = Math.max(0, unit.slapBuffTimer - dt);
    if (unit.slapReactTimer > 0) unit.slapReactTimer = Math.max(0, unit.slapReactTimer - dt);
    if (unit.frenzyBuffTimer > 0) unit.frenzyBuffTimer = Math.max(0, unit.frenzyBuffTimer - dt);
    if ((unit.attackAnimTimer ?? 0) > 0) unit.attackAnimTimer = Math.max(0, unit.attackAnimTimer - dt);
    if ((unit.eatAnimTimer ?? 0) > 0) unit.eatAnimTimer = Math.max(0, unit.eatAnimTimer - dt);
    if ((unit.recoveryTimer ?? 0) > 0) {
      unit.recoveryTimer = Math.max(0, unit.recoveryTimer - dt);
      unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.055 * dt);
    }

    if (unit.activity === 'dangling' || unit.activity === 'altar_bound') continue;

    if (unit.species === 'imp') {
      stepImpAi(state, unit, dt, mods, impCache, rng);
      continue;
    }

    const drain =
      unit.activity === 'fighting'
        ? BALANCE_CONFIG.satietyDrainPerSecCombat
        : BALANCE_CONFIG.satietyDrainPerSecWork;
    unit.satiety = Math.max(0, unit.satiety - drain * dt);

    const isRecovering = (unit.recoveryTimer ?? 0) > 0;
    const needsChicken =
      hatchery &&
      hatchery.chickens > 0 &&
      (unit.satiety < 30 ||
        (isRecovering && unit.hp < unit.maxHp * 0.7) ||
        (unit.hp < unit.maxHp * 0.55 && !hasActiveHeroes));

    if (needsChicken && hatchery) {
      const speedMult = getUnitSpeedMultiplier(unit, state, mods);
      const arrived = moveUnitTowardX(unit, slotCenterX(hatchery.index), speedMult, dt);
      if (arrived && hatchery.chickens > 0) {
        hatchery.chickens -= 1;
        const healAmt = Math.round(
          unit.maxHp * (BALANCE_CONFIG.chickenHealHpRatio + mods.chickenHealBonus),
        );
        unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
        unit.satiety = Math.min(100, unit.satiety + BALANCE_CONFIG.chickenRestoreSatiety);
        unit.happiness = Math.min(100, unit.happiness + 3);
        unit.activity = 'eating';
        unit.eatAnimTimer = 0.95;
        if (mods.resonanceChickenFrenzySec > 0) {
          unit.frenzyBuffTimer = Math.max(unit.frenzyBuffTimer, mods.resonanceChickenFrenzySec);
        }
        pushEvent(state, {
          type: 'chicken_eaten',
          unitId: unit.id,
          slotIndex: hatchery.index,
          value: healAmt,
        });
        pushVfx(state, { kind: 'chicken_feast', x: unit.x, value: healAmt, color: 0x42d69f });
      } else {
        unit.activity = 'moving';
      }
      continue;
    }

    if (isRecovering) {
      unit.activity = 'eating';
      continue;
    }

    if (unit.activity === 'fighting' || unit.activity === 'whim') continue;

    const targetSlotIdx = unit.assignedSlot ?? unit.slotIndex;
    const targetSlot: RoomSlot | undefined = state.slots[targetSlotIdx];
    if (!targetSlot || targetSlot.type === 'rock_vein') continue;

    const targetX = slotCenterX(targetSlot.index);
    if (unit.x !== targetX) {
      const speedMult = getUnitSpeedMultiplier(unit, state, mods);
      const arrived = moveUnitTowardX(unit, targetX, speedMult, dt);
      if (!arrived) {
        unit.activity = 'moving';
        continue;
      }
    }

    const stype = targetSlot.type;
    if (stype === 'training') {
      unit.activity = 'working';
      const maxTrainLevel = Math.min(BALANCE_CONFIG.unitMaxLevel, 8 + targetSlot.level * 5);
      if (unit.level < maxTrainLevel) {
        const workMult = getUnitActionMultiplier(unit, state, mods, corruptedSisterCount) * getUnitRoomWorkOutputMult(unit);
        const blademaidBonus = unit.species === 'skeleton_blademaid' ? 1.35 : 1;
        const xpGain =
          roomOutput(ROOM_DEFS.training.baseOutput, targetSlot.level) *
          workMult *
          mods.trainingXpMult *
          blademaidBonus *
          dt;
        grantUnitXp(state, unit, xpGain);
      }
    } else if (stype === 'library') {
      unit.activity = 'working';
      const workMult = getUnitActionMultiplier(unit, state, mods, corruptedSisterCount) * getUnitRoomWorkOutputMult(unit);
      const scholarBonus =
        unit.species === 'eclipse_archmage'
          ? 2.1
          : unit.species === 'necro_cantor'
            ? 1.7
            : unit.species === 'imp_witch'
              ? 1.35
              : unit.traits.includes('arcane_surge')
                ? 1.3
                : 0.75;
      const manaGain =
        roomOutput(ROOM_DEFS.library.baseOutput, targetSlot.level) *
        workMult *
        scholarBonus *
        mods.manaMult *
        dt;
      state.mana = Math.min(state.manaCap, state.mana + manaGain);
      state.metrics.totalManaEarned += manaGain;
      grantUnitXp(state, unit, 0.8 * workMult * dt);
    } else if (stype === 'workshop') {
      unit.activity = 'working';
      const workMult = getUnitActionMultiplier(unit, state, mods, corruptedSisterCount) * getUnitRoomWorkOutputMult(unit);
      const smithBonus =
        unit.species === 'hellforge_smith'
          ? 2.0
          : unit.species === 'alchemist_belle'
            ? 1.8
            : unit.species === 'arachne_weaver'
              ? 1.4
              : unit.traits.includes('trap_master')
                ? 1.4
                : 0.75;
      const partsGain =
        roomOutput(ROOM_DEFS.workshop.baseOutput, targetSlot.level) *
        workMult *
        smithBonus *
        mods.workshopPartMult *
        aureliaWorkshopMult *
        dt;
      if (state.trapParts + partsGain <= state.trapPartsCap) {
        state.trapParts += partsGain;
      } else {
        const overflow = state.trapParts + partsGain - state.trapPartsCap;
        state.trapParts = state.trapPartsCap;
        const soldGold = overflow * workshopOverflowGoldPerPart(state.wave) * mods.goldMult * aureliaGoldMult;
        depositGold(state, soldGold);
      }
      grantUnitXp(state, unit, 0.7 * workMult * dt);
    } else {
      unit.activity = 'idle';
      if (unit.hp < unit.maxHp) {
        unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.02 * dt);
      }
    }
  }

  // V2.4 Quirk & CP Ecosystem Layer (deterministic, zero economy impact)
  stepQuirkSystem(state, dt, mods);

  // V2.5 Dragon-Hoard boast bubble when Dark-Gold Bullion Vault >= 80% full
  if (state.bullionCap > 0 && state.bullion >= state.bullionCap * 0.8 && state.heroes.length === 0) {
    state.bullionBragTimer = (state.bullionBragTimer ?? 24) - dt;
    if (state.bullionBragTimer <= 0) {
      state.bullionBragTimer = 28 + rng.next() * 18;
      const bragLines = [
        t(
          '「金砖窖都要顶破天花板了，今晚拿暗金砖当枕头睡！」',
          '"The bullion vault is bursting—sleeping on dark-gold bricks tonight!"',
        ),
        t(
          '「本王连走路都掉金沙，快去升几座房间花掉点！」',
          '"Gold dust trails my boots—go upgrade a room and spend some!"',
        ),
        t(
          '「圣堂还在省吃俭用，本王已经堆出龙床了~」',
          '"While the Cathedral pinches pennies, my dragon hoard overflows~"',
        ),
      ];
      pushVfx(state, {
        kind: 'banter',
        x: slotCenterX(treasurySlot.index),
        speakerId: 'overlord',
        speakerName: t('魔王', 'Overlord'),
        label: rng.pick(bragLines),
        color: 0xf2c655,
      });
    }
  }

  // Gentle Payday Bell (every 5 minutes) — auto-refill from Bullion Vault BEFORE checking solvency!
  state.paydayTimer -= dt;
  if (state.paydayTimer <= 0) {
    state.paydayTimer = BALANCE_CONFIG.paydayIntervalSec;
    refillGoldAndEmitVfx(state);
    let totalBill = 0;
    for (const u of state.units) {
      const base = BALANCE_CONFIG.paydayBaseSalaryPerTier[u.tier];
      totalBill += Math.round(base * (1 + u.level * 0.06) * mods.paydayCostMult);
    }

    if (state.gold >= totalBill) {
      state.gold -= totalBill;
      refillGoldAndEmitVfx(state);
      for (const u of state.units) {
        u.happiness = Math.min(100, u.happiness + 12);
      }
      pushEvent(state, {
        type: 'payday_bell',
        value: totalBill,
        text: t(
          `发薪日铃响！发放薪水 ${totalBill} 金币，全军士气大振！`,
          `Payday bell rings! Paid ${totalBill}G in wages—morale soars!`,
        ),
      });
    } else {
      state.gold = 0;
      refillGoldAndEmitVfx(state);
      state.metrics.bankruptPaydays += 1;
      for (const u of state.units) {
        u.happiness = Math.max(15, u.happiness - 18);
      }
      pushEvent(state, {
        type: 'payday_bell',
        value: 0,
        text: t(
          '发薪日金库见底！眷属们委屈咕哝（工作效率微降，绝不叛逃）',
          'Payday vault empty! Retainers grumble softly (slight slowdown, zero desertion)',
        ),
      });
    }
  }

  // V2.5 End-of-frame 1:1 auto-refill from Dark-Gold Bullion Vault
  refillGoldAndEmitVfx(state);
}
