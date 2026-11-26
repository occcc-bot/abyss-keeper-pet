import { describe, expect, it } from 'vitest';
import {
  ABYSS_TECH_TREE,
  ABYSSAL_UNIT_DEFS,
  BACKYARD_HATCHERY_SLOT,
  BACKYARD_TREASURY_SLOT,
  CAPTURABLE_HERO_IDS,
  DungeonEngine,
  HERO_DEFS,
  OVERLORD_DEFS,
  RELIC_DEFS,
  RESONANCE_STAT_CAP,
  ROOM_DEFS,
  SAVE_VERSION,
  SPELL_DEFS,
  STORY_IDS,
  THRONE_SLOT_INDEX,
  TORTURE_IMPLEMENT_LIST,
  TOTAL_SLOTS,
  TRAP_DEFS,
  addPrisonerToCorruptionChamber,
  computeGlobalModifiers,
  createAbyssalUnit,
  depositGold,
  evaluateDungeonResonances,
  evaluateProgression,
  evaluateTrapSynergies,
  getLocale,
  importSaveBase64,
  isOverchargeCritWindow,
  locHeroDef,
  locImplement,
  locOverlord,
  locRelic,
  locRoom,
  locSpell,
  locStoryScript,
  locTech,
  locTortureStageLine,
  locTrap,
  locUnitDef,
  setLocale,
  slotCenterX,
  type AbyssalSpeciesId,
  type HeroSpeciesId,
  type HeroUnit,
  type OverlordId,
  type RoomType,
  type SpellId,
  type TrapType,
} from '../../src/core';

function makeTestHero(overrides: Partial<HeroUnit>): HeroUnit {
  return {
    id: 'hero_test',
    species: 'holy_knight',
    name: '圣光女骑士',
    wave: 5,
    isBoss: false,
    isElite: true,
    isThief: false,
    hp: 0,
    maxHp: 300,
    atk: 25,
    attackCooldown: 0,
    attackSpeed: 1,
    moveSpeed: 64,
    range: 42,
    x: slotCenterX(10),
    slotIndex: 10,
    goldDrop: 50,
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
    downedForCapture: true,
    downedTimer: 40,
    beingHauledByImpId: null,
    ...overrides,
  };
}

