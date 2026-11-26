import {
  HERO_EXTREME_K,
  HERO_PERSONA,
  HERO_WEAKNESS_IMPLEMENT,
  TORTURE_HP_K,
} from '../data/prisonAndRaids';
import { ROOM_DEFS } from '../data/roomsAndTraps';
import {
  defaultCorruptionMarkForSpecies,
  getUnitRoomWorkOutputMult,
} from '../data/synergyAndMarks';
import { TORTURE_IMPLEMENTS } from '../data/tortureAndTech';
import { ABYSSAL_UNIT_DEFS, CAPTURABLE_HERO_IDS, HERO_DEFS, matchFusionRecipe } from '../data/units';
import { locHeroDef, locTortureStageLine, locUnitName, t } from '../i18n';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  depositGold,
  fusionChildLevel,
  isOverchargeCritWindow,
  overchargeManaCost,
  prisonerMaxWill,
  type RelicModifiers,
} from '../formulas';
import {
  createAbyssalUnit,
  findRoomSlotByType,
  getMaxCombatUnits,
  grantUnitXp,
  incrementChronicle,
  nextEntityId,
  pushEvent,
  pushVfx,
  recalcUnitStats,
  slotCenterX,
} from '../ecs/stateFactory';
import type { SeededRng } from '../rng';
import {
  SIM_DT,
  THRONE_SLOT_INDEX,
  type AbyssalSpeciesId,
  type AbyssalUnit,
  type CapturableHeroId,
  type GameState,
  type HeroUnit,
  type PrisonerRecord,
  type TraitId,
} from '../types';
import { countCorruptedSisters, getUnitActionMultiplier } from './ecosystemSystem';
import {
  getChamberSeatCapacity,
  getPrisonCapacity,
  getPrisonSlot,
  stepPrisonPassives,
  syncPrisonAndChamberSeats,
} from './prisonSystem';
import { triggerStoryIfUnseen } from './progressionSystem';

export function addPrisoner(
  state: GameState,
  hero: HeroUnit,
  cell: 'prison' | 'chamber' = 'chamber',
): PrisonerRecord | null {
  const def = HERO_DEFS[hero.species];
  if (!def.capturableAs) return null;
  if (!(CAPTURABLE_HERO_IDS as readonly string[]).includes(hero.species)) {
    return null;
  }

  const hasPrison = Boolean(getPrisonSlot(state));
  const maxWill = hero.nemesisMaxWill ?? prisonerMaxWill(hero.wave);
  const initWill =
    hero.isNemesisReturn && hero.nemesisWill !== undefined
      ? Math.max(1, Math.min(maxWill, hero.nemesisWill))
      : maxWill;
  const prisoner: PrisonerRecord = {
    id: nextEntityId('prisoner', state),
    sourceHero: hero.species as CapturableHeroId,
    targetSpecies: def.capturableAs,
    heroName: def.name,
    waveCaptured: hero.wave,
    will: initWill,
    maxWill,
    progress: Math.min(1, 1 - initWill / Math.max(1, maxWill)),
    hp: 100,
    cell: hasPrison ? cell : 'chamber',
    mercy: false,
    dessertHooked: hero.nemesisGrudgeTag === 'dessert',
    flavorHits: 0,
    feedCd: 0,
    ward: 1.0,
    satiety: 0,
    drowsyTimer: 0,
    overchargeTimer: 0,
    overchargeCrit: false,
    vintageWaves: hero.nemesisVintageWaves ?? 0,
    abandonedByCathedral: (hero.nemesisVintageWaves ?? 0) >= 3,
    isNemesisReturn: hero.isNemesisReturn,
    escortedByHeroId: null,
  };
  state.prisoners.push(prisoner);
  syncPrisonAndChamberSeats(state);
  return prisoner;
}

export function addPrisonerToCorruptionChamber(state: GameState, hero: HeroUnit): PrisonerRecord | null {
  const prison = getPrisonSlot(state);
  return addPrisoner(state, hero, prison ? 'prison' : 'chamber');
}

