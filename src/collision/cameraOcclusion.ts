import * as THREE from 'three';
import type { ColliderAABB } from './types';
import type { SpatialHash } from './spatialHash';
import { sphereVsAABB } from './resolve';

/** Chase-camera probe against building/prop AABBs (spring-arm style). */
export const CAMERA_OCCLUSION = {
  /** Sphere radius around the camera for wall clearance. */
  radius: 1.5,
  /** Extra pull-back from the hit surface along the arm. */
  skin: 0.55,
  /**
   * Preferred minimum arm length when the path is clear.
   * NEVER used to push the camera past a hit — that caused tunneling.
   */
  minDistance: 3.5,
  /** Inflate query AABB along the arm segment. */
  queryPad: 2,
  /** Steps when walking the arm back out of solids. */
  clearSteps: 24,
} as const;

const _queryIds: number[] = [];
const _normal = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _unit = new THREE.Vector3();
const _probe = new THREE.Vector3();

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

function sphereOverlapsAny(
  x: number,
  y: number,
  z: number,
  radius: number,
  hash: SpatialHash,
): boolean {
  const pad = radius + 0.35;
  const count = hash.queryIds(x - pad, x + pad, z - pad, z + pad, _queryIds);
  for (let i = 0; i < count; i++) {
    const box = hash.getCollider(_queryIds[i]);
    if (!box) continue;
    if (y + radius < box.minY || y - radius > box.maxY) continue;
    const hit = sphereVsAABB(x, y, z, radius, box, _normal);
    if (hit.hit && hit.penetration > 0.001) return true;
  }
  return false;
}

/**
 * Walk `t` toward the pivot until the camera sphere is clear of solids.
 * Stays strictly on the chase arm (no sideways tunnel-through).
 */
function walkArmClear(
  pivot: THREE.Vector3,
  dir: THREE.Vector3,
  startT: number,
  radius: number,
  hash: SpatialHash,
): number {
  let t = THREE.MathUtils.clamp(startT, 0, 1);
  _probe.copy(pivot).addScaledVector(dir, t);
  if (!sphereOverlapsAny(_probe.x, _probe.y, _probe.z, radius, hash)) {
    return t;
  }

  const steps = CAMERA_OCCLUSION.clearSteps;
  for (let i = 1; i <= steps; i++) {
    t = startT * (1 - i / steps);
    if (t < 0) t = 0;
    _probe.copy(pivot).addScaledVector(dir, t);
    if (!sphereOverlapsAny(_probe.x, _probe.y, _probe.z, radius, hash)) {
      return t;
    }
  }
  return 0;
}

/**
 * Pull `desired` along pivot→desired so the camera sphere stays clear of AABBs.
 * Always remains on the spring arm — never uses minDistance to jump past a hit.
 */
export function resolveCameraOcclusion(
  pivot: THREE.Vector3,
  desired: THREE.Vector3,
  hash: SpatialHash,
  radius: number = CAMERA_OCCLUSION.radius,
  skin: number = CAMERA_OCCLUSION.skin,
  _minDistance: number = CAMERA_OCCLUSION.minDistance,
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

  let t = 1;
  if (hit) {
    // Pull back along the arm only — never raise t past the hit plane
    const skinT = skin / armLen;
    t = Math.max(0, bestT - skinT);
  }

  // Ensure the sphere at `t` is clear (handles corners / partial overlaps)
  t = walkArmClear(pivot, _dir, t, radius, hash);
  if (t < 1 - 1e-4) hit = true;

  desired.copy(pivot).addScaledVector(_dir, t);

  // Last resort: if still overlapping (pivot inside solid), nudge toward free
  // space preferring the side facing the pivot (anti-tunnel).
  if (sphereOverlapsAny(desired.x, desired.y, desired.z, radius, hash)) {
    pushCameraOutOfSolids(desired, hash, radius, pivot);
    // Re-project onto the arm so we don't slide around the far side of a wall
    _unit.copy(desired).sub(pivot);
    const projLen = _unit.dot(_dir) / (armLen * armLen);
    const clamped = THREE.MathUtils.clamp(projLen, 0, t);
    desired.copy(pivot).addScaledVector(_dir, clamped);
    t = walkArmClear(pivot, _dir, clamped, radius, hash);
    desired.copy(pivot).addScaledVector(_dir, t);
    hit = true;
  }

  return { hit, t: hit ? t : 1 };
}

/**
 * Sphere push-out against nearby AABBs.
 * When `preferPivot` is set, bias the push so we exit toward the pivot
 * instead of tunneling through to the far face of thin walls.
 */
export function pushCameraOutOfSolids(
  position: THREE.Vector3,
  hash: SpatialHash,
  radius: number = CAMERA_OCCLUSION.radius,
  preferPivot?: THREE.Vector3,
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

    // Prefer exiting toward the pivot when the nearest-face normal fights it
    // (or is orthogonal — common when the probe is dead-center in a box).
    if (preferPivot) {
      _unit.copy(preferPivot).sub(position);
      if (_unit.lengthSq() > 1e-6) {
        _unit.normalize();
        if (_normal.dot(_unit) < 0.2) {
          _normal.copy(_unit);
        }
      }
    }

    position.addScaledVector(_normal, hit.penetration + CAMERA_OCCLUSION.skin * 0.35);
    pushed = true;
  }
  return pushed;
}

/**
 * Soft-clamp camera XZ inside the playable map half-extent so edge turns
 * don't park the lens past the visual rim.
 */
export function clampCameraToWorldBound(
  position: THREE.Vector3,
  worldBound: number,
  margin = 1.5,
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

/**
 * Four solid rim slabs at ±halfExtent so the chase arm always has something
 * to hit at the map edge — even when fence/glass meshes were skipped in bake.
 */
export function createPerimeterWalls(
  halfExtent: number,
  height = 90,
  thickness = 6,
): Array<Omit<ColliderAABB, 'id'> & { tag: string }> {
  const h = Math.max(20, halfExtent);
  const t = Math.max(2, thickness);
  const y0 = -4;
  const y1 = height;
  const pad = h + t;
  return [
    {
      minX: h,
      minY: y0,
      minZ: -pad,
      maxX: h + t,
      maxY: y1,
      maxZ: pad,
      kind: 'building',
      active: true,
      tag: 'camera-perimeter',
    },
    {
      minX: -h - t,
      minY: y0,
      minZ: -pad,
      maxX: -h,
      maxY: y1,
      maxZ: pad,
      kind: 'building',
      active: true,
      tag: 'camera-perimeter',
    },
    {
      minX: -pad,
      minY: y0,
      minZ: h,
      maxX: pad,
      maxY: y1,
      maxZ: h + t,
      kind: 'building',
      active: true,
      tag: 'camera-perimeter',
    },
    {
      minX: -pad,
      minY: y0,
      minZ: -h - t,
      maxX: pad,
      maxY: y1,
      maxZ: -h,
      kind: 'building',
      active: true,
      tag: 'camera-perimeter',
    },
  ];
}
