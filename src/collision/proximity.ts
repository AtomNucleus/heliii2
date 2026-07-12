import * as THREE from 'three';
import type { HeliCollisionShape, ProximityWarning } from './types';
import type { SpatialHash } from './spatialHash';
import { HELI_COLLISION } from './resolve';

/** Distance bands (meters from sphere surface). */
export const PROXIMITY = {
  caution: 22,
  warning: 12,
  critical: 5.5,
  /** Look-ahead along velocity (seconds of travel, clamped). */
  lookAheadSec: 0.55,
  lookAheadMin: 6,
  lookAheadMax: 28,
  /** Half-angle of the "ahead" cone (radians). */
  aheadCone: 0.85,
} as const;

const _center = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _queryIds: number[] = [];
const _emptyDir = new THREE.Vector3(0, 0, 1);

function emptyWarning(): ProximityWarning {
  return {
    level: 0,
    distance: Infinity,
    direction: _emptyDir.clone(),
    colliderId: -1,
    kind: 'none',
    ahead: false,
  };
}

function levelForDistance(dist: number): 0 | 1 | 2 | 3 {
  if (dist <= PROXIMITY.critical) return 3;
  if (dist <= PROXIMITY.warning) return 2;
  if (dist <= PROXIMITY.caution) return 1;
  return 0;
}

/**
 * Closest-point distance from a sphere center to an AABB surface.
 * Negative when the center is inside the box.
 */
function signedDistanceToAABB(
  cx: number,
  cy: number,
  cz: number,
  box: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  },
  outClosest: THREE.Vector3,
): number {
  const qx = THREE.MathUtils.clamp(cx, box.minX, box.maxX);
  const qy = THREE.MathUtils.clamp(cy, box.minY, box.maxY);
  const qz = THREE.MathUtils.clamp(cz, box.minZ, box.maxZ);
  outClosest.set(qx, qy, qz);

  const dx = cx - qx;
  const dy = cy - qy;
  const dz = cz - qz;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq > 1e-10) return Math.sqrt(distSq);

  // Inside: negative distance to nearest face
  const toMinX = cx - box.minX;
  const toMaxX = box.maxX - cx;
  const toMinY = cy - box.minY;
  const toMaxY = box.maxY - cy;
  const toMinZ = cz - box.minZ;
  const toMaxZ = box.maxZ - cz;
  return -Math.min(toMinX, toMaxX, toMinY, toMaxY, toMinZ, toMaxZ);
}

/**
 * Browser-cheap obstacle proximity: spatial-hash query around the craft
 * plus a short look-ahead along velocity. Suitable for HUD / audio cues.
 */
export function queryProximity(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  hash: SpatialHash,
  shape: HeliCollisionShape = HELI_COLLISION,
): ProximityWarning {
  _center.set(position.x, position.y + shape.centerY, position.z);
  const speed = velocity.length();
  const look =
    speed > 0.5
      ? THREE.MathUtils.clamp(
          speed * PROXIMITY.lookAheadSec,
          PROXIMITY.lookAheadMin,
          PROXIMITY.lookAheadMax,
        )
      : PROXIMITY.lookAheadMin;

  if (speed > 0.5) _velDir.copy(velocity).multiplyScalar(1 / speed);
  else _velDir.set(0, 0, 1);

  const pad = shape.radius + look + 2;
  const count = hash.queryIds(
    _center.x - pad,
    _center.x + pad,
    _center.z - pad,
    _center.z + pad,
    _queryIds,
  );

  let bestDist = Infinity;
  let bestId = -1;
  let bestKind: ProximityWarning['kind'] = 'none';
  let bestAhead = false;
  let bestTag: string | undefined;
  _dir.set(0, 0, 1);

  for (let i = 0; i < count; i++) {
    const box = hash.getCollider(_queryIds[i]);
    if (!box) continue;
    if (box.tag === 'camera-perimeter') continue;

    // Cheap Y reject against look-ahead capsule
    if (_center.y + pad < box.minY || _center.y - pad > box.maxY) continue;

    const signed = signedDistanceToAABB(
      _center.x,
      _center.y,
      _center.z,
      box,
      _closest,
    );
    const surfaceDist = signed - shape.radius;
    if (surfaceDist >= bestDist) continue;

    // Direction toward obstacle (from heli to closest point)
    _dir.set(
      _closest.x - _center.x,
      _closest.y - _center.y,
      _closest.z - _center.z,
    );
    const len = _dir.length();
    if (len > 1e-5) _dir.multiplyScalar(1 / len);
    else _dir.copy(_velDir);

    const aheadDot = _dir.dot(_velDir);
    const ahead = aheadDot > Math.cos(PROXIMITY.aheadCone);

    // Prefer obstacles in the flight path when distances are similar
    const score = surfaceDist - (ahead ? 1.8 : 0);
    const bestScore = bestDist - (bestAhead ? 1.8 : 0);
    if (score >= bestScore) continue;

    bestDist = surfaceDist;
    bestId = box.id;
    bestKind = box.kind;
    bestAhead = ahead;
    bestTag = box.tag;
  }

  if (!Number.isFinite(bestDist) || bestId < 0) return emptyWarning();

  // Recompute direction for the winner
  const winner = hash.getCollider(bestId)!;
  signedDistanceToAABB(_center.x, _center.y, _center.z, winner, _closest);
  _dir.set(
    _closest.x - _center.x,
    _closest.y - _center.y,
    _closest.z - _center.z,
  );
  if (_dir.lengthSq() > 1e-8) _dir.normalize();
  else _dir.copy(_velDir);

  const dist = Math.max(0, bestDist);
  return {
    level: levelForDistance(dist),
    distance: dist,
    direction: _dir.clone(),
    colliderId: bestId,
    kind: bestKind,
    ahead: bestAhead,
    tag: bestTag,
  };
}

/** Last broadphase size from proximity query (debug). */
export function getLastProximityQueryCount(): number {
  return _queryIds.length;
}
