import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { COLORS, createSunsetSkyDome, createSunDisc } from '../scene/setup';
import { createEnvironmentLayer, type EnvironmentLayer } from './environmentLayer';
import { WorldCollision } from '../collision';
import { withTimeout } from '../utils/withTimeout';
import { applyFruzerMaterials } from './fruzerMaterials';

/** Target play-area width (largest XZ extent after scale), in world units */
export const MAP_TARGET_SIZE = 260;
/** Fallback ground Y when a raycast misses */
export const FALLBACK_GROUND_Y = 0;
/** Height-sample grid resolution (cells per side) */
export const HEIGHT_GRID_RES = 96;
/** Ray origin height above map max Y */
export const HEIGHT_RAY_LIFT = 80;

export const MAP_URL = './maps/fruzer-polygon.glb';
export const DRACO_DECODER_PATH = './draco/';
const MAP_DOWNLOAD_TIMEOUT_MS = 45_000;

export type MapQualityTier = 'low' | 'medium' | 'high';

export interface MapBakeOptions {
  heightGridResolution: number;
  robustBoundsStride: number;
  spawnGridSize: number;
  probeSpawnSurface: boolean;
  maxColliders: number;
}

export function getMapBakeOptions(tier: MapQualityTier): MapBakeOptions {
  if (tier === 'low') {
    return {
      heightGridResolution: 48,
      robustBoundsStride: 13,
      spawnGridSize: 11,
      probeSpawnSurface: false,
      maxColliders: 450,
    };
  }
  if (tier === 'medium') {
    return {
      heightGridResolution: 72,
      robustBoundsStride: 9,
      spawnGridSize: 15,
      probeSpawnSurface: true,
      maxColliders: 650,
    };
  }
  return {
    heightGridResolution: HEIGHT_GRID_RES,
    robustBoundsStride: 7,
    spawnGridSize: SPAWN_GRID,
    probeSpawnSurface: true,
    maxColliders: 850,
  };
}

export interface LoadMapWorldOptions {
  tier?: MapQualityTier;
  onStage?: (label: string, stage: string) => void;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface WorldObjects {
  group: THREE.Group;
  water: THREE.Mesh | null;
  landingPad: THREE.Group;
  spawnPosition: THREE.Vector3;
  getGroundHeight: (x: number, z: number) => number;
  /** Building/prop AABB collision (null if bake skipped). */
  collision: WorldCollision | null;
  /** Half-extent of playable XZ after scale (approx) */
  mapHalfExtent: number;
  bounds: THREE.Box3;
  /** Cinematic sky dome (for atmosphere uniform updates) */
  sky: THREE.Mesh;
  /** Procedural sun disc + flare */
  sunDisc: THREE.Group;
  /** Higher-detail procedural environment dressing over Fruzer */
  environment: EnvironmentLayer;
}

function createSkyDome(): THREE.Mesh {
  return createSunsetSkyDome(520);
}

function createSun(): THREE.Group {
  return createSunDisc();
}

function createLandingPad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = 'landingPad';

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.2, 0.25, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.pad,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.2,
    }),
  );
  base.receiveShadow = true;
  pad.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.5, 4.2, 32),
    new THREE.MeshStandardMaterial({
      color: COLORS.padMark,
      emissive: COLORS.neonGreen,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  pad.add(ring);

  const hMat = new THREE.MeshStandardMaterial({
    color: COLORS.padMark,
    emissive: COLORS.neonGreen,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const hLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 2.2), hMat);
  hLeft.position.set(-0.7, 0.15, 0);
  const hRight = hLeft.clone();
  hRight.position.x = 0.7;
  const hMid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.35), hMat);
  hMid.position.set(0, 0.15, 0);
  pad.add(hLeft, hRight, hMid);

  const lightMat = new THREE.MeshStandardMaterial({
    color: COLORS.orangeSun,
    emissive: COLORS.orangeSun,
    emissiveIntensity: 1.2,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), lightMat);
    light.position.set(Math.cos(a) * 4.6, 0.2, Math.sin(a) * 4.6);
    pad.add(light);
  }

  return pad;
}

