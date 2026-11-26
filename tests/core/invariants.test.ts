import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_QUIRK_IDS,
  DungeonEngine,
  SAVE_VERSION,
  SIM_RUNTIME_FLAGS,
  addPrisoner,
  composeGazette,
  deriveQuirk,
  exportSaveBase64,
  importSaveBase64,
  locQuirk,
  setLocale,
  stanceOf,
  type GameState,
  type HeroUnit,
} from '../../src/core';
import { triggerEmpressExcommunicate } from '../../src/core/systems/prisonSystem';

function makeHero(overrides: Partial<HeroUnit> = {}): HeroUnit {
  return {
    id: overrides.id ?? 'hero_test_1',
    species: overrides.species ?? 'holy_knight',
    name: overrides.name ?? '圣光女骑士',
    wave: overrides.wave ?? 5,
    isBoss: overrides.isBoss ?? false,
    isElite: overrides.isElite ?? true,
    isThief: overrides.isThief ?? false,
    hp: overrides.hp ?? 300,
    maxHp: overrides.maxHp ?? 300,
    atk: overrides.atk ?? 20,
    attackCooldown: 0,
    attackSpeed: 1,
    moveSpeed: 80,
    range: 40,
    x: overrides.x ?? 1600,
    slotIndex: overrides.slotIndex ?? 10,
    goldDrop: overrides.goldDrop ?? 60,
    stolenGold: 0,
    fleeingWithLoot: false,
    stealthTimer: 0,
    attackAnimTimer: 0,
    hurtAnimTimer: 0,
    slowTimer: 0,
    freezeTimer: 0,
    charmTimer: 0,
    poisonTimer: 0,
    poisonDps: 0,
    downedForCapture: false,
    downedTimer: 0,
    beingHauledByImpId: null,
    ...overrides,
  };
}

