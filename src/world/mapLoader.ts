import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { COLORS } from '../scene/setup';

/** Target play-area width (largest XZ extent after scale), in world units */
export const MAP_TARGET_SIZE = 320;
/** Fallback ground Y when a raycast misses */
export const FALLBACK_GROUND_Y = 0;
/** Height-sample grid resolution (cells per side) */
export const HEIGHT_GRID_RES = 96;
/** Ray origin height above map max Y */
export const HEIGHT_RAY_LIFT = 80;

export const MAP_URL = './maps/fruzer-polygon.glb';
export const DRACO_DECODER_PATH = './draco/';

export interface WorldObjects {
  group: THREE.Group;
  water: THREE.Mesh | null;
  landingPad: THREE.Group;
  spawnPosition: THREE.Vector3;
  getGroundHeight: (x: number, z: number) => number;
  /** Half-extent of playable XZ after scale (approx) */
  mapHalfExtent: number;
  bounds: THREE.Box3;
}

function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      midColor: { value: new THREE.Color(0x5a3a50) },
      horizonColor: { value: new THREE.Color(COLORS.skyHorizon) },
      bottomColor: { value: new THREE.Color(COLORS.tealDeep) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col;
        if (h > 0.15) {
          float t = clamp((h - 0.15) / 0.85, 0.0, 1.0);
          col = mix(midColor, topColor, t);
        } else if (h > -0.05) {
          float t = clamp((h + 0.05) / 0.2, 0.0, 1.0);
          col = mix(horizonColor, midColor, t);
        } else {
          float t = clamp((h + 0.4) / 0.35, 0.0, 1.0);
          col = mix(bottomColor, horizonColor, t);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

function createSun(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(90, 38, -70);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 16),
    new THREE.MeshBasicMaterial({ color: COLORS.orangeSun }),
  );
  group.add(sun);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(18, 16, 16),
    new THREE.MeshBasicMaterial({
      color: COLORS.orangeGlow,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  group.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(28, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffaa66,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  group.add(halo);

  return group;
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

function buildHeightSampler(
  colliders: THREE.Object3D[],
  bounds: THREE.Box3,
  fallbackY: number,
): (x: number, z: number) => number {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const res = HEIGHT_GRID_RES;
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

  const sampleRaw = (x: number, z: number): number => {
    origin.set(x, rayTop, z);
    raycaster.set(origin, down);
    raycaster.far = rayTop - bounds.min.y + 40;
    const hits = raycaster.intersectObjects(colliders, false);
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

  return (x: number, z: number) => {
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
}

const SPAWN_GRID = 11;
/** Central fraction of mapHalfExtent used for spawn search */
const SPAWN_SEARCH_FRACTION = 0.4;
/** Reject deep pits / water-like samples when better options exist */
const SPAWN_MIN_FLOOR_Y = 0.5;

export interface OpenSpawn {
  x: number;
  z: number;
  groundY: number;
}

/**
 * Sample a grid in the central ~40% of the map and pick open ground:
 * prefer local height minima (valleys / plazas, not rooftops), then lowest Y,
 * while avoiding deep pits when possible.
 */
export function findOpenSpawn(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
): OpenSpawn {
  const half = mapHalfExtent * SPAWN_SEARCH_FRACTION;
  const n = SPAWN_GRID;
  const heights: number[][] = [];
  const xs: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    xs.push(-half + t * half * 2);
    zs.push(-half + t * half * 2);
  }

  for (let iz = 0; iz < n; iz++) {
    heights[iz] = [];
    for (let ix = 0; ix < n; ix++) {
      heights[iz][ix] = getGroundHeight(xs[ix], zs[iz]);
    }
  }

  type Candidate = { ix: number; iz: number; y: number; localMin: boolean };
  const candidates: Candidate[] = [];

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const y = heights[iz][ix];
      let localMin = true;
      for (let dz = -1; dz <= 1 && localMin; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nix = ix + dx;
          const niz = iz + dz;
          if (nix < 0 || niz < 0 || nix >= n || niz >= n) continue;
          if (heights[niz][nix] < y - 0.05) {
            localMin = false;
            break;
          }
        }
      }
      candidates.push({ ix, iz, y, localMin });
    }
  }

  const aboveFloor = candidates.filter((c) => c.y >= SPAWN_MIN_FLOOR_Y);
  const pool = aboveFloor.length > 0 ? aboveFloor : candidates;
  const localMins = pool.filter((c) => c.localMin);
  const ranked = (localMins.length > 0 ? localMins : pool).slice().sort((a, b) => a.y - b.y);
  const best = ranked[0] ?? { ix: Math.floor(n / 2), iz: Math.floor(n / 2), y: FALLBACK_GROUND_Y };

  return {
    x: xs[best.ix],
    z: zs[best.iz],
    groundY: best.y,
  };
}

/**
 * Load the Fruzer Polygon GLB, center/scale into the play area,
 * and return a world object compatible with the game loop.
 */
export async function loadMapWorld(
  scene: THREE.Scene,
  onProgress?: (ratio: number) => void,
): Promise<WorldObjects> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const gltf = await new Promise<Awaited<ReturnType<typeof loader.loadAsync>>>((resolve, reject) => {
    loader.load(
      MAP_URL,
      resolve,
      (ev) => {
        if (ev.total > 0 && onProgress) onProgress(ev.loaded / ev.total);
      },
      reject,
    );
  });

  const group = new THREE.Group();
  group.name = 'world';

  scene.add(createSkyDome());
  scene.add(createSun());

  const mapRoot = gltf.scene;
  mapRoot.name = 'fruzerPolygon';

  // Measure raw bounds, then center in local space and scale via a wrapper
  // so translation is not left unscaled (Three applies T*R*S).
  mapRoot.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(mapRoot);
  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  rawBox.getSize(rawSize);
  rawBox.getCenter(rawCenter);

  const horiz = Math.max(rawSize.x, rawSize.z, 1);
  const scale = MAP_TARGET_SIZE / horiz;

  mapRoot.position.set(-rawCenter.x, -rawBox.min.y, -rawCenter.z);

  const mapScaled = new THREE.Group();
  mapScaled.name = 'fruzerPolygonScaled';
  mapScaled.scale.setScalar(scale);
  mapScaled.add(mapRoot);
  mapScaled.updateMatrixWorld(true);

  const colliders: THREE.Mesh[] = [];
  mapScaled.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Avoid self-shadow crush on mobile / software GL; still receive shadows
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
        if ('emissiveMap' in std && std.emissiveMap) {
          std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        }
        if ('metalness' in std) std.metalness = 0;
        if ('roughness' in std) std.roughness = 0.9;
        std.needsUpdate = true;
      }
    }
    colliders.push(mesh);
  });

  group.add(mapScaled);

  const bounds = new THREE.Box3().setFromObject(mapScaled);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const mapHalfExtent = Math.max(size.x, size.z) * 0.5;
  // Map ready: scaled into play area with raycast height sampling

  const getGroundHeight = buildHeightSampler(colliders, bounds, FALLBACK_GROUND_Y);

  // Prefer open-ground local minima in the central map (avoid rooftops)
  const open = findOpenSpawn(getGroundHeight, mapHalfExtent);
  const spawnPosition = new THREE.Vector3(open.x, open.groundY + 6, open.z);

  const landingPad = createLandingPad();
  landingPad.position.set(open.x, open.groundY + 0.12, open.z);
  group.add(landingPad);

  scene.add(group);

  draco.dispose();

  onProgress?.(1);

  return {
    group,
    water: null,
    landingPad,
    spawnPosition,
    getGroundHeight,
    mapHalfExtent,
    bounds,
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
    const alt = 10 + (i % 3) * 3.5 + Math.sin(i * 1.3) * 2;
    layout.push([x, ground + alt, z]);
  }

  return layout;
}