const SPAWN_GRID = 19;
/** Central fraction of mapHalfExtent used for spawn search */
const SPAWN_SEARCH_FRACTION = 0.5;
/** Clear air required above ground so we don't spawn inside hangars */
const SPAWN_CLEARANCE = 24;
/** Hover height above chosen ground — high enough to read the base layout */
export const SPAWN_HOVER = 28;

/**
 * Bounds of the dense battle-royale base. Sketchfab exports include sparse
 * outlier verts (distant water / props) that inflate AABB; we find the peak
 * XZ density cell, grow a connected component, then take percentile Y.
 */
function computeRobustBounds(root: THREE.Object3D, stride = 7): {
  box: THREE.Box3;
  sampleCount: number;
} {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      xs.push(v.x);
      ys.push(v.y);
      zs.push(v.z);
    }
  });

  if (xs.length < 64) {
    const box = new THREE.Box3().setFromObject(root);
    return { box, sampleCount: xs.length };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (zs[i] < minZ) minZ = zs[i];
    if (zs[i] > maxZ) maxZ = zs[i];
  }

  const bins = 80;
  const spanX = Math.max(1e-3, maxX - minX);
  const spanZ = Math.max(1e-3, maxZ - minZ);
  const hist = new Float64Array(bins * bins);
  for (let i = 0; i < xs.length; i++) {
    const ix = Math.min(bins - 1, Math.floor(((xs[i] - minX) / spanX) * bins));
    const iz = Math.min(bins - 1, Math.floor(((zs[i] - minZ) / spanZ) * bins));
    hist[iz * bins + ix]++;
  }

  let peak = 0;
  let peakI = 0;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i] > peak) {
      peak = hist[i];
      peakI = i;
    }
  }

  const thresh = peak * 0.05;
  const visited = new Uint8Array(bins * bins);
  const queue = [peakI];
  visited[peakI] = 1;
  const component: number[] = [];
  while (queue.length) {
    const cur = queue.pop()!;
    if (hist[cur] < thresh) continue;
    component.push(cur);
    const cx = cur % bins;
    const cz = Math.floor(cur / bins);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= bins || nz >= bins) continue;
        const ni = nz * bins + nx;
        if (!visited[ni]) {
          visited[ni] = 1;
          queue.push(ni);
        }
      }
    }
  }

  const inComp = new Set(component);
  const cxs: number[] = [];
  const cys: number[] = [];
  const czs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const ix = Math.min(bins - 1, Math.floor(((xs[i] - minX) / spanX) * bins));
    const iz = Math.min(bins - 1, Math.floor(((zs[i] - minZ) / spanZ) * bins));
    if (!inComp.has(iz * bins + ix)) continue;
    cxs.push(xs[i]);
    cys.push(ys[i]);
    czs.push(zs[i]);
  }

  if (cxs.length < 32) {
    const box = new THREE.Box3().setFromObject(root);
    return { box, sampleCount: xs.length };
  }

  cxs.sort((a, b) => a - b);
  cys.sort((a, b) => a - b);
  czs.sort((a, b) => a - b);

  const box = new THREE.Box3(
    new THREE.Vector3(percentile(cxs, 0.01), percentile(cys, 0.02), percentile(czs, 0.01)),
    new THREE.Vector3(percentile(cxs, 0.99), percentile(cys, 0.98), percentile(czs, 0.99)),
  );
  return { box, sampleCount: cxs.length };
}

interface HeightTools {
  getGroundHeight: (x: number, z: number) => number;
  /** Open air (meters) above ground before a ceiling hit; large if open sky */
  probeClearance: (x: number, z: number, groundY: number) => number;
  /** Material name of the first downward hit (road / mat01 / …) */
  probeSurfaceMat: (x: number, z: number) => string;
}

