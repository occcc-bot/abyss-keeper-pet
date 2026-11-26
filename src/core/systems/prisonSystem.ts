import {
  FLAVOR_BITS,
  HERO_PERSONA,
  RAID_PROFILES,
  stanceOf,
} from '../data/prisonAndRaids';
import { CAPTURABLE_HERO_IDS, HERO_DEFS } from '../data/units';
import {
  findRoomSlotByType,
  getMaxCombatUnits,
  incrementChronicle,
  nextEntityId,
  pushEvent,
  pushVfx,
  slotCenterX,
  xToSlotIndex,
} from '../ecs/stateFactory';
import { depositGold, heroScaledGold, prisonerMaxWill, type RelicModifiers } from '../formulas';
import { hashUnitFloat } from '../hash';
import { locHeroName, t } from '../i18n';
import {
  THRONE_SLOT_INDEX,
  type CapturableHeroId,
  type GameState,
  type HeroUnit,
  type PrisonerRecord,
  type RoomSlot,
} from '../types';
import { completePrisonerCorruption } from './corruptionAndFusionSystem';

/**
 * V2.4 Abyssal Prison & 12-Hero Jailbreak State Machine.
 * Strictly deterministic via hash32/hashUnitFloat (NEVER imports SeededRng — Invariant I3).
 * Enforces Invariants I1 (will monotonic non-increasing), I2 (0 deaths outside manual extreme),
 * and I4 (<= 1 raid/wave, backyard prison NEVER loses a prisoner).
 */

export function getPrisonSlot(state: GameState): RoomSlot | undefined {
  return findRoomSlotByType(state, 'prison');
}

export function getPrisonCapacity(prisonSlot: RoomSlot): number {
  return Math.min(8, 4 + Math.floor(prisonSlot.level / 2));
}

export function getChamberSeatCapacity(state: GameState): number {
  const chamber = findRoomSlotByType(state, 'corruption');
  if (!chamber) return 0;
  return 1 + Math.floor(chamber.level / 4) + (state.equippedImplement === 'brainwash_gramophone' ? 1 : 0);
}

export function getTotalPrisonerCapacity(state: GameState): number {
  const prison = getPrisonSlot(state);
  const chamber = findRoomSlotByType(state, 'corruption');
  const seats = chamber ? getChamberSeatCapacity(state) : 0;
  if (!prison) {
    return seats;
  }
  return getPrisonCapacity(prison) + seats;
}

export function ensurePrisonLock(state: GameState): { hp: number; max: number } | null {
  const prison = getPrisonSlot(state);
  if (!prison) {
    state.prisonLock = undefined;
    return null;
  }
  const max = Math.round(100 * (1 + 0.5 * (prison.level - 1)));
  if (!state.prisonLock || state.prisonLock.max !== max) {
    const prevRatio = state.prisonLock && state.prisonLock.max > 0 ? state.prisonLock.hp / state.prisonLock.max : 1;
    state.prisonLock = { hp: Math.max(0, Math.round(max * prevRatio)), max };
  }
  return state.prisonLock;
}

export function refillPrisonLock(state: GameState): void {
  const prison = getPrisonSlot(state);
  if (!prison) return;
  const max = Math.round(100 * (1 + 0.5 * (prison.level - 1)));
  state.prisonLock = { hp: max, max };
}

/** One-time flavor will reduction (strictly non-increasing, respects I1, never kills/converts in-place). */
export function applyFlavorWillHit(p: PrisonerRecord, bit: number, ratio: number): boolean {
  if ((p.flavorHits & bit) !== 0) return false;
  p.flavorHits |= bit;
  const drop = Math.max(1, Math.round(p.maxWill * ratio));
  p.will = Math.max(1, p.will - drop);
  p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
  return true;
}

/** Return any prisoners escorted by `hero` safely back to prison. */
export function releaseEscortedPrisoners(state: GameState, heroId: string): void {
  for (const p of state.prisoners) {
    if (p.escortedByHeroId === heroId) {
      p.escortedByHeroId = null;
      p.cell = 'prison';
    }
  }
}

