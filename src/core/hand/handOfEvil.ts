import { FLAVOR_BITS, HERO_EXTREME_K, TORTURE_HP_K } from '../data/prisonAndRaids';
import { SPELL_DEFS } from '../data/roomsAndTraps';
import { TORTURE_IMPLEMENTS } from '../data/tortureAndTech';
import { HERO_DEFS } from '../data/units';
import { locHeroName, locSpell, locTortureStageLine, locUnitDef, t } from '../i18n';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  computeSlapHpCost,
  depositGold,
} from '../formulas';
import {
  advanceTutorialIfMatch,
  incrementChronicle,
  pushEvent,
  pushVfx,
  slotCenterX,
} from '../ecs/stateFactory';
import type { SeededRng } from '../rng';
import {
  THRONE_SLOT_INDEX,
  type GameState,
  type SpellId,
} from '../types';
import {
  addPrisoner,
  assignUnitToAltarSlot,
} from '../systems/corruptionAndFusionSystem';
import {
  applyFlavorWillHit,
  getPrisonCapacity,
  getTotalPrisonerCapacity,
  interruptHeroRaid,
} from '../systems/prisonSystem';
import { isSlotUnlocked, isSpellUnlocked } from '../systems/progressionSystem';

export interface SlapResult {
  ok: boolean;
  hpLost: number;
  buffDuration: number;
  quote: string;
}

/**
 * Left-click grab: lifts an Abyssal Unit into the Hand of Evil with pendulum physics.
 */
export function grabUnit(state: GameState, unitId: string): boolean {
  if (state.hand.heldUnitId !== null || state.hand.heldHeroId !== null) return false;
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return false;
  if (unit.hp <= 0 || state.heartReviveTimer > 0) return false;

  if (state.altar.slotAUnitId === unit.id) state.altar.slotAUnitId = null;
  if (state.altar.slotBUnitId === unit.id) state.altar.slotBUnitId = null;

  state.hand.heldUnitId = unit.id;
  unit.activity = 'dangling';
  unit.impTask = 'idle';
  unit.impTargetSlot = null;

  pushEvent(state, {
    type: 'unit_grabbed',
    unitId: unit.id,
    species: unit.species,
    slotIndex: unit.slotIndex,
  });
  return true;
}

/**
 * Bonus V2 Bullfrog interaction: Grab a sneaking/fleeing Thief with Hand of Evil and toss her into traps!
 */
export function grabThiefHero(state: GameState, heroId: string): boolean {
  if (state.hand.heldUnitId !== null || state.hand.heldHeroId !== null) return false;
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero || !hero.isThief || hero.hp <= 0 || hero.downedForCapture) return false;
  state.hand.heldHeroId = hero.id;
  hero.stealthTimer = 0;
  return true;
}

/**
 * V2.1 Bullfrog interaction: Grab a downed capturable Hero directly with Hand of Evil
 * (automatically unbinds any hauling Imp!) and drop her straight into the Corruption Chamber!
 */
export function grabDownedHero(state: GameState, heroId: string): boolean {
  if (state.hand.heldUnitId !== null || state.hand.heldHeroId !== null) return false;
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero || !hero.downedForCapture) return false;
  const def = HERO_DEFS[hero.species];
  if (!def?.capturableAs) return false;

  // Unbind any hauling Imp so it doesn't stay stuck
  if (hero.beingHauledByImpId) {
    const imp = state.units.find((u) => u.id === hero.beingHauledByImpId);
    if (imp) {
      imp.carryingCaptiveId = null;
      imp.impTask = 'idle';
      imp.impTargetSlot = null;
    }
    hero.beingHauledByImpId = null;
  }

  state.hand.heldHeroId = hero.id;
  return true;
}

/**
 * Release held unit (or grabbed thief / downed captive hero!) into target dungeon slot (0..27).
 */
