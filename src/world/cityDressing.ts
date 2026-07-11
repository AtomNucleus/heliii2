import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import {
  createRng,
  makeBasic,
  sampleGroundPoints,
  setInstanceMatrix,
  type PlacementSample,
} from './envUtil';
import type { EnvBudget } from './envBudget';

export interface CityDressingHandle {
  group: THREE.Group;
  setVisibleCount(buildings: number, rooftops: number): void;
  dispose(): void;
}

/**
 * Instanced low-poly city dressing: blocky sheds, warehouses, rooftop clutter.
 * Sits on Fruzer ground without replacing the licensed base mesh.
 */
export function createCityDressing(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): CityDressingHandle {
  const group = new THREE.Group();
  group.name = 'env-city';

  const rng = createRng(0xc17a51);
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  buildingGeo.translate(0, 0.5, 0);
  const wallMat = makeBasic(0x4a5560, { name: 'env-building' });
  const wallMatB = makeBasic(0x3a4552, { name: 'env-building-b' });
  const roofMat = makeBasic(0x2a323c, { name: 'env-roof' });
  const accentMat = makeBasic(COLORS.tealMid, { name: 'env-accent' });

  const maxB = budget.buildings;
  const bodies = new THREE.InstancedMesh(buildingGeo, wallMat, maxB);
  const bodiesB = new THREE.InstancedMesh(buildingGeo, wallMatB, maxB);
  const roofs = new THREE.InstancedMesh(buildingGeo, roofMat, maxB);
  const accents = new THREE.InstancedMesh(buildingGeo, accentMat, Math.ceil(maxB * 0.5));
  bodies.name = 'city-bodies';
  bodiesB.name = 'city-bodies-b';
  roofs.name = 'city-roofs';
  accents.name = 'city-accents';

  const samples = sampleGroundPoints(getGroundHeight, mapHalfExtent, maxB * 2, rng, {
    spawn,
    clearRadius: 22,
    margin: 0.18,
    maxSlope: 2.8,
  });

  samples.sort((a, b) => {
    const da = Math.hypot(a.x, a.z);
    const db = Math.hypot(b.x, b.z);
    const ideal = mapHalfExtent * 0.42;
    return Math.abs(da - ideal) - Math.abs(db - ideal);
  });

  let bi = 0;
  let biB = 0;
  let ri = 0;
  let ai = 0;
  const used: PlacementSample[] = [];
  const heights: number[] = [];

  for (const s of samples) {
    if (bi + biB >= maxB) break;
    if (used.some((u) => Math.hypot(u.x - s.x, u.z - s.z) < 7.5)) continue;
    used.push(s);

    const yaw = rng() * Math.PI * 2;
    quat.setFromAxisAngle(yAxis, yaw);
    const w = 3.2 + rng() * 5.5;
    const d = 3.0 + rng() * 4.8;
    const h = 3.5 + rng() * 9.5;
    heights.push(h);
    pos.set(s.x, s.y, s.z);
    scl.set(w, h, d);

    if (rng() > 0.55) {
      setInstanceMatrix(bodiesB, biB++, pos, quat, scl, dummy);
    } else {
      setInstanceMatrix(bodies, bi++, pos, quat, scl, dummy);
    }

    pos.y = s.y + h;
    scl.set(w * 1.06, 0.35 + rng() * 0.25, d * 1.06);
    setInstanceMatrix(roofs, ri++, pos, quat, scl, dummy);

    if (rng() > 0.55 && ai < accents.count) {
      pos.set(s.x, s.y, s.z);
      scl.set(w * 0.12, h * 0.92, d * 1.02);
      setInstanceMatrix(accents, ai++, pos, quat, scl, dummy);
    }
  }

  bodies.count = bi;
  bodiesB.count = biB;
  roofs.count = ri;
  accents.count = ai;
  bodies.instanceMatrix.needsUpdate = true;
  bodiesB.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  accents.instanceMatrix.needsUpdate = true;
  group.add(bodies, bodiesB, roofs, accents);

  const propGeo = new THREE.BoxGeometry(1, 1, 1);
  propGeo.translate(0, 0.5, 0);
  const propMat = makeBasic(0x5a6570);
  const ventMat = makeBasic(0x6a7885);
  const ventGeo = new THREE.CylinderGeometry(0.35, 0.4, 1, 6);
  const maxP = budget.rooftopProps;
  const props = new THREE.InstancedMesh(propGeo, propMat, maxP);
  const vents = new THREE.InstancedMesh(ventGeo, ventMat, maxP);
  props.name = 'rooftop-props';
  vents.name = 'rooftop-vents';

  let pi = 0;
  let vi = 0;
  for (let i = 0; i < used.length; i++) {
    if (pi >= maxP && vi >= maxP) break;
    const s = used[i];
    const h = heights[i] ?? 6;
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const ox = (rng() - 0.5) * 2.5;
      const oz = (rng() - 0.5) * 2.5;
      quat.setFromAxisAngle(yAxis, rng() * Math.PI);
      if (rng() > 0.45 && pi < maxP) {
        pos.set(s.x + ox, s.y + h, s.z + oz);
        scl.set(0.7 + rng() * 0.9, 0.5 + rng() * 0.7, 0.7 + rng() * 0.9);
        setInstanceMatrix(props, pi++, pos, quat, scl, dummy);
      } else if (vi < maxP) {
        pos.set(s.x + ox, s.y + h + 0.4, s.z + oz);
        scl.set(1, 0.6 + rng() * 0.8, 1);
        setInstanceMatrix(vents, vi++, pos, quat, scl, dummy);
      }
    }
  }
  props.count = pi;
  vents.count = vi;
  props.instanceMatrix.needsUpdate = true;
  vents.instanceMatrix.needsUpdate = true;
  group.add(props, vents);

  const maxBuildingsPlaced = ri;
  const maxPropsPlaced = pi;
  const maxVentsPlaced = vi;
  const bodySplit = bi;

  return {
    group,
    setVisibleCount(buildings: number, rooftops: number) {
      const bCap = Math.min(buildings, maxBuildingsPlaced);
      const ratio = bodySplit / Math.max(1, maxBuildingsPlaced);
      bodies.count = Math.min(bi, Math.floor(bCap * ratio));
      bodiesB.count = Math.min(biB, bCap - bodies.count);
      roofs.count = bCap;
      accents.count = Math.min(ai, Math.ceil(bCap * 0.5));
      const pCap = Math.min(rooftops, maxPropsPlaced + maxVentsPlaced);
      props.count = Math.min(maxPropsPlaced, Math.ceil(pCap * 0.55));
      vents.count = Math.min(maxVentsPlaced, Math.floor(pCap * 0.45));
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
