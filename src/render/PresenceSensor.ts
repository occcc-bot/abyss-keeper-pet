/**
 * V2.4 Desktop Pet Mirror Presence Sensor (UI/Render Layer ONLY — never imported by src/core/**).
 * - Monitors pointer activity strictly on the Pixi stage canvas (no global hooks needed!).
 * - 3 minutes (180s) without canvas pointer -> slackers enter napping pose (`isNapping = true`).
 * - `pointerenter` immediately wakes slackers (work pose restored instantly!).
 * - Hover dwell >= 1.0s after waking AND >= 8 minutes (480s) since last shout -> fires `onSlackerWakeShout` (#81).
 * - 10 minutes (600s) without input -> fires `onExtremeInactivityFuse` to auto-revert Extreme Voltage mode (I2).
 */
export interface PresenceCallbacks {
  onSlackerWakeShout: () => void;
  onExtremeInactivityFuse: () => void;
}

export class PresenceSensor {
  private lastPointerMs = Date.now();
  private lastWakeMs = 0;
  private lastShoutMs = -Infinity;
  private hoverEnterMs: number | null = null;
  private pendingWakeShout = false;
  private napping = false;
  private napCount = 0;
  private extremeFuseFired = false;
  private readonly callbacks: PresenceCallbacks;

  constructor(callbacks: PresenceCallbacks) {
    this.callbacks = callbacks;
  }

  attach(canvas: HTMLElement): () => void {
    const onMove = (): void => {
      const now = Date.now();
      this.lastPointerMs = now;
      this.extremeFuseFired = false;
      if (this.napping) {
        this.wakeFromNap(now);
      }
      if (this.hoverEnterMs === null) {
        this.hoverEnterMs = now;
      }
    };

    const onEnter = (): void => {
      const now = Date.now();
      this.lastPointerMs = now;
      this.extremeFuseFired = false;
      this.hoverEnterMs = now;
      if (this.napping) {
        this.wakeFromNap(now);
      }
    };

    const onLeave = (): void => {
      this.hoverEnterMs = null;
    };

    const onKeyOrClick = (): void => {
      this.lastPointerMs = Date.now();
      this.extremeFuseFired = false;
    };

    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerenter', onEnter, { passive: true });
    canvas.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('keydown', onKeyOrClick, { passive: true });
    window.addEventListener('pointerdown', onKeyOrClick, { passive: true });

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKeyOrClick);
      window.removeEventListener('pointerdown', onKeyOrClick);
    };
  }

  private wakeFromNap(now: number): void {
    this.napping = false;
    this.lastWakeMs = now;
    this.pendingWakeShout = true;
  }

  /** Call once per frame or second from render loop. */
  tick(now = Date.now()): void {
    const idleMs = now - this.lastPointerMs;

    // 3 minutes (180s) -> slackers fall asleep
    if (!this.napping && idleMs >= 180_000) {
      this.napping = true;
      this.napCount += 1;
      this.pendingWakeShout = false;
    }

    // 10 minutes (600s) -> Extreme Voltage inactivity fuse
    if (!this.extremeFuseFired && idleMs >= 600_000) {
      this.extremeFuseFired = true;
      this.callbacks.onExtremeInactivityFuse();
    }

    // Check dwell >= 1.0s and 8-minute (480s) cooldown for wake shout (#81)
    if (
      this.pendingWakeShout &&
      this.hoverEnterMs !== null &&
      now - this.hoverEnterMs >= 1000
    ) {
      this.pendingWakeShout = false;
      if (now - this.lastShoutMs >= 480_000) {
        this.lastShoutMs = now;
        this.callbacks.onSlackerWakeShout();
      }
    }
  }

  isNapping(): boolean {
    return this.napping;
  }

  getNapCount(): number {
    return this.napCount;
  }

  resetNapCount(): void {
    this.napCount = 0;
  }

  /** True if player slaps a slacker within 5 seconds of waking up from a nap. */
  wasRecentlyWoken(now = Date.now()): boolean {
    return this.lastWakeMs > 0 && now - this.lastWakeMs <= 5000;
  }
}