export function dropUnit(state: GameState, targetSlotIndex: number): boolean {
  // Handle tossing a grabbed Hero (either downed captive OR sneaking thief!)
  if (state.hand.heldHeroId) {
    const hero = state.heroes.find((h) => h.id === state.hand.heldHeroId);
    state.hand.heldHeroId = null;
    if (!hero) return false;
    const clampedIdx = Math.max(0, Math.min(state.slots.length - 1, Math.floor(targetSlotIndex)));
    const slot = state.slots[clampedIdx];

    // Branch A: Downed capturable hero! (Supports dropping into Torture Chamber OR Abyssal Prison!)
    if (hero.downedForCapture) {
      if (slot && (slot.type === 'corruption' || slot.type === 'prison')) {
        const maxPrisoners = getTotalPrisonerCapacity(state);
        if (state.prisoners.length < maxPrisoners) {
          const targetCell = slot.type === 'prison' ? 'prison' : 'chamber';
          const prisoner = addPrisoner(state, hero, targetCell);
          if (prisoner) {
            // Instant 10% maxWill shock on hand-drop into torture chair/prison!
            prisoner.will = Math.max(1, prisoner.will - Math.round(prisoner.maxWill * 0.1));
            prisoner.progress = Math.min(1, 1 - prisoner.will / Math.max(1, prisoner.maxWill));
            state.heroes = state.heroes.filter((h) => h.id !== hero.id);
            const hName = locHeroName(hero);
            pushEvent(state, {
              type: 'captive_dropped',
              slotIndex: slot.index,
              species: hero.species,
              value: Math.round(prisoner.maxWill * 0.1),
              text: t(
                `亲手把【${hName}】按进${slot.type === 'prison' ? '深渊囚笼' : '刑讯室'}！圣光意志立削 10%！`,
                `Hand-dropped [${hName}] straight into ${slot.type === 'prison' ? 'Prison' : 'Torture'}! Holy Will -10%!`,
              ),
            });
            pushVfx(state, {
              kind: 'torture_gag',
              x: slotCenterX(slot.index),
              subId: state.equippedImplement,
              speakerId: `slot:${slot.index}`,
              speakerName: hName,
              label: t(
                `「呀啊！放开我，不要把我关进来！！」`,
                `"Eek! Let go—don't lock me in here!!"`,
              ),
              color: 0xff8ec8,
            });
            return true;
          }
        }
      }
      // Dropped outside corruption/prison (or full): restore downed in place WITHOUT resetting downedTimer!
      let landSlot = slot;
      if (!landSlot || landSlot.type === 'rock_vein') {
        landSlot =
          state.slots
            .filter((s) => s.type !== 'rock_vein')
            .sort((a, b) => Math.abs(a.index - clampedIdx) - Math.abs(b.index - clampedIdx))[0] ??
          state.slots[THRONE_SLOT_INDEX]!;
      }
      hero.slotIndex = landSlot.index;
      hero.x = slotCenterX(landSlot.index);
      hero.beingHauledByImpId = null;
      return true;
    }

    // Branch B: Grabbed Thief! If dropped into an Abyssal Prison with room, jail her directly & drop others' will -8%!
    if (slot && slot.type === 'prison' && hero.species === 'dwarf_gold_thief') {
      const inPrison = state.prisoners.filter((p) => p.cell === 'prison').length;
      if (inPrison < getPrisonCapacity(slot)) {
        interruptHeroRaid(state, hero, 'grab');
        const jailed = addPrisoner(state, hero, 'prison');
        if (jailed) {
          state.heroes = state.heroes.filter((h) => h.id !== hero.id);
          // Other captives cheer and lose 8% will (one-time flavor bit)
          for (const other of state.prisoners) {
            if (other.id !== jailed.id) {
              applyFlavorWillHit(other, FLAVOR_BITS.THIEF_JAILED, 0.08);
            }
          }
          incrementChronicle(state, 'thievesCaught');
          pushVfx(state, {
            kind: 'banter',
            x: slotCenterX(slot.index),
            speakerId: `slot:${slot.index}`,
            speakerName: locHeroName(hero),
            label: t('「抓得好！连我那份一起电这个叛徒！」', '"Nice catch! Zap that traitor twice for me!"'),
            color: 0xf2c655,
          });
          return true;
        }
      }
    }

    // Branch B: Grabbed Thief!
    const landIdx = slot && slot.type !== 'rock_vein' ? slot.index : THRONE_SLOT_INDEX + 2;
    hero.slotIndex = landIdx;
    hero.x = slotCenterX(landIdx);
    hero.fleeingWithLoot = false;
    hero.stealthTimer = 0;
    // Slam damage + shake loose stolen gold with 2x bounty!
    const slamDmg = Math.max(25, Math.round(hero.maxHp * 0.28));
    hero.hp = Math.max(1, hero.hp - slamDmg);
    hero.hurtAnimTimer = 0.4;
    if (hero.stolenGold > 0) {
      const hasHound = state.units.some((u) => u.hp > 0 && u.corruptionMark === 'true_hound');
      const bounty = Math.round(hero.stolenGold * 2 * (hasHound ? 1.25 : 1));
      depositGold(state, bounty);
      state.metrics.totalThievesCaught += 1;
      hero.stolenGold = 0;
      pushEvent(state, {
        type: 'thief_caught',
        slotIndex: landIdx,
        value: bounty,
        text: t(
          `魔王之手活捉偷金贼！狠狠一摔抖出双倍赃款 +${bounty}G！`,
          `Hand of Evil caught the Thief! Slammed loose 2x bounty +${bounty}G!`,
        ),
      });
      pushVfx(state, {
        kind: 'cutin',
        x: hero.x,
        subId: 'thief_caught',
        label: t(`活捉偷金贼 · 缴获 +${bounty}G！`, `Thief Caught · Seized +${bounty}G!`),
        color: 0xf2c655,
      });
    }
    pushVfx(state, { kind: 'damage', x: hero.x, value: slamDmg, isCrit: true, color: 0xf05674 });
    return true;
  }

  const heldId = state.hand.heldUnitId;
  if (!heldId) return false;
  const unit = state.units.find((u) => u.id === heldId);
  state.hand.heldUnitId = null;
  if (!unit) return false;

  const clampedIdx = Math.max(0, Math.min(state.slots.length - 1, Math.floor(targetSlotIndex)));
  let slot = state.slots[clampedIdx];
  if (!slot || slot.type === 'rock_vein') {
    const passable = state.slots
      .filter((s) => s.type !== 'rock_vein')
      .sort((a, b) => Math.abs(a.index - clampedIdx) - Math.abs(b.index - clampedIdx))[0];
    slot = passable ?? state.slots[THRONE_SLOT_INDEX]!;
  }

  unit.slotIndex = slot.index;
  unit.x = slotCenterX(slot.index);
  unit.activity = 'idle';

  if (unit.species === 'imp') {
    unit.assignedSlot = null;
    if (
      clampedIdx !== slot.index &&
      state.slots[clampedIdx]?.type === 'rock_vein' &&
      isSlotUnlocked(state, clampedIdx)
    ) {
      state.slots[clampedIdx]!.markedForDig = true;
    }
  } else {
    unit.assignedSlot = slot.index;

    if (slot.type === 'hatchery' && slot.chickens > 0) {
      const mods = computeGlobalModifiers(state);
      slot.chickens -= 1;
      const healAmt = Math.round(
        unit.maxHp * (BALANCE_CONFIG.chickenHealHpRatio + mods.chickenHealBonus),
      );
      unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
      unit.satiety = Math.min(100, unit.satiety + BALANCE_CONFIG.chickenRestoreSatiety);
      unit.activity = 'eating';
      unit.eatAnimTimer = 0.9;
      if (mods.resonanceChickenFrenzySec > 0) {
        unit.frenzyBuffTimer = Math.max(unit.frenzyBuffTimer, mods.resonanceChickenFrenzySec);
      }
      pushEvent(state, {
        type: 'chicken_eaten',
        unitId: unit.id,
        slotIndex: slot.index,
        value: healAmt,
      });
      pushVfx(state, { kind: 'chicken_feast', x: unit.x, value: healAmt, color: 0x42d69f });
    } else if (slot.type === 'altar' && !unit.locked) {
      assignUnitToAltarSlot(state, unit.id);
    }
  }

  advanceTutorialIfMatch(state, 3);

  pushEvent(state, {
    type: 'unit_dropped',
    unitId: unit.id,
    species: unit.species,
    slotIndex: slot.index,
  });
  return true;
}

