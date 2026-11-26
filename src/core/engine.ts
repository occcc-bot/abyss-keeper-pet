import { ROOM_DEFS, SPELL_DEFS, TRAP_DEFS } from './data/roomsAndTraps';
import { TORTURE_IMPLEMENTS, TUTORIAL_STEPS } from './data/tortureAndTech';
import { ABYSSAL_UNIT_DEFS, BASE_RECRUITABLE_SPECIES } from './data/units';
import { locMark, locUnitName, t } from './i18n';
import {
  advanceTutorialIfMatch,
  createAbyssalUnit,
  createInitialGameState,
  findRoomSlotByType,
  getMaxCombatUnits,
  getThroneSlot,
  pushEvent,
  pushVfx,
  recalcCapsAndOverlord,
  recalcUnitStats,
  refillGoldAndEmitVfx,
  slotCenterX,
} from './ecs/stateFactory';
import {
  BALANCE_CONFIG,
  computeGlobalModifiers,
  depositGold,
  impSummonManaCost,
  overlordUpgradeCost,
  recruitCostForTier,
  roomUpgradeCost,
  spellUpgradeCost,
  type RelicModifiers,
} from './formulas';
import {
  castSpell,
  dropUnit,
  grabDownedHero,
  grabThiefHero,
  grabUnit,
  markRockForMining,
  pressurizeTortureChamber,
  slapChicken,
  slapHero,
  slapUnit,
  type SlapResult,
} from './hand/handOfEvil';
import { SeededRng } from './rng';
import {
  previewWaveRoster,
  spawnWave,
  stepCombatAndWaveSystem,
  type RolledWaveRoster,
} from './systems/combatAndWaveSystem';
import {
  assignUnitToAltarSlot,
  clearAltarSlots,
  executeAltarFusion,
  feedPrisonerChicken,
  overchargeTorture,
  previewAltarFusion,
  stepCorruptionSystem,
  tauntPrisonerChicken,
  transferPrisonerCell,
  type FusionPreview,
} from './systems/corruptionAndFusionSystem';
import { stepEcosystemSystem, tryStepIdleSecond } from './systems/ecosystemSystem';
import { ensurePrisonLock } from './systems/prisonSystem';
import { revealUnitQuirk } from './systems/quirkSystem';
import {
  buyAbyssTech,
  buyPrestigeTalent,
  exportSaveBase64,
  importSaveBase64,
  settleOfflineProgress,
  triggerPrestige,
  unlockOverlordWithShards,
  type PrestigeTalentKey,
} from './systems/offlineAndPrestigeSystem';
import {
  createInitialProgression,
  getRoomBuildCost,
  isFeatureUnlocked,
  isRoomUnlocked,
  isSlotUnlocked,
  isSpellUnlocked,
  isTrapUnlocked,
  markStorySeen,
} from './systems/progressionSystem';
import {
  SIM_DT,
  SIM_TPS,
  THRONE_SLOT_INDEX,
  type AbyssalSpeciesId,
  type AbyssalUnit,
  type BuildableRoomType,
  type CorruptionMarkId,
  type FeatureId,
  type GameState,
  type OfflineSettlementReport,
  type OverlordId,
  type SpellId,
  type StoryId,
  type TechId,
  type TortureImplementId,
  type TrapType,
  type VisualVfxEvent,
} from './types';

export class DungeonEngine {
  public state: GameState;
  public readonly rng: SeededRng;
  private cachedModsKey = '';
  private cachedMods: RelicModifiers | null = null;

  constructor(options?: {
    seed?: number;
    overlordId?: OverlordId;
    initialState?: GameState;
    progression?: 'gated' | 'sandbox';
  }) {
    const isSandbox = options?.progression === 'sandbox';
    if (options?.initialState) {
      this.state = structuredClone(options.initialState);
      if (isSandbox) {
        this.state.progression = createInitialProgression(this.state.prestige, true);
      } else if (!this.state.progression) {
        this.state.progression = createInitialProgression(this.state.prestige, false);
      }
      this.rng = new SeededRng(this.state.seed);
      this.rng.setState(this.state.rngState);
      recalcCapsAndOverlord(this.state);
    } else {
      const seed = options?.seed ?? 1337;
      const overlordId = options?.overlordId ?? 'lilith';
      this.state = createInitialGameState(seed, overlordId, undefined, isSandbox);
      this.rng = new SeededRng(seed);
      this.rng.setState(this.state.rngState);
    }
  }

  // ===== Progression & Story Helpers =====

