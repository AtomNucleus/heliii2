export { combatBudgetFromQuality, estimateCombatFxPeak, type CombatFxBudget } from './budgets';
export { SlotPool } from './pool';
export { BurstSystem } from './bursts';
export { DebrisSystem } from './debris';
export { SparkSystem } from './sparks';
export { SmokeFireSystem } from './smokeFire';
export { ShockwaveSystem } from './shockwaves';
export { TracerSystem } from './tracers';
export { ProjectileTrailSystem, type TrailKind } from './trails';
export { DecalSystem } from './decals';
export {
  ImpactSystem,
  inferImpactSurface,
  type ImpactSurface,
} from './impacts';
export { EmberSystem } from './embers';
export { FlashLightSystem } from './flashLights';
export { HullDamageSystem } from './hullDamage';
export {
  CameraImpulseSystem,
  type CameraImpulseSample,
} from './cameraImpulse';
export { FinaleSystem, type FinaleKind, type FinaleCallbacks } from './finale';
export { CombatFx, type ProjectileTrailHandle } from './CombatFx';
