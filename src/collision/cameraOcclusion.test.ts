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
    // Pivot at origin, camera desired at z=-30 — wall spans z -5..5 at x 10..14
    // Shoot toward +X into the wall
    const t = rayAABBEnterT(0, 5, 0, 20, 0, 0, wall, 0);
    assert.ok(t !== null);
    assert.ok(Math.abs((t as number) - 0.5) < 1e-6); // hits at x=10, t=10/20
  });

  it('returns 0 when the origin is already inside', () => {
    const t = rayAABBEnterT(12, 5, 0, 10, 0, 0, wall, 0);
    assert.equal(t, 0);
  });

  it('accounts for inflate radius (camera probe)', () => {
    const t = rayAABBEnterT(0, 5, 0, 20, 0, 0, wall, 1.35);
    assert.ok(t !== null);
    // Inflated minX = 10 - 1.35 = 8.65 → t = 8.65/20
    assert.ok(Math.abs((t as number) - 8.65 / 20) < 1e-6);
  });
});

describe('resolveCameraOcclusion', () => {
  it('pulls the camera in when a building blocks the chase arm', () => {
    const wall = box(0, -4, 0, -40, 4, 30, -20);
    const hash = new SpatialHash([wall], 12);
    const pivot = new THREE.Vector3(0, 8, 0);
    const desired = new THREE.Vector3(0, 12, -34); // classic chase offset into wall

    const result = resolveCameraOcclusion(pivot, desired, hash);
    assert.equal(result.hit, true);
    assert.ok(desired.z > -34, 'camera should pull forward away from far side');
    // Should stop before entering the inflated wall (minZ=-40, maxZ=-20)
    assert.ok(
      desired.z > -20 + CAMERA_OCCLUSION.radius * 0.5,
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

  it('pushes the camera out when placed inside solid geometry', () => {
    const wall = box(0, -5, 0, -5, 5, 20, 5);
    const hash = new SpatialHash([wall], 12);
    const pos = new THREE.Vector3(0, 8, 0); // inside
    const pushed = pushCameraOutOfSolids(pos, hash);
    assert.equal(pushed, true);
    assert.ok(pos.length() > 5, 'should be outside the AABB');
  });
});

describe('clampCameraToWorldBound', () => {
  it('keeps the camera inside the map rim', () => {
    const pos = new THREE.Vector3(200, 10, -180);
    clampCameraToWorldBound(pos, 105, 2.5);
    assert.ok(Math.abs(pos.x) <= 102.5 + 1e-6);
    assert.ok(Math.abs(pos.z) <= 102.5 + 1e-6);
  });
});
