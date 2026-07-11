/**
 * Quality-scaled draw budgets for the Fruzer environment layer.
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
  flags: number;
  blinkLights: number;
  smokeColumns: number;
  birds: number;
  animate: boolean;
}

const BUDGETS: Record<EnvQualityTier, EnvBudget> = {
  low: {
    tier: 'low',
    buildings: 28,
    rooftopProps: 20,
    trees: 40,
    bushes: 36,
    streetLamps: 18,
    barriers: 24,
    crates: 20,
    cones: 16,
    groundPatches: 30,
    rubble: 24,
    landmarks: 4,
    combatSpaces: 4,
    flags: 4,
    blinkLights: 10,
    smokeColumns: 2,
    birds: 4,
    animate: true,
  },
  medium: {
    tier: 'medium',
    buildings: 48,
    rooftopProps: 40,
    trees: 70,
    bushes: 60,
    streetLamps: 32,
    barriers: 40,
    crates: 36,
    cones: 28,
    groundPatches: 55,
    rubble: 42,
    landmarks: 6,
    combatSpaces: 5,
    flags: 7,
    blinkLights: 18,
    smokeColumns: 3,
    birds: 8,
    animate: true,
  },
  high: {
    tier: 'high',
    buildings: 72,
    rooftopProps: 64,
    trees: 110,
    bushes: 90,
    streetLamps: 48,
    barriers: 56,
    crates: 52,
    cones: 40,
    groundPatches: 80,
    rubble: 64,
    landmarks: 8,
    combatSpaces: 5,
    flags: 10,
    blinkLights: 28,
    smokeColumns: 4,
    birds: 12,
    animate: true,
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
