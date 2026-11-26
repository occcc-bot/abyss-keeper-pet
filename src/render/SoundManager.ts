export type SfxKey =
  | 'slap_whack'
  | 'hand_grab'
  | 'hand_drop'
  | 'pickaxe_dig'
  | 'gold_chime'
  | 'chicken_gulp'
  | 'boulder_crush'
  | 'corruption_complete'
  | 'payday_bell'
  | 'spell_cast'
  | 'fusion_ritual'
  | 'trap_snap';

export type BgmTrackId = 'abyss_lounge' | 'valkyrie_raid';
export type BgmMode = 'auto' | 'lounge' | 'battle';

const BGM_URLS: Record<BgmTrackId, string> = {
  abyss_lounge: './assets/bgm/abyss_lounge.mp3',
  valkyrie_raid: './assets/bgm/valkyrie_raid.mp3',
};

const STORAGE_BGM_MUTED = 'abyss_keeper_pet_bgm_muted';
const STORAGE_BGM_VOL = 'abyss_keeper_pet_bgm_vol';
const STORAGE_BGM_MODE = 'abyss_keeper_pet_bgm_mode';
const STORAGE_SFX_MUTED = 'abyss_keeper_pet_sfx_muted';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SfxKey, AudioBuffer>();
  private lastPlayedMs = new Map<SfxKey, number>();

  // SFX state
  public muted = false;

  // Dynamic Flow-Music BGM state
  private bgmAudio: Partial<Record<BgmTrackId, HTMLAudioElement>> = {};
  private bgmGains: Record<BgmTrackId, number> = { abyss_lounge: 0, valkyrie_raid: 0 };
  public bgmMuted = false;
  public bgmVolume = 0.35; // Cozy desktop-companion default behind coding
  public bgmMode: BgmMode = 'auto';
  public activeBgmTrack: BgmTrackId = 'abyss_lounge';
  private bgmUnlocked = false;
  private battleHoldSec = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const sm = window.localStorage.getItem(STORAGE_SFX_MUTED);
        if (sm === '1') this.muted = true;
        const bm = window.localStorage.getItem(STORAGE_BGM_MUTED);
        if (bm === '1') this.bgmMuted = true;
        const bv = window.localStorage.getItem(STORAGE_BGM_VOL);
        if (bv !== null) {
          const parsed = Number(bv);
          if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
            this.bgmVolume = parsed;
          }
        }
        const mode = window.localStorage.getItem(STORAGE_BGM_MODE);
        if (mode === 'auto' || mode === 'lounge' || mode === 'battle') {
          this.bgmMode = mode;
        }
      } catch {
        // Ignore storage restrictions
      }
    }
  }

  async preload(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.initBgmElements();

    if (typeof AudioContext === 'undefined') return;
    const keys: SfxKey[] = [
      'slap_whack',
      'hand_grab',
      'hand_drop',
      'pickaxe_dig',
      'gold_chime',
      'chicken_gulp',
      'boulder_crush',
      'corruption_complete',
      'payday_bell',
      'spell_cast',
      'fusion_ritual',
      'trap_snap',
    ];
    try {
      this.ctx = new AudioContext();
      await Promise.all(
        keys.map(async (k) => {
          try {
            const resp = await fetch(`./assets/sfx/${k}.wav`);
            if (!resp.ok) return;
            const arr = await resp.arrayBuffer();
            if (this.ctx) {
              const decoded = await this.ctx.decodeAudioData(arr);
              this.buffers.set(k, decoded);
            }
          } catch {
            // Headless browser audio decode may be unavailable; fail gracefully
          }
        }),
      );
    } catch {
      this.ctx = null;
    }
  }

  private initBgmElements(): void {
    if (typeof Audio === 'undefined') return;
    for (const track of ['abyss_lounge', 'valkyrie_raid'] as const) {
      if (this.bgmAudio[track]) continue;
      try {
        const audio = new Audio(BGM_URLS[track]);
        audio.loop = true;
        audio.preload = 'metadata';
        audio.volume = 0;
        this.bgmAudio[track] = audio;
      } catch {
        // Ignore restricted audio environments
      }
    }
  }

  /** Call on first user pointerdown / keydown to satisfy browser/WebView autoplay policy cleanly. */
  public unlockAudio(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    this.initBgmElements();
    this.bgmUnlocked = true;
    if (!this.bgmMuted) {
      const target = this.bgmAudio[this.activeBgmTrack];
      if (target && target.paused) {
        void target.play().catch(() => {
          // Headless / autoplay-blocked environments fail silently without console errors
        });
      }
    }
  }

  public setSfxMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_SFX_MUTED, muted ? '1' : '0');
    } catch {
      // Ignore
    }
  }

  public setBgmMuted(muted: boolean): void {
    this.bgmMuted = muted;
    try {
      window.localStorage.setItem(STORAGE_BGM_MUTED, muted ? '1' : '0');
    } catch {
      // Ignore
    }
    if (muted) {
      for (const track of ['abyss_lounge', 'valkyrie_raid'] as const) {
        const el = this.bgmAudio[track];
        if (el) {
          el.volume = 0;
          if (!el.paused) el.pause();
        }
        this.bgmGains[track] = 0;
      }
    } else if (this.bgmUnlocked) {
      this.unlockAudio();
    }
  }

  public toggleBgmMute(): boolean {
    this.setBgmMuted(!this.bgmMuted);
    return this.bgmMuted;
  }

  public setBgmVolume(vol: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    try {
      window.localStorage.setItem(STORAGE_BGM_VOL, this.bgmVolume.toFixed(2));
    } catch {
      // Ignore
    }
  }

  public setBgmMode(mode: BgmMode): void {
    this.bgmMode = mode;
    try {
      window.localStorage.setItem(STORAGE_BGM_MODE, mode);
    } catch {
      // Ignore
    }
    if (mode === 'lounge') this.activeBgmTrack = 'abyss_lounge';
    else if (mode === 'battle') this.activeBgmTrack = 'valkyrie_raid';
  }

  /**
   * Drives smooth 1.2s crossfading between Abyssal Throne Lounge & Valkyrie Siege Overdrive,
   * with 6s battle hysteresis and soft 45% volume ducking when minimized into Demon Heart Badge.
   */
  public syncDynamicBgm(dt: number, isUrgentBattle: boolean, isMinimized: boolean): void {
    if (this.bgmMode === 'lounge') {
      this.activeBgmTrack = 'abyss_lounge';
    } else if (this.bgmMode === 'battle') {
      this.activeBgmTrack = 'valkyrie_raid';
    } else {
      if (isUrgentBattle) {
        this.battleHoldSec = 6.0;
        this.activeBgmTrack = 'valkyrie_raid';
      } else if (this.battleHoldSec > 0) {
        this.battleHoldSec = Math.max(0, this.battleHoldSec - dt);
        if (this.battleHoldSec === 0) {
          this.activeBgmTrack = 'abyss_lounge';
        }
      } else {
        this.activeBgmTrack = 'abyss_lounge';
      }
    }

    if (!this.bgmUnlocked || this.bgmMuted) return;

    const duck = isMinimized ? 0.45 : 1.0;
    const maxVol = this.bgmVolume * duck;
    const fadeRate = dt / 1.2;

    for (const track of ['abyss_lounge', 'valkyrie_raid'] as const) {
      const el = this.bgmAudio[track];
      if (!el) continue;
      const isTarget = track === this.activeBgmTrack;
      if (isTarget) {
        this.bgmGains[track] = Math.min(1, this.bgmGains[track] + fadeRate);
        if (el.paused && maxVol > 0.005) {
          void el.play().catch(() => {});
        }
      } else {
        this.bgmGains[track] = Math.max(0, this.bgmGains[track] - fadeRate);
      }
      const nextVol = Math.max(0, Math.min(1, this.bgmGains[track] * maxVol));
      el.volume = nextVol;
      if (!isTarget && nextVol <= 0.002 && !el.paused) {
        el.pause();
      }
    }
  }

  play(key: SfxKey, volume = 0.55, minIntervalMs = 80): void {
    if (this.muted || !this.ctx) return;
    const now = performance.now();
    const prev = this.lastPlayedMs.get(key) ?? 0;
    if (now - prev < minIntervalMs) return;
    this.lastPlayedMs.set(key, now);

    const buf = this.buffers.get(key);
    if (!buf) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    try {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buf;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
    } catch {
      // Ignore audio playback errors in restricted contexts
    }
  }
}
