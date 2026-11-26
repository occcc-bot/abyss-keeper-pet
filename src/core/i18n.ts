import type {
  AbyssalSpeciesId,
  AbyssalUnit,
  CapturableHeroId,
  CorruptionMarkId,
  HeroSpeciesId,
  HeroUnit,
  OverlordId,
  RelicId,
  RoomResonanceId,
  RoomType,
  SpellId,
  StoryId,
  TechId,
  TortureImplementId,
  TraitId,
  TrapSynergyId,
  TrapType,
} from './types';
import { RELIC_MAP } from './data/relics';
import { ROOM_DEFS, SPELL_DEFS, TRAP_DEFS } from './data/roomsAndTraps';
import {
  CORRUPTION_MARKS,
  ROOM_RESONANCE_DEFS,
  TRAP_SYNERGY_DEFS,
  getTortureStageIndex,
  getTortureStageLine,
} from './data/synergyAndMarks';
import {
  ABYSS_TECH_TREE,
  IDLE_BANTER_LINES,
  TORTURE_IMPLEMENTS,
  TUTORIAL_STEPS,
} from './data/tortureAndTech';
import { ABYSSAL_UNIT_DEFS, HERO_DEFS, OVERLORD_DEFS, getChapterName } from './data/units';

export type Locale = 'zh' | 'en';

const LOCALE_STORAGE_KEY = 'abyss_keeper_pet_locale';
let currentLocale: Locale = 'zh';

export function initLocale(): Locale {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('lang');
    if (q === 'en' || q === 'zh') {
      currentLocale = q;
      applyDocumentLocale();
      return currentLocale;
    }
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'zh') {
        currentLocale = saved;
      }
    } catch {
      // Ignore storage restrictions
    }
    applyDocumentLocale();
  }
  return currentLocale;
}

function applyDocumentLocale(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = currentLocale === 'en' ? 'en' : 'zh-CN';
  document.title =
    currentLocale === 'en'
      ? 'Abyss Keeper Pet — Desktop Overlord Dungeon'
      : '深渊饲主：桌底魔王城 | Abyss Keeper Pet';
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage errors
    }
    applyDocumentLocale();
  }
}

export function toggleLocale(): Locale {
  const next: Locale = currentLocale === 'zh' ? 'en' : 'zh';
  setLocale(next);
  return next;
}

export function t(zh: string, en: string): string {
  return currentLocale === 'en' ? en : zh;
}

// ===== English Data Dictionaries =====

const EN_OVERLORDS: Record<
  OverlordId,
  { name: string; title: string; passiveTitle: string; passiveDesc: string; quote: string }
> = {
  lilith: {
    name: 'Lilith',
    title: 'Bloodmoon Succubus Queen',
    passiveTitle: 'Bloodmoon Allure',
    passiveDesc: 'Torture corruption speed +35%, hero capture chance +3.5%, allies gain +20% lifesteal vs Charmed foes.',
    quote: '"The pride of righteous heroines sounds sweetest right as it shatters~"',
  },
  elizabeth: {
    name: 'Elizabeth',
    title: 'Crimson Thorn Necromancer',
    passiveTitle: 'Thorn Contraptions',
    passiveDesc: 'Corridor trap damage +40%; fallen foes bloom blood thorns healing all allies for 8% Max HP.',
    quote: '"Let boulders and iron spikes compose a funeral march for these uninvited guests."',
  },
  seraphina: {
    name: 'Seraphina',
    title: 'Rime Dragon Empress',
    passiveTitle: 'Permafrost Shatter Domain',
    passiveDesc: 'All invaders move 18% slower; allies deal +40% damage to Slowed/Frozen foes and Throne attacks Freeze.',
    quote: '"Freeze their fleeting moments and turn this corridor into an eternal ice gallery."',
  },
  aurelia: {
    name: 'Aurelia',
    title: 'Gilded Alchemy Archwitch',
    passiveTitle: 'Transmutation Circle',
    passiveDesc: 'Global Gold & ore yield +45%, Workshop parts +40%, critical strikes shower bonus alchemical Gold.',
    quote: '"Heroes aren\'t enemies—they\'re walking vaults delivering gold straight to my door~"',
  },
};

const EN_UNITS: Record<
  AbyssalSpeciesId,
  { name: string; title: string; description: string; slapLines: [string, string, string] }
