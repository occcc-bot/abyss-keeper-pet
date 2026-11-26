import { DungeonEngine } from './engine';
import { ROOM_DEFS, TRAP_DEFS } from './data/roomsAndTraps';
import { matchFusionRecipe } from './data/units';
import { SIM_RUNTIME_FLAGS, roomUpgradeCost } from './formulas';
import type { OverlordId, RoomType, TrapType } from './types';

export type PlayerPersonaId =
  | 'idle_casual'
  | 'bullfrog_tyrant'
  | 'trap_master'
  | 'succubus_corruptor'
  | 'resonance_architect'
  | 'prison_warden'
  | 'extreme_executioner';

export interface SimRunSummary {
  persona: PlayerPersonaId;
  seed: number;
  wave1h: number;
  wave8h: number;
  peakWave: number;
  gold8h: number;
  totalGoldEarned: number;
  trapDamageShare: number;
  captivesConverted: number;
  fusionsCompleted: number;
  bankruptPaydays: number;
  heartShatters: number;
  prisonersDied: number;
  raidsStarted: number;
  prisonersEscaped: number;
  hasInvalidNumber: boolean;
}

export interface PersonaAggregate {
  persona: PlayerPersonaId;
  runs: number;
  wave1hP10: number;
  wave1hP50: number;
  wave1hP90: number;
  wave8hP10: number;
  wave8hP50: number;
  wave8hP90: number;
  avgTrapShare: number;
  avgCaptives: number;
  avgFusions: number;
  avgBankruptPaydays: number;
  totalPrisonersDied: number;
  raidsPerHour: number;
  escapePerRaidRatio: number;
  invalidCount: number;
}

export function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * p)),
  );
  return sortedValues[idx]!;
}

function hasRoom(engine: DungeonEngine, type: RoomType): boolean {
  return engine.state.slots.some((s) => s.type === type);
}

function findFreeCorridor(engine: DungeonEngine, minSlot = 2, maxSlot = 11): number {
  const s = engine.state.slots.find(
    (x) =>
      x.type === 'corridor' &&
      x.index >= minSlot &&
      x.index <= maxSlot &&
      !x.trap &&
      engine.isSlotUnlocked(x.index),
  );
  return s ? s.index : -1;
}

function markNextRock(engine: DungeonEngine): void {
  // Expand backyard rock (#4) and frontline frontier rocks up to slot 18 (respecting territoryMax!)
  const rock = engine.state.slots.find(
    (s) =>
      s.type === 'rock_vein' &&
      !s.isInfiniteFrontier &&
      !s.markedForDig &&
      s.index <= 18 &&
      engine.isSlotUnlocked(s.index),
  );
  if (rock) engine.markRockForMining(rock.index);
}

function tryUpgradeCheapestRoom(engine: DungeonEngine, allowedTypes: RoomType[], maxGoldRatio = 0.7): void {
  const candidates = engine.state.slots
    .filter((s) => allowedTypes.includes(s.type))
    .map((s) => ({
      index: s.index,
      cost: roomUpgradeCost(ROOM_DEFS[s.type].baseUpgradeCost, s.level),
    }))
    .sort((a, b) => a.cost - b.cost);

  for (const c of candidates) {
    if (engine.state.gold * maxGoldRatio >= c.cost) {
      engine.upgradeRoom(c.index);
      return;
    }
  }
}

function tryAutoFuse(engine: DungeonEngine): void {
  if (!hasRoom(engine, 'altar')) return;
  const candidates = engine.state.units.filter(
    (u) => u.species !== 'imp' && !u.locked && u.activity !== 'dangling',
  );
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      const match = matchFusionRecipe(a.species, b.species);
      if (!match) continue;
      if (match.type === 'tier_up' && a.level >= 9 && b.level >= 9) {
        if (engine.fuseUnits(a.id, b.id)) return;
      } else if (
        match.type === 'star_up' &&
        a.tier >= 2 &&
        a.star < 4 &&
        a.level >= 14 &&
        b.level >= 14
      ) {
        if (engine.fuseUnits(a.id, b.id)) return;
      }
    }
  }
}

