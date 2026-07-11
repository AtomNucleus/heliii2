/**
 * Distinct AA turret fire modes with telegraphed patterns.
 */

export type TurretMode = 'tracker' | 'burst' | 'sweep' | 'flak';

export interface TurretModeProfile {
  mode: TurretMode;
  health: number;
  scoreValue: number;
  fireCooldown: number;
  boltDamage: number;
  engageRange: number;
  minRange: number;
  leadTime: number;
  telegraphDuration: number;
  /** Burst: shots per volley */
  burstCount: number;
  /** Burst: gap between shots */
  burstGap: number;
  /** Sweep: half-angle of sweep (radians) */
  sweepHalfAngle: number;
  /** Sweep: full cycle period */
  sweepPeriod: number;
  /** Tracking turn rate (rad/s) — lower = more readable */
  turnRate: number;
}

export const TURRET_MODES: Record<TurretMode, TurretModeProfile> = {
  tracker: {
    mode: 'tracker',
    health: 55,
    scoreValue: 320,
    fireCooldown: 1.35,
    boltDamage: 14,
    engageRange: 72,
    minRange: 8,
    leadTime: 0.35,
    telegraphDuration: 0.4,
    burstCount: 1,
    burstGap: 0,
    sweepHalfAngle: 0,
    sweepPeriod: 1,
    turnRate: 2.4,
  },
  burst: {
    mode: 'burst',
    health: 62,
    scoreValue: 360,
    fireCooldown: 2.4,
    boltDamage: 11,
    engageRange: 68,
    minRange: 9,
    leadTime: 0.3,
    telegraphDuration: 0.65,
    burstCount: 3,
    burstGap: 0.12,
    sweepHalfAngle: 0,
    sweepPeriod: 1,
    turnRate: 2.0,
  },
  sweep: {
    mode: 'sweep',
    health: 50,
    scoreValue: 300,
    fireCooldown: 0.55,
    boltDamage: 9,
    engageRange: 64,
    minRange: 10,
    leadTime: 0.15,
    telegraphDuration: 0.25,
    burstCount: 1,
    burstGap: 0,
    sweepHalfAngle: 0.55,
    sweepPeriod: 2.8,
    turnRate: 1.6,
  },
  flak: {
    mode: 'flak',
    health: 70,
    scoreValue: 400,
    fireCooldown: 1.9,
    boltDamage: 18,
    engageRange: 80,
    minRange: 12,
    leadTime: 0.55,
    telegraphDuration: 0.75,
    burstCount: 1,
    burstGap: 0,
    sweepHalfAngle: 0,
    sweepPeriod: 1,
    turnRate: 1.4,
  },
};

export function turretModeMix(count: number): TurretMode[] {
  const pattern: TurretMode[] = [
    'tracker',
    'burst',
    'sweep',
    'flak',
    'tracker',
    'burst',
    'tracker',
    'flak',
    'sweep',
    'burst',
  ];
  const out: TurretMode[] = [];
  for (let i = 0; i < count; i++) out.push(pattern[i % pattern.length]!);
  return out;
}

export function getTurretMode(mode: TurretMode): TurretModeProfile {
  return TURRET_MODES[mode];
}

/**
 * Sweep aim yaw offset relative to target bearing.
 * Pure, deterministic from time + id.
 */
export function sweepYawOffset(
  time: number,
  period: number,
  halfAngle: number,
  phase = 0,
): number {
  if (period <= 0 || halfAngle <= 0) return 0;
  const t = ((time + phase) % period) / period;
  // Triangle wave −1…1
  const tri = t < 0.5 ? t * 4 - 1 : 3 - t * 4;
  return tri * halfAngle;
}

/**
 * Rotate a horizontal aim direction by yaw radians.
 */
export function rotateYaw(
  dirX: number,
  dirZ: number,
  yaw: number,
): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: dirX * c - dirZ * s, z: dirX * s + dirZ * c };
}