> = {
  imp: {
    name: 'Toiling Imp',
    title: 'All-Purpose Abyssal Drudge',
    description: 'Swings a pickaxe at deep ore veins, hauls gold to the Backyard Treasury, drags captives to jail, and repairs traps & Heart.',
    slapLines: [
      'Eek! Digging right now! Please don\'t dock my bonus!',
      'Ow! Double-time hauling for the Boss!',
      'Ack! Racing to patch the traps!',
    ],
  },
  slime_girl: {
    name: 'Emerald Ooze Warden',
    title: 'Bouncy Jade Bulwark',
    description: 'High-HP resilient frontliner whose emerald splashes heavily slow invading heroes.',
    slapLines: [
      'Boing~ Master\'s slap feels so springy♥',
      'Kyaa… squished flat, yet somehow delighted!',
      'Gel shield at full power—pat me again!',
    ],
  },
  skeleton_blademaid: {
    name: 'Skeletal Blademaid',
    title: 'Gale Dual-Blade Duelist',
    description: 'Rapid-strike melee core who gains +35% faster XP when drilling in the Shadow Training Room.',
    slapLines: [
      'Clack! Stop smacking me, dummy Overlord!',
      'Hmph… I\'m NOT swinging faster just because you slapped me!',
      'A mere slap? Watch me dice those heroes!',
    ],
  },
  imp_witch: {
    name: 'Grimoire Apprentice',
    title: 'Forbidden Tome Scholar',
    description: 'Library regular firing ranged shadow bolts to support the frontline while brewing Abyssal Mana.',
    slapLines: [
      'Eek! My hat went crooked! Full mana output!',
      'Hehe, that smack sparked brilliant inspiration!',
      'Shadow bolt barrage—engaged!',
    ],
  },
  hellforge_smith: {
    name: 'Hellforge Artificer',
    title: 'Anvil Hammer Crafter',
    description: 'Workshop specialist shattering armor with heavy blows and doubling trap part forging.',
    slapLines: [
      'Clang! The furnace is hot—double parts incoming!',
      'Solid slap, though my hammer hits harder.',
      'Boulders and spikes restocking right now!',
    ],
  },
  bat_scout: {
    name: 'Crimson Wing Scout',
    title: 'Anti-Stealth Thief Hunter',
    description: 'Sonar True-Sight reveals stealthed Treasury Thieves and Assassins—ideal for guarding the Backyard!',
    slapLines: [
      'Scree! Sonar wide open—no thief escapes!',
      'Max speed engaged! Time to claim thief bounties!',
      'Slap any harder and my wings will lift off!',
    ],
  },
  gargoyle_warden: {
    name: 'Obsidian Gargoyle',
    title: 'Backyard Vault Sentinel',
    description: 'Heavily armored Treasury guardian who pierces stealth and knocks vault intruders flying.',
    slapLines: [
      'Thud! Want a broken palm? Keep your muddy boots off my freshly mopped obsidian!',
      'Touch one coin and I\'ll mortar you straight into the vault wall!',
      'Hmph—this obsidian shield exists solely to flatten Cathedral trespassers!',
    ],
  },
  medusa_archer: {
    name: 'Serpent Gaze Archer',
    title: 'Venomous Petrify Sniper',
    description: 'Long-range sharpshooter whose arrows inflict petrifying slow and lingering poison.',
    slapLines: [
      'Hiss… touch my curls again and turn to stone~',
      'Fine, fine—triple venom volley coming right up!',
      'Watching them stiffen from afar is pure art.',
    ],
  },
  crimson_succubus: {
    name: 'Crimson Succubus Steward',
    title: 'Velvet Night Inquisitor',
    description: 'Tier 2 Fusion elite whose crimson whip charms foes; stationed in the Torture Chamber, she vastly accelerates corruption.',
    slapLines: [
      'Oh my, laying hands on me personally? How naughty♥',
      'I\'ll pass this fiery sting tenfold to the saintess on the chair~',
      'Fufu, interrogation efficiency maxed!',
    ],
  },
  necro_cantor: {
    name: 'Soulfire Cantor',
    title: 'Azure Requiem Songstress',
    description: 'Tier 2 arcane carry unleashing wide azure soulfire blasts while amplifying Library Mana.',
    slapLines: [
      'Mmm… even a frostbound soul warms to that touch.',
      'Requiem tempo increased. The harvest begins.',
      'Azure flame shall swallow the entire corridor.',
    ],
  },
  obsidian_dragonmaid: {
    name: 'Obsidian Dragon-Guard',
    title: 'Dragonscale Vanguard',
    description: 'Tier 2 ultimate heavy frontliner cleaving with a greatsword; grows fiercer as HP drops.',
    slapLines: [
      'You dare strike a dragon\'s reverse scale?! …Just this once!',
      'Hmph, for the Overlord\'s sake, I\'ll cleave them in earnest!',
      'Obsidian dragonfire—crush the frontline!',
    ],
  },
  arachne_weaver: {
    name: 'Silk-Web Enchantress',
    title: 'Mistress of Venomous Threads',
    description: 'Tier 2 controller slowing & corroding foes with venomous webs while boosting Workshop parts.',
    slapLines: [
      'Teehee, Master\'s hand got tangled in my silk too~',
      'The trap lane is woven tight—none shall flee!',
      'Time for a duet of gears and venom!',
    ],
  },
  phantom_dancer: {
    name: 'Phantom Blade Dancer',
    title: 'Moonlit Shadow Assassin',
    description: 'Tier 2 hyper-speed duelist with True-Sight and relentless crits—shreds archers, mages, and thieves.',
    slapLines: [
      'Hey! You threw off my footwork!',
      'Watch closely—this blade dance ends in three seconds!',
      'Stealth? Laughable before moonlit steel.',
    ],
  },
  alchemist_belle: {
    name: 'Magma Alchemist',
    title: 'Explosive Gold Brewer',
    description: 'Hurls volatile magma flasks that distill extra Gold on kills and accelerate Workshop output!',
    slapLines: [
      'Whoa! Almost dropped a high-yield flask!',
      'Pay me more and I\'ll toss tenfold payload bombs!',
      'Kaboom—pure glittering profit!',
    ],
  },
  fallen_paladin: {
    name: 'Fallen Paladin',
    title: 'Oathbreaker Shadow Valkyrie',
    description: 'Tier 3 apex champion corrupted from the Holy Knight—uniting immense toughness, lifesteal, and frenzied slashes!',
    slapLines: [
      'The Light has faded… Master\'s discipline is my true creed♥',
      'At your command—my dark blade shall shatter my former order!',
      'It stings… yet my heart feels fuller than ever!',
    ],
  },
  corrupted_sister: {
    name: 'Corrupted Sister',
    title: 'Abyssal Choir Confessor',
    description: 'Tier 3 premier support converted from the Holy Sister—grants dungeon-wide healing and haste auras.',
    slapLines: [
      'Amen… no, praise be to our Overlord\'s grace~',
      'Allow me to officiate my sisters\' dark baptism!',
      'Dark prayer answered—strike down the invaders!',
    ],
  },
  abyssal_ranger: {
    name: 'Abyssal Ranger',
    title: 'Cloudpiercer Shadow Sniper',
    description: 'Tier 3 ultra-range nuke archer converted from the Elf Sharpshooter—rapid twin shadow arrows snipe everything.',
    slapLines: [
      'D-don\'t think converting me means you can smack me whenever!',
      'Twin shadow volley locked—straight through the heart!',
      'Hmph, the Cathedral never understood true freedom!',
    ],
  },
  shadow_phantom_thief: {
    name: 'Sworn Phantom Thief',
    title: 'Royal Anti-Pickpocket Ace',
    description: 'Properly "reformed" into pure villainy by the Electric Chair—now she strips righteous heroes clean and shreds rival vault burglars!',
    slapLines: [
      'Easy, Boss! I already handed over the Cathedral vault codes!',
      'Thief meets thief—watch how a pro strips them clean!',
      'Hehe, slashing coins loose feels way better on your payroll~',
    ],
  },
  eclipse_archmage: {
    name: 'Eclipse Archmage',
    title: 'Dark-Sun Meteor Savant',
    description: 'Tier 3 devastation caster converted from the Sun Archmage—rains eclipse meteors and multiplies Library Mana!',
    slapLines: [
      'Heh… think one slap tames an Archmage? …Fine, I\'ll indulge you.',
      'The sun is dead. Behold the Eclipse Meteor!',
      'Abyssal currents are far more intoxicating than solar fire.',
    ],
  },
  dread_dragon_knight: {
    name: 'Dread Dragon General',
    title: 'Crimson Lance Warlord',
    description: 'Tier 3 supreme commander converted from the Imperial Dragon General—sweeps the whole frontline with crimson lance thrusts!',
    slapLines: [
      'A commanding palm. Worthy of my sworn fealty!',
      'Dread lance advancing—leave no invader standing!',
      'The old Empire is a hollow husk. The Abyss is my banner.',
    ],
  },
};

const EN_HEROES: Record<HeroSpeciesId, { name: string; roleTag: string }> = {
  novice_adventurer: { name: 'Novice Swordswoman', roleTag: 'SWD' },
  dwarf_gold_thief: { name: 'Shadow Vault Thief', roleTag: 'THF' },
  holy_sister: { name: 'Choir Holy Sister', roleTag: 'HLR' },
  elf_sharpshooter: { name: 'Elven Sharpshooter', roleTag: 'ARC' },
  holy_knight: { name: 'Holy Knight', roleTag: 'KNT' },
  crimson_assassin: { name: 'Crimson Stealth Assassin', roleTag: 'ASN' },
  sapper_engineer: { name: 'Cathedral Sapper', roleTag: 'ENG' },
  shield_vanguard: { name: 'Royal Shield Vanguard', roleTag: 'SHD' },
  sun_archmage: { name: 'Sunfire Archmage', roleTag: 'MAG' },
  dragon_general: { name: 'Dragon Lancer General', roleTag: 'DRG' },
  valkyrie_captain: { name: 'Valkyrie Wing Captain', roleTag: 'BOSS' },
  lord_inquisitor: { name: 'Celestial Grand Inquisitor', roleTag: 'EMP' },
};

const EN_ROOMS: Record<RoomType, { name: string; shortName: string; description: string }> = {
  throne: {
    name: 'Overlord Throne',
    shortName: 'Throne',
    description: 'Central seat of your Overlord. Backyard Vault & sanctums lie left; the kill corridor lies right. Click to upgrade Overlord & Spells!',
  },
  treasury: {
    name: 'Backyard Treasury',
    shortName: 'Treasury',
    description: 'Vault hidden behind the Throne. Upgrades raise Gold cap & Abyssal interest. Beware stealthy thieves sneaking past the frontline!',
  },
  hatchery: {
    name: 'Clucking Hatchery',
    shortName: 'Hatchery',
    description: 'Breeds plump roast chickens. Hungry or wounded retainers feast here to restore 35% HP immediately.',
  },
  training: {
    name: 'Shadow Training Room',
    shortName: 'Training',
    description: 'Stationed retainers drill for steady XP every second. Right-click Slap triggers 30s frantic power-leveling!',
  },
  library: {
    name: 'Forbidden Library',
    shortName: 'Library',
    description: 'Arcane retainers study forbidden tomes to generate Abyssal Mana for Miracles, Fusion, and Torture.',
  },
  workshop: {
    name: 'Hellforge Workshop',
    shortName: 'Workshop',
    description: 'Forges trap parts to auto-reload corridor traps; overflow parts are minted into Gold.',
  },
  corruption: {
    name: 'Succubus Torture Chamber',
    shortName: 'Torture',
    description: 'Holds captured elite heroines on electric chairs & gag implements—shatter their Holy Will to recruit Tier 3 aces!',
  },
  prison: {
    name: 'Abyssal Prison',
    shortName: 'Prison',
    description: 'Limit 1 per dungeon! Backyard = 100% safe holding ward; Frontline = live bait cage luring jailbreakers into traps & Twin Suite betrayals!',
  },
  altar: {
    name: 'Abyssal Fusion Altar',
    shortName: 'Altar',
    description: 'Fuse two retainers into rare Tier 2 elites or star-up duplicates while inheriting core combat traits.',
  },
  corridor: {
    name: 'Kill Corridor',
    shortName: 'Corridor',
    description: 'Deploy 5 classic dungeon traps and frontline fighters—or trap the Backyard door against vault thieves!',
  },
  rock_vein: {
    name: 'Deep Ore Vein',
    shortName: 'Ore Vein',
    description: 'Click to mark for excavation—Toiling Imps haul gold nuggets back to the Treasury. Deep veins hide Mithril, Blood-Diamond & Relic Chests!',
  },
};

