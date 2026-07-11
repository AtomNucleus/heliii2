import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import {
  createRng,
  makeBasic,
  sampleGroundPoints,
  setInstanceMatrix,
} from './envUtil';
import type { EnvBudget } from './envBudget';

export interface VegetationHandle {
  group: THREE.Group;
  setVisibleCount(trees: number, bushes: number): void;
  dispose(): void;
}

/**
 * Instanced pines + scrub bushes for yard edges and outer ring.
 */
export function createVegetation(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): VegetationHandle {
  const group = new THREE.Group();
  group.name = 'env-vegetation';

  const rng = createRng(0x7e9a11);
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.ConeGeometry(1, 1.6, 6);
  canopyGeo.translate(0, 0.8, 0);
  const bushGeo = new THREE.DodecahedronGeometry(0.55, 0);

  const trunkMat = makeBasic(0x4a3020);
  const pineMat = makeBasic(COLORS.pine);
  const pineDarkMat = makeBasic(COLORS.pineDark);
  const bushMat = makeBasic(COLORS.grassDark);

  const maxT = budget.trees;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, maxT);
  const canopies = new THREE.InstancedMesh(canopyGeo, pineMat, maxT);
  const canopiesDark = new THREE.InstancedMesh(canopyGeo, pineDarkMat, maxT);
  trunks.name = 'tree-trunks';
  canopies.name = 'tree-canopies';
  canopiesDark.name = 'tree-canopies-dark';

  const treeSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxT * 3,
    rng,
    { spawn, clearRadius: 16, margin: 0.1, maxSlope: 4.2 },
  );

  // Prefer outer ring for trees
  treeSamples.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));

  let ti = 0;
  let ci = 0;
  let cdi = 0;
  for (const s of treeSamples) {
    if (ti >= maxT) break;
    if (Math.hypot(s.x, s.z) < mapHalfExtent * 0.28) continue;
    const yaw = rng() * Math.PI * 2;
    quat.setFromAxisAngle(yAxis, yaw);
    const scale = 0.75 + rng() * 1.1;
    pos.set(s.x, s.y, s.z);
    scl.set(scale, scale * (0.9 + rng() * 0.35), scale);
    setInstanceMatrix(trunks, ti++, pos, quat, scl, dummy);

    pos.y = s.y + 1.05 * scale;
    scl.set(scale * 1.15, scale, scale * 1.15);
    if (rng() > 0.45) {
      setInstanceMatrix(canopies, ci++, pos, quat, scl, dummy);
    } else {
      setInstanceMatrix(canopiesDark, cdi++, pos, quat, scl, dummy);
    }

    // Second canopy layer
    if (rng() > 0.35 && ti < maxT + 2) {
      pos.y = s.y + 1.7 * scale;
      scl.set(scale * 0.85, scale * 0.85, scale * 0.85);
      if (ci < maxT) setInstanceMatrix(canopies, ci++, pos, quat, scl, dummy);
      else if (cdi < maxT) setInstanceMatrix(canopiesDark, cdi++, pos, quat, scl, dummy);
    }
  }

  trunks.count = ti;
  canopies.count = Math.min(ci, maxT);
  canopiesDark.count = Math.min(cdi, maxT);
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  canopiesDark.instanceMatrix.needsUpdate = true;
  group.add(trunks, canopies, canopiesDark);

  const maxB = budget.bushes;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, maxB);
  bushes.name = 'bushes';
  const bushSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxB * 2,
    rng,
    { spawn, clearRadius: 12, margin: 0.12, maxSlope: 3.5 },
  );
  let bi = 0;
  for (const s of bushSamples) {
    if (bi >= maxB) break;
    quat.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
    const scale = 0.55 + rng() * 0.9;
    pos.set(s.x, s.y + 0.25 * scale, s.z);
    scl.set(scale * (0.8 + rng() * 0.5), scale * (0.55 + rng() * 0.4), scale);
    setInstanceMatrix(bushes, bi++, pos, quat, scl, dummy);
  }
  bushes.count = bi;
  bushes.instanceMatrix.needsUpdate = true;
  group.add(bushes);

  const maxTreesPlaced = ti;
  const maxCanopy = canopies.count;
  const maxCanopyDark = canopiesDark.count;
  const maxBushesPlaced = bi;

  return {
    group,
    setVisibleCount(trees: number, bushCount: number) {
      const tCap = Math.min(trees, maxTreesPlaced);
      trunks.count = tCap;
      const canopyTotal = maxCanopy + maxCanopyDark;
      const cWant = Math.min(canopyTotal, Math.ceil(tCap * 1.4));
      canopies.count = Math.min(maxCanopy, Math.ceil(cWant * 0.55));
      canopiesDark.count = Math.min(maxCanopyDark, Math.floor(cWant * 0.45));
      bushes.count = Math.min(bushCount, maxBushesPlaced);
    },
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.InstancedMesh;
        if (m.isInstancedMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      group.parent?.remove(group);
    },
  };
}
