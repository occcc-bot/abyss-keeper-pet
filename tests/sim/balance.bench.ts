import { describe, expect, it } from 'vitest';
import { DungeonEngine, SIM_RUNTIME_FLAGS } from '../../src/core';
import {
  runPersonaBatchAsync,
  runSinglePersonaSim,
  verifyOfflineVsOnlineParity,
  type PersonaAggregate,
} from '../../src/core/simRunner';

describe('V2.4 Monte Carlo Balance Verification (9 Gates: Original 7 Unrelaxed + Prison Warden + Extreme Executioner + Whim A/B)', () => {
  const seeds = 30;
  const hours = 8;
  const results: Partial<
    Record<'idle' | 'tyrant' | 'trap' | 'succubus' | 'architect' | 'warden' | 'executioner', PersonaAggregate>
  > = {};

  it('Anti-AFK-Coast Gate: pure Lv.1 zero-action dungeon cannot coast past Wave 6', () => {
    const afk = new DungeonEngine({ seed: 42 });
    afk.stepSeconds(2 * 3600);
    expect(afk.state.highestWaveCleared).toBeLessThanOrEqual(6);
    expect(afk.state.highestWaveCleared).toBeGreaterThanOrEqual(2);
  });

  it(
    'Persona A (Idle Casual): 30 seeds x 8h Epoch 1 meets long-arc pacing gates',
    async () => {
      const idle = (await runPersonaBatchAsync('idle_casual', seeds, hours)).aggregate;
      results.idle = idle;

      expect(idle.invalidCount).toBe(0);
      expect(idle.wave1hP50).toBeGreaterThanOrEqual(10);
      expect(idle.wave1hP50).toBeLessThanOrEqual(18);
      expect(idle.wave8hP50).toBeGreaterThanOrEqual(19);
      expect(idle.wave8hP50).toBeLessThanOrEqual(29);
      expect(idle.wave1hP10).toBeGreaterThanOrEqual(8);
      expect(idle.avgBankruptPaydays).toBeLessThan(6);
    },
    180_000,
  );

  it(
    'Persona B (Bullfrog Tyrant): 30 seeds x 8h rewards active play (1.4x..2.0x idle, approaching W50 Prestige)',
    async () => {
      const tyrant = (await runPersonaBatchAsync('bullfrog_tyrant', seeds, hours)).aggregate;
      results.tyrant = tyrant;
      const idle = results.idle ?? (await runPersonaBatchAsync('idle_casual', seeds, hours)).aggregate;

      expect(tyrant.invalidCount).toBe(0);
      expect(tyrant.wave1hP50).toBeGreaterThanOrEqual(18);
      expect(tyrant.wave1hP50).toBeLessThanOrEqual(30);
      expect(tyrant.wave8hP50).toBeGreaterThanOrEqual(35);
      expect(tyrant.wave8hP50).toBeLessThanOrEqual(48);
      const speedAdvantage = (tyrant.wave8hP50 - idle.wave8hP50) / idle.wave8hP50;
      expect(speedAdvantage).toBeGreaterThanOrEqual(0.4);
      expect(speedAdvantage).toBeLessThanOrEqual(1.0);
    },
    180_000,
  );

  it(
    'Persona C (Trap Master): 30 seeds x 8h meets health gates & strong trap damage share without runaway',
    async () => {
      const trap = (await runPersonaBatchAsync('trap_master', seeds, hours)).aggregate;
      results.trap = trap;

      expect(trap.invalidCount).toBe(0);
      expect(trap.wave1hP50).toBeGreaterThanOrEqual(14);
      expect(trap.wave1hP50).toBeLessThanOrEqual(28);
      expect(trap.wave8hP50).toBeGreaterThanOrEqual(24);
      expect(trap.wave8hP50).toBeLessThanOrEqual(42);
      expect(trap.avgTrapShare).toBeGreaterThanOrEqual(0.35);
      expect(trap.avgTrapShare).toBeLessThanOrEqual(0.95);
    },
    180_000,
  );

  it(
    'Persona D (Succubus Corruptor): 30 seeds x 8h meets health gates & healthy captive conversions',
    async () => {
      const succubus = (await runPersonaBatchAsync('succubus_corruptor', seeds, hours)).aggregate;
      results.succubus = succubus;

      expect(succubus.invalidCount).toBe(0);
      expect(succubus.wave1hP50).toBeGreaterThanOrEqual(16);
      expect(succubus.wave1hP50).toBeLessThanOrEqual(30);
      expect(succubus.wave8hP50).toBeGreaterThanOrEqual(30);
      expect(succubus.wave8hP50).toBeLessThanOrEqual(46);
      expect(succubus.avgCaptives).toBeGreaterThanOrEqual(6);
      expect(succubus.avgCaptives).toBeLessThanOrEqual(30);
    },
    180_000,
  );

  it(
    'Persona E (V2.1 Resonance Architect): 30 seeds x 8h rewards full 4-resonance + 2-trap-synergy layout without W50 runaway',
    async () => {
      const architect = (await runPersonaBatchAsync('resonance_architect', seeds, hours)).aggregate;
      results.architect = architect;

      expect(architect.invalidCount).toBe(0);
      expect(architect.wave1hP50).toBeGreaterThanOrEqual(16);
      expect(architect.wave1hP50).toBeLessThanOrEqual(32);
      // Bounded below W50 in 8h so resonance cap <= 1.35 preserves >= 60% of Epoch 1 pacing baseline!
      expect(architect.wave8hP50).toBeGreaterThanOrEqual(30);
      expect(architect.wave8hP50).toBeLessThanOrEqual(49);
    },
    180_000,
  );

  it(
    'Persona F (#8 Prison Warden): W1 Frontline Prison + W2 Torture + Safeword meets all V2.4 gates (0 deaths, active raids, <=35% escape)',
    async () => {
      const warden = (await runPersonaBatchAsync('prison_warden', seeds, hours)).aggregate;
      results.warden = warden;

      expect(warden.invalidCount).toBe(0);
      expect(warden.totalPrisonersDied).toBe(0);
      expect(warden.avgCaptives).toBeGreaterThanOrEqual(8);
      expect(warden.avgCaptives).toBeLessThanOrEqual(45);
      expect(warden.wave8hP50).toBeGreaterThanOrEqual(30);
      expect(warden.wave8hP50).toBeLessThanOrEqual(49);
      expect(warden.raidsPerHour).toBeGreaterThan(0);
      expect(warden.escapePerRaidRatio).toBeLessThanOrEqual(0.35);
    },
    180_000,
  );

  it(
    'Persona G (#9 Extreme Executioner): Killing captives for Obituary Legacies NEVER outperforms Prison Warden',
    async () => {
      const warden = results.warden ?? (await runPersonaBatchAsync('prison_warden', seeds, hours)).aggregate;
      const exec = (await runPersonaBatchAsync('extreme_executioner', seeds, hours)).aggregate;
      results.executioner = exec;

      expect(exec.invalidCount).toBe(0);
      expect(exec.wave8hP50).toBeLessThanOrEqual(warden.wave8hP50);
    },
    180_000,
  );

  it(
    'Cross-build parity veto (max 8h P50 ratio <= 2.1x incl. Prison Warden), Whims A/B <= 3% & Uncapped Offline vs Online parity (<= 20%)',
    async () => {
      const idle = results.idle ?? (await runPersonaBatchAsync('idle_casual', seeds, hours)).aggregate;
      const tyrant =
        results.tyrant ?? (await runPersonaBatchAsync('bullfrog_tyrant', seeds, hours)).aggregate;
      const trap = results.trap ?? (await runPersonaBatchAsync('trap_master', seeds, hours)).aggregate;
      const succubus =
        results.succubus ??
        (await runPersonaBatchAsync('succubus_corruptor', seeds, hours)).aggregate;
      const architect =
        results.architect ??
        (await runPersonaBatchAsync('resonance_architect', seeds, hours)).aggregate;
      const warden =
        results.warden ?? (await runPersonaBatchAsync('prison_warden', seeds, hours)).aggregate;

      const all: PersonaAggregate[] = [idle, tyrant, trap, succubus, architect, warden];
      for (const a of all) {
        expect(a.invalidCount).toBe(0);
        expect(a.totalPrisonersDied).toBe(0);
      }

      const p50s = all.map((a) => a.wave8hP50);
      const maxRatio = Math.max(...p50s) / Math.min(...p50s);
      expect(maxRatio).toBeLessThanOrEqual(2.1);

      // Whims A/B zero-economy check (5 seeds x 4h)
      let sumOn = 0;
      let sumOff = 0;
      for (let s = 1; s <= 5; s++) {
        SIM_RUNTIME_FLAGS.whimsEnabled = true;
        sumOn += runSinglePersonaSim('succubus_corruptor', s, 4).wave8h;
        SIM_RUNTIME_FLAGS.whimsEnabled = false;
        sumOff += runSinglePersonaSim('succubus_corruptor', s, 4).wave8h;
      }
      SIM_RUNTIME_FLAGS.whimsEnabled = true;
      const whimDiff = Math.abs(sumOn - sumOff) / Math.max(1, sumOff);
      expect(whimDiff).toBeLessThanOrEqual(0.03);

      const parity = verifyOfflineVsOnlineParity(42);
      expect(parity.deviationRatio).toBeLessThanOrEqual(0.2);
    },
    180_000,
  );
});
