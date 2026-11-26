import { CP_PAIRS, deriveQuirk } from '../core/data/quirks';
import { getLocale, locUnitName, t } from '../core/i18n';
import { V24_UI_BANTER_LINES } from '../core/i18n/v24';
import type { GameState } from '../core/types';

export interface QueuedRelayBubble {
  dueAtMs: number;
  expiresAtMs: number;
  x: number;
  speakerId: string;
  speakerName: string;
  text: string;
  color: number;
}

/**
 * V2.4 Presentation-layer Banter Director (Render Layer ONLY — never imported by src/core/**).
 * - Schedules 5 CP sequential relay dialogues (1.2s spacing, drops if unplayable within 3s).
 * - Checks local clock once/minute for Night Owl quirk (6-11 AM yawn, 0-4 AM once-per-session roast).
 * - Tracks per-speaker 60s banter cooldown and Boss / >=3 heroes silence gate.
 */
export class BanterDirector {
  private relayQueue: QueuedRelayBubble[] = [];
  private speakerLastMs = new Map<string, number>();
  private lastClockCheckMs = 0;
  private midnightRoastPlayed = false;
  private morningYawnPlayed = false;

  canSpeakIdle(state: GameState, speakerId: string, nowMs = Date.now()): boolean {
    const liveHeroes = state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);
    if (liveHeroes.length >= 3 || liveHeroes.some((h) => h.isBoss)) {
      return false;
    }
    const prev = this.speakerLastMs.get(speakerId) ?? 0;
    return nowMs - prev >= 60_000;
  }

  markSpoken(speakerId: string, nowMs = Date.now()): void {
    this.speakerLastMs.set(speakerId, nowMs);
  }

  enqueueCpRelay(
    state: GameState,
    cpId: string,
    speakerAId: string,
    speakerBId: string,
    xA: number,
    xB: number,
    nowMs = Date.now(),
  ): void {
    const cp = CP_PAIRS.find((c) => c.id === cpId);
    if (!cp) return;
    const en = getLocale() === 'en';
    const unitA = state.units.find((u) => u.id === speakerAId);
    const unitB = state.units.find((u) => u.id === speakerBId);
    const nameA = unitA ? locUnitName(unitA) : t('眷属', 'Retainer');
    const nameB = unitB ? locUnitName(unitB) : t('牢内俘虏', 'Captive');

    cp.lines.forEach((line, idx) => {
      const isA = line.speaker === 'A';
      const due = nowMs + idx * 1250;
      this.relayQueue.push({
        dueAtMs: due,
        expiresAtMs: due + 3000,
        x: isA ? xA : xB,
        speakerId: isA ? speakerAId : speakerBId,
        speakerName: isA ? nameA : nameB,
        text: en ? line.en : line.zh,
        color: isA ? 0xf2c655 : 0xd966ff,
      });
    });
  }

  /** Pop any due relay bubbles (caller checks active bubble count <= 3). */
  pollRelay(activeCount: number, nowMs = Date.now()): QueuedRelayBubble | null {
    // Drop expired items
    while (this.relayQueue.length > 0 && this.relayQueue[0]!.expiresAtMs < nowMs) {
      this.relayQueue.shift();
    }
    if (this.relayQueue.length === 0 || activeCount >= 3) return null;
    if (this.relayQueue[0]!.dueAtMs <= nowMs) {
      return this.relayQueue.shift() ?? null;
    }
    return null;
  }

  /** Check local clock once per minute for Night Owl quirk (UI-layer only, I3). */
  checkNightOwlClock(
    state: GameState,
    onRevealQuirk: (unitId: string) => void,
    onEmitBubble: (x: number, speakerId: string, speakerName: string, text: string, color: number) => void,
    nowMs = Date.now(),
  ): void {
    if (nowMs - this.lastClockCheckMs < 60_000) return;
    this.lastClockCheckMs = nowMs;

    const liveHeroes = state.heroes.filter((h) => !h.downedForCapture && h.hp > 0);
    if (liveHeroes.length > 0) return;

    const owl = state.units.find(
      (u) =>
        u.hp > 0 &&
        u.activity !== 'dangling' &&
        deriveQuirk(state.seed, u.id, u.species) === 'night_owl',
    );
    if (!owl) return;

    const hour = new Date().getHours();
    const en = getLocale() === 'en';
    if (hour >= 0 && hour <= 4 && !this.midnightRoastPlayed) {
      this.midnightRoastPlayed = true;
      if (!owl.quirkSeen) onRevealQuirk(owl.id);
      onEmitBubble(
        owl.x,
        owl.id,
        locUnitName(owl),
        en ? V24_UI_BANTER_LINES.nightOwlMidnightEn : V24_UI_BANTER_LINES.nightOwlMidnightZh,
        0xb982ff,
      );
    } else if (hour >= 6 && hour <= 11 && !this.morningYawnPlayed) {
      this.morningYawnPlayed = true;
      if (!owl.quirkSeen) onRevealQuirk(owl.id);
      onEmitBubble(
        owl.x,
        owl.id,
        locUnitName(owl),
        en ? V24_UI_BANTER_LINES.nightOwlMorningEn : V24_UI_BANTER_LINES.nightOwlMorningZh,
        0x8ad8ff,
      );
    }
  }
}
