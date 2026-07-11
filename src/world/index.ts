export { EnvironmentLayer, createEnvironmentLayer } from './environmentLayer';
export type {
  CombatSpace,
  DistrictInfo,
  EnvBudget,
  EnvQualityTier,
  EnvironmentLayerOptions,
} from './environmentLayer';
export { getEnvBudget, detectEnvTier } from './envBudget';
export { createEnvMaterialKit, ENV_PALETTE, makePBR, makeEmissivePBR } from './materials';
export type { EnvMaterialKit } from './materials';
