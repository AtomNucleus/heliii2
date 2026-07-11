/**
 * Distinct drone combat roles — stats + preferred movement/fire profiles.
 */

export type DroneRole = 'interceptor' | 'gunship' | 'scout' | 'escort' | 'striker';

export interface DroneRoleProfile {
  role: DroneRole;
  /** Display tint (emissive-ish hex) */
  tint: number;
  health: number;
  scoreValue: number;
  fireCooldown: number;
  boltDamage: number;
  engageRange: number;
  minRange: number;
  /** Orbit / pursuit speed scale */
  moveSpeed: number;
  /** Preferred standoff distance */
  preferredRange: number;
  /** Lead time when aiming */
  leadTime: number;
  /** Telegraph windup before firing (seconds) */
  telegraphDuration: number;
  /** How aggressively to chase (0–1) */
  pursuitWeight: number;
  /** How eagerly to break off when pressured (0–1) */
  evadeWeight: number;
  /** Formation slot preference bias */
  formationAffinity: number;
  /** Cut ahead of player velocity (0–1) */
  interceptBias: number;
  /** Wide flanking arcs (0–1) */
  flankBias: number;
}

export const DRONE_ROLES: Record<DroneRole, DroneRoleProfile> = {
  interceptor: {
    role: 'interceptor',
    tint: 0xff5533,
    health: 36,
    scoreValue: 480,
    fireCooldown: 1.15,
    boltDamage: 10,
    engageRange: 48,
    minRange: 8,
    moveSpeed: 1.35,
    preferredRange: 22,
    leadTime: 0.28,
    telegraphDuration: 0.35,
    pursuitWeight: 0.9,
    evadeWeight: 0.35,
    formationAffinity: 0.4,
    interceptBias: 0.9,
    flankBias: 0.25,
  },
  gunship: {
    role: 'gunship',
    tint: 0xaa44ff,
    health: 58,
    scoreValue: 520,
    fireCooldown: 1.85,
    boltDamage: 16,
    engageRange: 68,
    minRange: 14,
    moveSpeed: 0.72,
    preferredRange: 42,
    leadTime: 0.45,
    telegraphDuration: 0.55,
    pursuitWeight: 0.45,
    evadeWeight: 0.25,
    formationAffinity: 0.55,
    interceptBias: 0.15,
    flankBias: 0.2,
  },
  scout: {
    role: 'scout',
    tint: 0x44ddaa,
    health: 28,
    scoreValue: 380,
    fireCooldown: 2.1,
    boltDamage: 8,
    engageRange: 78,
    minRange: 18,
    moveSpeed: 1.15,
    preferredRange: 55,
    leadTime: 0.2,
    telegraphDuration: 0.7,
    pursuitWeight: 0.25,
    evadeWeight: 0.85,
    formationAffinity: 0.2,
    interceptBias: 0.2,
    flankBias: 0.65,
  },
  escort: {
    role: 'escort',
    tint: 0x4488ff,
    health: 48,
    scoreValue: 440,
    fireCooldown: 1.55,
    boltDamage: 12,
    engageRange: 52,
    minRange: 10,
    moveSpeed: 0.95,
    preferredRange: 28,
    leadTime: 0.32,
    telegraphDuration: 0.4,
    pursuitWeight: 0.55,
    evadeWeight: 0.5,
    formationAffinity: 0.85,
    interceptBias: 0.3,
    flankBias: 0.35,
  },
  striker: {
    role: 'striker',
    tint: 0xffaa22,
    health: 44,
    scoreValue: 560,
    fireCooldown: 1.4,
    boltDamage: 14,
    engageRange: 60,
    minRange: 6,
    moveSpeed: 1.2,
    preferredRange: 18,
    leadTime: 0.38,
    telegraphDuration: 0.85,
    pursuitWeight: 0.75,
    evadeWeight: 0.4,
    formationAffinity: 1,
    interceptBias: 0.55,
    flankBias: 0.75,
  },
};

/** Default role mix for a mission of N drones (deterministic order). */
export function roleMixForCount(count: number): DroneRole[] {
  const pattern: DroneRole[] = [
    'escort',
    'gunship',
    'interceptor',
    'scout',
    'striker',
    'escort',
    'interceptor',
    'gunship',
    'striker',
    'scout',
  ];
  const out: DroneRole[] = [];
  for (let i = 0; i < count; i++) out.push(pattern[i % pattern.length]!);
  return out;
}

export function getDroneRole(role: DroneRole): DroneRoleProfile {
  return DRONE_ROLES[role];
}
