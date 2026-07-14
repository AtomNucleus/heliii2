/**
 * Unit tests for procedural environment camera occluders.
 * Run: npx tsx --test src/world/envOccluders.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityDressing } from './cityDressing';
import { getEnvBudget } from './envBudget';
import { SpatialHash } from '../collision/spatialHash';
import { WorldCollision } from '../collision/worldCollision';
import { collideAndResolve } from '../collision/resolve';

describe('cityDressing cameraOccluders', () => {
  it('exposes analytic AABBs for main building bodies', () => {
    // sampleGroundPoints rejects |y| < 1e-4 (water/miss), so use a flat non-zero ground
    const dressing = createCityDressing(
      () => 1,
      100,
      getEnvBudget('low'),
      new THREE.Vector3(0, 0, 0),
    );

    assert.ok(dressing.cameraOccluders.length > 0, 'expected at least one occluder');

    for (const box of dressing.cameraOccluders) {
      assert.ok(box.maxY > box.minY, 'height must be positive');
      assert.ok(box.minY >= 0.5, `base should sit on ground (~1), got minY=${box.minY}`);
      assert.ok(box.maxX > box.minX && box.maxZ > box.minZ, 'footprint must be positive');

      const cx = (box.minX + box.maxX) * 0.5;
      const cy = (box.minY + box.maxY) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;
      // Analytic AABB must contain the instance center (XZ mid, mid-height)
      assert.ok(
        cx >= box.minX && cx <= box.maxX &&
        cy >= box.minY && cy <= box.maxY &&
        cz >= box.minZ && cz <= box.maxZ,
        'AABB must contain instance center',
      );
    }

    dressing.dispose();
  });
});

describe('camera-env colliders are camera-only', () => {
  it('shortens the chase arm but does not block heli resolve', () => {
    const collision = new WorldCollision(new SpatialHash([], 12));
    const wall = {
      minX: -4,
      minY: 0,
      minZ: -40,
      maxX: 4,
      maxY: 30,
      maxZ: -20,
      kind: 'building' as const,
      tag: 'camera-env',
    };
    collision.registerCollider(wall);

    const pivot = new THREE.Vector3(0, 8, 0);
    const desired = new THREE.Vector3(0, 12, -34);
    const cam = collision.resolveCameraPosition(pivot, desired);
    assert.equal(cam.hit, true);
    assert.ok(desired.z > -34, 'camera should pull in through occluder');

    const heliPos = new THREE.Vector3(0, 10, -30); // center of the box volume
    const heliVel = new THREE.Vector3(0, 0, 0);
    const impact = collideAndResolve(heliPos, heliVel, collision.hash);
    assert.equal(impact.contact.hit, false, 'heli physics must ignore camera-env');
  });
});
