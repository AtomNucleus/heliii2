import type { QualityTier } from '../effects/quality';

/** Caps for Rapier-backed visual debris (not authoritative heli collision). */
export interface DebrisPhysicsBudget {
  /** Hard cap on simultaneous dynamic bodies. */
  maxBodies: number;
  /** Max fragments spawned per destruction event. */
  maxPerBurst: number;
  /** Seconds before a body is eligible for sleep-based cull. */
  minLifeBeforeSleepCull: number;
  /** Speed² below which a body is considered resting for cull. */
  sleepSpeedSq: number;
  /** Absolute max lifetime (seconds) regardless of motion. */
  maxLifetime: number;
  /** Cull distance² from follow focus (0 = disabled). */
  cullDistanceSq: number;
  /** Fixed physics substep target (Hz). */
  stepHz: number;
  /** Whether Rapier stepping is enabled for this tier. */
  enabled: boolean;
}

const TIER_BUDGETS: Record<QualityTier, DebrisPhysicsBudget> = {
  low: {
    maxBodies: 8,
    maxPerBurst: 3,
    minLifeBeforeSleepCull: 0.4,
    sleepSpeedSq: 0.4,
    maxLifetime: 1.1,
    cullDistanceSq: 70 * 70,
    stepHz: 30,
    enabled: false,
  },
  medium: {
    maxBodies: 16,
    maxPerBurst: 5,
    minLifeBeforeSleepCull: 0.5,
    sleepSpeedSq: 0.3,
    maxLifetime: 1.5,
    cullDistanceSq: 100 * 100,
    stepHz: 40,
    enabled: false,
  },
  high: {
    maxBodies: 28,
    maxPerBurst: 8,
    minLifeBeforeSleepCull: 0.6,
    sleepSpeedSq: 0.2,
    maxLifetime: 1.9,
    cullDistanceSq: 140 * 140,
    stepHz: 50,
    enabled: true,
  },
};

export function debrisPhysicsBudgetFromTier(tier: QualityTier): DebrisPhysicsBudget {
  return { ...TIER_BUDGETS[tier] };
}

/**
 * How many new fragments may spawn given current occupancy and burst request.
 * Pure policy — unit-testable without Rapier.
 */
export function allocateFragmentSlots(
  requested: number,
  activeCount: number,
  budget: Pick<DebrisPhysicsBudget, 'maxBodies' | 'maxPerBurst'>,
): number {
  if (requested <= 0 || budget.maxBodies <= 0 || budget.maxPerBurst <= 0) return 0;
  const byBurst = Math.min(requested, budget.maxPerBurst);
  const free = Math.max(0, budget.maxBodies - activeCount);
  return Math.min(byBurst, free);
}

/** Peak concurrent body estimate for diagnostics. */
export function estimateDebrisPhysicsPeak(budget: DebrisPhysicsBudget): number {
  return budget.enabled ? budget.maxBodies : 0;
}