/** Sync prisoners between Prison cells and Torture Chamber chair seats (with mercy >= 90 hysteresis & V2.5 ward <= 0.4 priority). */
export function syncPrisonAndChamberSeats(state: GameState): void {
  const prison = getPrisonSlot(state);
  const chamber = findRoomSlotByType(state, 'corruption');
  if (!prison) {
    // Legacy mode (I5): all prisoners are in chamber
    for (const p of state.prisoners) {
      p.cell = 'chamber';
      p.escortedByHeroId = null;
    }
    return;
  }
  if (!chamber) return;

  const sortSoftest = (a: PrisonerRecord, b: PrisonerRecord): number => {
    const wa = a.ward ?? 0;
    const wb = b.ward ?? 0;
    if (Math.abs(wa - wb) > 0.01) return wa - wb;
    return a.will / Math.max(1, a.maxWill) - b.will / Math.max(1, b.maxWill);
  };

  const seatCap = getChamberSeatCapacity(state);
  const inChamber = state.prisoners.filter((p) => p.cell === 'chamber' && !p.escortedByHeroId);
  const inPrisonHealthy = state.prisoners
    .filter(
      (p) => p.cell === 'prison' && !p.escortedByHeroId && !p.mercy && p.hp >= 90 && (p.ward ?? 0) <= 0.4,
    )
    .sort(sortSoftest);

  // Swap out mercy-paused prisoners if healthy softened candidates wait in prison (and not in Extreme Mode)
  if (!state.noMercyMode) {
    for (const p of inChamber) {
      if (p.mercy && inPrisonHealthy.length > 0) {
        const sub = inPrisonHealthy.shift()!;
        p.cell = 'prison';
        sub.cell = 'chamber';
      }
    }
  }

  // Fill any empty chair seats from prison: auto-summon prefers softened captives (ward <= 0.4)
  let currentSeated = state.prisoners.filter((p) => p.cell === 'chamber' && !p.escortedByHeroId).length;
  if (currentSeated < seatCap) {
    const candidates = state.prisoners
      .filter(
        (p) =>
          p.cell === 'prison' &&
          !p.escortedByHeroId &&
          (!p.mercy || state.noMercyMode) &&
          (p.ward ?? 0) <= 0.4,
      )
      .sort(sortSoftest);
    for (const c of candidates) {
      if (currentSeated >= seatCap) break;
      c.cell = 'chamber';
      currentSeated += 1;
    }
  }
}

/**
 * Tick Prison cell recovery, Holy Ward corrosion, passive softening (capped 4%/min, floor 40%, I1),
 * and global/per-prisoner cooldowns.
 * V2.5 Early-return ordering strictly prevents lockups when no Prison is built (I5).
 */
export function stepPrisonPassives(state: GameState, dt: number, mods: RelicModifiers): void {
  if (state.ghostTutorTimer > 0) {
    state.ghostTutorTimer = Math.max(0, state.ghostTutorTimer - dt);
  }
  if ((state.overchargeCd ?? 0) > 0) {
    state.overchargeCd = Math.max(0, (state.overchargeCd ?? 0) - dt);
  }
  if ((state.chamberSlapCd ?? 0) > 0) {
    state.chamberSlapCd = Math.max(0, (state.chamberSlapCd ?? 0) - dt);
  }
  if (state.prisoners.length === 0) return;

  // Step per-prisoner timers & chair-bound Holy Ward decay BEFORE checking `if (!prison) return;`!
  for (let i = 0, n = state.prisoners.length; i < n; i++) {
    const p = state.prisoners[i]!;
    if (p.feedCd > 0) p.feedCd = Math.max(0, p.feedCd - dt);
    if ((p.satiety ?? 0) > 0) p.satiety = Math.max(0, (p.satiety ?? 0) - 0.5 * dt);
    if ((p.drowsyTimer ?? 0) > 0) p.drowsyTimer = Math.max(0, (p.drowsyTimer ?? 0) - dt);
    if ((p.overchargeTimer ?? 0) > 0) {
      p.overchargeTimer = Math.max(0, (p.overchargeTimer ?? 0) - dt);
      if (p.overchargeTimer <= 0) {
        p.overchargeCrit = false;
      }
    }
    if (p.cell === 'chamber' && !p.escortedByHeroId && (p.ward ?? 0) > 0) {
      p.ward = p.ward * Math.exp(-dt / 600);
      if (p.ward < 0.001) p.ward = 0;
    }
  }

  const prison = getPrisonSlot(state);
  if (!prison) return;
  ensurePrisonLock(state);

  let inPrisonCount = 0;
  let hasBrokenRoommate = false;
  let allResist = true;
  for (let i = 0, n = state.prisoners.length; i < n; i++) {
    const p = state.prisoners[i]!;
    if (p.cell === 'prison' && !p.escortedByHeroId) {
      inPrisonCount += 1;
      const st = stanceOf(p);
      if (st === 'broken') hasBrokenRoommate = true;
      if (st !== 'resist') allResist = false;
    }
  }
  if (inPrisonCount === 0) {
    syncPrisonAndChamberSeats(state);
    return;
  }

  const isFrontline = prison.index > THRONE_SLOT_INDEX;
  const hasIronTransfer = mods.activeResonances.includes('iron_transfer_ward');
  const hasAroma = mods.activeResonances.includes('aroma_temptation');
  const hasNightSchool = mods.activeResonances.includes('night_school_cell');
  const healPerSec = 1.2 * (hasIronTransfer ? 1.5 : 1.0);
  const huddleActive = inPrisonCount >= 2 && allResist;

  // V2.5 Holy Ward exponential decay inside Prison (tau >= 0.7 * tau_base combined floor)
  const tauBase = isFrontline ? 180 : 300;
  const rawTauMult = (hasIronTransfer ? 0.7 : 1.0) * Math.pow(0.9, Math.max(0, inPrisonCount - 1));
  const wardTau = tauBase * Math.max(0.7, rawTauMult);

  for (let i = 0, n = state.prisoners.length; i < n; i++) {
    const p = state.prisoners[i]!;
    if (p.cell !== 'prison' || p.escortedByHeroId) continue;

    if (p.hp < 100) {
      p.hp = Math.min(100, p.hp + healPerSec * dt);
    }
    if (p.mercy && p.hp >= 90) {
      p.mercy = false;
    }
    if ((p.ward ?? 0) > 0) {
      p.ward = p.ward * Math.exp(-dt / wardTau);
      if (p.ward < 0.001) p.ward = 0;
    }

    let pctPerMin = isFrontline ? 0.016 : 0.01;
    if (hasIronTransfer) pctPerMin += 0.005;
    if (hasAroma && !HERO_PERSONA[p.sourceHero]?.vegetarian) pctPerMin += 0.005;
    if (hasNightSchool) pctPerMin += 0.005;
    if (hasBrokenRoommate && stanceOf(p) !== 'broken') pctPerMin += 0.006;
    if (huddleActive) pctPerMin *= 0.5;

    const clampedPctPerMin = Math.min(0.04, pctPerMin);
    const floorWill = Math.max(1, Math.ceil(p.maxWill * 0.4));
    if (clampedPctPerMin > 0 && p.will > floorWill) {
      const drain = p.maxWill * (clampedPctPerMin / 60) * dt;
      p.will = Math.max(floorWill, p.will - drain);
      p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
    }
  }

  syncPrisonAndChamberSeats(state);
}

