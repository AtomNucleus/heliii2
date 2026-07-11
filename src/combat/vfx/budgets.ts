import type { QualitySettings } from '../../effects/quality';

/** Per-tier combat FX budgets — scales with adaptive quality. */
export interface CombatFxBudget {
  scale: number;
  maxBursts: number;
  burstParticles: number;
  maxDebris: number;
  maxSparks: number;
  maxSmoke: number;
  maxWaves: number;
  maxTracers: number;
  maxDecals: number;
  maxFlashes: number;
  debrisPerKill: number;
  smokePerExplosion: number;
  sparksPerHit: number;
  enableDecals: boolean;
  enableSmoke: boolean;
  enableDebris: boolean;
}

export function combatBudgetFromQuality(q: QualitySettings): CombatFxBudget {
  const s = q.particleScale;
  if (q.tier === 'low' || s < 0.55) {
    return {
      scale: Math.max(0.4, s),
      maxBursts: 5,
      burstParticles: 18,
      maxDebris: 10,
      maxSparks: 16,
      maxSmoke: 12,
      maxWaves: 3,
      maxTracers: 6,
      maxDecals: 4,
      maxFlashes: 3,
      debrisPerKill: 4,
      smokePerExplosion: 3,
      sparksPerHit: 6,
      enableDecals: true,
      enableSmoke: true,
      enableDebris: true,
    };
  }
  if (q.tier === 'medium' || s < 0.9) {
    return {
      scale: s,
      maxBursts: 8,
      burstParticles: 28,
      maxDebris: 18,
      maxSparks: 28,
      maxSmoke: 22,
      maxWaves: 5,
      maxTracers: 10,
      maxDecals: 8,
      maxFlashes: 4,
      debrisPerKill: 7,
      smokePerExplosion: 5,
      sparksPerHit: 10,
      enableDecals: true,
      enableSmoke: true,
      enableDebris: true,
    };
  }
  return {
    scale: 1,
    maxBursts: 12,
    burstParticles: 40,
    maxDebris: 28,
    maxSparks: 40,
    maxSmoke: 32,
    maxWaves: 8,
    maxTracers: 14,
    maxDecals: 12,
    maxFlashes: 6,
    debrisPerKill: 10,
    smokePerExplosion: 8,
    sparksPerHit: 14,
    enableDecals: true,
    enableSmoke: true,
    enableDebris: true,
  };
}
