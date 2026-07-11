/**
 * Quality-scaled draw budgets for the military-island environment layer.
 * Counts are instance caps — actual placed count may be lower.
 */

export type EnvQualityTier = 'low' | 'medium' | 'high';

export interface EnvBudget {
  tier: EnvQualityTier;
  buildings: number;
  rooftopProps: number;
  trees: number;
  bushes: number;
  streetLamps: number;
  barriers: number;
  crates: number;
  cones: number;
  groundPatches: number;
  rubble: number;
  landmarks: number;
  combatSpaces: number;
  compounds: number;
  navMarkers: number;
  oceanDetail: number;
  flags: number;
  blinkLights: number;
  smokeColumns: number;
  birds: number;
  animate: boolean;
  /** Soften Fruzer underlay brightness (0..1, lower = more subdued) */
  fruzerUnderlay: number;
}

const BUDGETS: Record<EnvQualityTier, EnvBudget> = {
  low: {
    tier: 'low',
    buildings: 22,
    rooftopProps: 16,
    trees: 36,
    bushes: 28,
    streetLamps: 14,
    barriers: 18,
    crates: 16,
    cones: 12,
    groundPatches: 24,
    rubble: 18,
    landmarks: 5,
    combatSpaces: 4,
    compounds: 3,
    navMarkers: 12,
    oceanDetail: 4,
    flags: 4,
    blinkLights: 10,
    smokeColumns: 2,
    birds: 4,
    animate: true,
    fruzerUnderlay: 0.42,
  },
  medium: {
    tier: 'medium',
    buildings: 40,
    rooftopProps: 32,
    trees: 64,
    bushes: 52,
    streetLamps: 28,
    barriers: 34,
    crates: 30,
    cones: 22,
    groundPatches: 48,
    rubble: 36,
    landmarks: 7,
    combatSpaces: 5,
    compounds: 4,
    navMarkers: 18,
    oceanDetail: 6,
    flags: 7,
    blinkLights: 18,
    smokeColumns: 3,
    birds: 8,
    animate: true,
    fruzerUnderlay: 0.48,
  },
  high: {
    tier: 'high',
    buildings: 58,
    rooftopProps: 48,
    trees: 96,
    bushes: 78,
    streetLamps: 40,
    barriers: 48,
    crates: 42,
    cones: 32,
    groundPatches: 68,
    rubble: 52,
    landmarks: 8,
    combatSpaces: 6,
    compounds: 5,
    navMarkers: 24,
    oceanDetail: 8,
    flags: 10,
    blinkLights: 26,
    smokeColumns: 4,
    birds: 12,
    animate: true,
    fruzerUnderlay: 0.55,
  },
};

export function getEnvBudget(tier: EnvQualityTier | string | undefined): EnvBudget {
  if (tier === 'low' || tier === 'medium' || tier === 'high') {
    return { ...BUDGETS[tier] };
  }
  return { ...BUDGETS.medium };
}

export function detectEnvTier(): EnvQualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}