export function feedPrisonerChicken(
  state: GameState,
  prisonerId: string,
): { ok: boolean; reason?: string; healAmt?: number; drowsy?: boolean } {
  const p = state.prisoners.find((x) => x.id === prisonerId);
  if (!p) return { ok: false, reason: t('未找到该俘虏', 'Prisoner not found') };
  if (HERO_PERSONA[p.sourceHero]?.vegetarian) {
    return {
      ok: false,
      reason: t('精灵素食者拒吃烤鸡，请上地狱甜品桌！', 'Vegetarian Elf refuses chicken—serve Hell Dessert instead!'),
    };
  }
  if (p.feedCd > 0) {
    return { ok: false, reason: t(`刚吃过烤鸡，冷却 ${Math.ceil(p.feedCd)}s`, `Just ate chicken (${Math.ceil(p.feedCd)}s cd)`) };
  }
  const hatchery = findRoomSlotByType(state, 'hatchery');
  if (!hatchery || hatchery.chickens < 1) {
    return { ok: false, reason: t('孵化场暂无可用烤鸡', 'No roast chickens available in Hatchery') };
  }
  hatchery.chickens -= 1;
  const prevSat = Math.max(0, p.satiety ?? 0);
  const healAmt = Math.round(40 * Math.max(0, 1 - prevSat / 120));
  p.hp = Math.min(100, p.hp + healAmt);
  if (p.mercy && p.hp >= 90) p.mercy = false;
  if (prevSat < 30) {
    p.will = Math.max(1, p.will - Math.round(p.maxWill * 0.03));
    p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
  }
  p.satiety = Math.min(120, prevSat + 45);
  state.overchargeCd = Math.max(0, (state.overchargeCd ?? 0) - 15);
  let drowsy = false;
  if (p.satiety > 100) {
    p.drowsyTimer = 12;
    drowsy = true;
  }
  p.feedCd = 20;
  incrementChronicle(state, 'chickensFed');
  const roomIdx = findRoomSlotByType(state, p.cell === 'prison' ? 'prison' : 'corruption')?.index ?? THRONE_SLOT_INDEX;
  pushVfx(state, {
    kind: 'chicken_feast',
    x: slotCenterX(roomIdx),
    value: healAmt,
    color: 0x42d69f,
  });
  if (drowsy) {
    pushVfx(state, {
      kind: 'banter',
      x: slotCenterX(roomIdx),
      speakerId: `slot:${roomIdx}`,
      speakerName: locHeroDef(p.sourceHero).name,
      label: t('「嗝……吃撑犯困了……审讯先停 12 秒……」', '"Burp... too full... food coma for 12s..."'),
      color: 0xffb347,
    });
  }
  return { ok: true, healAmt, drowsy };
}

/**
 * V2.5 Dual Chicken Choice #2: Eat Roast Chicken in front of the chair-bound captive!
 * Requires cell === 'chamber', hp >= 35, feedCd <= 0, and >= 1 Hatchery chicken.
 * Drops ward -0.05, will -3% maxWill (floor 40%), non-veg -5 HP (floor 20 safeword / 1 extreme), veg 0 HP + gag.
 */
export function tauntPrisonerChicken(
  state: GameState,
  prisonerId: string,
): { ok: boolean; reason?: string; vegetarian?: boolean } {
  const p = state.prisoners.find((x) => x.id === prisonerId);
  if (!p || p.cell !== 'chamber' || p.escortedByHeroId) {
    return { ok: false, reason: t('仅对刑讯椅上的在审俘虏生效', 'Only works on a captive seated on the Torture Chair') };
  }
  if (p.hp < 35) {
    return { ok: false, reason: t('俘虏血量低于 35，别馋了先喂鸡续命！', 'Captive HP < 35—feed her instead of taunting!') };
  }
  if (p.feedCd > 0) {
    return { ok: false, reason: t(`烤鸡冷却中（剩余 ${Math.ceil(p.feedCd)}s）`, `Chicken cooldown (${Math.ceil(p.feedCd)}s left)`) };
  }
  const hatchery = findRoomSlotByType(state, 'hatchery');
  if (!hatchery || hatchery.chickens < 1) {
    return { ok: false, reason: t('孵化场暂无可用烤鸡', 'No roast chickens available in Hatchery') };
  }
  hatchery.chickens -= 1;
  p.feedCd = 20;
  p.ward = Math.max(0, (p.ward ?? 0) - 0.05);
  const floorWill = Math.max(1, Math.ceil(p.maxWill * 0.4));
  if (p.will > floorWill) {
    p.will = Math.max(floorWill, p.will - Math.round(p.maxWill * 0.03));
    p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
  }
  const isVeg = Boolean(HERO_PERSONA[p.sourceHero]?.vegetarian);
  if (!isVeg) {
    const floorHp = state.noMercyMode ? 1 : 20;
    p.hp = Math.max(floorHp, p.hp - 5);
    if (!state.noMercyMode && p.hp < 25) p.mercy = true;
  }
  const roomIdx = findRoomSlotByType(state, 'corruption')?.index ?? THRONE_SLOT_INDEX;
  pushVfx(state, {
    kind: 'torture_gag',
    x: slotCenterX(roomIdx),
    subId: state.equippedImplement,
    speakerId: `slot:${roomIdx}`,
    speakerName: locHeroDef(p.sourceHero).name,
    label: isVeg
      ? t('「油腻腻的肉香离我远点！你们深渊的伙食太粗俗了！」', '"Keep that greasy roast away from me! How utterly uncivilized!"')
      : t('「咕噜……你竟然当着我的面撕鸡腿吃……太缺德了！」', '"*Gulp*... Eating a crispy drumstick right in front of me... pure evil!"'),
    color: 0xffb347,
  });
  return { ok: true, vegetarian: isVeg };
}

/**
 * V2.5 Engine-level Overcharge Torture (replaces old UI 25-Mana cheat button).
 * 45s CD, mana = 18 + round(1.4 * wave), 5s x4 burst (+25% HP dmg).
 * Clicking while will/maxWill in [0.58,0.72] U [0.25,0.39] latches Opportune Overcharge (x6 cap, 0 extra HP dmg)!
 */
