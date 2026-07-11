/**
 * Compatibility shim — combat VFX modules live in src/effects/combat.
 * Prefer importing from '../effects/combat' or the CombatEffects facade.
 */
export {
  combatBudgetFromQuality,
  estimateCombatFxPeak,
  type CombatFxBudget,
  SlotPool,
  BurstSystem,
  DebrisSystem,
  SparkSystem,
  SmokeFireSystem,
  ShockwaveSystem,
  TracerSystem,
  ProjectileTrailSystem,
  DecalSystem,
  ImpactSystem,
  inferImpactSurface,
  type ImpactSurface,
  EmberSystem,
  FlashLightSystem,
  HullDamageSystem,
  CameraImpulseSystem,
  type CameraImpulseSample,
  FinaleSystem,
  type FinaleKind,
  CombatFx,
} from '../../effects/combat';
