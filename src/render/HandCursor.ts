import { Container, Graphics, Sprite } from 'pixi.js';
import type { LoadedGameAssets } from './AssetLoader';

export type HandCursorMode = 'hover' | 'grab' | 'slap';

/**
 * Bullfrog "Hand of Evil" 3-state pixel cursor (open claw / clenched grab / slap swing)
 * rendered at crisp integer scale (2x = 64x64) with trailing slap arc!
 */
export class HandCursor {
  public readonly container = new Container();
  private readonly sprite: Sprite;
  private readonly trailGfx = new Graphics();
  private readonly assets: LoadedGameAssets['cursors'];
  private slapAnimTimer = 0;
  private mode: HandCursorMode = 'hover';
  public visible = false;

  constructor(cursors: LoadedGameAssets['cursors']) {
    this.assets = cursors;
    this.container.eventMode = 'none';
    this.container.zIndex = 9999;

    this.sprite = new Sprite(cursors.hover);
    this.sprite.scale.set(2); // Strict 2x integer pixel scale (32 -> 64px)
    this.sprite.anchor.set(0.2, 0.15);
    this.sprite.roundPixels = true;

    this.container.addChild(this.trailGfx);
    this.container.addChild(this.sprite);
    this.container.visible = false;
  }

  setPosition(x: number, y: number): void {
    this.container.x = Math.round(x);
    this.container.y = Math.round(y);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.visible = v;
  }

  setMode(mode: HandCursorMode): void {
    if (this.slapAnimTimer > 0 && mode !== 'slap') return;
    this.mode = mode;
    if (mode === 'hover') {
      this.sprite.texture = this.assets.hover;
      this.sprite.rotation = 0;
    } else if (mode === 'grab') {
      this.sprite.texture = this.assets.grab;
      this.sprite.rotation = -0.06;
    } else {
      this.sprite.texture = this.assets.slap;
      this.sprite.rotation = -0.35;
    }
  }

  triggerSlapSwing(): void {
    this.slapAnimTimer = 0.24;
    this.mode = 'slap';
    this.sprite.texture = this.assets.slap;
    this.sprite.rotation = -0.45;
  }

  update(dt: number): void {
    this.trailGfx.clear();
    if (this.slapAnimTimer > 0) {
      this.slapAnimTimer = Math.max(0, this.slapAnimTimer - dt);
      const t = 1 - this.slapAnimTimer / 0.24;
      // Snappy backhand slap swing arc!
      this.sprite.rotation = -0.45 + t * 0.72;
      this.sprite.scale.set(2.2 - t * 0.2);

      // Crimson pixel slap arc trail
      const alpha = (1 - t) * 0.85;
      this.trailGfx
        .moveTo(10 + Math.cos(-0.7) * 28, 14 + Math.sin(-0.7) * 28)
        .arc(10, 14, 28, -0.7, 0.65)
        .stroke({ color: 0xf05674, width: 4, alpha });
      this.trailGfx
        .moveTo(10 + Math.cos(-0.5) * 21, 14 + Math.sin(-0.5) * 21)
        .arc(10, 14, 21, -0.5, 0.5)
        .stroke({ color: 0xfff0b3, width: 2, alpha });

      if (this.slapAnimTimer <= 0) {
        this.sprite.scale.set(2);
        this.sprite.rotation = 0;
        this.setMode('hover');
      }
    } else if (this.mode === 'hover') {
      // Subtle menacing hover bob
      this.sprite.y = Math.round(Math.sin(performance.now() * 0.006) * 2);
    } else {
      this.sprite.y = 0;
    }
  }
}