function runPersonaDecision(
  engine: DungeonEngine,
  persona: PlayerPersonaId,
  elapsedSec: number,
): void {
  markNextRock(engine);

  if (persona === 'idle_casual') {
    // Only checks in at start (first 3 mins) and every 30 minutes thereafter; ZERO slaps!
    const isInitialSetup = elapsedSec <= 180;
    const isCheckIn = elapsedSec % 1800 === 0;
    if (!isInitialSetup && !isCheckIn) return;

    if (!hasRoom(engine, 'library')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'library');
    }
    if (!hasRoom(engine, 'workshop')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'workshop');
    }
    // Spend casually at each 30m harvest while keeping buffer for payday
    const idleCombatCount = engine.state.units.filter((u) => u.species !== 'imp').length;
    if (idleCombatCount < 9 && engine.state.gold > 160) {
      engine.recruitUnit(engine.state.units.length % 2 === 0 ? 'slime_girl' : 'skeleton_blademaid');
    }
    if (engine.state.gold > 220) {
      engine.upgradeOverlord();
    }
    const upgradesPerVisit = isInitialSetup ? 1 : 4;
    for (let k = 0; k < upgradesPerVisit; k++) {
      tryUpgradeCheapestRoom(engine, ['treasury', 'throne', 'training', 'hatchery', 'library'], 0.65);
    }
    return;
  }

  if (persona === 'bullfrog_tyrant') {
    // Active micro every 30s: frequent slapping, Overlord leveling, dragging units, ringing bell!
    if (!hasRoom(engine, 'library')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'library');
    }
    if (!hasRoom(engine, 'corruption')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'corruption');
    }
    if (!hasRoom(engine, 'altar')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'altar');
    }
    if (!hasRoom(engine, 'workshop') && elapsedSec >= 3600) {
      const idx = findFreeCorridor(engine, 2, 8);
      if (idx >= 0) engine.buildRoom(idx, 'workshop');
    }

    if (engine.state.gold > 220) {
      engine.upgradeOverlord();
    }

    // Slap up to 3 units every 30s!
    const slappable = engine.state.units.filter((u) => u.slapBuffTimer < 8 && u.hp > u.maxHp * 0.4);
    for (const u of slappable.slice(0, 3)) {
      engine.slapUnit(u.id);
    }

    // Summon imps up to 4
    if (engine.state.units.filter((u) => u.species === 'imp').length < 4) {
      engine.summonImp();
    }

    // Recruit & fuse aggressively
    const rosterCycle = ['skeleton_blademaid', 'slime_girl', 'imp_witch', 'bat_scout', 'hellforge_smith'] as const;
    const pick = rosterCycle[Math.floor(elapsedSec / 60) % rosterCycle.length]!;
    if (engine.state.gold > 180) {
      engine.recruitUnit(pick);
    }
    tryAutoFuse(engine);

    // Install supplementary traps only after Hour 1 so Hour 1 reflects Slap & Micro pacing
    if (elapsedSec >= 3600) {
      const spikeSlot = engine.state.slots.find((s) => s.type === 'corridor' && s.index >= 8 && !s.trap);
      if (spikeSlot && engine.state.trapParts >= 14) {
        engine.installTrap(spikeSlot.index, spikeSlot.index % 2 === 0 ? 'boulder_trap' : 'iron_spikes');
      }
    }

    tryUpgradeCheapestRoom(
      engine,
      ['treasury', 'throne', 'training', 'library', 'corruption', 'hatchery'],
      0.75,
    );

    const trainingSlot = engine.state.slots.find((s) => s.type === 'training');
    const frontlineSlot = engine.state.slots.find((s) => s.type === 'corridor' && s.index >= 8);
    if (trainingSlot && frontlineSlot) {
      for (const u of engine.state.units) {
        if (u.species === 'imp' || u.activity === 'dangling' || u.activity === 'altar_bound') continue;
        if (u.assignedSlot === trainingSlot.index && u.level >= 7 && u.species === 'skeleton_blademaid') {
          engine.assignUnitToSlot(u.id, frontlineSlot.index);
        }
      }
    }

    if (
      !engine.state.farmMode &&
      elapsedSec % 60 === 0 &&
      engine.state.heroes.length === 0 &&
      engine.state.overlordHp > engine.state.overlordMaxHp * 0.8
    ) {
      engine.provokeNextWave();
    }
    return;
  }

  if (persona === 'trap_master') {
    if (!hasRoom(engine, 'workshop')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'workshop');
    }
    if (!hasRoom(engine, 'library')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'library');
    }

    const smiths = engine.state.units.filter((u) => u.species === 'hellforge_smith').length;
    const combatCount = engine.state.units.filter((u) => u.species !== 'imp').length;
    if (smiths < 2 && engine.state.gold > 120) {
      engine.recruitUnit('hellforge_smith');
    } else if (engine.state.gold > 220 && combatCount < 6) {
      engine.recruitUnit(combatCount % 2 === 0 ? 'gargoyle_warden' : 'skeleton_blademaid');
    }

    // Station frontline tanks at Slot 7 so heroes walk across slots 8..12 traps & clash with defenders!
    const holdSlot = 7;
    for (const u of engine.state.units) {
      if ((u.species === 'slime_girl' || u.species === 'gargoyle_warden') && u.assignedSlot !== holdSlot) {
        engine.assignUnitToSlot(u.id, holdSlot);
      }
    }

    if (elapsedSec % 60 === 0) {
      const ws = engine.state.units.find((u) => u.species === 'hellforge_smith');
      if (ws) engine.slapUnit(ws.id);
    }

    const trapPlan: Array<{ slot: number; trap: TrapType }> = [
      { slot: 9, trap: 'iron_spikes' },
      { slot: 8, trap: 'boulder_trap' },
      { slot: 10, trap: 'frost_rune' },
      { slot: 11, trap: 'charm_censer' },
      { slot: 12, trap: 'hell_spring' },
    ];
    for (const plan of trapPlan) {
      const s = engine.state.slots[plan.slot];
      if (!s || s.type !== 'corridor') continue;
      if (!s.trap) {
        if (
          engine.state.gold >= TRAP_DEFS[plan.trap].buildCostGold &&
          engine.state.trapParts >= TRAP_DEFS[plan.trap].buildCostParts
        ) {
          engine.installTrap(plan.slot, plan.trap);
        }
      } else if (s.trap.level < 22 && elapsedSec % 90 === 0 && engine.state.gold > 140) {
        engine.installTrap(plan.slot, plan.trap);
      }
    }

    if (engine.state.units.filter((u) => u.species === 'imp').length < 4) {
      engine.summonImp();
    }

    tryUpgradeCheapestRoom(engine, ['workshop', 'treasury', 'throne', 'library', 'training'], 0.65);
    if (!engine.state.farmMode && engine.state.heroes.length === 0 && elapsedSec % 60 === 0) {
      engine.provokeNextWave();
    }
    return;
  }

  if (persona === 'succubus_corruptor') {
    if (!hasRoom(engine, 'corruption')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'corruption');
    }
    if (!hasRoom(engine, 'altar')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'altar');
    }
    if (!hasRoom(engine, 'library')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'library');
    }

    if (engine.state.gold > 260) {
      engine.upgradeOverlord();
    }

    if (engine.state.units.filter((u) => u.species === 'imp').length < 4) {
      engine.summonImp();
    }

    // Recruit ingredients for Crimson Succubus (up to 2), then balanced frontline units
    if (engine.state.gold > 160) {
      const succubi = engine.state.units.filter((u) => u.species === 'crimson_succubus').length;
      if (succubi < 2) {
        const witches = engine.state.units.filter((u) => u.species === 'imp_witch').length;
        const slimes = engine.state.units.filter((u) => u.species === 'slime_girl').length;
        if (witches <= slimes) engine.recruitUnit('imp_witch');
        else engine.recruitUnit('slime_girl');
      } else {
        const cycle = ['skeleton_blademaid', 'slime_girl', 'imp_witch'] as const;
        engine.recruitUnit(cycle[Math.floor(elapsedSec / 60) % cycle.length]!);
      }
    }

    tryAutoFuse(engine);

    // Ensure torturer assigned to corruption chamber and slapped occasionally
    const chamber = engine.state.slots.find((s) => s.type === 'corruption');
    if (chamber) {
      const succubus = engine.state.units.find((u) => u.species === 'crimson_succubus');
      if (succubus && succubus.assignedSlot !== chamber.index) {
        engine.assignUnitToSlot(succubus.id, chamber.index);
      }
      if (succubus && elapsedSec % 60 === 0) {
        engine.slapUnit(succubus.id);
      }
    }

    tryUpgradeCheapestRoom(
      engine,
      ['corruption', 'library', 'treasury', 'throne', 'training', 'altar'],
      0.75,
    );
    if (!engine.state.farmMode && engine.state.heroes.length === 0 && elapsedSec % 60 === 0) {
      engine.provokeNextWave();
    }
    return;
  }

  if (persona === 'resonance_architect') {
    // Actively constructs all 4 room resonances + 2 trap synergies!
    if (engine.state.slots[2]?.type === 'corridor') engine.buildRoom(2, 'corruption');
    if (engine.state.slots[3]?.type === 'corridor') engine.buildRoom(3, 'altar');
    if (engine.state.slots[5]?.type === 'corridor') engine.buildRoom(5, 'library');
    if (engine.state.slots[8]?.type === 'corridor' && !engine.state.slots[8]?.trap) {
      engine.buildRoom(8, 'hatchery');
    }
    if (engine.state.slots[9]?.type === 'corridor' && !engine.state.slots[9]?.trap) {
      engine.buildRoom(9, 'workshop');
    }

    if (engine.state.gold > 240) engine.upgradeOverlord();
    if (engine.state.units.filter((u) => u.species === 'imp').length < 4) {
      engine.summonImp();
    }
    const rosterCycle = ['skeleton_blademaid', 'slime_girl', 'imp_witch', 'hellforge_smith', 'bat_scout'] as const;
    if (engine.state.gold > 180) {
      engine.recruitUnit(rosterCycle[Math.floor(elapsedSec / 60) % rosterCycle.length]!);
    }
    tryAutoFuse(engine);

    // Build 2 trap-pair synergies on frontline corridors #10..#13
    const synTraps: Array<{ slot: number; trap: TrapType }> = [
      { slot: 10, trap: 'frost_rune' },
      { slot: 11, trap: 'boulder_trap' },
      { slot: 12, trap: 'charm_censer' },
      { slot: 13, trap: 'hell_spring' },
    ];
    for (const plan of synTraps) {
      const s = engine.state.slots[plan.slot];
      if (!s || s.type !== 'corridor') continue;
      if (!s.trap) {
        if (
          engine.state.gold >= TRAP_DEFS[plan.trap].buildCostGold &&
          engine.state.trapParts >= TRAP_DEFS[plan.trap].buildCostParts
        ) {
          engine.installTrap(plan.slot, plan.trap);
        }
      } else if (s.trap.level < 18 && elapsedSec % 120 === 0 && engine.state.gold > 180) {
        engine.installTrap(plan.slot, plan.trap);
      }
    }

    if (elapsedSec % 60 === 0) {
      const u = engine.state.units.find((x) => x.slapBuffTimer < 6 && x.hp > x.maxHp * 0.5);
      if (u) engine.slapUnit(u.id);
    }

    tryUpgradeCheapestRoom(
      engine,
      ['treasury', 'throne', 'training', 'library', 'workshop', 'corruption', 'hatchery'],
      0.72,
    );
    if (!engine.state.farmMode && engine.state.heroes.length === 0 && elapsedSec % 60 === 0) {
      engine.provokeNextWave({ eager: true });
    }
    return;
  }

  if (persona === 'prison_warden' || persona === 'extreme_executioner') {
    const isExtreme = persona === 'extreme_executioner';
    // Build Frontline Bait Prison (#8) right after W1 unlock, Torture Chamber (#2) after W2, Library (#3)
    if (!hasRoom(engine, 'prison')) {
      const idx = findFreeCorridor(engine, 8, 11);
      if (idx >= 0) engine.buildRoom(idx, 'prison');
    }
    if (!hasRoom(engine, 'corruption')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'corruption');
    }
    if (!hasRoom(engine, 'library')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'library');
    }
    if (!hasRoom(engine, 'altar')) {
      const idx = findFreeCorridor(engine, 2, 5);
      if (idx >= 0) engine.buildRoom(idx, 'altar');
    }

    // Extreme Executioner forces Extreme Voltage + Electric Chair + never feeds chicken!
    engine.setNoMercyMode(isExtreme);
    engine.equipTortureImplement('electric_chair');

    if (engine.state.gold > 250) engine.upgradeOverlord();
    if (engine.state.units.filter((u) => u.species === 'imp').length < 4) {
      engine.summonImp();
    }

    const rosterCycle = ['slime_girl', 'skeleton_blademaid', 'imp_witch', 'gargoyle_warden'] as const;
    if (engine.state.gold > 170) {
      engine.recruitUnit(rosterCycle[Math.floor(elapsedSec / 60) % rosterCycle.length]!);
    }
    tryAutoFuse(engine);

    const chamber = engine.state.slots.find((s) => s.type === 'corruption');
    if (chamber) {
      const succubus = engine.state.units.find((u) => u.species === 'crimson_succubus');
      if (succubus && succubus.assignedSlot !== chamber.index) {
        engine.assignUnitToSlot(succubus.id, chamber.index);
      }
      if (succubus && elapsedSec % 60 === 0) {
        engine.slapUnit(succubus.id);
      }
    }

    tryUpgradeCheapestRoom(
      engine,
      ['prison', 'corruption', 'library', 'treasury', 'throne', 'training'],
      0.74,
    );
    if (!engine.state.farmMode && engine.state.heroes.length === 0 && elapsedSec % 60 === 0) {
      engine.provokeNextWave({ eager: true });
    }
  }
}