  isFeatureUnlocked(feature: FeatureId): boolean {
    return isFeatureUnlocked(this.state, feature);
  }

  isSlotUnlocked(slotIndex: number): boolean {
    return isSlotUnlocked(this.state, slotIndex);
  }

  isSpellUnlocked(spellId: SpellId): boolean {
    return isSpellUnlocked(this.state, spellId);
  }

  isRoomUnlocked(roomType: BuildableRoomType): boolean {
    return isRoomUnlocked(this.state, roomType);
  }

  isTrapUnlocked(trapType: TrapType): boolean {
    return isTrapUnlocked(this.state, trapType);
  }

  getRoomBuildCost(roomType: BuildableRoomType): number {
    return getRoomBuildCost(this.state, roomType);
  }

  markStorySeen(storyId: StoryId): void {
    markStorySeen(this.state, storyId);
  }

  public getMods(): RelicModifiers {
    const p = this.state.prestige;
    let layoutSig = '';
    for (let i = 0; i < this.state.slots.length; i++) {
      const sl = this.state.slots[i]!;
      layoutSig += `${sl.type}:${sl.trap?.type ?? ''}|`;
    }
    const key = `${this.state.relics.length}:${p.codexUnits.length}:${p.codexHeroes.length}:${p.unlockedRelicCodex.length}:${p.codexImplements.length}:${Object.values(p.techLevels).join(',')}:${layoutSig}`;
    if (!this.cachedMods || this.cachedModsKey !== key) {
      this.cachedMods = computeGlobalModifiers(this.state);
      this.cachedModsKey = key;
    }
    return this.cachedMods;
  }

  stepTick(): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += SIM_DT;
    const mods = this.getMods();

    stepEcosystemSystem(this.state, this.rng, mods, SIM_DT);
    stepCorruptionSystem(this.state, mods, SIM_DT, this.rng);
    stepCombatAndWaveSystem(this.state, this.rng, mods, SIM_DT);