/**
 * Right-click short tap: Bullfrog Slap!
 */
export function slapUnit(state: GameState, unitId: string, rng: SeededRng): SlapResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || state.heartReviveTimer > 0) {
    return { ok: false, hpLost: 0, buffDuration: 0, quote: '' };
  }

  const mods = computeGlobalModifiers(state);
  const hpCost = computeSlapHpCost(unit.hp, unit.maxHp);
  unit.hp = Math.max(1, unit.hp - hpCost);

  const duration = BALANCE_CONFIG.slapDurationSec + mods.slapDurationBonus;
  unit.slapBuffTimer = duration;
  unit.slapReactTimer = 0.45;
  state.metrics.totalSlaps += 1;

  const collarBonus = unit.corruptionMark === 'night_collar' ? 2 : 1;
  if (unit.personality === 'masochist' || unit.traits.includes('masochist_delight')) {
    unit.happiness = Math.min(100, unit.happiness + 4 * collarBonus);
  } else if (unit.corruptionMark === 'night_collar') {
    unit.happiness = Math.min(100, unit.happiness + 4);
  }

  const def = locUnitDef(unit.species);
  const quote = rng.pick(def.slapLines);

  advanceTutorialIfMatch(state, 2);

  pushEvent(state, {
    type: 'unit_slapped',
    unitId: unit.id,
    species: unit.species,
    slotIndex: unit.slotIndex,
    value: hpCost,
    text: quote,
  });

  return { ok: true, hpLost: hpCost, buffDuration: duration, quote };
}

