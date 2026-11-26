import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import {
  DUNGEON_WIDTH,
  DungeonEngine,
  HERO_DEFS,
  OVERLORD_DEFS,
  ROOM_RESONANCE_DEFS,
  SLOT_WIDTH,
  THRONE_SLOT_INDEX,
  TOTAL_SLOTS,
  TRAP_SYNERGY_DEFS,
  V24_UI_BANTER_LINES,
  deriveQuirk,
  evaluateDungeonResonances,
  getLocale,
  locHeroDef,
  locOverlord,
  locRoom,
  locUnitName,
  requiredWaveForSlot,
  t,
  type DungeonEvent,
  type FeatureId,
  type HeroSpeciesId,
  type RelicId,
  type RoomSlot,
  type StoryId,
} from '../core';
import type { LoadedGameAssets } from './AssetLoader';
import { BanterDirector } from './BanterDirector';
import { HandCursor } from './HandCursor';
import { ParticleLayer } from './ParticleLayer';
import { PresenceSensor } from './PresenceSensor';
import { SoundManager } from './SoundManager';
import { UnitSprite } from './UnitSprite';

export const DUNGEON_STRIP_HEIGHT = 188;
const TURF_HEIGHT = 28;
const ROOM_PIXEL_HEIGHT = 160;

export interface BubbleOptions {
  speakerId?: string;
  speakerName?: string;
  priority?: 'interactive' | 'banter';
  faction?: 'ally' | 'enemy' | 'overlord';
}

export interface BubbleScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  text: string;
}

interface SpeechBubble {
  container: Container;
  worldX: number;
  screenX: number;
  baseY: number;
  bw: number;
  bh: number;
  lane: 0 | 1;
  life: number;
  maxLife: number;
  speakerId?: string;
  borderColor: number;
  priority: 'interactive' | 'banter';
  text: string;
}

interface ChickenVisual {
  sprite: Sprite;
  slotIndex: number;
  localX: number;
  vx: number;
  scatterTimer: number;
  hopPhase: number;
}

export interface StageCallbacks {
  onSelectUnit: (unitId: string) => void;
  onSelectRoom: (slotIndex: number) => void;
  onSelectOverlord: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onToast: (message: string) => void;
  onRelicBanner: (relicId: RelicId) => void;
  onThiefAlert: (stolenGold: number) => void;
  onTutorialCameraPanned: () => void;
  onCutin?: (payload: { subId: string; label: string; color?: number }) => void;
  onStoryTrigger?: (storyId: StoryId, heroSpecies?: HeroSpeciesId) => void;
  onFeatureUnlocked?: (features: FeatureId[], text?: string) => void;
  onHeartShattered?: (retreatWave: number) => void;
}

/**
 * V2.0 Wide 28-Slot Scrollable Cutaway Dungeon Stage (PixiJS v8):
 * - Right-click drag (>=6px) pans horizontally across 28 rooms (Backyard 0..5 | Throne 6 | Frontline 7..27)
 * - Right-click short tap (<6px) triggers classic Bullfrog Slap!
 * - Interactive Minimap along the dungeon cornice shows Throne, Treasury, Heroes, Thieves & viewport
 * - High-Detail Option B Gothic Chibis + Live Torture Implements + Full Combat/Eating/Relic VFX!
 */
export class DungeonStage {
  public readonly app: Application;
  public readonly engine: DungeonEngine;
  public readonly assets: LoadedGameAssets;
  public readonly sfx: SoundManager;
  public readonly handCursor: HandCursor;
  public readonly fxLayer: ParticleLayer;

  private readonly callbacks: StageCallbacks;
  private readonly rootContainer = new Container();
  private readonly worldContainer = new Container();

  private readonly roomsLayer = new Container();
  private readonly fogWallLayer = new Container();
  private readonly propsLayer = new Container();
  private readonly unitsLayer = new Container();
  private readonly bouldersLayer = new Container();
  private readonly speakerArrowGfx = new Graphics();
  private readonly bubblesLayer = new Container();
  private readonly uiOverlayLayer = new Container();

  private readonly surfaceGfx = new Graphics();
  private readonly minimapGfx = new Graphics();
  private readonly torchGlowGfx = new Graphics();
  private readonly roomHighlightGfx = new Graphics();
  private readonly trapChargeGfx = new Graphics();
  private readonly overlordHeartGfx = new Graphics();
  private readonly fogWallGfx = new Graphics();
  private fogWallLabels: Text[] = [];
  private lastFogTerritoryMax = -1;
  private lastFogRoomsTopY = -1;
  private lastFogLocale = '';
  private skyCeilingY = -1;
  private cachedLowBarRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  private cachedDrawerRects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  private obstacleCacheAccum = 0.25;

  private readonly roomSprites: Sprite[] = [];
  private readonly roomLabels: Text[] = [];
  private readonly lastRoomLabelText: string[] = new Array(TOTAL_SLOTS).fill('');
  private readonly lastRoomLabelFill: number[] = new Array(TOTAL_SLOTS).fill(-1);
  private readonly treasuryGoldSprite: Sprite;
  private readonly overlordSprite: Sprite;
  private readonly torturePropSprite: Sprite;
  private readonly prisonerChibiSprite: Sprite;

  // V2.4 Prison cell chibis (max 4), foreground iron bars, Throne Magic Candle & T-15s Horizon Silhouettes
  private readonly prisonChibiSprites: Sprite[] = [];
  private readonly prisonBarsGfx = new Graphics();
  private readonly throneCandleGfx = new Graphics();
  private lastCandleIntSec = -1;
  private readonly silhouetteLayer = new Container();
  private readonly silhouetteSprites: Sprite[] = [];
  private readonly silhouetteTags: Text[] = [];
  private lastSilhouetteSeq = -1;
  private lastSilhouetteLocale = '';
  private visibleSilhouetteSpecies: HeroSpeciesId[] = [];
  public readonly presence: PresenceSensor;
  public readonly banterDirector = new BanterDirector();

  private readonly trapSprites = new Map<number, Sprite>();
  private readonly abyssalSprites = new Map<string, UnitSprite>();
  private readonly heroSprites = new Map<string, UnitSprite>();
  private readonly boulderSprites = new Map<string, Sprite>();
  private chickens: ChickenVisual[] = [];
  private bubbles: SpeechBubble[] = [];

  // Smooth horizontal camera scrolling (world X at left edge of viewport)
  public cameraX = 0;
  private targetCameraX = 0;
  private isRightPanning = false;
  private rightDownScreenX = 0;
  private rightDownScreenY = 0;
  private rightDownCamX = 0;
  private rightDraggedDist = 0;

  // Pointer & Left-Drag state
  private pointerX = 0;
  private pointerY = 0;
  private hoveredSlot = -1;
  private pointerDownPos: {
    x: number;
    y: number;
    unitId?: string;
    heroId?: string;
    heroKind?: 'thief' | 'downed';
  } | null = null;
  private isDraggingUnit = false;
  private shakeTimer = 0;
  private hitstopTimer = 0;
  private electricTickAccum = 0;
  private lastProcessedEventTick = 0;
  public minimized = false;

