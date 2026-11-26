import type { HitRect, HostBridge } from './hostBridge';
import { DUNGEON_STRIP_HEIGHT } from '../render/DungeonStage';

/**
 * Computes all active interactive bounding rectangles (HitRect[]) and syncs them
 * to the Tauri v2 Rust 60Hz GetCursorPos passthrough controller.
 * Sky area above the dungeon strip & open drawers remains 100% click-through!
 */
export class HitMaskSynchronizer {
  private readonly bridge: HostBridge;
  private lastSignature = '';
  public isMinimized = false;

  constructor(bridge: HostBridge) {
    this.bridge = bridge;
  }

  public computeRects(): HitRect[] {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rects: HitRect[] = [];

    if (this.isMinimized) {
      // Only the 76x76 Abyssal Crystal Orb in bottom-right corner captures mouse!
      const orbEl = document.getElementById('abyss-crystal-orb');
      if (orbEl) {
        const r = orbEl.getBoundingClientRect();
        rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      } else {
        rects.push({ x: Math.max(0, vw - 86), y: Math.max(0, vh - 86), w: 76, h: 76 });
      }
      return rects;
    }

    // 1. Permanent bottom dungeon cutaway strip + HUD bar right above it
    const hudEl = document.getElementById('abyss-hud-bar');
    const hudHeight = hudEl ? hudEl.getBoundingClientRect().height : 38;
    const stripTop = Math.max(0, vh - DUNGEON_STRIP_HEIGHT - hudHeight - 6);
    rects.push({
      x: 0,
      y: stripTop,
      w: vw,
      h: vh - stripTop,
    });

    // 2. Any currently visible floating gothic drawers or celebration modals
    const interactivePanels = document.querySelectorAll<HTMLElement>('[data-hit-region="true"]');
    for (const el of interactivePanels) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) {
        rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }

    return rects;
  }

  public sync(force = false): void {
    const rects = this.computeRects();
    const sig = rects
      .map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`)
      .join('|');
    if (!force && sig === this.lastSignature) return;
    this.lastSignature = sig;
    void this.bridge.updateHitRegions(rects);
  }
}
