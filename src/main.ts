import './styles/main.css';
import { Application } from 'pixi.js';
import {
  DungeonEngine,
  SIM_DT,
  V24_UI_BANTER_LINES,
  getLocale,
  importSaveBase64,
  initLocale,
  setLocale,
  t,
  type Locale,
} from './core';
import { initHostBridge } from './platform/hostBridge';
import { HitMaskSynchronizer } from './platform/hitMaskSync';
import { DungeonStage, SoundManager, loadGameAssets } from './render';
import { GothicUiController } from './ui';

const SAVE_KEY = 'abyss_keeper_pet_save_v2';
const SAVE_BACKUP_KEY = 'abyss_keeper_pet_save_v3_backup';
const SAVE_V4_BACKUP_KEY = 'abyss_keeper_pet_save_v4_backup';
const SAVE_V5_BACKUP_KEY = 'abyss_keeper_pet_save_v5_backup';
const PRERESET_BACKUP_KEY = 'abyss_keeper_pet_prereset_backup';
const PAST_LIFE_KEY = 'abyss_keeper_pet_past_life';

// V2.4 Atomic Reset Gate: blocks ALL 4 save entry points (15s autosave, beforeunload, tray save_and_quit, UI onSaveNow)
let resetting = false;
let simIntervalHandle: number | null = null;

declare global {
  interface Window {
    __KEEPER_PET__?: {
      engine: DungeonEngine;
      stage: DungeonStage;
      ui: GothicUiController;
      hitMask: HitMaskSynchronizer;
      sfx: SoundManager;
      setLocale: (loc: Locale) => void;
      getFps: () => number;
      destroyWorldAtomic: (skipReload?: boolean) => void;
      restorePreResetBackup: () => boolean;
      saveNow: () => void;
    };
  }
}

function mountDesktopPreviewBackdrop(): void {
  const params = new URLSearchParams(window.location.search);
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
  if (isTauri) return;
  if (params.get('desktop_preview') === '0') return;

  document.body.classList.add('desktop-preview');
  const layer = document.createElement('div');
  layer.id = 'desktop-sim-layer';
  layer.innerHTML = `
    <div class="sim-ide-window">
      <div class="sim-ide-titlebar">
        <span class="sim-ide-dot"></span><span class="sim-ide-dot"></span><span class="sim-ide-dot"></span>
        <span>hit_passthrough.rs — keeper-pet V2.0 — Visual Studio Code (透明桌面穿透示意)</span>
      </div>
      <div class="sim-ide-code"><span class="cmt">// 上方纯透明天空区 100% 原生鼠标穿透，写代码 / 浏览网页零遮挡</span>
<span class="kw">pub fn</span> <span class="fn">poll_cursor_passthrough</span>(window: &amp;WebviewWindow, rects: &amp;[HitRect]) {
    <span class="kw">let</span> (cx, cy) = <span class="fn">get_win32_cursor_pos</span>();
    <span class="kw">let</span> inside = rects.iter().any(|r| r.<span class="fn">contains</span>(cx, cy));
    window.<span class="fn">set_ignore_cursor_events</span>(!inside).ok(); <span class="cmt">// 60Hz &lt; 0.05% CPU</span>
}

<span class="cmt">// 屏幕底端常驻 28 格宽卷轴魔王城：右键拖动滑屏，右键短按扇巴掌，左键拎起晃动！</span></div>
    </div>
    <div class="sim-taskbar">
      <div class="sim-taskbar-pill"></div>
      <div class="sim-taskbar-pill"></div>
      <div class="sim-taskbar-pill"></div>
      <div class="sim-taskbar-pill"></div>
      <div class="sim-taskbar-clock">10:48<br/>2026/11/26</div>
    </div>
  `;
  document.body.prepend(layer);
}

