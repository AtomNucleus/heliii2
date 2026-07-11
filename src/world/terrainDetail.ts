import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import {
  createRng,
  makeBasic,
  sampleGroundPoints,
  setInstanceMatrix,
} from './envUtil';
import type { EnvBudget } from './envBudget';

export interface TerrainDetailHandle {
  group: THREE.Group;
  setVisibleCount(patches: number, rubble: number): void;
  dispose(): void;
}

/**
 * Ground-level detail: dirt/scorch patches and rubble piles.
 * Cheap instanced quads + low-poly rocks for aerial readability.
 */
export function createTerrainDetail(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): TerrainDetailHandle {
  const group = new THREE.Group();
  group.name = 'env-terrain-detail';

  const rng = createRng(0x7e44a1);
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  const patchGeo = new THREE.CircleGeometry(1, 8);
  const dirtMat = makeBasic(0x5a4632, {
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const scorchMat = makeBasic(0x2a2218, {
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sandMat = makeBasic(COLORS.sand, {
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const maxP = budget.groundPatches;
  const dirt = new THREE.InstancedMesh(patchGeo, dirtMat, maxP);
  const scorch = new THREE.InstancedMesh(patchGeo, scorchMat, Math.ceil(maxP * 0.4));
  const sand = new THREE.InstancedMesh(patchGeo, sandMat, Math.ceil(maxP * 0.35));
  dirt.name = 'dirt-patches';
  scorch.name = 'scorch-patches';
  sand.name = 'sand-patches';
  dirt.renderOrder = 1;
  scorch.renderOrder = 1;
  sand.renderOrder = 1;

  const samples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxP * 2,
    rng,
    { spawn, clearRadius: 8, margin: 0.08, maxSlope: 3.0 },
  );

  let di = 0;
  let si = 0;
  let sai = 0;
  for (const s of samples) {
    if (di + si + sai >= maxP) break;
    quat.copy(qFlat);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, rng() * Math.PI));
    pos.set(s.x, s.y + 0.035, s.z);
    const r = 1.4 + rng() * 3.2;
    scl.set(r, r, 1);
    const roll = rng();
    if (roll < 0.5 && di < dirt.count) {
      setInstanceMatrix(dirt, di++, pos, quat, scl, dummy);
    } else if (roll < 0.78 && si < scorch.count) {
      scl.multiplyScalar(0.75);
      setInstanceMatrix(scorch, si++, pos, quat, scl, dummy);
    } else if (sai < sand.count) {
      setInstanceMatrix(sand, sai++, pos, quat, scl, dummy);
    }
  }
  dirt.count = di;
  scorch.count = si;
  sand.count = sai;
  dirt.instanceMatrix.needsUpdate = true;
  scorch.instanceMatrix.needsUpdate = true;
  sand.instanceMatrix.needsUpdate = true;
  group.add(dirt, scorch, sand);

  // Rubble
  const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const rockMat = makeBasic(COLORS.rock);
  const rockDarkMat = makeBasic(COLORS.rockDark);
  const maxR = budget.rubble;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, maxR);
  const rocksDark = new THREE.InstancedMesh(rockGeo, rockDarkMat, maxR);
  rocks.name = 'rubble';
  rocksDark.name = 'rubble-dark';

  const rockSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxR * 2,
    rng,
    { spawn, clearRadius: 10, margin: 0.12, maxSlope: 4.0 },
  );
  let ri = 0;
  let rdi = 0;
  for (const s of rockSamples) {
    if (ri + rdi >= maxR) break;
    quat.setFromEuler(
      new THREE.Euler(rng() * 0.8, rng() * Math.PI * 2, rng() * 0.8),
    );
    const sc = 0.5 + rng() * 1.1;
    pos.set(s.x, s.y + 0.12 * sc, s.z);
    scl.set(sc * (0.8 + rng() * 0.5), sc * (0.45 + rng() * 0.4), sc);
    if (rng() > 0.45) setInstanceMatrix(rocks, ri++, pos, quat, scl, dummy);
    else setInstanceMatrix(rocksDark, rdi++, pos, quat, scl, dummy);
  }
  rocks.count = ri;
  rocksDark.count = rdi;
  rocks.instanceMatrix.needsUpdate = true;
  rocksDark.instanceMatrix.needsUpdate = true;
  group.add(rocks, rocksDark);

  const placed = {
    dirt: di,
    scorch: si,
    sand: sai,
    rocks: ri,
    rocksDark: rdi,
    patches: di + si + sai,
    rubble: ri + rdi,
  };

  return {
    group,
    setVisibleCount(patches: number, rubble: number) {
      const pCap = Math.min(patches, placed.patches);
      const pr = pCap / Math.max(1, placed.patches);
      dirt.count = Math.floor(placed.dirt * pr);
      scorch.count = Math.floor(placed.scorch * pr);
      sand.count = Math.floor(placed.sand * pr);
      const rCap = Math.min(rubble, placed.rubble);
      const rr = rCap / Math.max(1, placed.rubble);
      rocks.count = Math.floor(placed.rocks * rr);
      rocksDark.count = Math.floor(placed.rocksDark * rr);
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
