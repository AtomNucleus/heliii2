export type {
  ColliderAABB,
  ContactInfo,
  CollisionDebugStats,
  DestructResult,
  HeliCollisionShape,
  ImpactFeedbackEvent,
  ImpactKind,
  NearGroundResult,
  ProceduralColliderSpec,
  ProximityWarning,
  WorldImpactResult,
} from './types';

export { SpatialHash } from './spatialHash';
export {
  extractBuildingColliders,
  buildColliderHash,
} from './buildingColliders';
export {
  HELI_COLLISION,
  CRASH_SPEED,
  SCRAPE_SPEED,
  RESOLVE,
  sphereVsAABB,
  queryDeepestContact,
  resolveWorldImpact,
  collideAndResolve,
  applyNearGroundAssist,
  getLastQueryCount,
} from './resolve';
export { CollisionDebugOverlay, wantCollisionDebug } from './debug';
export { WorldCollision } from './worldCollision';
export { queryProximity, PROXIMITY, getLastProximityQueryCount } from './proximity';
export {
  applyDestructibleHit,
  DebrisSystem,
  DESTRUCT,
} from './destructible';
