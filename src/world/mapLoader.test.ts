import assert from 'node:assert/strict';
import test from 'node:test';
import { getMapBakeOptions } from './mapLoader';
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