export function overchargeTorture(
  state: GameState,
): { ok: boolean; reason?: string; isCrit?: boolean; manaCost?: number } {
  const chamber = findRoomSlotByType(state, 'corruption');
  if (!chamber) return { ok: false, reason: t('尚未修建刑讯室', 'Torture Chamber not built') };
  const p = state.prisoners.find((x) => x.cell === 'chamber' && !x.escortedByHeroId);
  if (!p) {
    return { ok: false, reason: t('刑讯椅当前空置，请先从囚笼提审俘虏', 'Torture Chair is empty—summon a captive from Prison first') };
  }
  if ((state.overchargeCd ?? 0) > 0) {
    return {
      ok: false,
      reason: t(`过载冷却中（剩余 ${Math.ceil(state.overchargeCd)}s）`, `Overcharge cooling down (${Math.ceil(state.overchargeCd)}s)`),
    };
  }
  if (p.hp < 35) {
    return { ok: false, reason: t('俘虏体征过低（需 HP ≥ 35）', 'Captive vitals too low (needs HP >= 35)') };
  }
  if ((p.drowsyTimer ?? 0) > 0) {
    return { ok: false, reason: t('俘虏正吃撑犯困，暂不可过载', 'Captive is in a food coma—cannot overcharge') };
  }
  if ((p.hardHoldTimer ?? 0) > 0) {
    return { ok: false, reason: t('刑具硬控锁死中，稍后再试', 'Implement hard-hold active—wait a moment') };
  }
  const manaCost = overchargeManaCost(state.wave);
  if (state.mana < manaCost) {
    return { ok: false, reason: t(`魔力不足（需 ${manaCost} 魔力）`, `Not enough Mana (needs ${manaCost} Mana)`) };
  }

  state.mana -= manaCost;
  state.overchargeCd = 45;
  const isCrit = isOverchargeCritWindow(p.will, p.maxWill);
  p.overchargeTimer = 5.0;
  p.overchargeCrit = isCrit;

  pushVfx(state, {
    kind: 'torture_gag',
    x: slotCenterX(chamber.index),
    subId: state.equippedImplement,
    speakerId: `slot:${chamber.index}`,
    speakerName: locHeroDef(p.sourceHero).name,
    label: isCrit
      ? t('「趁势过载 ×6！！糟糕，防线彻底崩盘了！！」', '"OPPORTUNE OVERCHARGE x6!! My resolve is crumbling!!"')
      : t('「过载加压 ×4！！功率开太猛了呀！！」', '"OVERCHARGE x4!! Turn the dial down!!"'),
    color: isCrit ? 0xf2c655 : 0xf05674,
  });
  return { ok: true, isCrit, manaCost };
}

export function transferPrisonerCell(
  state: GameState,
  prisonerId: string,
  targetCell: 'prison' | 'chamber',
): boolean {
  const p = state.prisoners.find((x) => x.id === prisonerId);
  if (!p || p.escortedByHeroId) return false;
  if (p.cell === targetCell) return true;
  if (targetCell === 'prison') {
    const prison = getPrisonSlot(state);
    if (!prison) return false;
    const inPrison = state.prisoners.filter((x) => x.cell === 'prison').length;
    if (inPrison >= getPrisonCapacity(prison)) return false;
    p.cell = 'prison';
    return true;
  } else {
    const chamber = findRoomSlotByType(state, 'corruption');
    if (!chamber) return false;
    const seatCap = getChamberSeatCapacity(state);
    const seated = state.prisoners.filter((x) => x.cell === 'chamber' && !x.escortedByHeroId);
    if (seated.length >= seatCap && seated[0]) {
      seated[0].cell = 'prison';
    }
    p.cell = 'chamber';
    return true;
  }
}

