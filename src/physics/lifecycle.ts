import type { DebrisPhysicsBudget } from './budgets';

export interface FragmentLifecycleState {
  age: number;
  maxLife: number;
  speedSq: number;
  sleeping: boolean;
  /** Squared distance from optional follow focus; Infinity if unknown. */
  distanceSq: number;
}

/**
 * Decide whether a debris body should be removed this frame.
 * Pure policy shared by Rapier and kinematic paths.
 */
export function shouldCullFragment(
  state: FragmentLifecycleState,
  budget: Pick<
    DebrisPhysicsBudget,
    'minLifeBeforeSleepCull' | 'sleepSpeedSq' | 'maxLifetime' | 'cullDistanceSq'
  >,
): boolean {
  if (state.age >= state.maxLife) return true;
  if (state.age >= budget.maxLifetime) return true;
  if (budget.cullDistanceSq > 0 && state.distanceSq > budget.cullDistanceSq) return true;
  if (
    state.age >= budget.minLifeBeforeSleepCull &&
    (state.sleeping || state.speedSq <= budget.sleepSpeedSq)
  ) {
    return true;
  }
  return false;
}

/**
 * Opacity fade factor from remaining life (1 → 0).
 */
export function fragmentOpacity(age: number, maxLife: number): number {
  if (maxLife <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - age / maxLife));
}

/**
 * When over budget after a quality drop, how many oldest bodies to drop.
 */
export function excessBodiesToCull(activeCount: number, maxBodies: number): number {
  return Math.max(0, activeCount - Math.max(0, maxBodies));
}