export function runSinglePersonaSim(
  persona: PlayerPersonaId,
  seed: number,
  durationHours = 8,
): SimRunSummary {
  const overlord: OverlordId = persona === 'trap_master' ? 'elizabeth' : 'lilith';
  const engine = new DungeonEngine({ seed, overlordId: overlord });
  const totalSeconds = Math.round(durationHours * 3600);
  const stepChunkSec = 30;
  let wave1h = 1;
  let hasInvalidNumber = false;

  for (let sec = 0; sec < totalSeconds; sec += stepChunkSec) {
    runPersonaDecision(engine, persona, sec);
    engine.stepSeconds(stepChunkSec);

    if (sec + stepChunkSec === 3600) {
      wave1h = engine.state.highestWaveCleared || engine.state.wave;
    }

    const s = engine.state;
    if (
      !Number.isFinite(s.gold) ||
      !Number.isFinite(s.mana) ||
      !Number.isFinite(s.overlordHp) ||
      s.gold < -0.001 ||
      s.mana < -0.001
    ) {
      hasInvalidNumber = true;
      break;
    }
  }

  const m = engine.state.metrics;
  const totalCombatDmg =
    m.totalTrapDamage + m.totalUnitDamage + m.totalSpellDamage + m.totalOverlordDamage;
  const trapDamageShare = totalCombatDmg > 0 ? m.totalTrapDamage / totalCombatDmg : 0;

  return {
    persona,
    seed,
    wave1h,
    wave8h: engine.state.highestWaveCleared || engine.state.wave,
    peakWave: m.peakWaveReached,
    gold8h: engine.state.gold,
    totalGoldEarned: m.totalGoldEarned,
    trapDamageShare,
    captivesConverted: m.totalCaptivesConverted,
    fusionsCompleted: m.totalFusions,
    bankruptPaydays: m.bankruptPaydays,
    heartShatters: m.heartShatterCount,
    prisonersDied: m.prisonersDied ?? 0,
    raidsStarted: m.raidsStarted ?? 0,
    prisonersEscaped: m.prisonersEscaped ?? 0,
    hasInvalidNumber,
  };
}