function handlePrisonerObituary(
  state: GameState,
  prisoner: PrisonerRecord,
  chamberSlotIndex: number,
): void {
  state.metrics.prisonersDied = (state.metrics.prisonersDied ?? 0) + 1;
  incrementChronicle(state, 'obituaries');
  state.prestige.obituaryBadgeUnlocked = true;

  // Legacy 1: Senior Ghost Tutor (600s, +15% corruption speed, refreshes only)
  state.ghostTutorTimer = 600;
  // Legacy 3: Martyr's Bounty (next wave double hero gold, non-stacking)
  state.martyrBountyWaves = 1;
  // Soul Mark + Mana
  state.prestige.corruptedSoulMarks[prisoner.targetSpecies] =
    (state.prestige.corruptedSoulMarks[prisoner.targetSpecies] ?? 0) + 1;

  // Legacy 2: Skeletal Rehire (★1 Skeleton Blademaid Lv=max(1, floor(w*0.4)) + 35 Mana, or host XP + 50 Mana if full)
  const combatUnits = state.units.filter((u) => u.species !== 'imp');
  const maxCombat = getMaxCombatUnits(state) + 2;
  if (combatUnits.length < maxCombat) {
    const skelLv = Math.max(1, Math.min(BALANCE_CONFIG.unitMaxLevel, Math.floor(prisoner.waveCaptured * 0.4)));
    const frontlineSlot =
      state.slots.find((s) => s.type === 'corridor' && s.index > THRONE_SLOT_INDEX)?.index ?? chamberSlotIndex;
    const skel = createAbyssalUnit(state, 'skeleton_blademaid', chamberSlotIndex, {
      level: skelLv,
      star: 1,
      assignedSlot: frontlineSlot,
    });
    state.units.push(skel);
    state.mana = Math.min(state.manaCap, state.mana + 35);
    state.metrics.totalManaEarned += 35;
  } else {
    const host = combatUnits[0];
    if (host) grantUnitXp(state, host, 140 + prisoner.waveCaptured * 20);
    state.mana = Math.min(state.manaCap, state.mana + 50);
    state.metrics.totalManaEarned += 50;
  }

  const pName = locHeroDef(prisoner.sourceHero).name;
  pushVfx(state, {
    kind: 'obituary_banner',
    x: slotCenterX(chamberSlotIndex),
    subId: prisoner.sourceHero,
    label: t(
      `《深渊工伤讣告》【${pName}】嘴比头盔还硬光荣殉职！怨灵助教+带盔骸骨+下波双倍悬赏已到账！`,
      `OBITUARY: [${pName}] perished on the chair (mouth harder than plate armor)! Ghost Tutor + Skeletal Rehire + 2x Bounty!`,
    ),
    color: 0xf05674,
  });
  pushEvent(state, {
    type: 'prisoner_died',
    slotIndex: chamberSlotIndex,
    species: prisoner.sourceHero,
    text: t(
      `《深渊工伤讣告》【${pName}】在极限高压下光荣殉职，留下怨灵助教、带盔骸骨与殉道双倍悬赏！`,
      `Abyssal Obituary: [${pName}] perished under Extreme Voltage—leaving Ghost Tutor, Skeletal Rehire & Martyr's Bounty!`,
    ),
  });
}