const EN_TRAPS: Record<TrapType, { name: string; description: string }> = {
  iron_spikes: {
    name: 'Iron Spike Array',
    description: 'Pierces & slows by 30%; deals 1.6x Shatter Crit against Frozen heroes.',
  },
  boulder_trap: {
    name: 'Rolling Boulder',
    description: 'Unleashes a massive stone bowling down the whole corridor with devastating knockback!',
  },
  charm_censer: {
    name: 'Allure Mist Censer',
    description: 'Charms stepping heroes for 3s so they turn and fight their own squad!',
  },
  frost_rune: {
    name: 'Frost Prison Rune',
    description: 'Freezes heroes solid for 2.0s—deadly Shatter combo with Spikes & Boulders.',
  },
  hell_spring: {
    name: 'Hellfire Spring Pad',
    description: 'Catapults the lead invader all the way back to the corridor entrance to run the gauntlet again!',
  },
};

const EN_SPELLS: Record<SpellId, { name: string; shortName: string; description: string }> = {
  abyss_lightning: {
    name: 'Abyssal Lightning',
    shortName: 'Bolt',
    description: 'Strikes up to 4 frontline heroes with dark lightning; upgrades boost strike multiplier.',
  },
  demon_frenzy: {
    name: 'Abyssal Frenzy',
    shortName: 'Frenzy',
    description: 'All retainers gain +45% Attack Speed & +30% Move Speed for 15s; upgrades extend duration.',
  },
  charm_mist: {
    name: 'Charming Mist',
    shortName: 'Charm',
    description: 'Charms all non-Boss invaders in the corridor into brawling each other.',
  },
  abyss_blackhole: {
    name: 'Gravity Collapse',
    shortName: 'Vortex',
    description: 'Tears open a void singularity pulling heroes together for massive damage (prime Boulder setup!).',
  },
};

const EN_TRAITS: Record<TraitId, { name: string; desc: string }> = {
  vampiric: { name: 'Vampiric Drain', desc: 'Restores 12% of attack damage dealt as HP' },
  double_strike: { name: 'Gale Double-Strike', desc: '25% chance to unleash an instant twin hit' },
  trap_master: { name: 'Trap Master', desc: '+20% trap damage in lane, +40% Workshop parts' },
  greedy_hauler: { name: 'Greedy Hauler', desc: '+20% bonus Gold hauled to Treasury & loot' },
  masochist_delight: { name: 'Slap Enthusiast', desc: 'Slaps boost happiness and grant +20% Crit Rate' },
  arcane_surge: { name: 'Arcane Surge', desc: 'Boosts Library Mana yield & Overlord Miracle damage' },
  iron_wall: { name: 'Obsidian Bulwark', desc: 'Reduces incoming hero damage by 20%' },
  corruptor: { name: 'Master Corruptor', desc: 'Greatly speeds Holy Will drain when stationed in Torture' },
  blood_frenzy: { name: 'Blood Frenzy', desc: '+25% ATK when HP falls below 60%' },
  swift_foot: { name: 'Shadow Stride', desc: '+20% permanent movement speed everywhere' },
  true_sight: { name: 'True-Sight Hunter', desc: 'Reveals stealthed vault thieves and assassins' },
  frost_bite: { name: 'Frostbite Edge', desc: 'Attacks apply Slow—great Shatter synergy' },
};

const EN_MARKS: Record<CorruptionMarkId, { name: string; shortTag: string; desc: string }> = {
  oathbreaker: {
    name: 'Oathbreaker Zeal',
    shortTag: 'Zeal',
    desc: '+22% damage against all Cathedral heroes',
  },
  night_collar: {
    name: 'Velvet Night Collar',
    shortTag: 'Collar',
    desc: '+30% station yield (Library/Workshop/Training/Torture) & 2x slap happiness',
  },
  true_hound: {
    name: 'True-Sight Hound',
    shortTag: 'Hound',
    desc: 'Doubles anti-stealth radar range (480px) & +25% thief bounty',
  },
};

const EN_RESONANCES: Record<RoomResonanceId, { name: string; pairLabel: string; desc: string }> = {
  dark_inquisition_rite: {
    name: 'Dark Inquisition Rite',
    pairLabel: 'Torture ↔ Altar',
    desc: 'Corruption speed +30%; conversion/fusion guarantees +1 bonus rare trait (max 3)',
  },
  arcane_throne_corridor: {
    name: 'Arcane Throne Gallery',
    pairLabel: 'Library ↔ Throne',
    desc: 'Miracle cooldown -20%; Library & Throne Mana output +25%',
  },
  demon_boot_canteen: {
    name: 'Bootcamp Canteen',
    pairLabel: 'Training ↔ Hatchery',
    desc: 'Training XP +35%; eating chicken grants 12s Frenzy haste',
  },
  forge_kill_array: {
    name: 'Tempered Kill Array',
    pairLabel: 'Workshop ↔ Trapped Lane',
    desc: 'Corridor trap damage +30%; Workshop parts output +25%',
  },
  iron_transfer_ward: {
    name: 'Iron Transfer Ward',
    pairLabel: 'Prison ↔ Torture',
    desc: 'Prison heal +50%, passive Will -0.5%/min, instant transfer & Capture +4%',
  },
  aroma_temptation: {
    name: 'Aroma Temptation',
    pairLabel: 'Prison ↔ Hatchery',
    desc: 'Roast chicken aroma drains non-vegetarian captive Will -0.5%/min',
  },
  night_school_cell: {
    name: 'Night-School Cell',
    pairLabel: 'Prison ↔ Library',
    desc: 'Forced Abyssal Labor Law lectures drain captive Will -0.5%/min',
  },
  gilded_cell_window: {
    name: 'Gilded Cell Window',
    pairLabel: 'Prison ↔ Treasury',
    desc: 'Blinding gold makes lockpicking Thieves abandon rescue 100% of the time',
  },
};

const EN_TRAP_SYNERGIES: Record<TrapSynergyId, { name: string; pairLabel: string; desc: string }> = {
  shatter_frost_lane: {
    name: 'Shatter Frost Lane',
    pairLabel: 'Frost ↔ Boulder/Spikes',
    desc: 'Adjacent pair trap damage +35% & amplified Shatter crit multiplier',
  },
  phantom_labyrinth: {
    name: 'Phantom Labyrinth',
    pairLabel: 'Spring ↔ Allure Censer',
    desc: 'Adjacent pair trap damage +35% & Charm duration +1.0s',
  },
};

const EN_IMPLEMENTS: Record<
  TortureImplementId,
  { name: string; subtitle: string; gagLines: string[] }
