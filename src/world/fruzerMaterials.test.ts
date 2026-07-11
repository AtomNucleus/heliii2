import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ATLAS_UV_SPAN_LIMIT,
  measureUvSpan,
  prepareFruzerMaterial,
  sampleAtlasColor,
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

  const scrambled = measureUvSpan(
    geoWithUv([0.0, 0.0, 0.95, 0.1, 0.5, 0.8, 0.2, 0.9]),
  );
  assert.ok(scrambled);
  assert.equal(scrambled!.isScrambled, true);
  assert.ok(scrambled!.spanU > ATLAS_UV_SPAN_LIMIT || scrambled!.spanV > ATLAS_UV_SPAN_LIMIT);
  assert.ok(scrambled!.midU > 0.2 && scrambled!.midU < 0.8);
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
  // Wide UV span triggers bake path
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
