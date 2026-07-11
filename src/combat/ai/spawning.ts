/**
 * Fair, deterministic spawn placement and encounter pacing.
 */

import { createRng, type Rng, rngFloat, rngInt } from './rng';
import { type Vec3, v3, distXZ } from './vec';
import { type FormationKind, buildFormation, formationByIndex, slotWorldPosition } from './formations';
import { type DroneRole, roleMixForCount } from './roles';
import { type TurretMode, turretModeMix } from './turretBehavior';

export interface SpawnPoint {
  x: number;
  z: number;
  y?: number;
}

export interface FairSpawnOptions {
  seed: number;
  mapHalf: number;
  playerSpawn: Vec3;
  /** Minimum distance from player start */
  minPlayerDist: number;
  /** Minimum separation between placed points */
  minSeparation: number;
  getGroundHeight: (x: number, z: number) => number;
}

export interface PlannedDepot {
  position: Vec3;
  primary: true;
}

export interface PlannedTurret {
  position: Vec3;
  mode: TurretMode;
}

export interface PlannedDrone {
  position: Vec3;
  role: DroneRole;
  orbitCenter: Vec3;
  orbitRadius: number;
  orbitHeight: number;
  orbitAngle: number;
  formationId: number;
  formationSlot: number;
  formationKind: FormationKind;
}

export interface MissionEncounterPlan {
  depots: PlannedDepot[];
  turrets: PlannedTurret[];
  drones: PlannedDrone[];
  formations: Array<{
    id: number;
    kind: FormationKind;
    anchor: Vec3;
    yaw: number;
  }>;
  seed: number;
}

function isFarEnough(
  x: number,
  z: number,
  points: SpawnPoint[],
  player: Vec3,
  minPlayerDist: number,
  minSeparation: number,
): boolean {
  if (distXZ(v3(x, 0, z), player) < minPlayerDist) return false;
  for (const p of points) {
    if (Math.hypot(x - p.x, z - p.z) < minSeparation) return false;
  }
  return true;
}

/**
 * Place N points with fair spacing using a seeded ring + jitter search.
 */
export function placeFairPoints(
  count: number,
  opts: FairSpawnOptions,
  ringScale = 0.45,
  minSepOverride?: number,
): SpawnPoint[] {
  const rng = createRng(opts.seed);
  const placed: SpawnPoint[] = [];
  const minSep = minSepOverride ?? opts.minSeparation;
  const half = opts.mapHalf;

  // Prefer authored ring slots first for stability
  for (let i = 0; i < count * 3 && placed.length < count; i++) {
    const t = (i / Math.max(count, 1)) * Math.PI * 2 + rngFloat(rng, 0, 0.4);
    const r = half * (ringScale + (i % 3) * 0.08 + rngFloat(rng, -0.03, 0.05));
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;
    if (!isFarEnough(x, z, placed, opts.playerSpawn, opts.minPlayerDist, minSep)) continue;
    placed.push({ x, z, y: opts.getGroundHeight(x, z) });
  }

  // Fallback random annulus
  let guard = 0;
  while (placed.length < count && guard++ < 200) {
    const a = rngFloat(rng, 0, Math.PI * 2);
    const r = half * rngFloat(rng, 0.32, 0.72);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!isFarEnough(x, z, placed, opts.playerSpawn, opts.minPlayerDist, minSep)) continue;
    placed.push({ x, z, y: opts.getGroundHeight(x, z) });
  }

  return placed;
}

export interface EncounterPlanOptions {
  seed?: number;
  mapHalfExtent: number;
  playerSpawn: Vec3;
  getGroundHeight: (x: number, z: number) => number;
  depotCount?: number;
  turretCount?: number;
  droneCount?: number;
}

/**
 * Build a full mission encounter layout (depots, turrets, role drones in formations).
 */
