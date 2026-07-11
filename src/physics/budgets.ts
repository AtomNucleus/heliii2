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
    maxBodies: 12,
    maxPerBurst: 4,
    minLifeBeforeSleepCull: 0.45,
    sleepSpeedSq: 0.35,
    maxLifetime: 1.4,
    cullDistanceSq: 90 * 90,
    stepHz: 30,
    enabled: true,
  },
  medium: {
    maxBodies: 24,
    maxPerBurst: 7,
    minLifeBeforeSleepCull: 0.55,
    sleepSpeedSq: 0.25,
    maxLifetime: 1.8,
    cullDistanceSq: 120 * 120,
    stepHz: 45,
    enabled: true,
  },
  high: {
    maxBodies: 40,
    maxPerBurst: 10,
    minLifeBeforeSleepCull: 0.65,
    sleepSpeedSq: 0.18,
    maxLifetime: 2.2,
    cullDistanceSq: 160 * 160,
    stepHz: 60,
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
