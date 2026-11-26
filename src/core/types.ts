export const SIM_TPS = 20;
export const SIM_DT = 1 / SIM_TPS;
export const SAVE_VERSION = 6;
export const TOTAL_SLOTS = 28; // Slots 0..5 Backyard | Slot 6 Throne | Slots 7..27 Frontline & Deep Ore Frontier
export const THRONE_SLOT_INDEX = 6;
export const BACKYARD_TREASURY_SLOT = 0;
export const BACKYARD_HATCHERY_SLOT = 1;
export const SLOT_WIDTH = 160; // Logical horizontal units per slot (28 * 160 = 4480)
export const DUNGEON_WIDTH = TOTAL_SLOTS * SLOT_WIDTH;

export type OverlordId = 'lilith' | 'elizabeth' | 'seraphina' | 'aurelia';

export type AbyssalSpeciesId =
  | 'imp'
  // Tier 1 Basic Recruits (7)
  | 'slime_girl'
  | 'skeleton_blademaid'
  | 'imp_witch'
  | 'hellforge_smith'
  | 'bat_scout'
  | 'gargoyle_warden'
  | 'medusa_archer'
  // Tier 2 Fusion Elites (6)
  | 'crimson_succubus'
  | 'necro_cantor'
  | 'obsidian_dragonmaid'
  | 'arachne_weaver'
  | 'phantom_dancer'
  | 'alchemist_belle'
  // Tier 3 Corrupted Captives (6)
  | 'fallen_paladin'
  | 'corrupted_sister'
  | 'abyssal_ranger'
  | 'shadow_phantom_thief'
  | 'eclipse_archmage'
  | 'dread_dragon_knight';

export type HeroSpeciesId =
  | 'novice_adventurer'
  | 'dwarf_gold_thief'
  | 'holy_sister'
  | 'elf_sharpshooter'
  | 'holy_knight'
  | 'crimson_assassin'
  | 'sapper_engineer'
  | 'shield_vanguard'
  | 'sun_archmage'
  | 'dragon_general'
  | 'valkyrie_captain'
  | 'lord_inquisitor';

export type CapturableHeroId =
  | 'holy_knight'
  | 'holy_sister'
  | 'elf_sharpshooter'
  | 'dwarf_gold_thief'
  | 'sun_archmage'
  | 'dragon_general';

export type CorruptedTargetId =
  | 'fallen_paladin'
  | 'corrupted_sister'
  | 'abyssal_ranger'
  | 'shadow_phantom_thief'
  | 'eclipse_archmage'
  | 'dread_dragon_knight';

export type UnitTier = 0 | 1 | 2 | 3; // 0 = Imp worker, 1 = Base, 2 = Fusion, 3 = Corrupted Hero

export type PersonalityId =
  | 'tsundere'
  | 'masochist'
  | 'energetic'
  | 'sadistic'
  | 'stoic'
  | 'greedy';

export type TraitId =
  | 'vampiric'
  | 'double_strike'
  | 'trap_master'
  | 'greedy_hauler'
  | 'masochist_delight'
  | 'arcane_surge'
  | 'iron_wall'
  | 'corruptor'
  | 'blood_frenzy'
  | 'swift_foot'
  | 'true_sight'
  | 'frost_bite';

export type CorruptionMarkId = 'oathbreaker' | 'night_collar' | 'true_hound';

export type RoomResonanceId =
  | 'dark_inquisition_rite'
  | 'arcane_throne_corridor'
  | 'demon_boot_canteen'
  | 'forge_kill_array'
  | 'iron_transfer_ward'
  | 'aroma_temptation'
  | 'night_school_cell'
  | 'gilded_cell_window';

export type TrapSynergyId = 'shatter_frost_lane' | 'phantom_labyrinth';

export type RoomType =
  | 'throne'
  | 'treasury'
  | 'hatchery'
  | 'training'
  | 'library'
  | 'workshop'
  | 'corruption'
  | 'prison'
  | 'altar'
  | 'corridor'
  | 'rock_vein';

export type OreTier = 'dark_gold' | 'mithril' | 'blood_diamond';

export type BuildableRoomType = Exclude<RoomType, 'throne' | 'rock_vein'>;

export type TrapType =
  | 'iron_spikes'
  | 'boulder_trap'
  | 'charm_censer'
  | 'frost_rune'
  | 'hell_spring';

