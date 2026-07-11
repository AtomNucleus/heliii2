export {
  allocateFragmentSlots,
  debrisPhysicsBudgetFromTier,
  estimateDebrisPhysicsPeak,
  type DebrisPhysicsBudget,
} from './budgets';

export {
  createSeededRng,
  generateFragmentBurst,
  type FragmentBurstInput,
  type FragmentSpec,
} from './fragments';

export {
  excessBodiesToCull,
  fragmentOpacity,
  shouldCullFragment,
  type FragmentLifecycleState,
} from './lifecycle';

export { initRapier, resetRapierInitCache, type RapierInitOutcome } from './rapierInit';

export {
  DebrisPhysicsWorld,
  ensureSharedDebrisPhysics,
  getSharedDebrisPhysics,
  setSharedDebrisPhysics,
  type DebrisPhysicsOptions,
} from './debrisWorld';
