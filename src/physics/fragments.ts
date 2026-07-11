import { allocateFragmentSlots, type DebrisPhysicsBudget } from './budgets';

export interface FragmentBurstInput {
  /** World-space burst origin. */
  origin: readonly [number, number, number];
  /** Impulse / scale factor (closing speed or explosion scale). */
  impulse: number;
  /** Optional tint hint (hex). */
  colorHint?: number;
  /** Geometry variety count (maps to shared geos). */
  geoCount?: number;
  /** Default palette when colorHint omitted. */
  palette?: readonly number[];
}

export interface FragmentSpec {
  position: [number, number, number];
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
  /** Half-extents for box collider approximation. */
  halfExtents: [number, number, number];
  mass: number;
  life: number;
  color: number;
  geoIndex: number;
  scale: number;
}

const DEFAULT_PALETTE = [0x4a5560, 0x3a3030, 0x5a4030, 0x2a3238, 0xff6b20] as const;

const HALF_EXTENTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.175, 0.11, 0.14],
  [0.14, 0.14, 0.14],
  [0.25, 0.06, 0.1],
];

/**
 * Deterministic mulberry32 PRNG — keeps fragment generation unit-testable.
 */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build fragment descriptors for a destruction / explosion burst.
 * Pure — no Three.js / Rapier dependency.
 */
export function generateFragmentBurst(
  input: FragmentBurstInput,
  budget: Pick<DebrisPhysicsBudget, 'maxBodies' | 'maxPerBurst'>,
  activeCount: number,
  rng: () => number = Math.random,
): FragmentSpec[] {
  const impulse = Math.max(0.2, input.impulse);
  const requested = Math.max(
    2,
    Math.min(budget.maxPerBurst, Math.floor(3 + impulse * 0.35)),
  );
  const count = allocateFragmentSlots(requested, activeCount, budget);
  if (count <= 0) return [];

  const palette = input.palette ?? DEFAULT_PALETTE;
  const geoCount = Math.max(1, input.geoCount ?? HALF_EXTENTS.length);
  const [ox, oy, oz] = input.origin;
  const out: FragmentSpec[] = [];

  for (let i = 0; i < count; i++) {
    const geoIndex = i % geoCount;
    const he = HALF_EXTENTS[geoIndex % HALF_EXTENTS.length];
    const scale = 0.55 + rng() * 0.9;
    const theta = rng() * Math.PI * 2;
    const speed = (7 + rng() * 14) * Math.min(1.8, 0.55 + impulse * 0.08);
    const up = (6 + rng() * 12) * Math.min(1.6, 0.5 + impulse * 0.06);
    const life = 0.9 + rng() * 0.85 + Math.min(0.6, impulse * 0.02);
    const hx = he[0] * scale;
    const hy = he[1] * scale;
    const hz = he[2] * scale;
    const volume = Math.max(0.01, hx * hy * hz * 8);
    const mass = 0.35 + volume * 18;

    out.push({
      position: [
        ox + (rng() - 0.5) * 0.6 * Math.min(2, impulse * 0.05 + 0.5),
        oy + 0.4 + rng() * 0.8,
        oz + (rng() - 0.5) * 0.6 * Math.min(2, impulse * 0.05 + 0.5),
      ],
      linearVelocity: [
        Math.cos(theta) * speed * (0.5 + rng()),
        up,
        Math.sin(theta) * speed * (0.5 + rng()),
      ],
      angularVelocity: [
        (rng() - 0.5) * 14,
        (rng() - 0.5) * 14,
        (rng() - 0.5) * 14,
      ],
      halfExtents: [hx, hy, hz],
      mass,
      life,
      color: input.colorHint ?? palette[i % palette.length],
      geoIndex,
      scale,
    });
  }

  return out;
}
