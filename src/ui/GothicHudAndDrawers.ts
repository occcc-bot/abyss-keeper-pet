import {
  ABYSS_TECH_TREE,
  ABYSSAL_UNIT_DEFS,
  BALANCE_CONFIG,
  BASE_RECRUITABLE_SPECIES,
  BUILDABLE_ROOMS,
  CORRUPTION_MARK_LIST,
  FEATURE_UNLOCK_WAVE,
  FUSION_RECIPES,
  HERO_DEFS,
  HERO_PERSONA,
  HERO_WEAKNESS_IMPLEMENT,
  OVERLORD_DEFS,
  RELIC_DEFS,
  RELIC_MAP,
  ROOM_DEFS,
  ROOM_TO_FEATURE,
  SPELL_DEFS,
  SPELL_TO_FEATURE,
  STORY_IDS,
  THRONE_SLOT_INDEX,
  TORTURE_IMPLEMENT_LIST,
  TORTURE_IMPLEMENTS,
  TRAP_DEFS,
  TRAP_TO_FEATURE,
  TUTORIAL_STEPS,
  DungeonEngine,
  composeGazette,
  deriveQuirk,
  evaluateDungeonResonances,
  getCodexBonusMult,
  getLocale,
  getMaxCombatUnits,
  getPrisonCapacity,
  getPrisonSlot,
  getTortureStageIndex,
  impSummonManaCost,
  isOverchargeCritWindow,
  locChapterName,
  locHeroDef,
  locHeroName,
  locImplement,
  locMark,
  locOverlord,
  locQuirk,
  locRelic,
  locResonance,
  locRoom,
  locSpell,
  locStance,
  locStoryScript,
  locTech,
  locTortureStageLine,
  locTrait,
  locTrap,
  locTrapSynergy,
  locTutorialStep,
  locUnitDef,
  locUnitName,
  overchargeManaCost,
  overlordUpgradeCost,
  prestigeShardsForWave,
  recruitCostForTier,
  requiredWaveForSlot,
  roomUpgradeCost,
  setLocale,
  spellUpgradeCost,
  stanceOf,
  t,
  techUpgradeCost,
  toggleLocale,
  type AbyssalSpeciesId,
  type BuildableRoomType,
  type CapturableHeroId,
  type ChronicleKey,
  type CorruptionMarkId,
  type FeatureId,
  type HeroSpeciesId,
  type Locale,
  type OverlordId,
  type RelicId,
  type ResolvedStoryEpisode,
  type SpellId,
  type StoryId,
  type TechId,
  type TortureImplementId,
  type TrapType,
} from '../core';
import type { BgmMode, DungeonStage } from '../render';

export type GrimoireTab = 'throne' | 'build' | 'recruit' | 'relics' | 'prestige' | 'codex' | 'theater';

export type GalleryTarget =
  | { kind: 'overlord'; id: OverlordId }
  | { kind: 'unit'; id: AbyssalSpeciesId }
  | { kind: 'hero'; id: HeroSpeciesId; stage?: 0 | 1 | 2 | 3 };

export type ActiveDrawer =
  | { kind: 'none' }
  | { kind: 'portrait'; unitId: string }
  | { kind: 'torture'; recentConvertedSpecies?: AbyssalSpeciesId; tab?: 'chamber' | 'prison' }
  | { kind: 'altar' }
  | { kind: 'grimoire'; tab: GrimoireTab; focusSlot?: number }
  | { kind: 'gallery'; target: GalleryTarget }
  | {
      kind: 'gazette';
      before: Partial<Record<ChronicleKey, number>>;
      after: Partial<Record<ChronicleKey, number>>;
      slackerNaps: number;
      elapsedSec: number;
      summary?: { gold: number; bullion?: number; mana: number; xp: number; converted: number };
    }
  | { kind: 'destroy_world' };

const TRAP_LIST: readonly TrapType[] = [
  'iron_spikes',
  'boulder_trap',
  'charm_censer',
  'frost_rune',
  'hell_spring',
];

const SPELL_LIST: readonly SpellId[] = [
  'abyss_lightning',
  'demon_frenzy',
  'charm_mist',
  'abyss_blackhole',
];

const OVERLORD_LIST: readonly OverlordId[] = ['lilith', 'elizabeth', 'seraphina', 'aurelia'];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString('en-US');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface UiControllerOptions {
  root: HTMLElement;
  engine: DungeonEngine;
  stage: DungeonStage;
  onHitRegionsDirty: () => void;
  onToggleMinimize: (minimized: boolean) => void;
  onSaveNow: () => void;
  onDestroyWorld?: () => void;
  onRestoreBackup?: () => boolean;
  hasPreResetBackup?: () => boolean;
}

export class GothicUiController {
  private readonly root: HTMLElement;
  private readonly engine: DungeonEngine;
  private readonly stage: DungeonStage;
  private readonly opts: UiControllerOptions;

  private readonly hudEl: HTMLElement;
  private readonly drawerHost: HTMLElement;
  private readonly toastStack: HTMLElement;
  private readonly orbWrapEl: HTMLElement;
  private readonly orbEl: HTMLButtonElement;
  private readonly slackReportEl: HTMLElement;
  private readonly tutorialEl: HTMLElement;
  private readonly relicBannerHost: HTMLElement;
  private readonly thiefAlertEl: HTMLElement;
  private readonly bossBarEl: HTMLElement;
  private readonly cutinBannerEl: HTMLElement;
  private readonly settingsPopoverEl: HTMLElement;
  private readonly storyStageEl: HTMLElement;
  private readonly retreatBannerEl: HTMLElement;
  private retreatBannerTimer: number | null = null;
  private chronicleSnapshot: Partial<Record<ChronicleKey, number>> | null = null;
  private minimizeStartSec = 0;

  public activeDrawer: ActiveDrawer = { kind: 'none' };
  public minimized = false;
  private settingsOpen = false;
  private lastTutorialRendered = -1;
  private relicBannerTimer: number | null = null;
  private thiefAlertTimer: number | null = null;
  private cutinTimer: number | null = null;
  private lastCutinGlobalMs = -999_999;
  private lastCutinSpellMs = -999_999;

  // V2.3 Story Stage state (FIFO capacity 2, zero PRNG, zero tick pause)
  private storyQueue: Array<{ storyId: StoryId; heroSpecies?: HeroSpeciesId }> = [];
  private activeStory: {
    storyId: StoryId;
    heroSpecies?: HeroSpeciesId;
    lineIndex: number;
    episode: ResolvedStoryEpisode;
    replay: boolean;
  } | null = null;
  private storyAutoTimer: number | null = null;
  private storyHovered = false;

  // Pure in-memory snapshot taken when folded into Demon Heart Badge (zero save bloat!)
  private slackSnapshot: {
    startWave: number;
    startGoldEarned: number;
    startThieves: number;
    startConverted: number;
    startRelics: number;
  } | null = null;

  private hudVals: Record<string, HTMLElement> = {};

  constructor(opts: UiControllerOptions) {
    this.opts = opts;
    this.root = opts.root;
    this.engine = opts.engine;
    this.stage = opts.stage;

    this.thiefAlertEl = document.createElement('div');
    this.thiefAlertEl.id = 'abyss-thief-alert';

    this.cutinBannerEl = document.createElement('div');
    this.cutinBannerEl.id = 'abyss-cutin-banner';

    this.storyStageEl = document.createElement('div');
    this.storyStageEl.id = 'abyss-story-stage';
    this.storyStageEl.addEventListener('mouseenter', () => {
      this.storyHovered = true;
      if (this.storyAutoTimer !== null) {
        window.clearTimeout(this.storyAutoTimer);
        this.storyAutoTimer = null;
      }
    });
    this.storyStageEl.addEventListener('mouseleave', () => {
      this.storyHovered = false;
      if (this.activeStory) this.scheduleStoryAutoAdvance();
    });

    this.settingsPopoverEl = document.createElement('div');
    this.settingsPopoverEl.id = 'abyss-settings-popover';
    this.settingsPopoverEl.dataset.hitRegion = 'true';

    this.bossBarEl = document.createElement('div');
    this.bossBarEl.id = 'abyss-boss-bar';
    this.buildBossBarMarkup();

    this.drawerHost = document.createElement('div');
    this.drawerHost.id = 'drawer-host';

    this.relicBannerHost = document.createElement('div');
    this.relicBannerHost.id = 'abyss-relic-banner-host';

    this.tutorialEl = document.createElement('div');
    this.tutorialEl.id = 'abyss-tutorial-bar';
    this.tutorialEl.dataset.hitRegion = 'true';

    this.toastStack = document.createElement('div');
    this.toastStack.id = 'abyss-toast-stack';

    this.hudEl = document.createElement('div');
    this.hudEl.id = 'abyss-hud-bar';
    this.hudEl.dataset.hitRegion = 'true';
    this.buildHudMarkup();
    this.buildSettingsPopoverMarkup();

    // Close settings popover on outside click
    window.addEventListener('pointerdown', (e) => {
      if (!this.settingsOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (this.settingsPopoverEl.contains(target) || target.closest('[data-act="settings"]'))
      ) {
        return;
      }
      this.setSettingsOpen(false);
    });

    this.orbWrapEl = document.createElement('div');
    this.orbWrapEl.id = 'abyss-orb-wrap';

    this.slackReportEl = document.createElement('div');
    this.slackReportEl.id = 'abyss-slack-report';
    this.buildSlackReportMarkup();

    this.orbEl = document.createElement('button');
    this.orbEl.id = 'abyss-crystal-orb';
    this.orbEl.dataset.hitRegion = 'true';
    this.orbEl.title = t(
      '展开桌底魔王城（后台 20 TPS 照常挂机发育）',
      'Expand Abyss Keeper Pet (20 TPS idle simulation continues in background)',
    );
    this.orbEl.innerHTML = `
      <img src="./assets/ui/demon_heart_badge.webp" class="orb-badge-img" alt="" onerror="this.style.display='none'" />
      <span class="orb-wave" data-orb-wave>W1</span>
      <span class="orb-gold" data-orb-gold>0G</span>
    `;
    this.orbEl.addEventListener('click', () => this.setMinimized(false));

    this.orbWrapEl.append(this.slackReportEl, this.orbEl);

    this.retreatBannerEl = document.createElement('div');
    this.retreatBannerEl.id = 'abyss-retreat-banner';

    this.root.append(
      this.thiefAlertEl,
      this.cutinBannerEl,
      this.storyStageEl,
      this.retreatBannerEl,
      this.bossBarEl,
      this.drawerHost,
      this.relicBannerHost,
      this.tutorialEl,
      this.toastStack,
      this.settingsPopoverEl,
      this.hudEl,
      this.orbWrapEl,
    );
    this.syncHudNumbers();
  }

  private buildBossBarMarkup(): void {
    this.bossBarEl.innerHTML = `
      <div class="boss-bar-head">
        <span data-boss-name>${t('首领来袭', 'Boss Approaching')}</span>
        <span data-boss-hp>0 / 0</span>
      </div>
      <div class="boss-bar-track"><div class="boss-bar-fill" data-boss-fill style="width:100%"></div></div>
    `;
  }

  private buildSlackReportMarkup(): void {
    this.slackReportEl.innerHTML = `
      <div class="slack-title">${t('◆ 深渊摸鱼战报（折叠期间）', '◆ Idle Battle Log (While Folded)')}</div>
      <div class="slack-row"><span>${t('推进波次', 'Waves')}</span><b data-slack-wave>+0</b></div>
      <div class="slack-row"><span>${t('净赚金币', 'Gold')}</span><b data-slack-gold>+0G</b></div>
      <div class="slack-row"><span>${t('捉贼 / 收编', 'Thieves / Aces')}</span><b data-slack-ops>0 · 0</b></div>
      <div class="slack-row"><span>${t('新获圣物', 'Relics')}</span><b data-slack-relics>+0</b></div>
    `;
  }

  /** Rebuilds all static labels cleanly after switching between 中文 and English! */
  public refreshLanguage(): void {
    this.lastTutorialRendered = -1;
    this.buildHudMarkup();
    this.buildSettingsPopoverMarkup();
    this.buildBossBarMarkup();
    this.buildSlackReportMarkup();
    if (this.activeStory) {
      this.activeStory.episode = locStoryScript(
        this.activeStory.storyId,
        this.engine.state.overlordId,
        this.activeStory.heroSpecies,
      );
      this.renderStoryStage();
    }
    this.orbEl.title = t(
      '展开桌底魔王城（后台 20 TPS 照常挂机发育）',
      'Expand Abyss Keeper Pet (20 TPS idle simulation continues in background)',
    );
    this.syncHudNumbers();
    if (this.activeDrawer.kind !== 'none') {
      this.renderDrawer();
    }
    this.opts.onHitRegionsDirty();
  }

  private setSettingsOpen(open: boolean): void {
    this.settingsOpen = open;
    this.settingsPopoverEl.classList.toggle('visible', open);
    const btn = this.hudEl.querySelector<HTMLElement>('[data-act="settings"]');
    if (btn) btn.classList.toggle('active', open);
    this.opts.onHitRegionsDirty();
  }