export function slapChicken(state: GameState, slotIndex: number): boolean {
  const slot = state.slots[slotIndex];
  if (!slot || slot.type !== 'hatchery' || slot.chickens <= 0) return false;
  pushEvent(state, {
    type: 'chicken_scattered',
    slotIndex,
    value: slot.chickens,
    text: t('咯咯哒——！！', 'Bawk-bawk!!'),
  });
  return true;
}

/**
 * Right-click short tap on an occupied Corruption Chamber: pressurize interrogation!
 * V2.5: Dedicated 4.0s chamberSlapCd, -1.2% maxWill, strictly chair-bound & non-drowsy, scales HP loss by effK & ward.
 */
export function pressurizeTortureChamber(
  state: GameState,
  slotIndex: number,
  _rng: SeededRng,
): { ok: boolean; quote: string; implementId: string } {
  if ((state.chamberSlapCd ?? 0) > 0) {
    return { ok: false, quote: '', implementId: state.equippedImplement };
  }
  const slot = state.slots[slotIndex];
  const p = state.prisoners.find((x) => x.cell === 'chamber' && !x.escortedByHeroId);
  if (!slot || slot.type !== 'corruption' || !p || (p.drowsyTimer ?? 0) > 0) {
    return { ok: false, quote: '', implementId: state.equippedImplement };
  }
  state.chamberSlapCd = 4.0;
  const impl = TORTURE_IMPLEMENTS[state.equippedImplement] ?? TORTURE_IMPLEMENTS.electric_chair;
  const shock = Math.max(4, Math.round(p.maxWill * 0.012));
  p.will = Math.max(0, p.will - shock);
  p.progress = Math.min(1, 1 - p.will / Math.max(1, p.maxWill));
  const baseK = TORTURE_HP_K[impl.id] ?? 0;
  let effK = baseK;
  if (!state.noMercyMode && p.mercy) {
    effK = Math.min(0, baseK);
  } else if (state.noMercyMode && baseK > 0) {
    const hasPrison = state.slots.some((sl) => sl.type === 'prison');
    const kHero = hasPrison ? (HERO_EXTREME_K[p.sourceHero] ?? 1.0) : 1.0;
    effK = baseK * 1.35 * kHero;
  }
  if (effK > 0) {
    const wardHpMult = 1 + 0.5 * Math.max(0, Math.min(1, p.ward ?? 0));
    const hpDrop = effK * wardHpMult * (shock / Math.max(1, p.maxWill)) * 100;
    p.hp = state.noMercyMode ? Math.max(0, p.hp - hpDrop) : Math.max(20, p.hp - hpDrop);
    if (!state.noMercyMode && p.hp < 25) p.mercy = true;
  }
  const line = locTortureStageLine(p.sourceHero, impl.id, p.progress);
  const pName = locHeroName({ species: p.sourceHero, name: p.heroName, isBoss: false });
  pushVfx(state, {
    kind: 'torture_gag',
    x: slotCenterX(slot.index),
    subId: impl.id,
    speakerId: `slot:${slot.index}`,
    speakerName: pName,
    label: t(`「${line}」`, `"${line}"`),
    color: impl.accentColor,
  });
  return { ok: true, quote: line, implementId: impl.id };
}

