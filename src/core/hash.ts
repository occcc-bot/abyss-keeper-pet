/**
 * Pure deterministic 32-bit FNV-1a / Murmur-finalized hashing helpers.
 * Used by prisonSystem, quirkSystem, wave roster preview, and render layer
 * so new V2.4 systems NEVER touch or perturb the shared SeededRng stream (Invariant I3).
 */
export function hash32(...parts: readonly (string | number)[]): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (typeof p === 'number') {
      const n = (p | 0) >>> 0;
      h ^= n & 0xff;
      h = Math.imul(h, 16777619);
      h ^= (n >>> 8) & 0xff;
      h = Math.imul(h, 16777619);
      h ^= (n >>> 16) & 0xff;
      h = Math.imul(h, 16777619);
      h ^= (n >>> 24) & 0xff;
      h = Math.imul(h, 16777619);
    } else {
      const s = String(p);
      for (let j = 0; j < s.length; j++) {
        h ^= s.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      h ^= 0xff;
      h = Math.imul(h, 16777619);
    }
  }
  // Murmur3 avalanche finalizer
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Returns a deterministic float in [0, 1) from hash32. */
export function hashUnitFloat(...parts: readonly (string | number)[]): number {
  return hash32(...parts) / 4294967296;
}

/** Deterministic integer in [min, max] inclusive. */
export function hashInt(min: number, max: number, ...parts: readonly (string | number)[]): number {
  if (max <= min) return min;
  return min + (hash32(...parts) % (max - min + 1));
}