/**
 * V2.5 Vintage Aging & Cathedral 3-Wave Ransom Write-Off:
 * Each wave clear, jailed captives with vintageWaves < 3 collect Cathedral appeasement ransom.
 * On the 3rd wave, the Cathedral Treasury writes off their roster entry:
 * ward -0.5, will -10% maxWill (floor 1), abandonedByCathedral = true (+1 bonus rare trait & 100 happiness on convert).
 */
export function settlePrisonWaveRansom(state: GameState): void {
  const prison = getPrisonSlot(state);
  if (!prison) return;
  const isBackyard = prison.index < THRONE_SLOT_INDEX;
  let totalRansom = 0;

  for (const p of state.prisoners) {
    if (p.cell !== 'prison' || p.escortedByHeroId) continue;
    const prevWaves = p.vintageWaves ?? 0;
    if (prevWaves >= 3) continue;

    p.vintageWaves = prevWaves + 1;
    const def = HERO_DEFS[p.sourceHero];
    const ransom = Math.round(
      heroScaledGold(def.baseGoldDrop, p.waveCaptured, false) * 0.35 * (isBackyard ? 1.35 : 1.0),
    );
    if (ransom > 0) {
      depositGold(state, ransom);
      totalRansom += ransom;
    }

    if (p.vintageWaves >= 3) {
      p.abandonedByCathedral = true;
      p.ward = Math.max(0, (p.ward ?? 0) - 0.5);
      const willDrop = Math.round(p.maxWill * 0.1);
      p.will = Math.max(1, p.will - willDrop);
      p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
      const pName = locHeroName({ species: p.sourceHero, name: p.heroName, isBoss: false });
      pushVfx(state, {
        kind: 'banter',
        x: slotCenterX(prison.index),
        speakerId: `slot:${prison.index}`,
        speakerName: pName,
        label: t(
          '「圣堂财政部回函：贵员已注销编制，停止拨付赎金……他们把我除名了？！」',
          '"Cathedral Treasury Memo: Roster slot terminated; ransom halted... They fired me?!"',
        ),
        color: 0xf2c655,
      });
      pushEvent(state, {
        type: 'cathedral_abandon',
        slotIndex: prison.index,
        species: p.sourceHero,
        value: ransom,
        text: t(
          `圣堂断供！【${pName}】陈酿满 3 波遭财政部注销编制，护体 -50%、意志 -10%，收编必觉醒额外稀有词条！`,
          `Cathedral Write-Off! [${pName}] aged 3 waves & was struck off payroll (Ward -50%, Will -10%, guaranteed bonus rare trait)!`,
        ),
      });
    }
  }

  if (totalRansom > 0) {
    pushVfx(state, {
      kind: 'heal',
      x: slotCenterX(prison.index),
      value: totalRansom,
      label: t(`圣堂安抚赎金 +${totalRansom}G`, `Cathedral Ransom +${totalRansom}G`),
      color: 0xf2c655,
    });
  }
}

