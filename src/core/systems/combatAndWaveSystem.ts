import { RELIC_DEFS } from '../data/relics';
import { SPELL_DEFS, TRAP_DEFS } from '../data/roomsAndTraps';
import { evaluateTrapSynergies } from '../data/synergyAndMarks';
import { ABYSSAL_UNIT_DEFS, HERO_DEFS } from '../data/units';
import { locChapterName, locHeroDef, locHeroName, locRelic, locUnitName, t } from '../i18n';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  depositGold,
  heroScaledAtk,
  heroScaledGold,
  heroScaledHp,
  type RelicModifiers,
} from '../formulas';
import {
  findRoomSlotByType,
  getMaxCombatUnits,
  getThroneSlot,
  grantUnitXp,
  incrementChronicle,
  nextEntityId,
  pushEvent,
  pushVfx,
  recalcCapsAndOverlord,
  refillGoldAndEmitVfx,
  slotCenterX,
  xToSlotIndex,
} from '../ecs/stateFactory';
import { castSpell } from '../hand/handOfEvil';
import { hash32, hashUnitFloat } from '../hash';
import { locNemesisGrudgeLine } from '../i18n/v24';
import { SeededRng } from '../rng';
import {
  BACKYARD_HATCHERY_SLOT,
  BACKYARD_TREASURY_SLOT,
  DUNGEON_WIDTH,
  SIM_DT,
  THRONE_SLOT_INDEX,
  TOTAL_SLOTS,
  type AbyssalUnit,
  type GameState,
  type HeroSpeciesId,
  type HeroUnit,
  type NemesisEntry,
  type RoomSlot,
} from '../types';
import {
  countCorruptedSisters,
  getUnitActionMultiplier,
  getUnitSpeedMultiplier,
} from './ecosystemSystem';
import {
  getPrisonCapacity,
  getPrisonSlot,
  getTotalPrisonerCapacity,
  refillPrisonLock,
  releaseEscortedPrisoners,
  settlePrisonWaveRansom,
  stepRaid,
  triggerEmpressExcommunicate,
  tryClaimRaid,
} from './prisonSystem';
import {
  evaluateProgression,
  isSpellUnlocked,
  triggerStoryIfUnseen,
} from './progressionSystem';

function getInvasionSpawnSlot(state: GameState): number {
  for (let i = TOTAL_SLOTS - 1; i > THRONE_SLOT_INDEX; i--) {
    if (state.slots[i]?.type !== 'rock_vein') return i;
  }
  return Math.min(TOTAL_SLOTS - 1, THRONE_SLOT_INDEX + 4);
}

function createHeroForWave(
  state: GameState,
  species: HeroSpeciesId,
  wave: number,
  spawnSlotIdx: number,
  spawnOffsetPx: number,
  isMiniBoss = false,
): HeroUnit {
  if (!state.prestige.codexHeroes.includes(species)) {
    state.prestige.codexHeroes.push(species);
  }
  const def = HERO_DEFS[species];
  const isBoss = def.isBoss || isMiniBoss;
  const maxHp = heroScaledHp(def.baseHp, wave, isBoss);
  const atk = heroScaledAtk(def.baseAtk, wave, isBoss);
  const goldDrop = heroScaledGold(def.baseGoldDrop, wave, isBoss);
  const startX = Math.min(DUNGEON_WIDTH - 16, slotCenterX(spawnSlotIdx) + 52 + spawnOffsetPx);

  return {
    id: nextEntityId(species, state),
    species,
    name: isMiniBoss && !def.isBoss ? `精英·${def.name}` : def.name,
    wave,
    isBoss,
    isElite: def.isElite || isMiniBoss,
    isThief: def.stealsTreasuryGold,
    hp: maxHp,
    maxHp,
    atk,
    attackCooldown: 0,
    attackSpeed: def.attackSpeed,
    moveSpeed: def.moveSpeed,
    range: def.range,
    x: startX,
    slotIndex: xToSlotIndex(startX),
    goldDrop,
    stolenGold: 0,
    fleeingWithLoot: false,
    stealthTimer: def.stealsTreasuryGold ? 9.5 : 0,
    attackAnimTimer: 0,
    hurtAnimTimer: 0,
    slowTimer: 0,
    freezeTimer: 0,
    charmTimer: 0,
    charmSource: undefined,
    poisonTimer: 0,
    poisonDps: 0,
    downedForCapture: false,
    downedTimer: 0,
    beingHauledByImpId: null,
  };
}

export interface RolledWaveRoster {
  regular: HeroSpeciesId[];
  reinforcements: HeroSpeciesId[];
  nemesisReturns: NemesisEntry[];
  lostKnocks: NemesisEntry[];
  boss: HeroSpeciesId | null;
  allSpecies: HeroSpeciesId[];
}

/**
 * Pure deterministic wave roster generator driven by hash32(seed, epoch, wave, waveSpawnSeq).
 * Shared 100% by `previewWaveRoster(state)` (T-15s horizon silhouettes) and `spawnWave(state)`
 * so the preview is GUARANTEED 100% identical to the actual invading squad!
 */
export function rollWaveRoster(
  seed: number,
  epoch: number,
  wave: number,
  waveSpawnSeq: number,
  pendingReinforcements: number,
  nemesisPool: readonly NemesisEntry[],
): RolledWaveRoster {
  const localRng = new SeededRng(hash32(seed, epoch, wave, waveSpawnSeq, 'wave_roster'));
  const regular: HeroSpeciesId[] = [];
  const count = Math.min(8, 2 + Math.floor(wave / 4));

  for (let i = 0; i < count; i++) {
    const roll = localRng.next();
    if (wave >= 25 && roll < 0.14) regular.push('dragon_general');
    else if (wave >= 18 && roll < 0.28) regular.push('sun_archmage');
    else if (wave >= 12 && roll < 0.40) regular.push('shield_vanguard');
    else if (wave >= 9 && roll < 0.50) regular.push('crimson_assassin');
    else if (wave >= 7 && roll < 0.60) regular.push('sapper_engineer');
    else if (wave >= 5 && roll < 0.72) regular.push('holy_knight');
    else if (wave >= 4 && roll < 0.82) regular.push('elf_sharpshooter');
    else if (wave >= 3 && roll < 0.90) regular.push('holy_sister');
    else if (wave >= 2 && roll < 0.96) regular.push('dwarf_gold_thief');
    else regular.push('novice_adventurer');
  }

  // Guarantee a Thief occasionally from Wave 3+ so Backyard Heist shines!
  if (wave >= 3 && wave % 3 === 0 && !regular.some((s) => HERO_DEFS[s].stealsTreasuryGold)) {
    regular[0] = wave >= 10 ? 'crimson_assassin' : 'dwarf_gold_thief';
  }

  // Guarantee a capturable elite hero every wave >= 3
  if (wave >= 3 && !regular.some((s) => HERO_DEFS[s].capturableAs !== null)) {
    const elites: HeroSpeciesId[] =
      wave >= 25
        ? ['holy_knight', 'sun_archmage', 'dragon_general', 'elf_sharpshooter']
        : wave >= 18
          ? ['holy_knight', 'sun_archmage', 'holy_sister', 'elf_sharpshooter']
          : ['holy_sister', 'elf_sharpshooter', 'holy_knight', 'dwarf_gold_thief'];
    regular[regular.length - 1] = localRng.pick(elites);
  }

  const reinforcements: HeroSpeciesId[] = [];
  const extraCount = Math.min(2, Math.max(0, pendingReinforcements));
  for (let i = 0; i < extraCount; i++) {
    reinforcements.push(wave >= 5 ? 'holy_knight' : 'holy_sister');
  }

  const nemesisReturns: NemesisEntry[] = [];
  const lostKnocks: NemesisEntry[] = [];
  for (const nem of nemesisPool) {
    if (wave - nem.waveEscaped >= 2) {
      if (hashUnitFloat(seed, epoch, wave, waveSpawnSeq, nem.id, 'nem_choice') < 0.5) {
        nemesisReturns.push(nem);
      } else {
        lostKnocks.push(nem);
      }
    }
  }

  let boss: HeroSpeciesId | null = null;
  if (wave % 10 === 0) boss = 'lord_inquisitor';
  else if (wave % 5 === 0) boss = 'valkyrie_captain';

  const allSpecies: HeroSpeciesId[] = [
    ...regular,
    ...reinforcements,
    ...nemesisReturns.map((n) => n.sourceHero),
    ...(boss ? [boss] : []),
  ];

  return { regular, reinforcements, nemesisReturns, lostKnocks, boss, allSpecies };
}