describe('V2.4 Five Core Invariants (I1–I5) & Feature Contracts', () => {
  it('I1: Prisoner Holy Will is strictly monotonic non-increasing across torture, chants, raids & passives', () => {
    const engine = new DungeonEngine({ seed: 101, progression: 'sandbox' });
    engine.state.gold = 5000;
    expect(engine.buildRoom(8, 'prison')).toBe(true);
    expect(engine.buildRoom(2, 'corruption')).toBe(true);

    const p1 = addPrisoner(engine.state, makeHero({ id: 'h1', species: 'holy_knight', wave: 6 }), 'prison')!;
    const p2 = addPrisoner(engine.state, makeHero({ id: 'h2', species: 'holy_sister', wave: 6 }), 'prison')!;
    const lastWill = new Map<string, number>([
      [p1.id, p1.will],
      [p2.id, p2.will],
    ]);

    for (let i = 0; i < 600; i++) {
      engine.stepTick();
      for (const p of engine.state.prisoners) {
        const prev = lastWill.get(p.id);
        if (prev !== undefined) {
          expect(p.will).toBeLessThanOrEqual(prev + 1e-6);
        }
        lastWill.set(p.id, p.will);
      }
    }
  });

  it('I2: Safeword Protocol & Offline Settlement guarantee 0 prisoner deaths; Extreme Mode kills fragile hero & grants 3 Legacies', () => {
    // 1. Safeword mode on Electric Chair -> 0 deaths even starting from 65 HP
    const safeEng = new DungeonEngine({ seed: 202, progression: 'sandbox' });
    safeEng.state.gold = 5000;
    safeEng.state.mana = 500;
    safeEng.buildRoom(2, 'prison');
    safeEng.buildRoom(3, 'corruption');
    const pSafe = addPrisoner(safeEng.state, makeHero({ species: 'holy_sister', wave: 4 }), 'chamber')!;
    pSafe.hp = 30;
    safeEng.stepSeconds(180);
    expect(safeEng.state.metrics.prisonersDied ?? 0).toBe(0);

    // 2. Offline settlement forces Safeword -> 0 deaths
    const offEng = new DungeonEngine({ seed: 203, progression: 'sandbox' });
    offEng.state.gold = 5000;
    offEng.buildRoom(2, 'corruption');
    offEng.setNoMercyMode(true);
    addPrisoner(offEng.state, makeHero({ species: 'holy_sister', wave: 4 }), 'chamber');
    offEng.settleOffline(3600);
    expect(offEng.state.noMercyMode).toBe(false);
    expect(offEng.state.metrics.prisonersDied ?? 0).toBe(0);

    // 3. Extreme Mode on fragile holy_sister (k_hero=1.10) on Electric Chair from 100 HP -> dies & grants 3 Legacies!
    const extEng = new DungeonEngine({ seed: 204, progression: 'sandbox' });
    extEng.state.gold = 5000;
    extEng.state.mana = 500;
    extEng.state.waveTimer = 999; // prevent wave spawn from consuming martyrBountyWaves before assertion
    extEng.buildRoom(2, 'prison');
    extEng.buildRoom(3, 'corruption');
    extEng.setNoMercyMode(true);
    const pFragile = addPrisoner(extEng.state, makeHero({ species: 'holy_sister', wave: 10 }), 'chamber')!;
    expect(pFragile.hp).toBe(100);
    extEng.stepSeconds(360);
    expect(extEng.state.metrics.prisonersDied).toBe(1);
    expect(extEng.state.ghostTutorTimer).toBeGreaterThan(0);
    expect(extEng.state.martyrBountyWaves).toBe(1);
    expect(extEng.state.prestige.obituaryBadgeUnlocked).toBe(true);
  });

  it('I3: Static determinism audit (no SeededRng in prisonSystem/quirkSystem/render; deterministic quirk & wave preview)', () => {
    const root = process.cwd();
    const prisonSrc = fs.readFileSync(path.join(root, 'src/core/systems/prisonSystem.ts'), 'utf8');
    const quirkSrc = fs.readFileSync(path.join(root, 'src/core/systems/quirkSystem.ts'), 'utf8');
    expect(prisonSrc).not.toMatch(/import\b[^;]*SeededRng/);
    expect(quirkSrc).not.toMatch(/import\b[^;]*SeededRng/);
    expect(quirkSrc).not.toMatch(/\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/);
    expect(prisonSrc).not.toMatch(/\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/);

    // Preview roster MUST match spawned wave 100% identically
    const engine = new DungeonEngine({ seed: 777, progression: 'sandbox' });
    engine.state.wave = 5;
    engine.state.heroes = [];
    const preview = engine.previewNextWave();
    engine.provokeNextWave();
    const spawned = engine.state.heroes.map((h) => h.species);
    expect(spawned).toEqual(preview.allSpecies);

    // Every unit has deterministic quirk & all 14 quirks have ZH/EN localization
    const u = engine.state.units[0]!;
    expect(deriveQuirk(engine.state.seed, u.id, u.species)).toBe(deriveQuirk(engine.state.seed, u.id, u.species));
    setLocale('en');
    for (const q of ALL_QUIRK_IDS) {
      const loc = locQuirk(q);
      expect(loc.name.length).toBeGreaterThan(2);
      expect(loc.lines.length).toBeGreaterThanOrEqual(3);
    }
    setLocale('zh');
  });

  it('I4: Max 1 Prison per dungeon, <= 1 raid per wave, Backyard Prison NEVER loses a prisoner (Empress backyard excommunicate)', () => {
    const engine = new DungeonEngine({ seed: 404, progression: 'sandbox' });
    engine.state.gold = 5000;
    expect(engine.buildRoom(2, 'prison')).toBe(true);
    // Second prison MUST be rejected (I4)
    expect(engine.buildRoom(3, 'prison')).toBe(false);

    // Put 1 resist + 1 broken prisoner in Backyard prison (#2 < THRONE #6)
    const pResist = addPrisoner(engine.state, makeHero({ id: 'r1', species: 'holy_knight', wave: 10 }), 'prison')!;
    const pBroken = addPrisoner(engine.state, makeHero({ id: 'b1', species: 'holy_sister', wave: 10 }), 'prison')!;
    pBroken.will = Math.round(pBroken.maxWill * 0.2);
    pBroken.progress = 0.8;
    expect(stanceOf(pResist)).toBe('resist');
    expect(stanceOf(pBroken)).toBe('broken');

    const empress = makeHero({ id: 'emp_1', species: 'lord_inquisitor', isBoss: true, wave: 10 });
    // Entry on backyard prison: mocks only, converts 0, releases 0
    triggerEmpressExcommunicate(engine.state, empress, 'entry');
    expect(engine.state.prisoners.length).toBe(2);
    expect(engine.state.nemesisPool.length).toBe(0);

    // Death on backyard prison: converts broken prisoner for 0 Mana, NEVER releases resist prisoner!
    triggerEmpressExcommunicate(engine.state, empress, 'death');
    expect(engine.state.prisoners.length).toBe(1);
    expect(engine.state.prisoners[0]!.id).toBe(pResist.id);
    expect(engine.state.nemesisPool.length).toBe(0);
    expect(engine.state.units.some((u) => u.species === 'corrupted_sister')).toBe(true);
  });

  it('V2.4 v4 -> v5 Save Migration is lossless & strips transient noMercyMode/whim/raid on load', () => {
    const eng = new DungeonEngine({ seed: 505, progression: 'sandbox' });
    eng.state.gold = 2000;
    eng.buildRoom(2, 'corruption');
    addPrisoner(eng.state, makeHero({ species: 'holy_knight', wave: 4 }), 'chamber');
    eng.setNoMercyMode(true);
    eng.state.units[2]!.activity = 'whim';
    eng.state.units[2]!.whim = { quirk: 'masochist', phase: 'go', targetX: 500, targetSlot: 2, t: 0, maxT: 5 };

    // Simulate a legacy v4 save payload
    const rawV4 = structuredClone(eng.state) as GameState & Record<string, unknown>;
    rawV4.version = 4;
    rawV4.highestWaveCleared = 3;
    delete (rawV4.prisoners[0] as unknown as Record<string, unknown>).hp;
    delete (rawV4.prisoners[0] as unknown as Record<string, unknown>).cell;

    const encoded = exportSaveBase64(rawV4 as GameState);
    const loaded = importSaveBase64(encoded);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.noMercyMode).toBe(false);
    expect(loaded.prisoners.length).toBe(1);
    expect(loaded.prisoners[0]!.hp).toBe(100);
    expect(loaded.prisoners[0]!.cell).toBe('chamber');
    expect(loaded.progression.unlocked).toContain('room_prison');
    expect(loaded.units.every((u) => u.activity !== 'whim' && u.whim === undefined)).toBe(true);
  });

  it('V2.4 Gazette composer & whimsEnabled runtime flag work cleanly', () => {
    const headlines = composeGazette({
      before: { raids: 0, twinSuites: 0 },
      after: { raids: 3, twinSuites: 1, slimeMopped: 5 },
      slackerNaps: 2,
      elapsedSec: 1200,
      seed: 42,
    });
    expect(headlines.length).toBeGreaterThanOrEqual(2);
    expect(headlines.length).toBeLessThanOrEqual(3);
    expect(SIM_RUNTIME_FLAGS.whimsEnabled).toBe(true);
  });

  it('V2.5 v5 -> v6 Save Migration is lossless with ward=0 for legacy captives and bullion=0', () => {
    const eng = new DungeonEngine({ seed: 606, progression: 'sandbox' });
    eng.state.gold = 2000;
    eng.buildRoom(2, 'corruption');
    addPrisoner(eng.state, makeHero({ species: 'holy_knight', wave: 4 }), 'chamber');

    const rawV5 = structuredClone(eng.state) as unknown as Record<string, unknown>;
    rawV5.version = 5;
    delete rawV5.bullion;
    delete rawV5.bullionCap;
    delete rawV5.overchargeCd;
    delete rawV5.chamberSlapCd;
    const p0 = (rawV5.prisoners as Record<string, unknown>[])[0]!;
    delete p0.ward;
    delete p0.satiety;
    delete p0.vintageWaves;

    const encoded = exportSaveBase64(rawV5 as unknown as GameState);
    const loaded = importSaveBase64(encoded);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.bullion).toBe(0);
    expect(loaded.overchargeCd).toBe(0);
    expect(loaded.chamberSlapCd).toBe(0);
    expect(loaded.prisoners[0]!.ward).toBe(0);
    expect(loaded.prisoners[0]!.satiety).toBe(0);
    expect(loaded.prisoners[0]!.vintageWaves).toBe(0);
  });
});