  private buildSettingsPopoverMarkup(): void {
    const s = this.engine.state;
    const isEn = getLocale() === 'en';
    this.settingsPopoverEl.innerHTML = `
      <div class="settings-pop-title">
        <span>⚙ ${t('音画与语言设置', 'Audio, Display & Language')}</span>
        <button class="drawer-close" data-close-settings="1" style="width:20px;height:20px;font-size:11px;">✕</button>
      </div>
      <div class="settings-pop-row">
        <span>${t('高光立绘横幅', 'Portrait Cut-ins')}</span>
        <button class="gothic-btn" data-act="cutin-mute">${s.cutinMuted ? t('横幅:关', 'Cut:Off') : t('横幅:开', 'Cut:On')}</button>
      </div>
      <div class="settings-pop-row">
        <span>${t('原创哥特 BGM', 'Gothic BGM')}</span>
        <button class="gothic-btn" data-act="bgm">${this.stage.sfx.bgmMuted ? t('乐:关', 'BGM:Off') : t('乐:开', 'BGM:On')}</button>
      </div>
      <div class="settings-pop-row">
        <span>${t('复古音效 SFX', 'Retro SFX')}</span>
        <button class="gothic-btn" data-act="mute">${this.stage.sfx.muted ? t('音:关', 'SFX:Off') : t('音:开', 'SFX:On')}</button>
      </div>
      <div class="settings-pop-row">
        <span>${t('界面语言 Language', 'Language')}</span>
        <button class="gothic-btn" data-act="lang">${isEn ? '中文' : 'EN'}</button>
      </div>
      ${
        this.opts.hasPreResetBackup?.()
          ? `<div class="settings-pop-row">
               <span>${t('重置前备份', 'Pre-Reset Backup')}</span>
               <button class="gothic-btn" data-act="restore-backup">${t('↶ 恢复备份', '↶ Restore')}</button>
             </div>`
          : ''
      }
      <div class="settings-pop-row" style="border-top:1px solid var(--abyss-border-soft); padding-top:6px; margin-top:4px;">
        <span style="color:var(--abyss-crimson-bright);">${t('原子级重置存档', 'Atomic Reset')}</span>
        <button class="gothic-btn crimson" data-act="destroy-world">${t('◈ 毁灭世界', '◈ Destroy World')}</button>
      </div>
    `;
    this.settingsPopoverEl.querySelector('[data-close-settings]')?.addEventListener('click', () => {
      this.setSettingsOpen(false);
    });
    this.settingsPopoverEl.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.addEventListener('click', () => this.handleHudAction(el.dataset.act!, el));
    });
  }

  private buildHudMarkup(): void {
    const s = this.engine.state;
    const sp1 = locSpell('abyss_lightning');
    const sp2 = locSpell('demon_frenzy');
    const sp3 = locSpell('charm_mist');
    const sp4 = locSpell('abyss_blackhole');

    this.hudVals = {};
    this.hudEl.innerHTML = `
      <div class="hud-group">
        <div class="hud-brand" data-act="throne" title="${t('点击升级魔王、强化技能、音画设置或切换 4 位魔王', 'Click to upgrade Overlord, spells, audio/BGM & switch 4 Overlords')}">
          <img src="./assets/pixel/relics/overlord_signet_ring.png" class="pixel-img" width="20" height="20" alt="" />
          <span class="hud-brand-title" data-val="overlord">${escapeHtml(locOverlord(s.overlordId).name)} Lv.${s.overlordLevel}</span>
        </div>
        <div class="hud-stat"><span class="hud-stat-label">${t('金币', 'Gold')}</span><span class="hud-stat-val val-gold" data-val="gold">0</span><span class="hud-bullion-badge" data-val="bullion"></span></div>
        <div class="hud-stat"><span class="hud-stat-label">${t('魔力', 'Mana')}</span><span class="hud-stat-val val-mana" data-val="mana">0</span></div>
        <div class="hud-stat"><span class="hud-stat-label">${t('零件', 'Parts')}</span><span class="hud-stat-val val-parts" data-val="parts">0</span></div>
        <div class="hud-wave-capsule" id="abyss-wave-capsule">
          <span class="wave-num" data-val="waveNum">W1</span>
          <span class="wave-state" data-val="waveState">${t('冲层', 'Push')}</span>
          <span class="wave-clock" data-val="waveClock">16s</span>
          <span class="wave-nap-micro" role="button" tabindex="0" data-act="nap" style="cursor:pointer;margin-left:2px;font-size:11px;color:var(--abyss-gold);opacity:0.9;" title="${t('王座小憩：延长备战 +30s（上限90s）或切换巡航锁波', 'Throne Nap: +30s prep (max 90s) or lock Farm Mode')}">+30s</span>
          <div class="wave-bar-track"><div class="wave-bar-fill" data-val="waveBar"></div></div>
        </div>
      </div>

      <div class="hud-group">
        <button class="gothic-btn crimson" data-act="provoke" title="${t('提前开门迎客（备战期提前召唤可领迎客赏金！）', 'Open the Gates early for an Eager Bounty!')}">${t('⚔ 迎客', '⚔ Open')}</button>
        <button class="gothic-btn spell-btn" data-spell="abyss_lightning" title="${escapeHtml(sp1.name)} (48 ${t('魔力 · 获焦快捷键 1', 'Mana · Focused Key 1')})">
          <span class="spell-cd-pie"></span><span class="spell-hotkey">[1]</span>${escapeHtml(sp1.shortName)} <span class="spell-cd-num" data-spell-cd="abyss_lightning"></span>
        </button>
        <button class="gothic-btn spell-btn" data-spell="demon_frenzy" data-locked="true" title="${escapeHtml(sp2.name)} (58 ${t('魔力 · 获焦快捷键 2', 'Mana · Focused Key 2')})">
          <span class="spell-cd-pie"></span><span class="spell-hotkey">[2]</span>${escapeHtml(sp2.shortName)} <span class="spell-cd-num" data-spell-cd="demon_frenzy"></span>
        </button>
        <button class="gothic-btn spell-btn" data-spell="charm_mist" data-locked="true" title="${escapeHtml(sp3.name)} (68 ${t('魔力 · 获焦快捷键 3', 'Mana · Focused Key 3')})">
          <span class="spell-cd-pie"></span><span class="spell-hotkey">[3]</span>${escapeHtml(sp3.shortName)} <span class="spell-cd-num" data-spell-cd="charm_mist"></span>
        </button>
        <button class="gothic-btn spell-btn" data-spell="abyss_blackhole" data-locked="true" title="${escapeHtml(sp4.name)} (85 ${t('魔力 · 获焦快捷键 4，聚怪配合滚石！', 'Mana · Focused Key 4, great Boulder setup!')})">
          <span class="spell-cd-pie"></span><span class="spell-hotkey">[4]</span>${escapeHtml(sp4.shortName)} <span class="spell-cd-num" data-spell-cd="abyss_blackhole"></span>
        </button>
      </div>

      <div class="hud-group">
        <button class="gothic-btn" data-act="build">${t('造物修建', 'Build')}</button>
        <button class="gothic-btn" data-act="recruit">${t('招募麾下', 'Recruit')}</button>
        <button class="gothic-btn" data-act="torture" data-locked="true">${t('刑讯调教', 'Torture')} <span data-val="prisoners"></span></button>
        <button class="gothic-btn" data-act="altar" data-locked="true">${t('合成祭坛', 'Altar')}</button>
        <button class="gothic-btn" data-act="relics" data-locked="true">${t('圣物', 'Relics')} <span data-val="relics">0/30</span></button>
        <button class="gothic-btn" data-act="prestige" data-locked="true">${t('科技·轮回', 'Tech')}</button>
        <button class="gothic-btn" data-act="settings" title="${t('设置：横幅 / BGM / SFX / 中英语言', 'Settings: Cut-ins / BGM / SFX / Language')}">⚙</button>
        <button class="gothic-btn crimson" data-act="minimize" title="${t('摸鱼隐身：一键折叠为右下角深渊魔心徽章', 'Stealth Fold: Collapse to bottom-right Demon Heart Badge')}">${t('魔心徽章', 'Badge')}</button>
      </div>
    `;

    this.hudEl.querySelectorAll<HTMLElement>('[data-val]').forEach((el) => {
      this.hudVals[el.dataset.val!] = el;
    });

    this.hudEl.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.addEventListener('click', () => this.handleHudAction(el.dataset.act!, el));
    });

    this.hudEl.querySelectorAll<HTMLElement>('[data-spell]').forEach((el) => {
      el.addEventListener('click', () => {
        const spellId = el.dataset.spell as SpellId;
        if (this.engine.castSpell(spellId)) {
          this.showToast(t(`施放神迹【${locSpell(spellId).name}】！`, `Cast Miracle [${locSpell(spellId).name}]!`));
        } else {
          this.showToast(t('魔力不足、冷却中或当前无入侵勇者', 'Insufficient Mana, on cooldown, or no active heroes'));
        }
      });
    });
  }

  public syncAudioButtons(): void {
    const bgmBtn = this.settingsPopoverEl.querySelector<HTMLElement>('[data-act="bgm"]');
    if (bgmBtn) bgmBtn.textContent = this.stage.sfx.bgmMuted ? t('乐:关', 'BGM:Off') : t('乐:开', 'BGM:On');
    const muteBtn = this.settingsPopoverEl.querySelector<HTMLElement>('[data-act="mute"]');
    if (muteBtn) muteBtn.textContent = this.stage.sfx.muted ? t('音:关', 'SFX:Off') : t('音:开', 'SFX:On');
  }

  private handleHudAction(action: string, el: HTMLElement): void {
    switch (action) {
      case 'throne':
        this.toggleGrimoire('throne');
        break;
      case 'build':
        this.toggleGrimoire('build');
        break;
      case 'recruit':
        this.toggleGrimoire('recruit');
        break;
      case 'relics':
        this.toggleGrimoire('relics');
        break;
      case 'prestige':
        this.toggleGrimoire('prestige');
        break;
      case 'torture':
        if (this.activeDrawer.kind === 'torture') this.closeDrawer();
        else this.openDrawer({ kind: 'torture' });
        break;
      case 'altar':
        if (this.activeDrawer.kind === 'altar') this.closeDrawer();
        else this.openDrawer({ kind: 'altar' });
        break;
      case 'nap': {
        const s = this.engine.state;
        const live = s.heroes.some((h) => !h.downedForCapture && h.hp > 0);
        if (!live && this.engine.extendPrep(30)) {
          this.showToast(
            t('王座小憩 +30s！「让门口的勇者排号等着，迟到是反派的特权。」', 'Throne Nap +30s! "Let the heroes wait in line—tardiness is a villain’s privilege."'),
          );
          this.syncHudNumbers();
        } else {
          s.autoRetryBoss = !s.autoRetryBoss;
          if (!s.autoRetryBoss) s.farmMode = true;
          this.showToast(
            s.autoRetryBoss
              ? t('已恢复自动冲层！', 'Auto-push resumed!')
              : t('已锁定安稳巡航，魔王喝茶发育中~', 'Locked into Safe Cruise—Overlord sipping tea~'),
          );
          this.syncHudNumbers();
        }
        break;
      }
      case 'provoke':
        if (this.engine.provokeNextWave({ eager: true })) {
          this.hideRetreatBanner();
          this.stage.sfx.play('payday_bell', 0.65);
          this.showToast(
            t(
              `提前开门迎客！第 ${this.engine.state.wave} 波勇者踏入杀阵！`,
              `Gates opened early! Wave ${this.engine.state.wave} marches into the kill corridor!`,
            ),
          );
        } else {
          this.showToast(t('当前波次激战中，请先清剿勇者！', 'Wave already in progress—clear current heroes first!'));
        }
        break;
      case 'destroy-world':
        this.setSettingsOpen(false);
        this.openDestroyWorldModal();
        break;
      case 'restore-backup':
        this.setSettingsOpen(false);
        if (!this.opts.onRestoreBackup?.()) {
          this.showToast(t('未找到可恢复的重置前备份。', 'No valid pre-reset backup found.'));
        }
        break;
      case 'cutin-mute': {
        this.engine.state.cutinMuted = !this.engine.state.cutinMuted;
        el.textContent = this.engine.state.cutinMuted ? t('横幅:关', 'Cut:Off') : t('横幅:开', 'Cut:On');
        break;
      }
      case 'bgm': {
        this.stage.sfx.unlockAudio();
        const muted = this.stage.sfx.toggleBgmMute();
        this.syncAudioButtons();
        this.showToast(muted ? t('BGM 已静音', 'BGM Muted') : t('原创深渊 BGM 已开启', 'Gothic BGM Enabled'));
        if (this.activeDrawer.kind === 'grimoire' && this.activeDrawer.tab === 'throne') {
          this.renderDrawer();
        }
        break;
      }
      case 'mute': {
        this.toggleMute();
        if (this.activeDrawer.kind === 'grimoire' && this.activeDrawer.tab === 'throne') {
          this.renderDrawer();
        }
        break;
      }
      case 'lang': {
        const next = toggleLocale();
        this.refreshLanguage();
        this.showToast(next === 'en' ? 'Language switched to English' : '已切换为简体中文');
        break;
      }
      case 'settings':
        this.setSettingsOpen(!this.settingsOpen);
        break;
      case 'minimize':
        this.setSettingsOpen(false);
        this.setMinimized(true);
        break;
    }
  }

  // ===== V2.3 Abyssal Light Narrative Story Stage =====

  public handleFeatureUnlocked(_features: FeatureId[], text?: string): void {
    if (text) this.showToast(text);
    this.syncHudNumbers();
  }

  public enqueueStory(storyId: StoryId, heroSpecies?: HeroSpeciesId, isReplay = false): void {
    if (!isReplay && this.engine.state.prestige.storySeen.includes(storyId)) return;
    if (this.activeStory?.storyId === storyId) return;
    if (!isReplay && this.storyQueue.some((q) => q.storyId === storyId)) return;

    if (isReplay) {
      this.closeDrawer();
      this.playStoryNow(storyId, heroSpecies, true);
      return;
    }

    if (this.minimized || this.activeDrawer.kind !== 'none' || this.activeStory !== null) {
      if (this.storyQueue.length < 2) {
        this.storyQueue.push({ storyId, heroSpecies });
      }
      return;
    }
    this.playStoryNow(storyId, heroSpecies, false);
  }

  private playStoryNow(storyId: StoryId, heroSpecies?: HeroSpeciesId, isReplay = false): void {
    this.engine.markStorySeen(storyId);
    // Suppress Cut-in banner while Story Stage plays
    this.cutinBannerEl.classList.remove('active');
    if (this.cutinTimer !== null) {
      window.clearTimeout(this.cutinTimer);
      this.cutinTimer = null;
    }

    const episode = locStoryScript(storyId, this.engine.state.overlordId, heroSpecies);
    this.activeStory = {
      storyId,
      heroSpecies,
      lineIndex: 0,
      episode,
      replay: isReplay,
    };
    this.tutorialEl.classList.add('story-paused');
    this.storyStageEl.dataset.hitRegion = 'true';
    this.storyStageEl.classList.add('active');
    this.storyStageEl.classList.toggle('above-boss', this.bossBarEl.classList.contains('visible'));
    this.renderStoryStage();
    this.scheduleStoryAutoAdvance();
    this.opts.onHitRegionsDirty();
  }

  private scheduleStoryAutoAdvance(): void {
    if (this.storyAutoTimer !== null) {
      window.clearTimeout(this.storyAutoTimer);
      this.storyAutoTimer = null;
    }
    if (!this.activeStory || this.storyHovered) return;
    this.storyAutoTimer = window.setTimeout(() => {
      this.advanceStoryLine();
    }, 4200);
  }

  public advanceStoryLine(): void {
    if (!this.activeStory) return;
    if (this.activeStory.lineIndex + 1 < this.activeStory.episode.lines.length) {
      this.activeStory.lineIndex += 1;
      this.renderStoryStage();
      this.scheduleStoryAutoAdvance();
    } else {
      this.closeStoryStage();
    }
  }

  public closeStoryStage(): void {
    if (this.storyAutoTimer !== null) {
      window.clearTimeout(this.storyAutoTimer);
      this.storyAutoTimer = null;
    }
    this.activeStory = null;
    this.storyStageEl.classList.remove('active', 'above-boss');
    delete this.storyStageEl.dataset.hitRegion;
    this.storyStageEl.innerHTML = '';
    this.tutorialEl.classList.remove('story-paused');
    this.opts.onHitRegionsDirty();
    this.tryDrainStoryQueue();
  }

  public clearStoryQueue(): void {
    this.storyQueue = [];
    this.closeStoryStage();
  }

  private tryDrainStoryQueue(): void {
    if (this.minimized || this.activeDrawer.kind !== 'none' || this.activeStory !== null) return;
    const next = this.storyQueue.shift();
    if (next) {
      this.playStoryNow(next.storyId, next.heroSpecies, false);
    }
  }

  private renderStoryStage(): void {
    if (!this.activeStory) return;
    const { episode, lineIndex } = this.activeStory;
    const line = episode.lines[lineIndex];
    if (!line) return;
    const total = episode.lines.length;
    const isLast = lineIndex + 1 >= total;

    this.storyStageEl.innerHTML = `
      <div class="story-portrait-col">
        <img class="story-portrait-img" src="./assets/portraits/${line.portraitKey}.webp" alt="${escapeHtml(line.speakerName)}" />
      </div>
      <div class="story-content-col">
        <div class="story-header-row">
          <span class="story-speaker-name accent-${line.accent}">${escapeHtml(line.speakerName)}</span>
          <span class="story-ep-title">${escapeHtml(episode.title)}</span>
        </div>
        <div class="story-dialogue-text">${escapeHtml(line.text)}</div>
        <div class="story-footer-row">
          <span class="story-progress-dots">${lineIndex + 1} / ${total}</span>
          <div class="story-controls">
            <button class="gothic-btn" data-story-next="1">${isLast ? t('收起 ✓', 'Finish ✓') : t('下一句 ▸', 'Next ▸')}</button>
            <button class="gothic-btn" data-story-skip="1">${t('跳过 ×', 'Skip ×')}</button>
          </div>
        </div>
      </div>
    `;
    this.storyStageEl.querySelector('[data-story-next]')?.addEventListener('click', () => this.advanceStoryLine());
    this.storyStageEl.querySelector('[data-story-skip]')?.addEventListener('click', () => this.closeStoryStage());
  }

  /**
   * Restrained 1.6s Portrait Cut-in Banner (<= 180px, pointer-events: none):
   * - Completely silent when minimized into Demon Heart Badge or muted
   * - Global >= 45s throttle (manual spell cut-in also has 15s throttle)
   */
  public triggerCutin(
    payload: { subId: string; label: string; color?: number },
    forceForPreview = false,
  ): boolean {
    if (this.minimized || this.engine.state.cutinMuted) return false;
    if (this.activeStory !== null && !forceForPreview) return false;
    const now = performance.now();
    const isSpell = payload.subId.startsWith('spell:');
    if (!forceForPreview) {
      if (now - this.lastCutinGlobalMs < 45_000) return false;
      if (isSpell && now - this.lastCutinSpellMs < 15_000) return false;
    }
    this.lastCutinGlobalMs = now;
    if (isSpell) this.lastCutinSpellMs = now;

    const s = this.engine.state;
    let portraitKey = OVERLORD_DEFS[s.overlordId].portraitKey;
    let tagText = t('★ 深渊神迹 ★', '★ ABYSSAL MIRACLE ★');
    if (payload.subId.startsWith('convert:')) {
      const sp = payload.subId.slice('convert:'.length) as AbyssalSpeciesId;
      portraitKey = ABYSSAL_UNIT_DEFS[sp]?.portraitKey ?? portraitKey;
      tagText = t('★ 三阶王牌收编 ★', '★ TIER 3 ACE CONVERTED ★');
    } else if (payload.subId.startsWith('boss:')) {
      const hsp = payload.subId.slice('boss:'.length) as HeroSpeciesId;
      portraitKey = HERO_DEFS[hsp]?.portraitKey ?? portraitKey;
      tagText = t('★ 圣堂首领空降 ★', '★ CATHEDRAL BOSS ARRIVES ★');
    } else if (payload.subId === 'thief_caught') {
      portraitKey = HERO_DEFS.dwarf_gold_thief.portraitKey;
      tagText = t('★ 魔王之手擒贼 ★', '★ HAND OF EVIL BUST ★');
    }

    if (this.cutinTimer !== null) window.clearTimeout(this.cutinTimer);
    this.cutinBannerEl.innerHTML = `
      <img class="cutin-portrait" src="./assets/portraits/${portraitKey}.webp" alt="" />
      <div>
        <div class="cutin-tag">${tagText}</div>
        <div class="cutin-title">${escapeHtml(payload.label)}</div>
      </div>
    `;
    this.cutinBannerEl.classList.add('active');
    this.cutinTimer = window.setTimeout(() => {
      this.cutinBannerEl.classList.remove('active');
    }, 1600);
    return true;
  }

  public toggleMute(): boolean {
    const next = !this.stage.sfx.muted;
    this.stage.sfx.setSfxMuted(next);
    this.syncAudioButtons();
    return next;
  }

  public setMinimized(minimized: boolean): void {
    this.minimized = minimized;
    this.stage.setMinimized(minimized);
    const s = this.engine.state;
    if (minimized) {
      // V2.4 Triple Fuse #2: Folding into Demon Heart Badge ALWAYS reverts Extreme Voltage to Safeword!
      if (s.noMercyMode) {
        this.engine.setNoMercyMode(false);
      }
      this.chronicleSnapshot = { ...(s.chronicle ?? {}) };
      this.minimizeStartSec = s.elapsedSeconds;
      this.stage.presence.resetNapCount();
      this.slackSnapshot = {
        startWave: s.wave,
        startGoldEarned: s.metrics.totalGoldEarned,
        startThieves: s.metrics.totalThievesCaught,
        startConverted: s.metrics.totalCaptivesConverted,
        startRelics: s.relics.length,
      };
      this.closeDrawer();
      this.hideRetreatBanner();
      this.setSettingsOpen(false);
      if (this.activeStory) {
        this.storyQueue.unshift({ storyId: this.activeStory.storyId, heroSpecies: this.activeStory.heroSpecies });
        if (this.storyQueue.length > 2) this.storyQueue.length = 2;
        this.closeStoryStage();
      }
      this.cutinBannerEl.classList.remove('active');
      this.bossBarEl.classList.remove('visible');
      this.hudEl.style.display = 'none';
      this.tutorialEl.style.display = 'none';
      this.orbWrapEl.classList.add('visible');
    } else {
      this.hudEl.style.display = 'flex';
      this.orbWrapEl.classList.remove('visible');
      this.renderTutorialBar();
      this.tryDrainStoryQueue();
      // V2.4 Show 《深渊八卦小报》 if notable events or naps occurred while folded
      if (this.chronicleSnapshot) {
        const elapsed = Math.max(0, s.elapsedSeconds - this.minimizeStartSec);
        const naps = this.stage.presence.getNapCount();
        const hasDelta =
          naps > 0 ||
          elapsed >= 120 ||
          Object.keys(s.chronicle ?? {}).some(
            (k) => ((s.chronicle as Record<string, number>)[k] ?? 0) > ((this.chronicleSnapshot as Record<string, number>)[k] ?? 0),
          );
        const beforeSnap = this.chronicleSnapshot;
        this.chronicleSnapshot = null;
        if (hasDelta) {
          this.openGazetteModal(beforeSnap, { ...(s.chronicle ?? {}) }, naps, elapsed);
        }
      }
    }
    this.opts.onToggleMinimize(minimized);
    this.opts.onHitRegionsDirty();
  }

  public showRetreatBanner(retreatWave: number): void {
    if (this.minimized) return;
    if (this.retreatBannerTimer !== null) window.clearTimeout(this.retreatBannerTimer);
    const oDef = OVERLORD_DEFS[this.engine.state.overlordId];
    this.retreatBannerEl.innerHTML = `
      <img class="retreat-portrait" src="./assets/portraits/${oDef.portraitKey}.webp" alt="" />
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:var(--abyss-gold); margin-bottom:2px;">
          ${t('「哼，这不叫战败，这叫『战略性撤退』。正义从来撑不过一个周末。」', '"Hmph. Not defeat—a STRATEGIC RETREAT. Justice never lasts a weekend."')}
        </div>
        <div style="font-size:11px; color:var(--abyss-muted);">
          ${t(`已自动退回 W${retreatWave} 养精蓄锐（连败自动拉长巡航发育周期）。`, `Stepped back to W${retreatWave} to regroup (streak backoff active).`)}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="gothic-btn active" data-retreat-cruise="1">${t('◆ 退守巡航', '◆ Lock Cruise')}</button>
        <button class="gothic-btn crimson" data-retreat-retry="1">${t('⚔ 偏要再冲', '⚔ Retry Now')}</button>
        <button class="gothic-btn" data-retreat-upgrade="1">${t('✦ 强化', '✦ Upgrade')}</button>
      </div>
    `;
    this.retreatBannerEl.dataset.hitRegion = 'true';
    this.retreatBannerEl.classList.add('visible');
    this.retreatBannerEl.querySelector('[data-retreat-cruise]')?.addEventListener('click', () => {
      this.engine.state.autoRetryBoss = false;
      this.engine.state.farmMode = true;
      this.hideRetreatBanner();
      this.showToast(t('已锁定安稳巡航，魔王正在喝茶~', 'Locked into Safe Cruise—Overlord sipping tea~'));
      this.syncHudNumbers();
    });
    this.retreatBannerEl.querySelector('[data-retreat-retry]')?.addEventListener('click', () => {
      this.hideRetreatBanner();
      this.engine.provokeNextWave({ eager: true });
      this.syncHudNumbers();
    });
    this.retreatBannerEl.querySelector('[data-retreat-upgrade]')?.addEventListener('click', () => {
      this.hideRetreatBanner();
      this.openGrimoire('throne');
    });
    this.retreatBannerTimer = window.setTimeout(() => this.hideRetreatBanner(), 12000);
    this.opts.onHitRegionsDirty();
  }

  public hideRetreatBanner(): void {
    if (this.retreatBannerTimer !== null) {
      window.clearTimeout(this.retreatBannerTimer);
      this.retreatBannerTimer = null;
    }
    this.retreatBannerEl.classList.remove('visible');
    delete this.retreatBannerEl.dataset.hitRegion;
    this.retreatBannerEl.innerHTML = '';
    this.opts.onHitRegionsDirty();
  }

  public openGazetteModal(
    before: Partial<Record<ChronicleKey, number>>,
    after: Partial<Record<ChronicleKey, number>>,
    slackerNaps: number,
    elapsedSec: number,
    summary?: { gold: number; bullion?: number; mana: number; xp: number; converted: number },
  ): void {
    this.openDrawer({ kind: 'gazette', before, after, slackerNaps, elapsedSec, summary });
  }

  public openDestroyWorldModal(): void {
    this.openDrawer({ kind: 'destroy_world' });
  }

  public showToast(message: string): void {
    const div = document.createElement('div');
    div.className = 'abyss-toast';
    div.textContent = message;
    this.toastStack.appendChild(div);
    while (this.toastStack.children.length > 4) {
      this.toastStack.firstElementChild?.remove();
    }
    window.setTimeout(() => div.remove(), 4200);
  }

  /** Dramatic Gothic Relic Acquisition Celebration Banner! */
  public showRelicBanner(relicId: RelicId): void {
    const def = RELIC_MAP[relicId];
    if (!def) return;
    const rLoc = locRelic(relicId);
    if (this.relicBannerTimer !== null) {
      window.clearTimeout(this.relicBannerTimer);
    }
    const rarityLbl =
      def.rarity === 'abyssal'
        ? t('深渊至宝', 'Abyssal Relic')
        : def.rarity === 'rare'
          ? t('稀有圣物', 'Rare Relic')
          : t('地牢遗物', 'Dungeon Relic');
    this.relicBannerHost.innerHTML = `
      <div class="relic-celebration-banner rarity-${def.rarity}" data-hit-region="true">
        <div class="relic-banner-glow"></div>
        <img src="./assets/pixel/relics/${def.id}.png" class="pixel-img relic-banner-icon" width="52" height="52" alt="" />
        <div class="relic-banner-info">
          <div class="relic-banner-tag">${t(`★ 获得全局圣物 · ${rarityLbl} ★`, `★ RELIC ACQUIRED · ${rarityLbl} ★`)}</div>
          <div class="relic-banner-name">${escapeHtml(rLoc.name)}</div>
          <div class="relic-banner-eff">${escapeHtml(rLoc.effect)}</div>
          <div class="relic-banner-lore">${t(`“${escapeHtml(rLoc.lore)}”`, `"${escapeHtml(rLoc.lore)}"`)}</div>
        </div>
        <button class="gothic-btn" data-close-banner="1">${t('收入圣物架', 'Claim')}</button>
      </div>
    `;
    this.relicBannerHost.querySelector('[data-close-banner]')?.addEventListener('click', () => {
      this.relicBannerHost.innerHTML = '';
      this.opts.onHitRegionsDirty();
    });
    this.opts.onHitRegionsDirty();
    this.relicBannerTimer = window.setTimeout(() => {
      this.relicBannerHost.innerHTML = '';
      this.opts.onHitRegionsDirty();
    }, 5200);
  }

  /** Brief crimson screen-edge pulse when a Thief steals from Backyard Treasury! */
  public flashThiefAlert(stolenGold: number): void {
    if (this.thiefAlertTimer !== null) window.clearTimeout(this.thiefAlertTimer);
    this.thiefAlertEl.classList.add('active');
    this.showToast(
      t(
        `警报！偷金女贼潜入后院宝库偷走 ${stolenGold}G！左键可拎起她摔回陷阱！`,
        `ALERT! Vault Thief stole ${stolenGold}G from Backyard Treasury! Left-drag her into traps!`,
      ),
    );
    this.thiefAlertTimer = window.setTimeout(() => {
      this.thiefAlertEl.classList.remove('active');
    }, 2600);
  }

  private renderTutorialBar(): void {
    const s = this.engine.state;
    // Defer Tutorial Step 6 (Build Torture Chamber) until W2 unlocks corruption room!
    // V2.5: Auto-yield whenever any drawer or modal (torture, gazette, grimoire, etc.) is open!
    const stepDeferred = s.tutorialStep === 6 && !this.engine.isFeatureUnlocked('room_corruption');
    if (
      this.minimized ||
      this.activeDrawer.kind !== 'none' ||
      s.tutorialDismissed ||
      s.tutorialStep >= TUTORIAL_STEPS.length ||
      stepDeferred
    ) {
      this.tutorialEl.style.display = 'none';
      this.tutorialEl.innerHTML = '';
      if (this.lastTutorialRendered !== -2) {
        this.lastTutorialRendered = -2;
        this.opts.onHitRegionsDirty();
      }
      return;
    }
    if (this.lastTutorialRendered === s.tutorialStep) return;
    this.lastTutorialRendered = s.tutorialStep;
    const stepDef = TUTORIAL_STEPS[s.tutorialStep]!;
    const stepLoc = locTutorialStep(s.tutorialStep);
    this.tutorialEl.style.display = 'flex';
    this.tutorialEl.innerHTML = `
      <div class="tut-badge">${t(`魔王秘书指引 ${s.tutorialStep + 1}/${TUTORIAL_STEPS.length}`, `Guide ${s.tutorialStep + 1}/${TUTORIAL_STEPS.length}`)}</div>
      <div class="tut-text">
        <b>${escapeHtml(stepLoc.title)}</b>${t('：', ': ')}${escapeHtml(stepLoc.hint)}
        <span class="tut-reward">${t(`（奖 +${stepDef.rewardGold}G / +${stepDef.rewardParts}零件）`, ` (+${stepDef.rewardGold}G / +${stepDef.rewardParts} Parts)`)}</span>
      </div>
      <button class="gothic-btn" data-skip-tut="1">${t('跳过指引', 'Skip')}</button>
    `;
    this.tutorialEl.querySelector('[data-skip-tut]')?.addEventListener('click', () => {
      this.engine.dismissTutorial();
      this.renderTutorialBar();
    });
    this.opts.onHitRegionsDirty();
  }

  public openPortrait(unitId: string): void {
    this.openDrawer({ kind: 'portrait', unitId });
  }

  public toggleGrimoire(tab: GrimoireTab, focusSlot?: number): void {
    if (this.activeDrawer.kind === 'grimoire' && this.activeDrawer.tab === tab && focusSlot === undefined) {
      this.closeDrawer();
      return;
    }
    this.openGrimoire(tab, focusSlot);
  }

  public openGrimoire(tab: GrimoireTab, focusSlot?: number): void {
    this.openDrawer({ kind: 'grimoire', tab, focusSlot });
  }

  public openDrawer(drawer: ActiveDrawer): void {
    if (this.minimized) this.setMinimized(false);
    this.setSettingsOpen(false);
    this.activeDrawer = drawer;
    if (this.activeStory) {
      if (!this.activeStory.replay) {
        this.storyQueue.unshift({
          storyId: this.activeStory.storyId,
          heroSpecies: this.activeStory.heroSpecies,
        });
        if (this.storyQueue.length > 2) this.storyQueue.length = 2;
      }
      this.closeStoryStage();
    }
    this.renderDrawer();
    this.renderTutorialBar();
    this.opts.onHitRegionsDirty();
  }

  public closeDrawer(): void {
    this.activeDrawer = { kind: 'none' };
    this.drawerHost.innerHTML = '';
    this.renderTutorialBar();
    this.opts.onHitRegionsDirty();
    this.tryDrainStoryQueue();
  }

  public syncHudNumbers(): void {
    const s = this.engine.state;
    const oLoc = locOverlord(s.overlordId);
    if (this.hudVals.overlord) this.hudVals.overlord.textContent = `${oLoc.name} Lv.${s.overlordLevel}`;
    if (this.hudVals.gold) this.hudVals.gold.textContent = `${fmtNum(s.gold)} / ${fmtNum(s.goldCap)}`;
    if (this.hudVals.bullion) {
      const bVal = Math.floor(s.bullion ?? 0);
      this.hudVals.bullion.textContent = bVal > 0 ? `▪+${fmtNum(bVal)}` : '';
      this.hudVals.bullion.title =
        bVal > 0
          ? t(
              `暗金金砖窖：${fmtNum(bVal)} / ${fmtNum(s.bullionCap)}（花钱时自动 1:1 拍碎回流）`,
              `Dark-Gold Bullion Vault: ${fmtNum(bVal)} / ${fmtNum(s.bullionCap)} (auto 1:1 refill on spend)`,
            )
          : '';
    }
    if (this.hudVals.mana) this.hudVals.mana.textContent = `${fmtNum(s.mana)} / ${fmtNum(s.manaCap)}`;
    if (this.hudVals.parts) this.hudVals.parts.textContent = `${Math.floor(s.trapParts)} / ${s.trapPartsCap}`;
    // V2.4 Fixed-width zero-jitter wave capsule (3 fixed-ch spans + scaleX bar)
    const liveHeroesCount = s.heroes.filter((h) => !h.downedForCapture && h.hp > 0).length;
    if (this.hudVals.waveNum) this.hudVals.waveNum.textContent = `W${s.wave}`;
    if (this.hudVals.waveState) {
      if (s.heartReviveTimer > 0) {
        this.hudVals.waveState.textContent = t('重组', 'Reform');
      } else if (liveHeroesCount > 0) {
        this.hudVals.waveState.textContent = t('迎战', 'Fight');
      } else if (s.farmMode && !s.autoRetryBoss) {
        this.hudVals.waveState.textContent = t('锁巡', 'Cruise');
      } else if (s.farmMode) {
        this.hudVals.waveState.textContent = t('巡航', 'Farm');
      } else {
        this.hudVals.waveState.textContent = t('冲层', 'Push');
      }
    }
    if (this.hudVals.waveClock) {
      if (s.heartReviveTimer > 0) {
        this.hudVals.waveClock.textContent = `${Math.ceil(s.heartReviveTimer)}s`;
      } else if (liveHeroesCount > 0) {
        this.hudVals.waveClock.textContent = `${liveHeroesCount}/${s.heroes.length}`;
      } else {
        this.hudVals.waveClock.textContent = `${Math.max(0, Math.ceil(s.waveTimer))}s`;
      }
    }
    if (this.hudVals.waveBar) {
      const ratio =
        s.heartReviveTimer > 0
          ? 1 - s.heartReviveTimer / BALANCE_CONFIG.heartReviveDurationSec
          : liveHeroesCount > 0
            ? Math.min(1, liveHeroesCount / Math.max(1, s.heroes.length))
            : Math.max(0, Math.min(1, s.waveTimer / 45));
      this.hudVals.waveBar.style.transform = `scaleX(${ratio.toFixed(3)})`;
    }
    if (this.hudVals.prisoners) {
      this.hudVals.prisoners.textContent = s.prisoners.length > 0 ? `(${s.prisoners.length})` : '';
    }
    if (this.hudVals.relics) {
      this.hudVals.relics.textContent = `${s.relics.length}/30`;
    }

    const ow = this.orbEl.querySelector<HTMLElement>('[data-orb-wave]');
    const og = this.orbEl.querySelector<HTMLElement>('[data-orb-gold]');
    if (ow) ow.textContent = `W${s.wave}`;
    if (og) og.textContent = `${fmtNum(s.gold)}G`;

    // Three-state Demon Heart Badge ring (safe violet / combat crimson / reward gold) + hover Slack Report!
    const hasCombat = s.heroes.some((h) => !h.downedForCapture && h.hp > 0);
    const hasReward =
      s.prisoners.length > 0 ||
      (this.slackSnapshot !== null && s.relics.length > this.slackSnapshot.startRelics);
    this.orbEl.classList.toggle('state-combat', hasCombat);
    this.orbEl.classList.toggle('state-reward', !hasCombat && hasReward);

    if (this.slackSnapshot) {
      const dw = Math.max(0, s.wave - this.slackSnapshot.startWave);
      const dg = Math.max(0, s.metrics.totalGoldEarned - this.slackSnapshot.startGoldEarned);
      const dt = Math.max(0, s.metrics.totalThievesCaught - this.slackSnapshot.startThieves);
      const dc = Math.max(0, s.metrics.totalCaptivesConverted - this.slackSnapshot.startConverted);
      const dr = Math.max(0, s.relics.length - this.slackSnapshot.startRelics);
      const sw = this.slackReportEl.querySelector<HTMLElement>('[data-slack-wave]');
      const sg = this.slackReportEl.querySelector<HTMLElement>('[data-slack-gold]');
      const so = this.slackReportEl.querySelector<HTMLElement>('[data-slack-ops]');
      const sr = this.slackReportEl.querySelector<HTMLElement>('[data-slack-relics]');
      if (sw) sw.textContent = t(`+${dw} 波 (当前 W${s.wave})`, `+${dw} Waves (Now W${s.wave})`);
      if (sg) sg.textContent = `+${fmtNum(dg)}G`;
      if (so) so.textContent = t(`${dt} 贼 · ${dc} 王牌`, `${dt} Thieves · ${dc} Aces`);
      if (sr) sr.textContent = t(`+${dr} 件`, `+${dr}`);
    }

    // V2.3 Progressive Unlock HUD Gating (pure attribute toggle, ZERO innerHTML rebuild!)
    const setLocked = (selector: string, unlocked: boolean): void => {
      const btn = this.hudEl.querySelector<HTMLElement>(selector);
      if (!btn) return;
      btn.dataset.locked = unlocked ? 'false' : 'true';
    };
    setLocked('[data-act="torture"]', this.engine.isFeatureUnlocked('room_corruption'));
    setLocked('[data-act="altar"]', this.engine.isFeatureUnlocked('room_altar'));
    setLocked('[data-act="relics"]', this.engine.isFeatureUnlocked('tab_relics'));
    setLocked('[data-act="prestige"]', this.engine.isFeatureUnlocked('tab_prestige'));

    // 4 Spell Radial Cooldown Pies + No-Mana Gray State + Lock Gating (incremental DOM patch!)
    const mods = this.engine.getMods();
    for (const spId of SPELL_LIST) {
      const btn = this.hudEl.querySelector<HTMLElement>(`[data-spell="${spId}"]`);
      if (!btn) continue;
      btn.dataset.locked = this.engine.isSpellUnlocked(spId) ? 'false' : 'true';
      const def = SPELL_DEFS[spId];
      const maxCd = Math.max(1, def.cooldownSec * mods.spellCooldownMult);
      const rem = Math.max(0, s.spellCooldowns[spId] ?? 0);
      const onCd = rem > 0.05;
      btn.classList.toggle('on-cd', onCd);
      btn.classList.toggle('no-mana', !onCd && s.mana < def.manaCost);
      const pie = btn.querySelector<HTMLElement>('.spell-cd-pie');
      const num = btn.querySelector<HTMLElement>('.spell-cd-num');
      if (pie && onCd) {
        const deg = Math.min(360, Math.round((rem / maxCd) * 360));
        pie.style.setProperty('--cd-deg', `${deg}deg`);
      }
      if (num) num.textContent = onCd ? `${Math.ceil(rem)}s` : '';
    }

    // Drain newly unlocked HUD pulse highlights
    if (s.progression?.pendingUnlockPulse && s.progression.pendingUnlockPulse.length > 0) {
      const keys = s.progression.pendingUnlockPulse.splice(0, s.progression.pendingUnlockPulse.length);
      for (const k of keys) {
        const sel = k.startsWith('spell:')
          ? `[data-spell="${k.slice(6)}"]`
          : k.startsWith('act:')
            ? `[data-act="${k.slice(4)}"]`
            : '';
        if (!sel) continue;
        const btn = this.hudEl.querySelector<HTMLElement>(sel);
        if (btn) {
          btn.classList.remove('unlock-pulse');
          void btn.offsetWidth;
          btn.classList.add('unlock-pulse');
          window.setTimeout(() => btn.classList.remove('unlock-pulse'), 2400);
        }
      }
    }

    // Independent Top Boss Pressure HP Bar (pure incremental DOM patch!)
    const activeBoss = !this.minimized
      ? s.heroes.find((h) => h.isBoss && !h.downedForCapture && h.hp > 0)
      : undefined;
    if (activeBoss) {
      this.bossBarEl.classList.add('visible');
      const bn = this.bossBarEl.querySelector<HTMLElement>('[data-boss-name]');
      const bh = this.bossBarEl.querySelector<HTMLElement>('[data-boss-hp]');
      const bf = this.bossBarEl.querySelector<HTMLElement>('[data-boss-fill]');
      const pct = Math.max(0, Math.min(100, (activeBoss.hp / Math.max(1, activeBoss.maxHp)) * 100));
      if (bn) bn.textContent = t(`◆ 首领威压 · ${locHeroName(activeBoss)} (W${activeBoss.wave})`, `◆ BOSS · ${locHeroName(activeBoss)} (W${activeBoss.wave})`);
      if (bh) bh.textContent = `${fmtNum(Math.ceil(activeBoss.hp))} / ${fmtNum(activeBoss.maxHp)}`;
      if (bf) bf.style.width = `${pct.toFixed(1)}%`;
    } else {
      this.bossBarEl.classList.remove('visible');
    }
    if (this.activeStory) {
      this.storyStageEl.classList.toggle('above-boss', Boolean(activeBoss));
    }

    const cutBtn = this.settingsPopoverEl.querySelector<HTMLElement>('[data-act="cutin-mute"]');
    if (cutBtn) cutBtn.textContent = s.cutinMuted ? t('横幅:关', 'Cut:Off') : t('横幅:开', 'Cut:On');
    this.syncAudioButtons();

    this.renderTutorialBar();

    // Smoothly patch Portrait Drawer stats WITHOUT rebuilding DOM!
    const currentDrawer = this.activeDrawer;
    if (currentDrawer.kind === 'portrait') {
      const u = s.units.find((x) => x.id === currentDrawer.unitId);
      if (u) {
        const hpEl = this.drawerHost.querySelector<HTMLElement>('[data-p-hp]');
        const atkEl = this.drawerHost.querySelector<HTMLElement>('[data-p-atk]');
        const satEl = this.drawerHost.querySelector<HTMLElement>('[data-p-sat]');
        const hapEl = this.drawerHost.querySelector<HTMLElement>('[data-p-hap]');
        if (hpEl) hpEl.textContent = `${Math.ceil(u.hp)} / ${u.maxHp}`;
        if (atkEl) atkEl.textContent = `${u.atk}`;
        if (satEl) satEl.textContent = `${Math.round(u.satiety)}%`;
        if (hapEl) hapEl.textContent = `${Math.round(u.happiness)}%`;
      }
    }

    // Smoothly patch Torture progress bar, HP, Ward, Overcharge & Chicken controls WITHOUT rebuilding DOM!
    if (this.activeDrawer.kind === 'torture' && (this.activeDrawer.tab ?? 'chamber') === 'chamber') {
      const bar = this.drawerHost.querySelector<HTMLElement>('[data-torture-bar]');
      const pctEl = this.drawerHost.querySelector<HTMLElement>('[data-torture-pct]');
      const stageEl = this.drawerHost.querySelector<HTMLElement>('[data-torture-stage-lbl]');
      const quoteEl = this.drawerHost.querySelector<HTMLElement>('[data-torture-quote]');
      const wavImg = this.drawerHost.querySelector<HTMLElement>('[data-expr-wavering]');
      const brkImg = this.drawerHost.querySelector<HTMLElement>('[data-expr-broken]');
      const hpBar = this.drawerHost.querySelector<HTMLElement>('[data-torture-hp-bar]');
      const hpLbl = this.drawerHost.querySelector<HTMLElement>('[data-torture-hp-lbl]');
      const wardBar = this.drawerHost.querySelector<HTMLElement>('[data-torture-ward-bar]');
      const wardLbl = this.drawerHost.querySelector<HTMLElement>('[data-torture-ward-lbl]');
      const statusEl = this.drawerHost.querySelector<HTMLElement>('[data-torture-status]');
      const ocBtn = this.drawerHost.querySelector<HTMLButtonElement>('[data-overcharge-torture]');
      const feedBtn = this.drawerHost.querySelector<HTMLButtonElement>('[data-feed-chicken]');
      const tauntBtn = this.drawerHost.querySelector<HTMLButtonElement>('[data-taunt-chicken]');
      // Strictly chair-bound captive only (eliminates ghost prison-chair bug & handles same-frame swap!)
      const p = s.prisoners.find((x) => x.cell === 'chamber' && !x.escortedByHeroId);
      if ((bar && p && bar.dataset.prisonerId !== p.id) || (p && !bar) || (!p && bar)) {
        this.renderDrawer();
        return;
      }
      if (bar && pctEl && p) {
        const pct = Math.round(p.progress * 100);
        const pName = locHeroDef(p.sourceHero).name;
        const hpVal = Math.round(p.hp ?? 100);
        const wardPct = Math.round(Math.max(0, Math.min(1, p.ward ?? 0)) * 100);
        bar.style.width = `${pct}%`;
        pctEl.textContent = t(
          `圣光意志 ${Math.ceil(p.will)} / ${p.maxWill}（腐化 ${pct}%）`,
          `Holy Will ${Math.ceil(p.will)} / ${p.maxWill} (${pct}%)`,
        );
        if (hpBar) hpBar.style.width = `${Math.max(0, Math.min(100, hpVal))}%`;
        if (hpLbl) {
          hpLbl.style.color = hpVal <= 25 ? '#f05674' : '#42d69f';
          hpLbl.textContent =
            t(`体征 HP ${hpVal}/100`, `HP ${hpVal}/100`) +
            (p.mercy ? t(' · 安全词降档', ' · Safeword') : '') +
            ((p.satiety ?? 0) > 1 ? t(` · 饱腹 ${Math.round(p.satiety)}`, ` · Full ${Math.round(p.satiety)}`) : '');
        }
        if (wardBar) wardBar.style.width = `${wardPct}%`;
        if (wardLbl) {
          wardLbl.textContent = t(
            `圣光护体 ${wardPct}%（破意 ×${(1 - 0.6 * (p.ward ?? 0)).toFixed(2)} · 扣血 ×${(1 + 0.5 * (p.ward ?? 0)).toFixed(2)}）`,
            `Holy Ward ${wardPct}% (Will x${(1 - 0.6 * (p.ward ?? 0)).toFixed(2)} · Dmg x${(1 + 0.5 * (p.ward ?? 0)).toFixed(2)})`,
          );
        }
        if (statusEl) {
          if ((p.drowsyTimer ?? 0) > 0) {
            statusEl.textContent = t(`▪ 吃撑犯困 ${Math.ceil(p.drowsyTimer)}s`, `▪ Food Coma ${Math.ceil(p.drowsyTimer)}s`);
          } else if ((p.overchargeTimer ?? 0) > 0) {
            statusEl.textContent = p.overchargeCrit
              ? t(`✦ 趁势过载 ×6 (${Math.ceil(p.overchargeTimer)}s)`, `✦ Opportune x6 (${Math.ceil(p.overchargeTimer)}s)`)
              : t(`⚡ 过载加压 ×4 (${Math.ceil(p.overchargeTimer)}s)`, `⚡ Overcharge x4 (${Math.ceil(p.overchargeTimer)}s)`);
          } else {
            statusEl.textContent = '';
          }
        }
        if (ocBtn) {
          const ocCd = Math.ceil(s.overchargeCd ?? 0);
          const ocCost = overchargeManaCost(s.wave);
          const critReady =
            ocCd <= 0 &&
            hpVal >= 35 &&
            (p.drowsyTimer ?? 0) <= 0 &&
            (p.hardHoldTimer ?? 0) <= 0 &&
            isOverchargeCritWindow(p.will, p.maxWill);
          ocBtn.classList.toggle('overcharge-crit-ready', critReady);
          ocBtn.disabled =
            ocCd > 0 ||
            s.mana < ocCost ||
            hpVal < 35 ||
            (p.drowsyTimer ?? 0) > 0 ||
            (p.hardHoldTimer ?? 0) > 0;
          ocBtn.textContent =
            ocCd > 0
              ? t(`⚡ 过载 (${ocCd}s)`, `⚡ Overcharge (${ocCd}s)`)
              : critReady
                ? t(`✦ 趁势过载 ×6 (${ocCost}魔)`, `✦ Opportune x6 (${ocCost}M)`)
                : t(`⚡ 过载加压 (${ocCost}魔)`, `⚡ Overcharge (${ocCost}M)`);
        }
        const hatchery = s.slots.find((sl) => sl.type === 'hatchery');
        const chickens = hatchery?.chickens ?? 0;
        const isVeg = Boolean(HERO_PERSONA[p.sourceHero]?.vegetarian);
        if (feedBtn) {
          const healEst = Math.round(40 * Math.max(0, 1 - (p.satiety ?? 0) / 120));
          const cd = Math.ceil(p.feedCd ?? 0);
          feedBtn.disabled = isVeg || chickens < 1 || cd > 0;
          const lblSpan = feedBtn.querySelector<HTMLElement>('[data-btn-lbl]');
          if (lblSpan) {
            lblSpan.textContent = isVeg
              ? t('请上甜品', 'Dessert Only')
              : cd > 0
                ? t(`喂鸡 (${cd}s)`, `Feed (${cd}s)`)
                : t(`喂鸡 +${healEst}HP (${chickens})`, `Feed +${healEst}HP (${chickens})`);
          }
        }
        if (tauntBtn) {
          const cd = Math.ceil(p.feedCd ?? 0);
          tauntBtn.disabled = hpVal < 35 || chickens < 1 || cd > 0;
          const lblSpan = tauntBtn.querySelector<HTMLElement>('[data-btn-lbl]');
          if (lblSpan) {
            lblSpan.textContent =
              cd > 0
                ? t(`当面吃 (${cd}s)`, `Taunt (${cd}s)`)
                : t(`当面吃鸡 (${chickens})`, `Eat & Taunt (${chickens})`);
          }
        }
        const stIdx = getTortureStageIndex(p.progress);
        if (stageEl) {
          stageEl.textContent =
            stIdx === 2
              ? t(`彻底破防态 · ${pName}`, `Broken · ${pName}`)
              : stIdx === 1
                ? t(`羞愤动摇态 · ${pName}`, `Wavering · ${pName}`)
                : t(`圣光抵抗态 · ${pName}`, `Defiant · ${pName}`);
        }
        if (quoteEl) {
          const ln = locTortureStageLine(p.sourceHero, s.equippedImplement, p.progress);
          quoteEl.textContent = t(`“${ln}”`, `"${ln}"`);
        }
        const wavOpacity = Math.max(0, Math.min(1, (p.progress - 0.35) / 0.2));
        const brkOpacity = Math.max(0, Math.min(1, (p.progress - 0.72) / 0.18));
        if (wavImg) wavImg.style.opacity = wavOpacity.toFixed(2);
        if (brkImg) brkImg.style.opacity = brkOpacity.toFixed(2);
      }
    }
  }

  private renderDrawer(): void {
    const d = this.activeDrawer;
    if (d.kind === 'none') {
      this.drawerHost.innerHTML = '';
      return;
    }

    if (d.kind === 'portrait') {
      this.renderPortraitDrawer(d.unitId);
    } else if (d.kind === 'torture') {
      this.renderTortureDrawer(d.recentConvertedSpecies, d.tab ?? 'chamber');
    } else if (d.kind === 'altar') {
      this.renderAltarDrawer();
    } else if (d.kind === 'grimoire') {
      this.renderGrimoireDrawer(d.tab, d.focusSlot);
    } else if (d.kind === 'gallery') {
      this.renderGalleryDrawer(d.target);
    } else if (d.kind === 'gazette') {
      this.renderGazetteDrawer(d);
    } else if (d.kind === 'destroy_world') {
      this.renderDestroyWorldDrawer();
    }
  }

  private renderPortraitDrawer(unitId: string): void {
    const unit = this.engine.state.units.find((u) => u.id === unitId);
    if (!unit) {
      this.closeDrawer();
      return;
    }
    const def = ABYSSAL_UNIT_DEFS[unit.species];
    const uLoc = locUnitDef(unit.species);
    const uName = locUnitName(unit);
    const unitQuirk = deriveQuirk(this.engine.state.seed, unit.id, unit.species);
    const quirkLoc = locQuirk(unitQuirk);
    const quirkHtml = unit.quirkSeen
      ? `<span class="trait-chip" style="border-color:var(--abyss-gold); color:var(--abyss-gold);" title="${escapeHtml(quirkLoc.desc)}">✦ ${escapeHtml(quirkLoc.name)}</span>`
      : `<span class="trait-chip" style="opacity:0.75;" title="${t('在日常生态中目击其怪癖举动后揭晓', 'Revealed once witnessed in dungeon life')}">[ ？ ${t('待目击怪癖', 'Unseen Quirk')} ]</span>`;
    const traitsHtml =
      quirkHtml +
      unit.traits
        .map((tr) => {
          const ti = locTrait(tr);
          return `<span class="trait-chip" title="${escapeHtml(ti.desc)}">◆ ${escapeHtml(ti.name)}</span>`;
        })
        .join('');

    const markSectionHtml =
      unit.tier === 3
        ? `
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--abyss-border-soft);">
            <div style="font-size:11px; color:var(--abyss-gold); font-weight:700;">
              ${t(
                `◆ 堕落刻印流派（${unit.markChangedOnce ? '切换消耗 35 魔力' : '首次切换免费'}）：`,
                `◆ Corruption Mark (${unit.markChangedOnce ? '35 Mana to switch' : 'First switch free'}):`,
              )}
            </div>
            <div class="mark-row">
              ${CORRUPTION_MARK_LIST.map((mk) => {
                const md = locMark(mk);
                const active = unit.corruptionMark === mk;
                return `<button class="gothic-btn ${active ? 'active' : ''}" data-set-mark="${mk}" title="${escapeHtml(md.desc)}">${active ? '★ ' : ''}${escapeHtml(md.name)}</button>`;
              }).join('')}
            </div>
          </div>
        `
        : '';

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer portrait-drawer" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">${escapeHtml(uName)} · ${'★'.repeat(unit.star)} Lv.${unit.level}</span>
            <span class="drawer-subtitle">${escapeHtml(uLoc.title)} (Tier ${unit.tier})</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="drawer-body">
          <div class="portrait-layout">
            <div>
              <div class="portrait-frame">
                <img class="portrait-img" src="./assets/portraits/${def.portraitKey}.webp" alt="${escapeHtml(uName)}" />
              </div>
              <div class="portrait-quote">${t(`“${escapeHtml(uLoc.slapLines[0] ?? uLoc.description)}”`, `"${escapeHtml(uLoc.slapLines[0] ?? uLoc.description)}"`)}</div>
            </div>
            <div>
              <p style="color:var(--abyss-muted); line-height:1.45; margin-bottom:8px;">${escapeHtml(uLoc.description)}</p>
              <div class="stat-grid">
                <div class="stat-box"><div class="lbl">${t('生命 HP', 'HP')}</div><div class="num" data-p-hp>${Math.ceil(unit.hp)} / ${unit.maxHp}</div></div>
                <div class="stat-box"><div class="lbl">${t('攻击 ATK', 'ATK')}</div><div class="num" data-p-atk>${unit.atk}</div></div>
                <div class="stat-box"><div class="lbl">${t('饱食度', 'Satiety')}</div><div class="num" data-p-sat>${Math.round(unit.satiety)}%</div></div>
                <div class="stat-box"><div class="lbl">${t('愉悦度', 'Morale')}</div><div class="num" data-p-hap>${Math.round(unit.happiness)}%</div></div>
              </div>
              <div class="trait-list">${traitsHtml}</div>
              <div class="action-row">
                <button class="gothic-btn crimson" data-unit-act="slap">${t('扇巴掌督战 (+50%速)', 'Slap (+50% Haste)')}</button>
                <button class="gothic-btn" data-unit-act="altar">${t('放入合成祭坛', 'Send to Altar')}</button>
                <button class="gothic-btn ${unit.locked ? 'active' : ''}" data-unit-act="lock">${unit.locked ? t('已锁定', 'Locked') : t('锁定防误合', 'Lock Unit')}</button>
              </div>
              ${markSectionHtml}
              <div style="margin-top:10px; font-size:11px; color:var(--abyss-muted);">${t('驻守指令（零繁琐表格，一键直达岗位）：', 'Station Orders (One-click assignment):')}</div>
              <div class="semantic-cmd-grid">
                <button class="gothic-btn" data-sem-cmd="frontline">${t('◆ 前线迎敌', '◆ Frontline')}</button>
                <button class="gothic-btn" data-sem-cmd="backyard">${t('◆ 后院防盗', '◆ Guard Vault')}</button>
                <button class="gothic-btn" data-sem-cmd="hatchery">${t('◆ 吃鸡休整', '◆ Feast & Heal')}</button>
                <button class="gothic-btn" data-sem-cmd="specialty">${t('◆ 专精驻守', '◆ Best Room')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelectorAll<HTMLElement>('[data-unit-act]').forEach((el) => {
      el.addEventListener('click', () => {
        const a = el.dataset.unitAct!;
        if (a === 'slap') {
          const res = this.engine.slapUnit(unit.id);
          if (res.ok) {
            this.stage.sfx.play('slap_whack', 0.7);
            this.showToast(`${uName}: ${res.quote}`);
          }
        } else if (a === 'altar') {
          if (this.engine.assignToAltar(unit.id)) {
            this.openDrawer({ kind: 'altar' });
            return;
          }
          this.showToast(t('无法入槽（请先解锁、或祭坛已满两席）', 'Cannot assign (unlock unit or clear Altar slots first)'));
        } else if (a === 'lock') {
          this.engine.toggleUnitLock(unit.id);
        }
        this.renderDrawer();
      });
    });

    this.drawerHost.querySelectorAll<HTMLElement>('[data-set-mark]').forEach((el) => {
      el.addEventListener('click', () => {
        const mk = el.dataset.setMark as CorruptionMarkId;
        const res = this.engine.setUnitCorruptionMark(unit.id, mk);
        if (res.ok) {
          this.stage.sfx.play('spell_cast', 0.5);
          this.showToast(
            t(
              `【${uName}】切换刻印为【${locMark(mk).name}】！`,
              `[${uName}] switched Mark to [${locMark(mk).name}]!`,
            ),
          );
          this.renderDrawer();
        } else if (res.reason) {
          this.showToast(res.reason);
        }
      });
    });

    this.drawerHost.querySelectorAll<HTMLElement>('[data-sem-cmd]').forEach((el) => {
      el.addEventListener('click', () => {
        const cmd = el.dataset.semCmd as 'frontline' | 'backyard' | 'hatchery' | 'specialty';
        if (cmd === 'hatchery') {
          const hatch = this.engine.state.slots.find((s) => s.type === 'hatchery');
          if (hatch) {
            this.engine.grabUnit(unit.id);
            this.engine.dropUnit(hatch.index);
            this.stage.panToSlot(hatch.index);
            this.stage.sfx.play('chicken_gulp', 0.6);
            this.showToast(t(`已将 ${uName} 送往孵化场吃鸡休整！`, `Sent ${uName} to the Hatchery to feast & recover!`));
            this.renderDrawer();
            return;
          }
        }
        const res = this.engine.assignUnitSemanticCommand(unit.id, cmd);
        if (res.ok && res.slotIndex !== undefined) {
          this.stage.panToSlot(res.slotIndex);
          const rmName = locRoom(this.engine.state.slots[res.slotIndex]!.type).shortName;
          this.showToast(
            t(
              `已调遣 ${uName} 前往 #${res.slotIndex} ${rmName}`,
              `Assigned ${uName} to #${res.slotIndex} ${rmName}`,
            ),
          );
          this.renderDrawer();
        }
      });
    });
  }

  private renderTortureDrawer(
    recentConvertedSpecies?: AbyssalSpeciesId,
    activeTab: 'chamber' | 'prison' = 'chamber',
  ): void {
    const s = this.engine.state;
    const chamber = s.slots.find((sl) => sl.type === 'corruption');
    const prison = getPrisonSlot(s);
    // Strictly chair-bound captive only (eliminates ghost prison-chair bug!)
    const prisoner = s.prisoners.find((x) => x.cell === 'chamber' && !x.escortedByHeroId);
    const jailedListAll = s.prisoners.filter((p) => p.cell === 'prison' && !p.escortedByHeroId);
    const eqImpl = TORTURE_IMPLEMENTS[s.equippedImplement] ?? TORTURE_IMPLEMENTS.electric_chair;
    const eqImplLoc = locImplement(eqImpl.id);
    const hatchery = s.slots.find((sl) => sl.type === 'hatchery');
    const chickenCount = hatchery?.chickens ?? 0;

    const tabBarHtml = `
      <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:6px;">
          <button class="gothic-btn ${activeTab === 'chamber' ? 'active' : ''}" data-torture-tab="chamber">⚡ ${t('刑讯审讯室', 'Torture Chair')}</button>
          <button class="gothic-btn ${activeTab === 'prison' ? 'active' : ''}" data-torture-tab="prison">◈ ${t('深渊囚笼', 'Abyssal Prison')} (${jailedListAll.length})</button>
        </div>
        <button class="gothic-btn ${s.noMercyMode ? 'crimson active' : ''}" data-toggle-nomercy="1" title="${t('默认安全词协议保证挂机 0 死亡；开启极限审讯破意 +25% 但残血会电死出工伤讣告！', 'Safeword guarantees 0 deaths; Extreme Voltage gives +25% speed but risks Obituary at 0 HP!')}">
          ${s.noMercyMode ? t('⚡ 极限审讯：开 (+25%)', '⚡ Extreme Voltage: ON (+25%)') : t('◆ 安全词协议：开 (0死)', '◆ Safeword: ON (0 Death)')}
        </button>
      </div>
    `;

    const implementShelf = `
      <div style="margin-top:8px; border-top:1px solid var(--abyss-border-soft); padding-top:6px;">
        <div style="font-size:11.5px; color:var(--abyss-gold); font-weight:700; margin-bottom:4px;">
          ${t(
            `刑讯室可装配刑具（当前：${escapeHtml(eqImplLoc.name)} · 速度 ×${eqImpl.speedMult.toFixed(2)}）`,
            `Torture Implements (Equipped: ${escapeHtml(eqImplLoc.name)} · Speed x${eqImpl.speedMult.toFixed(2)})`,
          )}
        </div>
        <div class="implement-grid">
          ${TORTURE_IMPLEMENT_LIST.map((id) => {
            const def = TORTURE_IMPLEMENTS[id];
            const dLoc = locImplement(id);
            const unlocked = s.unlockedImplements.includes(id);
            const active = s.equippedImplement === id;
            return `
              <div class="implement-card ${active ? 'active' : ''}">
                <img src="./assets/props/${def.propKey}.webp" onerror="this.style.display='none'" width="46" height="46" alt="" />
                <div class="impl-name">${escapeHtml(dLoc.name)}</div>
                <div class="impl-sub">${escapeHtml(dLoc.subtitle)}</div>
                <button class="gothic-btn ${active ? 'active' : unlocked ? '' : 'crimson'}" data-impl="${id}">
                  ${active ? t('已装配', 'Equipped') : unlocked ? t('切换装配', 'Equip') : t(`解锁 (${def.unlockCostGold}G)`, `Unlock (${def.unlockCostGold}G)`)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (activeTab === 'prison') {
      if (!prison) {
        const pCost = this.engine.getRoomBuildCost('prison');
        bodyHtml = `
          <div style="text-align:center; padding:18px 12px;">
            <p style="color:var(--abyss-cream); font-size:13px; margin-bottom:10px;">
              ${t(
                '尚未修建【深渊囚笼】！全图限建 1 座：建在王座左侧后院 100% 稳妥养老，建在右侧前线则化身活体钓鱼吊笼！',
                'No [Abyssal Prison] built yet! Limit 1: Backyard = 100% safe ward; Frontline = live bait cage!',
              )}
            </p>
            <button class="gothic-btn crimson" data-quick-build-prison="1">
              ${t(`立即修建深渊囚笼 (${pCost}G${s.progression?.firstBuildDiscount?.prison ? ' · 首建半价' : ''})`, `Quick-Build Prison (${pCost}G${s.progression?.firstBuildDiscount?.prison ? ' · 50% OFF' : ''})`)}
            </button>
          </div>
        `;
      } else {
        const isFrontline = prison.index > THRONE_SLOT_INDEX;
        const lock = s.prisonLock ?? { hp: 100, max: 100 };
        const jailedList = s.prisoners.filter((p) => p.cell === 'prison');
        const rows = jailedList
          .map((p) => {
            const st = stanceOf(p);
            const stLoc = locStance(st);
            const isVeg = Boolean(HERO_PERSONA[p.sourceHero]?.vegetarian);
            const hpVal = Math.round(p.hp ?? 100);
            const willPct = Math.round(p.progress * 100);
            const wardPct = Math.round(Math.max(0, Math.min(1, p.ward ?? 0)) * 100);
            const vint = Math.min(3, p.vintageWaves ?? 0);
            const healEst = Math.round(40 * Math.max(0, 1 - (p.satiety ?? 0) / 120));
            return `
              <div class="prison-cell-row">
                <img src="./assets/portraits/${p.sourceHero}_pure.webp" style="width:42px;height:42px;object-fit:cover;object-position:top;border-radius:4px;border:1px solid ${stLoc.color};" alt="" />
                <div>
                  <div style="font-size:12px; font-weight:700; color:var(--abyss-cream);">
                    ${escapeHtml(locHeroDef(p.sourceHero).name)}
                    <span style="font-size:10px; color:${stLoc.color}; margin-left:6px;">[${escapeHtml(stLoc.label)}]</span>
                    ${p.abandonedByCathedral ? `<span style="font-size:10px; color:var(--abyss-gold); margin-left:4px;">✦ ${t('圣堂断供', 'Struck Off')}</span>` : `<span style="font-size:10px; color:var(--abyss-muted); margin-left:4px;">${t(`陈酿 ${vint}/3波`, `Aged ${vint}/3w`)}</span>`}
                    ${p.mercy ? `<span style="font-size:10px; color:#8ad8ff; margin-left:4px;">${t('养伤中', 'Resting')}</span>` : ''}
                  </div>
                  <div style="font-size:11px; color:var(--abyss-muted);">
                    HP ${hpVal}/100 · ${t(`护体 ${wardPct}%`, `Ward ${wardPct}%`)} · ${t(`腐化 ${willPct}%`, `Corrupt ${willPct}%`)}
                  </div>
                </div>
                <div style="display:flex; gap:4px;">
                  <button class="gothic-btn" data-to-chair="${p.id}">${t('提审', 'Chair')}</button>
                  <button class="gothic-btn" data-feed-chicken="${p.id}" ${isVeg || chickenCount < 1 || p.feedCd > 0 ? 'disabled' : ''}>
                    <img class="chicken-btn-thumb" src="./assets/chibi/gothic_chicken.webp" alt="" />${isVeg ? t('素食', 'Veg') : `${t('喂鸡', 'Feed')} +${healEst}`}
                  </button>
                </div>
              </div>
            `;
          })
          .join('');
        bodyHtml = `
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--abyss-cream); margin-bottom:8px;">
            <span>
              ${isFrontline ? t('◈ 前线钓鱼吊笼（护体速锈 · 软化 -1.6%/min）', '◈ Frontline Bait Cage (Fast Ward Decay · -1.6%/min)') : t('◆ 后院稳妥监牢（100% 零逃脱 · 软化 -1.0%/min）', '◆ Backyard Vault Ward (100% Safe · -1.0%/min)')}
              · Lv.${prison.level} (${jailedList.length}/${getPrisonCapacity(prison)})
            </span>
            <span style="color:var(--abyss-gold);">${t(`锁具耐久 ${Math.round(lock.hp)}/${lock.max}`, `Lock ${Math.round(lock.hp)}/${lock.max}`)} · ${t(`宿敌池 ${s.nemesisPool.length}/3`, `Nemesis ${s.nemesisPool.length}/3`)}</span>
          </div>
          ${rows || `<div style="text-align:center; padding:18px; color:var(--abyss-muted);">${t('牢房暂空，击败可俘精英勇者即可抓捕入住！', 'Cells are empty—defeat capturable elite heroines to fill them!')}</div>`}
        `;
      }
    } else if (!chamber) {
      bodyHtml = `
        <div style="text-align:center; padding:18px 12px;">
          <p style="color:var(--abyss-cream); font-size:14px; margin-bottom:12px;">${t('尚未修建【魅魔刑讯室】！建议建在王座左侧后院，俘获精英勇者后即可上【高压雷击电椅】审讯收编！', 'No [Succubus Torture Chamber] built yet! Build one in your Backyard to strap captured heroines onto the [Electric Chair]!')}</p>
          <button class="gothic-btn crimson" data-quick-build-torture="1">${t('立即在后院空闲走廊建造魅魔刑讯室 (135 金币)', 'Quick-Build Torture Chamber in Backyard (135G)')}</button>
        </div>
        ${implementShelf}
      `;
    } else if (prisoner) {
      const pureKey = `${prisoner.sourceHero}_pure`;
      const wavKey = `${prisoner.sourceHero}_wavering`;
      const brkKey = `${prisoner.sourceHero}_broken`;
      const targetDef = ABYSSAL_UNIT_DEFS[prisoner.targetSpecies];
      const targetLoc = locUnitDef(prisoner.targetSpecies);
      const pName = locHeroDef(prisoner.sourceHero).name;
      const pct = Math.round(prisoner.progress * 100);
      const wavOpacity = Math.max(0, Math.min(1, (prisoner.progress - 0.35) / 0.2));
      const brkOpacity = Math.max(0, Math.min(1, (prisoner.progress - 0.72) / 0.18));
      const stIdx = getTortureStageIndex(prisoner.progress);
      const stageTitle =
        stIdx === 2
          ? t(`彻底破防态 · ${pName}`, `Broken · ${pName}`)
          : stIdx === 1
            ? t(`羞愤动摇态 · ${pName}`, `Wavering · ${pName}`)
            : t(`圣光抵抗态 · ${pName}`, `Defiant · ${pName}`);
      const stageQuote = locTortureStageLine(prisoner.sourceHero, eqImpl.id, prisoner.progress);
      const hpVal = Math.round(prisoner.hp ?? 100);
      const wardVal = Math.max(0, Math.min(1, prisoner.ward ?? 0));
      const wardPct = Math.round(wardVal * 100);
      const ecgClass =
        hpVal <= 10 ? 'ecg-danger ecg-critical' : hpVal <= 25 ? 'ecg-danger' : hpVal <= 50 ? 'ecg-fast' : '';
      const ecgStroke = hpVal <= 25 ? '#f05674' : '#f2c655';
      const isWeakness = HERO_WEAKNESS_IMPLEMENT[prisoner.sourceHero] === eqImpl.id;
      const isVeg = Boolean(HERO_PERSONA[prisoner.sourceHero]?.vegetarian);
      const ocCost = overchargeManaCost(s.wave);
      const ocCd = Math.ceil(s.overchargeCd ?? 0);
      const critReady =
        ocCd <= 0 &&
        hpVal >= 35 &&
        (prisoner.drowsyTimer ?? 0) <= 0 &&
        (prisoner.hardHoldTimer ?? 0) <= 0 &&
        isOverchargeCritWindow(prisoner.will, prisoner.maxWill);
      const healEst = Math.round(40 * Math.max(0, 1 - (prisoner.satiety ?? 0) / 120));
      const feedCd = Math.ceil(prisoner.feedCd ?? 0);
      bodyHtml = `
        <div class="corruption-stage">
          <div style="text-align:center;">
            <div class="portrait-frame torture-crack-frame" data-torture-frame style="height:184px;">
              <div class="expr-stack">
                <img class="portrait-img" src="./assets/portraits/${pureKey}.webp" alt="${escapeHtml(pName)}" />
                <img class="portrait-img" data-expr-wavering src="./assets/portraits/${wavKey}.webp" style="opacity:${wavOpacity.toFixed(2)};" onerror="this.style.display='none'" alt="" />
                <img class="portrait-img" data-expr-broken src="./assets/portraits/${brkKey}.webp" style="opacity:${brkOpacity.toFixed(2)};" onerror="this.style.display='none'" alt="" />
              </div>
            </div>
            <div data-torture-stage-lbl style="margin-top:5px; font-weight:700; font-size:12px; color:#aee1ff;">${escapeHtml(stageTitle)}</div>
          </div>

          <div style="text-align:center;">
            <div style="font-size:12px; color:var(--abyss-gold); letter-spacing:0.6px; margin-bottom:3px; display:flex; justify-content:center; gap:8px; align-items:center;">
              <span>${escapeHtml(eqImplLoc.name)} ${isWeakness ? `<span style="color:#42d69f;">★ ${t('弱点 2×', 'WEAKNESS 2×')}</span>` : ''}</span>
              <span data-torture-status style="font-size:11px; color:#ffd27d; font-weight:700;"></span>
            </div>
            <div class="ecg-box ${ecgClass}" style="height:28px;">
              <svg class="ecg-svg" viewBox="0 0 240 44" preserveAspectRatio="none">
                <polyline fill="none" stroke="${ecgStroke}" stroke-width="2"
                  points="0,24 30,24 38,24 44,8 50,38 56,18 62,24 120,24 150,24 158,24 164,8 170,38 176,18 182,24 240,24" />
              </svg>
            </div>
            <div class="hp-bar-wrap"><div class="hp-bar-fill" data-torture-hp-bar style="width:${Math.max(0, Math.min(100, hpVal))}%"></div></div>
            <div data-torture-hp-lbl style="font-size:11px; color:${hpVal <= 25 ? '#f05674' : '#42d69f'}; margin-bottom:2px;">
              ${t(`体征 HP ${hpVal}/100`, `HP ${hpVal}/100`)}${prisoner.mercy ? t(' · 安全词降档', ' · Safeword') : ''}
            </div>
            <div class="ward-bar-wrap"><div class="ward-bar-fill" data-torture-ward-bar style="width:${wardPct}%"></div></div>
            <div data-torture-ward-lbl style="font-size:10.5px; color:#aee1ff; margin-bottom:3px;">
              ${t(`圣光护体 ${wardPct}%（破意 ×${(1 - 0.6 * wardVal).toFixed(2)} · 扣血 ×${(1 + 0.5 * wardVal).toFixed(2)}）`, `Holy Ward ${wardPct}% (Will x${(1 - 0.6 * wardVal).toFixed(2)} · Dmg x${(1 + 0.5 * wardVal).toFixed(2)})`)}
            </div>
            <div class="corruption-bar-wrap">
              <div class="corruption-bar-fill" data-torture-bar data-prisoner-id="${prisoner.id}" style="width:${pct}%"></div>
              <span class="will-tick-mark" style="left:34%;" title="66% Will"></span>
              <span class="will-tick-mark" style="left:67%;" title="33% Will"></span>
            </div>
            <div data-torture-pct style="font-size:11.5px; color:var(--abyss-cream); margin-bottom:4px;">
              ${t(`圣光意志 ${Math.ceil(prisoner.will)} / ${prisoner.maxWill}（腐化 ${pct}%）`, `Holy Will ${Math.ceil(prisoner.will)} / ${prisoner.maxWill} (${pct}%)`)}
            </div>
            <div class="portrait-quote" data-torture-quote style="margin:4px 0 6px; padding:5px 8px; font-size:11.5px;">${t(`“${escapeHtml(stageQuote)}”`, `"${escapeHtml(stageQuote)}"`)}</div>
            <div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
              <button class="gothic-btn crimson ${critReady ? 'overcharge-crit-ready' : ''}" data-overcharge-torture="1" ${ocCd > 0 || s.mana < ocCost || hpVal < 35 || (prisoner.drowsyTimer ?? 0) > 0 || (prisoner.hardHoldTimer ?? 0) > 0 ? 'disabled' : ''}>
                ${ocCd > 0 ? t(`⚡ 过载 (${ocCd}s)`, `⚡ Overcharge (${ocCd}s)`) : critReady ? t(`✦ 趁势过载 ×6 (${ocCost}魔)`, `✦ Opportune x6 (${ocCost}M)`) : t(`⚡ 过载加压 (${ocCost}魔)`, `⚡ Overcharge (${ocCost}M)`)}
              </button>
              <button class="gothic-btn" data-feed-chicken="${prisoner.id}" ${isVeg || chickenCount < 1 || feedCd > 0 ? 'disabled' : ''}>
                <img class="chicken-btn-thumb" src="./assets/chibi/gothic_chicken.webp" alt="" /><span data-btn-lbl>${isVeg ? t('请上甜品', 'Dessert Only') : feedCd > 0 ? t(`喂鸡 (${feedCd}s)`, `Feed (${feedCd}s)`) : t(`喂鸡 +${healEst}HP (${chickenCount})`, `Feed +${healEst}HP (${chickenCount})`)}</span>
              </button>
              <button class="gothic-btn" data-taunt-chicken="${prisoner.id}" ${hpVal < 35 || chickenCount < 1 || feedCd > 0 ? 'disabled' : ''}>
                <img class="chicken-btn-thumb" src="./assets/chibi/gothic_chicken.webp" alt="" /><span data-btn-lbl>${feedCd > 0 ? t(`当面吃 (${feedCd}s)`, `Taunt (${feedCd}s)`) : t(`当面吃鸡 (${chickenCount})`, `Eat & Taunt (${chickenCount})`)}</span>
              </button>
              ${prison ? `<button class="gothic-btn" data-to-prison="${prisoner.id}">${t('押回囚笼', 'To Prison')}</button>` : ''}
            </div>
          </div>

          <div style="text-align:center;">
            <div class="portrait-frame" style="height:184px;">
              <img class="portrait-img" src="./assets/portraits/${targetDef.portraitKey}.webp"
                style="filter: brightness(${0.45 + prisoner.progress * 0.55}) saturate(${0.5 + prisoner.progress * 0.6}) drop-shadow(0 6px 14px #000);"
                alt="${escapeHtml(targetLoc.name)}" />
            </div>
            <div style="margin-top:5px; font-weight:700; font-size:12px; color:var(--abyss-crimson-bright);">${t(`转化王牌 · ${escapeHtml(targetLoc.name)} (T3)`, `Target Ace · ${escapeHtml(targetLoc.name)} (T3)`)}</div>
          </div>
        </div>
        ${implementShelf}
      `;
    } else if (recentConvertedSpecies) {
      const def = ABYSSAL_UNIT_DEFS[recentConvertedSpecies];
      const uLoc = locUnitDef(recentConvertedSpecies);
      bodyHtml = `
        <div class="portrait-layout">
          <div class="portrait-frame" style="height:270px;">
            <img class="portrait-img" src="./assets/portraits/${def.portraitKey}.webp" alt="${escapeHtml(uLoc.name)}" />
          </div>
          <div>
            <div style="color:var(--abyss-crimson-bright); font-weight:700; font-size:16px; margin-bottom:6px;">${t('★ 堕落转化成功！收编三阶麾下王牌 ★', '★ CORRUPTION COMPLETE! TIER 3 ACE RECRUITED ★')}</div>
            <h3 style="color:var(--abyss-gold); font-size:19px; margin-bottom:6px;">${escapeHtml(uLoc.name)} · ${escapeHtml(uLoc.title)}</h3>
            <p style="color:var(--abyss-text); line-height:1.5;">${escapeHtml(uLoc.description)}</p>
            <div class="portrait-quote">${t(`“${escapeHtml(uLoc.slapLines[0] ?? '')}”`, `"${escapeHtml(uLoc.slapLines[0] ?? '')}"`)}</div>
            <div style="margin-top:12px; color:var(--abyss-muted);">${t(`累计已收编堕落勇者：${s.metrics.totalCaptivesConverted} 名`, `Total Converted Aces: ${s.metrics.totalCaptivesConverted}`)}</div>
          </div>
        </div>
        ${implementShelf}
      `;
    } else {
      const targets: readonly AbyssalSpeciesId[] = [
        'fallen_paladin',
        'corrupted_sister',
        'abyssal_ranger',
        'shadow_phantom_thief',
        'eclipse_archmage',
        'dread_dragon_knight',
      ];
      const prisonHintHtml =
        jailedListAll.length > 0
          ? `<div style="margin-bottom:10px; padding:8px 12px; background:rgba(36,16,54,0.85); border:1px solid var(--abyss-gold); border-radius:4px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
               <span style="font-size:12px; color:var(--abyss-cream);">
                 ${t(
                   `刑讯椅暂空：深渊囚笼中有 ${jailedListAll.length} 名俘虏正在腐蚀圣光护体（护体 ≤ 40% 自动提审，也可手动押上电椅）。`,
                   `Torture Chair vacant: ${jailedListAll.length} captive(s) corroding Holy Ward in Abyssal Prison (auto-summons at Ward <= 40%).`,
                 )}
               </span>
               <button class="gothic-btn active" data-torture-tab="prison">◈ ${t('查看深渊囚笼', 'Open Prison')}</button>
             </div>`
          : `<p style="color:var(--abyss-cream); margin-bottom:8px;">${t(`刑讯室 Lv.${chamber.level} 当前空置。击败精英女勇者（修女/射手/女骑士/女飞贼/大魔导/龙骑将军）有概率俘获，由苦工小鬼拖入或亲手拎入此室上刑具！`, `Torture Chamber Lv.${chamber.level} is vacant. Defeat elite heroines for a capture chance—let Imps haul them or Hand-Drop them straight onto the chair!`)}</p>`;
      bodyHtml = `
        <div style="text-align:center;">
          ${prisonHintHtml}
          <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px;">
            ${targets
              .map((sp) => {
                const d = ABYSSAL_UNIT_DEFS[sp];
                const dLoc = locUnitDef(sp);
                const marks = s.prestige.corruptedSoulMarks[sp] ?? 0;
                return `
                  <div class="build-card" style="align-items:center; padding:6px;">
                    <img src="./assets/portraits/${d.portraitKey}.webp" style="height:92px; object-fit:contain;" alt="" />
                    <h4 style="font-size:11px;">${escapeHtml(dLoc.name)}</h4>
                    <p style="font-size:10px;">${t(`印记 ${marks} 层`, `Marks: ${marks}`)}</p>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
        ${implementShelf}
      `;
    }

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer torture-drawer" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">${t('魅魔刑讯调教室', 'Succubus Torture Chamber')}</span>
            <span class="drawer-subtitle">${t('5 种趣味刑具 · 圣光意志瓦解 · 6 名三阶王牌收编', '5 Gag Implements · 3-Stage Expression Break · 6 Tier 3 Aces')}</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="drawer-body">${tabBarHtml}${bodyHtml}</div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelectorAll<HTMLElement>('[data-torture-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        const tb = el.dataset.tortureTab as 'chamber' | 'prison';
        this.openDrawer({ kind: 'torture', tab: tb });
      });
    });
    this.drawerHost.querySelector('[data-toggle-nomercy]')?.addEventListener('click', () => {
      this.engine.setNoMercyMode(!s.noMercyMode);
      this.showToast(
        this.engine.state.noMercyMode
          ? t('⚡ 已开启极限审讯（+25%破意，注意看心电图！）', '⚡ Extreme Voltage ON (+25% speed—watch the ECG!)')
          : t('◆ 已切回安全词协议（挂机 0 死亡）', '◆ Safeword Protocol ON (0 deaths guaranteed)'),
      );
      this.renderDrawer();
    });
    this.drawerHost.querySelector('[data-quick-build-prison]')?.addEventListener('click', () => {
      const target =
        s.slots.find((sl) => sl.index < THRONE_SLOT_INDEX && sl.type === 'corridor' && !sl.trap) ??
        s.slots.find((sl) => sl.type === 'corridor' && !sl.trap);
      if (target && this.engine.buildRoom(target.index, 'prison')) {
        this.stage.panToSlot(target.index);
        this.showToast(t(`已在 #${target.index} 建成【深渊囚笼】！`, `Built [Abyssal Prison] at #${target.index}!`));
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足或尚未解锁深渊囚笼', 'Not enough Gold or Prison not unlocked yet'));
      }
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-feed-chicken]').forEach((el) => {
      el.addEventListener('click', () => {
        const res = this.engine.feedPrisonerChicken(el.dataset.feedChicken!);
        if (res.ok) {
          this.stage.sfx.play('chicken_gulp', 0.6);
          const msg = res.drowsy
            ? t(
                `投喂烤鸡 +${res.healAmt ?? 0}HP（过载CD -15s），吃撑犯困 12 秒！`,
                `Fed chicken +${res.healAmt ?? 0}HP (Overcharge CD -15s), Food Coma 12s!`,
              )
            : t(
                `投喂烤鸡成功！俘虏 HP +${res.healAmt ?? 0}，过载冷却立减 15s！`,
                `Fed roast chicken! Captive HP +${res.healAmt ?? 0}, Overcharge CD -15s!`,
              );
          this.showToast(msg);
          this.syncHudNumbers();
        } else if (res.reason) {
          this.showToast(res.reason);
        }
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-taunt-chicken]').forEach((el) => {
      el.addEventListener('click', () => {
        const res = this.engine.tauntPrisonerChicken(el.dataset.tauntChicken!);
        if (res.ok) {
          this.stage.sfx.play('chicken_gulp', 0.55);
          this.showToast(
            res.vegetarian
              ? t('当面啃鸡！精灵满脸嫌弃（0 扣血），护体 -5%！', 'Ate chicken in front of her! Elf disgusted (0 HP dmg), Ward -5%!')
              : t('当面啃鸡！俘虏馋哭：护体 -5%、意志 -3%、体征 -5HP！', 'Ate chicken right in front of her! Ward -5%, Will -3%, HP -5!'),
          );
          this.syncHudNumbers();
        } else if (res.reason) {
          this.showToast(res.reason);
        }
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-to-chair]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.engine.transferPrisonerCell(el.dataset.toChair!, 'chamber')) {
          this.openDrawer({ kind: 'torture', tab: 'chamber' });
        }
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-to-prison]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.engine.transferPrisonerCell(el.dataset.toPrison!, 'prison')) {
          this.openDrawer({ kind: 'torture', tab: 'prison' });
        }
      });
    });
    this.drawerHost.querySelector('[data-quick-build-torture]')?.addEventListener('click', () => {
      const target =
        s.slots.find((sl) => sl.index < THRONE_SLOT_INDEX && sl.type === 'corridor' && !sl.trap) ??
        s.slots.find((sl) => sl.type === 'corridor' && !sl.trap);
      if (target && this.engine.buildRoom(target.index, 'corruption')) {
        this.stage.panToSlot(target.index);
        this.showToast(
          t(
            `已在 #${target.index} 号槽位建成【魅魔刑讯室】，招牌高压电椅已就位！`,
            `Built [Succubus Torture Chamber] at #${target.index}—Electric Chair ready!`,
          ),
        );
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足或缺少空闲走廊（需 135 金币）', 'Not enough Gold (135G) or no free corridor'));
      }
    });

    this.drawerHost.querySelectorAll<HTMLElement>('[data-impl]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.impl as TortureImplementId;
        const iName = locImplement(id).name;
        if (s.unlockedImplements.includes(id)) {
          this.engine.equipTortureImplement(id);
          this.showToast(t(`刑讯室已切换装配【${iName}】！`, `Equipped [${iName}] in Torture Chamber!`));
        } else if (this.engine.unlockTortureImplement(id)) {
          this.stage.sfx.play('fusion_ritual', 0.6);
          this.showToast(t(`解锁并装配新刑具【${iName}】！`, `Unlocked & equipped [${iName}]!`));
        } else {
          this.showToast(
            t(
              `金币不足（需 ${TORTURE_IMPLEMENTS[id].unlockCostGold} 金币）`,
              `Not enough Gold (needs ${TORTURE_IMPLEMENTS[id].unlockCostGold}G)`,
            ),
          );
        }
        this.renderDrawer();
      });
    });

    this.drawerHost.querySelector('[data-overcharge-torture]')?.addEventListener('click', () => {
      const res = this.engine.overchargeTorture();
      if (!res.ok) {
        if (res.reason) this.showToast(res.reason);
        return;
      }
      this.stage.sfx.play('spell_cast', 0.6);
      const frameEl = this.drawerHost.querySelector<HTMLElement>('[data-torture-frame]');
      if (frameEl) {
        frameEl.classList.remove('torture-shock');
        void frameEl.offsetWidth;
        frameEl.classList.add('torture-shock');
      }
      const chamberSlot = s.slots.find((sl) => sl.type === 'corruption');
      if (chamberSlot && eqImpl.id === 'electric_chair') {
        this.stage.fxLayer.emitElectricArc(chamberSlot.index * 160 + 80, this.stage.getViewportMetrics().floorY);
      }
      this.showToast(
        res.isCrit
          ? t(`✦ 趁势过载命中！5 秒 ×6 破意且免除额外扣血！`, `✦ Opportune Overcharge! 5s x6 Will drain & zero extra HP loss!`)
          : t(`⚡ 过载加压启动！5 秒 ×4 破意加速！`, `⚡ Overcharge active! 5s x4 Will drain!`),
      );
      this.syncHudNumbers();
    });
  }

  private renderAltarDrawer(): void {
    const s = this.engine.state;
    const altar = s.slots.find((sl) => sl.type === 'altar');
    const unitA = s.units.find((u) => u.id === s.altar.slotAUnitId);
    const unitB = s.units.find((u) => u.id === s.altar.slotBUnitId);
    const preview = unitA && unitB ? this.engine.previewFusion(unitA.id, unitB.id) : null;

    const eligibleUnits = s.units.filter((u) => u.species !== 'imp' && !u.locked);

    const slotBox = (label: string, u: typeof unitA) =>
      u
        ? `<img src="./assets/portraits/${ABYSSAL_UNIT_DEFS[u.species].portraitKey}.webp" style="height:130px; object-fit:contain;" alt="" />
           <div style="font-weight:700; color:var(--abyss-gold);">${escapeHtml(locUnitName(u))}</div>
           <div style="font-size:11px; color:var(--abyss-muted);">★${u.star} Lv.${u.level}</div>`
        : `<div style="color:var(--abyss-muted); font-size:12px;">${label}<br/>${t('点击下方眷属入槽<br/>或用魔王之手直接拖入祭坛', 'Pick a retainer below<br/>or drag into Altar')}</div>`;

    let resultHtml = `<div style="color:var(--abyss-muted); font-size:12px;">${t('放入两名可融合眷属<br/>预览升阶/升星结果与继承词条', 'Place two compatible retainers<br/>to preview fusion & traits')}</div>`;
    if (preview) {
      if (preview.valid && preview.resultSpecies) {
        const rDef = ABYSSAL_UNIT_DEFS[preview.resultSpecies];
        const rLoc = locUnitDef(preview.resultSpecies);
        const traits = (preview.inheritedTraits ?? [])
          .map((tr) => `<span class="trait-chip">${escapeHtml(locTrait(tr).name)}</span>`)
          .join('');
        resultHtml = `
          <img src="./assets/portraits/${rDef.portraitKey}.webp" style="height:125px; object-fit:contain;" alt="" />
          <div style="font-weight:700; color:var(--abyss-gold);">${escapeHtml(rLoc.name)}</div>
          <div style="font-size:11px; color:var(--abyss-cream);">★${preview.resultStar} Lv.${preview.resultLevel} · ${t(`耗魔 ${preview.manaCost}`, `${preview.manaCost} Mana`)}</div>
          <div class="trait-list" style="justify-content:center; margin:4px 0;">${traits}</div>
          <button class="gothic-btn crimson" data-exec-fusion="1">${t('发动深渊融合！', 'Fuse Now!')}</button>
        `;
      } else {
        resultHtml = `<div style="color:var(--abyss-crimson-bright); font-size:12px;">${escapeHtml(preview.reason ?? t('配方不匹配', 'No matching recipe'))}</div>`;
      }
    }

    const recipeBar = FUSION_RECIPES.slice(0, 6)
      .map(
        (r) =>
          `<span class="trait-chip">${escapeHtml(locUnitDef(r.ingredients[0]).name)} + ${escapeHtml(locUnitDef(r.ingredients[1]).name)} ⇒ <b>${escapeHtml(locUnitDef(r.result).name)}</b></span>`,
      )
      .join('');

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer altar-drawer" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">${t('深渊合成祭坛', 'Abyssal Fusion Altar')}</span>
            <span class="drawer-subtitle">${t('二合一高阶融合（6 种二阶精锐）· 同种升星 · 词条继承', '2-into-1 Fusion (6 Tier 2 Elites) · Star-Up · Trait Inheritance')}</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="drawer-body">
          ${
            !altar
              ? `<div style="text-align:center; padding:22px;">
                   <p style="margin-bottom:10px;">${t('尚未修建【深渊合成祭坛】！', 'No [Abyssal Fusion Altar] built yet!')}</p>
                   <button class="gothic-btn crimson" data-quick-build-altar="1">${t(`在后院空闲走廊修建合成祭坛 (${this.engine.getRoomBuildCost('altar')} 金币${s.progression?.firstBuildDiscount?.altar ? ' · 首建半价' : ''})`, `Quick-Build Fusion Altar (${this.engine.getRoomBuildCost('altar')}G${s.progression?.firstBuildDiscount?.altar ? ' · 50% OFF' : ''})`)}</button>
                 </div>`
              : `
                <div class="fusion-grid">
                  <div class="fusion-slot">${slotBox(t('主体槽位 A', 'Host Slot A'), unitA)}</div>
                  <div class="fusion-arrow">+</div>
                  <div class="fusion-slot">${slotBox(t('素材槽位 B', 'Material Slot B'), unitB)}</div>
                  <div class="fusion-arrow">⇒</div>
                  <div class="fusion-slot result">${resultHtml}</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                  <span style="font-size:11px; color:var(--abyss-gold);">${t('核心进阶配方（同种二合一可升星至 ★5）：', 'Core Fusion Recipes (Same species fuses up to ★5):')}</span>
                  <button class="gothic-btn" data-clear-altar="1">${t('清空祭坛槽位', 'Clear Slots')}</button>
                </div>
                <div class="trait-list">${recipeBar}</div>
                <div class="roster-picker">
                  ${eligibleUnits
                    .map((u) => {
                      const sel = u.id === s.altar.slotAUnitId || u.id === s.altar.slotBUnitId;
                      return `
                        <button class="unit-pill ${sel ? 'selected' : ''}" data-pick-altar="${u.id}">
                          <img src="./assets/portraits/${ABYSSAL_UNIT_DEFS[u.species].portraitKey}.webp" alt="" />
                          <div>
                            <div style="font-weight:700; color:var(--abyss-cream); font-size:12px;">${escapeHtml(locUnitName(u))}</div>
                            <div style="font-size:11px; color:var(--abyss-gold);">★${u.star} Lv.${u.level}</div>
                          </div>
                        </button>
                      `;
                    })
                    .join('')}
                </div>
              `
          }
        </div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelector('[data-quick-build-altar]')?.addEventListener('click', () => {
      const target =
        s.slots.find((sl) => sl.index < THRONE_SLOT_INDEX && sl.type === 'corridor' && !sl.trap) ??
        s.slots.find((sl) => sl.type === 'corridor' && !sl.trap);
      if (target && this.engine.buildRoom(target.index, 'altar')) {
        this.showToast(t(`已在 #${target.index} 建成【深渊合成祭坛】！`, `Built [Abyssal Fusion Altar] at #${target.index}!`));
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足或缺少空闲走廊（需 140 金币）', 'Not enough Gold (140G) or no free corridor'));
      }
    });
    this.drawerHost.querySelector('[data-clear-altar]')?.addEventListener('click', () => {
      this.engine.clearAltar();
      this.renderDrawer();
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-pick-altar]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.dataset.pickAltar!;
        if (s.altar.slotAUnitId === uid) s.altar.slotAUnitId = null;
        else if (s.altar.slotBUnitId === uid) s.altar.slotBUnitId = null;
        else this.engine.assignToAltar(uid);
        this.renderDrawer();
      });
    });
    this.drawerHost.querySelector('[data-exec-fusion]')?.addEventListener('click', () => {
      if (!unitA || !unitB) return;
      const fused = this.engine.fuseUnits(unitA.id, unitB.id);
      if (fused) {
        this.stage.sfx.play('fusion_ritual', 0.75);
        this.openPortrait(fused.id);
      } else {
        this.showToast(t('融合失败（请确认魔力充足）', 'Fusion failed (check Mana)'));
      }
    });
  }

  private renderGrimoireDrawer(tab: GrimoireTab, focusSlot?: number): void {
    const s = this.engine.state;
    const selectedSlotIdx =
      focusSlot !== undefined
        ? focusSlot
        : (s.slots.find((sl) => sl.index > THRONE_SLOT_INDEX && sl.type === 'corridor')?.index ?? 8);
    const slotObj = s.slots[selectedSlotIdx] ?? s.slots[THRONE_SLOT_INDEX]!;

    let content = '';

    if (tab === 'throne') {
      const oDef = OVERLORD_DEFS[s.overlordId];
      const oLoc = locOverlord(s.overlordId);
      const upCost = overlordUpgradeCost(s.overlordLevel);
      const auraPct = Math.round((s.overlordLevel - 1) * BALANCE_CONFIG.overlordGlobalAtkAuraPerLevel * 100);
      const sfx = this.stage.sfx;
      const curLoc = getLocale();
      const bgmVolPct = Math.round(sfx.bgmVolume * 100);
      content = `
        <div class="portrait-layout">
          <div>
            <div class="portrait-frame" style="height:290px;">
              <img class="portrait-img" src="./assets/portraits/${oDef.portraitKey}.webp" alt="${escapeHtml(oLoc.name)}" />
            </div>
            <div class="portrait-quote">${escapeHtml(oLoc.quote)}</div>
          </div>
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <h3 style="color:var(--abyss-gold); font-size:18px;">${escapeHtml(oLoc.name)} · Lv.${s.overlordLevel}</h3>
              <button class="gothic-btn crimson" data-upgrade-overlord="1">${t(`强化魔王等级 (${fmtNum(upCost)}G)`, `Upgrade Overlord (${fmtNum(upCost)}G)`)}</button>
            </div>
            <div style="font-size:11px; color:var(--abyss-muted); margin-bottom:6px;">${escapeHtml(oLoc.title)} · ${escapeHtml(locChapterName(s.wave))}</div>
            <p style="color:var(--abyss-cream); margin-bottom:8px;"><b>${t(`【${escapeHtml(oLoc.passiveTitle)}】`, `[${escapeHtml(oLoc.passiveTitle)}] `)}</b>${escapeHtml(oLoc.passiveDesc)}</p>
            <div class="stat-grid">
              <div class="stat-box"><div class="lbl">${t('魔心 HP / 攻击', 'Heart HP / ATK')}</div><div class="num">${fmtNum(s.overlordMaxHp)} / ${fmtNum(s.overlordAtk)}</div></div>
              <div class="stat-box"><div class="lbl">${t('魔王统御光环', 'Overlord Aura')}</div><div class="num">${t(`全军攻击 +${auraPct}%`, `Army ATK +${auraPct}%`)}</div></div>
              <div class="stat-box"><div class="lbl">${t('最高波次 / 捉贼', 'Best Wave / Thieves')}</div><div class="num">W${s.highestWaveCleared} / ${s.metrics.totalThievesCaught}</div></div>
              <div class="stat-box"><div class="lbl">${t('图鉴羁绊加成', 'Codex Mastery')}</div><div class="num">+${Math.round((getCodexBonusMult(s.prestige) - 1) * 100)}% ${t('攻/金', 'ATK/G')}</div></div>
            </div>
            <div style="font-size:11px; color:var(--abyss-gold); margin:8px 0 4px;">${t('强化魔王神迹技能：', 'Upgrade Overlord Miracles:')}</div>
            <div class="action-row" style="margin-top:0;">
              ${SPELL_LIST.map((spId) => {
                const spDef = SPELL_DEFS[spId];
                const spLoc = locSpell(spId);
                const unlocked = this.engine.isSpellUnlocked(spId);
                const reqFeat = SPELL_TO_FEATURE[spId];
                const reqW = reqFeat ? FEATURE_UNLOCK_WAVE[reqFeat] : 0;
                const lv = s.spellLevels[spId] ?? 1;
                const sc = spellUpgradeCost(spDef.baseUpgradeGold, lv);
                return unlocked
                  ? `<button class="gothic-btn" data-upgrade-spell="${spId}" title="${escapeHtml(spLoc.description)}">${escapeHtml(spLoc.name)} Lv.${lv} → (${fmtNum(sc)}G)</button>`
                  : `<button class="gothic-btn" disabled title="${escapeHtml(spLoc.description)}">🔒 ${escapeHtml(spLoc.name)} (W${reqW})</button>`;
              }).join('')}
            </div>
            <div class="action-row">
              <button class="gothic-btn ${s.farmMode ? 'active' : ''}" data-toggle-farm="1">${s.farmMode ? t('巡航 Farm 中（切回冲层）', 'Farming (Switch to Push)') : t('切入安稳挂机 Farm', 'Switch to Safe Farm')}</button>
              <button class="gothic-btn ${s.autoCastSpells ? 'active' : ''}" data-toggle-autocast="1">${t(`自动施法：${s.autoCastSpells ? '开' : '关'}`, `Auto-Cast: ${s.autoCastSpells ? 'ON' : 'OFF'}`)}</button>
              <button class="gothic-btn" data-save-export="1">${t('立即存档 & 复制', 'Save & Copy')}</button>
            </div>
            <div class="audio-lang-console">
              <div class="audio-lang-group">
                <span class="audio-lang-label">${t('语言 Language', 'Language')}:</span>
                <button class="gothic-btn ${curLoc === 'zh' ? 'active' : ''}" data-set-lang="zh">中文</button>
                <button class="gothic-btn ${curLoc === 'en' ? 'active' : ''}" data-set-lang="en">English</button>
              </div>
              <div class="audio-lang-group">
                <span class="audio-lang-label">BGM:</span>
                <button class="gothic-btn ${sfx.bgmMode === 'auto' ? 'active' : ''}" data-bgm-mode="auto">${t('动态', 'Auto')}</button>
                <button class="gothic-btn ${sfx.bgmMode === 'lounge' ? 'active' : ''}" data-bgm-mode="lounge">${t('王座闲庭', 'Lounge')}</button>
                <button class="gothic-btn ${sfx.bgmMode === 'battle' ? 'active' : ''}" data-bgm-mode="battle">${t('圣战交响', 'Battle')}</button>
                <input class="bgm-slider" type="range" min="0" max="100" value="${bgmVolPct}" data-bgm-vol="1" title="${t('BGM 音量', 'BGM Volume')}" />
                <span style="font-size:11px; color:var(--abyss-cream);" data-bgm-vol-lbl>${bgmVolPct}%</span>
              </div>
            </div>
          </div>
        </div>
        <div style="margin-top:12px; border-top:1px solid var(--abyss-border-soft); padding-top:10px;">
          <div style="font-size:12px; color:var(--abyss-gold); font-weight:700; margin-bottom:6px;">${t(`4 位可操控魔王（当前持有深渊魔晶：${s.prestige.abyssalShards}）`, `4 Playable Overlords (Abyssal Shards: ${s.prestige.abyssalShards})`)}</div>
          <div class="overlord-grid">
            ${OVERLORD_LIST.map((oid) => {
              const od = OVERLORD_DEFS[oid];
              const ol = locOverlord(oid);
              const unlocked = s.prestige.unlockedOverlords.includes(oid);
              const active = s.overlordId === oid;
              return `
                <div class="build-card ${active ? 'active-card' : ''}" style="align-items:center; text-align:center;">
                  <img src="./assets/portraits/${od.portraitKey}.webp" style="height:96px; object-fit:contain;" alt="" />
                  <h4>${escapeHtml(ol.name)} · ${escapeHtml(ol.title)}</h4>
                  <p style="font-size:10px;">${escapeHtml(ol.passiveTitle)}${t('：', ': ')}${escapeHtml(ol.passiveDesc)}</p>
                  <button class="gothic-btn ${active ? 'active' : unlocked ? '' : 'crimson'}" data-select-overlord="${oid}">
                    ${active ? t('当前坐镇', 'Active') : unlocked ? t('切换坐镇', 'Select') : t(`魔晶解锁 (${od.unlockCostShards}晶)`, `Unlock (${od.unlockCostShards} Shards)`)}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (tab === 'relics') {
      content = `
        <div style="margin-bottom:10px; color:var(--abyss-muted);">
          ${t(
            `已持有圣物：<b style="color:var(--abyss-gold);">${s.relics.length} / 30</b>（每首通 5 波军团长 / 10 波圣裁女皇或挖开深层矿脉遗迹箱必定爆出！）`,
            `Owned Relics: <b style="color:var(--abyss-gold);">${s.relics.length} / 30</b> (Guaranteed from first-clear W5/W10 Bosses & deep Relic Chests!)`,
          )}
        </div>
        <div class="relic-grid">
          ${RELIC_DEFS.map((r) => {
            const owned = s.relics.includes(r.id);
            const rLoc = locRelic(r.id);
            return `
              <div class="relic-card ${owned ? 'owned' : 'locked'}" title="${escapeHtml(rLoc.lore)}">
                <img src="./assets/pixel/relics/${r.id}.png" class="pixel-img" width="32" height="32" alt="${escapeHtml(rLoc.name)}" />
                <div class="relic-name">${escapeHtml(rLoc.name)}</div>
                <div class="relic-eff">${escapeHtml(rLoc.effect)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'build') {
      const resSummary = evaluateDungeonResonances(s.slots);
      const resonanceBadges = [
        ...resSummary.activeResonances.map((id) => {
          const d = locResonance(id);
          return `<span class="resonance-chip" title="${escapeHtml(d.desc)}">★ ${escapeHtml(d.name)} (${escapeHtml(d.pairLabel)})</span>`;
        }),
        ...resSummary.trapSynergyLinks.map((lnk) => {
          const d = locTrapSynergy(lnk.id);
          return `<span class="resonance-chip" title="${escapeHtml(d.desc)}">◆ ${escapeHtml(d.name)} (#${lnk.slotA}↔#${lnk.slotB})</span>`;
        }),
      ].join('');

      const backyardTabs = s.slots
        .filter((sl) => sl.index < THRONE_SLOT_INDEX)
        .map(
          (sl) =>
            `<button class="gothic-btn ${sl.index === selectedSlotIdx ? 'active' : ''}" data-focus-slot="${sl.index}">${t('后', 'B')}#${sl.index}${escapeHtml(locRoom(sl.type).shortName)}</button>`,
        )
        .join('');
      const frontlineTabs = s.slots
        .filter((sl) => sl.index >= THRONE_SLOT_INDEX && sl.index <= 19)
        .map(
          (sl) =>
            `<button class="gothic-btn ${sl.index === selectedSlotIdx ? 'active' : ''}" data-focus-slot="${sl.index}">#${sl.index}${escapeHtml(locRoom(sl.type).shortName)}</button>`,
        )
        .join('');
      const frontierTabs = s.slots
        .filter((sl) => sl.index >= 20)
        .map(
          (sl) =>
            `<button class="gothic-btn ${sl.index === selectedSlotIdx ? 'active' : ''}" data-focus-slot="${sl.index}">${t('深', 'D')}#${sl.index}${escapeHtml(locRoom(sl.type).shortName)}</button>`,
        )
        .join('');

      const upCost =
        slotObj.type !== 'rock_vein'
          ? roomUpgradeCost(ROOM_DEFS[slotObj.type].baseUpgradeCost, slotObj.level)
          : 0;
      const slotLoc = locRoom(slotObj.type);

      const slotUnlocked = this.engine.isSlotUnlocked(slotObj.index);
      const slotReqW = requiredWaveForSlot(slotObj.index);

      content = `
        <div class="resonance-strip">
          ${resonanceBadges || `<span style="font-size:11px; color:var(--abyss-muted);">${t('提示：相邻布置【刑讯+祭坛】【书库+王座】【训练+孵化】【工坊+陷阱走廊】或【霜狱+滚石/尖刺】【弹簧+香炉】可激活深渊建筑共鸣！', 'Tip: Place [Torture+Altar], [Library+Throne], [Training+Hatchery], [Workshop+Trapped Lane] or [Frost+Boulder/Spikes], [Spring+Censer] adjacent to trigger Resonances!')}</span>`}
        </div>
        <div style="font-size:11px; color:var(--abyss-gold); margin-bottom:4px;">${t('王座后院区 (#0–#5，4 格空间构筑共鸣与防盗)：', 'Backyard Sanctuary (#0–#5, Resonance & Vault Defense):')}</div>
        <div class="action-row" style="margin-top:0; margin-bottom:6px;">${backyardTabs}</div>
        <div style="font-size:11px; color:var(--abyss-muted); margin-bottom:4px;">${t('王座与前线长廊 (#6–#19)：', 'Throne & Frontline Kill Corridor (#6–#19):')}</div>
        <div class="action-row" style="margin-top:0; margin-bottom:6px;">${frontlineTabs}</div>
        <div style="font-size:11px; color:var(--abyss-muted); margin-bottom:4px;">${t('深层秘银/血钻矿脉区 (#20–#27)：', 'Deep Mithril / Blood-Gem Frontier (#20–#27):')}</div>
        <div class="action-row" style="margin-top:0; margin-bottom:10px;">${frontierTabs}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; background:rgba(14,7,22,0.85); border:1px solid var(--abyss-border-soft); border-radius:4px; margin-bottom:10px;">
          <div>
            <b style="color:var(--abyss-gold);">${t(`槽位 #${slotObj.index}：${escapeHtml(slotLoc.name)} (Lv.${slotObj.level})`, `Slot #${slotObj.index}: ${escapeHtml(slotLoc.name)} (Lv.${slotObj.level})`)}</b>
            <span style="color:var(--abyss-muted); margin-left:8px;">${escapeHtml(slotLoc.description)}</span>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
          ${
            slotObj.type !== 'rock_vein'
              ? `<button class="gothic-btn crimson" data-upgrade-slot="${slotObj.index}">${t(`升级 (${fmtNum(upCost)}G)`, `Upgrade (${fmtNum(upCost)}G)`)}</button>
                 <button class="gothic-btn" data-upgrade-slot-5="${slotObj.index}">${t('×5 连升', 'x5 Up')}</button>`
              : !slotUnlocked
                ? `<button class="gothic-btn" disabled>${t(`🔒 通关 W${slotReqW} 解封`, `🔒 Clear W${slotReqW}`)}</button>`
                : `<button class="gothic-btn" data-dig-slot="${slotObj.index}">${slotObj.markedForDig ? t('取消开采', 'Unmark') : t('标记小鬼开凿', 'Mark to Dig')}</button>`
          }
          </div>
        </div>
        ${
          slotObj.type !== 'throne' && slotObj.type !== 'rock_vein'
            ? `
              <div style="font-size:11px; color:var(--abyss-gold); margin-bottom:6px;">${t('改建 / 建造 8 类功能房间：', 'Build / Convert 8 Functional Rooms:')}</div>
              <div class="build-grid" style="margin-bottom:12px;">
                ${BUILDABLE_ROOMS.map((rt) => {
                  const rl = locRoom(rt);
                  const unlocked = this.engine.isRoomUnlocked(rt);
                  const reqFeat = ROOM_TO_FEATURE[rt];
                  const reqW = reqFeat ? FEATURE_UNLOCK_WAVE[reqFeat] : 0;
                  const cost = this.engine.getRoomBuildCost(rt);
                  const hasDiscount =
                    (rt === 'corruption' && s.progression?.firstBuildDiscount?.corruption) ||
                    (rt === 'altar' && s.progression?.firstBuildDiscount?.altar);
                  return `
                    <div class="build-card" style="${!unlocked ? 'opacity:0.5;' : ''}">
                      <h4>${escapeHtml(rl.name)}${unlocked && hasDiscount ? `<span class="discount-badge">${t('首建半价', '-50%')}</span>` : ''}</h4>
                      <p>${escapeHtml(rl.description)}</p>
                      ${
                        unlocked
                          ? `<button class="gothic-btn" data-build-room="${rt}" ${slotObj.type === rt ? 'disabled' : ''}>${t(`建造 (${cost}G)`, `Build (${cost}G)`)}</button>`
                          : `<button class="gothic-btn" disabled>${t(`🔒 通关 W${reqW} 解锁`, `🔒 Clear W${reqW}`)}</button>`
                      }
                    </div>
                  `;
                }).join('')}
              </div>
            `
            : ''
        }
        ${
          ROOM_DEFS[slotObj.type].allowsTrap
            ? `
              <div style="font-size:11px; color:var(--abyss-gold); margin-bottom:6px;">${t('部署 / 升级 5 类经典走廊陷阱（含牛蛙滚石巨砾）：', 'Deploy / Upgrade 5 Classic Corridor Traps:')}</div>
              <div class="build-grid" style="grid-template-columns:repeat(5,1fr);">
                ${TRAP_LIST.map((tt) => {
                  const td = TRAP_DEFS[tt];
                  const tl = locTrap(tt);
                  const isSame = slotObj.trap?.type === tt;
                  const unlocked = isSame || this.engine.isTrapUnlocked(tt);
                  const reqFeat = TRAP_TO_FEATURE[tt];
                  const reqW = reqFeat ? FEATURE_UNLOCK_WAVE[reqFeat] : 0;
                  return `
                    <div class="build-card" style="align-items:center; text-align:center; ${!unlocked ? 'opacity:0.5;' : ''}">
                      <img src="./assets/pixel/traps/${tt}.png" class="pixel-img" width="40" height="40" alt="" />
                      <h4>${escapeHtml(tl.name)}</h4>
                      <p>${escapeHtml(tl.description)}</p>
                      ${
                        unlocked
                          ? `<button class="gothic-btn crimson" data-install-trap="${tt}">
                               ${isSame ? t(`升级 Lv.${slotObj.trap!.level + 1}`, `Upgrade Lv.${slotObj.trap!.level + 1}`) : t(`安装 (${td.buildCostGold}G/${td.buildCostParts}件)`, `Build (${td.buildCostGold}G/${td.buildCostParts}P)`)}
                             </button>`
                          : `<button class="gothic-btn" disabled>${t(`🔒 通关 W${reqW}`, `🔒 Clear W${reqW}`)}</button>`
                      }
                    </div>
                  `;
                }).join('')}
              </div>
            `
            : ''
        }
      `;
    } else if (tab === 'recruit') {
      const impCount = s.units.filter((u) => u.species === 'imp').length;
      const impCost = impSummonManaCost(impCount);
      const combatCount = s.units.filter((u) => u.species !== 'imp').length;
      const maxCombat = getMaxCombatUnits(s);
      const recCost = recruitCostForTier(1, combatCount);

      content = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="color:var(--abyss-cream);">${t(`苦工小鬼：<b>${impCount}/8</b> · 麾下精锐：<b>${combatCount}/${maxCombat}</b>（升级王座或魔王可扩容！）`, `Toiling Imps: <b>${impCount}/8</b> · Combat Retainers: <b>${combatCount}/${maxCombat}</b> (Upgrade Throne or Overlord for more!)`)}</span>
          <button class="gothic-btn crimson" data-summon-imp="1">${t(`召唤苦工小鬼 (${impCost} 魔力)`, `Summon Imp (${impCost} Mana)`)}</button>
        </div>
        <div class="build-grid" style="grid-template-columns:repeat(4,1fr);">
          ${BASE_RECRUITABLE_SPECIES.map((sp) => {
            const def = ABYSSAL_UNIT_DEFS[sp];
            const uLoc = locUnitDef(sp);
            return `
              <div class="build-card" style="align-items:center; text-align:center;">
                <img src="./assets/portraits/${def.portraitKey}.webp" style="height:118px; object-fit:contain;" alt="" />
                <h4>${escapeHtml(uLoc.name)}</h4>
                <p>${escapeHtml(uLoc.description)}</p>
                <button class="gothic-btn" data-recruit="${sp}">${t(`招募 (${fmtNum(recCost)}G)`, `Recruit (${fmtNum(recCost)}G)`)}</button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'prestige') {
      const shardsReady = prestigeShardsForWave(s.highestWaveCleared);
      content = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(46,18,66,0.45); border:1px solid var(--abyss-border); border-radius:4px; margin-bottom:12px;">
          <div>
            <b style="color:var(--abyss-gold);">${t(`深渊第 ${s.prestige.epoch} 纪元 · 魔王命座 Lv.${s.prestige.overlordConstellation} · 百小时多周目科技树`, `Abyss Epoch ${s.prestige.epoch} · Constellation Lv.${s.prestige.overlordConstellation} · Multi-Epoch Tech Tree`)}</b>
            <div style="font-size:12px; color:var(--abyss-cream);">${t(`持有深渊魔晶：<b style="color:#b982ff;">${s.prestige.abyssalShards}</b>（通关第 ${BALANCE_CONFIG.prestigeMinWave} 波开启轮回，越高波次魔晶指数暴涨，当前可得 +${shardsReady} 魔晶）`, `Abyssal Shards: <b style="color:#b982ff;">${s.prestige.abyssalShards}</b> (Clear Wave ${BALANCE_CONFIG.prestigeMinWave} to Prestige; current reset yields +${shardsReady} Shards)`)}</div>
          </div>
          <button class="gothic-btn crimson" data-trigger-prestige="1" ${shardsReady <= 0 ? 'disabled' : ''}>${t(`发动位面侵蚀 (+${shardsReady} 魔晶)`, `Planar Erosion (+${shardsReady} Shards)`)}</button>
        </div>
        <div class="build-grid" style="grid-template-columns:repeat(5,1fr);">
          ${ABYSS_TECH_TREE.map((tech) => {
            const lv = s.prestige.techLevels[tech.id] ?? 0;
            const cost = techUpgradeCost(tech.id, lv);
            const tl = locTech(tech.id);
            return `
              <div class="build-card">
                <h4>${escapeHtml(tl.name)} (${lv}/${tech.maxLevel})</h4>
                <p>${escapeHtml(tl.effectPerLevel)}</p>
                <button class="gothic-btn" data-buy-tech="${tech.id}" ${lv >= tech.maxLevel || s.prestige.abyssalShards < cost ? 'disabled' : ''}>
                  ${lv >= tech.maxLevel ? t('已满级', 'MAX') : t(`研习 (${cost} 晶)`, `Learn (${cost})`)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'codex') {
      const allUnits = Object.values(ABYSSAL_UNIT_DEFS);
      const allHeroes = Object.values(HERO_DEFS);
      const masteryPct = Math.round((getCodexBonusMult(s.prestige) - 1) * 100);
      content = `
        <div style="margin-bottom:10px; padding:8px 12px; background:rgba(46,18,66,0.45); border:1px solid var(--abyss-border-soft); border-radius:4px;">
          <b style="color:var(--abyss-gold);">${t('深渊全图鉴羁绊', 'Abyssal Codex Mastery')}</b>${t(`：每收集 1 项永久提供 +1.5% 全军攻击与金币倍率，当前总加成 <b style="color:#5be08a;">+${masteryPct}%</b>！`, `: Every entry grants permanent +1.5% Army ATK & Gold, current total <b style="color:#5be08a;">+${masteryPct}%</b>!`)}
          ${t(
            `（麾下 ${s.prestige.codexUnits.length}/${allUnits.length} · 勇者 ${s.prestige.codexHeroes.length}/${allHeroes.length} · 圣物 ${s.prestige.unlockedRelicCodex.length}/30 · 刑具 ${s.prestige.codexImplements.length}/5）`,
            ` (Retainers ${s.prestige.codexUnits.length}/${allUnits.length} · Heroes ${s.prestige.codexHeroes.length}/${allHeroes.length} · Relics ${s.prestige.unlockedRelicCodex.length}/30 · Implements ${s.prestige.codexImplements.length}/5)`,
          )}
        </div>
        <div style="font-size:12px; color:var(--abyss-gold); margin-bottom:6px;">${t(`深渊麾下精锐图鉴 (${s.prestige.codexUnits.length}/${allUnits.length}) · 点击已解锁卡片打开高清鉴赏馆`, `Abyssal Retainers (${s.prestige.codexUnits.length}/${allUnits.length}) · Click unlocked cards for HD Gallery`)}</div>
        <div class="codex-grid" style="margin-bottom:12px;">
          ${allUnits
            .map((u) => {
              const seen = s.prestige.codexUnits.includes(u.species);
              const uLoc = locUnitDef(u.species);
              return `
                <div class="relic-card ${seen ? 'owned clickable' : 'locked'}" ${seen ? `data-gallery-unit="${u.species}"` : ''}>
                  <img src="./assets/portraits/${u.portraitKey}.webp" style="height:66px; object-fit:contain;" alt="" />
                  <div class="relic-name">${seen ? escapeHtml(uLoc.name) : '???'}</div>
                  <div class="relic-eff">T${u.tier} · ${escapeHtml(uLoc.title)}</div>
                </div>
              `;
            })
            .join('')}
        </div>
        <div style="font-size:12px; color:#aee1ff; margin-bottom:6px;">${t(`圣堂入侵勇者图鉴 (${s.prestige.codexHeroes.length}/${allHeroes.length}) · 可俘女勇者支持四态破防鉴赏`, `Invading Heroes (${s.prestige.codexHeroes.length}/${allHeroes.length}) · Capturable heroines feature 4-State Gallery`)}</div>
        <div class="codex-grid">
          ${allHeroes
            .map((h) => {
              const seen = s.prestige.codexHeroes.includes(h.species);
              const hLoc = locHeroDef(h.species);
              return `
                <div class="relic-card ${seen ? 'owned clickable' : 'locked'}" ${seen ? `data-gallery-hero="${h.species}"` : ''}>
                  <img src="./assets/portraits/${h.portraitKey}.webp" style="height:66px; object-fit:contain;" alt="" />
                  <div class="relic-name">${seen ? escapeHtml(hLoc.name) : '???'}</div>
                  <div class="relic-eff">[${escapeHtml(hLoc.roleTag)}] ${h.capturableAs ? t('★四态鉴赏', '★4-State') : h.stealsTreasuryGold ? t('盗宝专精', 'Vault Thief') : t('讨伐军', 'Crusader')}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (tab === 'theater') {
      const seenList = s.prestige.storySeen ?? [];
      content = `
        <div style="margin-bottom:8px; color:var(--abyss-muted);">
          ${t(
            `已解锁深渊小剧场：<b style="color:var(--abyss-gold);">${seenList.length} / ${STORY_IDS.length}</b>（跨纪元永久珍藏，随时点击重温对话演出）`,
            `Unlocked Abyssal Theater Episodes: <b style="color:var(--abyss-gold);">${seenList.length} / ${STORY_IDS.length}</b> (Preserved across Epochs—replay anytime!)`,
          )}
        </div>
        <div class="theater-grid">
          ${STORY_IDS.map((sid) => {
            const ep = locStoryScript(sid, s.overlordId);
            const seen = seenList.includes(sid);
            return `
              <div class="theater-card ${seen ? 'seen' : 'unseen'}">
                <div>
                  <div style="font-weight:700; color:var(--abyss-gold); font-size:13px;">${escapeHtml(ep.title)}</div>
                  <div style="font-size:11px; color:var(--abyss-muted); margin-top:2px;">${seen ? t('已收录', 'Unlocked') : `🔒 ${escapeHtml(ep.triggerHint)}`}</div>
                </div>
                <button class="gothic-btn ${seen ? 'crimson' : ''}" data-replay-story="${sid}" ${seen ? '' : 'disabled'}>
                  ${seen ? t('回看 ▶', 'Replay ▶') : t('未解锁', 'Locked')}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer grimoire-drawer" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">${t('深渊魔王圣典 V2.5', 'Overlord Grimoire V2.5')}</span>
            <span class="drawer-subtitle">${t('破壁开荒 · 28 格建筑共鸣 · 轻剧情小剧场 · 四态鉴赏 · 中英双语', 'Progressive Unlocks · 28-Slot Resonances · Abyss Theater · 4-State Gallery · EN/中文')}</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="tab-strip">
          <button class="gothic-btn ${tab === 'throne' ? 'active' : ''}" data-gtab="throne">${t('魔王与设置', 'Throne & Audio')}</button>
          <button class="gothic-btn ${tab === 'build' ? 'active' : ''}" data-gtab="build">${t('建造与陷阱', 'Build & Traps')}</button>
          <button class="gothic-btn ${tab === 'recruit' ? 'active' : ''}" data-gtab="recruit">${t('招募麾下', 'Recruit')}</button>
          <button class="gothic-btn ${tab === 'relics' ? 'active' : ''}" data-gtab="relics" data-locked="${this.engine.isFeatureUnlocked('tab_relics') ? 'false' : 'true'}">${t(`圣物架 (${s.relics.length}/30)`, `Relics (${s.relics.length}/30)`)}</button>
          <button class="gothic-btn ${tab === 'prestige' ? 'active' : ''}" data-gtab="prestige" data-locked="${this.engine.isFeatureUnlocked('tab_prestige') ? 'false' : 'true'}">${t('深渊科技·轮回', 'Tech & Prestige')}</button>
          <button class="gothic-btn ${tab === 'codex' ? 'active' : ''}" data-gtab="codex">${t('图鉴羁绊', 'Codex')}</button>
          <button class="gothic-btn ${tab === 'theater' ? 'active' : ''}" data-gtab="theater">${t('深渊剧场', 'Theater')}</button>
        </div>
        <div class="drawer-body">${content}</div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelectorAll<HTMLElement>('[data-gtab]').forEach((el) => {
      el.addEventListener('click', () => this.openGrimoire(el.dataset.gtab as GrimoireTab, selectedSlotIdx));
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-replay-story]').forEach((el) => {
      el.addEventListener('click', () => {
        const sid = el.dataset.replayStory as StoryId;
        this.enqueueStory(sid, undefined, true);
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-set-lang]').forEach((el) => {
      el.addEventListener('click', () => {
        const next = el.dataset.setLang as Locale;
        setLocale(next);
        this.refreshLanguage();
        this.showToast(next === 'en' ? 'Language switched to English' : '已切换为简体中文');
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-bgm-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.dataset.bgmMode as BgmMode;
        this.stage.sfx.unlockAudio();
        this.stage.sfx.setBgmMuted(false);
        this.stage.sfx.setBgmMode(mode);
        this.syncAudioButtons();
        this.renderDrawer();
      });
    });
    const volSlider = this.drawerHost.querySelector<HTMLInputElement>('[data-bgm-vol]');
    volSlider?.addEventListener('input', () => {
      const pct = Number(volSlider.value);
      this.stage.sfx.unlockAudio();
      this.stage.sfx.setBgmVolume(pct / 100);
      const lbl = this.drawerHost.querySelector<HTMLElement>('[data-bgm-vol-lbl]');
      if (lbl) lbl.textContent = `${pct}%`;
    });

    this.drawerHost.querySelectorAll<HTMLElement>('[data-focus-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.focusSlot);
        this.stage.panToSlot(idx);
        this.openGrimoire('build', idx);
      });
    });
    this.drawerHost.querySelector('[data-upgrade-overlord]')?.addEventListener('click', () => {
      if (this.engine.upgradeOverlord()) {
        this.stage.sfx.play('fusion_ritual', 0.65);
        this.syncHudNumbers();
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足！', 'Not enough Gold!'));
      }
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-upgrade-spell]').forEach((el) => {
      el.addEventListener('click', () => {
        const spId = el.dataset.upgradeSpell as SpellId;
        if (this.engine.upgradeSpell(spId)) {
          this.stage.sfx.play('spell_cast', 0.55);
          this.showToast(
            t(
              `【${locSpell(spId).name}】升级至 Lv.${s.spellLevels[spId]}！`,
              `[${locSpell(spId).name}] upgraded to Lv.${s.spellLevels[spId]}!`,
            ),
          );
          this.renderDrawer();
        } else {
          this.showToast(t('金币不足或已满级！', 'Not enough Gold or already max level!'));
        }
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-select-overlord]').forEach((el) => {
      el.addEventListener('click', () => {
        const oid = el.dataset.selectOverlord as OverlordId;
        const oName = locOverlord(oid).name;
        if (s.prestige.unlockedOverlords.includes(oid)) {
          this.engine.setOverlord(oid);
          this.showToast(t(`已切换坐镇魔王为【${oName}】！`, `Switched active Overlord to [${oName}]!`));
        } else if (this.engine.unlockOverlord(oid)) {
          this.engine.setOverlord(oid);
          this.stage.sfx.play('corruption_complete', 0.7);
          this.showToast(t(`解锁并恭迎新魔王【${oName}】登基！`, `Unlocked & crowned Overlord [${oName}]!`));
        } else {
          this.showToast(
            t(
              `深渊魔晶不足（需 ${OVERLORD_DEFS[oid].unlockCostShards} 魔晶）`,
              `Not enough Abyssal Shards (needs ${OVERLORD_DEFS[oid].unlockCostShards})`,
            ),
          );
        }
        this.syncHudNumbers();
        this.renderDrawer();
      });
    });
    this.drawerHost.querySelector('[data-upgrade-slot]')?.addEventListener('click', () => {
      if (this.engine.upgradeRoom(selectedSlotIdx)) {
        this.stage.sfx.play('gold_chime', 0.55);
        this.showToast(t(`槽位 #${selectedSlotIdx} 升级成功！`, `Slot #${selectedSlotIdx} upgraded!`));
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足！', 'Not enough Gold!'));
      }
    });
    this.drawerHost.querySelector('[data-upgrade-slot-5]')?.addEventListener('click', () => {
      const done = this.engine.upgradeRoomBatch(selectedSlotIdx, 5);
      if (done > 0) {
        this.stage.sfx.play('gold_chime', 0.6);
        this.showToast(t(`槽位 #${selectedSlotIdx} 连升 +${done} 级！`, `Slot #${selectedSlotIdx} upgraded +${done} levels!`));
        this.renderDrawer();
      } else {
        this.showToast(t('金币不足！', 'Not enough Gold!'));
      }
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-gallery-unit]').forEach((el) => {
      el.addEventListener('click', () => {
        this.openDrawer({ kind: 'gallery', target: { kind: 'unit', id: el.dataset.galleryUnit as AbyssalSpeciesId } });
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-gallery-hero]').forEach((el) => {
      el.addEventListener('click', () => {
        this.openDrawer({ kind: 'gallery', target: { kind: 'hero', id: el.dataset.galleryHero as HeroSpeciesId, stage: 0 } });
      });
    });
    this.drawerHost.querySelector('[data-dig-slot]')?.addEventListener('click', () => {
      this.engine.markRockForMining(selectedSlotIdx);
      this.renderDrawer();
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-build-room]').forEach((el) => {
      el.addEventListener('click', () => {
        const rt = el.dataset.buildRoom as BuildableRoomType;
        if (this.engine.buildRoom(selectedSlotIdx, rt)) {
          this.stage.sfx.play('pickaxe_dig', 0.55);
          this.showToast(
            t(
              `已在 #${selectedSlotIdx} 建成【${locRoom(rt).name}】！`,
              `Built [${locRoom(rt).name}] at #${selectedSlotIdx}!`,
            ),
          );
          this.renderDrawer();
        } else {
          this.showToast(t('金币不足！', 'Not enough Gold!'));
        }
      });
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-install-trap]').forEach((el) => {
      el.addEventListener('click', () => {
        const tt = el.dataset.installTrap as TrapType;
        if (this.engine.installTrap(selectedSlotIdx, tt)) {
          this.stage.sfx.play('trap_snap', 0.6);
          this.showToast(
            t(
              `已在 #${selectedSlotIdx} 部署/升级【${locTrap(tt).name}】！`,
              `Deployed/upgraded [${locTrap(tt).name}] at #${selectedSlotIdx}!`,
            ),
          );
          this.renderDrawer();
        } else {
          this.showToast(t('金币或陷阱零件不足！', 'Not enough Gold or Trap Parts!'));
        }
      });
    });
    this.drawerHost.querySelector('[data-summon-imp]')?.addEventListener('click', () => {
      if (this.engine.summonImp()) {
        this.stage.sfx.play('spell_cast', 0.5);
        this.showToast(t('召唤了一只勤劳的苦工小鬼！', 'Summoned a hardworking Toiling Imp!'));
        this.renderDrawer();
      } else {
        this.showToast(t('魔力不足或苦工已达上限（8只）', 'Not enough Mana or Imp cap (8) reached'));
      }
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-recruit]').forEach((el) => {
      el.addEventListener('click', () => {
        const sp = el.dataset.recruit as AbyssalSpeciesId;
        const unit = this.engine.recruitUnit(sp);
        if (unit) {
          this.stage.sfx.play('gold_chime', 0.55);
          this.showToast(t(`成功招募【${locUnitName(unit)}】加入魔王城！`, `Recruited [${locUnitName(unit)}] to your dungeon!`));
          this.renderDrawer();
        } else {
          this.showToast(t('金币不足或战斗人口已满（升级王座或魔王可扩容）', 'Not enough Gold or combat cap reached (upgrade Throne/Overlord)'));
        }
      });
    });
    this.drawerHost.querySelector('[data-toggle-farm]')?.addEventListener('click', () => {
      this.engine.setFarmMode(!s.farmMode);
      this.renderDrawer();
    });
    this.drawerHost.querySelector('[data-toggle-autocast]')?.addEventListener('click', () => {
      s.autoCastSpells = !s.autoCastSpells;
      this.renderDrawer();
    });
    this.drawerHost.querySelector('[data-save-export]')?.addEventListener('click', () => {
      this.opts.onSaveNow();
      const code = this.engine.exportSave();
      void navigator.clipboard?.writeText(code).catch(() => {});
      this.showToast(t(`已安全保存并导出存档码（${code.length} 字符）！`, `Saved & copied save code (${code.length} chars)!`));
    });
    this.drawerHost.querySelectorAll<HTMLElement>('[data-buy-tech]').forEach((el) => {
      el.addEventListener('click', () => {
        const tid = el.dataset.buyTech as TechId;
        if (this.engine.buyTech(tid)) {
          this.stage.sfx.play('fusion_ritual', 0.6);
          this.renderDrawer();
        }
      });
    });
    this.drawerHost.querySelector('[data-trigger-prestige]')?.addEventListener('click', () => {
      if (this.engine.triggerPrestige()) {
        this.stage.sfx.play('corruption_complete', 0.75);
        this.showToast(
          t(
            `位面侵蚀完成！欢迎踏入深渊第 ${this.engine.state.prestige.epoch} 纪元！`,
            `Planar Erosion complete! Welcome to Abyss Epoch ${this.engine.state.prestige.epoch}!`,
          ),
        );
        this.renderDrawer();
      }
    });
  }

  /**
   * High-Res 512x680 Codex Appreciation Gallery Modal:
   * Capturable heroes support 4-state one-click switching:
   *   0: Defiant -> 1: Wavering -> 2: Broken -> 3: Corrupted Ace
   */
  private renderGalleryDrawer(target: GalleryTarget): void {
    let title = '';
    let subtitle = '';
    let portraitKey = '';
    let desc = '';
    let quote = '';
    let stageBtnsHtml = '';

    if (target.kind === 'overlord') {
      const o = OVERLORD_DEFS[target.id];
      const ol = locOverlord(target.id);
      title = ol.name;
      subtitle = ol.title;
      portraitKey = o.portraitKey;
      desc = `${ol.passiveTitle}${t('：', ': ')}${ol.passiveDesc}`;
      quote = ol.quote;
    } else if (target.kind === 'unit') {
      const u = ABYSSAL_UNIT_DEFS[target.id];
      const ul = locUnitDef(target.id);
      title = ul.name;
      subtitle = `${ul.title} (Tier ${u.tier})`;
      portraitKey = u.portraitKey;
      desc = ul.description;
      quote = ul.slapLines[0] ?? '';
    } else {
      const h = HERO_DEFS[target.id];
      const hl = locHeroDef(target.id);
      const st = target.stage ?? 0;
      const isCapturable = Boolean(h.capturableAs);
      const corruptedDef = h.capturableAs ? ABYSSAL_UNIT_DEFS[h.capturableAs] : null;
      const corruptedLoc = h.capturableAs ? locUnitDef(h.capturableAs) : null;
      title = st === 3 && corruptedLoc ? t(`${corruptedLoc.name}（堕落王牌）`, `${corruptedLoc.name} (Corrupted Ace)`) : hl.name;
      subtitle = isCapturable
        ? t('可俘圣堂精锐 · 四态破防鉴赏', 'Capturable Elite · 4-State Gallery')
        : t(`圣堂讨伐军 [${hl.roleTag}]`, `Cathedral Crusader [${hl.roleTag}]`);

      if (isCapturable) {
        if (st === 0) {
          portraitKey = h.portraitKey;
          quote = locTortureStageLine(h.species as CapturableHeroId, 'electric_chair', 0.1);
        } else if (st === 1) {
          portraitKey = `${h.species}_wavering`;
          quote = locTortureStageLine(h.species as CapturableHeroId, 'electric_chair', 0.55);
        } else if (st === 2) {
          portraitKey = `${h.species}_broken`;
          quote = locTortureStageLine(h.species as CapturableHeroId, 'electric_chair', 0.92);
        } else {
          portraitKey = corruptedDef?.portraitKey ?? h.portraitKey;
          quote = corruptedLoc?.slapLines[0] ?? '';
        }
        desc =
          st === 3 && corruptedLoc
            ? corruptedLoc.description
            : t(
                `击败并俘获后可于刑讯室逐步瓦解意志，最终转化收编为三阶王牌【${corruptedLoc?.name ?? ''}】。`,
                `Capture after defeat and shatter her Holy Will in the Torture Chamber to recruit Tier 3 Ace [${corruptedLoc?.name ?? ''}].`,
              );

        const labels =
          getLocale() === 'en'
            ? (['① Defiant', '② Wavering', '③ Broken', '④ Corrupted Ace'] as const)
            : (['① 圣光抵抗', '② 羞愤动摇', '③ 彻底破防', '④ 堕落王牌'] as const);
        stageBtnsHtml = `
          <div style="margin-top:12px; font-size:11px; color:var(--abyss-gold); font-weight:700;">${t('◆ 四态一键鉴赏切换：', '◆ 4-State Portrait Switch:')}</div>
          <div class="action-row">
            ${labels
              .map(
                (lbl, idx) =>
                  `<button class="gothic-btn ${st === idx ? 'active' : ''}" data-gal-stage="${idx}">${lbl}</button>`,
              )
              .join('')}
          </div>
        `;
      } else {
        portraitKey = h.portraitKey;
        desc = h.stealsTreasuryGold
          ? t(
              '专精潜行绕过王座偷取后院宝库金币，可用魔王之手直接拎起狠摔拿双倍赏金！',
              'Sneaks past the Throne to raid Backyard Treasury gold—grab her with Hand of Evil for 2x bounty!',
            )
          : t('圣堂派出的精锐讨伐部队成员。', 'Elite crusader dispatched by the Cathedral.');
      }
    }

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer gallery-drawer" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">${t('高清立绘鉴赏馆', 'HD Portrait Gallery')} · ${escapeHtml(title)}</span>
            <span class="drawer-subtitle">${escapeHtml(subtitle)}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="gothic-btn" data-back-codex="1">${t('返回图鉴', 'Back to Codex')}</button>
            <button class="drawer-close" data-close="1">✕</button>
          </div>
        </div>
        <div class="drawer-body">
          <div class="gallery-layout">
            <div class="gallery-stage">
              <img src="./assets/portraits/${portraitKey}.webp" alt="${escapeHtml(title)}" />
            </div>
            <div>
              <h3 style="color:var(--abyss-gold); font-size:20px; margin-bottom:6px;">${escapeHtml(title)}</h3>
              <div style="font-size:12px; color:var(--abyss-muted); margin-bottom:10px;">${escapeHtml(subtitle)}</div>
              <p style="color:var(--abyss-text); line-height:1.55; margin-bottom:10px;">${escapeHtml(desc)}</p>
              ${quote ? `<div class="portrait-quote">${t(`“${escapeHtml(quote)}”`, `"${escapeHtml(quote)}"`)}</div>` : ''}
              ${stageBtnsHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelector('[data-back-codex]')?.addEventListener('click', () => this.openGrimoire('codex'));
    this.drawerHost.querySelectorAll<HTMLElement>('[data-gal-stage]').forEach((el) => {
      el.addEventListener('click', () => {
        if (target.kind === 'hero') {
          const nextStage = Number(el.dataset.galStage) as 0 | 1 | 2 | 3;
          this.openDrawer({ kind: 'gallery', target: { kind: 'hero', id: target.id, stage: nextStage } });
        }
      });
    });
  }

  private renderGazetteDrawer(
    d: Extract<ActiveDrawer, { kind: 'gazette' }>,
  ): void {
    const headlines = composeGazette({
      before: d.before,
      after: d.after,
      slackerNaps: d.slackerNaps,
      elapsedSec: d.elapsedSec,
      seed: this.engine.state.seed,
    });
    const mins = Math.max(1, Math.round(d.elapsedSec / 60));
    const sumHtml = d.summary
      ? `<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; padding:8px; margin-bottom:10px; background:rgba(20,10,32,0.85); border:1px solid var(--abyss-gold); border-radius:4px; font-size:12px;">
           <span style="color:var(--abyss-gold);">+${fmtNum(d.summary.gold)}G</span>
           ${(d.summary.bullion ?? 0) > 0 ? `<span style="color:#ffd27d;">▪+${fmtNum(d.summary.bullion!)} ${t('暗金金砖', 'Bullion')}</span>` : ''}
           <span style="color:#b982ff;">+${fmtNum(d.summary.mana)} ${t('魔力', 'Mana')}</span>
           <span style="color:#42d69f;">+${fmtNum(d.summary.xp)} XP</span>
           ${d.summary.converted > 0 ? `<span style="color:#f05674;">+${d.summary.converted} ${t('王牌', 'Aces')}</span>` : ''}
         </div>`
      : '';

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer" id="abyss-gazette-modal" style="left:50%; transform:translateX(-50%); width:560px; animation:drawerRiseCentered 0.18s ease-out;" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title">✦ ${t('深渊八卦小报', 'The Abyss Gazette')}</span>
            <span class="drawer-subtitle">${t(`离开 ${mins} 分钟期间的地牢头版花边`, `Headlines from your ${mins}m absence`)}</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="drawer-body">
          ${sumHtml}
          ${headlines
            .map(
              (h) => `
                <div class="gazette-headline">
                  <span class="gazette-tag">${escapeHtml(h.tag)}</span>
                  <span style="font-size:12.5px; color:var(--abyss-cream); line-height:1.5;">${escapeHtml(h.text)}</span>
                </div>
              `,
            )
            .join('')}
          <div style="text-align:right; margin-top:10px;">
            <button class="gothic-btn crimson" data-close="1">${t('阅毕，继续督战！', 'Dismissed—Back to Work!')}</button>
          </div>
        </div>
      </div>
    `;
    this.drawerHost.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => this.closeDrawer());
    });
  }

  private renderDestroyWorldDrawer(): void {
    const s = this.engine.state;
    const totalChickens = s.slots.reduce((acc, sl) => acc + (sl.type === 'hatchery' ? sl.chickens : 0), 0);
    const combatUnits = s.units.filter((u) => u.species !== 'imp').length;

    this.drawerHost.innerHTML = `
      <div class="gothic-drawer" id="abyss-destroy-modal" style="left:50%; transform:translateX(-50%); width:520px; animation:drawerRiseCentered 0.18s ease-out;" data-hit-region="true">
        <div class="drawer-header">
          <div>
            <span class="drawer-title" style="color:var(--abyss-crimson-bright);">◈ ${t('毁灭世界（仅限本存档）', 'Destroy the World (This Save Only)')}</span>
            <span class="drawer-subtitle">${t('黑曜石毁灭契约匣 · 自动保留语言与音量及悔棋备份', 'Obsidian Reset Covenant · Preserves Language, Audio & Backup')}</span>
          </div>
          <button class="drawer-close" data-close="1">✕</button>
        </div>
        <div class="drawer-body">
          <div style="padding:10px; background:rgba(32,10,24,0.9); border:1px solid rgba(240,86,116,0.45); border-radius:5px; margin-bottom:10px; font-size:12px; line-height:1.6;">
            <div style="color:var(--abyss-gold); font-weight:700; margin-bottom:4px;">${t('① 即将化为虚无的深渊家产：', '① Abyssal Assets to be Obliterated:')}</div>
            <div>• ${t(`纪元 Epoch ${s.prestige.epoch} · 当前第 W${s.wave} 波（最高通关 W${s.highestWaveCleared}）`, `Epoch ${s.prestige.epoch} · Wave ${s.wave} (Peak W${s.highestWaveCleared})`)}</div>
            <div>• ${t(`深渊魔晶 ${s.prestige.abyssalShards} · 麾下精锐 ${combatUnits} 名 · 在押俘虏 ${s.prisoners.length} 名`, `Abyssal Shards ${s.prestige.abyssalShards} · Retainers ${combatUnits} · Captives ${s.prisoners.length}`)}</div>
            <div style="color:#ffb347;">• ${t(`孵化场现存 ${totalChickens} 只肥美烤鸡（连鸡带笼全没了！）`, `${totalChickens} plump Hatchery chickens (gone forever!)`)}</div>
            <div style="margin-top:8px;">
              <button class="gothic-btn" data-copy-soul="1">◆ ${t('带走一缕残魂（复制/导出存档码）', 'Take a Soul Shard (Copy Save Code)')}</button>
            </div>
          </div>

          <div class="portrait-quote" style="margin-bottom:10px; border-left-color:var(--abyss-crimson-bright);">
            ${t('② 苦工小鬼抱住你的裤腿哭嚎：「老板三思啊！咱们这个月的加班费和烤鸡补贴还没结呢！！」', '② Toiling Imp clings to your leg: "Boss, think twice! You haven’t paid this month’s overtime or chicken bonus yet!!"')}
          </div>

          <div style="font-size:11px; color:var(--abyss-muted); margin-bottom:6px;">
            ${t('③ 长按下方血色封印 1.5 秒确认清档（松手或按 ESC 立即取消，底层自动保存悔棋备份）：', '③ Hold the crimson seal for 1.5s to confirm (release or ESC to cancel; pre-reset backup saved automatically):')}
          </div>
          <button class="gothic-btn crimson destroy-hold-btn" id="abyss-destroy-hold-btn" data-destroy-hold="1">
            <span class="destroy-hold-fill" data-destroy-fill></span>
            <span style="position:relative; z-index:1;">◈ ${t('长按 1.5 秒 · 彻底毁灭本存档并重开 W1', 'HOLD 1.5s · OBLITERATE SAVE & RESTART W1')}</span>
          </button>
        </div>
      </div>
    `;

    this.drawerHost.querySelector('[data-close]')?.addEventListener('click', () => this.closeDrawer());
    this.drawerHost.querySelector('[data-copy-soul]')?.addEventListener('click', () => {
      const code = this.engine.exportSave();
      void navigator.clipboard?.writeText(code).catch(() => {});
      this.showToast(
        t('已拓印残魂存档码至剪贴板！「掀桌子前先拓块碑留念，很符合魔王美学。」', 'Save code copied to clipboard! "Always carve a tombstone before flipping the table."'),
      );
    });

    const holdBtn = this.drawerHost.querySelector<HTMLElement>('[data-destroy-hold]');
    const fillEl = this.drawerHost.querySelector<HTMLElement>('[data-destroy-fill]');
    let rafId: number | null = null;
    let holdStartMs = 0;

    const cancelHold = (): void => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      holdStartMs = 0;
      if (fillEl) fillEl.style.transform = 'scaleX(0)';
    };

    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        cancelHold();
        window.removeEventListener('keydown', onEsc);
        this.closeDrawer();
      }
    };
    window.addEventListener('keydown', onEsc);

    holdBtn?.addEventListener('pointerdown', () => {
      holdStartMs = performance.now();
      this.stage.playDestroyWorldCollapse();
      const step = (now: number): void => {
        if (holdStartMs === 0) return;
        const p = Math.min(1, (now - holdStartMs) / 1500);
        if (fillEl) fillEl.style.transform = `scaleX(${p.toFixed(3)})`;
        if (p >= 1) {
          cancelHold();
          window.removeEventListener('keydown', onEsc);
          this.opts.onDestroyWorld?.();
          return;
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    });
    holdBtn?.addEventListener('pointerup', cancelHold);
    holdBtn?.addEventListener('pointerleave', cancelHold);
    holdBtn?.addEventListener('pointercancel', cancelHold);
  }
}