export type SpellId = 'abyss_lightning' | 'demon_frenzy' | 'charm_mist' | 'abyss_blackhole';

export type TortureImplementId =
  | 'electric_chair'
  | 'feather_tickler'
  | 'brainwash_gramophone'
  | 'hell_dessert_table'
  | 'truth_spotlight';

export type TechId =
  | 'abyssal_might'
  | 'golden_greed'
  | 'arcane_well'
  | 'trap_engineering'
  | 'torture_mastery'
  | 'overlord_crown'
  | 'deep_excavation'
  | 'offline_chronicle'
  | 'auto_slap_aura'
  | 'rare_trait_boost';

export type RelicId =
  | 'bullfrog_pocket_watch'
  | 'succubus_lace_blindfold'
  | 'unbreakable_spike_gear'
  | 'abyssal_gold_chalice'
  | 'obsidian_slap_glove'
  | 'roast_chicken_bell'
  | 'blood_moon_pendant'
  | 'thorn_crown_shard'
  | 'imp_overtime_whip'
  | 'boulder_grease_barrel'
  | 'frost_core_prism'
  | 'spring_coil_blueprint'
  | 'forbidden_grimoire_page'
  | 'corrupted_rosary'
  | 'dragonscale_pauldron'
  | 'arachne_venom_vial'
  | 'altar_resonance_stone'
  | 'greedy_goblin_coin'
  | 'mana_siphon_crystal'
  | 'shadow_whetstone'
  | 'dungeon_heart_aegis'
  | 'payday_tax_ledger'
  | 'crimson_velvet_choker'
  | 'soul_shackle_chain'
  | 'hellforge_bellows'
  | 'eclipse_hourglass'
  | 'vampiric_fang_brooch'
  | 'skeleton_metronome'
  | 'emerald_slime_gel'
  | 'overlord_signet_ring';

export type ImpTaskType =
  | 'idle'
  | 'repair_heart'
  | 'repair_trap'
  | 'haul_captive'
  | 'dig_rock'
  | 'mine_frontier'
  | 'haul_gold'
  | 'reinforce_wall';

export type UnitActivity =
  | 'idle'
  | 'moving'
  | 'working'
  | 'fighting'
  | 'eating'
  | 'dangling'
  | 'altar_bound'
  | 'payday'
  | 'whim';

export type QuirkId =
  | 'masochist'
  | 'sadist'
  | 'food_critic'
  | 'mad_tinkerer'
  | 'chronic_slacker'
  | 'ocd_hoarder'
  | 'narcissist'
  | 'pedantic_bookworm'
  | 'dungeon_gossip'
  | 'neat_freak'
  | 'pyromaniac'
  | 'stockholm_heart'
  | 'chuunibyou'
  | 'night_owl';

export interface WhimState {
  quirk: QuirkId;
  phase: 'go' | 'act' | 'return';
  targetX: number;
  targetSlot: number;
  t: number;
  maxT: number;
}

export type RaidArchetype =
  | 'flee_report'
  | 'charge'
  | 'chant'
  | 'snipe'
  | 'pick'
  | 'extract_one'
  | 'blast'
  | 'sled'
  | 'melt'
  | 'airlift'
  | 'purge'
  | 'excommunicate';

export type RaidPhase = 'approach' | 'breach' | 'resolve' | 'escort' | 'stunned' | 'abort';

export interface RaidState {
  archetype: RaidArchetype;
  phase: RaidPhase;
  prisonSlot: number;
  timer: number;
  targetPrisonerIds: string[];
  pickedHalfway?: boolean;
  shotsFired?: number;
  stunnedTimer?: number;
  isBackyard?: boolean;
}

export type PrisonerStance = 'resist' | 'waver' | 'broken' | 'dessert';

export type GrudgeTag = TortureImplementId | 'dessert' | 'none';

export interface NemesisEntry {
  id: string;
  sourceHero: CapturableHeroId;
  targetSpecies: CorruptedTargetId;
  heroName: string;
  will: number;
  maxWill: number;
  waveEscaped: number;
  grudgeTag: GrudgeTag;
  /** V2.5 Carry over Cathedral vintage waves on escape so re-jailing cannot farm extra ransom */
  vintageWaves?: number;
}

export interface PrisonLockState {
  hp: number;
  max: number;
}

