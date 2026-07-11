import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import {
  createRng,
  makeBasic,
  sampleGroundPoints,
  setInstanceMatrix,
} from './envUtil';
import type { EnvBudget } from './envBudget';

export interface RoadsPropsHandle {
  group: THREE.Group;
  setVisibleCount(opts: {
    streetLamps: number;
    barriers: number;
    crates: number;
    cones: number;
  }): void;
  dispose(): void;
}

/**
 * Street furniture + yard props: lamps, jersey barriers, crates, cones.
 * Includes subtle asphalt patches as road dressing overlays.
 */
export function createRoadsProps(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): RoadsPropsHandle {
  const group = new THREE.Group();
  group.name = 'env-roads-props';

  const rng = createRng(0x50ad01);
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  // --- Asphalt patches ---
  const patchGeo = new THREE.PlaneGeometry(1, 1);
  const patchMat = makeBasic(0x2a2e34, {
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    name: 'road-patch',
  });
  const patchCount = Math.min(40, Math.floor(budget.groundPatches * 0.45));
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, patchCount);
  patches.name = 'road-patches';
  patches.renderOrder = 1;
  const patchSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    patchCount * 2,
    rng,
    { spawn, clearRadius: 10, margin: 0.2, maxSlope: 1.8 },
  );
  let pi = 0;
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (const s of patchSamples) {
    if (pi >= patchCount) break;
    quat.copy(qFlat);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, rng() * Math.PI));
    pos.set(s.x, s.y + 0.04, s.z);
    const w = 4 + rng() * 8;
    const d = 2.5 + rng() * 5;
    scl.set(w, d, 1);
    setInstanceMatrix(patches, pi++, pos, quat, scl, dummy);
  }
  patches.count = pi;
  patches.instanceMatrix.needsUpdate = true;
  group.add(patches);

  // --- Street lamps ---
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1, 5);
  poleGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.BoxGeometry(0.55, 0.12, 0.35);
  const poleMat = makeBasic(0x333840);
  const headMat = makeBasic(COLORS.orangeGlow);
  const maxL = budget.streetLamps;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, maxL);
  const heads = new THREE.InstancedMesh(headGeo, headMat, maxL);
  poles.name = 'street-poles';
  heads.name = 'street-heads';

  const lampSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxL * 2,
    rng,
    { spawn, clearRadius: 14, margin: 0.16, maxSlope: 2.2 },
  );
  let li = 0;
  for (const s of lampSamples) {
    if (li >= maxL) break;
    quat.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
    const h = 4.2 + rng() * 1.4;
    pos.set(s.x, s.y, s.z);
    scl.set(1, h, 1);
    setInstanceMatrix(poles, li, pos, quat, scl, dummy);
    pos.y = s.y + h;
    scl.set(1, 1, 1);
    setInstanceMatrix(heads, li, pos, quat, scl, dummy);
    li++;
  }
  poles.count = li;
  heads.count = li;
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(poles, heads);

  // --- Jersey barriers ---
  const barrierGeo = new THREE.BoxGeometry(1, 1, 1);
  barrierGeo.translate(0, 0.5, 0);
  const barrierMat = makeBasic(0xc8c2b4);
  const stripeMat = makeBasic(COLORS.orangeSun);
  const maxBar = budget.barriers;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, maxBar);
  const stripes = new THREE.InstancedMesh(barrierGeo, stripeMat, maxBar);
  barriers.name = 'barriers';
  stripes.name = 'barrier-stripes';

  const barSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxBar * 2,
    rng,
    { spawn, clearRadius: 12, margin: 0.15, maxSlope: 2.0 },
  );
  let bi = 0;
  for (const s of barSamples) {
    if (bi >= maxBar) break;
    const yaw = rng() * Math.PI * 2;
    quat.setFromAxisAngle(yAxis, yaw);
    pos.set(s.x, s.y, s.z);
    scl.set(2.4 + rng() * 1.2, 0.85, 0.45);
    setInstanceMatrix(barriers, bi, pos, quat, scl, dummy);
    pos.y = s.y + 0.55;
    scl.set(2.45, 0.18, 0.48);
    setInstanceMatrix(stripes, bi, pos, quat, scl, dummy);
    bi++;
  }
  barriers.count = bi;
  stripes.count = bi;
  barriers.instanceMatrix.needsUpdate = true;
  stripes.instanceMatrix.needsUpdate = true;
  group.add(barriers, stripes);

  // --- Crates ---
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  crateGeo.translate(0, 0.5, 0);
  const crateMat = makeBasic(0x6a4a28);
  const crateMatB = makeBasic(0x4a5a48);
  const maxC = budget.crates;
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, maxC);
  const cratesB = new THREE.InstancedMesh(crateGeo, crateMatB, maxC);
  crates.name = 'crates';
  cratesB.name = 'crates-b';
  const crateSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxC * 2,
    rng,
    { spawn, clearRadius: 11, margin: 0.18, maxSlope: 2.5 },
  );
  let ci = 0;
  let ciB = 0;
  for (const s of crateSamples) {
    if (ci + ciB >= maxC) break;
    quat.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
    const sz = 0.7 + rng() * 0.9;
    pos.set(s.x, s.y, s.z);
    scl.set(sz, sz * (0.7 + rng() * 0.5), sz);
    if (rng() > 0.5) setInstanceMatrix(crates, ci++, pos, quat, scl, dummy);
    else setInstanceMatrix(cratesB, ciB++, pos, quat, scl, dummy);
  }
  crates.count = ci;
  cratesB.count = ciB;
  crates.instanceMatrix.needsUpdate = true;
  cratesB.instanceMatrix.needsUpdate = true;
  group.add(crates, cratesB);

  // --- Traffic cones ---
  const coneGeo = new THREE.ConeGeometry(0.28, 0.7, 6);
  coneGeo.translate(0, 0.35, 0);
  const coneMat = makeBasic(COLORS.orangeHot);
  const maxCone = budget.cones;
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, maxCone);
  cones.name = 'cones';
  const coneSamples = sampleGroundPoints(
    getGroundHeight,
    mapHalfExtent,
    maxCone * 2,
    rng,
    { spawn, clearRadius: 9, margin: 0.2, maxSlope: 2.2 },
  );
  let coi = 0;
  for (const s of coneSamples) {
    if (coi >= maxCone) break;
    quat.setFromAxisAngle(yAxis, rng() * Math.PI);
    pos.set(s.x, s.y, s.z);
    const sc = 0.85 + rng() * 0.4;
    scl.set(sc, sc, sc);
    setInstanceMatrix(cones, coi++, pos, quat, scl, dummy);
  }
  cones.count = coi;
  cones.instanceMatrix.needsUpdate = true;
  group.add(cones);

  const placed = {
    lamps: li,
    barriers: bi,
    crates: ci + ciB,
    cratesA: ci,
    cratesB: ciB,
    cones: coi,
    patches: pi,
  };

  return {
    group,
    setVisibleCount(opts) {
      const l = Math.min(opts.streetLamps, placed.lamps);
      poles.count = l;
      heads.count = l;
      const b = Math.min(opts.barriers, placed.barriers);
      barriers.count = b;
      stripes.count = b;
      const c = Math.min(opts.crates, placed.crates);
      const ratio = placed.cratesA / Math.max(1, placed.crates);
      crates.count = Math.min(placed.cratesA, Math.floor(c * ratio));
      cratesB.count = Math.min(placed.cratesB, c - crates.count);
      cones.count = Math.min(opts.cones, placed.cones);
      patches.count = Math.min(
        placed.patches,
        Math.max(8, Math.floor(placed.patches * (l / Math.max(1, placed.lamps)))),
      );
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