> = {
  electric_chair: {
    name: 'High-Voltage Electric Chair',
    subtitle: 'Signature Truth-Teller · Rapid Will Drain',
    gagLines: [
      'I WON\'T TELL YOU ANYTHING!! (Stoic Action-Hero Stare)',
      'Never surrender—BZZZT—not my hairstyle!!',
      'Cathedral overtime pay doesn\'t even cover conditioner!!',
      'So tingly… wait, does your castle offer anti-frizz shampoo?',
    ],
  },
  feather_tickler: {
    name: 'Auto Feather Tickler',
    subtitle: 'Zero-Harm Pure Giggles · Laugh Till You Sign',
    gagLines: [
      'HAHAHA STOP! A knight\'s dignity—HAHAHA MERCY!',
      'Not my soles! Ahahaha fine, I\'ll sign the contract!',
      'This is a hundred times worse than morning prayers haha!',
    ],
  },
  brainwash_gramophone: {
    name: 'Hypno Gramophone',
    subtitle: 'AoE All Captives · 24h Corporate Perks Loop',
    gagLines: [
      'Stop looping it! Paid leave AND full benefits? I\'m switching jobs!',
      'Why am I humming along already… Hail the Overlord? Wait, no!',
      'The Cathedral only pays in exposure—the Abyss actually pays bonuses!',
    ],
  },
  hell_dessert_table: {
    name: 'Infernal Dessert Banquet',
    subtitle: 'Zero Mana · Melts Foodie Resolve',
    gagLines: [
      'Gulp… lava cake and roast chicken? I won\'t fall for demon sweets! (staring intensely)',
      'Just one tiny bite… WHOA?! Ten thousand times better than church rye bread!',
      'If afternoon tea is unlimited, the Holy Light can wait…',
    ],
  },
  truth_spotlight: {
    name: 'Holy Truth Spotlight',
    subtitle: 'Monetized Interrogation · Extracts Treasure Intel',
    gagLines: [
      'Get that lamp out of my eyes! I\'ll talk—the Bishop\'s secret manga stash is under the confessional floorboards!',
      'Too bright! Fine! The church slush fund is buried under the East Gate!',
      'Stop shining it! Yes, the Knight Order forged two extra zeros on their expense report!',
    ],
  },
};

const EN_TORTURE_SCRIPTS: Record<
  CapturableHeroId,
  Record<TortureImplementId, readonly [string, string, string]>
> = {
  holy_knight: {
    electric_chair: [
      'I WON\'T TELL YOU A SINGLE THING!! (Stoic Hero Stare) The Light shields the Order\'s honor!',
      'Bzzzt—not my golden hair! Ugh… why is plate armor conductive…!',
      'Haaah… no more… the Light lost signal, and the Overlord\'s voltage is… weirdly addictive…',
    ],
    feather_tickler: [
      'Mere feathers against a sworn Paladin? Hmph, I won\'t crack a smile—',
      'PffHAHAHA STOP! Under the ribs is an armor gap—ahahaha help!',
      'Tears from laughing… stop tickling! I\'ll sign the vassal oath already, sob…',
    ],
    brainwash_gramophone: [
      'Your wicked vinyl cannot taint my faith! The Cathedral is righteous!',
      'Wait… two days off AND free armor polish? No, what am I thinking!',
      'Hail the Overlord… the Cathedral only gives empty promises, the Abyss actually pays…',
    ],
    hell_dessert_table: [
      'A knight eats only communion rye! I refuse demon sugar traps!',
      'Gulp… why is that molten lava cake glowing… I am NOT drooling!',
      'Ugh… just one bite! So sweet! Keep the tea coming and I\'ll guard your gate!',
    ],
    truth_spotlight: [
      'With Light as my witness, my conscience is spotless—shine all you like!',
      'Too bright, not in my eyes! Okay fine… I secretly think the Overlord\'s throne is cool!',
      'I confess everything! The Order vault PIN is 0000—turn off the lamp and hire me!',
    ],
  },
  holy_sister: {
    electric_chair: [
      'Amen… grant me devotion to endure this heretic lightning!',
      'Kyaa! My veil is frizzing up… ugh, tingles are racing to my fingertips…',
      'Heaven seems out of service… I shall pray to the Overlord instead♥',
    ],
    feather_tickler: [
      'A sister\'s serenity shall never be ruffled by such childish tricks…',
      'Eek hahaha! Not my arches! My saintly poise is ruined ahaha!',
      'Haa… my legs went limp from laughing… my habit is slipping, I surrender…',
    ],
    brainwash_gramophone: [
      'Shut off that blasphemous record! I listen only to cathedral organs!',
      'Strange… why am I humming along? What lyrics are "Abyssal perks rock"?!',
      'Offering prayers to the Overlord is true salvation… please accept my devotion~',
    ],
    hell_dessert_table: [
      'Gluttony is a cardinal sin! A sister touches not a crumb of pastry!',
      'B-but that strawberry soufflé looks so innocent… sniffing isn\'t a sin, right?',
      'Mmm… heavenly! If the Abyss serves pudding daily, I\'ll transfer to Shadow Sister today!',
    ],
    truth_spotlight: [
      'I have served the Cathedral faithfully with zero deceit!',
      'Stop shining it! I admit it… I hide manga inside my hymnal during morning mass…!',
      'Please stop asking! The church stash is under the confessional floorboards—I\'ll show you!',
    ],
  },
  elf_sharpshooter: {
    electric_chair: [
      'High-elven pride will never kneel to a crude iron contraption!',
      'Nngh! My pointed ears are super sensitive to static…! Stop staring!',
      'Haa… can\'t even draw my bowstring… stop shocking me, my arrows are yours…',
    ],
    feather_tickler: [
      'Not even forest gales shake my aim—let alone a few feathers!',
      'Eep! Don\'t brush my elven ears with feathers ahahaha that\'s foul play!',
      'Ugh… my ears are bright red… I can barely stand, I yield…',
    ],
    brainwash_gramophone: [
      'Dreadful noise! Elves heed only the whispers of the World Tree!',
      'Tch… that beat is surprisingly catchy… wait, why am I tapping my foot?!',
      'The forest was way too quiet anyway… staying in this lively castle sounds nice…',
    ],
    hell_dessert_table: [
      'Elves dine solely on morning dew and berries—never greasy demon fare!',
      'Why does that honey roast chicken smell divine… one peek, no tasting!',
      'I take it back… your castle chef destroys the Elven Court—I\'m switching sides!',
    ],
    truth_spotlight: [
      'Look into an elf\'s eyes—you\'ll pry no secrets from me!',
      'Blinding! Fine, I admit it… I missed my shot because the Overlord\'s aura dazzled me!',
      'Turn it off! Take the elven archery manual—just let me down and hand me the dark uniform!',
    ],
  },
  dwarf_gold_thief: {
    electric_chair: [
      'Heh, tryna pry treasure maps outta me? Fat chance!',
      'WHOA BZZZT! Stop stop, you\'re gonna melt the coins in my pockets!',
      'I fold, Boss! Here\'s the spare key to the Cathedral Treasury—put me on payroll!',
    ],
    feather_tickler: [
      'Feathers for interrogation? Is the castle budget that tight haha—',
      'Wait hahaha NOT THE WAIST! That\'s my tickle spot ahahaha mercy!',
      'I\'m dying… deal, I\'ll catch rival thieves for you—50/50 split… fine, 30/70!',
    ],
    brainwash_gramophone: [
      'Psh, I know corporate sweet-talk better than your whole dungeon!',
      'Wait—double bounties for catching rival thieves PLUS benefits? That\'s a steal…',
      'Brilliant Boss! Starting today I\'m your Royal Anti-Pickpocket Captain!',
    ],
    hell_dessert_table: [
      'Gold is my only love—pastries can\'t bribe a pro burglar!',
      'Whoa, is that REAL gold leaf on the cake?! Boss, you\'ve got class…',
      'Can\'t bite the hand that feeds roast chicken… I\'ll guard your Vault from now on!',
    ],
    truth_spotlight: [
      'An interrogation lamp? I\'ve stared down way scarier vaults!',
      'Hey not so close! Fine, I buried the 200 Gold from last raid in the front planter!',
      'Spilled it all, Boss! Next thief who touches our Backyard goes straight on the chair!',
    ],
  },
  sun_archmage: {
    electric_chair: [
      'Crude low-tier lightning before the Sunfire Archmage? Laughable!',
      'Ngh… this voltage frequency disrupts my mana circuits… curse you, it tingles!',
      'Haaah… my solar core dissolved… this abyssal current is strangely mesmerizing…',
    ],
    feather_tickler: [
      'Preposterous! Deploying such insolent clockwork against an Archmage!',
      'Cease—pffhaha! Not my collarbone! My robe is slipping ahahaha!',
      'Huff… my dignity is in shambles… stop tickling, all my forbidden spells are yours…',
    ],
    brainwash_gramophone: [
      'Vulgar noise! It cannot scratch my arcane ward!',
      'Wait… the Library\'s infinite mana well is open to scholars free of charge?',
      'The Cathedral bans forbidden research—the Abyss is an Archmage\'s true paradise!',
    ],
    hell_dessert_table: [
      'A noble Archmage never stoops to mere culinary indulgence!',
      'The mana resonance of that dark-flame crème brûlée… I\'m tasting purely for research!',
      'Heavens, exquisite… for afternoon tea and forbidden tomes, I embrace the Eclipse!',
    ],
    truth_spotlight: [
      'By the Solar Crown, my resolve burns brighter than a star!',
      'Ugh! Keep that beam off me… fine, I\'ve been sick of playing Cathedral mascot!',
      'I admit it! I crave the forbidden Eclipse—bestow the Abyssal Mark upon me!',
    ],
  },
  dragon_general: {
    electric_chair: [
      'This weak spark doesn\'t even match Imperial Dragon-Knight endurance drills!',
      'Tch… cranking the voltage? My teeth are chattering… don\'t underestimate a General!',
      'Haa… every ounce of strength drained… that overwhelming aura truly earns my knee…',
    ],
    feather_tickler: [
      'Hmph. A steel-blooded General who laughs at blades fears bird feathers?',
      'Gah—haha! Hey! Striking through armor seams is dishonorable ahahaha!',
      'Enough! A Dragon General weeping with laughter is disgraceful… I pledge my lance!',
    ],
    brainwash_gramophone: [
      'A soldier\'s vow is unbreakable—idle melodies cannot sway me!',
      'The Imperial Senate truly has rotted… whereas your castle rewards merit cleanly…',
      'The old Empire is dead. Only Abyssal iron order deserves my crimson lance!',
    ],
    hell_dessert_table: [
      'Soldiers march on hardtack—luxury dulls a warrior\'s edge!',
      '…That glazed roast chicken is roasted three notches better than the Imperial kitchen…',
      'A full stomach fuels the charge! Overlord, ready your heaviest Dread Dragon Lance!',
    ],
    truth_spotlight: [
      'A Dragon General walks in the open—I have nothing to hide!',
      'Silence! I am NOT jealous that your castle doesn\'t require 10,000-word battle reports…!',
      'Truth be told, conquering alongside you beats serving imperial nobles a hundredfold!',
    ],
  },
};

