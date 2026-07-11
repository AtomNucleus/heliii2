/**
 * Elite units + finale encounter — readable telegraphs, fair but heavy pressure.
 */

import type { DroneRole } from './roles';
import type { FormationKind } from './formations';
import type { WaveSpec } from './waves';
import { rolePack } from './waves';

export interface EliteProfile {
  id: string;
  label: string;
  /** Base role to clone stats from */
  baseRole: DroneRole;
  healthMul: number;
  damageMul: number;
  scoreMul: number;
  telegraphMul: number;
  /** Extra tint override */
  tint: number;
  /** Formation affinity boost */
  formationPull: number;
}

export const ELITE_PROFILES: Record<string, EliteProfile> = {
  'elite-striker': {
    id: 'elite-striker',
    label: 'ELITE STRIKER',
    baseRole: 'striker',
    healthMul: 1.85,
    damageMul: 1.25,
    scoreMul: 2.2,
    telegraphMul: 1.35,
    tint: 0xffdd44,
    formationPull: 0.95,
  },
  'elite-gunship': {
    id: 'elite-gunship',
    label: 'ELITE GUNSHIP',
    baseRole: 'gunship',
    healthMul: 2.1,
    damageMul: 1.35,
    scoreMul: 2.4,
    telegraphMul: 1.45,
    tint: 0xcc66ff,
    formationPull: 0.7,
  },
};

export function getEliteProfile(id: string): EliteProfile | null {
  return ELITE_PROFILES[id] ?? null;
}

/**
 * Finale wave sheet — released when director beat is finale or last depot falls soon.
 */
export function finaleWaveSpec(): WaveSpec {
  return {
    id: 'finale-wing',
    label: 'FINALE WING',
    atTime: 180,
    afterPrimaries: 3,
    roles: rolePack('finale'),
    formation: 'diamond' as FormationKind,
    minPressure: 0.55,
    maxAliveThreats: 18,
  };
}

/**
 * Elite escort pack that rides with the finale (one elite + wingmen).
 */
export function finaleEliteRoles(): { eliteId: string; wingmen: DroneRole[] } {
  return {
    eliteId: 'elite-striker',
    wingmen: ['interceptor', 'gunship', 'escort'],
  };
}

/**
 * Whether mission state warrants releasing the finale encounter.
 */
export function shouldReleaseFinale(opts: {
  beat: string;
  primariesDestroyed: number;
  primaryTotal: number;
  elapsed: number;
  alreadyFired: boolean;
}): boolean {
  if (opts.alreadyFired) return false;
  if (opts.beat === 'finale') return true;
  if (opts.primaryTotal > 0 && opts.primariesDestroyed >= opts.primaryTotal - 1) return true;
  if (opts.elapsed >= 180 && opts.primariesDestroyed >= 2) return true;
  return false;
}
