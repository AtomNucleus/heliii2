import type { QualitySettings } from '../quality';

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
  maxTrails: number;
  trailSegments: number;
  maxDecals: number;
  maxFlashes: number;
  maxFlashLights: number;
  maxEmbers: number;
  maxImpacts: number;
  debrisPerKill: number;
  smokePerExplosion: number;
  sparksPerHit: number;
  enableDecals: boolean;
  enableSmoke: boolean;
  enableDebris: boolean;
  enableFlashLights: boolean;
  enableHullDamage: boolean;
  enableFinale: boolean;
  cameraImpulseScale: number;
}

export function combatBudgetFromQuality(q: QualitySettings): CombatFxBudget {
  const s = q.particleScale;
  if (q.tier === 'low' || s < 0.55) {
    return {
      scale: Math.max(0.4, s),
      maxBursts: 5,
      burstParticles: 16,
      maxDebris: 8,
      maxSparks: 14,
      maxSmoke: 10,
      maxWaves: 3,
      maxTracers: 5,
      maxTrails: 4,
      trailSegments: 8,
      maxDecals: 3,
      maxFlashes: 2,
      maxFlashLights: 0,
      maxEmbers: 2,
      maxImpacts: 6,
      debrisPerKill: 3,
      smokePerExplosion: 2,
      sparksPerHit: 5,
      enableDecals: true,
      enableSmoke: true,
      enableDebris: true,
      enableFlashLights: false,
      enableHullDamage: true,
      enableFinale: false,
      cameraImpulseScale: 0.55,
    };
  }
  if (q.tier === 'medium' || s < 0.9) {
    return {
      scale: s,
      maxBursts: 8,
      burstParticles: 26,
      maxDebris: 16,
      maxSparks: 24,
      maxSmoke: 20,
      maxWaves: 5,
      maxTracers: 9,
      maxTrails: 7,
      trailSegments: 14,
      maxDecals: 7,
      maxFlashes: 4,
      maxFlashLights: 2,
      maxEmbers: 4,
      maxImpacts: 10,
      debrisPerKill: 6,
      smokePerExplosion: 5,
      sparksPerHit: 9,
      enableDecals: true,
      enableSmoke: true,
      enableDebris: true,
      enableFlashLights: true,
      enableHullDamage: true,
      enableFinale: true,
      cameraImpulseScale: 0.8,
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
    maxTrails: 10,
    trailSegments: 22,
    maxDecals: 12,
    maxFlashes: 6,
    maxFlashLights: 4,
    maxEmbers: 6,
    maxImpacts: 14,
    debrisPerKill: 10,
    smokePerExplosion: 8,
    sparksPerHit: 14,
    enableDecals: true,
    enableSmoke: true,
    enableDebris: true,
    enableFlashLights: true,
    enableHullDamage: true,
    enableFinale: true,
    cameraImpulseScale: 1,
  };
}

/** Approximate peak concurrent particle/mesh counts for profiling. */
export function estimateCombatFxPeak(budget: CombatFxBudget): {
  particles: number;
  meshes: number;
  lights: number;
} {
  return {
    particles:
      budget.maxBursts * budget.burstParticles +
      budget.maxEmbers * 24 +
      budget.maxSparks,
    meshes:
      budget.maxDebris +
      budget.maxSmoke +
      budget.maxWaves +
      budget.maxTracers +
      budget.maxTrails +
      budget.maxDecals +
      budget.maxImpacts +
      budget.maxFlashes,
    lights: budget.maxFlashLights,
  };
}