function buildHeightTools(
  colliders: THREE.Object3D[],
  bounds: THREE.Box3,
  fallbackY: number,
  resolution = HEIGHT_GRID_RES,
): HeightTools {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const origin = new THREE.Vector3();
  const res = resolution;
  const minX = bounds.min.x;
  const maxX = bounds.max.x;
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;
  const spanX = Math.max(1e-3, maxX - minX);
  const spanZ = Math.max(1e-3, maxZ - minZ);
  const rayTop = bounds.max.y + HEIGHT_RAY_LIFT;

  const cache = new Float32Array(res * res);
  const filled = new Uint8Array(res * res);
  cache.fill(fallbackY);

  const sampleHits = (x: number, z: number) => {
    origin.set(x, rayTop, z);
    raycaster.set(origin, down);
    raycaster.far = rayTop - bounds.min.y + 40;
    return raycaster.intersectObjects(colliders, false);
  };

  const sampleRaw = (x: number, z: number): number => {
    const hits = sampleHits(x, z);
    if (hits.length > 0) return hits[0].point.y;
    return fallbackY;
  };

  // Pre-warm a small center patch (full-mesh raycasts are costly)
  const mid = Math.floor(res / 2);
  for (let iz = mid - 2; iz <= mid + 2; iz++) {
    for (let ix = mid - 2; ix <= mid + 2; ix++) {
      if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
      const x = minX + ((ix + 0.5) / res) * spanX;
      const z = minZ + ((iz + 0.5) / res) * spanZ;
      const idx = iz * res + ix;
      cache[idx] = sampleRaw(x, z);
      filled[idx] = 1;
    }
  }

  const getGroundHeight = (x: number, z: number) => {
    const fx = THREE.MathUtils.clamp((x - minX) / spanX, 0, 0.9999);
    const fz = THREE.MathUtils.clamp((z - minZ) / spanZ, 0, 0.9999);
    const ix = Math.floor(fx * res);
    const iz = Math.floor(fz * res);
    const idx = iz * res + ix;
    if (!filled[idx]) {
      const cx = minX + ((ix + 0.5) / res) * spanX;
      const cz = minZ + ((iz + 0.5) / res) * spanZ;
      cache[idx] = sampleRaw(cx, cz);
      filled[idx] = 1;
    }
    return cache[idx];
  };

  const probeClearance = (x: number, z: number, groundY: number) => {
    // Cast upward from just above the surface — hangar roofs / overhangs
    // register as a nearby ceiling; open yards return a large value.
    origin.set(x, groundY + 0.75, z);
    raycaster.set(origin, up);
    raycaster.far = Math.max(SPAWN_CLEARANCE + 80, rayTop - groundY);
    const hits = raycaster.intersectObjects(colliders, false);
    if (hits.length === 0) return 999;
    return Math.max(0, hits[0].point.y - groundY);
  };

  const probeSurfaceMat = (x: number, z: number) => {
    const hits = sampleHits(x, z);
    if (!hits[0]) return '';
    const mat = (hits[0].object as THREE.Mesh).material;
    if (Array.isArray(mat)) return mat[0]?.name || '';
    return (mat as THREE.Material)?.name || '';
  };

  return { getGroundHeight, probeClearance, probeSurfaceMat };
}

export interface OpenSpawn {
  x: number;
  z: number;
  groundY: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = THREE.MathUtils.clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

/**
 * Sample a grid over the central map and score open outdoor ground:
 * prefer mid-band heights (roads / plazas), flat neighborhoods, and
 * clear sky above (reject hangar pits / under-roof hits).
 */
export function findOpenSpawn(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  probeClearance?: (x: number, z: number, groundY: number) => number,
  probeSurfaceMat?: (x: number, z: number) => string,
  options?: { gridSize?: number; probeSurface?: boolean },
): OpenSpawn {
  const half = mapHalfExtent * SPAWN_SEARCH_FRACTION;
  const n = Math.max(5, options?.gridSize ?? SPAWN_GRID);
  const heights: number[][] = [];
  const xs: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    xs.push(-half + t * half * 2);
    zs.push(-half + t * half * 2);
  }