export function stepCorruptionSystem(
  state: GameState,
  cachedMods?: RelicModifiers,
  stepDt = SIM_DT,
  rng?: SeededRng,
): void {
  const dt = stepDt;
  const mods = cachedMods ?? computeGlobalModifiers(state);

  // V2.4 Always step Prison passive recovery, will drain & seat rotation
  stepPrisonPassives(state, dt, mods);

  if (state.prisoners.length === 0) return;
  let chamber: GameState['slots'][number] | undefined;
  for (let i = 0, n = state.slots.length; i < n; i++) {
    if (state.slots[i]!.type === 'corruption') {
      chamber = state.slots[i]!;
      break;
    }
  }
  if (!chamber) return;

  const hasPrison = Boolean(getPrisonSlot(state));
  const seated = hasPrison
    ? state.prisoners.filter((p) => p.cell === 'chamber' && !p.escortedByHeroId)
    : state.prisoners;
  if (seated.length === 0) return;

  const sisterCount = countCorruptedSisters(state);
  const implement = TORTURE_IMPLEMENTS[state.equippedImplement] ?? TORTURE_IMPLEMENTS.electric_chair;

  let top1: AbyssalUnit | null = null;
  let top1Score = -1;
  let top2: AbyssalUnit | null = null;
  let top2Score = -1;
  for (let ui = 0, un = state.units.length; ui < un; ui++) {
    const u = state.units[ui]!;
    if (
      u.species !== 'imp' &&
      u.assignedSlot === chamber.index &&
      u.hp > 0 &&
      u.activity !== 'dangling' &&
      u.activity !== 'altar_bound' &&
      (u.recoveryTimer ?? 0) <= 0
    ) {
      const score = u.species === 'crimson_succubus' ? 2 : u.traits.includes('corruptor') ? 1 : 0;
      if (score > top1Score) {
        top2 = top1;
        top2Score = top1Score;
        top1 = u;
        top1Score = score;
      } else if (score > top2Score) {
        top2 = u;
        top2Score = score;
      }
    }
  }

  let workerMult = 1.0;
  for (const w of [top1, top2]) {
    if (!w) continue;
    const actionMult = getUnitActionMultiplier(w, state, mods, sisterCount) * getUnitRoomWorkOutputMult(w);
    const corruptorBonus =
      w.species === 'crimson_succubus'
        ? 1.7
        : w.traits.includes('corruptor')
          ? 1.35
          : 0.7;
    workerMult += 0.55 * corruptorBonus * actionMult;
    w.activity = 'working';
  }

  const overlordMult =
    state.overlordId === 'lilith' ? 1 + BALANCE_CONFIG.lilithCorruptionSpeedBonus : 1;

  const manaCost = BALANCE_CONFIG.corruptionManaPerSec * implement.manaCostMult * dt;
  const manaFactor = manaCost <= 0 || state.mana >= manaCost ? 1 : 0.4;
  if (manaCost > 0 && state.mana >= manaCost) {
    state.mana -= manaCost;
  }

  // Truth Spotlight extracts gold intel while interrogating!
  if (implement.goldPerSec > 0) {
    const loot = implement.goldPerSec * (1 + chamber.level * 0.25) * mods.goldMult * dt;
    depositGold(state, loot);
  }

  const ghostTutorMult = state.ghostTutorTimer > 0 ? 1.15 : 1.0;
  const rate =
    BALANCE_CONFIG.baseCorruptRate *
    (1 + BALANCE_CONFIG.corruptRatePerRoomLevel * (chamber.level - 1)) *
    workerMult *
    overlordMult *
    implement.speedMult *
    mods.corruptSpeedMult *
    manaFactor *
    ghostTutorMult;

  // Periodic 3-stage hero × implement progression torture speech bubbles!
  state.tortureGagTimer -= dt;
  if (state.tortureGagTimer <= 0 && seated.length > 0) {
    state.tortureGagTimer = 9 + (rng ? rng.next() * 7 : 4);
    const p0 = seated[0]!;
    const line =
      p0.hp <= 10
        ? t('我……什么都……不会……告诉……你的……（吴京脸）', 'I… won’t… tell you… anything… (stoic stare)')
        : locTortureStageLine(p0.sourceHero, implement.id, p0.progress);
    const pName = locHeroDef(p0.sourceHero).name;
    pushVfx(state, {
      kind: 'torture_gag',
      x: slotCenterX(chamber.index),
      subId: implement.id,
      speakerId: `slot:${chamber.index}`,
      speakerName: pName,
      label: t(`「${line}」`, `"${line}"`),
      color: implement.accentColor,
    });
  }

  const targets = implement.aoeAllPrisoners ? seated : [seated[0]!];
  const completed: PrisonerRecord[] = [];
  const perished: PrisonerRecord[] = [];
  const baseK = TORTURE_HP_K[implement.id] ?? 0;

  for (const p of targets) {
    p.hp ??= 100;
    p.lastImplement = implement.id;

    // V2.5 Food coma pauses both will drain and HP drain
    if ((p.drowsyTimer ?? 0) > 0) continue;

    // Electric Chair extreme-mode deterministic 3s hard-hold at 50% & 80%
    if (implement.id === 'electric_chair' && state.noMercyMode) {
      if ((p.hardHoldTimer ?? 0) > 0) {
        p.hardHoldTimer = Math.max(0, (p.hardHoldTimer ?? 0) - dt);
        continue;
      }
      const stage = p.hardHoldStage ?? 0;
      if (stage === 0 && p.progress >= 0.5) {
        p.hardHoldStage = 1;
        p.hardHoldTimer = 3.0;
        continue;
      }
      if (stage === 1 && p.progress >= 0.8) {
        p.hardHoldStage = 2;
        p.hardHoldTimer = 3.0;
        continue;
      }
    }

    // Weakness implement discovery (2x will drain, same HP cost!)
    const isWeakness = HERO_WEAKNESS_IMPLEMENT[p.sourceHero] === implement.id;
    if (isWeakness && !state.prestige.codexWeakness.includes(p.sourceHero)) {
      state.prestige.codexWeakness.push(p.sourceHero);
      pushVfx(state, {
        kind: 'weakness_found',
        x: slotCenterX(chamber.index),
        subId: p.sourceHero,
        label: t('「找到了，这就是她的软肋。」', '"Found it. Right in her weak spot."'),
        color: 0xf2c655,
      });
      pushEvent(state, {
        type: 'weakness_found',
        slotIndex: chamber.index,
        species: p.sourceHero,
        text: t(
          `发现弱点刑具！对【${locHeroDef(p.sourceHero).name}】破意效率 ×2！`,
          `Weakness found! 2x Will drain against [${locHeroDef(p.sourceHero).name}]!`,
        ),
      });
    }

    // Safeword Mercy check (Invariant I2: 0 deaths unless state.noMercyMode === true)
    let effRate = rate;
    let effK = baseK;
    if (!state.noMercyMode) {
      if (p.hp < 25) {
        p.mercy = true;
      }
      if (p.mercy) {
        // Stay on chair at 0 HP cost and 0.6x gentle pace if no healthy swap happened
        effK = Math.min(0, baseK);
        effRate *= 0.6;
      }
    } else {
      // V2.5 Extreme Voltage Mode: +25% speed, k_mode = 1.35 * k_hero (when prison exists)
      effRate *= 1.25;
      const kHero = hasPrison ? (HERO_EXTREME_K[p.sourceHero] ?? 1.0) : 1.0;
      if (effK > 0) {
        effK = baseK * 1.35 * kHero;
      }
    }

    // V2.5 Engine-level Overcharge burst (hard cap <= 6x; Opportune Crit avoids extra HP damage)
    if ((p.overchargeTimer ?? 0) > 0) {
      const burstMult = Math.min(6, p.overchargeCrit ? 6 : 4);
      effRate *= burstMult;
      if (!p.overchargeCrit && effK > 0) {
        effK *= 1.25;
      }
    }

    // V2.5 Holy Ward [0,1]: slows will drain x(1 - 0.6*ward), raises HP cost x(1 + 0.5*ward)
    // Weakness 2x multiplies totalWillDrain AFTER baseWillDrain -> truly halves total HP cost!
    const ward = Math.max(0, Math.min(1, p.ward ?? 0));
    const baseWillDrain = effRate * dt * (1 - 0.6 * ward);
    const totalWillDrain = baseWillDrain * (isWeakness ? 2.0 : 1.0);
    p.will = Math.max(0, p.will - totalWillDrain);
    p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));

    // Closed-form HP delta using pre-weakness baseWillDrain!
    const hpDelta = -effK * (1 + 0.5 * ward) * (baseWillDrain / Math.max(1, p.maxWill)) * 100;
    if (implement.id === 'hell_dessert_table') {
      p.hp = Math.min(100, p.hp + 3.5 * dt);
      if (p.progress >= 0.3) {
        p.dessertHooked = true;
      }
    } else if (hpDelta !== 0) {
      if (!state.noMercyMode) {
        // Safeword hard floor: NEVER allow HP <= 0 in Safeword mode (I2)
        p.hp = Math.max(20, Math.min(100, p.hp + hpDelta));
        if (p.hp < 25) p.mercy = true;
      } else {
        p.hp = Math.min(100, p.hp + hpDelta);
      }
    }

    if (state.noMercyMode && p.hp <= 0) {
      perished.push(p);
    } else if (p.will <= 0) {
      completed.push(p);
    }
  }

  if (perished.length > 0) {
    state.prisoners = state.prisoners.filter((p) => !perished.includes(p));
    for (const p of perished) {
      handlePrisonerObituary(state, p, chamber.index);
    }
  }

  if (completed.length > 0) {
    state.prisoners = state.prisoners.filter((p) => !completed.includes(p));
    for (const p of completed) {
      const converted = completePrisonerCorruption(state, p, chamber.index);
      // Perfect Finish gold banner if converted at HP <= 10!
      if (p.hp <= 10) {
        converted.happiness = 100;
        converted.frenzyBuffTimer = Math.max(converted.frenzyBuffTimer, 30);
        incrementChronicle(state, 'perfectFinishes');
        state.metrics.perfectFinishes = (state.metrics.perfectFinishes ?? 0) + 1;
        pushVfx(state, {
          kind: 'perfect_finish',
          x: slotCenterX(chamber.index),
          subId: p.targetSpecies,
          label: t(
            '「完美收口！再多一伏特就得写讣告了！」',
            '"Clean finish! One more volt and we’d owe an obituary!"',
          ),
          color: 0xf2c655,
        });
        pushEvent(state, {
          type: 'perfect_finish',
          slotIndex: chamber.index,
          unitId: converted.id,
          species: p.targetSpecies,
          text: t(
            `完美收口！【${locUnitName(converted)}】丝血收编，获赠满愉悦与 30s 狂暴！`,
            `Clean Finish! [${locUnitName(converted)}] recruited on the razor’s edge (+100% Happiness & 30s Frenzy)!`,
          ),
        });
      }
    }
  }

  if (hasPrison) {
    syncPrisonAndChamberSeats(state);
  }
}

