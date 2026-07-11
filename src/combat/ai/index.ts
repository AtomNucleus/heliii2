/**
 * Combat AI public surface.
 *
 * API notes (combat-AI upgrade):
 * - MoveIntent gained 'formation' | 'intercept' | 'flank'
 * - SteeringInput gained formationSlot, formationPull, healthRatio, interceptBias, flankBias
 * - New modules: waves, elite, pool; pursuit adds aimFlak / aimFair / formationSlotWorld
 * - EnemySystem public methods preserved; tickEncounterPacing now pressure/budget-aware
 * - Enemy gained optional eliteId, deadFor, interceptBias, flankBias, formationPull
 */

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

export {
  steerDrone,
  aimWithLead,
  aimFlak,
  aimFair,
  shouldEvade,
  formationSlotWorld,
} from './pursuit';
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

export {
  ROLE_PACKS,
  rolePack,
  compileWaveSpecs,
  defaultWaveSheet,
  createWaveRuntime,
  resetWaveRuntime,
  evaluateWaveGate,
  pickNextWave,
  markWaveFired,
  pickReinforceRoles,
  reinforceFormationForPressure,
  shouldReclaimCorpse,
} from './waves';
export type {
  WaveSpec,
  WaveReleaseDecision,
  WaveRuntimeState,
} from './waves';

export {
  ELITE_PROFILES,
  getEliteProfile,
  finaleWaveSpec,
  finaleEliteRoles,
  shouldReleaseFinale,
} from './elite';
export type { EliteProfile } from './elite';

export {
  ObjectPool,
  createVec3Pool,
  createEnemySlotPool,
} from './pool';
export type { PoolStats, EnemySlotHandle } from './pool';