/** Empress Excommunication: frontline on entry (broken -> convert, resist -> nemesis), backyard on death (broken -> convert ONLY, I4). */
export function triggerEmpressExcommunicate(state: GameState, hero: HeroUnit, phase: 'entry' | 'death'): void {
  const prison = getPrisonSlot(state);
  if (!prison) return;
  const isFrontline = prison.index > THRONE_SLOT_INDEX;
  const prisonersInPrison = state.prisoners.filter((p) => p.cell === 'prison' && !p.escortedByHeroId);
  if (prisonersInPrison.length === 0) return;

  if (!isFrontline && phase === 'entry') {
    // Backyard prison: Empress mocks the cautious Overlord on entry, does NOT release anyone (I4)
    pushVfx(state, {
      kind: 'banter',
      x: hero.x,
      speakerId: hero.id,
      speakerName: locHeroName(hero),
      label: t('「把囚笼藏在王座后面？真是谨慎的小魔王。」', '"Hiding your prison behind the Throne? How cautious, little Overlord."'),
      color: 0xf2c655,
    });
    return;
  }

  if (isFrontline && phase === 'death') return; // Frontline already resolved on entry

  const brokenList = prisonersInPrison.filter((p) => stanceOf(p) === 'broken');
  const resistList = isFrontline ? prisonersInPrison.filter((p) => stanceOf(p) === 'resist') : [];

  if (brokenList.length > 0) {
    state.prisoners = state.prisoners.filter((p) => !brokenList.includes(p));
    for (const p of brokenList) {
      p.will = 0;
      p.progress = 1;
      completePrisonerCorruption(state, p, prison.index);
    }
    pushVfx(state, {
      kind: 'excommunicate_banner',
      x: slotCenterX(prison.index),
      subId: 'lord_inquisitor',
      label: t(
        '「圣堂不要你们了。没关系，本王要。」',
        '"The Cathedral disowned you. No matter—the Abyss claims you."',
      ),
      color: 0xf2c655,
    });
    pushEvent(state, {
      type: 'excommunicate',
      slotIndex: prison.index,
      value: brokenList.length,
      text: t(
        `天界除籍！${brokenList.length} 名破防俘虏被圣堂除名，0 耗魔直接投靠本王！`,
        `Celestial Excommunication! ${brokenList.length} broken captive(s) disowned and instantly recruited for 0 Mana!`,
      ),
    });
  }

  // Frontline resist prisoners released into nemesisPool (backyard NEVER releases — I4!)
  if (resistList.length > 0) {
    for (const p of resistList) {
      if (state.nemesisPool.length < 3) {
        state.prisoners = state.prisoners.filter((x) => x.id !== p.id);
        state.nemesisPool.push({
          id: p.id,
          sourceHero: p.sourceHero,
          targetSpecies: p.targetSpecies,
          heroName: p.heroName,
          will: p.will,
          maxWill: p.maxWill,
          waveEscaped: state.wave,
          grudgeTag: p.dessertHooked ? 'dessert' : (p.lastImplement ?? 'none'),
          vintageWaves: p.vintageWaves ?? 0,
        });
        incrementChronicle(state, 'escapes');
        state.metrics.prisonersEscaped = (state.metrics.prisonersEscaped ?? 0) + 1;
      }
    }
  }
}

/** Interrupt a hero's active raid (slap, grab, freeze, lightning, knockback). */
export function interruptHeroRaid(
  state: GameState,
  hero: HeroUnit,
  reason: 'slap' | 'spell' | 'grab' | 'cc',
): void {
  if (!hero.raid) return;
  const wasValkyriePurge = hero.raid.archetype === 'purge' && hero.valkyrieWarnActive;
  const wasKnightCharge = hero.raid.archetype === 'charge';

  releaseEscortedPrisoners(state, hero.id);
  hero.valkyrieWarnActive = false;

  if (wasValkyriePurge && (reason === 'slap' || reason === 'spell' || reason === 'cc')) {
    pushVfx(state, {
      kind: 'banter',
      x: hero.x,
      speakerId: 'overlord',
      speakerName: t('魔王', 'Overlord'),
      label: t('「我的人只有本王能电！」', '"Only I get to zap my captives!"'),
      color: 0xf2c655,
    });
    delete hero.raid;
    hero.freezeTimer = Math.max(hero.freezeTimer, 2.0);
    return;
  }

  if (wasKnightCharge && reason === 'slap') {
    hero.raid.phase = 'stunned';
    hero.raid.stunnedTimer = 3.0;
    pushVfx(state, {
      kind: 'banter',
      x: hero.x,
      speakerId: hero.id,
      speakerName: locHeroName(hero),
      label: t('「唔！竟敢当众掌掴圣光骑士！」', '"Gah! How dare you slap a Holy Knight in public!"'),
      color: 0xf05674,
    });
    return;
  }

  delete hero.raid;
}