let cachedSimBundleCode: string | null = null;

function getSimBundleCode(): string | null {
  if (cachedSimBundleCode !== null) return cachedSimBundleCode;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltin !== 'function') return null;

  try {
    const fsMod = getBuiltin('node:fs') as { existsSync(p: string): boolean };
    const pathMod = getBuiltin('node:path') as { resolve(...parts: string[]): string };
    const modMod = getBuiltin('node:module') as {
      createRequire(filename: string): (id: string) => unknown;
    };
    const simEntry = pathMod.resolve(process.cwd(), 'src/core/simRunner.ts');
    if (!fsMod.existsSync(simEntry)) return null;
    const req = modMod.createRequire(pathMod.resolve(process.cwd(), 'package.json'));
    const esbuild = req('esbuild') as {
      buildSync(opts: {
        entryPoints: string[];
        bundle: boolean;
        platform: 'node';
        format: 'cjs';
        write: boolean;
        logLevel: 'silent';
      }): { outputFiles?: Array<{ text: string }> };
    };
    const out = esbuild.buildSync({
      entryPoints: [simEntry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      logLevel: 'silent',
    });
    cachedSimBundleCode = out.outputFiles?.[0]?.text ?? null;
    return cachedSimBundleCode;
  } catch {
    return null;
  }
}