const EN_RELICS: Record<RelicId, { name: string; effect: string; lore: string }> = {
  bullfrog_pocket_watch: {
    name: 'Bullfrog Clockwork Watch',
    effect: 'Imp efficiency +25%, global move speed +10%',
    lore: 'Engraved "Evil is never late"—its hands spin counterclockwise.',
  },
  succubus_lace_blindfold: {
    name: 'Succubus Lace Blindfold',
    effect: 'Torture corruption +30%, capture chance +8%',
    lore: 'Once sight fades, heroines hear the Abyss whisper clearer.',
  },
  unbreakable_spike_gear: {
    name: 'Unbreakable Spike Gear',
    effect: 'All corridor trap damage +25%',
    lore: 'The Hellforge Workshop\'s proudest perpetual-motion cog.',
  },
  abyssal_gold_chalice: {
    name: 'Abyssal Greed Chalice',
    effect: 'All Gold income +20%',
    lore: 'A solid-gold goblet brimming with hero tears and coin.',
  },
  obsidian_slap_glove: {
    name: 'Obsidian Slap Glove',
    effect: 'Slap buff +15s duration & +15% stronger',
    lore: 'Crisp snap, zero bruises—classic dungeon-keeper ergonomics.',
  },
  roast_chicken_bell: {
    name: 'Sizzling Chicken Bell',
    effect: 'Hatchery chicken heal +15% extra HP',
    lore: 'One ring makes every retainer within three rooms drool.',
  },
  blood_moon_pendant: {
    name: 'Bloodmoon Pendant',
    effect: 'All retainers gain +8% lifesteal',
    lore: 'Crimson dew crystallized on Lilith\'s coronation night.',
  },
  thorn_crown_shard: {
    name: 'Thorn Crown Shard',
    effect: 'Trap damage +18%, retainer ATK +8%',
    lore: 'A bloodstained spine snapped from Elizabeth\'s crown.',
  },
  imp_overtime_whip: {
    name: 'Imp Overtime Whip',
    effect: 'Imp mining, hauling & repair speed +30%',
    lore: 'A single crack in midair turns imps into golden blurs.',
  },
  boulder_grease_barrel: {
    name: 'Boulder Grease Barrel',
    effect: 'Rolling Boulder damage +45%',
    lore: 'Slicked with abyssal pitch for clean corridor strikes!',
  },
  frost_core_prism: {
    name: 'Frost Core Prism',
    effect: 'Frost Rune freeze duration +0.8s',
    lore: 'Freezes heroic battle cries into crisp icicles.',
  },
  spring_coil_blueprint: {
    name: 'Hellspring Blueprint',
    effect: 'Spring Pad +35 dmg, all trap damage +12%',
    lore: 'Footnoted: "Guarantees returning Paladins to the entrance."',
  },
  forbidden_grimoire_page: {
    name: 'Forbidden Grimoire Page',
    effect: 'Mana production +25%',
    lore: 'Still carries margin doodles from the Grimoire Apprentice.',
  },
  corrupted_rosary: {
    name: 'Obsidian Rosary',
    effect: 'Torture speed +25%, global HP +10%',
    lore: 'Every bead once belonged to a converted choir sister.',
  },
  dragonscale_pauldron: {
    name: 'Obsidian Dragon Pauldron',
    effect: 'All retainers Max HP +22%',
    lore: 'Forged from shed scales of heavy dragonborn guards.',
  },
  arachne_venom_vial: {
    name: 'Honey-Venom Vial',
    effect: 'Poison DoT damage +50%',
    lore: 'Smells like wild honey, tastes like a funeral.',
  },
  altar_resonance_stone: {
    name: 'Altar Resonance Stone',
    effect: 'Fusion level retention +15%',
    lore: 'Minimizes soul loss during two-into-one rituals.',
  },
  greedy_goblin_coin: {
    name: 'Two-Faced Greed Coin',
    effect: 'Gold income +18%, Treasury interest +1%',
    lore: 'Hard currency stamped with the Overlord on both sides.',
  },
  mana_siphon_crystal: {
    name: 'Mana Siphon Cluster',
    effect: 'Mana yield +20%, Miracle spell power +20%',
    lore: 'Quietly drinks residual magic off surface heroes.',
  },
  shadow_whetstone: {
    name: 'Shadow Whetstone',
    effect: 'All ATK +18%, Crit Rate +8%',
    lore: 'The Blademaid\'s mandatory bedtime blade-care stone.',
  },
  dungeon_heart_aegis: {
    name: 'Obsidian Heart Plating',
    effect: 'Overlord Heart Max HP +35%',
    lore: 'Heroes swing till their palms go numb—the Abyssal Heart doesn\'t even chip its polish.',
  },
  payday_tax_ledger: {
    name: 'Shady Payday Ledger',
    effect: 'Reduces Payday wage expenses by 30%',
    lore: 'Deducts dorm rent and chicken buffet strictly at cost.',
  },
  crimson_velvet_choker: {
    name: 'Crimson Velvet Choker',
    effect: 'Global Crit Rate +12%, lifesteal +5%',
    lore: 'The most coveted emblem of loyalty among abyssal nobility.',
  },
  soul_shackle_chain: {
    name: 'Gilded Soul Shackle',
    effect: 'Elite hero capture chance +12%',
    lore: 'Snaps neatly around a fallen heroine\'s ankle on cue.',
  },
  hellforge_bellows: {
    name: 'Hellforge Bellows',
    effect: 'Workshop trap-part forging +35%',
    lore: 'One mighty puff churns out fresh crates of iron spikes.',
  },
  eclipse_hourglass: {
    name: 'Eclipse Training Glass',
    effect: 'Training Room XP gain +35%',
    lore: 'Dark sand runs far swifter than surface time.',
  },
  vampiric_fang_brooch: {
    name: 'Vampiric Fang Brooch',
    effect: 'All lifesteal +10%, ATK +10%',
    lore: 'Drink invading heroes dry for tea and save the Hatchery two chickens—peak Abyssal cost-cutting.',
  },
  skeleton_metronome: {
    name: 'Bone Flute Metronome',
    effect: 'Global Attack & Move Speed +18%',
    lore: 'Its clacking tempo drives the whole castle into overdrive.',
  },
  emerald_slime_gel: {
    name: 'Emerald Gel Essence',
    effect: 'Global HP +18%, chicken heal +10%',
    lore: 'Bouncy residue left everywhere by the Ooze Warden—heals wounds fast and spikes the Gargoyle\'s blood pressure faster.',
  },
  overlord_signet_ring: {
    name: 'Abyssal Overlord Signet',
    effect: 'Global ATK, HP, Gold & Mana +12%',
    lore: 'Supreme seal of dominion over the desktop dungeon.',
  },
};

