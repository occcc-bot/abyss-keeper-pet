export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HostBridge {
  readonly isTauri: boolean;
  updateHitRegions(rects: HitRect[]): Promise<void>;
  setDragCapture(capturing: boolean): Promise<void>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function initHostBridge(): HostBridge {
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

  return {
    isTauri,
    async updateHitRegions(rects: HitRect[]): Promise<void> {
      if (!isTauri) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_hit_regions', { rects });
    },
    async setDragCapture(capturing: boolean): Promise<void> {
      if (!isTauri) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_drag_capture', { capturing });
    },
  };
}
