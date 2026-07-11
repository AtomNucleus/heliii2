export { createRng, hashSeed, rngFloat, rngInt, rngPick, rngShuffle } from './rng';
export type { Rng } from './rng';

export { v3, dist, distXZ, clamp } from './vec';
export type { Vec3 } from './vec';

export {
  DRONE_ROLES,
  roleMixForCount,
  getDroneRole,
} from './roles';
export type { DroneRole, DroneRoleProfile } from './roles';

export {
  TURRET_MODES,
  turretModeMix,
  getTurretMode,
  sweepYawOffset,
  rotateYaw,
} from './turretBehavior';
export type { TurretMode, TurretModeProfile } from './turretBehavior';

export {
  buildFormation,
  slotWorldPosition,
  formationByIndex,
  formationKinds,
} from './formations';
export type { FormationKind, FormationLayout, FormationSlot } from './formations';

export { steerDrone, aimWithLead, shouldEvade } from './pursuit';
export type { MoveIntent, SteeringInput, SteeringResult } from './pursuit';

export {
  createTelegraphState,
  defaultTelegraphConfig,
  updateTelegraph,
  isTelegraphVisible,
} from './telegraph';
export type {
  TelegraphPhase,
  TelegraphConfig,
  TelegraphState,
  TelegraphUpdateResult,
} from './telegraph';

export {
  DifficultyDirector,
  DEFAULT_DIRECTOR_CONFIG,
  reinforceWaveSize,
} from './director';
export type {
  DirectorSnapshot,
  DirectorBeat,
  DirectorInput,
  DirectorConfig,
} from './director';

export {
  placeFairPoints,
  planMissionEncounter,
  defaultEncounterBeats,
  pickReinforceSpawnAnchor,
} from './spawning';
export type {
  SpawnPoint,
  FairSpawnOptions,
  MissionEncounterPlan,
  PlannedDepot,
  PlannedTurret,
  PlannedDrone,
  EncounterBeat,
  EncounterPlanOptions,
} from './spawning';