async function bootstrap(): Promise<void> {
  initLocale();
  mountDesktopPreviewBackdrop();

  const bridge = initHostBridge();
  const stageRoot = document.getElementById('stage-root')!;
  const uiRoot = document.getElementById('ui-root')!;
  stageRoot.dataset.hostMode = bridge.isTauri ? 'tauri' : 'web';

  const params = new URLSearchParams(window.location.search);
  const engine = new DungeonEngine({ seed: 2026, overlordId: 'lilith' });
  let offlineNotice = '';
  let offlineGazetteData: {
    elapsedSec: number;
    gold: number;
    bullion?: number;
    mana: number;
    xp: number;
    converted: number;
  } | null = null;

  if (params.get('fresh') !== '1') {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(SAVE_KEY);
      if (saved) {
        // V2.5: UTF-8 safe ASCII regex version probe before migrating v4/v5 saves!
        try {
          const decoded = atob(saved.trim());
          const verMatch = /"version"\s*:\s*(\d+)/.exec(decoded);
          const rawVer = verMatch ? Number(verMatch[1]) : NaN;
          if (Number.isFinite(rawVer)) {
            if (rawVer < 5) {
              window.localStorage.setItem(SAVE_V4_BACKUP_KEY, saved);
            } else if (rawVer < 6) {
              window.localStorage.setItem(SAVE_V5_BACKUP_KEY, saved);
            }
          }
        } catch {
          // Ignore pre-check errors; importSave handles full UTF-8 decoding
        }

        engine.importSave(saved);
        const awaySec = Math.max(0, (Date.now() - engine.state.lastSaveTimestampMs) / 1000);
        if (awaySec >= 30) {
          const rep = engine.settleOffline(awaySec);
          if (awaySec >= 900) {
            offlineGazetteData = {
              elapsedSec: rep.effectiveSeconds,
              gold: rep.goldGained,
              bullion: rep.bullionGained ?? 0,
              mana: rep.manaGained,
              xp: rep.xpPerUnit,
              converted: rep.prisonersConverted,
            };
          } else if (rep.goldGained > 0 || (rep.bullionGained ?? 0) > 0 || rep.manaGained > 0) {
            const bStr =
              (rep.bullionGained ?? 0) > 0
                ? t(`、▪+${rep.bullionGained} 暗金金砖`, `, ▪+${rep.bullionGained} Bullion`)
                : '';
            offlineNotice = t(
              `离线 ${Math.round(rep.effectiveSeconds / 60)} 分钟结算：+${rep.goldGained} 金币${bStr}、+${rep.manaGained} 魔力！`,
              `Offline ${Math.round(rep.effectiveSeconds / 60)}m summary: +${rep.goldGained}G${bStr}, +${rep.manaGained} Mana!`,
            );
          }
        }
      }
    } catch {
      // Never silently overwrite corrupt/incompatible save: back up raw payload first!
      if (saved) {
        try {
          window.localStorage.setItem(SAVE_BACKUP_KEY, saved);
        } catch {
          // Ignore quota errors
        }
      }
      offlineNotice = t(
        '检测到旧存档格式异常，已安全备份原存档并开启新魔王城。',
        'Incompatible save detected—original payload safely backed up and a fresh dungeon initialized.',
      );
    }
  }

  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: stageRoot,
    backgroundAlpha: 0,
    antialias: true,
    roundPixels: false,
    resolution: 1,
    powerPreference: 'high-performance',
  });
  stageRoot.appendChild(app.canvas);

  const assets = await loadGameAssets();
  const sfx = new SoundManager();
  void sfx.preload();

  // Unlock BGM & Web Audio cleanly on first user gesture
  const unlockOnce = (): void => {
    sfx.unlockAudio();
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true, capture: true });
  window.addEventListener('keydown', unlockOnce, { once: true, capture: true });

  const hitMask = new HitMaskSynchronizer(bridge);
  let ui!: GothicUiController;

  const saveNow = (): void => {
    if (resetting) return;
    try {
      window.localStorage.setItem(SAVE_KEY, engine.exportSave());
    } catch {
      // Ignore quota errors
    }
  };

  const onBeforeUnload = (): void => {
    saveNow();
  };

  const destroyWorldAtomic = (skipReload = false): void => {
    resetting = true;
    if (simIntervalHandle !== null) {
      window.clearInterval(simIntervalHandle);
      simIntervalHandle = null;
    }
    window.removeEventListener('beforeunload', onBeforeUnload);
    try {
      const backupPayload = engine.exportSave();
      window.localStorage.setItem(PRERESET_BACKUP_KEY, backupPayload);
      window.localStorage.setItem(
        PAST_LIFE_KEY,
        JSON.stringify({
          epoch: engine.state.prestige.epoch,
          wave: engine.state.wave,
          ts: Date.now(),
        }),
      );
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore storage errors
    }
    if (!skipReload) {
      window.location.reload();
    }
  };

  const restorePreResetBackup = (): boolean => {
    try {
      const raw = window.localStorage.getItem(PRERESET_BACKUP_KEY);
      if (!raw) return false;
      // Validate via importSaveBase64 -> migrateSaveState before writing back!
      importSaveBase64(raw);
      resetting = true;
      if (simIntervalHandle !== null) {
        window.clearInterval(simIntervalHandle);
        simIntervalHandle = null;
      }
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.localStorage.setItem(SAVE_KEY, raw);
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  };

  const stage = new DungeonStage(app, engine, assets, sfx, {
    onSelectUnit: (unitId) => ui.openPortrait(unitId),
    onSelectRoom: (slotIndex) => {
      const sl = engine.state.slots[slotIndex];
      if (sl?.type === 'corruption') ui.openDrawer({ kind: 'torture', tab: 'chamber' });
      else if (sl?.type === 'prison') ui.openDrawer({ kind: 'torture', tab: 'prison' });
      else if (sl?.type === 'altar') ui.openDrawer({ kind: 'altar' });
      else ui.openGrimoire('build', slotIndex);
    },
    onSelectOverlord: () => ui.openGrimoire('throne'),
    onDragStateChange: (dragging) => {
      void bridge.setDragCapture(dragging);
    },
    onToast: (msg) => ui.showToast(msg),
    onRelicBanner: (relicId) => ui.showRelicBanner(relicId),
    onThiefAlert: (stolenGold) => ui.flashThiefAlert(stolenGold),
    onTutorialCameraPanned: () => {
      engine.completeTutorialStep(1);
    },
    onCutin: (payload) => ui.triggerCutin(payload),
    onStoryTrigger: (storyId, heroSpecies) => ui.enqueueStory(storyId, heroSpecies),
    onFeatureUnlocked: (features, text) => ui.handleFeatureUnlocked(features, text),
    onHeartShattered: (retreatWave) => ui.showRetreatBanner(retreatWave),
  });

  ui = new GothicUiController({
    root: uiRoot,
    engine,
    stage,
    onHitRegionsDirty: () => {
      requestAnimationFrame(() => {
        hitMask.sync(true);
        stage.refreshBubbleObstacles();
      });
    },
    onToggleMinimize: (minimized) => {
      hitMask.isMinimized = minimized;
    },
    onSaveNow: saveNow,
    onDestroyWorld: () => destroyWorldAtomic(false),
    onRestoreBackup: restorePreResetBackup,
    hasPreResetBackup: () => Boolean(window.localStorage.getItem(PRERESET_BACKUP_KEY)),
  });

  // Dynamically sync Pixi bubble sky ceiling to actual HUD top (supports desktop-preview 44px offset & EN/ZH height!)
  const syncSkyCeiling = (): void => {
    const hudEl = document.getElementById('abyss-hud-bar');
    if (!hudEl) return;
    const hudRect = hudEl.getBoundingClientRect();
    const canvasRect = app.canvas.getBoundingClientRect();
    if (hudRect.height > 4) {
      stage.setSkyCeiling(hudRect.top - canvasRect.top);
    }
  };
  syncSkyCeiling();
  const hudElForObs = document.getElementById('abyss-hud-bar');
  if (hudElForObs && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => syncSkyCeiling());
    ro.observe(hudElForObs);
  }
  window.addEventListener('resize', syncSkyCeiling);

  // Trigger Prologue Story #1 after 1.2s on a fresh W1 dungeon if unseen
  if (
    engine.state.highestWaveCleared === 0 &&
    engine.state.prestige.epoch === 1 &&
    !engine.state.prestige.storySeen.includes('prologue_desk')
  ) {
    window.setTimeout(() => {
      if (!engine.state.prestige.storySeen.includes('prologue_desk')) {
        ui.enqueueStory('prologue_desk');
      }
    }, 1200);
  }

  if (offlineGazetteData) {
    ui.openGazetteModal(
      {},
      engine.state.chronicle,
      0,
      offlineGazetteData.elapsedSec,
      offlineGazetteData,
    );
  } else if (offlineNotice) {
    ui.showToast(offlineNotice);
  }

  // V2.4 Past-Life Echo Easter Egg on fresh W1 prep after Destroy World
  try {
    const pastRaw = window.localStorage.getItem(PAST_LIFE_KEY);
    if (pastRaw && engine.state.wave === 1 && engine.state.highestWaveCleared === 0) {
      window.localStorage.removeItem(PAST_LIFE_KEY);
      window.setTimeout(() => {
        const imp = engine.state.units.find((u) => u.species === 'imp');
        const en = getLocale() === 'en';
        if (imp) {
          stage.spawnBubble(
            imp.x,
            0,
            en ? V24_UI_BANTER_LINES.pastLifeImpEn : V24_UI_BANTER_LINES.pastLifeImpZh,
            0xb982ff,
            { speakerId: imp.id, speakerName: imp.name, priority: 'interactive', faction: 'ally' },
          );
        }
      }, 2200);
    }
  } catch {
    // Ignore storage errors
  }

  if (bridge.isTauri) {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('tray-action', (event) => {
      if (event.payload === 'toggle_orb') ui.setMinimized(!ui.minimized);
      else if (event.payload === 'toggle_mute') {
        const muted = ui.toggleMute();
        sfx.setBgmMuted(muted);
        ui.syncAudioButtons();
        ui.showToast(muted ? t('已静音', 'Audio Muted') : t('音效与 BGM 已开启', 'Audio & BGM Enabled'));
      } else if (event.payload === 'save_and_quit') {
        saveNow();
      }
    });
  }

  // Truly decoupled 20 TPS simulation loop (runs at full speed even in Crystal Orb 0 FPS mode)
  let lastSimMs = performance.now();
  let simAccumulator = 0;
  let hudRefreshAccum = 0;
  let autosaveAccum = 0;
  let fpsSmoothed = 60;

  simIntervalHandle = window.setInterval(() => {
    if (resetting) return;
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - lastSimMs) / 1000));
    lastSimMs = now;

    simAccumulator += dt;
    let steps = 0;
    while (simAccumulator >= SIM_DT && steps < 5) {
      engine.stepTick();
      simAccumulator -= SIM_DT;
      steps += 1;
    }

    hudRefreshAccum += dt;
    if (hudRefreshAccum >= 0.2) {
      hudRefreshAccum = 0;
      ui.syncHudNumbers();
      hitMask.sync(false);
    }

    // Drive dynamic Flow-Music BGM crossfade (Boss / Fleeing Thief -> Valkyrie Raid; Idle -> Abyssal Lounge)
    const isUrgentBattle = engine.state.heroes.some(
      (h) => !h.downedForCapture && h.hp > 0 && (h.isBoss || h.fleeingWithLoot),
    );
    sfx.syncDynamicBgm(dt, isUrgentBattle, ui.minimized);

    autosaveAccum += dt;
    if (autosaveAccum >= 15) {
      autosaveAccum = 0;
      saveNow();
    }
  }, 50);

  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    if (dt > 0) {
      fpsSmoothed = fpsSmoothed * 0.9 + (1 / dt) * 0.1;
    }
    if (!stage.minimized) {
      stage.update(dt);
    }
  });

  window.addEventListener('resize', () => hitMask.sync(true));
  window.addEventListener('beforeunload', onBeforeUnload);

  // V2.1 Focused-WebView-ONLY spell hotkeys 1-4 (NEVER global Tauri shortcuts!)
  const HOTKEY_SPELLS = ['abyss_lightning', 'demon_frenzy', 'charm_mist', 'abyss_blackhole'] as const;
  window.addEventListener('keydown', (e) => {
    if (ui.minimized) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < HOTKEY_SPELLS.length) {
      const sp = HOTKEY_SPELLS[idx]!;
      if (engine.castSpell(sp, false)) {
        ui.syncHudNumbers();
      }
    }
  });

  hitMask.sync(true);

  window.__KEEPER_PET__ = {
    engine,
    stage,
    ui,
    hitMask,
    sfx,
    setLocale: (loc: Locale) => {
      setLocale(loc);
      ui.refreshLanguage();
      requestAnimationFrame(syncSkyCeiling);
    },
    getFps: () => Math.round(fpsSmoothed),
    destroyWorldAtomic,
    restorePreResetBackup,
    saveNow,
  };
}

void bootstrap();
