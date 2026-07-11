import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ATLAS_UV_SPAN_LIMIT,
  measureUvSpan,
  prepareFruzerMaterial,
  sampleAtlasColor,
  sampleDominantAtlasColor,
} from './fruzerMaterials';

function geoWithUv(uvs: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array((uvs.length / 2) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  return geo;
}

test('measureUvSpan flags flat swatches vs scrambled atlas stretches', () => {
  const flat = measureUvSpan(geoWithUv([0.1, 0.2, 0.1, 0.2, 0.1, 0.2]));
  assert.ok(flat);
  assert.equal(flat!.isSwatch, true);
  assert.equal(flat!.isScrambled, false);
  assert.ok(Math.abs(flat!.centerU - 0.1) < 1e-5);
  assert.ok(Math.abs(flat!.centerV - 0.2) < 1e-5);

  const scrambled = measureUvSpan(
    geoWithUv([0.0, 0.0, 0.95, 0.1, 0.5, 0.8, 0.2, 0.9]),
  );
  assert.ok(scrambled);
  assert.equal(scrambled!.isScrambled, true);
  assert.ok(scrambled!.spanU > ATLAS_UV_SPAN_LIMIT || scrambled!.spanV > ATLAS_UV_SPAN_LIMIT);
  assert.ok(Math.abs(scrambled!.centerU - 0.475) < 1e-6);
  assert.ok(Math.abs(scrambled!.centerV - 0.45) < 1e-6);
});

test('sampleAtlasColor reads the intended texel from raw image data', () => {
  const data = new Uint8Array([
    255, 0, 0, 255, // 0,0 red
    0, 255, 0, 255, // 1,0 green
    0, 0, 255, 255, // 0,1 blue
    255, 255, 0, 255, // 1,1 yellow
  ]);
  const texture = new THREE.DataTexture(data, 2, 2);
  texture.needsUpdate = true;

  const red = sampleAtlasColor(texture, 0.1, 0.1);
  assert.ok(red.r > 0.9 && red.g < 0.1 && red.b < 0.1);

  const yellow = sampleAtlasColor(texture, 0.9, 0.9);
  assert.ok(yellow.r > 0.9 && yellow.g > 0.9 && yellow.b < 0.1);

  texture.dispose();
});

test('sampleDominantAtlasColor prefers a stable mid tone across mixed texels', () => {
  // 2x2: three similar greys + one bright outlier
  const data = new Uint8Array([
    40, 40, 40, 255,
    50, 50, 50, 255,
    45, 45, 45, 255,
    255, 0, 0, 255,
  ]);
  const texture = new THREE.DataTexture(data, 2, 2);
  texture.needsUpdate = true;
  const uv = measureUvSpan(geoWithUv([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]))!;
  const color = sampleDominantAtlasColor(texture, uv);
  // Median should stay in the grey cluster, not the red outlier
  assert.ok(color.r < 0.4 && color.g < 0.4 && color.b < 0.4);
  texture.dispose();
});

test('prepareFruzerMaterial bakes scrambled atlas stretches into solid colors', () => {
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 30;
    data[i + 1] = 30;
    data[i + 2] = 30;
    data[i + 3] = 255;
  }

  const map = new THREE.DataTexture(data, 4, 4);
  map.needsUpdate = true;
  const src = new THREE.MeshStandardMaterial({ name: 'mat01', map, color: 0xffffff });
  const geo = geoWithUv([0.05, 0.05, 0.9, 0.2, 0.4, 0.85, 0.7, 0.6]);

  const prepared = prepareFruzerMaterial(src, geo);
  assert.equal(prepared.mode, 'baked');
  assert.equal(prepared.material.map, null);
  assert.equal(prepared.material.name, 'mat01');

  map.dispose();
  prepared.material.dispose();
});

test('prepareFruzerMaterial keeps nearest-filter maps for tiny swatches', () => {
  const data = new Uint8Array([40, 80, 60, 255]);
  const map = new THREE.DataTexture(data, 1, 1);
  map.needsUpdate = true;
  const src = new THREE.MeshStandardMaterial({ name: 'mat01', map });
  const geo = geoWithUv([0.33, 0.5, 0.33, 0.5, 0.33, 0.5]);

  const prepared = prepareFruzerMaterial(src, geo);
  assert.equal(prepared.mode, 'swatch');
  assert.ok(prepared.material.map);
  assert.equal(prepared.material.map!.magFilter, THREE.NearestFilter);
  assert.equal(prepared.material.map!.minFilter, THREE.NearestFilter);

  map.dispose();
  prepared.material.dispose();
});