const EN_TECH: Record<TechId, { name: string; effectPerLevel: string }> = {
  abyssal_might: { name: 'Abyssal Might Sigil', effectPerLevel: 'Permanent Army HP & ATK +12% / lv' },
  golden_greed: { name: 'Gilded Greed Edict', effectPerLevel: 'Loot, Ore & Treasury Gold +15% / lv' },
  overlord_crown: { name: 'Overlord Crown Resonance', effectPerLevel: 'Overlord stats +18% & +1 Combat Cap / lv' },
  trap_engineering: { name: 'Clockwork Trap Mastery', effectPerLevel: 'Trap DMG +18%, Workshop parts +15% / lv' },
  arcane_well: { name: 'Perpetual Mana Well', effectPerLevel: 'Mana regen & Miracle power +15% / lv' },
  torture_mastery: { name: 'Grand Inquisitor Craft', effectPerLevel: 'Corruption speed +22%, Capture +2% / lv' },
  deep_excavation: { name: 'Deep Mithril Drilling', effectPerLevel: '+1 pre-dug corridor & deep ore yield +25% / lv' },
  offline_chronicle: { name: 'Eternal Idle Hourglass', effectPerLevel: 'Offline cap +2h (max 24h) & yield +10% / lv' },
  auto_slap_aura: { name: 'Auto-Slap Dominion Aura', effectPerLevel: 'Periodically auto-slaps random retainers / lv' },
  rare_trait_boost: { name: 'Bloodline Trait Awakening', effectPerLevel: '+17% bonus rare trait chance on recruit/fuse / lv' },
};

const EN_CHAPTERS = [
  'Ch. I · Border Patrol (W1–20)',
  'Ch. II · Cathedral Crusade (W21–40)',
  'Ch. III · Elven Wild Hunt (W41–60)',
  'Ch. IV · Imperial Dragon Corps (W61–80)',
  'Ch. V · Celestial Judgment (W81–100+)',
] as const;

const EN_TUTORIAL: ReadonlyArray<{ title: string; hint: string }> = [
  {
    title: '① Excavate Deep Ore Veins',
    hint: 'Click a glowing [Deep Ore Vein] on the right so Toiling Imps mine & haul Gold back to your Backyard Treasury!',
  },
  {
    title: '② Right-Drag the Wide Dungeon',
    hint: 'Hold [Right Mouse & Drag] (or scroll wheel) over the dungeon strip to pan across all 28 rooms!',
  },
  {
    title: '③ Hand of Evil: Slap to Haste',
    hint: 'Quick [Right-Click] any retainer for a playful slap—triggers 30s frantic haste and a sassy speech bubble!',
  },
  {
    title: '④ Pick Up & Drop into Training',
    hint: 'Hold [Left-Click & Drag] a retainer to dangle them with pendulum physics, then drop them in Training or Frontline!',
  },
  {
    title: '⑤ Upgrade Your Overlord',
    hint: 'Click the [Throne] or top-left Overlord portrait and hit [Upgrade Overlord] to reach Lv.2!',
  },
  {
    title: '⑥ Build Your Trap Gauntlet',
    hint: 'Open [Build] or click a frontline corridor to install your first trap (Rolling Boulder or Spikes recommended)!',
  },
  {
    title: '⑦ Build the Torture Chamber',
    hint: 'Build a [Succubus Torture Chamber] in a Backyard corridor and inspect the signature [Electric Chair]!',
  },
];

const EN_IDLE_BANTER: readonly string[] = [
  'That mortal upstairs is pretending to code again—glanced down at our dungeon eight hundred times already!',
  'Heard the Cathedral has no afternoon tea. Glad I signed with the Overlord~',
  'These chickens are awfully skinny. Is the Hatchery skimming the feed budget?',
  'Psst—last vault thief got picked up by the Overlord and fed straight to a Rolling Boulder…',
  'Three days mining dark gold, paid three coppers again. Does the Abyss have a labor board?',
  'Boss, do we get overtime pay? —"Certainly. You\'re rewarded with bonus overtime."',
  'Hey landlord upstairs, don\'t keel over—who else is paying the power bill for our Electric Chair?',
  'Do these invading heroes all copy their battle cries from the same stale script?',
  'Heard the Torture Chamber got fresh insulation—even the Sister next door chuckled…',
  'Shh! Human boss patrolling! Hit [Badge] on the bottom-right to play dead—I\'ll cover you!',
  'Smells like Mithril and Relic Chests deep to the right—slap the Imps and send them digging!',
  'Why do I work faster after getting slapped? Is this the dark magic of physical KPIs?',
];

// ===== Public Localized Accessors =====

export function locOverlord(id: OverlordId) {
  if (currentLocale === 'en') return EN_OVERLORDS[id];
  const d = OVERLORD_DEFS[id];
  return {
    name: d.name,
    title: d.title,
    passiveTitle: d.passiveTitle,
    passiveDesc: d.passiveDesc,
    quote: d.quote,
  };
}

export function locUnitDef(species: AbyssalSpeciesId) {
  if (currentLocale === 'en') return EN_UNITS[species];
  const d = ABYSSAL_UNIT_DEFS[species];
  return {
    name: d.name,
    title: d.title,
    description: d.description,
    slapLines: d.slapLines,
  };
}

export function locUnitName(unit: Pick<AbyssalUnit, 'species' | 'name'>): string {
  return locUnitDef(unit.species)?.name ?? unit.name;
}

export function locHeroDef(species: HeroSpeciesId) {
  if (currentLocale === 'en') return EN_HEROES[species];
  const d = HERO_DEFS[species];
  return { name: d.name, roleTag: d.roleTag };
}

export function locHeroName(hero: Pick<HeroUnit, 'species' | 'name' | 'isBoss'>): string {
  const base = locHeroDef(hero.species)?.name ?? hero.name;
  const def = HERO_DEFS[hero.species];
  if (hero.isBoss && !def.isBoss) {
    return currentLocale === 'en' ? `Elite · ${base}` : `精英·${base}`;
  }
  return base;
}

export function locRoom(type: RoomType) {
  if (currentLocale === 'en') return EN_ROOMS[type];
  const d = ROOM_DEFS[type];
  return { name: d.name, shortName: d.shortName, description: d.description };
}

export function locTrap(type: TrapType) {
  if (currentLocale === 'en') return EN_TRAPS[type];
  const d = TRAP_DEFS[type];
  return { name: d.name, description: d.description };
}

export function locSpell(id: SpellId) {
  if (currentLocale === 'en') return EN_SPELLS[id];
  const d = SPELL_DEFS[id];
  const shortZh: Record<SpellId, string> = {
    abyss_lightning: '落雷',
    demon_frenzy: '狂暴',
    charm_mist: '魅雾',
    abyss_blackhole: '黑洞',
  };
  return { name: d.name, shortName: shortZh[id], description: d.description };
}