/** Preview the exact upcoming wave roster (for T-15s silhouettes & Dungeon Gossip quirk!). */
export function previewWaveRoster(state: GameState): RolledWaveRoster {
  return rollWaveRoster(
    state.seed,
    state.prestige.epoch,
    state.wave,
    state.waveSpawnSeq ?? 0,
    state.pendingReinforcements ?? 0,
    state.nemesisPool ?? [],
  );
}

export function spawnWave(state: GameState, _rng: SeededRng): void {
  const wave = state.wave;
  const spawnSlot = getInvasionSpawnSlot(state);
  const rolled = rollWaveRoster(
    state.seed,
    state.prestige.epoch,
    wave,
    state.waveSpawnSeq ?? 0,
    state.pendingReinforcements ?? 0,
    state.nemesisPool ?? [],
  );
  state.waveSpawnSeq = (state.waveSpawnSeq ?? 0) + 1;
  state.pendingReinforcements = 0;

  // Refill Prison Lock & reset per-wave counters (Invariant I4)
  state.capturesThisWave = 0;
  state.capturedThisWave = false;
  state.raidsThisWave = 0;
  state.prepExtendedSec = 0;
  refillPrisonLock(state);

  // Cancel any unit whims cleanly on wave start so defenders are ready!
  for (const u of state.units) {
    if (u.whim || u.activity === 'whim') {
      delete u.whim;
      if (u.activity === 'whim') u.activity = 'idle';
    }
  }

  const martyrMult = state.martyrBountyWaves > 0 ? 2 : 1;
  if (state.martyrBountyWaves > 0) {
    state.martyrBountyWaves = 0;
  }

  let offset = 0;
  for (let i = 0; i < rolled.regular.length; i++) {
    const sp = rolled.regular[i]!;
    const h = createHeroForWave(state, sp, wave, spawnSlot, offset, false);
    if (martyrMult > 1) h.goldDrop = Math.round(h.goldDrop * martyrMult);
    state.heroes.push(h);
    offset += 26;
  }

  for (const sp of rolled.reinforcements) {
    const h = createHeroForWave(state, sp, wave, spawnSlot, offset, false);
    h.isReinforcement = true;
    if (martyrMult > 1) h.goldDrop = Math.round(h.goldDrop * martyrMult);
    state.heroes.push(h);
    offset += 26;
  }

  // Resolve Nemesis Pool returns & lost-knock returns
  if (rolled.nemesisReturns.length > 0 || rolled.lostKnocks.length > 0) {
    const resolvedIds = new Set([
      ...rolled.nemesisReturns.map((n) => n.id),
      ...rolled.lostKnocks.map((n) => n.id),
    ]);
    state.nemesisPool = state.nemesisPool.filter((n) => !resolvedIds.has(n.id));

    for (const nem of rolled.nemesisReturns) {
      const h = createHeroForWave(state, nem.sourceHero, wave, spawnSlot, offset, false);
      h.isElite = true;
      h.isNemesisReturn = true;
      h.nemesisGrudgeTag = nem.grudgeTag;
      h.nemesisWill = nem.will;
      h.nemesisMaxWill = nem.maxWill;
      h.nemesisVintageWaves = nem.vintageWaves ?? 0;
      if (martyrMult > 1) h.goldDrop = Math.round(h.goldDrop * martyrMult);
      state.heroes.push(h);
      offset += 26;
      incrementChronicle(state, 'nemesisReturns');
      pushVfx(state, {
        kind: 'banter',
        x: h.x,
        speakerId: h.id,
        speakerName: locHeroName(h),
        label: locNemesisGrudgeLine(nem.grudgeTag),
        color: 0xf05674,
      });
      pushEvent(state, {
        type: 'nemesis_return',
        slotIndex: spawnSlot,
        species: nem.sourceHero,
        text: t(
          `宿敌杀回！【从深渊归来者 · ${locHeroName(h)}】带着怨念重返走廊（击倒必抓、收编 ★+1）！`,
          `Nemesis Returns! [${locHeroName(h)}] marches back with a grudge (guaranteed capture, +1★ on convert)!`,
        ),
      });
    }

    const prison = getPrisonSlot(state);
    for (const nem of rolled.lostKnocks) {
      if (prison) {
        const inPrison = state.prisoners.filter((p) => p.cell === 'prison').length;
        if (inPrison < getPrisonCapacity(prison)) {
          const nextWill = Math.min(nem.will, Math.round(nem.maxWill * 0.66));
          state.prisoners.push({
            id: nextEntityId('prisoner', state),
            sourceHero: nem.sourceHero,
            targetSpecies: nem.targetSpecies,
            heroName: nem.heroName,
            waveCaptured: wave,
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
          incrementChronicle(state, 'nemesisReturns');
          pushVfx(state, {
            kind: 'banter',
            x: slotCenterX(prison.index),
            speakerId: `slot:${prison.index}`,
            speakerName: nem.heroName,
            label: t(
              '「我……只是下山迷路了，才不是想念你们的烤鸡！」',
              '"I—I just got lost on the way down! Totally NOT missing your roast chicken!"',
            ),
            color: 0xffb347,
          });
          continue;
        }
      }
      // If prison full or demolished, keep in nemesisPool
      if (state.nemesisPool.length < 3) state.nemesisPool.push(nem);
    }
  }

  // Every 5th wave (5, 15, 25...): Valkyrie Captain Mini-Boss!
  if (rolled.boss === 'valkyrie_captain') {
    const v = createHeroForWave(state, 'valkyrie_captain', wave, spawnSlot, offset + 14, false);
    if (martyrMult > 1) v.goldDrop = Math.round(v.goldDrop * martyrMult);
    state.heroes.push(v);
    triggerStoryIfUnseen(state, 'boss_valkyrie_w5');
    const vName = locHeroDef('valkyrie_captain').name;
    pushVfx(state, {
      kind: 'cutin',
      x: slotCenterX(spawnSlot),
      subId: 'boss:valkyrie_captain',
      label: t(`W${wave} 军团长【${vName}】空降突袭！`, `W${wave} Captain [${vName}] Assaults!`),
      color: 0xf2c655,
    });
  }
  // Every 10th wave (10, 20, 30...100): Grand Inquisitor Chapter Boss!
  if (rolled.boss === 'lord_inquisitor') {
    const boss = createHeroForWave(state, 'lord_inquisitor', wave, spawnSlot, offset + 18, false);
    if (martyrMult > 1) boss.goldDrop = Math.round(boss.goldDrop * martyrMult);
    state.heroes.push(boss);
    // V2.4 Empress Excommunication on entry (frontline converts broken + releases resist; backyard mocks only!)
    triggerEmpressExcommunicate(state, boss, 'entry');
    const iName = locHeroDef('lord_inquisitor').name;
    pushVfx(state, {
      kind: 'cutin',
      x: slotCenterX(spawnSlot),
      subId: 'boss:lord_inquisitor',
      label: t(`W${wave} 章节首领【${iName}】降临！`, `W${wave} Chapter Boss [${iName}] Arrives!`),
      color: 0xf05674,
    });
  }

  state.waveTimer = BALANCE_CONFIG.waveIntervalSec;
  state.metrics.peakWaveReached = Math.max(state.metrics.peakWaveReached, wave);
  pushEvent(state, {
    type: 'wave_started',
    slotIndex: spawnSlot,
    value: wave,
    text:
      wave % 10 === 0
        ? t(
            `第 ${wave} 波 章节 BOSS【${locHeroDef('lord_inquisitor').name}】带队上门找茬！(${locChapterName(wave)})`,
            `Wave ${wave} Boss [${locHeroDef('lord_inquisitor').name}] barges into our corridor! (${locChapterName(wave)})`,
          )
        : wave % 5 === 0
          ? t(
              `第 ${wave} 波 军团长【${locHeroDef('valkyrie_captain').name}】空降挑衅，滚石准备伺候！`,
              `Wave ${wave} Captain [${locHeroDef('valkyrie_captain').name}] drops in—grease the boulders!`,
            )
          : t(
              `第 ${wave} 波又有上门推销正义的圣堂传销团闯进走廊了！`,
              `Wave ${wave}—another batch of self-righteous Cathedral trespassers marched into our corridor!`,
            ),
  });
}

function awardRandomRelic(state: GameState, rng: SeededRng, xPos: number): void {
  const unowned = RELIC_DEFS.filter((r) => !state.relics.includes(r.id));
  if (unowned.length === 0) return;
  const picked = rng.pick(unowned);
  state.relics.push(picked.id);
  if (!state.prestige.unlockedRelicCodex.includes(picked.id)) {
    state.prestige.unlockedRelicCodex.push(picked.id);
  }
  evaluateProgression(state);
  const rLoc = locRelic(picked.id);
  pushEvent(state, {
    type: 'relic_dropped',
    species: picked.id,
    text: t(`获得全局圣物【${rLoc.name}】：${rLoc.effect}`, `Relic Acquired [${rLoc.name}]: ${rLoc.effect}`),
  });
  pushVfx(state, {
    kind: 'relic_banner',
    x: xPos,
    subId: picked.id,
    label: `${rLoc.name}｜${rLoc.effect}`,
    color: 0xf2c655,
  });
}

function handleHeroDeath(
  state: GameState,
  hero: HeroUnit,
  rng: SeededRng,
  cachedMods?: RelicModifiers,
): void {
  const mods = cachedMods ?? computeGlobalModifiers(state);
  const aureliaGoldMult = state.overlordId === 'aurelia' ? 1 + BALANCE_CONFIG.aureliaGoldBonus : 1;
  const def = HERO_DEFS[hero.species];
  state.metrics.totalHeroesDefeated += 1;

  // V2.4 Return any prisoners escorted by this fallen hero + backyard Empress death excommunication
  releaseEscortedPrisoners(state, hero.id);
  hero.valkyrieWarnActive = false;
  delete hero.raid;
  if (hero.species === 'lord_inquisitor') {
    triggerEmpressExcommunicate(state, hero, 'death');
  }

  // If this was a fleeing thief carrying loot, award 2x stolen gold bounty (+25% if True Hound active)!
  let thiefBounty = 0;
  if (hero.stolenGold > 0) {
    const hasHound = state.units.some((u) => u.hp > 0 && u.corruptionMark === 'true_hound');
    thiefBounty = Math.round(hero.stolenGold * 2 * (hasHound ? 1.25 : 1));
    state.metrics.totalThievesCaught += 1;
    incrementChronicle(state, 'thievesCaught');
    pushEvent(state, {
      type: 'thief_caught',
      slotIndex: hero.slotIndex,
      value: thiefBounty,
      text: t(
        `当场截杀偷金贼【${locHeroName(hero)}】！连本带利榨出双倍赃款 +${thiefBounty}G！`,
        `Cut down Thief [${locHeroName(hero)}]! Shook loose 2x ransom +${thiefBounty}G!`,
      ),
    });
    hero.stolenGold = 0;
  }

  const totalGold = Math.round((hero.goldDrop * mods.goldMult * aureliaGoldMult) + thiefBounty);
  const directGold = Math.round(totalGold * 0.55);
  const pileGold = totalGold - directGold;
  depositGold(state, directGold);
  const slot = state.slots[hero.slotIndex];
  if (slot && slot.type !== 'rock_vein' && pileGold > 0) {
    slot.looseGold += pileGold;
  }

  if (state.overlordId === 'elizabeth') {
    for (const u of state.units) {
      if (u.species !== 'imp' && u.hp > 0 && u.hp < u.maxHp) {
        u.hp = Math.min(
          u.maxHp,
          u.hp + Math.round(u.maxHp * BALANCE_CONFIG.elizabethBloodThornHealRatio),
        );
      }
    }
  }

  const xpReward = Math.round(3 + hero.wave * 0.55 + (hero.isBoss ? 14 : 0));
  for (const u of state.units) {
    if (u.species !== 'imp' && u.hp > 0 && u.activity === 'fighting') {
      grantUnitXp(state, u, xpReward);
    }
  }

  const prison = getPrisonSlot(state);
  const chamber = findRoomSlotByType(state, 'corruption');
  const hasPrison = Boolean(prison);
  const maxPrisoners = getTotalPrisonerCapacity(state);
  const pendingDowned = state.heroes.filter((h) => h.downedForCapture).length;
  const maxCapturesThisWave = hasPrison && state.wave % 5 === 0 ? 2 : 1;
  // Invariant I5: without prison, keep !farmMode. With prison, farmMode can capture when cage is empty & wavesSinceCapture >= 10 so cruise players see jailbreaks without infinite farming!
  const canCaptureInMode = hasPrison
    ? !state.farmMode || (state.prisoners.length === 0 && (state.wavesSinceCapture ?? 0) >= 10)
    : !state.farmMode;

  if (
    def.capturableAs &&
    (hasPrison || chamber) &&
    canCaptureInMode &&
    state.capturesThisWave < maxCapturesThisWave
  ) {
    const combatCount = state.units.filter((u) => u.species !== 'imp').length;
    const maxCombat = getMaxCombatUnits(state);
    const isPopFull = combatCount + state.prisoners.length >= maxCombat + 2;
    const hasCellRoom = state.prisoners.length + pendingDowned < maxPrisoners;

    if (hasCellRoom || (hasPrison && isPopFull)) {
      let captureChance =
        BALANCE_CONFIG.baseCaptureChance +
        ((chamber ? chamber.level : prison!.level) - 1) * BALANCE_CONFIG.captureChancePerRoomLevel +
        mods.captureChanceBonus +
        (hasPrison ? 0.12 : 0);
      if (state.overlordId === 'lilith') {
        captureChance += BALANCE_CONFIG.lilithCaptureBonus;
      }
      const capMax = hasPrison ? 0.40 : BALANCE_CONFIG.maxCaptureChance;
      captureChance = Math.min(capMax, captureChance);
      if (hasPrison && state.farmMode) {
        captureChance *= 0.2;
      }

      const pityGuaranteed =
        hasPrison && !state.farmMode && (state.wavesSinceCapture >= 4 || Boolean(hero.isNemesisReturn));
      if (pityGuaranteed || rng.chance(captureChance)) {
        state.capturesThisWave += 1;
        state.capturedThisWave = true;
        state.wavesSinceCapture = 0;

        // V2.4 Full-population Ransom downgrade: 3x gold + 1 Soul Mark instead of wasting downed hero!
        if (hasPrison && (isPopFull || !hasCellRoom)) {
          const ransomGold = Math.round(hero.goldDrop * 3);
          depositGold(state, ransomGold);
          state.prestige.corruptedSoulMarks[def.capturableAs] =
            (state.prestige.corruptedSoulMarks[def.capturableAs] ?? 0) + 1;
          pushEvent(state, {
            type: 'ransom_paid',
            slotIndex: hero.slotIndex,
            species: hero.species,
            value: ransomGold,
            text: t(
              `地牢满员！圣堂火速汇来【${locHeroName(hero)}】赎身金 +${ransomGold}G 与灵魂刻印 +1！`,
              `Dungeon full! Cathedral wired +${ransomGold}G ransom & +1 Soul Mark for [${locHeroName(hero)}]!`,
            ),
          });
          return;
        }

        hero.hp = 0;
        hero.downedForCapture = true;
        hero.downedTimer = 45;
        hero.fleeingWithLoot = false;
        hero.stealthTimer = 0;
        pushEvent(state, {
          type: 'hero_captured',
          slotIndex: hero.slotIndex,
          species: hero.species,
          text: t(
            `新贵客入住！【${locHeroName(hero)}】已被放倒，小鬼正拎着暗金镣铐拖进地牢！`,
            `New VIP guest! [${locHeroName(hero)}] knocked cold—Imps are hauling her in with velvet cuffs!`,
          ),
        });
        return;
      }
    }
  }
}

function triggerTrapOnSlot(
  state: GameState,
  slot: RoomSlot,
  heroesInSlot: HeroUnit[],
  rng: SeededRng,
  mods: RelicModifiers,
): void {
  const trap = slot.trap;
  if (!trap || trap.cooldownTimer > 0 || trap.charges <= 0 || heroesInSlot.length === 0) return;

  const def = TRAP_DEFS[trap.type];
  const elizabethMult =
    state.overlordId === 'elizabeth' ? 1 + BALANCE_CONFIG.elizabethTrapDamageBonus : 1;
  const trapMasterInSlot = state.units.some(
    (u) => u.slotIndex === slot.index && u.traits.includes('trap_master') && u.hp > 0,
  )
    ? 1.2
    : 1;

  // V2.1 Corridor Trap-Pair Synergy (strictly capped +35% on the participating adjacent pair, NEVER wave-scaled!)
  const trapSyn = evaluateTrapSynergies(state.slots).slotTrapSynergies.get(slot.index);
  const hasShatterSyn = Boolean(trapSyn?.has('shatter_frost_lane'));
  const hasPhantomSyn = Boolean(trapSyn?.has('phantom_labyrinth'));
  const pairSynergyMult = hasShatterSyn || hasPhantomSyn ? 1.35 : 1.0;

  // Traps scale purely from Trap Level (upgraded via Gold & Parts — zero free wave runaway!)
  const scale =
    (1 + 0.50 * (trap.level - 1)) *
    Math.pow(1.16, trap.level - 1) *
    mods.trapDamageMult *
    elizabethMult *
    trapMasterInSlot *
    pairSynergyMult;

  if (trap.type === 'boulder_trap') {
    const dmg = Math.round(def.baseDamage * scale * mods.boulderDamageMult);
    state.boulders.push({
      id: nextEntityId('boulder', state),
      x: slotCenterX(slot.index) - 40,
      speed: 255,
      damage: dmg,
      knockback: 135,
      hitHeroIds: [],
      sourceSlot: slot.index,
    });
    trap.charges -= 1;
    trap.cooldownTimer = def.cooldownSec;
    trap.triggersCount += 1;
    state.metrics.totalTrapsTriggered += 1;
    pushEvent(state, {
      type: 'boulder_launched',
      slotIndex: slot.index,
      value: dmg,
      text: '牛蛙滚石巨砾轰隆碾压整条长廊！',
    });
    return;
  }

  const spawnSlot = getInvasionSpawnSlot(state);
  let dealtTotal = 0;
  for (const h of heroesInSlot) {
    h.stealthTimer = 0; // Traps immediately reveal stealth thieves!
    h.hurtAnimTimer = 0.22;
    if (trap.type === 'iron_spikes') {
      const shatterMult = h.freezeTimer > 0 ? (hasShatterSyn ? 1.9 : 1.6) : 1;
      const dmg = Math.round(def.baseDamage * scale * shatterMult);
      h.hp -= dmg;
      h.slowTimer = Math.max(h.slowTimer, 3.0);
      dealtTotal += dmg;
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, isCrit: shatterMult > 1, color: 0xf2c655 });
    } else if (trap.type === 'charm_censer') {
      const dmg = Math.round(def.baseDamage * scale);
      h.hp -= dmg;
      if (!h.isBoss) {
        h.charmTimer = Math.max(h.charmTimer, hasPhantomSyn ? 4.0 : 3.0);
        h.charmSource = 'trap';
      } else {
        h.slowTimer = Math.max(h.slowTimer, 2.0);
      }
      dealtTotal += dmg;
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, color: 0xff8ec8 });
    } else if (trap.type === 'frost_rune') {
      const dmg = Math.round(def.baseDamage * scale);
      h.hp -= dmg;
      h.freezeTimer = Math.max(h.freezeTimer, (h.isBoss ? 1.0 : 2.0) + mods.frostDurationBonus);
      dealtTotal += dmg;
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, color: 0x6ce5ff });
    } else if (trap.type === 'hell_spring') {
      const dmg = Math.round((def.baseDamage + mods.springDamageBonus) * scale);
      h.hp -= dmg;
      h.x = Math.min(DUNGEON_WIDTH - 24, slotCenterX(spawnSlot));
      h.slotIndex = spawnSlot;
      h.fleeingWithLoot = false;
      dealtTotal += dmg;
      pushVfx(state, { kind: 'damage', x: h.x, value: dmg, isCrit: true, color: 0xffb347 });
      break;
    }
  }

  trap.charges -= 1;
  trap.cooldownTimer = def.cooldownSec;
  trap.triggersCount += 1;
  trap.totalDamageDealt += dealtTotal;
  state.metrics.totalTrapsTriggered += 1;
  state.metrics.totalTrapDamage += dealtTotal;

  pushEvent(state, {
    type: 'trap_triggered',
    slotIndex: slot.index,
    species: trap.type,
    value: dealtTotal,
  });

  for (const h of heroesInSlot) {
    if (h.hp <= 0 && !h.downedForCapture) {
      handleHeroDeath(state, h, rng, mods);
    }
  }
}