interface SimWorkerSlot {
  worker: {
    postMessage(value: unknown): void;
    unref(): void;
  };
  port1: unknown;
  doneView: Int32Array;
  lastError: Error | null;
}

let simWorkerPool: SimWorkerSlot[] | null = null;

function getSimWorkerPool(
  wtMod: {
    Worker: new (
      filename: string,
      options: {
        eval: boolean;
        workerData: unknown;
        transferList: unknown[];
      },
    ) => {
      postMessage(value: unknown): void;
      on(event: 'error', cb: (err: Error) => void): void;
      unref(): void;
    };
    MessageChannel: new () => {
      port1: { unref?(): void };
      port2: unknown;
    };
  },
  bundleCode: string,
  count: number,
): SimWorkerSlot[] {
  if (simWorkerPool && simWorkerPool.length >= count) {
    return simWorkerPool;
  }

  const workerScript = `
    const { parentPort, workerData } = require('node:worker_threads');
    const sabView = new Int32Array(workerData.sab);
    globalThis.__KEEPER_SIM_WORKER__ = true;
    const mod = { exports: {} };
    const fn = new Function('exports', 'require', 'module', workerData.bundleCode);
    fn(mod.exports, require, mod);
    parentPort.on('message', (task) => {
      try {
        const results = [];
        for (const seed of task.seeds) {
          results.push(mod.exports.runSinglePersonaSim(task.persona, seed, task.durationHours));
        }
        workerData.port.postMessage({ ok: true, results });
        Atomics.store(sabView, 0, 1);
      } catch (err) {
        workerData.port.postMessage({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        Atomics.store(sabView, 0, -1);
      } finally {
        Atomics.notify(sabView, 0);
      }
    });
  `;

  const pool: SimWorkerSlot[] = [];
  for (let i = 0; i < count; i++) {
    const sab = new SharedArrayBuffer(4);
    const doneView = new Int32Array(sab);
    const { port1, port2 } = new wtMod.MessageChannel();
    port1.unref?.();
    const worker = new wtMod.Worker(workerScript, {
      eval: true,
      workerData: { bundleCode, sab, port: port2 },
      transferList: [port2],
    });
    worker.unref();
    const slot: SimWorkerSlot = {
      worker,
      port1,
      doneView,
      lastError: null,
    };
    worker.on('error', (err) => {
      slot.lastError = err;
      Atomics.store(doneView, 0, -1);
      Atomics.notify(doneView, 0);
    });
    pool.push(slot);
  }
  simWorkerPool = pool;
  return pool;
}

