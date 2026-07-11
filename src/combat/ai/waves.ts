/**
 * Authored encounter wave tools — declarative beats, role packs, cleanup hooks.
 */

import type { DroneRole } from './roles';
import type { FormationKind } from './formations';
import type { EncounterBeat } from './spawning';
import { clamp } from './vec';

export interface WaveSpec {
  id: string;
  label: string;
  /** Elapsed seconds gate (OR with afterPrimaries) */
  atTime?: number;
  /** Primary depots destroyed gate */
  afterPrimaries?: number;
  roles: DroneRole[];
  formation: FormationKind;
  /** Optional pressure gate (0–1); wave skipped while director pressure is below */
  minPressure?: number;
  /** Soft cap: skip if alive threats already at/above this */
  maxAliveThreats?: number;
}

export interface WaveReleaseDecision {
  release: boolean;
  reason: 'time' | 'objective' | 'blocked' | 'already' | 'pressure' | 'budget';
}

export interface WaveRuntimeState {
  fired: Set<string>;
}

export function createWaveRuntime(): WaveRuntimeState {
  return { fired: new Set() };
}

export function resetWaveRuntime(state: WaveRuntimeState) {
  state.fired.clear();
}

/** Compact role packs for director / authored reinforcements. */
export const ROLE_PACKS: Record<string, DroneRole[]> = {
  interceptors: ['interceptor', 'interceptor', 'scout'],
  gunships: ['gunship', 'escort', 'escort'],
  strikers: ['striker', 'striker', 'interceptor'],
  mixedProbe: ['scout', 'escort', 'interceptor'],
  heavyWing: ['gunship', 'gunship', 'escort', 'striker'],
  finale: ['striker', 'interceptor', 'gunship', 'escort', 'scout'],
};

export function rolePack(name: keyof typeof ROLE_PACKS | string, fallback: DroneRole[] = ['escort']): DroneRole[] {
  return (ROLE_PACKS[name] ?? fallback).slice();
}

/**
 * Build encounter beats from declarative wave specs (stable ordering).
 */
export function compileWaveSpecs(specs: WaveSpec[]): EncounterBeat[] {
  return specs.map((s) => ({
    atTime: s.atTime ?? Number.POSITIVE_INFINITY,
    afterPrimariesDestroyed: s.afterPrimaries ?? Number.POSITIVE_INFINITY,
    label: s.label,
    droneRoles: s.roles.slice(),
    formation: s.formation,
  }));
}

/** Default authored strike-run wave sheet. */
export function defaultWaveSheet(): WaveSpec[] {
  return [
    {
      id: 'probe-intercept',
      label: 'INTERCEPTOR FLIGHT',
      atTime: 45,
      afterPrimaries: 1,
      roles: rolePack('interceptors'),
      formation: 'vic',
      minPressure: 0.15,
      maxAliveThreats: 14,
    },
    {
      id: 'gunship-wing',
      label: 'GUNSHIP WING',
      atTime: 90,
      afterPrimaries: 2,
      roles: rolePack('gunships'),
      formation: 'wedge',
      minPressure: 0.25,
      maxAliveThreats: 15,
    },
    {
      id: 'striker-run',
      label: 'STRIKER RUN',
      atTime: 140,
      afterPrimaries: 3,
      roles: rolePack('strikers').concat(['scout']),
      formation: 'diamond',
      minPressure: 0.35,
      maxAliveThreats: 16,
    },
    {
      id: 'finale-wing',
      label: 'FINALE WING',
      atTime: 180,
      afterPrimaries: 3,
      roles: rolePack('finale'),
      formation: 'diamond',
      minPressure: 0.5,
      maxAliveThreats: 18,
    },
  ];
}

export function evaluateWaveGate(
  spec: WaveSpec,
  opts: {
    elapsed: number;
    primariesDestroyed: number;
    pressure: number;
    aliveThreats: number;
    fired: Set<string>;
    /** Grace / breather blocks scripted waves when true */
    blocked: boolean;
  },
): WaveReleaseDecision {
  if (opts.fired.has(spec.id)) return { release: false, reason: 'already' };
  if (opts.blocked) return { release: false, reason: 'blocked' };
  if (spec.minPressure !== undefined && opts.pressure < spec.minPressure) {
    return { release: false, reason: 'pressure' };
  }
  if (spec.maxAliveThreats !== undefined && opts.aliveThreats >= spec.maxAliveThreats) {
    return { release: false, reason: 'budget' };
  }
  const timeReady = opts.elapsed >= (spec.atTime ?? Number.POSITIVE_INFINITY);
  const objReady = opts.primariesDestroyed >= (spec.afterPrimaries ?? Number.POSITIVE_INFINITY);
  if (timeReady) return { release: true, reason: 'time' };
  if (objReady) return { release: true, reason: 'objective' };
  return { release: false, reason: 'blocked' };
}

/**
 * Pick next wave to release from a sheet. Marks fired on success via caller.
 */
export function pickNextWave(
  specs: WaveSpec[],
  runtime: WaveRuntimeState,
  opts: {
    elapsed: number;
    primariesDestroyed: number;
    pressure: number;
    aliveThreats: number;
    blocked: boolean;
  },
): WaveSpec | null {
  for (const spec of specs) {
    const decision = evaluateWaveGate(spec, { ...opts, fired: runtime.fired });
    if (decision.release) return spec;
  }
  return null;
}

export function markWaveFired(runtime: WaveRuntimeState, spec: WaveSpec) {
  runtime.fired.add(spec.id);
}

/**
 * Fair director reinforce role selection from pressure + remaining budget.
 */
export function pickReinforceRoles(
  pressure: number,
  count: number,
  packBias: 'early' | 'mid' | 'late' = 'mid',
): DroneRole[] {
  const n = clamp(Math.round(count), 0, 6);
  if (n <= 0) return [];
  const early: DroneRole[] = ['scout', 'escort', 'interceptor', 'escort'];
  const mid: DroneRole[] = ['interceptor', 'gunship', 'escort', 'scout'];
  const late: DroneRole[] = ['striker', 'gunship', 'interceptor', 'escort', 'scout'];
  const pool = packBias === 'early' ? early : packBias === 'late' ? late : mid;
  // Pressure nudges toward later packs
  const biasPool = pressure > 0.7 ? late : pressure < 0.35 ? early : pool;
  const out: DroneRole[] = [];
  for (let i = 0; i < n; i++) out.push(biasPool[i % biasPool.length]!);
  return out;
}

export function reinforceFormationForPressure(pressure: number): FormationKind {
  if (pressure > 0.75) return 'diamond';
  if (pressure > 0.5) return 'wedge';
  if (pressure > 0.3) return 'vic';
  return 'line';
}

/**
 * Soft despawn delay helper — dead units linger briefly for VFX, then reclaim.
 */
export function shouldReclaimCorpse(deadFor: number, linger = 2.5): boolean {
  return deadFor >= linger;
}