export type ChronicleKey =
  | 'raids'
  | 'escapes'
  | 'twinSuites'
  | 'slimeMopped'
  | 'conversions'
  | 'thievesCaught'
  | 'nemesisReturns'
  | 'perfectFinishes'
  | 'obituaries'
  | 'quirksRevealed'
  | 'cpMoments'
  | 'chickensFed';

export interface ShatterStreak {
  wave: number;
  count: number;
}

export interface TrapInstance {
  type: TrapType;
  level: number;
  charges: number;
  maxCharges: number;
  cooldownTimer: number;
  totalDamageDealt: number;
  triggersCount: number;
}

export interface RoomSlot {
  index: number;
  type: RoomType;
  level: number;
  rockHp: number;
  rockMaxHp: number;
  rockGoldYield: number;
  oreTier: OreTier;
  /** True on slots 26..27: endless regenerating deep mining frontier so Imps always visibly mine & haul! */
  isInfiniteFrontier?: boolean;
  /** Rare buried relic chest discovered when rock is excavated */
  hasRelicChest?: boolean;
  markedForDig: boolean;
  wallIntegrity: number;
  chickens: number;
  chickenSpawnTimer: number;
  looseGold: number;
  trap: TrapInstance | null;
}

export interface AbyssalUnit {
  id: string;
  species: AbyssalSpeciesId;
  name: string;
  tier: UnitTier;
  level: number;
  xp: number;
  star: number;
  hp: number;
  maxHp: number;
  atk: number;
  attackCooldown: number;
  attackSpeed: number;
  moveSpeed: number;
  range: number;
  x: number;
  slotIndex: number;
  assignedSlot: number | null;
  satiety: number;
  happiness: number;
  slapBuffTimer: number;
  slapReactTimer: number;
  frenzyBuffTimer: number;
  recoveryTimer: number;
  /** Visual attack lunge timer (seconds) so chibi sprite visibly lunges/swings! */
  attackAnimTimer: number;
  /** Visual chicken eating timer (seconds) for pounce & chew animation! */
  eatAnimTimer: number;
  /** Facing direction: 1 = right, -1 = left */
  facing: 1 | -1;
  activity: UnitActivity;
  impTask: ImpTaskType;
  impTargetSlot: number | null;
  carryingGold: number;
  carryingCaptiveId: string | null;
  traits: TraitId[];
  /** V2.1 Corrupted Mark specialization (Oathbreaker / Night Collar / True Hound), freely switchable */
  corruptionMark?: CorruptionMarkId;
  /** True after the first free mark change; subsequent changes cost 35 Mana */
  markChangedOnce?: boolean;
  personality: PersonalityId;
  locked: boolean;
  kills: number;
  totalDamageDealt: number;
  /** V2.4 Witnessed quirk flag (quirk itself is deterministically derived from hash32(seed, id)) */
  quirkSeen?: boolean;
  /** V2.4 Transient sim whim state (stripped on export, cleared on load) */
  whim?: WhimState;
  /** V2.4 Per-unit whim cooldown (seconds) */
  whimCooldown?: number;
}

export interface HeroUnit {
  id: string;
  species: HeroSpeciesId;
  name: string;
  wave: number;
  isBoss: boolean;
  isElite: boolean;
  isThief: boolean;
  hp: number;
  maxHp: number;
  atk: number;
  attackCooldown: number;
  attackSpeed: number;
  moveSpeed: number;
  range: number;
  x: number;
  slotIndex: number;
  goldDrop: number;
  stolenGold: number;
  /** True once a thief steals gold from Backyard Treasury and sprints back toward the right exit */
  fleeingWithLoot: boolean;
  /** Active stealth cloak allowing thief/assassin to slip past frontline & Throne unless revealed */
  stealthTimer: number;
  /** Visual attack/hurt animation timers */
  attackAnimTimer: number;
  hurtAnimTimer: number;
  slowTimer: number;
  freezeTimer: number;
  charmTimer: number;
  charmSource?: 'trap' | 'spell' | 'unit';
  poisonTimer: number;
  poisonDps: number;
  downedForCapture: boolean;
  downedTimer: number;
  beingHauledByImpId: string | null;
  /** V2.4 Transient prison raid state (cleared on load, escorted prisoners returned to prison) */
  raid?: RaidState;
  /** V2.4 Returning nemesis metadata */
  isNemesisReturn?: boolean;
  nemesisGrudgeTag?: GrudgeTag;
  nemesisWill?: number;
  nemesisMaxWill?: number;
  nemesisVintageWaves?: number;
  /** V2.4 Extra reinforcement flag from escaped Novice scout */
  isReinforcement?: boolean;
  /** V2.4 Valkyrie purge red warning flag */
  valkyrieWarnActive?: boolean;
  /** V2.4 One-shot flag so backyard prison thief gag fires at most once per hero */
  backyardGagDone?: boolean;
}

