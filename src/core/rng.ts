/**
 * Deterministic Mulberry32 PRNG with serializable internal state.
 * Guarantees 100% reproducible headless simulations and save/load continuity.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = (state >>> 0) || 0x9e3779b9;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with probability p in [0, 1]. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** Picks one element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('SeededRng.pick called on empty array');
    }
    const idx = Math.floor(this.next() * items.length);
    return items[idx] as T;
  }
}