const ZH_TRAITS: Record<TraitId, { name: string; desc: string }> = {
  vampiric: { name: '嗜血回复', desc: '攻击造成伤害的 12% 转化为自身生命回复' },
  double_strike: { name: '疾风连斩', desc: '25% 概率瞬间发动双倍连击' },
  trap_master: { name: '机关专精', desc: '所在走廊陷阱伤害 +20%，工坊零件产出 +40%' },
  greedy_hauler: { name: '贪婪搬运', desc: '运回宝库的金币与战利品额外 +20%' },
  masochist_delight: { name: '受虐狂喜', desc: '被扇巴掌时提升愉悦度并获得 +20% 暴击率' },
  arcane_surge: { name: '奥术涌流', desc: '提升书库魔力产出与魔王神迹法术伤害' },
  iron_wall: { name: '黑曜铁壁', desc: '受到的勇者物理与法术伤害降低 20%' },
  corruptor: { name: '堕落大师', desc: '驻守刑讯室时大幅加速圣光意志瓦解' },
  blood_frenzy: { name: '血怒狂战', desc: '生命低于 60% 时攻击力飙升 +25%' },
  swift_foot: { name: '暗影疾步', desc: '全场景移动速度永久 +20%' },
  true_sight: { name: '真视捕贼', desc: '识破潜行偷金的暗影飞贼与刺客' },
  frost_bite: { name: '寒霜蚀骨', desc: '攻击附带减速效果，极佳碎冰连携' },
};

export function locTrait(id: TraitId): { name: string; desc: string } {
  return currentLocale === 'en' ? EN_TRAITS[id] : ZH_TRAITS[id];
}

export function locMark(id: CorruptionMarkId) {
  if (currentLocale === 'en') return EN_MARKS[id];
  const d = CORRUPTION_MARKS[id];
  return { name: d.name, shortTag: d.shortTag, desc: d.desc };
}

export function locResonance(id: RoomResonanceId) {
  if (currentLocale === 'en') return EN_RESONANCES[id];
  const d = ROOM_RESONANCE_DEFS[id];
  return { name: d.name, pairLabel: d.pairLabel, desc: d.desc };
}

export function locTrapSynergy(id: TrapSynergyId) {
  if (currentLocale === 'en') return EN_TRAP_SYNERGIES[id];
  const d = TRAP_SYNERGY_DEFS[id];
  return { name: d.name, pairLabel: d.pairLabel, desc: d.desc };
}

export function locImplement(id: TortureImplementId) {
  if (currentLocale === 'en') return EN_IMPLEMENTS[id];
  const d = TORTURE_IMPLEMENTS[id];
  return { name: d.name, subtitle: d.subtitle, gagLines: d.gagLines };
}

export function locRelic(id: RelicId) {
  if (currentLocale === 'en') return EN_RELICS[id];
  const d = RELIC_MAP[id];
  return { name: d.name, effect: d.effect, lore: d.lore };
}

export function locTech(id: TechId) {
  if (currentLocale === 'en') return EN_TECH[id];
  const d = ABYSS_TECH_TREE.find((x) => x.id === id)!;
  return { name: d.name, effectPerLevel: d.effectPerLevel };
}

export function locChapterName(wave: number): string {
  if (currentLocale === 'en') {
    const idx = Math.min(EN_CHAPTERS.length - 1, Math.floor(Math.max(0, wave - 1) / 20));
    return EN_CHAPTERS[idx]!;
  }
  return getChapterName(wave);
}

export function locTutorialStep(step: number): { title: string; hint: string } {
  const idx = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, step));
  if (currentLocale === 'en') return EN_TUTORIAL[idx]!;
  const d = TUTORIAL_STEPS[idx]!;
  return { title: d.title, hint: d.hint };
}

export function locTortureStageLine(
  heroId: CapturableHeroId,
  implementId: TortureImplementId,
  progress: number,
): string {
  if (currentLocale === 'en') {
    const stage = getTortureStageIndex(progress);
    return EN_TORTURE_SCRIPTS[heroId]?.[implementId]?.[stage] ?? 'I won\'t tell you anything!!';
  }
  return getTortureStageLine(heroId, implementId, progress);
}

export function locIdleBanterLines(): readonly string[] {
  return currentLocale === 'en' ? EN_IDLE_BANTER : IDLE_BANTER_LINES;
}

// ===== V2.3 Abyssal Theater (7 Episodes x 3 Lines, ZH + EN) =====

export type StorySpeakerRef =
  | 'active_overlord'
  | 'converted_hero'
  | 'imp'
  | 'crimson_succubus'
  | 'imp_witch'
  | 'hellforge_smith'
  | 'valkyrie_captain'
  | 'lord_inquisitor';

export interface StoryLineSpec {
  speaker: StorySpeakerRef;
  portraitOverride?: string;
  zh: string;
  en: string;
}

export interface StoryEpisodeSpec {
  id: StoryId;
  titleZh: string;
  titleEn: string;
  triggerHintZh: string;
  triggerHintEn: string;
  lines: readonly [StoryLineSpec, StoryLineSpec, StoryLineSpec];
}

