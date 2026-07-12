import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildHeightTools, getMapBakeOptions } from './mapLoader';
import { FRUZER_MATERIAL_CHUNK } from './fruzerMaterials';

test('low-tier map baking substantially reduces startup work', () => {
  const low = getMapBakeOptions('low');
  const high = getMapBakeOptions('high');

  assert.ok(low.heightGridResolution < high.heightGridResolution);
  assert.ok(low.robustBoundsStride > high.robustBoundsStride);
  assert.ok(low.spawnGridSize < high.spawnGridSize);
  assert.ok(low.maxColliders < high.maxColliders);
  assert.equal(low.probeSpawnSurface, false);
});

test('medium-tier map baking stays between low and high budgets', () => {
  const low = getMapBakeOptions('low');
  const medium = getMapBakeOptions('medium');
  const high = getMapBakeOptions('high');

  assert.ok(medium.heightGridResolution > low.heightGridResolution);
  assert.ok(medium.heightGridResolution < high.heightGridResolution);
  assert.ok(medium.maxColliders > low.maxColliders);
  assert.ok(medium.maxColliders < high.maxColliders);
});

test('Fruzer material chunking stays well below mesh count to avoid startup stalls', () => {
  // Fruzer Polygon ships ~1385 primitives; a sync bake without chunking freezes
  // mobile browsers. Chunk size must force multiple yields on that scene.
  assert.ok(FRUZER_MATERIAL_CHUNK <= 128);
  assert.ok(1385 / FRUZER_MATERIAL_CHUNK >= 10);
});

test('terrain sampling raycasts only meshes in the queried spatial bucket', () => {
  const colliders: THREE.Mesh[] = [];
  let raycasts = 0;

  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(9.8, 1, 9.8));
      mesh.position.set(ix * 10 + 5, 0.5, iz * 10 + 5);
      mesh.updateMatrixWorld(true);
      const raycast = mesh.raycast.bind(mesh);
      mesh.raycast = (raycaster, intersections) => {
        raycasts++;
        raycast(raycaster, intersections);
      };
      colliders.push(mesh);
    }
  }

  const tools = buildHeightTools(
    colliders,
    new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 1, 100)),
    -100,
    10,
  );
  raycasts = 0;

  assert.equal(tools.getGroundHeight(5, 5), 1);
  assert.ok(raycasts <= 4, `expected a local raycast, got ${raycasts} mesh tests`);
});