export function planMissionEncounter(opts: EncounterPlanOptions): MissionEncounterPlan {
  const seed = opts.seed ?? 0x4e11_50f7;
  const half = opts.mapHalfExtent * 0.72;
  const depotCount = opts.depotCount ?? 4;
  const turretCount = opts.turretCount ?? 8;
  const droneCount = opts.droneCount ?? 8;

  const fairBase: FairSpawnOptions = {
    seed,
    mapHalf: half,
    playerSpawn: opts.playerSpawn,
    minPlayerDist: 28,
    minSeparation: 22,
    getGroundHeight: opts.getGroundHeight,
  };

  const depotPts = placeFairPoints(depotCount, { ...fairBase, seed: seed ^ 0x1111 }, 0.5, 26);
  const depots: PlannedDepot[] = depotPts.map((p) => ({
    position: v3(p.x, p.y ?? opts.getGroundHeight(p.x, p.z), p.z),
    primary: true as const,
  }));

  const turretPts = placeFairPoints(
    turretCount,
    { ...fairBase, seed: seed ^ 0x2222, minPlayerDist: 22, minSeparation: 16 },
    0.42,
    16,
  );
  const modes = turretModeMix(turretCount);
  const turrets: PlannedTurret[] = turretPts.map((p, i) => ({
    position: v3(p.x, p.y ?? opts.getGroundHeight(p.x, p.z), p.z),
    mode: modes[i]!,
  }));

  // Formation anchors near depots / mid-map
  const formationCount = Math.max(2, Math.ceil(droneCount / 3));
  const roles = roleMixForCount(droneCount);
  const formations: MissionEncounterPlan['formations'] = [];
  const drones: PlannedDrone[] = [];

  const rng = createRng(seed ^ 0x3333);
  let roleIndex = 0;

  for (let f = 0; f < formationCount; f++) {
    const kind = formationByIndex(f + rngInt(rng, 0, 3));
    const members = Math.min(
      3 + (f % 2),
      droneCount - roleIndex,
      Math.ceil((droneCount - roleIndex) / (formationCount - f)),
    );
    if (members <= 0) break;

    // Anchor: prefer near a depot, else ring
    let ax: number;
    let az: number;
    if (depots[f % depots.length]) {
      const d = depots[f % depots.length]!.position;
      const ang = rngFloat(rng, 0, Math.PI * 2);
      const rad = rngFloat(rng, 18, 28);
      ax = d.x + Math.cos(ang) * rad;
      az = d.z + Math.sin(ang) * rad;
    } else {
      const t = (f / formationCount) * Math.PI * 2 + 1.1;
      ax = Math.cos(t) * half * 0.35;
      az = Math.sin(t) * half * 0.35;
    }

    if (distXZ(v3(ax, 0, az), opts.playerSpawn) < 24) {
      ax *= 1.35;
      az *= 1.35;
    }

    const ground = opts.getGroundHeight(ax, az);
    const height = ground + 18 + (f % 4) * 3.5;
    const anchor = v3(ax, height, az);
    const yaw = rngFloat(rng, 0, Math.PI * 2);
    const layout = buildFormation(kind, members, 11 + (f % 3) * 2);

    formations.push({ id: f, kind, anchor, yaw });

    for (let s = 0; s < members; s++) {
      const slot = layout.slots[s]!;
      const pos = slotWorldPosition(anchor, yaw, slot.offset);
      const orbitR = 12 + (s % 3) * 4;
      drones.push({
        position: pos,
        role: roles[roleIndex]!,
        orbitCenter: v3(anchor.x, height, anchor.z),
        orbitRadius: orbitR,
        orbitHeight: height + slot.offset.y,
        orbitAngle: yaw + (s / members) * Math.PI * 2,
        formationId: f,
        formationSlot: s,
        formationKind: kind,
      });
      roleIndex++;
    }
  }

  // Leftover drones as loose scouts
  while (roleIndex < droneCount) {
    const t = (roleIndex / droneCount) * Math.PI * 2;
    const cx = Math.cos(t + 1.1) * half * 0.4;
    const cz = Math.sin(t + 1.1) * half * 0.4;
    const ground = opts.getGroundHeight(cx, cz);
    const height = ground + 20;
    const orbitR = 16;
    drones.push({
      position: v3(cx + orbitR, height, cz),
      role: roles[roleIndex]!,
      orbitCenter: v3(cx, height, cz),
      orbitRadius: orbitR,
      orbitHeight: height,
      orbitAngle: t,
      formationId: -1,
      formationSlot: 0,
      formationKind: 'circle',
    });
    roleIndex++;
  }

  return { depots, turrets, drones, formations, seed };
}

/**
 * Encounter pacing: when to release reinforcement waves during play.
 */
export interface EncounterBeat {
  /** Elapsed time gate */
  atTime: number;
  /** Or primary-destroyed count gate */
  afterPrimariesDestroyed: number;
  label: string;
  droneRoles: DroneRole[];
  formation: FormationKind;
}

export function defaultEncounterBeats(): EncounterBeat[] {
  return [
    {
      atTime: 45,
      afterPrimariesDestroyed: 1,
      label: 'INTERCEPTOR FLIGHT',
      droneRoles: ['interceptor', 'interceptor', 'scout'],
      formation: 'vic',
    },
    {
      atTime: 90,
      afterPrimariesDestroyed: 2,
      label: 'GUNSHIP WING',
      droneRoles: ['gunship', 'escort', 'escort'],
      formation: 'wedge',
    },
    {
      atTime: 140,
      afterPrimariesDestroyed: 3,
      label: 'STRIKER RUN',
      droneRoles: ['striker', 'striker', 'interceptor', 'scout'],
      formation: 'diamond',
    },
  ];
}

export function pickReinforceSpawnAnchor(
  rng: Rng,
  player: Vec3,
  mapHalf: number,
  minDist = 40,
  maxDist = 70,
): Vec3 {
  for (let i = 0; i < 24; i++) {
    const a = rngFloat(rng, 0, Math.PI * 2);
    const r = rngFloat(rng, minDist, maxDist);
    const x = player.x + Math.cos(a) * r;
    const z = player.z + Math.sin(a) * r;
    if (Math.abs(x) < mapHalf * 0.85 && Math.abs(z) < mapHalf * 0.85) {
      return v3(x, 0, z);
    }
  }
  return v3(player.x + minDist, 0, player.z);
}