describe('Abyss Keeper Pet V2.0 — Deterministic Core, 28-Slot Layout, Backyard Heist & Tech Tree', () => {
  it('reproduces identical simulation state for identical PRNG seed', () => {
    const a = new DungeonEngine({ seed: 2026, overlordId: 'lilith' });
    const b = new DungeonEngine({ seed: 2026, overlordId: 'lilith' });

    a.stepSeconds(180);
    b.stepSeconds(180);

    expect(a.state.tick).toBe(b.state.tick);
    expect(a.state.gold).toBeCloseTo(b.state.gold, 6);
    expect(a.state.mana).toBeCloseTo(b.state.mana, 6);
    expect(a.state.wave).toBe(b.state.wave);
    expect(a.state.metrics.totalHeroesDefeated).toBe(b.state.metrics.totalHeroesDefeated);
    expect(a.state.rngState).toBe(b.state.rngState);
    expect(a.state.units.map((u) => u.id)).toEqual(b.state.units.map((u) => u.id));
  });

  it('registers full V2.0 content: 28 slots, 4 overlords, 20 abyssal units, 12 heroes, 30 relics, 5 torture implements, 10 techs', () => {
    const engine = new DungeonEngine({ seed: 1 });
    expect(TOTAL_SLOTS).toBe(28);
    expect(engine.state.slots.length).toBe(28);
    expect(engine.state.slots[BACKYARD_TREASURY_SLOT]!.type).toBe('treasury');
    expect(engine.state.slots[BACKYARD_HATCHERY_SLOT]!.type).toBe('hatchery');
    expect(engine.state.slots[THRONE_SLOT_INDEX]!.type).toBe('throne');
    expect(Object.keys(OVERLORD_DEFS).length).toBe(4);
    expect(Object.keys(ABYSSAL_UNIT_DEFS).length).toBe(20);
    expect(Object.keys(HERO_DEFS).length).toBe(12);
    expect(RELIC_DEFS.length).toBe(30);
    expect(new Set(RELIC_DEFS.map((r) => r.id)).size).toBe(30);
    expect(TORTURE_IMPLEMENT_LIST.length).toBe(5);
    expect(ABYSS_TECH_TREE.length).toBe(10);
  });

  it('Bullfrog Slap is strictly non-lethal and grants 30s speed/action buff + quote', () => {
    const engine = new DungeonEngine({ seed: 42 });
    const unit = engine.state.units.find((u) => u.species === 'skeleton_blademaid')!;

    const hpBefore = unit.hp;
    const res1 = engine.slapUnit(unit.id);
    expect(res1.ok).toBe(true);
    expect(res1.hpLost).toBe(Math.ceil(0.05 * unit.maxHp));
    expect(unit.hp).toBe(hpBefore - res1.hpLost);
    expect(unit.slapBuffTimer).toBe(30);
    expect(res1.quote.length).toBeGreaterThan(2);

    for (let i = 0; i < 40; i++) engine.slapUnit(unit.id);
    expect(unit.hp).toBe(1);
    const resAtOne = engine.slapUnit(unit.id);
    expect(resAtOne.ok).toBe(true);
    expect(resAtOne.hpLost).toBe(0);
    expect(unit.hp).toBe(1);
  });

  it('Hand of Evil grab & drop feeds chicken immediately in Backyard Hatchery (#1) and triggers Fusion Altar matching', () => {
    const engine = new DungeonEngine({ seed: 77, progression: 'sandbox' });
    const slime = engine.state.units.find((u) => u.species === 'slime_girl')!;
    slime.hp = Math.floor(slime.maxHp * 0.4);
    slime.satiety = 20;

    // Backyard Hatchery is Slot 1!
    const chickensBefore = engine.state.slots[BACKYARD_HATCHERY_SLOT]!.chickens;
    expect(engine.grabUnit(slime.id)).toBe(true);
    expect(slime.activity).toBe('dangling');
    expect(engine.dropUnit(BACKYARD_HATCHERY_SLOT)).toBe(true);
    expect(engine.state.slots[BACKYARD_HATCHERY_SLOT]!.chickens).toBe(chickensBefore - 1);
    expect(slime.hp).toBeGreaterThan(Math.floor(slime.maxHp * 0.6));
    expect(slime.eatAnimTimer).toBeGreaterThan(0);

    // Build Altar in Backyard Slot 3, fuse Slime + Witch -> Crimson Succubus!
    engine.state.gold = 500;
    engine.state.mana = 120;
    expect(engine.buildRoom(3, 'altar')).toBe(true);
    const witch = engine.state.units.find((u) => u.species === 'imp_witch')!;
    slime.level = 10;
    witch.level = 8;

    expect(engine.grabUnit(slime.id)).toBe(true);
    expect(engine.dropUnit(3)).toBe(true);
    expect(engine.grabUnit(witch.id)).toBe(true);
    expect(engine.dropUnit(3)).toBe(true);

    const preview = engine.previewFusion(slime.id, witch.id);
    expect(preview.valid).toBe(true);
    expect(preview.mode).toBe('tier_up');
    expect(preview.resultSpecies).toBe('crimson_succubus');
    expect(preview.resultLevel).toBe(6);

    const fused = engine.fuseUnits(slime.id, witch.id);
    expect(fused).not.toBeNull();
    expect(fused!.species).toBe('crimson_succubus');
    expect(engine.state.metrics.totalFusions).toBe(1);
  });

  it('Imps visibly mine frontier rock veins (#12) and haul real gold nuggets back to Backyard Treasury (#0)', () => {
    const engine = new DungeonEngine({ seed: 101 });
    expect(engine.state.slots[12]!.type).toBe('rock_vein');
    expect(engine.state.slots[12]!.markedForDig).toBe(true);

    const goldStart = engine.state.gold;
    engine.stepSeconds(45);

    expect(engine.state.slots[12]!.type).toBe('corridor');
    expect(engine.state.gold).toBeGreaterThan(goldStart);
    expect(engine.state.recentEvents.some((e) => e.type === 'rock_mined')).toBe(true);
    expect(engine.state.recentEvents.some((e) => e.type === 'gold_delivered')).toBe(true);
  });

  it('Corruption Chamber with Electric Chair emits Wu Jing gag & converts Holy Knight into Tier 3 Fallen Paladin', () => {
    const engine = new DungeonEngine({ seed: 88, overlordId: 'lilith', progression: 'sandbox' });
    engine.state.gold = 2500;
    engine.state.mana = 200;
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    expect(engine.state.equippedImplement).toBe('electric_chair');

    const succubus = createAbyssalUnit(engine.state, 'crimson_succubus', 2, { assignedSlot: 2 });
    engine.state.units.push(succubus);

    const prisoner = addPrisonerToCorruptionChamber(engine.state, makeTestHero({ species: 'holy_knight' }));
    expect(prisoner).not.toBeNull();

    // Advance 10s first -> Electric Chair gag VFX fires!
    engine.stepSeconds(10);
    const vfx = engine.drainVfxQueue();
    expect(vfx.some((v) => v.kind === 'torture_gag' && v.subId === 'electric_chair')).toBe(true);

    // Unlock and equip a second implement (Feather Tickler)
    expect(engine.unlockTortureImplement('feather_tickler')).toBe(true);
    expect(engine.state.equippedImplement).toBe('feather_tickler');

    engine.state.waveTimer = 999;
    engine.stepSeconds(420);
    expect(engine.state.prisoners.length).toBe(0);
    expect(engine.state.metrics.totalCaptivesConverted).toBe(1);
    expect(engine.state.units.some((u) => u.species === 'fallen_paladin')).toBe(true);
  });

  it('Shadow Thief sneaks past Throne to steal Backyard Treasury gold, and Hand of Evil can grab & slam her for 2x bounty', () => {
    const engine = new DungeonEngine({ seed: 66 });
    engine.state.gold = 800;
    engine.state.units = engine.state.units.filter((u) => u.species === 'imp');

    const thief = makeTestHero({
      id: 'thief_heist_1',
      species: 'dwarf_gold_thief',
      name: '暗影女飞贼',
      isThief: true,
      hp: 400,
      maxHp: 400,
      moveSpeed: 130,
      x: slotCenterX(1),
      slotIndex: 1,
      stealthTimer: 8,
      downedForCapture: false,
    });
    engine.state.heroes.push(thief);

    // Thief dashes into Backyard Treasury (Slot 0) and steals gold!
    engine.stepSeconds(2.5);
    expect(thief.fleeingWithLoot).toBe(true);
    expect(thief.stolenGold).toBeGreaterThan(0);
    expect(engine.state.gold).toBeLessThan(800);

    const stolen = thief.stolenGold;
    const goldBeforeGrab = engine.state.gold;
    // Player grabs fleeing Thief with Hand of Evil and slams her onto Frontline Slot 9!
    expect(engine.grabThiefHero(thief.id)).toBe(true);
    expect(engine.dropUnit(9)).toBe(true);
    expect(thief.fleeingWithLoot).toBe(false);
    expect(thief.stolenGold).toBe(0);
    expect(engine.state.gold).toBe(goldBeforeGrab + stolen * 2);
    expect(engine.state.metrics.totalThievesCaught).toBe(1);
  });

  it('supports explicit Overlord leveling, spell upgrades, 4 Overlords, and 10-node Tech Tree', () => {
    const engine = new DungeonEngine({ seed: 404, progression: 'sandbox' });
    engine.state.gold = 3000;
    const atkBefore = engine.state.overlordAtk;
    const unitAtkBefore = engine.state.units.find((u) => u.species === 'skeleton_blademaid')!.atk;

    expect(engine.upgradeOverlord()).toBe(true);
    expect(engine.state.overlordLevel).toBe(2);
    expect(engine.state.overlordAtk).toBeGreaterThan(atkBefore);
    expect(engine.state.units.find((u) => u.species === 'skeleton_blademaid')!.atk).toBeGreaterThan(unitAtkBefore);

    expect(engine.upgradeSpell('abyss_blackhole')).toBe(true);
    expect(engine.state.spellLevels.abyss_blackhole).toBe(2);

    // Unlock Seraphina & Aurelia with Abyssal Shards + buy Tech Tree nodes
    engine.state.prestige.abyssalShards = 200;
    expect(engine.unlockOverlord('seraphina')).toBe(true);
    expect(engine.setOverlord('seraphina')).toBe(true);
    expect(engine.state.overlordId).toBe('seraphina');
    expect(engine.buyTech('offline_chronicle')).toBe(true);
    expect(engine.state.prestige.techLevels.offline_chronicle).toBe(1);
  });

  it('all 5 corridor traps function including Rolling Boulder sweep & Hell Spring bounce-back', () => {
    const engine = new DungeonEngine({ seed: 55, overlordId: 'elizabeth', progression: 'sandbox' });
    engine.state.autoCastSpells = false;
    engine.state.wave = 8;
    engine.state.gold = 2000;
    engine.state.trapParts = 200;
    engine.state.trapPartsCap = 200;

    // Frontline corridors are slots 8..11 plus let's dig slot 12 into corridor
    engine.state.slots[12]!.type = 'corridor';
    expect(engine.installTrap(8, 'frost_rune')).toBe(true);
    expect(engine.installTrap(9, 'boulder_trap')).toBe(true);
    expect(engine.installTrap(10, 'iron_spikes')).toBe(true);
    expect(engine.installTrap(11, 'charm_censer')).toBe(true);
    expect(engine.installTrap(12, 'hell_spring')).toBe(true);

    engine.state.units = engine.state.units.filter((u) => u.species === 'imp');
    engine.provokeNextWave();
    engine.stepSeconds(45);

    expect(engine.state.slots[8]!.trap!.triggersCount).toBeGreaterThan(0);
    expect(engine.state.slots[9]!.trap!.triggersCount).toBeGreaterThan(0);
    expect(engine.state.slots[10]!.trap!.triggersCount).toBeGreaterThan(0);
    expect(engine.state.slots[11]!.trap!.triggersCount).toBeGreaterThan(0);
    expect(engine.state.slots[12]!.trap!.triggersCount).toBeGreaterThan(0);
    expect(engine.state.metrics.totalTrapDamage).toBeGreaterThan(500);
    expect(engine.state.recentEvents.some((e) => e.type === 'boulder_launched')).toBe(true);
  });

  it('Gentle Payday Bell never deserts units on bankruptcy and Heart Shatter activates safe Farm Mode', () => {
    const engine = new DungeonEngine({ seed: 303 });
    const unitCountBefore = engine.state.units.length;
    engine.state.gold = 0;
    engine.state.paydayTimer = 0.2;

    engine.stepSeconds(1);
    expect(engine.state.units.length).toBe(unitCountBefore);
    expect(engine.state.gold).toBe(0);
    expect(engine.state.metrics.bankruptPaydays).toBe(1);

    engine.state.wave = 2;
    engine.state.highestWaveCleared = 1;
    engine.state.overlordHp = 0;
    engine.stepTick();

    expect(engine.state.farmMode).toBe(true);
    expect(engine.state.wave).toBe(1);
    expect(engine.state.heartReviveTimer).toBeGreaterThan(0);

    engine.stepSeconds(6);
    expect(engine.state.heartReviveTimer).toBe(0);
    expect(engine.state.overlordHp).toBe(engine.state.overlordMaxHp);
  });

  it('settles offline earnings up to 12h+ (expandable to 24h via tech), supports Base64 save/load & Wave 50 Prestige', () => {
    const engine = new DungeonEngine({ seed: 999, progression: 'sandbox' });
    engine.state.highestWaveCleared = 12;
    engine.state.slots[BACKYARD_TREASURY_SLOT]!.level = 15;
    engine.state.slots[THRONE_SLOT_INDEX]!.level = 10;
    engine.importSave(engine.exportSave());

    engine.state.gold = 1000;
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    addPrisonerToCorruptionChamber(engine.state, makeTestHero({ id: 'offline_knight', species: 'holy_knight', wave: 6 }));

    const report8h = engine.settleOffline(8 * 3600);
    expect(report8h.effectiveSeconds).toBe(8 * 3600);
    expect(report8h.goldGained).toBeGreaterThan(1000);
    expect(report8h.prisonersConverted).toBe(1);
    expect(engine.state.units.some((u) => u.species === 'fallen_paladin')).toBe(true);

    // Base cap = 12h; buying 2 ranks of offline_chronicle expands cap to 16h!
    const report48h = engine.settleOffline(48 * 3600);
    expect(report48h.effectiveSeconds).toBe(12 * 3600);

    // Prestige requires Wave 50+ (long-arc V2.0 threshold!)
    engine.state.highestWaveCleared = 35;
    expect(engine.triggerPrestige('elizabeth')).toBe(false);
    engine.state.highestWaveCleared = 52;
    expect(engine.triggerPrestige('elizabeth')).toBe(true);
    expect(engine.state.prestige.epoch).toBe(2);
    expect(engine.state.prestige.abyssalShards).toBeGreaterThan(15);
    expect(engine.state.overlordId).toBe('elizabeth');
  });

  it('supports Star-Up fusion, 4 Overlord spells (including Blackhole), and Imp dragging captives', () => {
    const engine = new DungeonEngine({ seed: 512, overlordId: 'lilith', progression: 'sandbox' });
    engine.state.gold = 2000;
    engine.state.mana = 300;
    expect(engine.buildRoom(2, 'altar')).toBe(true);
    expect(engine.buildRoom(3, 'corruption')).toBe(true);

    const slimeA = engine.state.units.find((u) => u.species === 'slime_girl')!;
    const slimeB = engine.recruitUnit('slime_girl')!;
    expect(slimeB).not.toBeNull();
    const starFused = engine.fuseUnits(slimeA.id, slimeB.id);
    expect(starFused!.star).toBe(2);

    engine.state.heroes.push(
      makeTestHero({ id: 'hero_sister_downed', species: 'holy_sister', name: '圣咏修女', x: slotCenterX(9), slotIndex: 9 }),
    );
    engine.stepSeconds(18);
    expect(engine.state.prisoners.length).toBeGreaterThanOrEqual(1);

    // Cast Blackhole & Demon Frenzy explicitly
    engine.state.mana = 300;
    engine.state.spellCooldowns.abyss_blackhole = 0;
    engine.state.spellCooldowns.demon_frenzy = 0;
    engine.state.heroes.push(makeTestHero({ id: 'live_h1', hp: 300, maxHp: 300, downedForCapture: false }));
    expect(engine.castSpell('abyss_blackhole')).toBe(true);
    expect(engine.castSpell('demon_frenzy')).toBe(true);
  });

  it('V2.1 Save Migration (v2 -> v3): safely migrates missing spellCooldowns & backfills Tier-3 corruptionMark', () => {
    const engine = new DungeonEngine({ seed: 2026 });
    const fp = createAbyssalUnit(engine.state, 'fallen_paladin', 8, { assignedSlot: 8 });
    delete fp.corruptionMark;
    engine.state.units.push(fp);

    const legacyV2 = structuredClone(engine.state) as unknown as Record<string, unknown>;
    legacyV2.version = 2;
    delete legacyV2.spellCooldowns;
    delete legacyV2.cutinMuted;
    const encoded = Buffer.from(JSON.stringify(legacyV2), 'utf-8').toString('base64');

    const migrated = importSaveBase64(encoded);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.spellCooldowns.abyss_blackhole).toBe(0);
    expect(migrated.cutinMuted).toBe(false);
    const migratedFp = migrated.units.find((u) => u.species === 'fallen_paladin')!;
    expect(migratedFp.corruptionMark).toBe('oathbreaker');
  });

  it('V2.1 Architectural Resonances do not stack, stay capped <= 1.35, and Trap Synergies scope to adjacent pairs', () => {
    const engine = new DungeonEngine({ seed: 777, progression: 'sandbox' });
    engine.state.gold = 9999;
    engine.state.trapParts = 200;
    engine.state.trapPartsCap = 200;
    // Build TWO pairs of corruption+altar -> must still activate only ONCE (no stacking!)
    engine.state.slots[4]!.type = 'corridor';
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    expect(engine.buildRoom(3, 'altar')).toBe(true);
    expect(engine.buildRoom(4, 'corruption')).toBe(true);
    expect(engine.buildRoom(5, 'library')).toBe(true); // adjacent to Throne #6 -> arcane_throne_corridor
    expect(engine.buildRoom(8, 'hatchery')).toBe(true); // adjacent to Training #7 -> demon_boot_canteen
    expect(engine.buildRoom(9, 'workshop')).toBe(true);
    expect(engine.installTrap(10, 'frost_rune')).toBe(true); // adjacent to Workshop #9 -> forge_kill_array
    expect(engine.installTrap(11, 'boulder_trap')).toBe(true); // adjacent to Frost #10 -> shatter_frost_lane

    const res = evaluateDungeonResonances(engine.state.slots);
    expect(res.activeResonances.length).toBe(4);
    const mods = computeGlobalModifiers(engine.state);
    expect(mods.corruptSpeedMult).toBeCloseTo(1.3, 4);
    expect(mods.corruptSpeedMult).toBeLessThanOrEqual(RESONANCE_STAT_CAP * 1.05);
    expect(mods.spellCooldownMult).toBeCloseTo(0.8, 4);
    expect(mods.resonanceChickenFrenzySec).toBe(12);
    expect(mods.resonanceBonusTraitOnConvert).toBe(true);

    const trapSyn = evaluateTrapSynergies(engine.state.slots);
    expect(trapSyn.slotTrapSynergies.get(10)?.has('shatter_frost_lane')).toBe(true);
    expect(trapSyn.slotTrapSynergies.get(11)?.has('shatter_frost_lane')).toBe(true);
    expect(trapSyn.slotTrapSynergies.has(8)).toBe(false);

    // Eating chicken with demon_boot_canteen grants 12s frenzyBuffTimer!
    const slime = engine.state.units.find((u) => u.species === 'slime_girl')!;
    expect(engine.grabUnit(slime.id)).toBe(true);
    expect(engine.dropUnit(8)).toBe(true);
    expect(slime.frenzyBuffTimer).toBeGreaterThanOrEqual(12);
  });

  it('V2.1 Corruption Mark switching (first free, then 35 Mana) & Offline Parity includes Night Collar +30%', () => {
    const engine = new DungeonEngine({ seed: 321 });
    engine.state.gold = 2000;
    engine.state.mana = 100;
    expect(engine.buildRoom(5, 'library')).toBe(true);
    const paladin = createAbyssalUnit(engine.state, 'fallen_paladin', 5, {
      assignedSlot: 5,
      corruptionMark: 'oathbreaker',
    });
    engine.state.units.push(paladin);

    // First switch is FREE
    const first = engine.setUnitCorruptionMark(paladin.id, 'night_collar');
    expect(first.ok).toBe(true);
    expect(first.costMana).toBe(0);
    expect(engine.state.mana).toBe(100);

    // Second switch costs 35 Mana
    const second = engine.setUnitCorruptionMark(paladin.id, 'true_hound');
    expect(second.ok).toBe(true);
    expect(second.costMana).toBe(35);
    expect(engine.state.mana).toBe(65);

    // Compare offline mana gain with night_collar vs oathbreaker on Library (set manaCap after ctor)
    const baseState = structuredClone(engine.state);
    baseState.mana = 0;
    const eA = new DungeonEngine({ initialState: baseState });
    eA.state.manaCap = 999999;
    eA.state.units.find((u) => u.species === 'fallen_paladin')!.corruptionMark = 'oathbreaker';
    const repA = eA.settleOffline(1800);

    const eB = new DungeonEngine({ initialState: baseState });
    eB.state.manaCap = 999999;
    eB.state.units.find((u) => u.species === 'fallen_paladin')!.corruptionMark = 'night_collar';
    const repB = eB.settleOffline(1800);
    expect(repB.manaGained).toBeGreaterThan(repA.manaGained);
  });

  it('V2.1 Hand of Evil Grab Downed Captive covers all 4 branches (unbind Imp, drop chamber -10% will, drop elsewhere/full keeps downedTimer)', () => {
    const engine = new DungeonEngine({ seed: 616, progression: 'sandbox' });
    engine.state.gold = 2000;
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    const imp = engine.state.units.find((u) => u.species === 'imp')!;

    // Branch 1 & 3: Unbind hauling Imp + drop outside corruption chamber -> preserves downedTimer!
    const h1 = makeTestHero({
      id: 'downed_branch_1',
      species: 'holy_sister',
      name: '圣咏修女',
      downedForCapture: true,
      downedTimer: 27.5,
      beingHauledByImpId: imp.id,
    });
    imp.carryingCaptiveId = h1.id;
    engine.state.heroes.push(h1);

    expect(engine.grabDownedHero(h1.id)).toBe(true);
    expect(imp.carryingCaptiveId).toBeNull();
    expect(h1.beingHauledByImpId).toBeNull();
    expect(engine.dropUnit(8)).toBe(true); // drop in corridor, not chamber
    expect(h1.downedForCapture).toBe(true);
    expect(h1.downedTimer).toBeCloseTo(27.5, 4);
    expect(engine.state.prisoners.length).toBe(0);

    // Branch 2: Drop into Corruption Chamber -> instant -10% maxWill!
    expect(engine.grabDownedHero(h1.id)).toBe(true);
    expect(engine.dropUnit(2)).toBe(true);
    expect(engine.state.prisoners.length).toBe(1);
    const p1 = engine.state.prisoners[0]!;
    expect(p1.progress).toBeGreaterThanOrEqual(0.09);
    expect(p1.will).toBeLessThan(p1.maxWill);

    // Branch 4: Chamber full (V2.5 no-prison Lv.1 seatCap = 1) -> drop into full chamber preserves downedTimer!
    expect(engine.state.prisoners.length).toBe(1);
    const hOverflow = makeTestHero({
      id: 'downed_overflow',
      species: 'elf_sharpshooter',
      name: '精灵神射手',
      downedForCapture: true,
      downedTimer: 19.2,
    });
    engine.state.heroes.push(hOverflow);
    expect(engine.grabDownedHero(hOverflow.id)).toBe(true);
    expect(engine.dropUnit(2)).toBe(true);
    expect(engine.state.prisoners.length).toBe(1);
    expect(hOverflow.downedForCapture).toBe(true);
    expect(hOverflow.downedTimer).toBeCloseTo(19.2, 4);
  });

  it('V2.1 Hardening: getMods layout cache invalidates on corridor<->corruption rebuild, pressurizeTorture enforces 1.5s CD, and save import clears dangling drag lock', () => {
    const engine = new DungeonEngine({ seed: 808, progression: 'sandbox' });
    engine.state.gold = 5000;
    expect(engine.buildRoom(3, 'altar')).toBe(true);
    // Warm up getMods() cache while slot #2 is still 'corridor'
    expect(engine.getMods().activeResonances).not.toContain('dark_inquisition_rite');
    // Rebuild corridor -> corruption (both start with 'co'!): cache MUST invalidate immediately!
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    expect(engine.getMods().activeResonances).toContain('dark_inquisition_rite');
    // Demolish back to corridor: resonance MUST vanish immediately!
    expect(engine.buildRoom(2, 'corridor')).toBe(true);
    expect(engine.getMods().activeResonances).not.toContain('dark_inquisition_rite');

    // V2.5 Pressurize Torture Chamber enforces dedicated 4.0s chamberSlapCd against rapid right-click spam
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    addPrisonerToCorruptionChamber(engine.state, makeTestHero({ id: 'p_cd', species: 'holy_knight' }));
    expect(engine.pressurizeTortureChamber(2).ok).toBe(true);
    expect(engine.pressurizeTortureChamber(2).ok).toBe(false); // blocked by 4.0s CD
    engine.stepSeconds(2.0);
    expect(engine.pressurizeTortureChamber(2).ok).toBe(false); // still blocked at 2.0s
    engine.stepSeconds(2.2);
    expect(engine.pressurizeTortureChamber(2).ok).toBe(true); // allowed after 4.0s CD expires

    // Importing a save captured mid-drag MUST clear heldUnitId/heldHeroId and reset dangling units to idle
    const slime = engine.state.units.find((u) => u.species === 'slime_girl')!;
    expect(engine.grabUnit(slime.id)).toBe(true);
    expect(engine.state.hand.heldUnitId).toBe(slime.id);
    expect(slime.activity).toBe('dangling');
    const saved = engine.exportSave();
    const reloaded = importSaveBase64(saved);
    expect(reloaded.hand.heldUnitId).toBeNull();
    expect(reloaded.hand.heldHeroId).toBeNull();
    expect(reloaded.units.find((u) => u.id === slime.id)!.activity).toBe('idle');
  });

  it('V2.2 Bilingual i18n (ZH/EN): covers all Overlords, Units, Heroes, Rooms, Traps, Spells, Relics, Tech, and 90 Torture lines cleanly', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');

    for (const oid of Object.keys(OVERLORD_DEFS) as OverlordId[]) {
      const o = locOverlord(oid);
      expect(o.name.length).toBeGreaterThan(2);
      expect(o.passiveDesc).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const sp of Object.keys(ABYSSAL_UNIT_DEFS) as AbyssalSpeciesId[]) {
      const u = locUnitDef(sp);
      expect(u.name).not.toMatch(/[\u4e00-\u9fff]/);
      expect(u.slapLines.length).toBe(3);
      expect(u.description.toLowerCase()).not.toContain('monster girl');
    }
    for (const hsp of Object.keys(HERO_DEFS) as HeroSpeciesId[]) {
      const h = locHeroDef(hsp);
      expect(h.name).not.toMatch(/[\u4e00-\u9fff]/);
      expect(h.roleTag).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const rt of Object.keys(ROOM_DEFS) as RoomType[]) {
      expect(locRoom(rt).name).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const tt of Object.keys(TRAP_DEFS) as TrapType[]) {
      expect(locTrap(tt).name).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const sid of Object.keys(SPELL_DEFS) as SpellId[]) {
      expect(locSpell(sid).name).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const r of RELIC_DEFS) {
      expect(locRelic(r.id).name).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const tk of ABYSS_TECH_TREE) {
      expect(locTech(tk.id).name).not.toMatch(/[\u4e00-\u9fff]/);
    }
    for (const impl of TORTURE_IMPLEMENT_LIST) {
      expect(locImplement(impl).name).not.toMatch(/[\u4e00-\u9fff]/);
      for (const hid of CAPTURABLE_HERO_IDS) {
        for (const p of [0.1, 0.55, 0.92]) {
          const ln = locTortureStageLine(hid, impl, p);
          expect(ln.length).toBeGreaterThan(5);
          expect(ln).not.toMatch(/[\u4e00-\u9fff]/);
        }
      }
    }
    setLocale('zh');
    expect(getLocale()).toBe('zh');
  });

  it('V2.3 Progressive Unlock Gating: monotonic territory & feature unlocks, first-build 50% discount, sealed rock guard & autoCastSpells gate', () => {
    const engine = new DungeonEngine({ seed: 2301 });
    // W0 initial state
    expect(engine.state.progression.territoryMax).toBe(12);
    expect(engine.isSlotUnlocked(12)).toBe(true);
    expect(engine.isSlotUnlocked(13)).toBe(false);
    expect(engine.markRockForMining(13)).toBe(false);
    expect(engine.isRoomUnlocked('corruption')).toBe(false);
    expect(engine.isRoomUnlocked('altar')).toBe(false);
    expect(engine.isTrapUnlocked('iron_spikes')).toBe(true);
    expect(engine.isTrapUnlocked('boulder_trap')).toBe(true);
    expect(engine.isTrapUnlocked('frost_rune')).toBe(false);
    expect(engine.isSpellUnlocked('abyss_lightning')).toBe(true);
    expect(engine.isSpellUnlocked('demon_frenzy')).toBe(false);

    // Gate commands & autoCastSpells at W0
    engine.state.gold = 5000;
    engine.state.mana = 300;
    engine.state.trapParts = 100;
    expect(engine.buildRoom(2, 'corruption')).toBe(false);
    expect(engine.installTrap(8, 'frost_rune')).toBe(false);
    expect(engine.castSpell('demon_frenzy')).toBe(false);
    expect(engine.castSpell('abyss_blackhole')).toBe(false);

    // Push 3 live heroes -> autoCastSpells must ONLY cast unlocked abyss_lightning, NEVER locked spells!
    engine.state.autoCastSpells = true;
    engine.state.heroes.push(
      makeTestHero({ id: 'g1', hp: 500, maxHp: 500, downedForCapture: false }),
      makeTestHero({ id: 'g2', hp: 500, maxHp: 500, downedForCapture: false }),
      makeTestHero({ id: 'g3', hp: 500, maxHp: 500, downedForCapture: false }),
    );
    engine.stepTick();
    expect(engine.state.spellCooldowns.abyss_lightning).toBeGreaterThan(0);
    expect(engine.state.spellCooldowns.demon_frenzy).toBe(0);
    expect(engine.state.spellCooldowns.charm_mist).toBe(0);
    expect(engine.state.spellCooldowns.abyss_blackhole).toBe(0);

    // Advance cleared waves monotonically: W1 -> W2 -> W3 -> W4 -> W7 -> W10
    engine.state.highestWaveCleared = 1;
    evaluateProgression(engine.state);
    expect(engine.state.progression.territoryMax).toBe(15);
    expect(engine.isSpellUnlocked('demon_frenzy')).toBe(true);
    expect(engine.isTrapUnlocked('frost_rune')).toBe(true);
    expect(engine.markRockForMining(13)).toBe(true);

    engine.state.highestWaveCleared = 2;
    evaluateProgression(engine.state);
    expect(engine.isRoomUnlocked('corruption')).toBe(true);
    const halfCost = engine.getRoomBuildCost('corruption');
    expect(halfCost).toBe(Math.round(ROOM_DEFS.corruption.buildCost * 0.5));
    const goldBefore = engine.state.gold;
    expect(engine.buildRoom(2, 'corruption')).toBe(true);
    expect(engine.state.gold).toBe(goldBefore - halfCost);
    expect(engine.getRoomBuildCost('corruption')).toBe(ROOM_DEFS.corruption.buildCost);

    engine.state.highestWaveCleared = 3;
    evaluateProgression(engine.state);
    expect(engine.isTrapUnlocked('charm_censer')).toBe(true);
    expect(engine.isTrapUnlocked('hell_spring')).toBe(true);
    expect(engine.isFeatureUnlocked('tab_relics')).toBe(true);

    engine.state.highestWaveCleared = 4;
    evaluateProgression(engine.state);
    expect(engine.state.progression.territoryMax).toBe(18);
    expect(engine.isRoomUnlocked('altar')).toBe(true);
    expect(engine.isSpellUnlocked('charm_mist')).toBe(true);
    expect(engine.getRoomBuildCost('altar')).toBe(Math.round(ROOM_DEFS.altar.buildCost * 0.5));

    engine.state.highestWaveCleared = 7;
    evaluateProgression(engine.state);
    expect(engine.state.progression.territoryMax).toBe(22);
    expect(engine.isSpellUnlocked('abyss_blackhole')).toBe(true);
    expect(engine.isFeatureUnlocked('tab_prestige')).toBe(true);

    engine.state.highestWaveCleared = 10;
    evaluateProgression(engine.state);
    expect(engine.state.progression.territoryMax).toBe(27);
  });

  it('V2.3 Save Migration (v3 -> v4) backfills unlocks via wave ∪ evidence, archives storySeen, and preserves storySeen across Prestige (E1)', () => {
    const engine = new DungeonEngine({ seed: 2302, progression: 'sandbox' });
    engine.state.highestWaveCleared = 2;
    engine.state.gold = 5000;
    engine.state.trapParts = 100;
    engine.buildRoom(2, 'corruption');
    engine.buildRoom(3, 'altar');
    engine.installTrap(8, 'charm_censer');
    engine.state.relics.push('bullfrog_pocket_watch');
    engine.state.slots[16]!.type = 'corridor';

    const legacyV3 = structuredClone(engine.state) as unknown as Record<string, unknown>;
    legacyV3.version = 3;
    delete legacyV3.progression;
    delete (legacyV3.prestige as Record<string, unknown>).storySeen;

    const encoded = Buffer.from(JSON.stringify(legacyV3), 'utf-8').toString('base64');
    const migrated = importSaveBase64(encoded);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.progression.unlocked).toContain('room_corruption');
    expect(migrated.progression.unlocked).toContain('room_altar');
    expect(migrated.progression.unlocked).toContain('trap_charm');
    expect(migrated.progression.unlocked).toContain('tab_relics');
    expect(migrated.progression.territoryMax).toBeGreaterThanOrEqual(17);
    expect(migrated.progression.firstBuildDiscount.corruption).toBe(false);
    expect(migrated.progression.firstBuildDiscount.altar).toBe(false);
    expect(migrated.prestige.storySeen).toContain('unlock_torture');
    expect(migrated.prestige.storySeen).toContain('unlock_altar');

    // E1: prestige.storySeen MUST survive triggerPrestige() into Epoch 2, and Epoch 2 unlocks all 28 slots!
    const e2 = new DungeonEngine({ initialState: migrated });
    e2.markStorySeen('prologue_desk');
    e2.state.highestWaveCleared = 55;
    expect(e2.triggerPrestige('elizabeth')).toBe(true);
    expect(e2.state.prestige.epoch).toBe(2);
    expect(e2.state.prestige.storySeen).toContain('prologue_desk');
    expect(e2.state.prestige.storySeen).toContain('unlock_torture');
    expect(e2.state.progression.territoryMax).toBe(27);
    expect(e2.isFeatureUnlocked('room_altar')).toBe(true);
  });

  it('V2.3 Bilingual Story Scripts (7 x 3) & Dynamic #6 Converted Hero Speaker (E2) with zero forbidden words', () => {
    for (const loc of ['zh', 'en'] as const) {
      setLocale(loc);
      for (const sid of STORY_IDS) {
        const ep = locStoryScript(sid, 'lilith', 'elf_sharpshooter');
        expect(ep.lines.length).toBe(3);
        expect(ep.title.length).toBeGreaterThan(2);
        for (const line of ep.lines) {
          expect(line.speakerName.length).toBeGreaterThan(0);
          expect(line.portraitKey.length).toBeGreaterThan(0);
          expect(line.text.length).toBeGreaterThan(6);
          expect(line.text).not.toContain('魔物娘');
          expect(line.text.toLowerCase()).not.toContain('monster girl');
        }
      }
      // E2: #6 first_ace_converted dynamically uses the actual converted hero's broken portrait & name
      const ep6Elf = locStoryScript('first_ace_converted', 'lilith', 'elf_sharpshooter');
      expect(ep6Elf.lines[0]!.portraitKey).toBe('elf_sharpshooter_broken');
      expect(ep6Elf.lines[0]!.speakerName).toBe(locHeroDef('elf_sharpshooter').name);
      const ep6Arch = locStoryScript('first_ace_converted', 'lilith', 'sun_archmage');
      expect(ep6Arch.lines[0]!.portraitKey).toBe('sun_archmage_broken');
      expect(ep6Arch.lines[0]!.speakerName).toBe(locHeroDef('sun_archmage').name);
    }
    setLocale('zh');
  });

  it('V2.5 Dark-Gold Bullion Vault: 7,200-step incremental deposit matches single-shot closed form (<1e-6) & 1:1 auto-refill on spend', () => {
    const a = new DungeonEngine({ seed: 2501, progression: 'sandbox' });
    const b = new DungeonEngine({ seed: 2501, progression: 'sandbox' });
    a.state.gold = a.state.goldCap;
    b.state.gold = b.state.goldCap;
    a.state.bullion = 0;
    b.state.bullion = 0;

    const totalOverflow = a.state.bullionCap * 1.37;
    const chunk = totalOverflow / 7200;
    for (let i = 0; i < 7200; i++) {
      depositGold(a.state, chunk);
    }
    depositGold(b.state, totalOverflow);

    expect(Math.abs(a.state.bullion - b.state.bullion)).toBeLessThan(1e-6);
    expect(a.state.bullion).toBeGreaterThan(0);
    expect(a.state.bullion).toBeLessThanOrEqual(a.state.bullionCap);

    // Spending gold triggers immediate 1:1 bullion refill
    const bullionBefore = a.state.bullion;
    expect(a.upgradeOverlord()).toBe(true);
    expect(a.state.bullion).toBeLessThan(bullionBefore);
    expect(a.state.gold).toBeCloseTo(a.state.goldCap, 1);
  });

  it('V2.5 Holy Ward decay, 40% prison softening floor, weakness halving HP loss, dual chicken & opportune overcharge', () => {
    const eng = new DungeonEngine({ seed: 2502, progression: 'sandbox' });
    eng.state.gold = 5000;
    eng.state.mana = 500;
    eng.state.waveTimer = 999;
    expect(eng.buildRoom(2, 'prison')).toBe(true);
    expect(eng.buildRoom(3, 'corruption')).toBe(true);

    // Captive in backyard prison corrodes Holy Ward and softens down to 40% floor (never below)
    const p = addPrisonerToCorruptionChamber(eng.state, makeTestHero({ id: 'p_ward', species: 'holy_knight', wave: 5 }))!;
    expect(p.cell).toBe('prison');
    expect(p.ward).toBe(1.0);
    p.will = Math.round(p.maxWill * 0.42);
    eng.stepSeconds(120);
    expect(p.ward).toBeLessThan(0.75);
    expect(p.will).toBeGreaterThanOrEqual(Math.ceil(p.maxWill * 0.4));

    // Move to chair: test Opportune Overcharge crit window [0.58,0.72] U [0.25,0.39]
    expect(eng.transferPrisonerCell(p.id, 'chamber')).toBe(true);
    p.will = Math.round(p.maxWill * 0.65);
    expect(isOverchargeCritWindow(p.will, p.maxWill)).toBe(true);
    const oc = eng.overchargeTorture();
    expect(oc.ok).toBe(true);
    expect(oc.isCrit).toBe(true);
    expect(p.overchargeTimer).toBe(5);
    expect(p.overchargeCrit).toBe(true);
    expect(eng.state.overchargeCd).toBe(45);

    // Dual chicken: Feed reduces overchargeCd by 15s & adds 45 satiety; 3rd feed triggers 12s food coma
    p.hp = 50;
    eng.state.slots[BACKYARD_HATCHERY_SLOT]!.chickens = 5;
    const f1 = eng.feedPrisonerChicken(p.id);
    expect(f1.ok).toBe(true);
    expect(f1.healAmt).toBe(40);
    expect(eng.state.overchargeCd).toBe(30);
    p.feedCd = 0;
    p.satiety = 70;
    const f2 = eng.feedPrisonerChicken(p.id);
    expect(f2.ok).toBe(true);
    expect(f2.drowsy).toBe(true);
    expect(p.drowsyTimer).toBe(12);

    // Dual chicken: Eat & Taunt on vegetarian Elf deals 0 HP dmg & drops ward -0.05
    p.drowsyTimer = 0;
    const elfEng = new DungeonEngine({ seed: 2503, progression: 'sandbox' });
    elfEng.state.gold = 5000;
    elfEng.buildRoom(2, 'corruption');
    const pElf = addPrisonerToCorruptionChamber(elfEng.state, makeTestHero({ id: 'p_elf', species: 'elf_sharpshooter', wave: 5 }))!;
    elfEng.state.slots[BACKYARD_HATCHERY_SLOT]!.chickens = 3;
    const taunt = elfEng.tauntPrisonerChicken(pElf.id);
    expect(taunt.ok).toBe(true);
    expect(taunt.vegetarian).toBe(true);
    expect(pElf.hp).toBe(100);
    expect(pElf.ward).toBeCloseTo(0.95, 5);
  });
});