    this.state.rngState = this.rng.getState();
  }

  private stepBatchTicks(tickCount: number): void {
    this.state.tick += tickCount;
    const dt = SIM_DT * tickCount;
    this.state.elapsedSeconds += dt;
    const mods = this.getMods();

    stepEcosystemSystem(this.state, this.rng, mods, dt);
    stepCorruptionSystem(this.state, mods, dt, this.rng);
    stepCombatAndWaveSystem(this.state, this.rng, mods, dt);
  }

  stepSeconds(seconds: number): void {
    let ticks = Math.max(0, Math.round(seconds * SIM_TPS));
    while (ticks > 0) {
      if (ticks >= 20 && tryStepIdleSecond(this.state, this.getMods())) {
        ticks -= 20;
        continue;
      }
      if (ticks >= 4) {
        this.stepBatchTicks(4);
        ticks -= 4;
        continue;
      }
      this.stepTick();
      ticks -= 1;
    }
    this.state.rngState = this.rng.getState();
  }

  drainVfxQueue(): VisualVfxEvent[] {
    if (this.state.vfxQueue.length === 0) return [];
    return this.state.vfxQueue.splice(0, this.state.vfxQueue.length);
  }

  // ===== Hand of Evil Actions =====

  grabUnit(unitId: string): boolean {
    return grabUnit(this.state, unitId);
  }

  grabThiefHero(heroId: string): boolean {
    return grabThiefHero(this.state, heroId);
  }

  grabDownedHero(heroId: string): boolean {
    return grabDownedHero(this.state, heroId);
  }

  dropUnit(slotIndex: number): boolean {
    return dropUnit(this.state, slotIndex);
  }

  slapUnit(unitId: string): SlapResult {
    return slapUnit(this.state, unitId, this.rng);
  }

  slapHero(heroId: string): boolean {
    return slapHero(this.state, heroId);
  }

  // ===== V2.4 Prison, ECG Torture, Quirk & Wave Prep Controls =====

  setNoMercyMode(enabled: boolean): void {
    this.state.noMercyMode = Boolean(enabled);
  }

  feedPrisonerChicken(prisonerId: string): { ok: boolean; reason?: string; healAmt?: number; drowsy?: boolean } {
    return feedPrisonerChicken(this.state, prisonerId);
  }

  tauntPrisonerChicken(prisonerId: string): { ok: boolean; reason?: string; vegetarian?: boolean } {
    return tauntPrisonerChicken(this.state, prisonerId);
  }

  overchargeTorture(): { ok: boolean; reason?: string; isCrit?: boolean; manaCost?: number } {
    return overchargeTorture(this.state);
  }

  transferPrisonerCell(prisonerId: string, targetCell: 'prison' | 'chamber'): boolean {
    return transferPrisonerCell(this.state, prisonerId, targetCell);
  }

  revealQuirk(unitId: string): boolean {
    return revealUnitQuirk(this.state, unitId);
  }

  previewNextWave(): RolledWaveRoster {
    return previewWaveRoster(this.state);
  }

  extendPrep(seconds = 30): boolean {
    const liveHeroes = this.state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);
    if (liveHeroes.length > 0 || this.state.heartReviveTimer > 0) return false;
    const used = this.state.prepExtendedSec ?? 0;
    const remain = Math.max(0, 90 - used);
    if (remain <= 0) return false;
    const add = Math.min(remain, Math.max(1, seconds));
    this.state.waveTimer += add;
    this.state.prepExtendedSec = used + add;
    return true;
  }

  slapChicken(slotIndex: number): boolean {
    return slapChicken(this.state, slotIndex);
  }

  pressurizeTortureChamber(slotIndex: number): { ok: boolean; quote: string; implementId: string } {
    return pressurizeTortureChamber(this.state, slotIndex, this.rng);
  }

  markRockForMining(slotIndex: number): boolean {
    return markRockForMining(this.state, slotIndex);
  }

  castSpell(spellId: SpellId, isAuto = false): boolean {
    return castSpell(this.state, spellId, isAuto);
  }

  // ===== Overlord Explicit Leveling & Spells =====

  upgradeOverlord(): boolean {
    if (this.state.overlordLevel >= BALANCE_CONFIG.overlordMaxLevel) return false;
    const cost = overlordUpgradeCost(this.state.overlordLevel);
    if (this.state.gold < cost) return false;
    this.state.gold -= cost;
    refillGoldAndEmitVfx(this.state);
    this.state.overlordLevel += 1;
    recalcCapsAndOverlord(this.state);
    this.state.overlordHp = this.state.overlordMaxHp;
    for (const u of this.state.units) {
      recalcUnitStats(this.state, u);
    }
    advanceTutorialIfMatch(this.state, 4);
    pushVfx(this.state, {
      kind: 'level_up',
      x: slotCenterX(THRONE_SLOT_INDEX),
      label: t(
        `魔王 Lv.${this.state.overlordLevel}！全军攻击+4%`,
        `Overlord Lv.${this.state.overlordLevel}! Army ATK +4%`,
      ),
      color: 0xf2c655,
    });
    pushEvent(this.state, {
      type: 'overlord_upgraded',
      slotIndex: THRONE_SLOT_INDEX,
      value: this.state.overlordLevel,
      text: t(
        `魔王晋升至 Lv.${this.state.overlordLevel}！魔心强化且全军攻击光环提升！`,
        `Overlord ascended to Lv.${this.state.overlordLevel}! Heart & Army Aura boosted!`,
      ),
    });
    return true;
  }

  upgradeSpell(spellId: SpellId): boolean {
    if (!isSpellUnlocked(this.state, spellId)) return false;
    const def = SPELL_DEFS[spellId];
    const lv = this.state.spellLevels[spellId] ?? 1;
    if (lv >= 20) return false;
    const cost = spellUpgradeCost(def.baseUpgradeGold, lv);
    if (this.state.gold < cost) return false;
    this.state.gold -= cost;
    refillGoldAndEmitVfx(this.state);
    this.state.spellLevels[spellId] = lv + 1;
    return true;
  }

  // ===== Torture Chamber Equippable Gag Implements =====

  unlockTortureImplement(id: TortureImplementId): boolean {
    if (this.state.unlockedImplements.includes(id)) return true;
    const def = TORTURE_IMPLEMENTS[id];
    if (this.state.gold < def.unlockCostGold) return false;
    this.state.gold -= def.unlockCostGold;
    refillGoldAndEmitVfx(this.state);
    this.state.unlockedImplements.push(id);
    if (!this.state.prestige.codexImplements.includes(id)) {
      this.state.prestige.codexImplements.push(id);
    }
    this.state.equippedImplement = id;
    return true;
  }

  equipTortureImplement(id: TortureImplementId): boolean {
    if (!this.state.unlockedImplements.includes(id)) return false;
    this.state.equippedImplement = id;
    return true;
  }

  // ===== Guided 7-Step Tutorial =====

  completeTutorialStep(step: number): boolean {
    return advanceTutorialIfMatch(this.state, step);
  }

  dismissTutorial(): void {
    this.state.tutorialDismissed = true;
    this.state.tutorialStep = TUTORIAL_STEPS.length;
  }

  // ===== Construction & Economy Actions =====

  buildRoom(slotIndex: number, type: BuildableRoomType): boolean {
    if (!isRoomUnlocked(this.state, type)) return false;
    const slot = this.state.slots[slotIndex];
    if (!slot || slot.type === 'throne' || slot.type === 'rock_vein') return false;
    if (slot.type === type) return false;
    // V2.4 Invariant I4: at most 1 Abyssal Prison in the entire dungeon!
    if (type === 'prison' && this.state.slots.some((s) => s.type === 'prison')) {
      return false;
    }
    const def = ROOM_DEFS[type];
    const cost = getRoomBuildCost(this.state, type);
    if (this.state.gold < cost) return false;

    this.state.gold -= cost;
    if (type === 'prison' && this.state.progression?.firstBuildDiscount) {
      this.state.progression.firstBuildDiscount.prison = false;
    } else if (type === 'corruption' && this.state.progression?.firstBuildDiscount) {
      this.state.progression.firstBuildDiscount.corruption = false;
    } else if (type === 'altar' && this.state.progression?.firstBuildDiscount) {
      this.state.progression.firstBuildDiscount.altar = false;
    }
    slot.type = type;
    slot.level = 1;
    slot.chickens = type === 'hatchery' ? 3 : 0;
    if (!def.allowsTrap) {
      slot.trap = null;
    }
    if (type === 'prison') {
      ensurePrisonLock(this.state);
    }
    recalcCapsAndOverlord(this.state);
    refillGoldAndEmitVfx(this.state);
    if (type === 'corruption') {
      advanceTutorialIfMatch(this.state, 6);
    }
    return true;
  }

  upgradeRoom(slotIndex: number): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || slot.type === 'rock_vein') return false;
    const def = ROOM_DEFS[slot.type];
    const cost = roomUpgradeCost(def.baseUpgradeCost, slot.level);
    if (this.state.gold < cost) return false;

    this.state.gold -= cost;
    slot.level += 1;
    recalcCapsAndOverlord(this.state);
    refillGoldAndEmitVfx(this.state);
    return true;
  }

  upgradeRoomBatch(slotIndex: number, count = 5): number {
    let upgraded = 0;
    for (let i = 0; i < count; i++) {
      if (!this.upgradeRoom(slotIndex)) break;
      upgraded += 1;
    }
    return upgraded;
  }

  setUnitCorruptionMark(
    unitId: string,
    mark: CorruptionMarkId,
  ): { ok: boolean; costMana: number; reason?: string } {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit || unit.tier !== 3) {
      return {
        ok: false,
        costMana: 0,
        reason: t('仅三阶收编王牌可切换堕落刻印', 'Only Tier 3 converted aces can switch Corruption Marks'),
      };
    }
    if (unit.corruptionMark === mark) {
      return { ok: false, costMana: 0, reason: t('已装配该刻印', 'This Mark is already active') };
    }
    const costMana = unit.markChangedOnce ? 35 : 0;
    if (costMana > 0 && this.state.mana < costMana) {
      return {
        ok: false,
        costMana,
        reason: t(`魔力不足（需 ${costMana} 魔力）`, `Not enough Mana (needs ${costMana} Mana)`),
      };
    }
    if (costMana > 0) this.state.mana -= costMana;
    unit.corruptionMark = mark;
    unit.markChangedOnce = true;
    pushEvent(this.state, {
      type: 'mark_changed',
      unitId: unit.id,
      species: mark,
      value: costMana,
      text: t(
        `【${locUnitName(unit)}】切换堕落刻印为【${locMark(mark).name}】！`,
        `[${locUnitName(unit)}] switched Corruption Mark to [${locMark(mark).name}]!`,
      ),
    });
    return { ok: true, costMana };
  }

  assignUnitSemanticCommand(
    unitId: string,
    cmd: 'frontline' | 'backyard' | 'hatchery' | 'specialty',
  ): { ok: boolean; slotIndex?: number } {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit) return { ok: false };
    const def = ABYSSAL_UNIT_DEFS[unit.species];
    let targetSlot: number | undefined;
    if (cmd === 'frontline') {
      targetSlot =
        this.state.slots.find((s) => s.index > THRONE_SLOT_INDEX && s.type === 'corridor')?.index ??
        THRONE_SLOT_INDEX + 2;
    } else if (cmd === 'backyard') {
      targetSlot =
        this.state.slots.find((s) => s.index < THRONE_SLOT_INDEX && (s.type === 'treasury' || s.type === 'corridor'))?.index ??
        0;
    } else if (cmd === 'hatchery') {
      targetSlot = findRoomSlotByType(this.state, 'hatchery')?.index ?? 1;
    } else {
      targetSlot =
        findRoomSlotByType(this.state, def.preferredRoom)?.index ??
        this.state.slots.find((s) => s.index > THRONE_SLOT_INDEX && s.type === 'corridor')?.index ??
        THRONE_SLOT_INDEX + 1;
    }
    if (targetSlot === undefined) return { ok: false };
    const ok = this.assignUnitToSlot(unit.id, targetSlot);
    return { ok, slotIndex: ok ? targetSlot : undefined };
  }

  installTrap(slotIndex: number, trapType: TrapType): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || !ROOM_DEFS[slot.type].allowsTrap) return false;
    const def = TRAP_DEFS[trapType];

    if (slot.trap && slot.trap.type === trapType) {
      const upgradeGold = Math.round(def.buildCostGold * Math.pow(1.4, slot.trap.level));
      const upgradeParts = Math.round(def.buildCostParts * Math.pow(1.25, slot.trap.level));
      if (this.state.gold < upgradeGold || this.state.trapParts < upgradeParts) return false;
      this.state.gold -= upgradeGold;
      this.state.trapParts -= upgradeParts;
      refillGoldAndEmitVfx(this.state);
      slot.trap.level += 1;
      slot.trap.maxCharges += 1;
      slot.trap.charges = slot.trap.maxCharges;
      return true;
    }

    if (!isTrapUnlocked(this.state, trapType)) return false;
    if (this.state.gold < def.buildCostGold || this.state.trapParts < def.buildCostParts) {
      return false;
    }
    this.state.gold -= def.buildCostGold;
    this.state.trapParts -= def.buildCostParts;
    refillGoldAndEmitVfx(this.state);
    slot.trap = {
      type: trapType,
      level: 1,
      charges: def.maxCharges,
      maxCharges: def.maxCharges,
      cooldownTimer: 0,
      totalDamageDealt: 0,
      triggersCount: 0,
    };
    advanceTutorialIfMatch(this.state, 5);
    return true;
  }

  summonImp(): AbyssalUnit | null {
    const imps = this.state.units.filter((u) => u.species === 'imp');
    if (imps.length >= 8) return null;
    const cost = impSummonManaCost(imps.length);
    if (this.state.mana < cost) return null;
    this.state.mana -= cost;
    const throne = getThroneSlot(this.state);
    const imp = createAbyssalUnit(this.state, 'imp', throne.index, { assignedSlot: null });
    this.state.units.push(imp);
    return imp;
  }

  recruitUnit(species: AbyssalSpeciesId): AbyssalUnit | null {
    if (!BASE_RECRUITABLE_SPECIES.includes(species)) return null;
    const combatUnits = this.state.units.filter((u) => u.species !== 'imp');
    const maxCombatUnits = getMaxCombatUnits(this.state);
    if (combatUnits.length >= maxCombatUnits) return null;

    const def = ABYSSAL_UNIT_DEFS[species];
    const cost = recruitCostForTier(def.tier, combatUnits.length);
    if (this.state.gold < cost) return null;

    this.state.gold -= cost;
    refillGoldAndEmitVfx(this.state);
    const prefSlot =
      findRoomSlotByType(this.state, def.preferredRoom)?.index ??
      this.state.slots.find((s) => s.type === 'corridor' && s.index > THRONE_SLOT_INDEX)?.index ??
      THRONE_SLOT_INDEX + 2;
    const traits = [...def.innateTraits];
    const rareRank = this.state.prestige.techLevels?.rare_trait_boost ?? this.state.prestige.talents.rareTraitBoost;
    if (rareRank > 0 && traits.length < 3) {
      const chance = Math.min(0.85, rareRank * 0.17);
      if (this.rng.chance(chance)) {
        const bonusPool = (
          ['vampiric', 'double_strike', 'blood_frenzy', 'arcane_surge', 'iron_wall', 'corruptor', 'swift_foot', 'true_sight'] as const
        ).filter((t) => !traits.includes(t));
        if (bonusPool.length > 0) {
          traits.push(this.rng.pick(bonusPool));
        }
      }
    }
    const unit = createAbyssalUnit(this.state, species, prefSlot, {
      assignedSlot: prefSlot,
      traits,
    });
    this.state.units.push(unit);
    return unit;
  }

  assignUnitToSlot(unitId: string, slotIndex: number): boolean {
    const unit = this.state.units.find((u) => u.id === unitId);
    const slot = this.state.slots[slotIndex];
    if (!unit || !slot || slot.type === 'rock_vein') return false;
    if (unit.species === 'imp') {
      unit.assignedSlot = null;
      return true;
    }
    unit.assignedSlot = slotIndex;
    if (slot.type === 'altar') {
      assignUnitToAltarSlot(this.state, unit.id);
    }
    return true;
  }

  toggleUnitLock(unitId: string): boolean {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit) return false;
    unit.locked = !unit.locked;
    return unit.locked;
  }

  // ===== Altar Fusion =====

  assignToAltar(unitId: string): boolean {
    return assignUnitToAltarSlot(this.state, unitId);
  }

  clearAltar(): void {
    clearAltarSlots(this.state);
  }

  previewFusion(unitAId: string, unitBId: string): FusionPreview {
    return previewAltarFusion(this.state, unitAId, unitBId);
  }

  fuseUnits(unitAId: string, unitBId: string): AbyssalUnit | null {
    return executeAltarFusion(this.state, unitAId, unitBId, this.rng);
  }

  // ===== Wave Control & Overlords =====

  provokeNextWave(options?: { eager?: boolean }): boolean {
    if (this.state.heartReviveTimer > 0) return false;
    const liveHeroes = this.state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);
    if (liveHeroes.length > 0) return false;
    if (options?.eager && this.state.waveTimer > 1) {
      const bounty = Math.round(Math.min(this.state.waveTimer, 40) * (0.5 + 0.08 * this.state.wave));
      if (bounty > 0) {
        depositGold(this.state, bounty);
        pushVfx(this.state, {
          kind: 'heal',
          x: slotCenterX(THRONE_SLOT_INDEX),
          value: bounty,
          label: t(`迎客赏金 +${bounty}G`, `Eager Bounty +${bounty}G`),
          color: 0xf2c655,
        });
      }
    }
    if (this.state.farmMode) {
      this.state.farmMode = false;
      this.state.wave = Math.max(this.state.wave, this.state.highestWaveCleared + 1);
    }
    spawnWave(this.state, this.rng);
    return true;
  }

  setFarmMode(enabled: boolean): void {
    this.state.farmMode = enabled;
    if (!enabled && this.state.highestWaveCleared >= this.state.wave) {
      this.state.wave = this.state.highestWaveCleared + 1;
    }
  }

  unlockOverlord(overlordId: OverlordId): boolean {
    return unlockOverlordWithShards(this.state, overlordId);
  }

  setOverlord(overlordId: OverlordId): boolean {
    if (!this.state.prestige.unlockedOverlords.includes(overlordId)) return false;
    this.state.overlordId = overlordId;
    recalcCapsAndOverlord(this.state);
    for (const u of this.state.units) {
      recalcUnitStats(this.state, u);
    }
    return true;
  }

  // ===== Offline, Tech Tree, Prestige & Persistence =====

  settleOffline(elapsedSeconds: number): OfflineSettlementReport {
    return settleOfflineProgress(this.state, elapsedSeconds);
  }

  buyTech(techId: TechId): boolean {
    const ok = buyAbyssTech(this.state, techId);
    if (ok) {
      this.cachedModsKey = '';
      for (const u of this.state.units) recalcUnitStats(this.state, u);
    }
    return ok;
  }

  buyPrestigeTalent(key: PrestigeTalentKey): boolean {
    const ok = buyPrestigeTalent(this.state, key);
    if (ok) {
      this.cachedModsKey = '';
      for (const u of this.state.units) recalcUnitStats(this.state, u);
    }
    return ok;
  }

  triggerPrestige(nextOverlordId?: OverlordId): boolean {
    const nextState = triggerPrestige(this.state, nextOverlordId);
    if (!nextState) return false;
    this.state = nextState;
    this.rng.setState(this.state.rngState);
    this.cachedModsKey = '';
    return true;
  }

  exportSave(): string {
    this.state.lastSaveTimestampMs = Date.now();
    return exportSaveBase64(this.state);
  }

  importSave(encoded: string): void {
    const loaded = importSaveBase64(encoded);
    this.state = loaded;
    this.rng.setState(this.state.rngState);
    this.cachedModsKey = '';
    recalcCapsAndOverlord(this.state);
  }
}