export function completePrisonerCorruption(
  state: GameState,
  prisoner: PrisonerRecord,
  chamberSlotIndex: number,
): AbyssalUnit {
  const targetSpecies = prisoner.targetSpecies;
  const targetLevel = Math.max(1, Math.min(BALANCE_CONFIG.unitMaxLevel, Math.floor(prisoner.waveCaptured * 0.5)));
  const frontlineSlot =
    state.slots.find((s) => s.type === 'corridor' && s.index > THRONE_SLOT_INDEX)?.index ?? chamberSlotIndex;
  const maxCombatUnits = getMaxCombatUnits(state) + 2;
  const combatUnits = state.units.filter((u) => u.species !== 'imp');
  const implement = TORTURE_IMPLEMENTS[state.equippedImplement] ?? TORTURE_IMPLEMENTS.electric_chair;

  if (combatUnits.length >= maxCombatUnits) {
    const host =
      combatUnits.find((u) => u.species === targetSpecies) ??
      combatUnits.find((u) => u.tier === 3) ??
      combatUnits[0];
    if (host) {
      const baseXp = 260 + prisoner.waveCaptured * 40;
      const bonusXp = prisoner.abandonedByCathedral ? Math.round(baseXp * 1.25) : baseXp;
      grantUnitXp(state, host, bonusXp);
      state.metrics.totalCaptivesConverted += 1;
      if (state.metrics.totalCaptivesConverted === 1) {
        triggerStoryIfUnseen(state, 'first_ace_converted', prisoner.sourceHero);
      }
      state.prestige.corruptedSoulMarks[targetSpecies] =
        (state.prestige.corruptedSoulMarks[targetSpecies] ?? 0) + 1;
      const pName = locHeroDef(prisoner.sourceHero).name;
      const hName = locUnitName(host);
      pushEvent(state, {
        type: 'corruption_complete',
        slotIndex: chamberSlotIndex,
        unitId: host.id,
        species: targetSpecies,
        text: t(
          `暗影灵魂共鸣！【${pName}】的力量注入【${hName}】！`,
          `Soul Resonance! [${pName}]'s power infused into [${hName}]!`,
        ),
      });
      return host;
    }
  }

  const mods = computeGlobalModifiers(state);
  const targetDef = ABYSSAL_UNIT_DEFS[targetSpecies];
  const traits: TraitId[] = [...targetDef.innateTraits];
  const rareTraitPool: TraitId[] = [
    'vampiric',
    'double_strike',
    'blood_frenzy',
    'arcane_surge',
    'iron_wall',
    'corruptor',
    'true_sight',
  ];
  if (mods.resonanceBonusTraitOnConvert && traits.length < 3) {
    const extra = rareTraitPool.find((tr) => !traits.includes(tr));
    if (extra) traits.push(extra);
  }
  if (prisoner.abandonedByCathedral && traits.length < 3) {
    const extra = rareTraitPool.find((tr) => !traits.includes(tr));
    if (extra) traits.push(extra);
  }
  const defaultMark = prisoner.oathbreakerVow
    ? 'oathbreaker'
    : defaultCorruptionMarkForSpecies(targetSpecies);
  const startStar = prisoner.isNemesisReturn ? 2 : 1;

  const converted = createAbyssalUnit(state, targetSpecies, chamberSlotIndex, {
    level: targetLevel,
    star: startStar,
    traits,
    corruptionMark: defaultMark,
    assignedSlot:
      targetSpecies === 'corrupted_sister'
        ? chamberSlotIndex
        : targetSpecies === 'shadow_phantom_thief'
          ? 0
          : frontlineSlot,
  });
  converted.happiness =
    prisoner.oathbreakerVow || prisoner.abandonedByCathedral
      ? 100
      : Math.min(100, converted.happiness + implement.bonusHappinessOnConvert);

  state.units.push(converted);
  state.metrics.totalCaptivesConverted += 1;
  incrementChronicle(state, 'conversions');
  if (state.metrics.totalCaptivesConverted === 1) {
    triggerStoryIfUnseen(state, 'first_ace_converted', prisoner.sourceHero);
  }
  state.prestige.corruptedSoulMarks[targetSpecies] =
    (state.prestige.corruptedSoulMarks[targetSpecies] ?? 0) + 1;

  const pName = locHeroDef(prisoner.sourceHero).name;
  const cName = locUnitName(converted);
  pushVfx(state, {
    kind: 'cutin',
    x: slotCenterX(chamberSlotIndex),
    subId: `convert:${targetSpecies}`,
    label: t(`三阶王牌收编 · 【${cName}】宣誓效忠！`, `Tier 3 Ace Converted · [${cName}] Swears Fealty!`),
    color: 0xf05674,
  });

  pushEvent(state, {
    type: 'corruption_complete',
    slotIndex: chamberSlotIndex,
    unitId: converted.id,
    species: targetSpecies,
    text: t(
      `堕落转化完成！【${pName}】已宣誓效忠，晋升为三阶王牌【${cName}】！`,
      `Corruption complete! [${pName}] swore fealty as Tier 3 Ace [${cName}]!`,
    ),
  });

  return converted;
}