function tryRunPersonaBatchParallel(
  persona: PlayerPersonaId,
  seedsCount: number,
  durationHours: number,
): SimRunSummary[] | null {
  if (
    seedsCount < 8 ||
    typeof process === 'undefined' ||
    !process.versions?.node ||
    (globalThis as { __KEEPER_SIM_WORKER__?: boolean }).__KEEPER_SIM_WORKER__
  ) {
    return null;
  }

  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltin !== 'function') return null;

  const bundleCode = getSimBundleCode();
  if (!bundleCode) return null;

  const osMod = getBuiltin('node:os') as { cpus(): unknown[] };
  const wtMod = getBuiltin('node:worker_threads') as {
    Worker: new (
      filename: string,
      options: {
        eval: boolean;
        workerData: unknown;
        transferList: unknown[];
      },
    ) => {
      postMessage(value: unknown): void;
      on(event: 'error', cb: (err: Error) => void): void;
      unref(): void;
    };
    MessageChannel: new () => {
      port1: { unref?(): void };
      port2: unknown;
    };
    receiveMessageOnPort(port: unknown): { message: unknown } | undefined;
  };

  const workerCount = Math.min(seedsCount, Math.max(1, osMod.cpus().length));
  if (workerCount <= 1) return null;

  const buckets: number[][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < seedsCount; i++) {
    buckets[i % workerCount]!.push(i + 1);
  }

  const pool = getSimWorkerPool(wtMod, bundleCode, workerCount);
  for (let i = 0; i < workerCount; i++) {
    const slot = pool[i]!;
    slot.lastError = null;
    Atomics.store(slot.doneView, 0, 0);
    slot.worker.postMessage({ persona, seeds: buckets[i], durationHours });
  }

  const runs: SimRunSummary[] = [];
  for (let i = 0; i < workerCount; i++) {
    const slot = pool[i]!;
    while (true) {
      const state = Atomics.load(slot.doneView, 0);
      if (state !== 0) break;
      Atomics.wait(slot.doneView, 0, 0, 500);
    }
    if (slot.lastError) {
      throw slot.lastError;
    }
    const received = wtMod.receiveMessageOnPort(slot.port1);
    const msg = received?.message as
      | { ok: true; results: SimRunSummary[] }
      | { ok: false; error: string }
      | undefined;
    if (!msg || !msg.ok) {
      throw new Error(msg?.error ?? 'Worker did not return simulation results');
    }
    runs.push(...msg.results);
  }
  runs.sort((a, b) => a.seed - b.seed);
  return runs;
}