  constructor(
    app: Application,
    engine: DungeonEngine,
    assets: LoadedGameAssets,
    sfx: SoundManager,
    callbacks: StageCallbacks,
  ) {
    this.app = app;
    this.engine = engine;
    this.assets = assets;
    this.sfx = sfx;
    this.callbacks = callbacks;

    this.fxLayer = new ParticleLayer();
    this.handCursor = new HandCursor(assets.cursors);

    this.unitsLayer.sortableChildren = true;
    this.bubblesLayer.eventMode = 'none';
    this.bubblesLayer.interactiveChildren = false;
    this.fogWallLayer.eventMode = 'none';
    this.fogWallLayer.addChild(this.fogWallGfx);
    this.worldContainer.addChild(
      this.roomsLayer,
      this.torchGlowGfx,
      this.propsLayer,
      this.prisonBarsGfx,
      this.throneCandleGfx,
      this.silhouetteLayer,
      this.trapChargeGfx,
      this.overlordHeartGfx,
      this.unitsLayer,
      this.bouldersLayer,
      this.fxLayer.container,
      this.fogWallLayer,
      this.speakerArrowGfx,
      this.roomHighlightGfx,
    );

    // V2.4 PresenceSensor (Desktop Pet Mirror + 10m Extreme Voltage Fuse)
    this.presence = new PresenceSensor({
      onSlackerWakeShout: () => {
        const slackers = this.engine.state.units.filter(
          (u) => u.hp > 0 && deriveQuirk(this.engine.state.seed, u.id, u.species) === 'chronic_slacker',
        );
        const lead = slackers[0];
        if (!lead) return;
        if (!lead.quirkSeen) this.engine.revealQuirk(lead.id);
        const en = getLocale() === 'en';
        const line = en
          ? V24_UI_BANTER_LINES.slackerWakeEn(slackers.length)
          : V24_UI_BANTER_LINES.slackerWakeZh(slackers.length);
        this.spawnBubble(lead.x, 0, line, 0xf2c655, {
          speakerId: lead.id,
          speakerName: locUnitName(lead),
          priority: 'interactive',
          faction: 'ally',
        });
      },
      onExtremeInactivityFuse: () => {
        if (this.engine.state.noMercyMode) {
          this.engine.setNoMercyMode(false);
          this.callbacks.onToast(
            t('10 分钟无操作，极限审讯已自动切回安全词协议。', '10m idle fuse: Extreme Voltage reverted to Safeword Protocol.'),
          );
        }
      },
    });
    this.presence.attach(app.canvas);

    // Pre-allocate 4 jailed prisoner chibi sprites + 8 pooled horizon silhouettes
    for (let i = 0; i < 4; i++) {
      const sp = new Sprite(assets.unitsSheet.textures['holy_knight_idle_0'] ?? assets.rooms.corridor);
      sp.anchor.set(0.5, 0.95);
      sp.visible = false;
      this.propsLayer.addChild(sp);
      this.prisonChibiSprites.push(sp);
    }
    for (let i = 0; i < 8; i++) {
      const sp = new Sprite(assets.unitsSheet.textures['novice_adventurer_idle_0'] ?? assets.rooms.corridor);
      sp.anchor.set(0.5, 0.95);
      sp.tint = 0x0a0514;
      sp.alpha = 0.62;
      sp.visible = false;
      this.silhouetteLayer.addChild(sp);
      this.silhouetteSprites.push(sp);

      const tag = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
          fontSize: 10,
          fontWeight: 'bold',
          fill: 0xf2c655,
          stroke: { color: 0x0e0616, width: 3 },
        }),
      });
      tag.anchor.set(0.5, 1);
      tag.visible = false;
      this.silhouetteLayer.addChild(tag);
      this.silhouetteTags.push(tag);
    }

    this.rootContainer.addChild(
      this.worldContainer,
      this.surfaceGfx,
      this.minimapGfx,
      this.bubblesLayer,
      this.uiOverlayLayer,
      this.handCursor.container,
    );
    this.app.stage.addChild(this.rootContainer);

    // Pre-create 28 cutaway room slots & cornice labels
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const sp = new Sprite(assets.rooms.corridor);
      sp.roundPixels = true;
      this.roomsLayer.addChild(sp);
      this.roomSprites.push(sp);

      const lbl = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
          fontSize: 11,
          fontWeight: 'bold',
          fill: 0xf2c655,
          stroke: { color: 0x120919, width: 3 },
        }),
      });
      lbl.anchor.set(0.5, 0);
      this.roomsLayer.addChild(lbl);
      this.roomLabels.push(lbl);
    }

    this.treasuryGoldSprite = new Sprite(assets.treasuryGold[0]);
    this.treasuryGoldSprite.visible = false;
    this.roomsLayer.addChild(this.treasuryGoldSprite);

    // Overlord chibi sitting proudly at Throne (Slot 6)!
    const oTex =
      assets.chibis[OVERLORD_DEFS[engine.state.overlordId].chibiKey] ??
      assets.unitsSheet.textures['lilith_overlord_idle_0']!;
    this.overlordSprite = new Sprite(oTex);
    this.overlordSprite.anchor.set(0.5, 0.953);
    this.propsLayer.addChild(this.overlordSprite);

    // Live Equippable Torture Implement Prop + Prisoner Chibi inside Corruption Chamber!
    this.torturePropSprite = new Sprite(assets.props.electric_chair ?? assets.traps.charm_censer);
    this.torturePropSprite.anchor.set(0.5, 0.95);
    this.torturePropSprite.visible = false;
    this.propsLayer.addChild(this.torturePropSprite);

    this.prisonerChibiSprite = new Sprite(assets.chibis['holy_knight'] ?? oTex);
    this.prisonerChibiSprite.anchor.set(0.5, 0.95);
    this.prisonerChibiSprite.visible = false;
    this.propsLayer.addChild(this.prisonerChibiSprite);

    this.bindPointerEvents();
  }

  public setSkyCeiling(y: number): void {
    if (Number.isFinite(y) && y > 40) {
      this.skyCeilingY = y;
    }
  }

  public getActiveBubbleScreenRects(): BubbleScreenRect[] {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    return this.bubbles.map((b) => {
      const left = canvasRect.left + b.container.x - b.bw / 2;
      const top = canvasRect.top + b.container.y - b.bh / 2;
      const right = left + b.bw;
      const bottom = top + b.bh + 6; // includes tail tip
      return {
        x: left,
        y: top,
        width: b.bw,
        height: b.bh + 6,
        left,
        top,
        right,
        bottom,
        text: b.text,
      };
    });
  }

  private getEffectiveTerritoryMax(): number {
    const s = this.engine.state;
    if (!s.progression || s.progression.sandbox || s.prestige.epoch > 1) {
      return TOTAL_SLOTS - 1;
    }
    return Math.min(TOTAL_SLOTS - 1, s.progression.territoryMax);
  }

  public getViewportMetrics(): {
    width: number;
    height: number;
    dungeonTopY: number;
    roomsTopY: number;
    floorY: number;
    scaleX: number;
    slotW: number;
    maxCameraX: number;
  } {
    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    const dungeonTopY = height - DUNGEON_STRIP_HEIGHT;
    const roomsTopY = dungeonTopY + TURF_HEIGHT;
    const floorY = roomsTopY + 146;
    const slotW = SLOT_WIDTH; // Fixed crisp 160px per room across 28 rooms (4480px total!)
    const tMax = this.getEffectiveTerritoryMax();
    const visibleWorldW = Math.min(DUNGEON_WIDTH, (tMax + 2) * SLOT_WIDTH);
    const maxCameraX = Math.max(0, visibleWorldW - width);
    return { width, height, dungeonTopY, roomsTopY, floorY, scaleX: 1, slotW, maxCameraX };
  }

  public worldToScreenX(worldX: number): number {
    return worldX - this.cameraX;
  }

  public screenToWorldX(screenX: number): number {
    return screenX + this.cameraX;
  }

  public panToSlot(slotIndex: number): void {
    const m = this.getViewportMetrics();
    const desired = slotIndex * SLOT_WIDTH + SLOT_WIDTH * 0.5 - m.width * 0.5;
    this.targetCameraX = Math.max(0, Math.min(m.maxCameraX, desired));
    this.cameraX = this.targetCameraX;
  }

  public setMinimized(minimized: boolean): void {
    this.minimized = minimized;
    this.rootContainer.visible = !minimized;
    if (minimized) {
      this.handCursor.setVisible(false);
    }
  }

  public isDragging(): boolean {
    return this.isDraggingUnit;
  }

  public clearBubbles(): void {
    for (const b of this.bubbles) {
      b.container.destroy({ children: true });
    }
    this.bubbles = [];
  }

  private bindPointerEvents(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Mouse wheel horizontal pan over dungeon strip!
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.minimized) return;
        const m = this.getViewportMetrics();
        if (this.pointerY < m.dungeonTopY - 8) return;
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.targetCameraX = Math.max(0, Math.min(m.maxCameraX, this.targetCameraX + delta * 1.4));
        this.callbacks.onTutorialCameraPanned();
      },
      { passive: false },
    );

    window.addEventListener('pointermove', (e) => {
      if (this.minimized) return;
      const rect = canvas.getBoundingClientRect();
      this.pointerX = e.clientX - rect.left;
      this.pointerY = e.clientY - rect.top;

      const m = this.getViewportMetrics();

      // Right-click drag -> smooth horizontal camera pan across 28 rooms!
      if (this.isRightPanning) {
        const dx = this.pointerX - this.rightDownScreenX;
        const dy = this.pointerY - this.rightDownScreenY;
        this.rightDraggedDist = Math.max(this.rightDraggedDist, Math.hypot(dx, dy));
        if (this.rightDraggedDist >= 6) {
          this.targetCameraX = Math.max(0, Math.min(m.maxCameraX, this.rightDownCamX - dx));
          this.cameraX = this.targetCameraX;
          this.callbacks.onTutorialCameraPanned();
        }
      }

      const inDungeon = this.pointerY >= m.dungeonTopY - 6 || this.isDraggingUnit;
      this.handCursor.setVisible(inDungeon && !this.isRightPanning);
      canvas.style.cursor = this.isRightPanning ? 'grabbing' : inDungeon ? 'none' : 'default';
      this.handCursor.setPosition(this.pointerX, this.pointerY);

      const worldX = this.screenToWorldX(this.pointerX);
      if (this.pointerY >= m.dungeonTopY) {
        this.hoveredSlot = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(worldX / m.slotW)));
      } else if (!this.isDraggingUnit) {
        this.hoveredSlot = -1;
      }

      // Edge-auto-scroll gently while dangling a unit near left/right viewport edges!
      if (this.isDraggingUnit) {
        if (this.pointerX < 70) {
          this.targetCameraX = Math.max(0, this.targetCameraX - 16);
        } else if (this.pointerX > m.width - 70) {
          this.targetCameraX = Math.min(m.maxCameraX, this.targetCameraX + 16);
        }
      }

      // Left-click drag threshold -> Hand of Evil Dangle Grab (Priority: Thief > Downed Captive > Ally!)
      if (this.pointerDownPos && !this.isDraggingUnit) {
        const dx = this.pointerX - this.pointerDownPos.x;
        const dy = this.pointerY - this.pointerDownPos.y;
        if (Math.hypot(dx, dy) >= 8) {
          const ok = this.pointerDownPos.unitId
            ? this.engine.grabUnit(this.pointerDownPos.unitId)
            : this.pointerDownPos.heroId
              ? this.pointerDownPos.heroKind === 'downed'
                ? this.engine.grabDownedHero(this.pointerDownPos.heroId)
                : this.engine.grabThiefHero(this.pointerDownPos.heroId)
              : false;
          if (ok) {
            this.isDraggingUnit = true;
            this.handCursor.setMode('grab');
            this.sfx.play('hand_grab', 0.55);
            this.callbacks.onDragStateChange(true);
          }
        }
      }
    });

    canvas.addEventListener('pointerleave', () => {
      if (!this.isDraggingUnit && !this.isRightPanning) {
        this.handCursor.setVisible(false);
        this.hoveredSlot = -1;
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (this.minimized) return;
      const rect = canvas.getBoundingClientRect();
      this.pointerX = e.clientX - rect.left;
      this.pointerY = e.clientY - rect.top;
      const m = this.getViewportMetrics();
      if (this.pointerY < m.dungeonTopY - 8) return;

      // Check Minimap click along top turf bar!
      if (e.button === 0 && this.pointerY >= m.dungeonTopY && this.pointerY <= m.dungeonTopY + 18) {
        const ratio = Math.max(0, Math.min(1, (this.pointerX - 16) / Math.max(1, m.width - 32)));
        const targetWorldX = ratio * DUNGEON_WIDTH;
        this.targetCameraX = Math.max(0, Math.min(m.maxCameraX, targetWorldX - m.width * 0.5));
        this.cameraX = this.targetCameraX;
        this.callbacks.onTutorialCameraPanned();
        return;
      }

      const worldX = this.screenToWorldX(this.pointerX);
      const slotIdx = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(worldX / m.slotW)));

      // RIGHT CLICK -> Start Right-Pan tracking (if dragged >=6px -> pan; if quick tap <6px on pointerup -> Bullfrog Slap!)
      if (e.button === 2) {
        this.isRightPanning = true;
        this.rightDownScreenX = this.pointerX;
        this.rightDownScreenY = this.pointerY;
        this.rightDownCamX = this.cameraX;
        this.rightDraggedDist = 0;
        return;
      }

      if (e.button !== 0) return;

      // 1. Priority #1: Grab sneaking/fleeing Thief first!
      const hitThief = this.findGrabableThiefAt(worldX, this.pointerY, m);
      if (hitThief) {
        this.pointerDownPos = { x: this.pointerX, y: this.pointerY, heroId: hitThief.id, heroKind: 'thief' };
        return;
      }

      // 2. Priority #2: Grab downed capturable Hero to drop directly into Torture Chamber!
      const hitDowned = this.findGrabableDownedHeroAt(worldX, this.pointerY, m);
      if (hitDowned) {
        this.pointerDownPos = { x: this.pointerX, y: this.pointerY, heroId: hitDowned.id, heroKind: 'downed' };
        return;
      }

      // 3. Priority #3: Abyssal Unit
      const hitUnit = this.findAbyssalUnitAt(worldX, this.pointerY, m);
      if (hitUnit) {
        this.pointerDownPos = { x: this.pointerX, y: this.pointerY, unitId: hitUnit.id };
        return;
      }

      // 3. Clicking Throne opens Overlord Level-Up & Skills Panel directly!
      const slot = this.engine.state.slots[slotIdx];
      if (!slot) return;
      if (slot.type === 'throne') {
        this.callbacks.onSelectOverlord();
      } else if (slot.type === 'rock_vein') {
        if (!this.engine.isSlotUnlocked(slotIdx)) {
          const reqW = requiredWaveForSlot(slotIdx);
          this.sfx.play('boulder_crush', 0.28);
          this.shakeTimer = 0.12;
          this.spawnBubble(
            slotIdx * m.slotW + m.slotW * 0.5,
            m.roomsTopY + 34,
            t(`深渊封印中 · 通关 W${reqW} 破壁！`, `Abyssal Seal — Clear Wave ${reqW} to break through!`),
            0xb982ff,
            {
              speakerId: `slot:${slotIdx}`,
              speakerName: locOverlord(this.engine.state.overlordId).name,
              priority: 'interactive',
              faction: 'overlord',
            },
          );
        } else if (this.engine.markRockForMining(slotIdx)) {
          this.sfx.play('pickaxe_dig', 0.45);
          this.spawnBubble(
            slotIdx * m.slotW + m.slotW * 0.5,
            m.roomsTopY + 34,
            slot.markedForDig
              ? t('已标记开凿！小鬼正在赶来', 'Marked to mine! Imps inbound!')
              : t('取消挖掘标记', 'Mining mark cleared'),
            0xf2c655,
            {
              speakerId: `slot:${slotIdx}`,
              speakerName: locOverlord(this.engine.state.overlordId).name,
              priority: 'interactive',
              faction: 'overlord',
            },
          );
        }
      } else {
        this.callbacks.onSelectRoom(slotIdx);
      }
    });

    const releaseDragSafely = (): void => {
      if (!this.isDraggingUnit) {
        this.pointerDownPos = null;
        return;
      }
      const m = this.getViewportMetrics();
      const worldX = this.screenToWorldX(this.pointerX);
      const dropSlot = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(worldX / m.slotW)));
      this.engine.dropUnit(dropSlot);
      this.sfx.play('hand_drop', 0.55);
      this.isDraggingUnit = false;
      this.handCursor.setMode('hover');
      this.callbacks.onDragStateChange(false);
      this.pointerDownPos = null;
    };

    window.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this.isRightPanning) {
        const wasQuickTap = this.rightDraggedDist < 6;
        this.isRightPanning = false;
        this.app.canvas.style.cursor = 'none';
        if (wasQuickTap) {
          this.executeRightClickSlap();
        }
        return;
      }

      if (e.button !== 0) return;
      if (this.isDraggingUnit) {
        releaseDragSafely();
        return;
      }

      if (this.pointerDownPos) {
        if (this.pointerDownPos.unitId) {
          this.callbacks.onSelectUnit(this.pointerDownPos.unitId);
        }
        this.pointerDownPos = null;
      }
    });

    window.addEventListener('pointercancel', () => {
      this.isRightPanning = false;
      releaseDragSafely();
    });
    window.addEventListener('blur', () => {
      this.isRightPanning = false;
      releaseDragSafely();
    });
  }

  private executeRightClickSlap(): void {
    const m = this.getViewportMetrics();
    const worldX = this.screenToWorldX(this.pointerX);
    const slotIdx = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.floor(worldX / m.slotW)));
    const hitUnit = this.findAbyssalUnitAt(worldX, this.pointerY, m);

    this.handCursor.setVisible(true);
    this.handCursor.triggerSlapSwing();

    if (hitUnit) {
      const res = this.engine.slapUnit(hitUnit.id);
      if (res.ok) {
        this.sfx.play('slap_whack', 0.7);
        this.shakeTimer = 0.16;
        this.fxLayer.emitSlapBurst(hitUnit.x, m.floorY - 48, hitUnit.personality === 'masochist');
        this.spawnBubble(hitUnit.x, m.floorY - 108, res.quote, 0xf2c655, {
          speakerId: hitUnit.id,
          speakerName: locUnitName(hitUnit),
          priority: 'interactive',
          faction: 'ally',
        });
      }
    } else {
      const slot = this.engine.state.slots[slotIdx];
      if (slot?.type === 'corruption' && this.engine.state.prisoners.length > 0) {
        const res = this.engine.pressurizeTortureChamber(slotIdx);
        if (res.ok) {
          this.sfx.play('slap_whack', 0.55);
          this.shakeTimer = 0.14;
          this.emitTortureImplementParticles(res.implementId, slotIdx * m.slotW + m.slotW * 0.5, m.floorY);
        }
      } else if (slot?.type === 'hatchery' && this.engine.slapChicken(slotIdx)) {
        this.sfx.play('slap_whack', 0.5);
        this.sfx.play('chicken_gulp', 0.45);
        this.shakeTimer = 0.12;
        this.fxLayer.emitFeatherBurst(worldX, m.floorY - 26);
        this.spawnBubble(worldX, m.floorY - 76, t('咯咯哒——！！', 'Bawk-bawk!!'), 0xf2c655, {
          speakerId: `slot:${slotIdx}`,
          speakerName: t('烤鸡', 'Chicken'),
          priority: 'interactive',
          faction: 'ally',
        });
        for (const c of this.chickens) {
          if (c.slotIndex === slotIdx) {
            c.scatterTimer = 1.6;
            c.vx = (Math.random() > 0.5 ? 1 : -1) * 140;
          }
        }
      }
    }
  }

  private findAbyssalUnitAt(
    worldX: number,
    screenY: number,
    m: ReturnType<DungeonStage['getViewportMetrics']>,
  ) {
    let best = null;
    let bestDist = 52;
    for (const u of this.engine.state.units) {
      const d = Math.hypot(worldX - u.x, screenY - (m.floorY - 48));
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  private findGrabableThiefAt(
    worldX: number,
    screenY: number,
    m: ReturnType<DungeonStage['getViewportMetrics']>,
  ) {
    let best = null;
    let bestDist = 52;
    for (const h of this.engine.state.heroes) {
      if (!h.isThief || h.downedForCapture || h.hp <= 0) continue;
      const d = Math.hypot(worldX - h.x, screenY - (m.floorY - 48));
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  private findGrabableDownedHeroAt(
    worldX: number,
    screenY: number,
    m: ReturnType<DungeonStage['getViewportMetrics']>,
  ) {
    let best = null;
    let bestDist = 56;
    for (const h of this.engine.state.heroes) {
      if (!h.downedForCapture) continue;
      const d = Math.hypot(worldX - h.x, screenY - (m.floorY - 36));
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  private emitTortureImplementParticles(implementId: string, x: number, floorY: number): void {
    switch (implementId) {
      case 'electric_chair':
        this.fxLayer.emitElectricArc(x, floorY);
        break;
      case 'feather_tickler':
        this.fxLayer.emitTickleFeathers(x, floorY);
        break;
      case 'brainwash_gramophone':
        this.fxLayer.emitMusicNotes(x, floorY);
        break;
      case 'hell_dessert_table':
        this.fxLayer.emitDessertSparkles(x, floorY);
        break;
      case 'truth_spotlight':
        this.fxLayer.emitSpotlightBeam(x, floorY);
        break;
      default:
        this.fxLayer.emitAbyssalRitual(x, floorY - 30);
        break;
    }
  }

  private isDomElementVisible(el: HTMLElement | null): DOMRect | null {
    if (!el) return null;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) {
      return null;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 4 || r.height <= 4) return null;
    return r;
  }

  public refreshBubbleObstacles(): void {
    const canvasRect = this.app.canvas.getBoundingClientRect();
    const lowBarIds = [
      'abyss-tutorial-bar',
      'abyss-boss-bar',
      'abyss-toast-stack',
      'abyss-cutin-banner',
      'abyss-story-stage',
      'abyss-retreat-banner',
    ];
    const nextLow: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    for (const id of lowBarIds) {
      const r = this.isDomElementVisible(document.getElementById(id));
      if (!r) continue;
      nextLow.push({
        left: r.left - canvasRect.left,
        top: r.top - canvasRect.top,
        right: r.right - canvasRect.left,
        bottom: r.bottom - canvasRect.top,
      });
    }
    this.cachedLowBarRects = nextLow;

    const nextDrawers: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const drawers = document.querySelectorAll<HTMLElement>('.gothic-drawer');
    for (const d of drawers) {
      const r = this.isDomElementVisible(d);
      if (!r) continue;
      nextDrawers.push({
        left: r.left - canvasRect.left,
        top: r.top - canvasRect.top,
        right: r.right - canvasRect.left,
        bottom: r.bottom - canvasRect.top,
      });
    }
    this.cachedDrawerRects = nextDrawers;
    this.obstacleCacheAccum = 0;
  }

  private computeBubbleSafePose(
    rawScreenX: number,
    bw: number,
    bh: number,
    lane: 0 | 1,
    m: ReturnType<DungeonStage['getViewportMetrics']>,
  ): { screenX: number; baseY: number } {
    let screenX = Math.max(12 + bw / 2, Math.min(m.width - 12 - bw / 2, rawScreenX));

    // Tier-2 horizontal clamping away from open high gothic drawer
    for (const dr of this.cachedDrawerRects) {
      if (screenX + bw / 2 > dr.left - 6 && screenX - bw / 2 < dr.right + 6) {
        const spaceLeft = dr.left - 12;
        const spaceRight = m.width - dr.right - 12;
        if (spaceLeft >= bw + 12 && spaceLeft >= spaceRight) {
          screenX = Math.max(12 + bw / 2, dr.left - 12 - bw / 2);
        } else if (spaceRight >= bw + 12) {
          screenX = Math.min(m.width - 12 - bw / 2, dr.right + 12 + bw / 2);
        }
      }
    }

    // Dynamic sky ceiling above HUD bar
    const hudCeilY = this.skyCeilingY > 0 ? this.skyCeilingY : m.dungeonTopY - 40;
    let laneBottomY = hudCeilY - 8;

    // Tier-1 low-bar avoidance (#abyss-tutorial-bar / #abyss-boss-bar / #abyss-toast-stack / #abyss-cutin-banner / #abyss-story-stage)
    for (const el of this.cachedLowBarRects) {
      if (screenX + bw / 2 + 6 > el.left && screenX - bw / 2 - 6 < el.right && el.top < laneBottomY) {
        laneBottomY = Math.min(laneBottomY, el.top - 10);
      }
    }

    const laneStep = Math.max(30, bh + 8);
    const hardTopY = Math.max(48, m.height - 365);
    const baseY = Math.max(hardTopY + bh / 2, laneBottomY - 6 - bh / 2 - lane * laneStep);
    return { screenX, baseY };
  }

  public spawnBubble(
    worldX: number,
    _y: number,
    text: string,
    borderColor = 0xf2c655,
    opts?: BubbleOptions,
  ): void {
    if (this.minimized) return;
    const priority = opts?.priority ?? 'interactive';

    this.refreshBubbleObstacles();
    if (this.cachedDrawerRects.length > 0 && priority === 'banter') {
      return;
    }

    const m = this.getViewportMetrics();

    // Faction border color
    const resolvedBorder =
      opts?.faction === 'ally'
        ? 0xf2c655
        : opts?.faction === 'enemy'
          ? 0xf05674
          : opts?.faction === 'overlord'
            ? 0xb982ff
            : borderColor;

    // Prefix bold [ShortName] if speakerName provided and not already prefixed
    const shortName = opts?.speakerName ? opts.speakerName.slice(0, 12) : '';
    const alreadyPrefixed =
      shortName.length > 0 && (text.startsWith('[') || text.startsWith(`${shortName}：`) || text.startsWith(`${shortName}:`));
    const displayText = shortName && !alreadyPrefixed ? `[${shortName}] ${text}` : text;

    // Enforce concurrency cap = 3 (interactive preempts banter!)
    if (this.bubbles.length >= 3) {
      let evictIdx = -1;
      if (priority === 'interactive') {
        evictIdx = this.bubbles.findIndex((b) => b.priority === 'banter');
        if (evictIdx < 0) evictIdx = 0;
      } else {
        evictIdx = this.bubbles.findIndex((b) => b.priority === 'banter');
        if (evictIdx < 0) return; // Don't preempt interactive bubbles with idle banter
      }
      const old = this.bubbles.splice(evictIdx, 1)[0]!;
      this.bubblesLayer.removeChild(old.container);
      old.container.destroy({ children: true });
    }

    const c = new Container();
    const label = new Text({
      text: displayText,
      style: new TextStyle({
        fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0xfff0b3,
        wordWrap: true,
        wordWrapWidth: 250,
        breakWords: true,
        lineHeight: 17,
      }),
    });
    label.anchor.set(0.5, 0.5);

    const padX = 11;
    const padY = 6;
    const bw = Math.max(72, Math.ceil(label.width) + padX * 2);
    const bh = Math.max(28, Math.ceil(label.height) + padY * 2);

    const bg = new Graphics();
    bg.roundRect(-bw / 2, -bh / 2, bw, bh, 6)
      .fill({ color: 0x160a22, alpha: 0.95 })
      .stroke({ color: resolvedBorder, width: 2 });
    bg.poly([-5, bh / 2, 5, bh / 2, 0, bh / 2 + 6]).fill({ color: resolvedBorder });

    c.addChild(bg, label);

    const preliminaryPose = this.computeBubbleSafePose(worldX - this.cameraX, bw, bh, 0, m);
    const lane0Blocked = this.bubbles.some(
      (b) => b.lane === 0 && Math.abs(b.screenX - preliminaryPose.screenX) < (b.bw + bw) * 0.5 + 10,
    );
    const lane: 0 | 1 = lane0Blocked ? 1 : 0;
    const { screenX, baseY } =
      lane === 0 ? preliminaryPose : this.computeBubbleSafePose(worldX - this.cameraX, bw, bh, 1, m);

    c.x = Math.round(screenX);
    c.y = Math.round(baseY);
    this.bubblesLayer.addChild(c);

    const maxLife = priority === 'interactive' ? 3.2 : 2.9;
    this.bubbles.push({
      container: c,
      worldX,
      screenX,
      baseY,
      bw,
      bh,
      lane,
      life: maxLife,
      maxLife,
      speakerId: opts?.speakerId,
      borderColor: resolvedBorder,
      priority,
      text: displayText,
    });
  }

  private consumeVfxQueue(m: ReturnType<DungeonStage['getViewportMetrics']>): void {
    const queue = this.engine.drainVfxQueue();
    for (const ev of queue) {
      const y = m.floorY - 52;
      switch (ev.kind) {
        case 'slash': {
          const dir: 1 | -1 = (ev.targetX ?? ev.x) >= ev.x ? 1 : -1;
          this.fxLayer.emitSlashArc(ev.x, y, dir, ev.color ?? 0xfff0b3);
          break;
        }
        case 'projectile':
          this.fxLayer.emitProjectile(ev.x, ev.targetX ?? ev.x + 80, y - 6, ev.color ?? 0xb982ff);
          break;
        case 'damage':
          this.fxLayer.emitAggregatedDamage(
            ev.x,
            y - 24,
            ev.value ?? 0,
            ev.color ?? 0xfff0b3,
            Boolean(ev.isCrit),
          );
          if (ev.isCrit) {
            this.hitstopTimer = Math.max(this.hitstopTimer, 0.04);
          }
          break;
        case 'boulder_streak':
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.04);
          this.shakeTimer = Math.max(this.shakeTimer, 0.16);
          if (ev.label) {
            this.fxLayer.emitFloatingNumber(ev.x, y - 54, ev.label, ev.color ?? 0xf2c655, true);
          }
          break;
        case 'cutin':
          if (ev.subId && ev.label) {
            this.callbacks.onCutin?.({ subId: ev.subId, label: ev.label, color: ev.color });
          }
          break;
        case 'heal':
          this.fxLayer.emitFloatingNumber(
            ev.x,
            y - 24,
            ev.label ?? `+${ev.value ?? 0}`,
            ev.color ?? 0x5be08a,
            false,
          );
          break;
        case 'chicken_feast':
          this.fxLayer.emitChickenFeast(ev.x, m.floorY, ev.value ?? 0);
          break;
        case 'mine_spark':
          this.fxLayer.emitGoldBurst(ev.x, m.floorY - 38);
          break;
        case 'spell_fx':
          this.fxLayer.emitSpellEffect(ev.x, m.floorY - 30, ev.subId ?? 'abyss_lightning', ev.color);
          break;
        case 'level_up':
          this.fxLayer.emitAbyssalRitual(ev.x, m.floorY - 36);
          if (ev.label) this.fxLayer.emitFloatingNumber(ev.x, m.floorY - 88, ev.label, 0xf2c655, true);
          break;
        case 'relic_banner':
          this.sfx.play('fusion_ritual', 0.72);
          this.fxLayer.emitRelicFountain(ev.x, m.floorY - 40);
          if (ev.subId) this.callbacks.onRelicBanner(ev.subId as RelicId);
          break;
        case 'thief_alert':
          this.sfx.play('payday_bell', 0.65);
          this.shakeTimer = 0.25;
          if (ev.label) {
            this.spawnBubble(ev.x, m.floorY - 110, ev.label, 0xf05674, {
              speakerId: ev.speakerId,
              speakerName: ev.speakerName,
              priority: 'interactive',
              faction: 'enemy',
            });
          }
          this.callbacks.onThiefAlert(ev.value ?? 0);
          break;
        case 'torture_gag':
          this.emitTortureImplementParticles(ev.subId ?? this.engine.state.equippedImplement, ev.x, m.floorY);
          if (ev.label) {
            this.spawnBubble(ev.x, m.floorY - 114, ev.label, ev.color ?? 0xf05674, {
              speakerId: ev.speakerId,
              speakerName: ev.speakerName,
              priority: 'interactive',
              faction: 'enemy',
            });
          }
          break;
        case 'banter':
          if (ev.label) {
            const spId = ev.speakerId ?? 'anon';
            if (this.banterDirector.canSpeakIdle(this.engine.state, spId)) {
              this.banterDirector.markSpoken(spId);
              this.spawnBubble(ev.x, m.floorY - 108, ev.label, ev.color ?? 0xf2c655, {
                speakerId: ev.speakerId,
                speakerName: ev.speakerName,
                priority: 'banter',
                faction: ev.color === 0xf05674 ? 'enemy' : 'ally',
              });
            }
          }
          break;
        case 'quirk_reveal':
          this.sfx.play('fusion_ritual', 0.55);
          if (ev.label) {
            this.spawnBubble(ev.x, m.floorY - 114, ev.label, 0xf2c655, {
              speakerId: ev.speakerId,
              speakerName: ev.speakerName,
              priority: 'interactive',
              faction: 'ally',
            });
          }
          break;
        case 'cp':
          if (ev.subId && ev.speakerId && ev.speakerName) {
            this.banterDirector.enqueueCpRelay(
              this.engine.state,
              ev.subId,
              ev.speakerId,
              ev.speakerName,
              ev.x,
              ev.targetX ?? ev.x,
            );
          }
          break;
        case 'raid_alert':
        case 'valkyrie_warn':
          this.sfx.play('payday_bell', 0.55);
          this.shakeTimer = Math.max(this.shakeTimer, 0.2);
          if (ev.label) {
            this.spawnBubble(ev.x, m.floorY - 116, ev.label, ev.color ?? 0xf05674, {
              speakerId: ev.speakerId,
              speakerName: ev.speakerName,
              priority: 'interactive',
              faction: 'enemy',
            });
          }
          break;
        case 'excommunicate_banner':
        case 'perfect_finish':
        case 'obituary_banner':
        case 'weakness_found':
          this.sfx.play('fusion_ritual', 0.7);
          if (ev.label) {
            this.callbacks.onCutin?.({
              subId: ev.subId ?? ev.kind,
              label: ev.label,
              color: ev.color ?? 0xf2c655,
            });
          }
          break;
      }
    }
  }

  private consumeCoreEvents(m: ReturnType<DungeonStage['getViewportMetrics']>): void {
    const events = this.engine.state.recentEvents;
    for (const ev of events) {
      if (ev.tick <= this.lastProcessedEventTick) continue;
      this.handleCoreEvent(ev, m);
    }
    if (events.length > 0) {
      this.lastProcessedEventTick = events[events.length - 1]!.tick;
    }
  }

  private handleCoreEvent(ev: DungeonEvent, m: ReturnType<DungeonStage['getViewportMetrics']>): void {
    const wx = ev.slotIndex !== undefined ? (ev.slotIndex + 0.5) * m.slotW : THRONE_SLOT_INDEX * m.slotW;
    const sy = m.floorY - 40;

    switch (ev.type) {
      case 'rock_mined':
        this.sfx.play('pickaxe_dig', 0.6);
        this.sfx.play('gold_chime', 0.5);
        this.fxLayer.emitRockDebris(wx, sy);
        this.fxLayer.emitGoldBurst(wx, sy - 10);
        this.spawnBubble(wx, sy - 48, t(`挖通矿脉！+${ev.value ?? 0}G`, `Vein excavated! +${ev.value ?? 0}G`), 0xf2c655, {
          speakerId: ev.unitId ?? (ev.slotIndex !== undefined ? `slot:${ev.slotIndex}` : undefined),
          speakerName: t('苦工小鬼', 'Imp'),
          priority: 'interactive',
          faction: 'ally',
        });
        break;
      case 'gold_delivered':
        this.sfx.play('gold_chime', 0.35, 350);
        this.fxLayer.emitGoldBurst(wx, sy);
        break;
      case 'chicken_eaten':
        this.sfx.play('chicken_gulp', 0.5);
        break;
      case 'boulder_launched':
        this.sfx.play('boulder_crush', 0.75);
        this.shakeTimer = 0.32;
        this.spawnBubble(wx, sy - 54, t('牛蛙滚石轰隆碾压！', 'Rolling Boulder unleashed!'), 0xf05674, {
          speakerId: ev.slotIndex !== undefined ? `slot:${ev.slotIndex}` : undefined,
          speakerName: t('机关走廊', 'Trap Lane'),
          priority: 'interactive',
          faction: 'enemy',
        });
        break;
      case 'trap_triggered':
        this.sfx.play('trap_snap', 0.45, 220);
        this.fxLayer.burst(wx, sy, 8, { colors: [0x59a3e8, 0xf05674, 0xd6cede] });
        break;
      case 'corruption_complete':
      case 'fusion_complete':
        this.sfx.play(ev.type === 'fusion_complete' ? 'fusion_ritual' : 'corruption_complete', 0.7);
        this.fxLayer.emitAbyssalRitual(wx, sy);
        if (ev.text) this.callbacks.onToast(ev.text);
        break;
      case 'payday_bell':
      case 'thief_heist':
      case 'thief_caught':
      case 'overlord_upgraded':
        this.sfx.play('payday_bell', 0.5);
        if (ev.text) this.callbacks.onToast(ev.text);
        break;
      case 'spell_cast':
        this.sfx.play('spell_cast', 0.6);
        this.shakeTimer = 0.18;
        break;
      case 'heart_shattered':
        this.sfx.play('boulder_crush', 0.7);
        this.shakeTimer = 0.4;
        if (ev.text) this.callbacks.onToast(ev.text);
        this.callbacks.onHeartShattered?.(ev.value ?? this.engine.state.wave);
        break;
      case 'feature_unlocked':
        this.sfx.play('fusion_ritual', 0.68);
        if (ev.slotIndex !== undefined) {
          const breakX = (ev.slotIndex + 0.5) * m.slotW;
          this.fxLayer.emitRockDebris(breakX, sy);
          this.fxLayer.emitGoldBurst(breakX, sy - 12);
          this.shakeTimer = 0.22;
        }
        this.callbacks.onFeatureUnlocked?.(ev.features ?? [], ev.text);
        break;
      case 'story_trigger':
        if (ev.storyId) {
          this.callbacks.onStoryTrigger?.(ev.storyId, ev.heroSpecies);
        }
        break;
    }
  }

  private renderSurfaceAndMinimap(m: ReturnType<DungeonStage['getViewportMetrics']>, timeSec: number): void {
    const g = this.surfaceGfx;
    g.clear();
    const y0 = m.dungeonTopY;

    // Deep corrupted soil rim spanning viewport
    g.rect(0, y0, m.width, TURF_HEIGHT).fill({ color: 0x1c0e28 });
    g.rect(0, y0 + TURF_HEIGHT - 2, m.width, 2).fill({ color: 0xcf932e, alpha: 0.8 });

    // Interactive 28-Slot Minimap Strip embedded sleekly inside the top turf bar!
    const mg = this.minimapGfx;
    mg.clear();
    const mapX = 16;
    const mapY = y0 + 5;
    const mapW = Math.max(200, m.width - 32);
    const mapH = 14;

    mg.roundRect(mapX - 2, mapY - 1, mapW + 4, mapH + 2, 3)
      .fill({ color: 0x0d0614, alpha: 0.92 })
      .stroke({ color: 0x5c3a7a, width: 1 });

    const resSummary = evaluateDungeonResonances(this.engine.state.slots);
    const tMax = this.getEffectiveTerritoryMax();
    const segW = mapW / TOTAL_SLOTS;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const sl = this.engine.state.slots[i]!;
      const sealed = i > tMax;
      const col = sealed
        ? 0x181320
        : sl.type === 'throne'
          ? 0xf05674
          : sl.type === 'treasury'
            ? 0xf2c655
            : sl.type === 'corruption'
              ? 0xd966ff
              : sl.type === 'rock_vein'
                ? sl.oreTier === 'blood_diamond'
                  ? 0x702242
                  : sl.oreTier === 'mithril'
                    ? 0x2c4b6e
                    : 0x2b2038
                : 0x3b2452;
      mg.rect(mapX + i * segW + 1, mapY + 2, Math.max(2, segW - 2), mapH - 4).fill({ color: col });
      if (!sealed && resSummary.highlightedSlots.has(i)) {
        // Golden top resonance pip on minimap!
        mg.rect(mapX + i * segW + 2, mapY + 1, Math.max(2, segW - 4), 2).fill({ color: 0xf2c655, alpha: 0.95 });
      }
      if (!sealed && sl.hasRelicChest) {
        mg.circle(mapX + (i + 0.5) * segW, mapY + mapH * 0.5, 3).fill({ color: 0xf2c655 });
      }
    }

    // Dynamic Radar Blips on Minimap: Fleeing Thief (red/gold flash), Downed Captive ★ (pink-violet pulse), Boss (gold)!
    for (const h of this.engine.state.heroes) {
      if (h.hp <= 0 && !h.downedForCapture) continue;
      const hx = mapX + (h.x / DUNGEON_WIDTH) * mapW;
      if (h.downedForCapture) {
        const r = 3.5 + 1.2 * Math.sin(timeSec * 6);
        mg.circle(hx, mapY + mapH * 0.5, r).fill({ color: 0xff8ec8 });
        mg.circle(hx, mapY + mapH * 0.5, r + 1.5).stroke({ color: 0xd966ff, width: 1.2, alpha: 0.85 });
        continue;
      }
      const col = h.fleeingWithLoot
        ? Math.floor(timeSec * 8) % 2 === 0
          ? 0xf2c655
          : 0xf05674
        : h.isBoss
          ? 0xfff0b3
          : 0x59b8ff;
      mg.circle(hx, mapY + mapH * 0.5, h.isBoss || h.fleeingWithLoot ? 4.2 : 2.5).fill({ color: col });
    }

    // Viewport camera window highlight box on minimap
    const vx = mapX + (this.cameraX / DUNGEON_WIDTH) * mapW;
    const vw = Math.min(mapW, (m.width / DUNGEON_WIDTH) * mapW);
    mg.roundRect(vx, mapY, vw, mapH, 2).stroke({ color: 0xf2c655, width: 2 });
  }

  private renderRooms(m: ReturnType<DungeonStage['getViewportMetrics']>, timeSec: number): void {
    this.torchGlowGfx.clear();
    this.roomHighlightGfx.clear();
    this.trapChargeGfx.clear();
    this.treasuryGoldSprite.visible = false;
    this.torturePropSprite.visible = false;
    this.prisonerChibiSprite.visible = false;

    const slots = this.engine.state.slots;
    const tMax = this.getEffectiveTerritoryMax();
    this.syncFogWall(m, tMax);
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const slot: RoomSlot = slots[i]!;
      const sp = this.roomSprites[i]!;
      const label = this.roomLabels[i]!;
      const isSealed = i > tMax;

      const rx = i * m.slotW;
      sp.texture = this.assets.rooms[slot.type];
      sp.x = rx;
      sp.y = m.roomsTopY;
      sp.width = m.slotW;
      sp.height = ROOM_PIXEL_HEIGHT;
      // Subtle tint for Mithril & Blood-Diamond deep ore veins (or dark seal tint)
      sp.tint = isSealed
        ? 0x46325a
        : slot.type === 'rock_vein'
          ? slot.oreTier === 'blood_diamond'
            ? 0xff9ec2
            : slot.oreTier === 'mithril'
              ? 0xa8d8ff
              : 0xffffff
          : 0xffffff;

      const def = locRoom(slot.type);
      let nextLabelText = '';
      let nextLabelFill = 0xf2c655;
      if (isSealed) {
        nextLabelText = '';
        nextLabelFill = 0x9b90a6;
      } else if (slot.type === 'rock_vein') {
        const tierLbl =
          slot.oreTier === 'blood_diamond'
            ? t('血钻矿', 'Blood-Gem')
            : slot.oreTier === 'mithril'
              ? t('秘银矿', 'Mithril')
              : t('暗金矿', 'Dark-Gold');
        const chestTag = slot.hasRelicChest ? t(' ★遗迹箱', ' ★Chest') : '';
        nextLabelText = slot.markedForDig
          ? t(
              `开凿中 ${Math.ceil((1 - slot.rockHp / Math.max(1, slot.rockMaxHp)) * 100)}%`,
              `Digging ${Math.ceil((1 - slot.rockHp / Math.max(1, slot.rockMaxHp)) * 100)}%`,
            )
          : slot.isInfiniteFrontier
            ? t(`无限${tierLbl}脉`, `Endless ${tierLbl}`)
            : t(`${tierLbl}${chestTag} · 点击挖`, `${tierLbl}${chestTag} · Dig`);
        nextLabelFill = slot.hasRelicChest ? 0xf2c655 : slot.markedForDig ? 0xf2c655 : 0xb5a6c7;
      } else if (slot.type === 'throne') {
        nextLabelText = t(
          `王座 · 魔王Lv.${this.engine.state.overlordLevel}`,
          `Throne · Lv.${this.engine.state.overlordLevel}`,
        );
        nextLabelFill = 0xf05674;
      } else {
        const zoneTag = i < THRONE_SLOT_INDEX ? t('后院·', 'Back·') : '';
        nextLabelText = `${zoneTag}${def.shortName} Lv.${slot.level}`;
        nextLabelFill = i < THRONE_SLOT_INDEX ? 0xffd27d : 0xf2c655;
      }
      if (this.lastRoomLabelText[i] !== nextLabelText) {
        this.lastRoomLabelText[i] = nextLabelText;
        label.text = nextLabelText;
      }
      if (this.lastRoomLabelFill[i] !== nextLabelFill) {
        this.lastRoomLabelFill[i] = nextLabelFill;
        label.style.fill = nextLabelFill;
      }
      label.x = Math.round(rx + m.slotW * 0.5);
      label.y = Math.round(m.roomsTopY + 4);

      // Flickering candlelight glow
      if (slot.type !== 'rock_vein') {
        const flick = 0.8 + 0.25 * Math.sin(timeSec * 8.5 + i * 1.9);
        const glowColor =
          slot.type === 'library' || slot.type === 'corruption' || slot.type === 'altar'
            ? 0xa464cc
            : 0xf2c655;
        const cx = rx + m.slotW * 0.5;
        const cy = m.roomsTopY + 72;
        this.torchGlowGfx.circle(cx, cy, 56).fill({ color: glowColor, alpha: 0.045 * flick });
        this.torchGlowGfx.circle(cx, cy, 28).fill({ color: glowColor, alpha: 0.06 * flick });
      } else if (slot.markedForDig) {
        const pulse = 0.55 + 0.35 * Math.sin(timeSec * 6);
        this.roomHighlightGfx
          .rect(rx + 4, m.roomsTopY + 4, m.slotW - 8, ROOM_PIXEL_HEIGHT - 8)
          .stroke({ color: 0xf2c655, width: 2, alpha: pulse });
      }

      // Dynamic 4-tier Treasury gold pile + V2.5 Dragon-Hoard gold dust sparkles when bullion >= 80%!
      if (slot.type === 'treasury' && (this.engine.state.gold > 20 || (this.engine.state.bullion ?? 0) > 20)) {
        const ratio = Math.max(
          this.engine.state.gold / Math.max(1, this.engine.state.goldCap),
          (this.engine.state.bullion ?? 0) / Math.max(1, this.engine.state.bullionCap || 1),
        );
        const tierIdx = ratio > 0.72 ? 3 : ratio > 0.42 ? 2 : ratio > 0.16 ? 1 : 0;
        this.treasuryGoldSprite.texture = this.assets.treasuryGold[tierIdx]!;
        this.treasuryGoldSprite.x = rx;
        this.treasuryGoldSprite.y = m.roomsTopY;
        this.treasuryGoldSprite.width = m.slotW;
        this.treasuryGoldSprite.height = ROOM_PIXEL_HEIGHT;
        this.treasuryGoldSprite.visible = true;
        if (
          this.engine.state.bullionCap > 0 &&
          (this.engine.state.bullion ?? 0) >= this.engine.state.bullionCap * 0.8 &&
          Math.floor(timeSec * 3) !== Math.floor((timeSec - 0.016) * 3)
        ) {
          const dustX = rx + m.slotW * (0.4 + ((timeSec * 1.7) % 1.1));
          this.fxLayer.burst(dustX, m.floorY - 22, 3, {
            colors: [0xf2c655, 0xffd27d],
            speedMin: 18,
            speedMax: 45,
            upBias: 35,
            gravity: 110,
            size: 3,
            life: 0.55,
            shape: 'star',
          });
        }
      }

      // Live Torture Chamber Equippable Gag Prop & Prisoner (strictly chair-bound, zero ghost bug!)
      if (slot.type === 'corruption') {
        const implId = this.engine.state.equippedImplement;
        const propTex = this.assets.props[implId];
        if (propTex) {
          this.torturePropSprite.texture = propTex;
          this.torturePropSprite.scale.set(92 / 256);
          this.torturePropSprite.x = Math.round(rx + m.slotW * 0.5);
          this.torturePropSprite.y = Math.round(m.floorY);
          this.torturePropSprite.visible = true;
        }
        const p0 = this.engine.state.prisoners.find((x) => x.cell === 'chamber' && !x.escortedByHeroId);
        if (p0) {
          const pTex = this.assets.chibis[p0.sourceHero];
          if (pTex) {
            this.prisonerChibiSprite.texture = pTex;
            const shake = implId === 'electric_chair' ? Math.sin(timeSec * 45) * 3 : Math.sin(timeSec * 14) * 1.5;
            this.prisonerChibiSprite.scale.set(82 / 256);
            this.prisonerChibiSprite.x = Math.round(rx + m.slotW * 0.5 + shake);
            this.prisonerChibiSprite.y = Math.round(m.floorY - 6);
            this.prisonerChibiSprite.tint =
              implId === 'electric_chair' && Math.floor(timeSec * 12) % 2 === 0 ? 0xaeeeff : 0xffcce0;
            this.prisonerChibiSprite.visible = true;
          }
          // Periodic live VFX for all 5 Torture Implements while occupied!
          this.electricTickAccum += 0.016;
          const period = implId === 'electric_chair' ? 1.1 : 1.45;
          if (this.electricTickAccum >= period) {
            this.electricTickAccum = 0;
            this.emitTortureImplementParticles(implId, rx + m.slotW * 0.5, m.floorY);
          }
        }
      }

      // Corridor trap visual & charge pips
      let trapSp = this.trapSprites.get(i);
      if (slot.trap) {
        if (!trapSp) {
          trapSp = new Sprite(this.assets.traps[slot.trap.type]);
          trapSp.anchor.set(0.5, 0.96);
          trapSp.scale.set(2);
          trapSp.roundPixels = true;
          this.propsLayer.addChild(trapSp);
          this.trapSprites.set(i, trapSp);
        }
        trapSp.texture = this.assets.traps[slot.trap.type];
        trapSp.x = Math.round(rx + m.slotW * 0.5);
        trapSp.y = Math.round(m.floorY + 2);
        trapSp.alpha = slot.trap.charges > 0 ? 1 : 0.42;
        trapSp.visible = true;

        const maxC = Math.min(8, slot.trap.maxCharges);
        const startPx = rx + m.slotW * 0.5 - (maxC * 7) / 2;
        for (let c = 0; c < maxC; c++) {
          this.trapChargeGfx
            .rect(startPx + c * 7, m.floorY + 5, 5, 4)
            .fill({ color: c < slot.trap.charges ? 0xf2c655 : 0x331c47 });
        }
      } else if (trapSp) {
        trapSp.visible = false;
      }

      if (i === this.hoveredSlot) {
        const col = this.isDraggingUnit ? 0xf05674 : 0xcf932e;
        this.roomHighlightGfx
          .rect(rx + 2, m.roomsTopY + 2, m.slotW - 4, ROOM_PIXEL_HEIGHT - 4)
          .stroke({ color: col, width: this.isDraggingUnit ? 3 : 2, alpha: 0.85 });
      }
    }

    // V2.1 Architectural Resonance & Trap-Synergy Arch Bridges (PixiJS v8: ALWAYS moveTo before arc!)
    const resSummary = evaluateDungeonResonances(slots);
    const pulseAlpha = 0.62 + 0.28 * Math.sin(timeSec * 3.8);
    const drawArchBridge = (slotA: number, slotB: number, color: number): void => {
      const cx = ((slotA + slotB + 1) * 0.5) * m.slotW;
      const cy = m.roomsTopY + 24;
      const r = 34;
      const startA = Math.PI * 1.08;
      const endA = Math.PI * 1.92;
      this.roomHighlightGfx
        .moveTo(cx + Math.cos(startA) * r, cy + Math.sin(startA) * r)
        .arc(cx, cy, r, startA, endA)
        .stroke({ color, width: 3, alpha: pulseAlpha });
      this.roomHighlightGfx
        .circle(cx, cy - r, 4.5)
        .fill({ color: 0xfff0b3, alpha: pulseAlpha })
        .stroke({ color, width: 2, alpha: pulseAlpha });
    };
    for (const link of resSummary.resonanceLinks) {
      drawArchBridge(link.slotA, link.slotB, ROOM_RESONANCE_DEFS[link.id].accentColor);
    }
    for (const link of resSummary.trapSynergyLinks) {
      drawArchBridge(link.slotA, link.slotB, TRAP_SYNERGY_DEFS[link.id].accentColor);
    }

    // Overlord sitting at Slot 6 Throne + Pulsing Crimson Heart!
    const throneCenterX = THRONE_SLOT_INDEX * m.slotW + m.slotW * 0.5;
    const oDef = OVERLORD_DEFS[this.engine.state.overlordId];
    const oTex =
      this.assets.chibis[oDef.chibiKey] ??
      this.assets.unitsSheet.textures[`${this.engine.state.overlordId}_overlord_idle_0`];
    if (oTex) {
      this.overlordSprite.texture = oTex;
      const isChibi = Boolean(this.assets.chibis[oDef.chibiKey]);
      const sc = isChibi ? 124 / 228 : 2;
      const breath = 1 + Math.sin(timeSec * 2.8) * 0.025;
      this.overlordSprite.scale.set(sc, sc * breath);
    }
    this.overlordSprite.x = Math.round(throneCenterX);
    this.overlordSprite.y = Math.round(m.floorY);

    const heartRatio = this.engine.state.overlordHp / Math.max(1, this.engine.state.overlordMaxHp);
    const beat = 1 + 0.12 * Math.sin(timeSec * 4.5);
    this.overlordHeartGfx.clear();
    this.overlordHeartGfx
      .circle(throneCenterX, m.floorY - 64, 24 * beat)
      .fill({ color: 0xc42b4f, alpha: 0.24 * heartRatio });

    const hbw = Math.round(m.slotW * 0.72);
    const hbx = Math.round(throneCenterX - hbw * 0.5);
    const hby = Math.round(m.roomsTopY + 22);
    this.overlordHeartGfx.rect(hbx - 1, hby - 1, hbw + 2, 7).fill({ color: 0x140a1c });
    this.overlordHeartGfx.rect(hbx, hby, hbw, 5).fill({ color: 0x2a0b16 });
    this.overlordHeartGfx.rect(hbx, hby, Math.round(hbw * heartRatio), 5).fill({ color: 0xf05674 });

    // V2.4 Abyssal Prison: up to 4 jailed prisoner chibis + thin foreground iron bars + lock bar + fishing badge
    this.renderPrisonAndSilhouettes(m, timeSec);
  }

  public getVisibleSilhouetteSpecies(): HeroSpeciesId[] {
    return [...this.visibleSilhouetteSpecies];
  }

  public playDestroyWorldCollapse(): void {
    this.shakeTimer = 1.6;
    const m = this.getViewportMetrics();
    const lines = [
      t('噗叽~ 终于不用被追着擦地板啦~', 'Squish~ No more mop chases~'),
      t('第 48 滩……没机会数完了。', 'Puddle #48… never got to count it.'),
      t('老板下辈子记得发加班费呀！', 'Pay overtime in the next life, Boss!'),
    ];
    this.engine.state.units.slice(0, 3).forEach((u, idx) => {
      this.spawnBubble(u.x, m.floorY - 105, lines[idx % lines.length]!, 0xf05674, {
        speakerId: u.id,
        speakerName: locUnitName(u),
        priority: 'interactive',
        faction: 'ally',
      });
    });
  }

  private renderPrisonAndSilhouettes(
    m: ReturnType<DungeonStage['getViewportMetrics']>,
    timeSec: number,
  ): void {
    const state = this.engine.state;
    const prisonSlot = state.slots.find((s) => s.type === 'prison');
    this.prisonBarsGfx.clear();

    if (prisonSlot) {
      const rx = prisonSlot.index * m.slotW;
      const jailed = state.prisoners.filter((p) => p.cell === 'prison' && !p.escortedByHeroId).slice(0, 4);
      const offsets = [-46, -16, 16, 46];
      for (let i = 0; i < 4; i++) {
        const sp = this.prisonChibiSprites[i]!;
        const p = jailed[i];
        if (!p) {
          sp.visible = false;
          continue;
        }
        const hDef = HERO_DEFS[p.sourceHero];
        const tex =
          this.assets.chibis[hDef.chibiKey] ??
          this.assets.unitsSheet.textures[`${p.sourceHero}_idle_0`];
        if (tex) {
          sp.texture = tex;
          const isChibi = Boolean(this.assets.chibis[hDef.chibiKey]);
          const sc = isChibi ? 64 / 228 : 1.45;
          const breath = 1 + Math.sin(timeSec * 3.1 + i * 1.3) * 0.03;
          sp.scale.set(sc, sc * breath);
        }
        sp.x = Math.round(rx + m.slotW * 0.5 + offsets[i]!);
        sp.y = Math.round(m.floorY - 2);
        sp.visible = true;
      }

      // Thin semi-transparent foreground iron bars in front of jailed chibis (@player-v24b tip!)
      for (let bx = rx + 24; bx <= rx + m.slotW - 24; bx += 22) {
        this.prisonBarsGfx
          .rect(bx, m.roomsTopY + 34, 2, ROOM_PIXEL_HEIGHT - 44)
          .fill({ color: 0x261a33, alpha: 0.78 });
      }

      // Lock Integrity Bar (highlighted when damaged or hovered)
      const lock = state.prisonLock;
      if (lock && (lock.hp < lock.max || this.hoveredSlot === prisonSlot.index || jailed.length > 0)) {
        const ratio = Math.max(0, Math.min(1, lock.hp / Math.max(1, lock.max)));
        const lw = 84;
        const lx = Math.round(rx + (m.slotW - lw) * 0.5);
        const ly = Math.round(m.roomsTopY + 22);
        this.prisonBarsGfx.rect(lx - 1, ly - 1, lw + 2, 6).fill({ color: 0x120919 });
        this.prisonBarsGfx.rect(lx, ly, lw, 4).fill({ color: 0x2a142e });
        this.prisonBarsGfx
          .rect(lx, ly, Math.round(lw * ratio), 4)
          .fill({ color: ratio > 0.4 ? 0xf2c655 : 0xf05674 });
      }

      // Frontline Fishing Bait badge when prison is right of Throne
      if (prisonSlot.index > THRONE_SLOT_INDEX && jailed.length > 0) {
        this.prisonBarsGfx
          .circle(rx + m.slotW - 18, m.roomsTopY + 24, 5)
          .fill({ color: 0xf05674, alpha: 0.7 + 0.3 * Math.sin(timeSec * 5) });
      }
    } else {
      for (const sp of this.prisonChibiSprites) sp.visible = false;
    }

    // Throne Magic Candle (redrawn ONLY when integer countdown second changes!)
    const liveHeroes = state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);
    const intSec = liveHeroes.length === 0 ? Math.max(0, Math.ceil(state.waveTimer)) : -1;
    if (intSec !== this.lastCandleIntSec) {
      this.lastCandleIntSec = intSec;
      this.throneCandleGfx.clear();
      if (intSec > 0) {
        const cx = THRONE_SLOT_INDEX * m.slotW + m.slotW - 22;
        const cy = m.floorY - 12;
        const waxH = Math.max(8, Math.round(28 * Math.min(1, intSec / 45)));
        this.throneCandleGfx
          .rect(cx - 4, cy - waxH, 8, waxH)
          .fill({ color: 0xe8d9c5 })
          .stroke({ color: 0x3b234d, width: 1 });
        const flameCol = intSec <= 10 ? 0xc066ff : 0xffb347;
        this.throneCandleGfx.circle(cx, cy - waxH - 5, 4.5).fill({ color: flameCol, alpha: 0.92 });
        this.throneCandleGfx.circle(cx, cy - waxH - 5, 9).fill({ color: flameCol, alpha: 0.25 });
      }
    }

    // Last 15s Horizon Hero Silhouettes (rebuilt ONLY on waveSpawnSeq or locale change!)
    const showSilhouettes = liveHeroes.length === 0 && state.waveTimer > 0 && state.waveTimer <= 15 && state.heartReviveTimer <= 0;
    if (!showSilhouettes) {
      this.silhouetteLayer.visible = false;
      this.visibleSilhouetteSpecies = [];
      return;
    }

    this.silhouetteLayer.visible = true;
    const loc = getLocale();
    if (this.lastSilhouetteSeq !== state.waveSpawnSeq || this.lastSilhouetteLocale !== loc) {
      this.lastSilhouetteSeq = state.waveSpawnSeq;
      this.lastSilhouetteLocale = loc;
      const preview = this.engine.previewNextWave();
      const list = preview.allSpecies.slice(0, 8);
      this.visibleSilhouetteSpecies = list;

      let rightMostSlot = THRONE_SLOT_INDEX + 4;
      for (let i = TOTAL_SLOTS - 1; i > THRONE_SLOT_INDEX; i--) {
        if (state.slots[i]?.type !== 'rock_vein') {
          rightMostSlot = i;
          break;
        }
      }
      const baseX = rightMostSlot * m.slotW + m.slotW - 22;

      for (let i = 0; i < 8; i++) {
        const sp = this.silhouetteSprites[i]!;
        const tag = this.silhouetteTags[i]!;
        const species = list[i];
        if (!species) {
          sp.visible = false;
          tag.visible = false;
          continue;
        }
        const def = HERO_DEFS[species];
        const tex =
          this.assets.chibis[def.chibiKey] ??
          this.assets.unitsSheet.textures[`${species}_idle_0`];
        if (tex) {
          sp.texture = tex;
          const isChibi = Boolean(this.assets.chibis[def.chibiKey]);
          const sc = isChibi ? 62 / 228 : 1.4;
          sp.scale.set(-sc, sc);
        }
        const sx = Math.round(baseX - i * 24);
        sp.x = sx;
        sp.y = Math.round(m.floorY - 2);
        sp.visible = true;

        tag.text = `[${locHeroDef(species).roleTag}]`;
        tag.x = sx;
        tag.y = Math.round(m.floorY - 64);
        tag.visible = true;
      }
    }
  }

  /** Static Abyssal Seal Fog Wall for slots > territoryMax (ONLY redrawn on territoryMax / resize / locale change!) */
  private syncFogWall(m: ReturnType<DungeonStage['getViewportMetrics']>, tMax: number): void {
    const loc = getLocale();
    if (
      tMax === this.lastFogTerritoryMax &&
      m.roomsTopY === this.lastFogRoomsTopY &&
      loc === this.lastFogLocale
    ) {
      return;
    }
    this.lastFogTerritoryMax = tMax;
    this.lastFogRoomsTopY = m.roomsTopY;
    this.lastFogLocale = loc;

    this.fogWallGfx.clear();
    for (const lbl of this.fogWallLabels) {
      this.fogWallLayer.removeChild(lbl);
      lbl.destroy();
    }
    this.fogWallLabels = [];

    if (tMax >= TOTAL_SLOTS - 1) return;

    for (let i = tMax + 1; i < TOTAL_SLOTS; i++) {
      const rx = i * m.slotW;
      const reqW = requiredWaveForSlot(i);
      this.fogWallGfx
        .rect(rx, m.roomsTopY, m.slotW, ROOM_PIXEL_HEIGHT)
        .fill({ color: 0x0c0514, alpha: 0.78 });
      if (i === tMax + 1) {
        // Glowing violet seal boundary barrier
        this.fogWallGfx
          .rect(rx, m.roomsTopY + 2, 4, ROOM_PIXEL_HEIGHT - 4)
          .fill({ color: 0xb982ff, alpha: 0.85 });
      }
      this.fogWallGfx
        .rect(rx + 6, m.roomsTopY + 6, m.slotW - 12, ROOM_PIXEL_HEIGHT - 12)
        .stroke({ color: 0x724096, width: 1.5, alpha: 0.65 });

      const sealText = new Text({
        text: t(`深渊封印\n通关 W${reqW} 破壁`, `ABYSSAL SEAL\nClear W${reqW}`),
        style: new TextStyle({
          fontFamily: 'Microsoft YaHei, WenQuanYi Micro Hei, Segoe UI, sans-serif',
          fontSize: 12,
          fontWeight: 'bold',
          fill: 0xd9b8ff,
          align: 'center',
          stroke: { color: 0x120919, width: 3 },
        }),
      });
      sealText.anchor.set(0.5, 0.5);
      sealText.x = Math.round(rx + m.slotW * 0.5);
      sealText.y = Math.round(m.roomsTopY + ROOM_PIXEL_HEIGHT * 0.5);
      this.fogWallLayer.addChild(sealText);
      this.fogWallLabels.push(sealText);
    }
  }

  private syncChickens(m: ReturnType<DungeonStage['getViewportMetrics']>, dt: number): void {
    const hatcheries = this.engine.state.slots.filter((s) => s.type === 'hatchery');
    let desiredTotal = 0;
    const desiredPerSlot = new Map<number, number>();
    for (const h of hatcheries) {
      const cnt = Math.min(6, h.chickens);
      desiredPerSlot.set(h.index, cnt);
      desiredTotal += cnt;
    }

    const chickenScale = this.assets.chickenIsHighRes ? 46 / 256 : 2;
    if (this.chickens.length !== desiredTotal) {
      for (const c of this.chickens) {
        this.propsLayer.removeChild(c.sprite);
        c.sprite.destroy();
      }
      this.chickens = [];
      for (const [slotIdx, cnt] of desiredPerSlot.entries()) {
        for (let k = 0; k < cnt; k++) {
          const sp = new Sprite(this.assets.chicken);
          sp.anchor.set(0.5, 0.96);
          sp.scale.set(chickenScale);
          sp.roundPixels = !this.assets.chickenIsHighRes;
          this.propsLayer.addChild(sp);
          this.chickens.push({
            sprite: sp,
            slotIndex: slotIdx,
            localX: 24 + Math.random() * (m.slotW - 48),
            vx: (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 16),
            scatterTimer: 0,
            hopPhase: Math.random() * 6,
          });
        }
      }
    }

    for (const c of this.chickens) {
      c.hopPhase += dt * (c.scatterTimer > 0 ? 18 : 7);
      if (c.scatterTimer > 0) {
        c.scatterTimer = Math.max(0, c.scatterTimer - dt);
        if (c.scatterTimer === 0) c.vx = Math.sign(c.vx || 1) * 22;
      }
      c.localX += c.vx * dt;
      if (c.localX < 18) {
        c.localX = 18;
        c.vx = Math.abs(c.vx);
      } else if (c.localX > m.slotW - 18) {
        c.localX = m.slotW - 18;
        c.vx = -Math.abs(c.vx);
      }
      const hopY = Math.abs(Math.sin(c.hopPhase)) * (c.scatterTimer > 0 ? 16 : 4);
      c.sprite.x = Math.round(c.slotIndex * m.slotW + c.localX);
      c.sprite.y = Math.round(m.floorY - hopY);
      c.sprite.scale.set((c.vx >= 0 ? 1 : -1) * chickenScale, chickenScale);
    }
  }

  private syncEntities(m: ReturnType<DungeonStage['getViewportMetrics']>, dt: number): void {
    const pointerWorldX = this.screenToWorldX(this.pointerX);

    const aliveAbyssalIds = new Set<string>();
    for (const u of this.engine.state.units) {
      aliveAbyssalIds.add(u.id);
      let us = this.abyssalSprites.get(u.id);
      if (!us) {
        us = new UnitSprite(this.assets, u.species, false);
        this.unitsLayer.addChild(us.container);
        this.abyssalSprites.set(u.id, us);
      }
      const isHeld = this.engine.state.hand.heldUnitId === u.id;
      us.container.zIndex = isHeld ? 95 : 40;
      us.syncAbyssal(u, m.floorY, dt, isHeld, pointerWorldX, this.pointerY);
    }
    for (const [id, us] of this.abyssalSprites.entries()) {
      if (!aliveAbyssalIds.has(id)) {
        this.unitsLayer.removeChild(us.container);
        us.container.destroy({ children: true });
        this.abyssalSprites.delete(id);
      }
    }

    const aliveHeroIds = new Set<string>();
    for (const h of this.engine.state.heroes) {
      aliveHeroIds.add(h.id);
      let hs = this.heroSprites.get(h.id);
      if (!hs) {
        hs = new UnitSprite(this.assets, h.species, true);
        this.unitsLayer.addChild(hs.container);
        this.heroSprites.set(h.id, hs);
      }
      const isHeld = this.engine.state.hand.heldHeroId === h.id;
      hs.container.zIndex = isHeld ? 96 : 45;
      hs.syncHero(h, m.floorY, dt, isHeld, pointerWorldX, this.pointerY);
    }
    for (const [id, hs] of this.heroSprites.entries()) {
      if (!aliveHeroIds.has(id)) {
        this.unitsLayer.removeChild(hs.container);
        hs.container.destroy({ children: true });
        this.heroSprites.delete(id);
      }
    }

    const aliveBoulderIds = new Set<string>();
    for (const b of this.engine.state.boulders) {
      aliveBoulderIds.add(b.id);
      let bsp = this.boulderSprites.get(b.id);
      if (!bsp) {
        bsp = new Sprite(this.assets.traps.boulder_trap);
        bsp.anchor.set(0.5, 0.5);
        bsp.scale.set(2);
        bsp.roundPixels = true;
        this.bouldersLayer.addChild(bsp);
        this.boulderSprites.set(b.id, bsp);
      }
      bsp.x = Math.round(b.x);
      bsp.y = Math.round(m.floorY - 44);
      bsp.rotation += dt * 11;
    }
    for (const [id, bsp] of this.boulderSprites.entries()) {
      if (!aliveBoulderIds.has(id)) {
        this.bouldersLayer.removeChild(bsp);
        bsp.destroy();
        this.boulderSprites.delete(id);
      }
    }
  }

  public update(dt: number): void {
    if (this.minimized) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const timeSec = performance.now() * 0.001;
    const m = this.getViewportMetrics();

    // Smooth camera easing
    this.targetCameraX = Math.max(0, Math.min(m.maxCameraX, this.targetCameraX));
    this.cameraX += (this.targetCameraX - this.cameraX) * Math.min(1, clampedDt * 14);
    this.worldContainer.x = -Math.round(this.cameraX);

    // 40ms pure-render hitstop on heavy crits / boulder streaks (never stalls simulation!)
    let animDt = clampedDt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - clampedDt);
      animDt = clampedDt * 0.12;
    }

    this.consumeVfxQueue(m);
    this.consumeCoreEvents(m);

    // V2.4 PresenceSensor & BanterDirector tick (UI-layer only, I3)
    this.presence.tick();
    const dueRelay = this.banterDirector.pollRelay(this.bubbles.length);
    if (dueRelay) {
      this.spawnBubble(dueRelay.x, m.floorY - 110, dueRelay.text, dueRelay.color, {
        speakerId: dueRelay.speakerId,
        speakerName: dueRelay.speakerName,
        priority: 'interactive',
        faction: 'ally',
      });
    }
    this.banterDirector.checkNightOwlClock(
      this.engine.state,
      (unitId) => this.engine.revealQuirk(unitId),
      (x, speakerId, speakerName, text, color) => {
        this.spawnBubble(x, m.floorY - 110, text, color, {
          speakerId,
          speakerName,
          priority: 'banter',
          faction: 'ally',
        });
      },
    );

    this.renderSurfaceAndMinimap(m, timeSec);
    this.renderRooms(m, timeSec);
    this.syncChickens(m, animDt);
    this.syncEntities(m, animDt);
    this.fxLayer.update(animDt);
    this.handCursor.update(clampedDt);

    this.speakerArrowGfx.clear();
    if (this.bubbles.length > 0) {
      this.obstacleCacheAccum += clampedDt;
      if (this.obstacleCacheAccum >= 0.25) {
        this.refreshBubbleObstacles();
      }
    }
    const arrowBob = Math.sin(timeSec * 8) * 3;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      b.life -= clampedDt;
      if (b.life <= 0) {
        this.bubblesLayer.removeChild(b.container);
        b.container.destroy({ children: true });
        this.bubbles.splice(i, 1);
        continue;
      }

      // Per-frame speakerId entity tracking + pulsing ▼ indicator inside dungeon strip
      let drawArrowAt: { x: number; y: number } | null = null;
      if (b.speakerId) {
        if (b.speakerId.startsWith('slot:')) {
          const slotIdx = Number(b.speakerId.slice(5));
          if (Number.isFinite(slotIdx)) {
            b.worldX = slotIdx * m.slotW + m.slotW * 0.5;
            drawArrowAt = { x: b.worldX, y: m.roomsTopY + 30 + arrowBob };
          }
        } else {
          const unit = this.engine.state.units.find((u) => u.id === b.speakerId);
          if (unit) {
            if (unit.hp <= 0 || unit.activity === 'dangling' || this.engine.state.hand.heldUnitId === unit.id) {
              b.life = Math.min(b.life, 0.25);
            } else {
              b.worldX = unit.x;
              drawArrowAt = { x: unit.x, y: m.floorY - 94 + arrowBob };
            }
          } else {
            const hero = this.engine.state.heroes.find((h) => h.id === b.speakerId);
            if (hero) {
              if ((hero.hp <= 0 && !hero.downedForCapture) || this.engine.state.hand.heldHeroId === hero.id) {
                b.life = Math.min(b.life, 0.25);
              } else {
                b.worldX = hero.x;
                drawArrowAt = { x: hero.x, y: m.floorY - 94 + arrowBob };
              }
            } else {
              // Speaker despawned / died
              b.life = Math.min(b.life, 0.25);
            }
          }
        }
      }

      if (drawArrowAt) {
        const ax = drawArrowAt.x;
        const ay = drawArrowAt.y;
        this.speakerArrowGfx
          .poly([ax - 6, ay - 8, ax + 6, ay - 8, ax, ay])
          .fill({ color: b.borderColor, alpha: 0.95 })
          .stroke({ color: 0x120919, width: 1.5 });
      }

      // Smooth horizontal follow + cached 2-tier DOM obstacle avoidance every frame (no per-frame DOM reads!)
      const targetPose = this.computeBubbleSafePose(b.worldX - this.cameraX, b.bw, b.bh, b.lane, m);
      b.screenX += (targetPose.screenX - b.screenX) * Math.min(1, clampedDt * 12);
      // Re-evaluate safe Y at actual interpolated screenX so bubble never slips behind a bar mid-glide!
      const livePose = this.computeBubbleSafePose(b.screenX, b.bw, b.bh, b.lane, m);
      if (livePose.baseY < b.baseY) {
        b.baseY = livePose.baseY; // Immediate upward dodge -> zero overlap frame
      } else {
        b.baseY += (livePose.baseY - b.baseY) * Math.min(1, clampedDt * 10);
      }
      const floatProgress = 1 - b.life / b.maxLife;
      b.container.x = Math.round(b.screenX);
      b.container.y = Math.round(b.baseY - floatProgress * 6);
      b.container.alpha = Math.min(1, b.life / 0.45);
    }

    // V2.4 Pure in-memory pairwise horizontal repulsion (n <= 3, zero DOM reads -> 0% pairwise overlap!)
    if (this.bubbles.length >= 2) {
      const margin = 10;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < this.bubbles.length; i++) {
          for (let j = i + 1; j < this.bubbles.length; j++) {
            const a = this.bubbles[i]!;
            const b = this.bubbles[j]!;
            const ay = a.container.y;
            const by = b.container.y;
            const overlapY = Math.abs(ay - by) < (a.bh + b.bh) * 0.5 + 4;
            if (!overlapY) continue;
            const minDx = (a.bw + b.bw) * 0.5 + margin;
            const dx = b.screenX - a.screenX;
            if (Math.abs(dx) < minDx) {
              const push = (minDx - Math.abs(dx)) * 0.5 + 1;
              const sign = dx >= 0 ? 1 : -1;
              a.screenX = Math.max(12 + a.bw / 2, Math.min(m.width - 12 - a.bw / 2, a.screenX - sign * push));
              b.screenX = Math.max(12 + b.bw / 2, Math.min(m.width - 12 - b.bw / 2, b.screenX + sign * push));
              a.container.x = Math.round(a.screenX);
              b.container.x = Math.round(b.screenX);
            }
          }
        }
      }
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - clampedDt);
      const amp = 3 * (this.shakeTimer / 0.3);
      this.rootContainer.x = Math.round((Math.random() - 0.5) * 2 * amp);
      this.rootContainer.y = Math.round((Math.random() - 0.5) * 2 * amp);
    } else {
      this.rootContainer.x = 0;
      this.rootContainer.y = 0;
    }
  }
}