export function assignUnitToAltarSlot(state: GameState, unitId: string): boolean {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.species === 'imp' || unit.locked) return false;

  if (state.altar.slotAUnitId === unitId || state.altar.slotBUnitId === unitId) {
    return true;
  }
  if (!state.altar.slotAUnitId) {
    state.altar.slotAUnitId = unitId;
    unit.activity = 'altar_bound';
    return true;
  }
  if (!state.altar.slotBUnitId) {
    state.altar.slotBUnitId = unitId;
    unit.activity = 'altar_bound';
    return true;
  }
  return false;
}

export function clearAltarSlots(state: GameState): void {
  for (const id of [state.altar.slotAUnitId, state.altar.slotBUnitId]) {
    if (!id) continue;
    const u = state.units.find((x) => x.id === id);
    if (u && u.activity === 'altar_bound') u.activity = 'idle';
  }
  state.altar.slotAUnitId = null;
  state.altar.slotBUnitId = null;
}

export interface FusionPreview {
  valid: boolean;
  reason?: string;
  mode?: 'tier_up' | 'star_up';
  resultSpecies?: AbyssalSpeciesId;
  resultName?: string;
  resultLevel?: number;
  resultStar?: number;
  inheritedTraits?: TraitId[];
  manaCost?: number;
}

