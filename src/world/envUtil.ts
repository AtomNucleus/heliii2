import * as THREE from 'three';

/** Deterministic mulberry32 PRNG */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix: number, iz: number, salt = 0): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/** Shared unlit material matching Fruzer MeshBasic look */
export function makeBasic(
  color: number,
  opts: {
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    side?: THREE.Side;
    name?: string;
  } = {},
): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.name) mat.name = opts.name;
  return mat;
}

export function makeEmissiveBasic(
  color: number,
  intensity = 1,
): THREE.MeshBasicMaterial {
  // MeshBasic has no emissive — bake brightness into color + additive overlays
  const c = new THREE.Color(color);
  c.multiplyScalar(0.65 + intensity * 0.55);
  return new THREE.MeshBasicMaterial({
    color: c,
    transparent: intensity > 1.05,
    opacity: Math.min(1, 0.75 + intensity * 0.2),
    depthWrite: intensity <= 1.05,
  });
}

export interface PlacementSample {
  x: number;
  z: number;
  y: number;
  flatness: number;
}

/**
 * Sample candidate ground points across the play area.
 * Prefers flatter outdoor band; rejects spawn neighborhood.
 */
export function sampleGroundPoints(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  count: number,
  rng: () => number,
  opts: {
    spawn?: THREE.Vector3;
    clearRadius?: number;
    margin?: number;
    maxSlope?: number;
  } = {},
): PlacementSample[] {
  const margin = opts.margin ?? 0.12;
  const half = mapHalfExtent * (1 - margin);
  const clearR = opts.clearRadius ?? 14;
  const spawn = opts.spawn;
  const maxSlope = opts.maxSlope ?? 3.5;
  const out: PlacementSample[] = [];
  const maxTries = count * 8;

  for (let i = 0; i < maxTries && out.length < count; i++) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    if (spawn && Math.hypot(x - spawn.x, z - spawn.z) < clearR) continue;
    const y = getGroundHeight(x, z);
    if (!Number.isFinite(y) || Math.abs(y) < 1e-4) continue;
    const yx = getGroundHeight(x + 1.2, z);
    const yz = getGroundHeight(x, z + 1.2);
    const slope = Math.max(Math.abs(yx - y), Math.abs(yz - y));
    if (slope > maxSlope) continue;
    out.push({ x, z, y, flatness: 1 / (1 + slope) });
  }
  return out;
}

export function setInstanceMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3,
  dummy: THREE.Object3D,
) {
  dummy.position.copy(position);
  dummy.quaternion.copy(quaternion);
  dummy.scale.copy(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}