export interface PrisonerRecord {
  id: string;
  sourceHero: CapturableHeroId;
  targetSpecies: CorruptedTargetId;
  heroName: string;
  waveCaptured: number;
  will: number;
  maxWill: number;
  progress: number;
  /** V2.5 Dual-track ECG HP (0..100). Unified 100 on all captures & migrated saves */
  hp: number;
  /** V2.4 Location: 'prison' (holding cell) or 'chamber' (active torture chair) */
  cell: 'prison' | 'chamber';
  /** V2.4 Safeword mercy pause flag (set at HP < 25, cleared when HP >= 90) */
  mercy: boolean;
  /** V2.4 Hooked on Hell Dessert Table (progress >= 30% -> 100% refuses prison escape!) */
  dessertHooked: boolean;
  /** V2.4 One-time flavor will-reduction bitmask */
  flavorHits: number;
  /** V2.4 Per-prisoner chicken feeding / taunt cooldown (seconds) */
  feedCd: number;
  /** V2.5 Holy Ward [0,1]: 1.0 on capture/twin suite, 0.5 on nemesis knock, 0 on migrated v5 saves */
  ward: number;
  /** V2.5 Roast chicken satiety [0,120], decays -0.5/s */
  satiety: number;
  /** V2.5 Food-coma drowsy timer (seconds, triggered when satiety > 100, pauses will & hp drain) */
  drowsyTimer: number;
  /** V2.5 Engine-level Overcharge torture burst timer (seconds, 5s) */
  overchargeTimer: number;
  /** V2.5 Latched Opportune Overcharge crit flag (x6 burst, zero extra HP damage) */
  overchargeCrit: boolean;
  /** V2.5 Waves survived in Prison cell for Cathedral ransom (max 3 -> Cathedral write-off!) */
  vintageWaves: number;
  /** V2.5 Cathedral treasury wrote off this captive -> +1 bonus rare trait & 100 happiness on convert */
  abandonedByCathedral?: boolean;
  /** V2.4 Last torture implement used (for nemesis grudgeTag) */
  lastImplement?: TortureImplementId;
  /** V2.4 Electric Chair extreme-mode 50%/80% deterministic 3s hard-hold pause */
  hardHoldTimer?: number;
  hardHoldStage?: number;
  /** V2.4 Valkyrie betrayal vow -> converts with oathbreaker mark + 100 happiness */
  oathbreakerVow?: boolean;
  /** V2.4 Recaptured nemesis -> +1 Star on conversion */
  isNemesisReturn?: boolean;
  /** V2.4 Transient escort hero id (cleared on load) */
  escortedByHeroId?: string | null;
}

export interface RollingBoulder {
  id: string;
  x: number;
  speed: number;
  damage: number;
  knockback: number;
  hitHeroIds: string[];
  sourceSlot: number;
}

export interface AltarState {
  slotAUnitId: string | null;
  slotBUnitId: string | null;
}

export type FeatureId =
  | 'spell_frenzy'
  | 'spell_charm'
  | 'spell_blackhole'
  | 'trap_frost'
  | 'trap_charm'
  | 'trap_spring'
  | 'room_prison'
  | 'room_corruption'
  | 'room_altar'
  | 'tab_relics'
  | 'tab_prestige';

export type StoryId =
  | 'prologue_desk'
  | 'unlock_torture'
  | 'unlock_altar'
  | 'boss_valkyrie_w5'
  | 'chapter1_clear_w10'
  | 'first_ace_converted'
  | 'unlock_prestige_w50';

export interface ProgressionState {
  sandbox: boolean;
  territoryMax: number;
  unlocked: FeatureId[];
  firstBuildDiscount: {
    prison: boolean;
    corruption: boolean;
    altar: boolean;
  };
  pendingUnlockPulse: string[];
}