function buildPersonaAggregate(
  persona: PlayerPersonaId,
  runs: SimRunSummary[],
): { aggregate: PersonaAggregate; runs: SimRunSummary[] } {
  const w1 = runs.map((r) => r.wave1h).sort((a, b) => a - b);
  const w8 = runs.map((r) => r.wave8h).sort((a, b) => a - b);
  const avg = (fn: (r: SimRunSummary) => number): number =>
    runs.reduce((acc, r) => acc + fn(r), 0) / Math.max(1, runs.length);

  return {
    runs,
    aggregate: {
      persona,
      runs: runs.length,
      wave1hP10: percentile(w1, 0.1),
      wave1hP50: percentile(w1, 0.5),
      wave1hP90: percentile(w1, 0.9),
      wave8hP10: percentile(w8, 0.1),
      wave8hP50: percentile(w8, 0.5),
      wave8hP90: percentile(w8, 0.9),
      avgTrapShare: avg((r) => r.trapDamageShare),
      avgCaptives: avg((r) => r.captivesConverted),
      avgFusions: avg((r) => r.fusionsCompleted),
      avgBankruptPaydays: avg((r) => r.bankruptPaydays),
      totalPrisonersDied: runs.reduce((acc, r) => acc + r.prisonersDied, 0),
      raidsPerHour: avg((r) => r.raidsStarted) / 8,
      escapePerRaidRatio:
        runs.reduce((acc, r) => acc + r.prisonersEscaped, 0) /
        Math.max(1, runs.reduce((acc, r) => acc + r.raidsStarted, 0)),
      invalidCount: runs.filter((r) => r.hasInvalidNumber).length,
    },
  };
}

