import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ATLAS_UV_SPAN_LIMIT,
  applyFruzerMaterials,
  applyFruzerMaterialsSync,
  getAtlasCanvasAllocations,
  getAtlasPixels,
  isAtlasImageReady,
  measureUvSpan,
  prepareFruzerMaterial,
  resetAtlasPixelCacheForTests,
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

function installCanvasHarness() {
  const creates: Array<{ width: number; height: number }> = [];
  const previous = globalThis.document;

  const doc = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      const state = { width: 0, height: 0 };
      creates.push(state);
      return {
        get width() {
          return state.width;
        },
        set width(v: number) {
          state.width = v;
        },
        get height() {
          return state.height;
        },
        set height(v: number) {
          state.height = v;
        },
        getContext() {
          return {
            drawImage() {
              /* harness no-op */
            },
            getImageData(x: number, y: number, w: number, h: number) {
              const data = new Uint8ClampedArray(w * h * 4);
              // Solid teal so bake path has a deterministic color
              for (let i = 0; i < data.length; i += 4) {
                data[i] = 20;
                data[i + 1] = 180;
                data[i + 2] = 160;
                data[i + 3] = 255;
              }
              return { data, width: w, height: h };
            },
          };
        },
      };
    },
  };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: doc,
  });

  return {
    creates,
    restore() {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, 'document');
      } else {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          writable: true,
          value: previous,
        });
      }
    },
  };
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
  resetAtlasPixelCacheForTests();
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
  resetAtlasPixelCacheForTests();
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
  resetAtlasPixelCacheForTests();
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
  src.dispose();
});

test('prepareFruzerMaterial keeps nearest-filter maps for tiny swatches', () => {
  resetAtlasPixelCacheForTests();
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
  src.dispose();
});

test('isAtlasImageReady rejects incomplete HTML images', () => {
  assert.equal(isAtlasImageReady(undefined), false);
  assert.equal(isAtlasImageReady({ width: 0, height: 8 }), false);
  assert.equal(isAtlasImageReady({ width: 8, height: 8, complete: false }), false);
  assert.equal(isAtlasImageReady({ width: 8, height: 8, complete: true }), true);
  assert.equal(
    isAtlasImageReady({ width: 2, height: 2, data: new Uint8Array(16) }),
    true,
  );
});

test('HTML atlas decode allocates one canvas per texture, not per sample', () => {
  resetAtlasPixelCacheForTests();
  const harness = installCanvasHarness();
  try {
    const texture = new THREE.Texture();
    // Simulate GLTF HTMLImage / ImageBitmap-like source (no .data)
    texture.image = { width: 4, height: 4, complete: true };

    const before = getAtlasCanvasAllocations();
    const pixels = getAtlasPixels(texture);
    assert.ok(pixels);
    assert.equal(pixels!.width, 4);
    assert.equal(getAtlasCanvasAllocations() - before, 1);
    assert.equal(harness.creates.length, 1);

    // Many samples must hit the WeakMap cache — zero extra canvases.
    for (let i = 0; i < 50; i++) {
      sampleAtlasColor(texture, Math.random(), Math.random());
    }
    assert.equal(getAtlasCanvasAllocations() - before, 1);
    assert.equal(harness.creates.length, 1);

    // Cached null/hit path
    assert.equal(getAtlasPixels(texture), pixels);
  } finally {
    harness.restore();
  }
});

test('applyFruzerMaterials does not thrash canvases across many scrambled meshes', async () => {
  resetAtlasPixelCacheForTests();
  const harness = installCanvasHarness();
  try {
    const sharedMap = new THREE.Texture();
    sharedMap.image = { width: 8, height: 8, complete: true };

    const root = new THREE.Group();
    // Mimic Fruzer: hundreds of primitives sharing one atlas, scrambled UVs
    for (let i = 0; i < 200; i++) {
      const geo = geoWithUv([0.0, 0.0, 0.9, 0.1, 0.4, 0.85, 0.7, 0.55]);
      const mat = new THREE.MeshStandardMaterial({ name: 'mat01', map: sharedMap });
      root.add(new THREE.Mesh(geo, mat));
    }

    let yields = 0;
    const stats = await applyFruzerMaterials(root, {
      chunkSize: 32,
      yieldToMain: async () => {
        yields += 1;
      },
    });

    assert.equal(stats.meshes, 200);
    assert.equal(stats.baked, 200);
    // One decode canvas for the shared atlas — never 200*5.
    assert.ok(
      stats.canvasAllocations <= 2,
      `expected <=2 canvas allocs, got ${stats.canvasAllocations}`,
    );
    assert.equal(harness.creates.length, stats.canvasAllocations);
    assert.ok(yields >= 5, `expected chunked yields, got ${yields}`);
    assert.ok(stats.atlasesDecoded >= 1);
  } finally {
    harness.restore();
  }
});

test('applyFruzerMaterialsSync preserves bake behavior for tiny scenes', () => {
  resetAtlasPixelCacheForTests();
  const data = new Uint8Array(4 * 4 * 4).fill(80);
  const map = new THREE.DataTexture(data, 4, 4);
  map.needsUpdate = true;
  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(
      geoWithUv([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]),
      new THREE.MeshStandardMaterial({ name: 'mat02', map }),
    ),
  );
  const stats = applyFruzerMaterialsSync(root);
  assert.equal(stats.baked, 1);
  assert.equal(stats.meshes, 1);
  map.dispose();
});

test('unreadable atlas falls back without throwing during bake', () => {
  resetAtlasPixelCacheForTests();
  const map = new THREE.Texture();
  map.image = { width: 16, height: 16, complete: false };
  const src = new THREE.MeshStandardMaterial({ name: 'mat01', map });
  const geo = geoWithUv([0.0, 0.0, 1.0, 0.2, 0.5, 0.9]);
  const prepared = prepareFruzerMaterial(src, geo);
  assert.equal(prepared.mode, 'baked');
  // Fallback white * base
  assert.ok(prepared.material.color.r > 0.9);
  prepared.material.dispose();
  src.dispose();
});
