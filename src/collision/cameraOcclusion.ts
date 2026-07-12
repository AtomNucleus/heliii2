import * as THREE from 'three';
import type { ColliderAABB } from './types';
import type { SpatialHash } from './spatialHash';
import { sphereVsAABB } from './resolve';

/** Chase-camera probe against building/prop AABBs (spring-arm style). */
export const CAMERA_OCCLUSION = {
  /** Sphere radius around the camera for wall clearance. */
  radius: 1.35,
  /** Extra pull-back from the hit surface along the arm. */
  skin: 0.45,
  /** Never pull closer than this to the pivot (m). */
  minDistance: 5.5,
  /** Inflate query AABB along the arm segment. */
  queryPad: 1.6,
} as const;

const _queryIds: number[] = [];
const _normal = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Slab-method ray vs AABB. Returns entry t along the ray, or null on miss.
 * Ray is origin + t * dir where dir is NOT required to be unit length;
 * t is in the same units as dir (segment parameter when dir = to - from).
 */
export function rayAABBEnterT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: ColliderAABB,
  inflate = 0,
): number | null {
  const minX = box.minX - inflate;
  const minY = box.minY - inflate;
  const minZ = box.minZ - inflate;
  const maxX = box.maxX + inflate;
  const maxY = box.maxY + inflate;
  const maxZ = box.maxZ + inflate;

  let tMin = 0;
  let tMax = 1;

  // X
  if (Math.abs(dx) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Y
  if (Math.abs(dy) < 1e-12) {
    if (oy < minY || oy > maxY) return null;
  } else {
    let t1 = (minY - oy) / dy;
    let t2 = (maxY - oy) / dy;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Z
  if (Math.abs(dz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Origin already inside inflated box — entry at 0
  if (tMin <= 0 && tMax >= 0) return 0;
  if (tMin < 0 || tMin > 1) return null;
  return tMin;
}

export interface CameraOcclusionResult {
  /** Desired camera position after occlusion (mutates `desired` in place when hit). */
  hit: boolean;
  /** Segment parameter of the first hit (0..1), or 1 when clear. */
  t: number;
}

/**
 * Pull `desired` along pivot→desired so the camera sphere stays clear of AABBs.
 * Also pushes out if the final point still overlaps (corner cases / lag).
 */
export function resolveCameraOcclusion(
  pivot: THREE.Vector3,
  desired: THREE.Vector3,
  hash: SpatialHash,
  radius: number = CAMERA_OCCLUSION.radius,
  skin: number = CAMERA_OCCLUSION.skin,
  minDistance: number = CAMERA_OCCLUSION.minDistance,
): CameraOcclusionResult {
  _dir.copy(desired).sub(pivot);
  const armLen = _dir.length();
  if (armLen < 1e-4) {
    return { hit: false, t: 1 };
  }

  const pad = radius + CAMERA_OCCLUSION.queryPad;
  const minX = Math.min(pivot.x, desired.x) - pad;
  const maxX = Math.max(pivot.x, desired.x) + pad;
  const minZ = Math.min(pivot.z, desired.z) - pad;
  const maxZ = Math.max(pivot.z, desired.z) + pad;
  const count = hash.queryIds(minX, maxX, minZ, maxZ, _queryIds);

  let bestT = 1;
  let hit = false;
  const inflate = radius;

  for (let i = 0; i < count; i++) {
    const box = hash.getCollider(_queryIds[i]);
    if (!box) continue;
    // Cheap Y reject on inflated bounds
    const yMin = Math.min(pivot.y, desired.y) - inflate;
    const yMax = Math.max(pivot.y, desired.y) + inflate;
    if (yMax < box.minY - inflate || yMin > box.maxY + inflate) continue;

    const t = rayAABBEnterT(
      pivot.x,
      pivot.y,
      pivot.z,
      _dir.x,
      _dir.y,
      _dir.z,
      box,
      inflate,
    );
    if (t === null) continue;
    if (t < bestT) {
      bestT = t;
      hit = true;
    }
  }

  if (hit) {
    const skinT = skin / armLen;
    const minT = Math.min(1, minDistance / armLen);
    let t = bestT - skinT;
    if (t < minT) t = minT;
    if (t > 1) t = 1;
    // If the first hit is extremely close to the pivot, stay at minDistance
    // along the arm rather than diving into the wall at t=0.
    if (bestT <= skinT && armLen > minDistance) {
      t = minT;
    }
    desired.copy(pivot).addScaledVector(_dir, t);
    bestT = t;
  }

  // Safety: push out if still overlapping (e.g. pivot itself near a wall)
  pushCameraOutOfSolids(desired, hash, radius);

  return { hit, t: hit ? bestT : 1 };
}

/** Sphere push-out against nearby AABBs so the camera never rests inside geometry. */
export function pushCameraOutOfSolids(
  position: THREE.Vector3,
  hash: SpatialHash,
  radius: number = CAMERA_OCCLUSION.radius,
): boolean {
  const pad = radius + 0.5;
  const count = hash.queryIds(
    position.x - pad,
    position.x + pad,
    position.z - pad,
    position.z + pad,
    _queryIds,
  );

  let pushed = false;
  for (let i = 0; i < count; i++) {
    const box = hash.getCollider(_queryIds[i]);
    if (!box) continue;
    if (position.y + radius < box.minY || position.y - radius > box.maxY) continue;

    const hit = sphereVsAABB(
      position.x,
      position.y,
      position.z,
      radius,
      box,
      _normal,
    );
    if (!hit.hit || hit.penetration <= 0.001) continue;
    position.addScaledVector(_normal, hit.penetration + CAMERA_OCCLUSION.skin * 0.35);
    pushed = true;
  }
  return pushed;
}

/**
 * Soft-clamp camera XZ inside the playable world bound so edge turns
 * don't park the lens past the map rim into perimeter geometry.
 */
export function clampCameraToWorldBound(
  position: THREE.Vector3,
  worldBound: number,
  margin = 2.5,
): void {
  const limit = Math.max(8, worldBound - margin);
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
}

/** Scratch helper: copy pivot from heli for occlusion rays. */
export function setCameraPivot(
  out: THREE.Vector3,
  heliPos: THREE.Vector3,
  lookHeight: number,
): THREE.Vector3 {
  out.copy(heliPos);
  out.y += lookHeight;
  return out;
}