async function tryRunPersonaBatchParallelAsync(
  persona: PlayerPersonaId,
  seedsCount: number,
  durationHours: number,
): Promise<SimRunSummary[] | null> {
  if (
    seedsCount < 8 ||
    typeof process === 'undefined' ||
    !process.versions?.node ||
    (globalThis as { __KEEPER_SIM_WORKER__?: boolean }).__KEEPER_SIM_WORKER__
  ) {
    return null;
  }

  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (typeof getBuiltin !== 'function') return null;

  const bundleCode = getSimBundleCode();
  if (!bundleCode) return null;

  const osMod = getBuiltin('node:os') as { cpus(): unknown[] };
  const wtMod = getBuiltin('node:worker_threads') as {
    Worker: new (
      filename: string,
      options: {
        eval: boolean;
        workerData: unknown;
        transferList: unknown[];
      },
    ) => {
      postMessage(value: unknown): void;
      on(event: 'error', cb: (err: Error) => void): void;
      unref(): void;
    };
    MessageChannel: new () => {
      port1: { unref?(): void };
      port2: unknown;
    };
    receiveMessageOnPort(port: unknown): { message: unknown } | undefined;
  };

  const workerCount = Math.min(seedsCount, Math.max(1, osMod.cpus().length));
  if (workerCount <= 1) return null;

  const buckets: number[][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < seedsCount; i++) {
    buckets[i % workerCount]!.push(i + 1);
  }

  const pool = getSimWorkerPool(wtMod, bundleCode, workerCount);
  for (let i = 0; i < workerCount; i++) {
    const slot = pool[i]!;
    slot.lastError = null;
    Atomics.store(slot.doneView, 0, 0);
    slot.worker.postMessage({ persona, seeds: buckets[i], durationHours });
  }

  // Non-blocking event-loop-friendly await so Vitest IPC heartbeats never stall
  const runs: SimRunSummary[] = [];
  for (let i = 0; i < workerCount; i++) {
    const slot = pool[i]!;
    while (Atomics.load(slot.doneView, 0) === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    if (slot.lastError) {
      throw slot.lastError;
    }
    const received = wtMod.receiveMessageOnPort(slot.port1);
    const msg = received?.message as
      | { ok: true; results: SimRunSummary[] }
      | { ok: false; error: string }
      | undefined;
    if (!msg || !msg.ok) {
      throw new Error(msg?.error ?? 'Worker did not return simulation results');
    }
    runs.push(...msg.results);
  }
  runs.sort((a, b) => a.seed - b.seed);
  return runs;
}

export async function runPersonaBatchAsync(
  persona: PlayerPersonaId,
  seedsCount = 50,
  durationHours = 8,
): Promise<{ aggregate: PersonaAggregate; runs: SimRunSummary[] }> {
  const parallelRuns = await tryRunPersonaBatchParallelAsync(persona, seedsCount, durationHours);
  const runs: SimRunSummary[] = parallelRuns ?? [];
  if (!parallelRuns) {
    for (let seed = 1; seed <= seedsCount; seed++) {
      runs.push(runSinglePersonaSim(persona, seed, durationHours));
      if (seed % 5 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  return buildPersonaAggregate(persona, runs);
}

export function runPersonaBatch(
  persona: PlayerPersonaId,
  seedsCount = 50,
  durationHours = 8,
): { aggregate: PersonaAggregate; runs: SimRunSummary[] } {
  const parallelRuns = tryRunPersonaBatchParallel(persona, seedsCount, durationHours);
  const runs: SimRunSummary[] = parallelRuns ?? [];
  if (!parallelRuns) {
    for (let seed = 1; seed <= seedsCount; seed++) {
      runs.push(runSinglePersonaSim(persona, seed, durationHours));
    }
  }
  return buildPersonaAggregate(persona, runs);
}

/**
 * Compares 8-hour offline settlement gold earnings vs 8-hour real headless Farm Mode earnings
 * on an identical mid-game dungeon snapshot (must be within ±20%).
 */
export function verifyOfflineVsOnlineParity(seed = 42): {
  onlineGold8h: number;
  offlineGold8h: number;
  deviationRatio: number;
} {
  // Build a mid-game dungeon snapshot by simulating 1 hour of idle_casual first
  const setup = new DungeonEngine({ seed, overlordId: 'lilith' });
  for (let sec = 0; sec < 3600; sec += 30) {
    runPersonaDecision(setup, 'idle_casual', sec);
    setup.stepSeconds(30);
  }
  // Keep natural mid-game Treasury level, but remove artificial goldCap truncation for true parity audit
  setup.state.farmMode = true;
  setup.state.autoRetryBoss = false;
  setup.state.wave = Math.max(1, (setup.state.highestWaveCleared || setup.state.wave) - 1);
  setup.state.heroes = [];
  setup.state.gold = 500;
  const snapshot = setup.exportSave();

  const UNCAPPED_GOLD = 1_000_000_000;
  const prevUncapped = SIM_RUNTIME_FLAGS.uncappedGold;
  SIM_RUNTIME_FLAGS.uncappedGold = true;
  try {
    // Online headless 8h Farm Mode run (uncappedGold skips cap/bullion truncation & refill)
    const onlineEng = new DungeonEngine({ seed });
    onlineEng.importSave(snapshot);
    onlineEng.state.goldCap = UNCAPPED_GOLD;
    const startGold = onlineEng.state.gold;
    onlineEng.stepSeconds(8 * 3600);
    const onlineGold8h = Math.max(1, onlineEng.state.gold - startGold);

    // Offline 8h settlement on identical snapshot (uncappedGold)
    const offlineEng = new DungeonEngine({ seed });
    offlineEng.importSave(snapshot);
    offlineEng.state.goldCap = UNCAPPED_GOLD;
    const report = offlineEng.settleOffline(8 * 3600);
    const offlineGold8h = report.goldGained;

    const deviationRatio = Math.abs(offlineGold8h - onlineGold8h) / onlineGold8h;
    return { onlineGold8h, offlineGold8h, deviationRatio };
  } finally {
    SIM_RUNTIME_FLAGS.uncappedGold = prevUncapped;
  }
}