  const allY: number[] = [];
  for (let iz = 0; iz < n; iz++) {
    heights[iz] = [];
    for (let ix = 0; ix < n; ix++) {
      const y = getGroundHeight(xs[ix], zs[iz]);
      heights[iz][ix] = y;
      // Ignore raycast misses (fallback) when building outdoor percentiles
      if (Math.abs(y - FALLBACK_GROUND_Y) > 0.05) allY.push(y);
    }
  }

  const sortedY = allY.slice().sort((a, b) => a - b);
  // On this map the outdoor yard is the lower plateau of first-hits;
  // higher samples are rooftops. Keep spawn in that lower band.
  const yOutdoorMax = percentile(sortedY, 0.22);
  const yFloor = percentile(sortedY, 0.05);

  type Scored = { ix: number; iz: number; y: number; score: number };
  let best: Scored | null = null;

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const y = heights[iz][ix];

      // Reject empty space (ray miss) and rooftops / high pads
      if (Math.abs(y - FALLBACK_GROUND_Y) < 0.05) continue;
      if (y > yOutdoorMax + 0.5) continue;

      let neighborCount = 0;
      let varianceSum = 0;
      let tallNeighbors = 0;

      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nix = ix + dx;
          const niz = iz + dz;
          if (nix < 0 || niz < 0 || nix >= n || niz >= n) continue;
          const ny = heights[niz][nix];
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
            neighborCount++;
            const d = ny - y;
            varianceSum += d * d;
          }
          if (ny > y + 5) tallNeighbors++;
        }
      }

      const localVariance = neighborCount > 0 ? varianceSum / neighborCount : 0;

      // Prefer the lower outdoor band (true yards), not mid roofs that sneak in
      const bandSpan = Math.max(0.5, yOutdoorMax - yFloor);
      const heightScore = 6 * (1 - THREE.MathUtils.clamp((y - yFloor) / bandSpan, 0, 1));

      const flatScore = 2.5 / (1 + localVariance);
      const openYardScore = -1.2 * tallNeighbors;

      let clearScore = 1;
      if (probeClearance) {
        const clear = probeClearance(xs[ix], zs[iz], y);
        if (clear < SPAWN_CLEARANCE) {
          clearScore = -12;
        } else {
          clearScore = 7 + Math.min(4, (clear - SPAWN_CLEARANCE) * 0.03);
        }
      }

      const cx = xs[ix] / Math.max(1, half);
      const cz = zs[iz] / Math.max(1, half);
      const centerScore = 1.4 * (1 - Math.min(1, Math.hypot(cx, cz)));

      let matScore = 0;
      if (probeSurfaceMat && options?.probeSurface !== false) {
        const matName = probeSurfaceMat(xs[ix], zs[iz]).toLowerCase();
        if (matName.includes('road')) matScore = 8;
        else if (matName.includes('mat01')) matScore = 2;
        else if (matName.includes('mat0')) matScore = 0;
        else if (matName.includes('fence') || matName.includes('water')) matScore = -4;
      }

      const score =
        heightScore + flatScore + clearScore + centerScore + openYardScore + matScore;
      if (!best || score > best.score) {
        best = { ix, iz, y, score };
      }
    }
  }

  // Fallback: if every sample was rejected as rooftop, pick the lowest clear cell
  if (!best) {
    let lowest: Scored | null = null;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const y = heights[iz][ix];
        if (Math.abs(y - FALLBACK_GROUND_Y) < 0.05) continue;
        const clear = probeClearance ? probeClearance(xs[ix], zs[iz], y) : 999;
        if (clear < SPAWN_CLEARANCE) continue;
        if (!lowest || y < lowest.y) lowest = { ix, iz, y, score: 0 };
      }
    }
    best = lowest;
  }

  const pick = best ?? { ix: Math.floor(n / 2), iz: Math.floor(n / 2), y: FALLBACK_GROUND_Y, score: 0 };

  return {
    x: xs[pick.ix],
    z: zs[pick.iz],
    groundY: pick.y,
  };
}

/**
 * Load the Fruzer Polygon GLB, center/scale into the play area,
 * and return a world object compatible with the game loop.
 */