export function slapHero(state: GameState, heroId: string): boolean {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero || hero.hp <= 0 || hero.downedForCapture) return false;
  if (hero.raid) {
    interruptHeroRaid(state, hero, 'slap');
    hero.hurtAnimTimer = 0.35;
    return true;
  }
  hero.hurtAnimTimer = 0.25;
  hero.slowTimer = Math.max(hero.slowTimer, 1.5);
  return true;
}

export function markRockForMining(state: GameState, slotIndex: number): boolean {
  if (!isSlotUnlocked(state, slotIndex)) return false;
  const slot = state.slots[slotIndex];
  if (!slot || slot.type !== 'rock_vein') return false;
  slot.markedForDig = !slot.markedForDig;
  if (slot.markedForDig) {
    advanceTutorialIfMatch(state, 0);
  }
  return true;
}

/**
 * Cast an Overlord Miracle Spell powered by Mana (scales with spellLevels!).
 */
export function castSpell(state: GameState, spellId: SpellId, isAuto = false): boolean {
  if (!isSpellUnlocked(state, spellId)) return false;
  const def = SPELL_DEFS[spellId];
  if (state.spellCooldowns[spellId] > 0) return false;
  if (state.mana < def.manaCost) return false;

  const mods = computeGlobalModifiers(state);
  const cdSec = Math.round(def.cooldownSec * mods.spellCooldownMult * 10) / 10;
  const sLv = Math.max(1, state.spellLevels?.[spellId] ?? 1);
  const levelMult = 1 + (sLv - 1) * 0.28;
  const activeHeroes = state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);

  const emitManualCutin = (label: string, color: number): void => {
    if (!isAuto) {
      pushVfx(state, {
        kind: 'cutin',
        x: slotCenterX(THRONE_SLOT_INDEX),
        subId: `spell:${spellId}`,
        label,
        color,
      });
    }
  };

  if (spellId === 'abyss_lightning') {
    if (activeHeroes.length === 0) return false;
    state.mana -= def.manaCost;
    state.spellCooldowns[spellId] = cdSec;
    const targets = activeHeroes.sort((a, b) => a.x - b.x).slice(0, 3 + Math.min(3, Math.floor(sLv / 2)));
    const arcaneUnits = state.units.filter(
      (u) => u.hp > 0 && u.traits.includes('arcane_surge'),
    ).length;
    const arcaneBonus = 1 + Math.min(0.6, arcaneUnits * 0.15);
    const baseDmg = (48 + state.overlordAtk * 1.35) * levelMult * mods.spellPowerMult * arcaneBonus;
    let totalDmg = 0;
    for (const h of targets) {
      const dmg = Math.round(baseDmg);
      h.hp -= dmg;
      h.hurtAnimTimer = 0.3;
      if (h.raid) interruptHeroRaid(state, h, 'spell');
      totalDmg += dmg;
      pushVfx(state, { kind: 'spell_fx', x: h.x, subId: 'abyss_lightning', color: 0xb982ff });
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, isCrit: true, color: 0xd99cff });
    }
    state.metrics.totalSpellDamage += totalDmg;
    const spName = locSpell('abyss_lightning').name;
    emitManualCutin(t(`${spName} Lv.${sLv} · 裁决降临！`, `${spName} Lv.${sLv} · Judgment Falls!`), 0xb982ff);
    pushEvent(state, {
      type: 'spell_cast',
      species: spellId,
      value: totalDmg,
      text: t(`${spName} Lv.${sLv} 轰鸣！`, `${spName} Lv.${sLv} strikes!`),
    });
    return true;
  }

  if (spellId === 'demon_frenzy') {
    state.mana -= def.manaCost;
    state.spellCooldowns[spellId] = cdSec;
    const dur = 15 + (sLv - 1) * 3;
    for (const u of state.units) {
      u.frenzyBuffTimer = Math.max(u.frenzyBuffTimer, dur);
    }
    pushVfx(state, { kind: 'spell_fx', x: slotCenterX(THRONE_SLOT_INDEX), subId: 'demon_frenzy', color: 0xf05674 });
    const spName = locSpell('demon_frenzy').name;
    emitManualCutin(t(`${spName} Lv.${sLv} · 全军暴走 ${dur}s！`, `${spName} Lv.${sLv} · Army Overdrive ${dur}s!`), 0xf05674);
    pushEvent(state, {
      type: 'spell_cast',
      species: spellId,
      text: t(`${spName} Lv.${sLv}！全军攻速暴走 ${dur}s！`, `${spName} Lv.${sLv}! Full army haste for ${dur}s!`),
    });
    return true;
  }

  if (spellId === 'charm_mist') {
    if (activeHeroes.length === 0) return false;
    state.mana -= def.manaCost;
    state.spellCooldowns[spellId] = cdSec;
    const dur = (3.5 + (sLv - 1) * 0.6) * mods.spellPowerMult;
    for (const h of activeHeroes) {
      if (!h.isBoss) {
        h.charmTimer = Math.max(h.charmTimer, dur);
        h.charmSource = 'spell';
      } else {
        h.slowTimer = Math.max(h.slowTimer, 3.0);
      }
    }
    pushVfx(state, { kind: 'spell_fx', x: activeHeroes[0]!.x, subId: 'charm_mist', color: 0xff77aa });
    const spName = locSpell('charm_mist').name;
    emitManualCutin(t(`${spName} Lv.${sLv} · 堕落芬芳！`, `${spName} Lv.${sLv} · Velvet Bewitchment!`), 0xff77aa);
    pushEvent(state, {
      type: 'spell_cast',
      species: spellId,
      text: t(`${spName} Lv.${sLv} 弥漫走廊！`, `${spName} Lv.${sLv} fills the corridor!`),
    });
    return true;
  }

  if (spellId === 'abyss_blackhole') {
    if (activeHeroes.length === 0) return false;
    state.mana -= def.manaCost;
    state.spellCooldowns[spellId] = cdSec;
    // Pull all active heroes together toward the frontmost frontline corridor slot (great Boulder combo!)
    const pullX = slotCenterX(THRONE_SLOT_INDEX + 4);
    const baseDmg = (38 + state.overlordAtk * 1.1) * levelMult * mods.spellPowerMult;
    let totalDmg = 0;
    for (const h of activeHeroes) {
      const dmg = Math.round(baseDmg);
      h.hp -= dmg;
      h.hurtAnimTimer = 0.35;
      h.stealthTimer = 0;
      if (!h.isBoss) {
        h.x = h.x + (pullX - h.x) * 0.72;
        h.slowTimer = Math.max(h.slowTimer, 3.0);
      }
      totalDmg += dmg;
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, isCrit: false, color: 0xa464cc });
    }
    state.metrics.totalSpellDamage += totalDmg;
    pushVfx(state, { kind: 'spell_fx', x: pullX, subId: 'abyss_blackhole', color: 0x724096 });
    const spName = locSpell('abyss_blackhole').name;
    emitManualCutin(t(`${spName} Lv.${sLv} · 虚空聚歼！`, `${spName} Lv.${sLv} · Singularity Pull!`), 0xa464cc);
    pushEvent(state, {
      type: 'spell_cast',
      species: spellId,
      value: totalDmg,
      text: t(`${spName} Lv.${sLv}！将勇者聚拢待滚石碾压！`, `${spName} Lv.${sLv}! Heroes pulled in for Boulder crush!`),
    });
    return true;
  }

  return false;
}
