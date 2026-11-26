import { FLAVOR_BITS } from '../data/prisonAndRaids';
import { CP_PAIRS, QUIRK_DEFS, deriveQuirk } from '../data/quirks';
import { ROOM_DEFS } from '../data/roomsAndTraps';
import {
  findRoomSlotByType,
  incrementChronicle,
  pushEvent,
  pushVfx,
  slotCenterX,
  xToSlotIndex,
} from '../ecs/stateFactory';
import { SIM_RUNTIME_FLAGS, roomOutput, type RelicModifiers } from '../formulas';
import { hash32, hashUnitFloat } from '../hash';
import { locHeroDef, locUnitName, t } from '../i18n';
import { locQuirk } from '../i18n/v24';
import type { GameState, RoomSlot } from '../types';
import { previewWaveRoster } from './combatAndWaveSystem';
import { applyFlavorWillHit, getPrisonSlot } from './prisonSystem';

/**
 * V2.4 Quirk & CP Ecosystem System.
 * Strictly deterministic via hash32/hashUnitFloat (NEVER imports SeededRng, Date, or performance — Invariant I3).
 * Zero economy / combat impact (verified by whimsEnabled A/B test <= 3%).
 */

export function revealUnitQuirk(state: GameState, unitId: string): boolean {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.quirkSeen) return false;
  unit.quirkSeen = true;
  const q = deriveQuirk(state.seed, unit.id, unit.species);
  state.prestige.codexQuirks ??= [];
  if (!state.prestige.codexQuirks.includes(q)) {
    state.prestige.codexQuirks.push(q);
  }
  incrementChronicle(state, 'quirksRevealed');
  const loc = locQuirk(q);
  pushVfx(state, {
    kind: 'quirk_reveal',
    x: unit.x,
    subId: q,
    speakerId: unit.id,
    speakerName: locUnitName(unit),
    label: t(`✦! 怪癖揭晓：【${loc.name}】`, `✦! Quirk Revealed: [${loc.name}]`),
    color: 0xf2c655,
  });
  pushEvent(state, {
    type: 'quirk_revealed',
    unitId: unit.id,
    species: q,
    text: t(
      `目击【${locUnitName(unit)}】的隐藏怪癖：【${loc.name}】！`,
      `Witnessed [${locUnitName(unit)}]'s quirk: [${loc.name}]!`,
    ),
  });
  return true;
}

function findVenueSlotForQuirk(state: GameState, venue: string): RoomSlot | undefined {
  if (venue === 'any_corridor') {
    return state.slots.find((s) => s.type === 'corridor' && s.index > 6);
  }
  if (venue === 'any_trap') {
    return state.slots.find((s) => s.trap !== null);
  }
  if (venue === 'self') return undefined;
  return state.slots.find((s) => s.type === venue);
}