export async function loadMapWorld(
  scene: THREE.Scene,
  onProgress?: (ratio: number) => void,
  options: LoadMapWorldOptions = {},
): Promise<WorldObjects> {
  const tier = options.tier ?? 'medium';
  const bake = getMapBakeOptions(tier);
  const beginStage = async (label: string, stage: string, ratio: number) => {
    options.onStage?.(label, stage);
    onProgress?.(ratio);
    await yieldToMainThread();
  };

  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let gltf: Awaited<ReturnType<typeof loader.loadAsync>>;
  try {
    gltf = await withTimeout(
      new Promise<Awaited<ReturnType<typeof loader.loadAsync>>>((resolve, reject) => {
        loader.load(
          MAP_URL,
          resolve,
          (ev) => {
            // Network completion is only half of startup. Reserve the rest of
            // the progress bar for CPU-heavy map preparation.
            if (ev.total > 0 && onProgress) onProgress((ev.loaded / ev.total) * 0.52);
          },
          reject,
        );
      }),
      MAP_DOWNLOAD_TIMEOUT_MS,
      'map-download',
    );
  } catch (err) {
    draco.dispose();
    throw err;
  }

  await beginStage('Preparing map geometry…', 'map-geometry', 0.56);

  const group = new THREE.Group();
  group.name = 'world';

  const sky = createSkyDome();
  const sunDisc = createSun();
  scene.add(sky);
  scene.add(sunDisc);

  const mapRoot = gltf.scene;
  mapRoot.name = 'fruzerPolygon';

  // Sketchfab export includes sparse outlier verts (water / distant props)
  // that inflate AABB. Center + scale from a robust percentile box so the
  // dense battle-royale base fills the play area.
  mapRoot.updateMatrixWorld(true);
  const robust = computeRobustBounds(mapRoot, bake.robustBoundsStride);
  const rawSize = new THREE.Vector3();
  robust.box.getSize(rawSize);
  const rawCenter = robust.box.getCenter(new THREE.Vector3());

  const horiz = Math.max(rawSize.x, rawSize.z, 1);
  const scale = MAP_TARGET_SIZE / horiz;

  // Sit the robust floor on y=0 (not the absolute AABB min, which may be
  // a deep outlier pit).
  mapRoot.position.set(-rawCenter.x, -robust.box.min.y, -rawCenter.z);

  const mapScaled = new THREE.Group();
  mapScaled.name = 'fruzerPolygonScaled';
  mapScaled.scale.setScalar(scale);
  mapScaled.add(mapRoot);
  mapScaled.updateMatrixWorld(true);

  console.info('[map] robust bounds', {
    size: rawSize.toArray().map((n) => +n.toFixed(1)),
    center: rawCenter.toArray().map((n) => +n.toFixed(1)),
    scale: +scale.toFixed(5),
    samples: robust.sampleCount,
  });

  await beginStage('Preparing map surfaces…', 'map-materials', 0.68);

  // Collapse scrambled atlas stretches into flat Chicken Gun swatches while
  // keeping legitimate tiny-swatch UVs on nearest-filtered textures.
  // Async + atlas CPU cache: avoids thousands of sync canvas readbacks that
  // freeze / OOM mobile browsers during startup.
  const matStats = await applyFruzerMaterials(mapScaled, {
    yieldToMain: yieldToMainThread,
    onChunk: (done, total) => {
      if (total < 1) return;
      const ratio = 0.68 + (done / total) * 0.06;
      onProgress?.(ratio);
      options.onStage?.(
        `Preparing map surfaces… ${Math.round((done / total) * 100)}%`,
        'map-materials',
      );
    },
  });
  console.info('[map] materials', matStats);

  const colliders: THREE.Mesh[] = [];
  mapScaled.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    colliders.push(mesh);
  });

  group.add(mapScaled);

  await beginStage('Sampling terrain…', 'map-terrain', 0.76);

  // Play bounds from the robust box (scaled), not the outlier-inflated AABB
  const bounds = new THREE.Box3(
    new THREE.Vector3(
      (robust.box.min.x - rawCenter.x) * scale,
      0,
      (robust.box.min.z - rawCenter.z) * scale,
    ),
    new THREE.Vector3(
      (robust.box.max.x - rawCenter.x) * scale,
      (robust.box.max.y - robust.box.min.y) * scale,
      (robust.box.max.z - rawCenter.z) * scale,
    ),
  );
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const mapHalfExtent = Math.max(size.x, size.z) * 0.5;
  // Map ready: scaled into play area with raycast height sampling

  const { getGroundHeight, probeClearance, probeSurfaceMat } = buildHeightTools(
    colliders,
    bounds,
    FALLBACK_GROUND_Y,
    bake.heightGridResolution,
  );

  // Derive AABB proxies + spatial hash for heli vs buildings (no physics engine)
  await beginStage('Building collision map…', 'map-collision', 0.82);
  let collision: WorldCollision | null = null;
  try {
    collision = WorldCollision.fromMeshes(colliders, bounds, {
      maxColliders: bake.maxColliders,
      minBuildingHeight: 2.0,
      minFootprint: 2.2,
    });
    collision.setGroundHeightSampler(getGroundHeight);
    // Rim slabs so chase-cam occlusion works at map edges even when fence
    // meshes were filtered out of the bake.
    const rim = collision.ensurePerimeterWalls(mapHalfExtent);
    if (rim > 0) {
      console.info('[collision] perimeter camera walls', { count: rim, mapHalfExtent });
    }
  } catch (err) {
    console.warn('[map] building collision bake failed', err);
  }

  // Prefer open outdoor ground with clear sky (avoid hangar pits / under-roofs)
  await beginStage('Finding a safe spawn…', 'map-spawn', 0.89);
  const open = findOpenSpawn(
    getGroundHeight,
    mapHalfExtent,
    probeClearance,
    probeSurfaceMat,
    {
      gridSize: bake.spawnGridSize,
      probeSurface: bake.probeSpawnSurface,
    },
  );
  const spawnPosition = new THREE.Vector3(open.x, open.groundY + SPAWN_HOVER, open.z);
  console.info('[map] spawn', {
    x: open.x,
    z: open.z,
    groundY: open.groundY,
    heliY: spawnPosition.y,
    clearance: probeClearance(open.x, open.z, open.groundY),
  });

  const landingPad = createLandingPad();
  landingPad.position.set(open.x, open.groundY + 0.12, open.z);
  group.add(landingPad);

  // Procedural military-island layer — overlays Fruzer with PBR districts/ocean
  await beginStage('Dressing the island…', 'map-environment', 0.94);
  const environment = createEnvironmentLayer({
    getGroundHeight,
    mapHalfExtent,
    spawn: spawnPosition,
    parent: group,
    underlayRoot: mapScaled,
    tier,
  });

  scene.add(group);

  draco.dispose();

  options.onStage?.('Map ready', 'map-ready');
  onProgress?.(1);

  return {
    group,
    water: environment.water,
    landingPad,
    spawnPosition,
    getGroundHeight,
    collision,
    mapHalfExtent,
    bounds,
    sky,
    sunDisc,
    environment,
  };
}

/**
 * Build a figure-eight ring course above the map surface.
 * Positions are world-space [x, y, z].
 */
export function buildFigureEightRingLayout(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  count = 10,
): Array<[number, number, number]> {
  const a = mapHalfExtent * 0.55;
  const layout: Array<[number, number, number]> = [];

  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    // Lemniscate of Bernoulli (figure-eight) in XZ
    const s = Math.sin(t);
    const c = Math.cos(t);
    const denom = 1 + s * s;
    const x = (a * c) / denom;
    const z = (a * s * c) / denom;
    const ground = getGroundHeight(x, z);
    // Keep rings well above dirt pits / hangar floors on large Fruzer scale
    const alt = 20 + (i % 3) * 6 + Math.sin(i * 1.3) * 4;
    layout.push([x, ground + alt, z]);
  }

  return layout;
}
