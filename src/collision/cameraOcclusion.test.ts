/**
 * Unit tests for chase-camera occlusion (ray-AABB spring arm).
 * Run: npx tsx --test src/collision/cameraOcclusion.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpatialHash } from './spatialHash';
import type { ColliderAABB } from './types';
import {
  CAMERA_OCCLUSION,
  clampCameraToWorldBound,
  createPerimeterWalls,
  rayAABBEnterT,
  resolveCameraOcclusion,
  pushCameraOutOfSolids,
} from './cameraOcclusion';

function box(
  id: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): ColliderAABB {
  return {
    id,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    kind: 'building',
    active: true,
  };
}

describe('rayAABBEnterT', () => {
  const wall = box(0, 10, 0, -5, 14, 20, 5);

  it('misses when the segment never reaches the AABB', () => {
    const t = rayAABBEnterT(0, 5, 0, 5, 0, 0, wall, 0);
    assert.equal(t, null);
  });

  it('reports entry t when the arm hits a wall behind the craft', () => {
    const t = rayAABBEnterT(0, 5, 0, 20, 0, 0, wall, 0);
    assert.ok(t !== null);
    assert.ok(Math.abs((t as number) - 0.5) < 1e-6);
  });

  it('returns 0 when the origin is already inside', () => {
    const t = rayAABBEnterT(12, 5, 0, 10, 0, 0, wall, 0);
    assert.equal(t, 0);
  });

  it('accounts for inflate radius (camera probe)', () => {
    const t = rayAABBEnterT(0, 5, 0, 20, 0, 0, wall, 1.35);
    assert.ok(t !== null);
    assert.ok(Math.abs((t as number) - 8.65 / 20) < 1e-6);
  });
});

describe('resolveCameraOcclusion', () => {
  it('pulls the camera in when a building blocks the chase arm', () => {
    const wall = box(0, -4, 0, -40, 4, 30, -20);
    const hash = new SpatialHash([wall], 12);
    const pivot = new THREE.Vector3(0, 8, 0);
    const desired = new THREE.Vector3(0, 12, -34);

    const result = resolveCameraOcclusion(pivot, desired, hash);
    assert.equal(result.hit, true);
    assert.ok(desired.z > -34, 'camera should pull forward away from far side');
    assert.ok(
      desired.z > -20 + CAMERA_OCCLUSION.radius * 0.25,
      `expected clear of wall face, got z=${desired.z}`,
    );
  });

  it('leaves the camera alone when the arm is clear', () => {
    const wall = box(0, 40, 0, 40, 50, 20, 50);
    const hash = new SpatialHash([wall], 12);
    const pivot = new THREE.Vector3(0, 8, 0);
    const desired = new THREE.Vector3(0, 12, -34);
    const result = resolveCameraOcclusion(pivot, desired, hash);
    assert.equal(result.hit, false);
    assert.equal(desired.z, -34);
  });

  it('does not tunnel through a thin wall when heli is closer than minDistance', () => {
    // Regression: old minDistance floor forced t past the hit plane.
    const wall = box(0, -6, 0, -8, 6, 24, -4);
    const hash = new SpatialHash([wall], 12);
    const pivot = new THREE.Vector3(0, 8, 0); // 4m from near face at z=-4
    const desired = new THREE.Vector3(0, 10, -34); // arm through wall

    const result = resolveCameraOcclusion(pivot, desired, hash);
    assert.equal(result.hit, true);
    // Must stay on the pivot side of the near face (with radius clearance)
    assert.ok(
      desired.z > -4 - 0.1,
      `camera tunneled past near face: z=${desired.z}`,
    );
    assert.ok(desired.z < 0.5, `camera should still be behind pivot, z=${desired.z}`);
  });

  it('keeps the camera on the arm (no sideways far-face exit)', () => {
    const wall = box(0, -5, 0, -12, 5, 20, -6);
    const hash = new SpatialHash([wall], 12);
    const pivot = new THREE.Vector3(0, 8, 0);
    const desired = new THREE.Vector3(0, 10, -30);

    resolveCameraOcclusion(pivot, desired, hash);
    assert.ok(Math.abs(desired.x) < 0.75, `drifted off arm: x=${desired.x}`);
    assert.ok(desired.z > -6 - 0.1, `exited far side: z=${desired.z}`);
  });

  it('pushes the camera out when placed inside solid geometry', () => {
    const wall = box(0, -5, 0, -5, 5, 20, 5);
    const hash = new SpatialHash([wall], 12);
    const pos = new THREE.Vector3(0, 8, 0);
    const pivot = new THREE.Vector3(0, 8, 12);
    const pushed = pushCameraOutOfSolids(pos, hash, CAMERA_OCCLUSION.radius, pivot);
    assert.equal(pushed, true);
    assert.ok(pos.z > 5 - 0.01, `should exit toward pivot (+Z), z=${pos.z}`);
  });
});

describe('clampCameraToWorldBound', () => {
  it('keeps the camera inside the map rim', () => {
    const pos = new THREE.Vector3(200, 10, -180);
    clampCameraToWorldBound(pos, 105, 1.5);
    assert.ok(Math.abs(pos.x) <= 103.5 + 1e-6);
    assert.ok(Math.abs(pos.z) <= 103.5 + 1e-6);
  });
});

describe('createPerimeterWalls', () => {
  it('blocks a chase arm that swings past the map edge', () => {
    const half = 100;
    const walls = createPerimeterWalls(half).map((w, i) => ({ ...w, id: i }));
    const hash = new SpatialHash(walls, 16);
    const pivot = new THREE.Vector3(90, 10, 0); // near +X rim
    const desired = new THREE.Vector3(140, 14, 0); // outside map

    const result = resolveCameraOcclusion(pivot, desired, hash);
    assert.equal(result.hit, true);
    assert.ok(
      desired.x <= half + 0.5,
      `camera should stop at rim, got x=${desired.x}`,
    );
  });
});