export const STORY_SCRIPTS: Record<StoryId, StoryEpisodeSpec> = {
  prologue_desk: {
    id: 'prologue_desk',
    titleZh: '#1 序章：桌底违建魔王城',
    titleEn: '#1 Prologue: Under-Desk Citadel',
    triggerHintZh: '新档开局',
    triggerHintEn: 'New Dungeon Start',
    lines: [
      {
        speaker: 'active_overlord',
        zh: '圣堂拆迁队把地上魔王城炸平了？无妨，本王已把核心水晶偷偷焊死在这位凡人的桌面任务栏底下。',
        en: "The Cathedral razed our surface citadel? No matter—I welded our Dungeon Heart right under this mortal's desktop taskbar.",
      },
      {
        speaker: 'imp',
        zh: '报——！上面那块发光的代码窗口一直咔嗒响，凡人敲键盘震得矿洞顶上直掉金渣！',
        en: 'Boss! That glowing code window up top keeps clacking—every keystroke shakes gold dust loose from our ceiling!',
      },
      {
        speaker: 'active_overlord',
        zh: '嘘，别惊动交电费的房东。右键扇小鬼干活，咱们贴着屏幕底边悄悄东山再起~',
        en: "Shh, don't disturb the landlord paying our power bill. Right-click to slap the imps—we rebuild along the bottom edge~",
      },
    ],
  },
  unlock_torture: {
    id: 'unlock_torture',
    titleZh: '#2 刑讯解封：带薪电椅跳槽指南',
    titleEn: '#2 Torture Unlocked: Paid-Leave Recruitment',
    triggerHintZh: '通关 W2 解锁',
    triggerHintEn: 'Clear Wave 2',
    lines: [
      {
        speaker: 'active_overlord',
        zh: '魅魔刑讯室图纸解封，首座建造半价！记住，电椅电压调到刚好烫卷刘海的文明档位。',
        en: 'Succubus Torture Chamber unlocked—first build half off! Set the chair voltage just high enough to curl bangs.',
      },
      {
        speaker: 'crimson_succubus',
        zh: '要是圣光女骑士死鸭子嘴硬怎么办？留声机已经在循环播放《深渊五险一金与下午茶福利》啦~',
        en: "And if a Holy Knight plays tough? The gramophone is already looping our 'Full Benefits & Unlimited Tea' perks~",
      },
      {
        speaker: 'active_overlord',
        zh: '很好，第 3 波就有圣堂精英送上门——击倒后左键直接拎进刑讯室！',
        en: 'Perfect. Wave 3 brings capturable Cathedral elites—knock one down and drag her straight onto the chair!',
      },
    ],
  },
  unlock_altar: {
    id: 'unlock_altar',
    titleZh: '#3 祭坛解封：二合一不算裁员',
    titleEn: '#3 Altar Unlocked: Not Downsizing',
    triggerHintZh: '通关 W4 解锁',
    triggerHintEn: 'Clear Wave 4',
    lines: [
      {
        speaker: 'active_overlord',
        zh: '前线编制吃紧？合成祭坛现已解封（首建半价），把两位精兵丢进去就能升格二阶统领。',
        en: 'Tight on frontline headcount? The Fusion Altar is open at half price—merge two retainers into a Tier 2 elite!',
      },
      {
        speaker: 'imp_witch',
        zh: '等等，两个工位合并成一个高阶岗……这在凡间职场不就叫降本增效吗？！',
        en: "Wait—merging two roles into one senior post… isn't that just corporate downsizing?!",
      },
      {
        speaker: 'active_overlord',
        zh: '胡说，继承稀有词条还换新礼服，这叫带薪晋升。快准备迎接第 5 波女武神突袭！',
        en: 'Nonsense—you inherit rare traits AND get a wardrobe upgrade. Now grease the boulders for Wave 5!',
      },
    ],
  },
  boss_valkyrie_w5: {
    id: 'boss_valkyrie_w5',
    titleZh: '#4 首领突袭：女武神的违建罚单',
    titleEn: '#4 Boss Raid: Unlicensed Basement',
    triggerHintZh: 'W5 女武神登场',
    triggerHintEn: 'Wave 5 Valkyrie Raid',
    lines: [
      {
        speaker: 'valkyrie_captain',
        portraitOverride: 'valkyrie_captain_pure',
        zh: '奉圣堂评议会之命，查封任务栏下方非法地下室！你们甚至没办消防许可证！',
        en: 'By order of the Cathedral Council, this unlicensed under-taskbar basement is condemned! Where is your fire permit?!',
      },
      {
        speaker: 'hellforge_smith',
        zh: '消防证没有，工坊刚打磨好的牛蛙滚石和冰霜符文倒是管够！',
        en: 'No fire permit—just freshly forged Rolling Boulders and Frost Runes straight out of the oven!',
      },
      {
        speaker: 'active_overlord',
        zh: '小的们，给检查员小姐免票体验全套走廊机关~',
        en: 'Retainers, treat the inspector to a complimentary tour of our trap lane~',
      },
    ],
  },
  chapter1_clear_w10: {
    id: 'chapter1_clear_w10',
    titleZh: '#5 首章告捷：圣裁女皇的免费爆破',
    titleEn: '#5 Chapter I Clear: Free Demolition',
    triggerHintZh: '通关 W10 全境破封',
    triggerHintEn: 'Clear Wave 10',
    lines: [
      {
        speaker: 'lord_inquisitor',
        portraitOverride: 'lord_inquisitor_pure',
        zh: '不可能！本皇的圣裁远征军竟败在区区任务栏缝隙里……前几波失联的圣光女骑士到底去哪了？！',
        en: 'Impossible! My Grand Inquisition routed beneath a mere taskbar… and where are our missing Holy Knights?!',
      },
      {
        speaker: 'imp',
        zh: '报——！圣裁女皇撤退时一头撞碎了最深处的封印岩壁，后面的血钻矿脉全露出来啦！',
        en: 'Boss! The retreating Inquisitor smashed right through the deepest seal—the Blood-Gem veins are wide open!',
      },
      {
        speaker: 'active_overlord',
        zh: '替本王谢谢圣堂的免费爆破工程。全境 28 格领地贯通——全军扛镐深挖！',
        en: 'Send the Cathedral my thanks for the free demolition. All 28 dungeon sectors unsealed—dig deep!',
      },
    ],
  },
  first_ace_converted: {
    id: 'first_ace_converted',
    titleZh: '#6 首俘收编：真香定律',
    titleEn: '#6 First Ace: Too Good to Resist',
    triggerHintZh: '首次收编三阶王牌',
    triggerHintEn: 'Convert First Tier 3 Ace',
    lines: [
      {
        speaker: 'converted_hero',
        zh: '呜……别再循环播放带薪休假歌了……只要管饱烤鸡和下午茶，这身本事以后归你指挥！',
        en: 'Ugh… stop looping that paid-leave jingle… as long as roast chicken and tea are included, my skills are yours!',
      },
      {
        speaker: 'crimson_succubus',
        zh: '契约手印已盖妥~恭喜魔王大人收编首位三阶王牌，上前线或驻守房间都能独当一面呢。',
        en: 'Contract sealed~ Congratulations on your first Tier 3 Fallen Ace—deadly on the frontline or stationed indoors.',
      },
      {
        speaker: 'active_overlord',
        zh: '欢迎入职桌底魔王城。顺便一提，打开她的检视卡还能免费切换一次专属【堕落刻印】~',
        en: 'Welcome to the under-desk payroll. Open her card anytime—her first specialized Corruption Mark switch is free~',
      },
    ],
  },
  unlock_prestige_w50: {
    id: 'unlock_prestige_w50',
    titleZh: '#7 位面轮回：深渊搬家公司',
    titleEn: '#7 Planar Erosion: Abyssal Movers',
    triggerHintZh: '通关 W50 解锁轮回',
    triggerHintEn: 'Clear Wave 50',
    lines: [
      {
        speaker: 'imp',
        zh: '老板大喜！咱们把第 50 波圣堂主力锤穿啦，整条任务栏地基都在往外冒深渊魔晶！',
        en: 'Jackpot, Boss! Wave 50 is crushed, and the whole taskbar foundation is bursting with Abyssal Shards!',
      },
      {
        speaker: 'imp_witch',
        zh: '位面侵蚀法阵已就绪！随时可前往【科技·轮回】将魔晶兑换为永久科技与新魔王编制！',
        en: 'Planar Erosion ready! Open Tech & Prestige anytime to trade Shards for permanent upgrades and new Overlords!',
      },
      {
        speaker: 'active_overlord',
        zh: '而且踏入下一纪元直接解锁全境 28 格与全套设施，免去重新破壁。准备好降维打击了吗~',
        en: 'Plus the next Epoch starts with all 28 slots and every facility unlocked from second zero. Ready for a victory lap~',
      },
    ],
  },
};

export interface ResolvedStoryLine {
  speakerName: string;
  portraitKey: string;
  text: string;
  accent: 'overlord' | 'ally' | 'hero';
}

export interface ResolvedStoryEpisode {
  id: StoryId;
  title: string;
  triggerHint: string;
  lines: ResolvedStoryLine[];
}

export function locStoryScript(
  storyId: StoryId,
  overlordId: OverlordId,
  convertedHeroSpecies?: HeroSpeciesId,
): ResolvedStoryEpisode {
  const spec = STORY_SCRIPTS[storyId];
  const isEn = currentLocale === 'en';
  const heroForConvert: CapturableHeroId =
    convertedHeroSpecies && HERO_DEFS[convertedHeroSpecies]?.capturableAs
      ? (convertedHeroSpecies as CapturableHeroId)
      : 'holy_knight';

  const lines: ResolvedStoryLine[] = spec.lines.map((line) => {
    const text = isEn ? line.en : line.zh;
    if (line.speaker === 'active_overlord') {
      return {
        speakerName: locOverlord(overlordId).name,
        portraitKey: OVERLORD_DEFS[overlordId].portraitKey,
        text,
        accent: 'overlord',
      };
    }
    if (line.speaker === 'converted_hero') {
      return {
        speakerName: locHeroDef(heroForConvert).name,
        portraitKey: `${heroForConvert}_broken`,
        text,
        accent: 'hero',
      };
    }
    if (line.speaker === 'valkyrie_captain' || line.speaker === 'lord_inquisitor') {
      return {
        speakerName: locHeroDef(line.speaker).name,
        portraitKey: line.portraitOverride ?? HERO_DEFS[line.speaker].portraitKey,
        text,
        accent: 'hero',
      };
    }
    return {
      speakerName: locUnitDef(line.speaker).name,
      portraitKey: line.portraitOverride ?? ABYSSAL_UNIT_DEFS[line.speaker].portraitKey,
      text,
      accent: 'ally',
    };
  });

  return {
    id: spec.id,
    title: isEn ? spec.titleEn : spec.titleZh,
    triggerHint: isEn ? spec.triggerHintEn : spec.triggerHintZh,
    lines,
  };
}