/** Try to claim the single per-wave raid token (Invariant I4: frontline only, <= 1 per wave). */
export function tryClaimRaid(state: GameState, hero: HeroUnit): boolean {
  if (
    state.prisoners.length === 0 ||
    hero.raid ||
    hero.downedForCapture ||
    hero.hp <= 0 ||
    hero.freezeTimer > 0 ||
    hero.charmTimer > 0
  ) {
    return false;
  }
  const prison = getPrisonSlot(state);
  if (!prison) return false;

  const isFrontline = prison.index > THRONE_SLOT_INDEX;
  // Invariant I4: frontline only, at most 1 raid per wave
  if (isFrontline && state.raidsThisWave >= 1) return false;

  const prisonX = slotCenterX(prison.index);
  let hasPrisonerInCell = false;
  let hasBrokenInCell = false;
  for (let i = 0, n = state.prisoners.length; i < n; i++) {
    const p = state.prisoners[i]!;
    if (p.cell === 'prison' && !p.escortedByHeroId) {
      hasPrisonerInCell = true;
      if (stanceOf(p) === 'broken') hasBrokenInCell = true;
    }
  }
  if (!hasPrisonerInCell) return false;

  // Backyard prison: 100% safe (I4)! Only sneaking thief emits a one-shot funny bubble when passing by
  if (!isFrontline) {
    if (
      hero.species === 'dwarf_gold_thief' &&
      !hero.backyardGagDone &&
      Math.abs(hero.x - prisonX) <= 60 &&
      !hero.fleeingWithLoot
    ) {
      hero.backyardGagDone = true;
      if (hashUnitFloat(state.seed, state.waveSpawnSeq, hero.id, 'backyard_gag') < 0.35) {
        pushVfx(state, {
          kind: 'banter',
          x: hero.x,
          speakerId: hero.id,
          speakerName: locHeroName(hero),
          label: t('「抱歉姐妹，前面宝库的金子在喊我！」', '"Sorry sis, the Treasury gold up ahead is calling my name!"'),
          color: 0xf2c655,
        });
      }
    }
    return false;
  }

  const profile = RAID_PROFILES[hero.species];
  if (!profile || profile.alwaysTrigger) return false;

  const detectRange = profile.archetype === 'snipe' ? 320 : 220;
  if (Math.abs(hero.x - prisonX) > detectRange) return false;

  if (profile.requiresBroken && !hasBrokenInCell) {
    return false;
  }

  const roll = hashUnitFloat(state.seed, state.waveSpawnSeq, hero.id, 'raid_claim');
  if (roll >= profile.chance) return false;

  // Claim the single raid token immediately!
  state.raidsThisWave += 1;
  incrementChronicle(state, 'raids');
  state.metrics.raidsStarted = (state.metrics.raidsStarted ?? 0) + 1;
  ensurePrisonLock(state);

  hero.raid = {
    archetype: profile.archetype,
    phase: profile.archetype === 'flee_report' ? 'escort' : 'approach',
    prisonSlot: prison.index,
    timer: 0,
    targetPrisonerIds: [],
    shotsFired: 0,
    pickedHalfway: false,
  };

  pushEvent(state, {
    type: 'prison_raid',
    slotIndex: prison.index,
    species: hero.species,
    text: t(
      `劫狱警报！【${locHeroName(hero)}】盯上了前线深渊囚笼！`,
      `JAILBREAK ALERT! [${locHeroName(hero)}] is making a move on the Frontline Prison!`,
    ),
  });
  pushVfx(state, {
    kind: 'raid_alert',
    x: hero.x,
    speakerId: hero.id,
    speakerName: locHeroName(hero),
    label:
      profile.archetype === 'flee_report'
        ? t('「我、我去叫圣堂救兵！」', '"I-I’m going for Cathedral backup!"')
        : profile.archetype === 'charge'
          ? t('「放开我的同袍！！（红眼冲锋）」', '"Release my comrade!! (Crimson Charge)"')
          : profile.archetype === 'purge'
            ? t('「已堕异端，清理门户！」', '"Fallen heretic—I shall purge you!"')
            : t('「坚持住，我来砸锁救你！」', '"Hold on, I’m breaking the lock!"'),
    color: 0xf05674,
  });
  return true;
}