export function stepQuirkSystem(
  state: GameState,
  dt: number,
  _mods: RelicModifiers,
): void {
  if ((state.globalWhimCooldown ?? 0) > 0) {
    state.globalWhimCooldown = Math.max(0, (state.globalWhimCooldown ?? 0) - dt);
  }
  if ((state.globalCpCooldown ?? 0) > 0) {
    state.globalCpCooldown = Math.max(0, (state.globalCpCooldown ?? 0) - dt);
  }
  if (state.cpPairCooldowns && state.tick % 20 === 0) {
    for (const k in state.cpPairCooldowns) {
      const v = state.cpPairCooldowns[k] ?? 0;
      if (v > 0) state.cpPairCooldowns[k] = Math.max(0, v - 1);
    }
  }

  let hasActiveHeroes = false;
  for (let i = 0, n = state.heroes.length; i < n; i++) {
    const h = state.heroes[i]!;
    if (!h.downedForCapture && h.hp > 0) {
      hasActiveHeroes = true;
      break;
    }
  }

  const shouldRecall = !SIM_RUNTIME_FLAGS.whimsEnabled || hasActiveHeroes || state.waveTimer < 15;
  let activeWhimCount = 0;
  let combatCount = 0;

  // 1. Step active whims & per-unit cooldowns
  for (let i = 0, n = state.units.length; i < n; i++) {
    const u = state.units[i]!;
    if (u.species !== 'imp') combatCount += 1;
    if ((u.whimCooldown ?? 0) > 0) {
      u.whimCooldown = Math.max(0, (u.whimCooldown ?? 0) - dt);
    }
    if (!u.whim) continue;

    if (u.activity === 'dangling' || u.activity === 'altar_bound' || (u.recoveryTimer ?? 0) > 0) {
      delete u.whim;
      continue;
    }

    if (shouldRecall && u.whim.phase !== 'return') {
      u.whim.phase = 'return';
      u.whim.targetX = slotCenterX(u.assignedSlot ?? u.slotIndex);
    }

    activeWhimCount += 1;
    const w = u.whim;
    const speed = u.moveSpeed * (w.phase === 'return' ? 1.2 : 0.9);

    if (w.phase === 'go') {
      const dx = w.targetX - u.x;
      if (Math.abs(dx) <= speed * dt + 2) {
        u.x = w.targetX;
        u.slotIndex = xToSlotIndex(u.x);
        w.phase = 'act';
        w.t = 0;
        // Reveal quirk on first witnessed act!
        if (!u.quirkSeen) {
          revealUnitQuirk(state, u.id);
        }
        // Emit quirk banter bubble (or Dungeon Gossip wave spoiler!)
        const loc = locQuirk(w.quirk);
        let line: string;
        if (w.quirk === 'dungeon_gossip' && state.waveTimer >= 15 && state.waveTimer <= 35) {
          const preview = previewWaveRoster(state);
          const elite =
            preview.boss ??
            preview.regular.find((s) => s !== 'novice_adventurer') ??
            preview.regular[0] ??
            'novice_adventurer';
          const eName = locHeroDef(elite).name;
          line = t(
            `前线急报！下波领衔的是【${eName}】（共 ${preview.allSpecies.length} 人），大家快准备！`,
            `Intel leak! Next wave brings [${eName}] (${preview.allSpecies.length} total)—get ready!`,
          );
        } else {
          const idx = hash32(state.seed, state.tick, u.id) % loc.lines.length;
          line = loc.lines[idx]!;
        }
        pushVfx(state, {
          kind: 'banter',
          x: u.x,
          speakerId: u.id,
          speakerName: locUnitName(u),
          label: line,
          color: 0xf2c655,
        });

        // Chronicle / one-time flavor hooks (zero economy impact!)
        if (w.quirk === 'neat_freak') {
          incrementChronicle(state, 'slimeMopped');
        } else if (w.quirk === 'pyromaniac') {
          const prison = getPrisonSlot(state);
          if (prison) {
            const p = state.prisoners.find((x) => x.cell === 'prison');
            if (p) applyFlavorWillHit(p, FLAVOR_BITS.PYRO_SAPPER, 0.05);
          }
        }
      } else {
        u.facing = dx >= 0 ? 1 : -1;
        u.x += Math.sign(dx) * speed * dt;
        u.slotIndex = xToSlotIndex(u.x);
      }
      u.activity = 'whim';
    } else if (w.phase === 'act') {
      w.t += dt;
      u.activity = 'whim';
      if (w.t >= w.maxT) {
        w.phase = 'return';
        w.targetX = slotCenterX(u.assignedSlot ?? u.slotIndex);
      }
    } else {
      const homeX = slotCenterX(u.assignedSlot ?? u.slotIndex);
      const dx = homeX - u.x;
      if (Math.abs(dx) <= speed * dt + 2) {
        u.x = homeX;
        u.slotIndex = xToSlotIndex(u.x);
        delete u.whim;
        u.activity = 'idle';
      } else {
        u.facing = dx >= 0 ? 1 : -1;
        u.x += Math.sign(dx) * speed * dt;
        u.slotIndex = xToSlotIndex(u.x);
        u.activity = 'whim';
      }
    }
  }

  if (shouldRecall) return;

  // 2. Staggered whim trigger check (once/sec per unit: (tick + idx) % 20 === 0)
  const maxConcurrentWhims = combatCount >= 12 ? 2 : 1;
  if ((state.globalWhimCooldown ?? 0) <= 0 && activeWhimCount < maxConcurrentWhims) {
    const chamberSlot = findRoomSlotByType(state, 'corruption')?.index ?? -1;
    const hatchery = findRoomSlotByType(state, 'hatchery');
    const hatcheryFull = Boolean(
      hatchery &&
        hatchery.chickens >= Math.min(10, Math.floor(roomOutput(ROOM_DEFS.hatchery.baseOutput, hatchery.level))),
    );

    for (let i = 0, n = state.units.length; i < n; i++) {
      if ((state.tick + i) % 20 !== 0) continue;
      const u = state.units[i]!;
      if (
        u.species === 'imp' ||
        u.hp <= 0 ||
        u.whim ||
        (u.whimCooldown ?? 0) > 0 ||
        u.activity === 'dangling' ||
        u.activity === 'altar_bound' ||
        u.activity === 'fighting' ||
        u.activity === 'eating' ||
        (u.recoveryTimer ?? 0) > 0 ||
        (u.assignedSlot === chamberSlot && state.prisoners.length > 0)
      ) {
        continue;
      }

      const q = deriveQuirk(state.seed, u.id, u.species);
      const def = QUIRK_DEFS[q];
      if (def.layer !== 'sim') continue;
      if (q === 'food_critic' && !hatcheryFull) continue;
      if (q === 'masochist' && state.prisoners.length > 0) continue; // Only sneak onto empty chair

      const venue = findVenueSlotForQuirk(state, def.venue);
      if (!venue) continue;

      const targetX = slotCenterX(venue.index);
      const dist = Math.abs(targetX - u.x);
      const roundTripEta = (dist * 2) / Math.max(40, u.moveSpeed * 0.9) + def.actSec;
      if (state.waveTimer < Math.max(15, roundTripEta + 8)) continue;

      if (hashUnitFloat(state.seed, state.tick, u.id, 'whim_roll') < 0.22) {
        u.whim = {
          quirk: q,
          phase: 'go',
          targetX,
          targetSlot: venue.index,
          t: 0,
          maxT: def.actSec,
        };
        u.whimCooldown = 240;
        u.activity = 'whim';
        state.globalWhimCooldown = 40;
        activeWhimCount += 1;
        break;
      }
    }
  }

  // 3. Detect 5 Iconic CP pairs (once per second, zero economy impact except paladin_faith_shatter -15% flavor will)
  if (state.tick % 20 === 0 && (state.globalCpCooldown ?? 0) <= 0) {
    state.cpPairCooldowns ??= {};
    const prison = getPrisonSlot(state);
    for (const cp of CP_PAIRS) {
      if ((state.cpPairCooldowns[cp.id] ?? 0) > 0) continue;
      const unitA = state.units.find(
        (u) =>
          u.species === cp.speciesA &&
          u.hp > 0 &&
          u.activity !== 'fighting' &&
          u.activity !== 'dangling' &&
          (u.recoveryTimer ?? 0) <= 0,
      );
      if (!unitA) continue;

      if (cp.speciesB === 'prisoner:holy_knight') {
        if (!prison) continue;
        const knightPrisoner = state.prisoners.find(
          (p) => p.cell === 'prison' && p.sourceHero === 'holy_knight' && !p.escortedByHeroId,
        );
        if (!knightPrisoner) continue;
        const dist = Math.abs(unitA.x - slotCenterX(prison.index));
        if (dist <= 220) {
          applyFlavorWillHit(knightPrisoner, FLAVOR_BITS.PALADIN_CP, cp.prisonerWillDropRatio ?? 0.15);
          state.globalCpCooldown = 90;
          state.cpPairCooldowns[cp.id] = 600;
          incrementChronicle(state, 'cpMoments');
          pushVfx(state, {
            kind: 'cp',
            x: unitA.x,
            targetX: slotCenterX(prison.index),
            subId: cp.id,
            speakerId: unitA.id,
            speakerName: `slot:${prison.index}`,
            color: 0xd966ff,
          });
          break;
        }
      } else {
        const unitB = state.units.find(
          (u) =>
            u.species === cp.speciesB &&
            u.id !== unitA.id &&
            u.hp > 0 &&
            u.activity !== 'fighting' &&
            u.activity !== 'dangling' &&
            (u.recoveryTimer ?? 0) <= 0 &&
            Math.abs(u.x - unitA.x) <= 165,
        );
        if (unitB) {
          state.globalCpCooldown = 90;
          state.cpPairCooldowns[cp.id] = 600;
          incrementChronicle(state, 'cpMoments');
          pushVfx(state, {
            kind: 'cp',
            x: unitA.x,
            targetX: unitB.x,
            subId: cp.id,
            speakerId: unitA.id,
            speakerName: unitB.id,
            color: 0xf2c655,
          });
          break;
        }
      }
    }
  }
}