const _liveHeroes: HeroUnit[] = [];
const _victims: HeroUnit[] = [];
const _combatUnits: AbyssalUnit[] = [];

export function stepCombatAndWaveSystem(
  state: GameState,
  rng: SeededRng,
  cachedMods?: RelicModifiers,
  stepDt = SIM_DT,
): void {
  const dt = stepDt;
  const throneSlot = getThroneSlot(state);
  const throneX = slotCenterX(throneSlot.index);

  if (state.heartReviveTimer > 0) {
    state.heartReviveTimer = Math.max(0, state.heartReviveTimer - dt);
    if (state.heartReviveTimer <= 0) {
      state.overlordHp = state.overlordMaxHp;
      for (const u of state.units) {
        u.hp = u.maxHp;
        u.satiety = 100;
        u.recoveryTimer = 0;
        u.activity = 'idle';
      }
    }
    return;
  }

  if (state.heroes.length === 0 && state.boulders.length === 0 && state.overlordHp > 0) {
    state.waveTimer -= dt;
    if (state.waveTimer > 0) {
      for (let i = 0, n = state.slots.length; i < n; i++) {
        const t = state.slots[i]!.trap;
        if (t && t.cooldownTimer > 0) t.cooldownTimer = Math.max(0, t.cooldownTimer - dt);
      }
      if (state.overlordAttackCooldown > 0) {
        state.overlordAttackCooldown = Math.max(0, state.overlordAttackCooldown - dt);
      }
      for (let i = 0, n = state.units.length; i < n; i++) {
        const u = state.units[i]!;
        if (u.attackCooldown > 0) u.attackCooldown = Math.max(0, u.attackCooldown - dt);
        if (u.activity === 'fighting') u.activity = 'idle';
      }
      return;
    }
    spawnWave(state, rng);
  }

  const mods = cachedMods ?? computeGlobalModifiers(state);
  const spawnSlotIdx = getInvasionSpawnSlot(state);
  const escapeEdgeX = Math.min(DUNGEON_WIDTH - 12, slotCenterX(spawnSlotIdx) + 70);

  const liveHeroes = _liveHeroes;
  liveHeroes.length = 0;
  for (let i = 0, n = state.heroes.length; i < n; i++) {
    const h = state.heroes[i]!;
    if (!h.downedForCapture && h.hp > 0) liveHeroes.push(h);
  }

  if (liveHeroes.length === 0) {
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      spawnWave(state, rng);
      for (let i = 0, n = state.heroes.length; i < n; i++) {
        const h = state.heroes[i]!;
        if (!h.downedForCapture && h.hp > 0) liveHeroes.push(h);
      }
    }
  }

  // Tick trap cooldowns & trigger traps
  for (let i = 0, sn = state.slots.length; i < sn; i++) {
    const slot = state.slots[i]!;
    if (slot.trap) {
      if (slot.trap.cooldownTimer > 0) {
        slot.trap.cooldownTimer = Math.max(0, slot.trap.cooldownTimer - dt);
      }
      if (slot.trap.cooldownTimer <= 0 && slot.trap.charges > 0 && liveHeroes.length > 0) {
        _victims.length = 0;
        for (let hi = 0, hn = liveHeroes.length; hi < hn; hi++) {
          const h = liveHeroes[hi]!;
          if (!h.downedForCapture && h.hp > 0 && h.slotIndex === slot.index && state.hand.heldHeroId !== h.id) {
            _victims.push(h);
          }
        }
        if (_victims.length > 0) {
          triggerTrapOnSlot(state, slot, _victims, rng, mods);
        }
      }
    }
  }

  // Step Rolling Boulders sweeping left -> right down the corridor!
  const trapSynMap = state.boulders.length > 0 ? evaluateTrapSynergies(state.slots).slotTrapSynergies : null;
  for (let i = state.boulders.length - 1; i >= 0; i--) {
    const b = state.boulders[i]!;
    b.x += b.speed * dt;
    const boulderHasShatter = Boolean(trapSynMap?.get(b.sourceSlot)?.has('shatter_frost_lane'));
    for (const h of state.heroes) {
      if (h.downedForCapture || h.hp <= 0 || b.hitHeroIds.includes(h.id)) continue;
      if (Math.abs(h.x - b.x) <= 44) {
        b.hitHeroIds.push(h.id);
        h.stealthTimer = 0;
        h.hurtAnimTimer = 0.25;
        const shatterMult = h.freezeTimer > 0 ? (boulderHasShatter ? 1.8 : 1.5) : 1;
        const dmg = Math.round(b.damage * shatterMult);
        h.hp -= dmg;
        h.x = Math.min(escapeEdgeX - 8, h.x + (h.isBoss ? b.knockback * 0.45 : b.knockback));
        h.slotIndex = xToSlotIndex(h.x);
        state.metrics.totalTrapDamage += dmg;
        const sourceTrap = state.slots[b.sourceSlot]?.trap;
        if (sourceTrap) sourceTrap.totalDamageDealt += dmg;
        pushVfx(state, { kind: 'damage', x: h.x, value: dmg, isCrit: true, color: 0xf05674 });
        if (b.hitHeroIds.length >= 2) {
          pushVfx(state, {
            kind: 'boulder_streak',
            x: b.x,
            value: b.hitHeroIds.length,
            label: t(`滚石 ${b.hitHeroIds.length} 连碾！`, `Boulder x${b.hitHeroIds.length} Strike!`),
            color: 0xf2c655,
          });
        }
        if (h.hp <= 0) {
          handleHeroDeath(state, h, rng, mods);
        }
      }
    }
    if (b.x > escapeEdgeX + 60) {
      state.boulders.splice(i, 1);
    }
  }

  // Auto-cast Overlord Miracles if enabled (isAuto=true -> NEVER pops Cut-in!)
  let activeHeroCount = 0;
  for (let hi = 0, hn = liveHeroes.length; hi < hn; hi++) {
    const h = liveHeroes[hi]!;
    if (!h.downedForCapture && h.hp > 0) activeHeroCount += 1;
  }
  if (state.autoCastSpells && activeHeroCount > 0) {
    if (
      activeHeroCount >= 3 &&
      isSpellUnlocked(state, 'abyss_blackhole') &&
      state.spellCooldowns.abyss_blackhole <= 0 &&
      state.mana >= SPELL_DEFS.abyss_blackhole.manaCost
    ) {
      castSpell(state, 'abyss_blackhole', true);
    } else if (
      activeHeroCount >= 2 &&
      isSpellUnlocked(state, 'charm_mist') &&
      state.spellCooldowns.charm_mist <= 0 &&
      state.mana >= SPELL_DEFS.charm_mist.manaCost
    ) {
      castSpell(state, 'charm_mist', true);
    } else if (
      isSpellUnlocked(state, 'demon_frenzy') &&
      state.spellCooldowns.demon_frenzy <= 0 &&
      state.mana >= SPELL_DEFS.demon_frenzy.manaCost
    ) {
      castSpell(state, 'demon_frenzy', true);
    } else if (
      isSpellUnlocked(state, 'abyss_lightning') &&
      state.spellCooldowns.abyss_lightning <= 0 &&
      state.mana >= SPELL_DEFS.abyss_lightning.manaCost
    ) {
      castSpell(state, 'abyss_lightning', true);
    }
  }

  // Gather living combat defenders
  const sisterCount = countCorruptedSisters(state);
  const combatUnits = _combatUnits;
  combatUnits.length = 0;
  for (let i = 0, un = state.units.length; i < un; i++) {
    const u = state.units[i]!;
    if (
      u.species !== 'imp' &&
      u.hp > 0 &&
      (u.recoveryTimer ?? 0) <= 0 &&
      u.activity !== 'dangling' &&
      u.activity !== 'altar_bound'
    ) {
      combatUnits.push(u);
    }
  }

  // True-sight units (and True Hound mark holders!) auto-reveal stealthed thieves (240px base / 480px with True Hound)!
  for (const u of combatUnits) {
    const isTrueHound = u.corruptionMark === 'true_hound';
    if (!u.traits.includes('true_sight') && !isTrueHound) continue;
    const detectRange = isTrueHound ? 480 : 240;
    for (const h of liveHeroes) {
      if (h.stealthTimer > 0 && Math.abs(h.x - u.x) <= detectRange) {
        h.stealthTimer = 0;
        pushVfx(state, {
          kind: 'banter',
          x: u.x,
          speakerId: u.id,
          speakerName: locUnitName(u),
          label: t('抓到潜行偷金贼啦！', 'Spotted a stealthed thief!'),
          color: 0xf05674,
        });
      }
    }
  }

  let leftmostHero: HeroUnit | null = null;
  let backyardIntruder = false;
  for (let i = 0, hn = liveHeroes.length; i < hn; i++) {
    const h = liveHeroes[i]!;
    if (h.hp > 0 && !h.downedForCapture) {
      if (!leftmostHero || h.x < leftmostHero.x) leftmostHero = h;
      if (h.slotIndex < THRONE_SLOT_INDEX) backyardIntruder = true;
    }
  }
  const emergencyDefense = Boolean(
    backyardIntruder || (leftmostHero && leftmostHero.slotIndex <= THRONE_SLOT_INDEX + 2),
  );

  // Defenders combat AI
  for (let ui = 0, cun = combatUnits.length; ui < cun; ui++) {
    const unit = combatUnits[ui]!;
    if (unit.attackCooldown > 0) {
      unit.attackCooldown -= dt;
    }

    if (!leftmostHero) {
      if (unit.activity === 'fighting') unit.activity = 'idle';
      continue;
    }

    const assignedType = unit.assignedSlot !== null ? state.slots[unit.assignedSlot]?.type : 'corridor';
    const isSupportWorker =
      assignedType === 'training' ||
      assignedType === 'library' ||
      assignedType === 'workshop' ||
      assignedType === 'corruption';

    // Backyard guards (assignedSlot < THRONE_SLOT_INDEX) stay guarding backyard unless intruders enter backyard or emergency!
    const isBackyardGuard =
      unit.assignedSlot !== null &&
      unit.assignedSlot < THRONE_SLOT_INDEX &&
      (assignedType === 'treasury' || assignedType === 'corridor');

    // Find closest valid (non-stealthed, unless true_sight or fleeingWithLoot) hero
    let target: HeroUnit | null = null;
    let bestDist = Infinity;
    for (let hi = 0, hn = liveHeroes.length; hi < hn; hi++) {
      const h = liveHeroes[hi]!;
      if (h.hp <= 0 || h.downedForCapture || state.hand.heldHeroId === h.id) continue;
      if (h.stealthTimer > 0 && !unit.traits.includes('true_sight') && !h.fleeingWithLoot) continue;
      if (isBackyardGuard && h.slotIndex > THRONE_SLOT_INDEX + 1) continue;
      const dist = Math.abs(h.x - unit.x);
      if (dist < bestDist) {
        bestDist = dist;
        target = h;
      }
    }

    if (!target) {
      if (unit.activity === 'fighting') unit.activity = 'idle';
      continue;
    }

    if (isSupportWorker && !emergencyDefense && bestDist > unit.range + 48) {
      if (unit.activity === 'fighting') unit.activity = 'idle';
      continue;
    }

    unit.activity = 'fighting';
    unit.facing = target.x >= unit.x ? 1 : -1;

    if (bestDist > unit.range) {
      if (unit.attackCooldown < 0) unit.attackCooldown = 0;
      const speedMult = getUnitSpeedMultiplier(unit, state, mods);
      const step = unit.moveSpeed * speedMult * dt;
      unit.x += Math.sign(target.x - unit.x) * Math.min(step, bestDist - unit.range * 0.8);
      unit.slotIndex = xToSlotIndex(unit.x);
    } else if (unit.attackCooldown <= 0) {
      const actionMult = getUnitActionMultiplier(unit, state, mods, sisterCount);
      unit.attackCooldown = Math.max(
        0,
        unit.attackCooldown + 1 / Math.max(0.25, unit.attackSpeed * actionMult),
      );
      unit.attackAnimTimer = 0.28;

      let dmg = unit.atk;
      if (unit.corruptionMark === 'oathbreaker') {
        dmg *= 1.22;
      }
      if (unit.traits.includes('blood_frenzy') && unit.hp < unit.maxHp * 0.6) {
        dmg *= 1.25;
      }
      if (state.overlordId === 'seraphina' && (target.slowTimer > 0 || target.freezeTimer > 0)) {
        dmg *= 1 + BALANCE_CONFIG.seraphinaChillDamageBonus;
      }

      let critChance = 0.08 + mods.critChanceBonus;
      if (unit.happiness >= 80) critChance += 0.1;
      if (unit.slapBuffTimer > 0 && unit.traits.includes('masochist_delight')) {
        critChance += BALANCE_CONFIG.slapMasochistCritBonus;
      }
      const isCrit = rng.chance(critChance);
      if (isCrit) {
        dmg *= 1.65;
        if (state.overlordId === 'aurelia') {
          const bonusG = Math.max(2, Math.round(state.wave * 1.5));
          depositGold(state, bonusG);
        }
      }

      const strikes = unit.traits.includes('double_strike') && rng.chance(0.25) ? 2 : 1;
      const totalDmg = Math.round(dmg * strikes);

      const uDef = ABYSSAL_UNIT_DEFS[unit.species];
      if (uDef.attackStyle === 'melee') {
        pushVfx(state, { kind: 'slash', x: unit.x, targetX: target.x, isAlly: true, color: uDef.projectileColor });
      } else {
        pushVfx(state, { kind: 'projectile', x: unit.x, targetX: target.x, isAlly: true, color: uDef.projectileColor });
      }
      pushVfx(state, {
        kind: 'damage',
        x: target.x,
        value: totalDmg,
        isCrit,
        isAlly: true,
        color: isCrit ? 0xf2c655 : 0xfff0b3,
      });

      const isCleave =
        unit.species === 'necro_cantor' ||
        unit.species === 'obsidian_dragonmaid' ||
        unit.species === 'alchemist_belle' ||
        unit.species === 'eclipse_archmage' ||
        unit.species === 'dread_dragon_knight';

      if (isCleave) {
        for (let hi = 0, hn = liveHeroes.length; hi < hn; hi++) {
          const h = liveHeroes[hi]!;
          if (h.hp <= 0 || h.downedForCapture || Math.abs(h.x - target.x) > 85) continue;
          const splash = h.id === target.id ? totalDmg : Math.round(totalDmg * 0.58);
          h.hp -= splash;
          h.hurtAnimTimer = 0.2;
          unit.totalDamageDealt += splash;
          state.metrics.totalUnitDamage += splash;
          if (h.hp <= 0) {
            unit.kills += 1;
            if (unit.species === 'alchemist_belle') {
              const alkGold = Math.round(12 + state.wave * 3);
              depositGold(state, alkGold);
            }
            handleHeroDeath(state, h, rng, mods);
          }
        }
      } else {
        target.hp -= totalDmg;
        target.hurtAnimTimer = 0.2;
        unit.totalDamageDealt += totalDmg;
        state.metrics.totalUnitDamage += totalDmg;

        if (unit.species === 'slime_girl' || unit.traits.includes('frost_bite')) {
          target.slowTimer = Math.max(target.slowTimer, 2.2);
        }
        if (unit.species === 'arachne_weaver' || unit.species === 'medusa_archer') {
          target.slowTimer = Math.max(target.slowTimer, 2.5);
          target.poisonTimer = Math.max(target.poisonTimer, 4.0);
          target.poisonDps = Math.max(target.poisonDps, unit.atk * 0.35 * mods.poisonDamageMult);
        } else if (unit.species === 'crimson_succubus' && !target.isBoss && rng.chance(0.22)) {
          target.charmTimer = Math.max(target.charmTimer, 2.5);
          target.charmSource = 'unit';
        } else if (unit.species === 'shadow_phantom_thief') {
          const pickpocket = Math.max(3, Math.round(state.wave * 2.4));
          depositGold(state, pickpocket);
        }

        if (target.hp <= 0) {
          unit.kills += 1;
          handleHeroDeath(state, target, rng, mods);
        }
      }

      let lifesteal = mods.lifestealBonus + (unit.traits.includes('vampiric') ? 0.12 : 0);
      if (state.overlordId === 'lilith' && target.charmTimer > 0) {
        lifesteal += BALANCE_CONFIG.lilithCharmLifesteal;
      }
      if (lifesteal > 0 && unit.hp < unit.maxHp) {
        const heal = Math.round(totalDmg * lifesteal);
        unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      }
    }
  }

  // Overlord Throne defense when non-stealthed heroes approach Throne (Slot 5..7)
  if (state.overlordAttackCooldown > 0) {
    state.overlordAttackCooldown -= dt;
  }
  let throneTarget: HeroUnit | null = null;
  for (let hi = 0, hn = state.heroes.length; hi < hn; hi++) {
    const h = state.heroes[hi]!;
    if (!h.downedForCapture && h.hp > 0 && h.stealthTimer <= 0 && Math.abs(h.x - throneX) <= 210) {
      throneTarget = h;
      break;
    }
  }
  if (throneTarget && state.overlordAttackCooldown <= 0) {
    state.overlordAttackCooldown = Math.max(0, state.overlordAttackCooldown + 0.92);
    const dmg = state.overlordAtk;
    throneTarget.hp -= dmg;
    throneTarget.hurtAnimTimer = 0.25;
    if (state.overlordId === 'seraphina') {
      throneTarget.freezeTimer = Math.max(throneTarget.freezeTimer, throneTarget.isBoss ? 0.6 : 1.4);
    }
    state.metrics.totalOverlordDamage += dmg;
    pushVfx(state, { kind: 'projectile', x: throneX, targetX: throneTarget.x, isAlly: true, color: 0xf05674 });
    pushVfx(state, { kind: 'damage', x: throneTarget.x, value: dmg, isCrit: true, color: 0xf05674 });
    if (throneTarget.hp <= 0) {
      handleHeroDeath(state, throneTarget, rng, mods);
    }
  }

  // Heroes AI (including Backyard Treasury Heist!)
  const treasurySlot = findRoomSlotByType(state, 'treasury') ?? state.slots[BACKYARD_TREASURY_SLOT]!;
  const treasuryX = slotCenterX(treasurySlot.index);

  for (let hi = state.heroes.length - 1; hi >= 0; hi--) {
    const hero = state.heroes[hi]!;
    if (state.hand.heldHeroId === hero.id) continue;

    if (hero.downedForCapture) {
      if (!hero.beingHauledByImpId) {
        hero.downedTimer -= dt;
      }
      continue;
    }
    if (hero.hp <= 0) continue;

    if (hero.slowTimer > 0) hero.slowTimer = Math.max(0, hero.slowTimer - dt);
    if (hero.freezeTimer > 0) hero.freezeTimer = Math.max(0, hero.freezeTimer - dt);
    if (hero.charmTimer > 0) hero.charmTimer = Math.max(0, hero.charmTimer - dt);
    if (hero.stealthTimer > 0) hero.stealthTimer = Math.max(0, hero.stealthTimer - dt);
    if (hero.attackAnimTimer > 0) hero.attackAnimTimer = Math.max(0, hero.attackAnimTimer - dt);
    if (hero.hurtAnimTimer > 0) hero.hurtAnimTimer = Math.max(0, hero.hurtAnimTimer - dt);
    if (hero.attackCooldown > 0) hero.attackCooldown -= dt;

    if (hero.poisonTimer > 0) {
      hero.poisonTimer = Math.max(0, hero.poisonTimer - dt);
      const pdmg = hero.poisonDps * dt;
      hero.hp -= pdmg;
      state.metrics.totalUnitDamage += pdmg;
      if (hero.hp <= 0) {
        handleHeroDeath(state, hero, rng, mods);
        continue;
      }
    }

    if (hero.freezeTimer > 0) continue;

    const def = HERO_DEFS[hero.species];
    const seraphinaSlow = state.overlordId === 'seraphina' ? 1 - BALANCE_CONFIG.seraphinaGlobalSlowRatio : 1;
    const moveFactor = (hero.slowTimer > 0 ? 0.58 : 1.0) * seraphinaSlow;

    // Sapper Engineer disarms corridor trap charges!
    const currentSlot = state.slots[hero.slotIndex];
    if (def.disarmsTraps && currentSlot?.trap && currentSlot.trap.charges > 0 && hero.attackCooldown <= 0) {
      currentSlot.trap.charges = Math.max(0, currentSlot.trap.charges - 2);
      hero.attackCooldown = 2.4;
      hero.attackAnimTimer = 0.25;
      pushVfx(state, {
        kind: 'banter',
        x: hero.x,
        speakerId: hero.id,
        speakerName: locHeroName(hero),
        label: t('哼，这陷阱我拆了！', 'Hmph, trap disarmed!'),
        color: 0xf05674,
      });
    }

    // Charmed hero fights fellow heroes!
    if (hero.charmTimer > 0) {
      let fellow: HeroUnit | null = null;
      for (const other of state.heroes) {
        if (other.id !== hero.id && !other.downedForCapture && other.hp > 0) {
          fellow = other;
          break;
        }
      }
      if (fellow) {
        const dist = Math.abs(fellow.x - hero.x);
        if (dist <= hero.range + 20 && hero.attackCooldown <= 0) {
          hero.attackCooldown = 1 / hero.attackSpeed;
          hero.attackAnimTimer = 0.25;
          const charmDmg = Math.max(1, Math.round(hero.atk * 0.6));
          fellow.hp -= charmDmg;
          fellow.hurtAnimTimer = 0.2;
          pushVfx(state, { kind: 'damage', x: fellow.x, value: charmDmg, color: 0xff8ec8 });
          if (hero.charmSource === 'trap') state.metrics.totalTrapDamage += charmDmg;
          else if (hero.charmSource === 'unit') state.metrics.totalUnitDamage += charmDmg;
          else state.metrics.totalSpellDamage += charmDmg;
          if (fellow.hp <= 0) handleHeroDeath(state, fellow, rng, mods);
        } else if (dist > hero.range) {
          hero.x += Math.sign(fellow.x - hero.x) * hero.moveSpeed * 0.7 * dt;
          hero.slotIndex = xToSlotIndex(hero.x);
        }
        continue;
      }
    }

    // Holy Sister heals wounded allies
    if (def.healsAllies && hero.attackCooldown <= 0) {
      let wounded: HeroUnit | null = null;
      for (const other of state.heroes) {
        if (
          !other.downedForCapture &&
          other.hp > 0 &&
          other.hp < other.maxHp * 0.8 &&
          Math.abs(other.x - hero.x) <= hero.range
        ) {
          wounded = other;
          break;
        }
      }
      if (wounded) {
        hero.attackCooldown = 2.8;
        const healAmt = Math.min(Math.round(wounded.maxHp * 0.07), Math.round(hero.atk * 2.2));
        wounded.hp = Math.min(wounded.maxHp, wounded.hp + healAmt);
        pushVfx(state, { kind: 'heal', x: wounded.x, value: healAmt, color: 0x8ad8ff });
        continue;
      }
    }

    // ===== V2.0 BACKYARD TREASURY HEIST BEHAVIOR (Thief / Shadow Assassin) =====
    if (hero.isThief) {
      // Phase B: Fleeing right back to exit with stolen gold bag!
      if (hero.fleeingWithLoot) {
        hero.x += hero.moveSpeed * moveFactor * 1.15 * dt;
        hero.slotIndex = xToSlotIndex(hero.x);
        if (hero.x >= escapeEdgeX) {
          // Escaped with the stolen gold!
          pushEvent(state, {
            type: 'thief_heist',
            slotIndex: spawnSlotIdx,
            value: hero.stolenGold,
            text: t(
              `岂有此理！【${locHeroName(hero)}】竟敢揣着本王的 ${hero.stolenGold} 金币私房钱溜号！（下次直接左键拎她喂滚石！）`,
              `Outrageous! [${locHeroName(hero)}] bolted with ${hero.stolenGold}G of our dark gold! (Grab her into boulders next time!)`,
            ),
          });
          state.heroes.splice(hi, 1);
        }
        continue;
      }

      // Phase A: Sneak past frontline & Throne straight to Backyard Treasury (Slot 0)!
      if (Math.abs(hero.x - treasuryX) <= 32) {
        const steal = Math.min(
          Math.max(0, Math.floor(state.gold)),
          Math.max(25, Math.min(Math.round(state.gold * 0.14), 60 + hero.wave * 18)),
        );
        if (steal > 0) {
          state.gold -= steal;
          hero.stolenGold += steal;
          hero.fleeingWithLoot = true;
          hero.stealthTimer = 0; // Revealed while carrying heavy gold sack!
          pushEvent(state, {
            type: 'thief_heist',
            slotIndex: treasurySlot.index,
            value: steal,
            text: t(
              `警报！【${locHeroName(hero)}】潜入后院宝库偷走了 ${steal} 金币正往出口狂奔！左键可拎起她摔回前线！`,
              `ALERT! [${locHeroName(hero)}] stole ${steal}G from Backyard Treasury! Left-drag her back into traps!`,
            ),
          });
          pushVfx(state, {
            kind: 'thief_alert',
            x: treasuryX,
            speakerId: hero.id,
            speakerName: locHeroName(hero),
            value: steal,
            label: t(`抓贼啊！偷走 ${steal}G！`, `THIEF! Stole ${steal}G!`),
            color: 0xf05674,
          });
          continue;
        }
      }

      // While stealthed, sprint straight past defenders & Throne toward Backyard Treasury!
      if (hero.stealthTimer > 0) {
        hero.x = Math.max(treasuryX, hero.x - hero.moveSpeed * moveFactor * 1.12 * dt);
        hero.slotIndex = xToSlotIndex(hero.x);
        continue;
      }
    }

    // V2.4 Unified 12-Hero Prison Raid State Machine (before searching for combat blockers)
    if (hero.raid || tryClaimRaid(state, hero)) {
      if (stepRaid(state, hero, dt, moveFactor, escapeEdgeX, mods)) {
        continue;
      }
    }

    // Standard combat: Look for defender in range
    let targetUnit: AbyssalUnit | null = null;
    let bestDist = Infinity;
    for (let ui = 0, cun = combatUnits.length; ui < cun; ui++) {
      const u = combatUnits[ui]!;
      if (u.hp <= 0 || (u.recoveryTimer ?? 0) > 0) continue;
      const dist = Math.abs(u.x - hero.x);
      if (dist <= hero.range && dist < bestDist) {
        bestDist = dist;
        targetUnit = u;
      }
    }

    if (targetUnit) {
      if (hero.attackCooldown <= 0) {
        hero.attackCooldown = Math.max(0, hero.attackCooldown + 1 / hero.attackSpeed);
        hero.attackAnimTimer = 0.25;
        const dmgReduction = targetUnit.traits.includes('iron_wall') ? 0.8 : 1;
        const dmg = Math.max(1, Math.round(hero.atk * dmgReduction));
        targetUnit.hp = Math.max(0, targetUnit.hp - dmg);
        if (def.attackStyle === 'melee') {
          pushVfx(state, { kind: 'slash', x: hero.x, targetX: targetUnit.x, isAlly: false, color: 0x8ad8ff });
        } else {
          pushVfx(state, { kind: 'projectile', x: hero.x, targetX: targetUnit.x, isAlly: false, color: 0xffe985 });
        }
        pushVfx(state, { kind: 'damage', x: targetUnit.x, value: dmg, isAlly: false, color: 0xf05674 });

        if (targetUnit.hp <= 0) {
          // Non-lethal retreat to Backyard Hatchery
          targetUnit.hp = Math.max(1, Math.round(targetUnit.maxHp * 0.2));
          targetUnit.x = slotCenterX(BACKYARD_HATCHERY_SLOT);
          targetUnit.slotIndex = BACKYARD_HATCHERY_SLOT;
          targetUnit.activity = 'eating';
          targetUnit.recoveryTimer = 12;
        }
      }
      continue;
    }

    // Non-thief heroes march toward Throne (Slot 6) and attack the Overlord Heart!
    if (!hero.isThief && Math.abs(hero.x - throneX) <= 50) {
      if (hero.attackCooldown <= 0) {
        hero.attackCooldown = 1 / hero.attackSpeed;
        hero.attackAnimTimer = 0.25;
        state.overlordHp = Math.max(0, state.overlordHp - hero.atk);
        pushVfx(state, { kind: 'damage', x: throneX, value: hero.atk, isAlly: false, color: 0xf05674 });
      }
      continue;
    }

    // Advance toward target (Treasury for unstealthed thief, Throne for regular heroes)
    const goalX = hero.isThief ? treasuryX : throneX;
    const dir = Math.sign(goalX - hero.x) || -1;
    hero.x += dir * hero.moveSpeed * moveFactor * dt;
    hero.slotIndex = xToSlotIndex(hero.x);
  }

  // Cleanup dead/expired heroes
  for (let i = state.heroes.length - 1; i >= 0; i--) {
    const h = state.heroes[i]!;
    if (h.downedForCapture) {
      if (h.downedTimer <= 0 && !h.beingHauledByImpId) {
        state.heroes.splice(i, 1);
      }
    } else if (h.hp <= 0) {
      state.heroes.splice(i, 1);
    }
  }

  // Check Heart Shatter -> Safe Farm Mode fallback + shatterStreak backoff (2 -> 4 -> 8; autoRetryBoss untouched!)
  if (state.overlordHp <= 0) {
    const failedWave = state.wave;
    if (state.shatterStreak?.wave === failedWave) {
      state.shatterStreak.count += 1;
    } else {
      state.shatterStreak = { wave: failedWave, count: 1 };
    }
    for (const h of state.heroes) {
      releaseEscortedPrisoners(state, h.id);
    }
    state.metrics.heartShatterCount += 1;
    state.heartReviveTimer = BALANCE_CONFIG.heartReviveDurationSec;
    state.heroes = [];
    state.boulders = [];
    state.hand.heldHeroId = null;
    state.farmMode = true;
    state.farmWavesCleared = 0;
    state.wave = Math.max(1, state.wave - 1);
    state.waveTimer = 24;
    pushEvent(state, {
      type: 'heart_shattered',
      slotIndex: throneSlot.index,
      value: state.wave,
      text: t(
        `哼，这不叫战败，这叫「战略性撤退」！魔心重组中，先退回第 ${state.wave} 波喝茶养精蓄锐。`,
        `Hmph—not defeat, a STRATEGIC RETREAT! Reforming Heart and cruising on Wave ${state.wave}.`,
      ),
    });
    return;
  }

  // Check Wave Cleared!
  const remainingLive = state.heroes.filter((h) => !h.downedForCapture && h.hp > 0).length;
  if (remainingLive === 0 && state.waveTimer > BALANCE_CONFIG.waveIntervalSec - 86) {
    if (state.waveTimer === BALANCE_CONFIG.waveIntervalSec || state.waveTimer > 42) {
      const clearedWave = state.wave;
      if (state.capturesThisWave === 0) {
        state.wavesSinceCapture = (state.wavesSinceCapture ?? 0) + 1;
      }
      if (clearedWave > state.highestWaveCleared) {
        state.highestWaveCleared = clearedWave;
        state.shatterStreak = { wave: 0, count: 0 };
        // V2.5 Prestige wave expansion -> recalculate caps & auto-refill from Bullion immediately!
        recalcCapsAndOverlord(state);
        refillGoldAndEmitVfx(state);
        // Award guaranteed Relic on every 5th wave first clear!
        if (clearedWave % 5 === 0) {
          awardRandomRelic(state, rng, throneX);
        }
        evaluateProgression(state);
      }

      // V2.5 Vintage Aging & Cathedral 3-wave appeasement ransom / write-off
      settlePrisonWaveRansom(state);

      if (!state.farmMode) {
        state.wave += 1;
        state.farmWavesCleared = 0;
      } else if (state.autoRetryBoss) {
        state.farmWavesCleared += 1;
        const streakCount = state.shatterStreak?.count ?? 0;
        const requiredFarmWaves = streakCount >= 3 ? 8 : streakCount === 2 ? 4 : 2;
        if (state.farmWavesCleared >= requiredFarmWaves) {
          state.farmMode = false;
          state.farmWavesCleared = 0;
          state.wave = state.highestWaveCleared + 1;
        }
      }

      state.waveTimer = 42;
      pushEvent(state, {
        type: 'wave_cleared',
        value: clearedWave,
        text: t(
          `第 ${clearedWave} 波圣堂冤大头全灭！战利品铺满走廊，小鬼速去收租！`,
          `Wave ${clearedWave} trespassers wiped out! Imps, sweep up their gold!`,
        ),
      });
    }
  }
}