/** Step an active hero raid state machine. Returns true if the hero's normal AI should be skipped this tick. */
export function stepRaid(
  state: GameState,
  hero: HeroUnit,
  dt: number,
  moveFactor: number,
  escapeEdgeX: number,
  mods: RelicModifiers,
): boolean {
  const raid = hero.raid;
  if (!raid) return false;

  if (hero.freezeTimer > 0 || hero.charmTimer > 0) {
    interruptHeroRaid(state, hero, 'cc');
    return false;
  }

  if (raid.phase === 'stunned') {
    raid.stunnedTimer = Math.max(0, (raid.stunnedTimer ?? 0) - dt);
    if (raid.stunnedTimer <= 0) {
      delete hero.raid;
    }
    return true;
  }

  const prison = state.slots[raid.prisonSlot];
  if (!prison || prison.type !== 'prison') {
    releaseEscortedPrisoners(state, hero.id);
    delete hero.raid;
    return false;
  }

  const profile = RAID_PROFILES[hero.species];
  const prisonX = slotCenterX(prison.index);
  const lock = ensurePrisonLock(state);

  // 1. Approach phase
  if (raid.phase === 'approach') {
    const stopDist = profile.archetype === 'snipe' ? 240 : 42;
    const dx = prisonX - hero.x;
    if (Math.abs(dx) > stopDist) {
      const speedMult = profile.archetype === 'charge' ? 1.25 : 1.0;
      hero.x += Math.sign(dx) * hero.moveSpeed * moveFactor * speedMult * dt;
      hero.slotIndex = xToSlotIndex(hero.x);
      return true;
    }
    raid.phase = 'breach';
    raid.timer = 0;
    if (profile.archetype === 'purge') {
      hero.valkyrieWarnActive = true;
      pushVfx(state, {
        kind: 'valkyrie_warn',
        x: hero.x,
        speakerId: hero.id,
        speakerName: locHeroName(hero),
        label: t('「！异端处决引导中（4s）！」', '"! Purging heretic (4s)!"'),
        color: 0xff3b5c,
      });
    }
    return true;
  }

  // 2. Breach / Channel phase
  if (raid.phase === 'breach') {
    const prisonersInPrison = state.prisoners.filter((p) => p.cell === 'prison' && !p.escortedByHeroId);
    if (prisonersInPrison.length === 0) {
      hero.valkyrieWarnActive = false;
      delete hero.raid;
      return false;
    }

    // Hook: Holy Sister Chant (heals HP ONLY, NEVER will — I1; cancelled if ally corrupted_sister present)
    if (profile.archetype === 'chant') {
      const hasCorruptedSister = state.units.some(
        (u) => u.species === 'corrupted_sister' && u.hp > 0 && (u.recoveryTimer ?? 0) <= 0,
      );
      if (hasCorruptedSister) {
        pushVfx(state, {
          kind: 'banter',
          x: hero.x,
          speakerId: hero.id,
          speakerName: locHeroName(hero),
          label: t('「异端黑弥撒把我的圣歌盖过去了？！」', '"Your dark mass drowned out my hymn?!"'),
          color: 0xd966ff,
        });
        delete hero.raid;
        return false;
      }
      raid.timer += dt;
      for (const p of prisonersInPrison) {
        p.hp = Math.min(100, p.hp + 4 * dt);
      }
      if (raid.timer >= (profile.channelSec ?? 8)) {
        delete hero.raid;
      }
      return true;
    }

    // Hook: Valkyrie Purge (4s channel -> drops broken prisoner HP to 20, NEVER kills I2, -10% will I1 + oathbreakerVow)
    if (profile.archetype === 'purge') {
      raid.timer += dt;
      if (raid.timer >= (profile.channelSec ?? 4)) {
        hero.valkyrieWarnActive = false;
        const target = prisonersInPrison.find((p) => stanceOf(p) === 'broken');
        if (target) {
          target.hp = Math.max(20, Math.min(target.hp, 20));
          applyFlavorWillHit(target, FLAVOR_BITS.VALKYRIE_BETRAYAL, 0.10);
          target.oathbreakerVow = true;
          pushVfx(state, {
            kind: 'banter',
            x: prisonX,
            speakerId: `slot:${prison.index}`,
            speakerName: locHeroName({ species: target.sourceHero, name: target.heroName, isBoss: false }),
            label: t('「圣堂砍我的这一剑，我会亲手还回去！」', '"That Cathedral blade—I will return it myself!"'),
            color: 0xf05674,
          });
        }
        delete hero.raid;
      }
      return true;
    }

    // Hook: Elf Snipe (2 arrows x 50% lock; 100% blocked by gargoyle/slime guard!)
    if (profile.archetype === 'snipe') {
      raid.timer += dt;
      if (raid.timer >= 1.2) {
        raid.timer = 0;
        raid.shotsFired = (raid.shotsFired ?? 0) + 1;
        const guard = state.units.find(
          (u) =>
            u.hp > 0 &&
            (u.recoveryTimer ?? 0) <= 0 &&
            u.assignedSlot === prison.index &&
            (u.species === 'gargoyle_warden' || u.species === 'slime_girl'),
        );
        if (guard) {
          pushVfx(state, {
            kind: 'banter',
            x: guard.x,
            speakerId: guard.id,
            speakerName: guard.name,
            label:
              guard.species === 'gargoyle_warden'
                ? t('「咚。又拿脸接箭。」', '"Thud. Blocked it with my face again."')
                : t('「诶？身体里多了一根牙签~」', '"Ooh, a free toothpick stuck in my jelly~"'),
            color: 0x42d69f,
          });
          delete hero.raid;
          return false;
        }
        if (lock) {
          lock.hp = Math.max(0, lock.hp - lock.max * 0.5);
          pushVfx(state, { kind: 'projectile', x: hero.x, targetX: prisonX, isAlly: false, color: 0xffe985 });
        }
        if (!lock || lock.hp <= 0 || raid.shotsFired >= (profile.snipeShots ?? 2)) {
          raid.phase = 'resolve';
        }
      }
      return true;
    }

    // Hook: Sapper Blast (3s fuse -> lock=0, stuns captives, HP floor 30, zero deaths I2!)
    if (profile.archetype === 'blast') {
      raid.timer += dt;
      if (raid.timer >= (profile.channelSec ?? 3)) {
        if (lock) lock.hp = 0;
        for (const p of prisonersInPrison) {
          p.hp = Math.max(30, p.hp - 15);
        }
        pushVfx(state, {
          kind: 'raid_alert',
          x: prisonX,
          speakerId: hero.id,
          speakerName: locHeroName(hero),
          label: t('「救援成功率 100%，发型生还率 0%！」', '"Rescue rate: 100%. Hairstyle survival: 0%!"'),
          color: 0xff8a3d,
        });
        raid.phase = 'resolve';
      }
      return true;
    }

    // Standard lock-breach archetypes (charge, pick, extract_one, sled, melt, airlift)
    if (lock) {
      const lead = prisonersInPrison[0]!;
      const waverSlow = stanceOf(lead) === 'waver' ? 0.5 : 1.0;
      lock.hp = Math.max(0, lock.hp - lock.max * profile.breachRatePerSec * waverSlow * dt);

      // Hook: Thief pick halfway -> 50% (100% with Gilded Window) abandon lock to steal Treasury!
      if (profile.archetype === 'pick' && !raid.pickedHalfway && lock.hp <= lock.max * 0.5) {
        raid.pickedHalfway = true;
        const abandonChance = mods.activeResonances.includes('gilded_cell_window') ? 1.0 : 0.5;
        if (hashUnitFloat(state.seed, state.waveSpawnSeq, hero.id, 'pick_abandon') < abandonChance) {
          pushVfx(state, {
            kind: 'banter',
            x: hero.x,
            speakerId: hero.id,
            speakerName: locHeroName(hero),
            label: t('「抱歉姐妹，宝库的金子在喊我！」', '"Sorry sis, the Treasury gold is calling me!"'),
            color: 0xf2c655,
          });
          delete hero.raid;
          return false;
        }
      }

      // Hook: Archmage melt -> chips HP (floor 30) & scolds captives (-5% will, I1)
      if (profile.archetype === 'melt') {
        for (const p of prisonersInPrison) {
          p.hp = Math.max(30, p.hp - 3 * dt);
          applyFlavorWillHit(p, FLAVOR_BITS.MAGE_SCOLD, 0.05);
        }
      }

      if (lock.hp <= 0) {
        raid.phase = 'resolve';
      }
    } else {
      raid.phase = 'resolve';
    }
    return true;
  }

  // 3. Resolve phase (4-stance betrayal!)
  if (raid.phase === 'resolve') {
    const prisonersInPrison = state.prisoners.filter((p) => p.cell === 'prison' && !p.escortedByHeroId);
    if (prisonersInPrison.length === 0) {
      delete hero.raid;
      return false;
    }

    // Choose targets
    let chosen: PrisonerRecord[];
    if (profile.archetype === 'extract_one') {
      const sorted = [...prisonersInPrison].sort((a, b) => b.waveCaptured - a.waveCaptured);
      chosen = [sorted[0]!];
      // Assassin cold contract: remaining captives lose 10% will!
      for (const rem of sorted.slice(1)) {
        applyFlavorWillHit(rem, FLAVOR_BITS.ASSASSIN_ABANDON, 0.10);
      }
    } else {
      const maxExtract = profile.maxExtract ?? 1;
      chosen = prisonersInPrison.slice(0, maxExtract);
    }

    const lead = chosen[0]!;
    const stance = stanceOf(lead);

    // Stance A: Dessert-hooked -> 100% refuses escape!
    if (stance === 'dessert') {
      refillPrisonLock(state);
      pushVfx(state, {
        kind: 'banter',
        x: prisonX,
        speakerId: `slot:${prison.index}`,
        speakerName: locHeroName({ species: lead.sourceHero, name: lead.heroName, isBoss: false }),
        label: t('「外面只有黑面包？那你把门锁好再走。」', '"Only dry Cathedral bread outside? Lock the door on your way out."'),
        color: 0xffb347,
      });
      delete hero.raid;
      return false;
    }

    // Stance B: Broken -> TWIN SUITE! Kicks rescuer (2.5s stun) and jails her if eligible!
    if (stance === 'broken') {
      hero.freezeTimer = Math.max(hero.freezeTimer, 2.5);
      refillPrisonLock(state);
      const heroDef = HERO_DEFS[hero.species];
      const isCapturable =
        Boolean(heroDef.capturableAs) &&
        (CAPTURABLE_HERO_IDS as readonly string[]).includes(hero.species) &&
        !hero.isBoss;
      const maxPrisonCap = getPrisonCapacity(prison);
      const currentInPrison = state.prisoners.filter((p) => p.cell === 'prison').length;
      const combatCount = state.units.filter((u) => u.species !== 'imp').length;
      const maxCombat = getMaxCombatUnits(state);

      if (isCapturable && currentInPrison < maxPrisonCap && combatCount + state.prisoners.length < maxCombat + 3) {
        // Direct Twin Suite capture! Does NOT consume capturesThisWave (#81)
        const maxWill = prisonerMaxWill(hero.wave);
        const twin: PrisonerRecord = {
          id: nextEntityId('prisoner', state),
          sourceHero: hero.species as CapturableHeroId,
          targetSpecies: heroDef.capturableAs!,
          heroName: heroDef.name,
          waveCaptured: hero.wave,
          will: maxWill,
          maxWill,
          progress: 0,
          hp: 100,
          cell: 'prison',
          mercy: false,
          dessertHooked: false,
          flavorHits: 0,
          feedCd: 0,
          ward: 1.0,
          satiety: 0,
          drowsyTimer: 0,
          overchargeTimer: 0,
          overchargeCrit: false,
          vintageWaves: 0,
          abandonedByCathedral: false,
          escortedByHeroId: null,
        };
        state.prisoners.push(twin);
        hero.hp = 0; // Remove rescuer cleanly from battlefield
        incrementChronicle(state, 'twinSuites');
        state.metrics.twinSuitesTriggered = (state.metrics.twinSuitesTriggered ?? 0) + 1;
        pushEvent(state, {
          type: 'twin_suite',
          slotIndex: prison.index,
          species: hero.species,
          text: t(
            `反手举报！破防俘虏一脚踹翻【${locHeroName(hero)}】，喜提深渊囚笼双人间！`,
            `TWIN SUITE! Broken captive kicked [${locHeroName(hero)}] straight into the cell!`,
          ),
        });
        pushVfx(state, {
          kind: 'raid_alert',
          x: prisonX,
          speakerId: `slot:${prison.index}`,
          speakerName: locHeroName({ species: lead.sourceHero, name: lead.heroName, isBoss: false }),
          label: t(
            '「欢迎入住双人间！下午三点准时发焦糖布丁~」',
            '"Welcome to the twin suite! Pudding is served promptly at 3 PM~"',
          ),
          color: 0xf2c655,
        });
      } else {
        // Fallback: 2x report bounty gold
        const bounty = Math.round(hero.goldDrop * 2);
        depositGold(state, bounty);
        pushVfx(state, {
          kind: 'banter',
          x: prisonX,
          speakerId: `slot:${prison.index}`,
          speakerName: locHeroName({ species: lead.sourceHero, name: lead.heroName, isBoss: false }),
          label: t(`「看守！有人劫狱！举报奖金 +${bounty}G！」`, `"Guards! Jailbreaker! Report bounty +${bounty}G!"`),
          color: 0xf2c655,
        });
      }
      delete hero.raid;
      return true;
    }

    // Stance C: Resist / Waver -> Escort toward right exit!
    raid.targetPrisonerIds = chosen.map((p) => p.id);
    for (const p of chosen) {
      p.escortedByHeroId = hero.id;
    }
    raid.phase = 'escort';
    return true;
  }

  // 4. Escort phase (or Novice flee_report)
  if (raid.phase === 'escort') {
    // Dragon airlift crash-land when HP < 50%
    if (profile.archetype === 'airlift' && hero.hp < hero.maxHp * 0.5) {
      releaseEscortedPrisoners(state, hero.id);
      hero.freezeTimer = Math.max(hero.freezeTimer, 2.0);
      pushVfx(state, {
        kind: 'banter',
        x: hero.x,
        speakerId: hero.id,
        speakerName: locHeroName(hero),
        label: t('「咣当——！坠笼了！俘虏全滚回牢里了！」', '"CLANG—! Crash landing! Captives rolled right back into the cell!"'),
        color: 0xff8a3d,
      });
      delete hero.raid;
      return true;
    }

    const speedMult = profile.escortSpeedMult ?? 0.9;
    hero.x += hero.moveSpeed * moveFactor * speedMult * dt;
    hero.slotIndex = xToSlotIndex(hero.x);

    if (hero.x >= escapeEdgeX) {
      if (profile.archetype === 'flee_report') {
        state.pendingReinforcements = Math.min(2, state.pendingReinforcements + 1);
        pushEvent(state, {
          type: 'prison_raid',
          slotIndex: hero.slotIndex,
          species: hero.species,
          text: t(
            `见习女剑士逃出地牢报信！下波将额外增援 1 名精英勇者！`,
            `Novice Swordswoman escaped to call backup! +1 reinforcement next wave!`,
          ),
        });
        hero.hp = 0; // Mark for removal
        delete hero.raid;
        return true;
      }

      // Move escorted prisoners into nemesisPool (max 3; if full, lost in fog -> return to prison!)
      for (const pid of raid.targetPrisonerIds) {
        const idx = state.prisoners.findIndex((p) => p.id === pid);
        if (idx < 0) continue;
        const p = state.prisoners[idx]!;
        if (state.nemesisPool.length < 3) {
          state.prisoners.splice(idx, 1);
          state.nemesisPool.push({
            id: p.id,
            sourceHero: p.sourceHero,
            targetSpecies: p.targetSpecies,
            heroName: p.heroName,
            will: p.will,
            maxWill: p.maxWill,
            waveEscaped: state.wave,
            grudgeTag: p.dessertHooked ? 'dessert' : (p.lastImplement ?? 'none'),
            vintageWaves: p.vintageWaves ?? 0,
          });
          incrementChronicle(state, 'escapes');
          state.metrics.prisonersEscaped = (state.metrics.prisonersEscaped ?? 0) + 1;
          pushEvent(state, {
            type: 'prisoner_escaped',
            slotIndex: prison.index,
            species: p.sourceHero,
            text: t(
              `【${p.heroName}】趁乱逃出囚笼，带着既有腐化进度进入宿敌回归池！`,
              `[${p.heroName}] escaped into the Nemesis Pool with her Corruption progress intact!`,
            ),
          });
        } else {
          // Pool full -> rescuer gets lost in abyssal fog, prisoner returns safely!
          p.escortedByHeroId = null;
          p.cell = 'prison';
        }
      }
      hero.hp = 0; // Rescuer leaves the dungeon
      delete hero.raid;
      return true;
    }
    return true;
  }

  return false;
}