export function previewAltarFusion(state: GameState, unitAId: string, unitBId: string): FusionPreview {
  if (unitAId === unitBId) return { valid: false, reason: t('需要两名不同的麾下眷属', 'Select two distinct retainers') };
  const a = state.units.find((u) => u.id === unitAId);
  const b = state.units.find((u) => u.id === unitBId);
  if (!a || !b) return { valid: false, reason: t('单位不存在', 'Unit not found') };
  if (a.locked || b.locked) return { valid: false, reason: t('已锁定的眷属不可作为融合素材', 'Locked retainers cannot be fused') };

  const match = matchFusionRecipe(a.species, b.species);
  if (!match) return { valid: false, reason: t('两名眷属暂不匹配已知融合配方', 'No matching fusion recipe for this pair') };

  const mods = computeGlobalModifiers(state);
  const resultDef = ABYSSAL_UNIT_DEFS[match.result];
  const baseLv = fusionChildLevel(a.level, b.level);
  const bonusLv = Math.floor(Math.max(a.level, b.level) * mods.altarLevelKeepBonus);
  const resultLevel = Math.min(BALANCE_CONFIG.unitMaxLevel, baseLv + bonusLv);
  const resultStar =
    match.type === 'star_up'
      ? Math.min(BALANCE_CONFIG.unitMaxStar, Math.max(a.star, b.star) + 1)
      : Math.max(1, Math.min(BALANCE_CONFIG.unitMaxStar, Math.max(a.star, b.star)));

  if (match.type === 'star_up' && Math.max(a.star, b.star) >= BALANCE_CONFIG.unitMaxStar) {
    return { valid: false, reason: t('已达到最高 5 星上限', 'Already at max ★5 cap') };
  }

  const traitPool = new Set<TraitId>([...resultDef.innateTraits, ...a.traits, ...b.traits]);
  const inheritedTraits = Array.from(traitPool).slice(0, 3);

  const manaCost =
    match.type === 'star_up' && resultDef.tier >= 2
      ? 120 * resultStar
      : BALANCE_CONFIG.fusionManaCost;

  return {
    valid: true,
    mode: match.type,
    resultSpecies: match.result,
    resultName: resultDef.name,
    resultLevel,
    resultStar,
    inheritedTraits,
    manaCost,
  };
}

export function executeAltarFusion(
  state: GameState,
  unitAId: string,
  unitBId: string,
  _rng?: SeededRng,
): AbyssalUnit | null {
  const altar = findRoomSlotByType(state, 'altar');
  if (!altar) return null;

  const preview = previewAltarFusion(state, unitAId, unitBId);
  if (!preview.valid || !preview.resultSpecies) return null;
  const manaCost = preview.manaCost ?? BALANCE_CONFIG.fusionManaCost;
  if (state.mana < manaCost) return null;

  state.mana -= manaCost;
  state.units = state.units.filter((u) => u.id !== unitAId && u.id !== unitBId);
  state.altar.slotAUnitId = null;
  state.altar.slotBUnitId = null;

  const resultDef = ABYSSAL_UNIT_DEFS[preview.resultSpecies];
  let preferredSlot = findRoomSlotByType(state, resultDef.preferredRoom)?.index ?? altar.index;
  const prefRoomDef = state.slots[preferredSlot] ? ROOM_DEFS[state.slots[preferredSlot]!.type] : null;
  if (prefRoomDef && state.slots[preferredSlot]!.type !== 'corridor') {
    const occupying = state.units.filter((u) => u.assignedSlot === preferredSlot).length;
    if (occupying >= prefRoomDef.unitCapacity) {
      preferredSlot =
        state.slots.find((s) => s.type === 'corridor' && s.index > THRONE_SLOT_INDEX)?.index ?? preferredSlot;
    }
  }
  const rareRank = state.prestige.techLevels?.rare_trait_boost ?? state.prestige.talents.rareTraitBoost;
  const fusedTraits = [...(preview.inheritedTraits ?? resultDef.innateTraits)];
  const mods = computeGlobalModifiers(state);
  const bonusPool: TraitId[] = [
    'vampiric',
    'double_strike',
    'blood_frenzy',
    'arcane_surge',
    'iron_wall',
    'corruptor',
    'true_sight',
    'frost_bite',
  ].filter((t) => !fusedTraits.includes(t as TraitId)) as TraitId[];

  if (mods.resonanceBonusTraitOnConvert && fusedTraits.length < 3 && bonusPool.length > 0) {
    const picked = _rng ? _rng.pick(bonusPool) : bonusPool[0]!;
    fusedTraits.push(picked);
  } else if (_rng && rareRank > 0 && fusedTraits.length < 3 && bonusPool.length > 0) {
    const chance = Math.min(0.85, rareRank * 0.17);
    if (_rng.chance(chance)) {
      fusedTraits.push(_rng.pick(bonusPool));
    }
  }

  const fused = createAbyssalUnit(state, preview.resultSpecies, altar.index, {
    level: preview.resultLevel ?? 1,
    star: preview.resultStar ?? 1,
    traits: fusedTraits,
    assignedSlot: preferredSlot,
  });

  recalcUnitStats(state, fused);
  state.units.push(fused);
  state.metrics.totalFusions += 1;

  pushEvent(state, {
    type: 'fusion_complete',
    slotIndex: altar.index,
    unitId: fused.id,
    species: fused.species,
    text: t(
      `深渊融合成功！诞生 ★${fused.star} Lv.${fused.level}【${locUnitName(fused)}】！`,
      `Abyssal Fusion complete! Born ★${fused.star} Lv.${fused.level} [${locUnitName(fused)}]!`,
    ),
  });

  return fused;
}
