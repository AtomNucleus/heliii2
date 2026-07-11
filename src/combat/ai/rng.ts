/**
 * Deterministic mulberry32 PRNG for fair, replayable combat layout & AI picks.
 */

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed (stable across runs). */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function rngInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return Math.floor(rngFloat(rng, minInclusive, maxExclusive));
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('rngPick: empty');
  return items[rngInt(rng, 0, items.length)]!;
}

export function rngShuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