export interface PrestigeState {
  epoch: number;
  abyssalShards: number;
  totalShardsEarned: number;
  overlordConstellation: number;
  corruptedSoulMarks: Partial<Record<AbyssalSpeciesId, number>>;
  unlockedRelicCodex: RelicId[];
  unlockedOverlords: OverlordId[];
  codexUnits: AbyssalSpeciesId[];
  codexHeroes: HeroSpeciesId[];
  codexImplements: TortureImplementId[];
  /** V2.3 Cross-epoch seen story archive (persists across Prestige!) */
  storySeen: StoryId[];
  /** V2.4 Witnessed quirks codex */
  codexQuirks: QuirkId[];
  /** V2.4 Discovered hero torture weaknesses codex */
  codexWeakness: CapturableHeroId[];
  /** V2.4 First obituary badge unlocked */
  obituaryBadgeUnlocked?: boolean;
  /** Legacy compatibility mirror + full 10-node V2 Abyssal Tech Tree */
  talents: {
    extraStartingSlot: number;
    autoSlapAura: number;
    rareTraitBoost: number;
    abyssalMight: number;
  };
  techLevels: Record<TechId, number>;
}

export interface HandState {
  heldUnitId: string | null;
  heldHeroId: string | null;
  pointerX: number;
  pointerY: number;
  slapCooldown: number;
}

export interface SimMetrics {
  totalGoldEarned: number;
  totalManaEarned: number;
  totalHeroesDefeated: number;
  totalSlaps: number;
  totalCaptivesConverted: number;
  totalFusions: number;
  totalTrapsTriggered: number;
  totalTrapDamage: number;
  totalUnitDamage: number;
  totalSpellDamage: number;
  totalOverlordDamage: number;
  totalThievesCaught: number;
  heartShatterCount: number;
  bankruptPaydays: number;
  peakWaveReached: number;
  prisonersDied?: number;
  raidsStarted?: number;
  prisonersEscaped?: number;
  twinSuitesTriggered?: number;
  perfectFinishes?: number;
}

export interface VisualVfxEvent {
  kind:
    | 'slash'
    | 'projectile'
    | 'damage'
    | 'heal'
    | 'chicken_feast'
    | 'relic_banner'
    | 'thief_alert'
    | 'torture_gag'
    | 'banter'
    | 'level_up'
    | 'mine_spark'
    | 'spell_fx'
    | 'cutin'
    | 'boulder_streak'
    | 'quirk_reveal'
    | 'cp'
    | 'raid_alert'
    | 'valkyrie_warn'
    | 'excommunicate_banner'
    | 'perfect_finish'
    | 'obituary_banner'
    | 'weakness_found';
  x: number;
  targetX?: number;
  value?: number;
  isCrit?: boolean;
  isAlly?: boolean;
  color?: number;
  label?: string;
  subId?: string;
  speakerId?: string;
  speakerName?: string;
}

export interface DungeonEvent {
  tick: number;
  type:
    | 'unit_slapped'
    | 'unit_grabbed'
    | 'unit_dropped'
    | 'rock_mined'
    | 'gold_delivered'
    | 'chicken_eaten'
    | 'chicken_scattered'
    | 'trap_triggered'
    | 'boulder_launched'
    | 'hero_captured'
    | 'corruption_complete'
    | 'fusion_complete'
    | 'payday_bell'
    | 'wave_started'
    | 'wave_cleared'
    | 'heart_shattered'
    | 'relic_dropped'
    | 'spell_cast'
    | 'prestige_triggered'
    | 'offline_settled'
    | 'overlord_upgraded'
    | 'thief_heist'
    | 'thief_caught'
    | 'torture_gag'
    | 'captive_dropped'
    | 'mark_changed'
    | 'feature_unlocked'
    | 'story_trigger'
    | 'prison_raid'
    | 'prisoner_escaped'
    | 'twin_suite'
    | 'prisoner_died'
    | 'perfect_finish'
    | 'weakness_found'
    | 'quirk_revealed'
    | 'excommunicate'
    | 'nemesis_return'
    | 'ransom_paid'
    | 'cathedral_abandon';
  slotIndex?: number;
  unitId?: string;
  species?: string;
  value?: number;
  text?: string;
  storyId?: StoryId;
  heroSpecies?: HeroSpeciesId;
  features?: FeatureId[];
}

export interface OfflineSettlementReport {
  elapsedSeconds: number;
  effectiveSeconds: number;
  farmWave: number;
  goldGained: number;
  bullionGained?: number;
  manaGained: number;
  trapPartsGained: number;
  xpPerUnit: number;
  prisonersConverted: number;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  entitySeq: number;
  tick: number;
  elapsedSeconds: number;
  overlordId: OverlordId;
  overlordLevel: number;
  overlordHp: number;
  overlordMaxHp: number;
  overlordAtk: number;
  overlordAttackCooldown: number;
  heartReviveTimer: number;

  gold: number;
  goldCap: number;
  /** V2.5 Dark-Gold Bullion Vault (exponential saturation overflow reserve, 1:1 auto-refill) */
  bullion: number;
  bullionCap: number;
  mana: number;
  manaCap: number;
  trapParts: number;
  trapPartsCap: number;
  /** V2.5 Engine-level Overcharge torture cooldown (45s) */
  overchargeCd: number;
  /** V2.5 Dedicated right-click torture chamber slap cooldown (4.0s) */
  chamberSlapCd: number;
  /** V2.5 Transient throttle for bullion refill floating VFX */
  bullionRefillVfxCd?: number;
  /** V2.5 Transient timer for dragon-hoard boast bubble when bullion >= 80% */
  bullionBragTimer?: number;

  wave: number;
  highestWaveCleared: number;
  farmMode: boolean;
  farmWavesCleared: number;
  autoRetryBoss: boolean;
  autoCastSpells: boolean;
  waveTimer: number;
  paydayTimer: number;
  capturedThisWave?: boolean;
  /** V2.4 Capture counter per wave (replaces boolean capturedThisWave) */
  capturesThisWave: number;
  /** V2.4 Consecutive waves without a capture (pity >= 4 -> guaranteed capture) */
  wavesSinceCapture: number;
  /** V2.4 Raids claimed this wave (Invariant I4: <= 1) */
  raidsThisWave: number;
  /** V2.4 Prison lock integrity (refills on spawnWave) */
  prisonLock?: PrisonLockState;
  /** V2.4 Escaped prisoners waiting to return as nemesis or lost knock (max 3) */
  nemesisPool: NemesisEntry[];
  /** V2.4 Extra reinforcement heroes from escaped novice scout (max 2) */
  pendingReinforcements: number;
  /** V2.4 Monotonic wave spawn sequence for 100% accurate silhouette preview */
  waveSpawnSeq: number;
  /** V2.4 Extreme Voltage torture mode (transient: stripped on export, forced false on load & offline) */
  noMercyMode: boolean;
  /** V2.4 Martyr's Bounty double hero gold waves remaining (max 1, non-stacking) */
  martyrBountyWaves: number;
  /** V2.4 Senior Ghost Tutor timer (seconds, 600s, +15% corruption speed, refreshes only) */
  ghostTutorTimer: number;
  /** V2.4 Consecutive heart shatters on same wave -> backoff 2 -> 4 -> 8 farm waves */
  shatterStreak: ShatterStreak;
  /** V2.4 Integer event counters for The Abyss Gazette (purely observational) */
  chronicle: Partial<Record<ChronicleKey, number>>;
  /** V2.4 Per-wave prep extension tracker (max 90s) */
  prepExtendedSec?: number;
  /** V2.4 Global whim & CP cooldowns (seconds) */
  globalWhimCooldown?: number;
  globalCpCooldown?: number;
  cpPairCooldowns?: Record<string, number>;

  spellCooldowns: Record<SpellId, number>;
  spellLevels: Record<SpellId, number>;

  equippedImplement: TortureImplementId;
  unlockedImplements: TortureImplementId[];

  tutorialStep: number; // 0..6 active steps, 7 = complete
  tutorialDismissed: boolean;
  cutinMuted?: boolean;
  banterTimer: number;
  tortureGagTimer: number;

  slots: RoomSlot[];
  units: AbyssalUnit[];
  heroes: HeroUnit[];
  prisoners: PrisonerRecord[];
  boulders: RollingBoulder[];
  relics: RelicId[];
  altar: AltarState;
  hand: HandState;
  prestige: PrestigeState;
  progression: ProgressionState;
  metrics: SimMetrics;
  recentEvents: DungeonEvent[];
  vfxQueue: VisualVfxEvent[];
  lastSaveTimestampMs: number;
}
