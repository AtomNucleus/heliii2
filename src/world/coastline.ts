import * as THREE from 'three';
import { createEnvMaterialKit } from './materials';
import {
  createRng,
  disposeObject3D,
  enableShadows,
  setInstanceMatrix,
} from './envUtil';
import type { EnvBudget } from './envBudget';

export interface CoastlineHandle {
  group: THREE.Group;
  setVisibleCount(detail: number): void;
  dispose(): void;
}

/**
 * Shoreline dressing: sand crescents, coastal rocks, and pier stubs
 * that sell the island silhouette from altitude.
 */
export function createCoastline(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
): CoastlineHandle {
  const group = new THREE.Group();
  group.name = 'env-coastline';
  const kit = createEnvMaterialKit();
  const rng = createRng(0xc0a57e);
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  const detail = Math.max(4, budget.oceanDetail);
  const sandCount = detail * 4;
  const rockCount = detail * 5;
  const pierCount = Math.min(4, Math.ceil(detail * 0.5));

  // Sand crescents along the outer ring
  const sandGeo = new THREE.CircleGeometry(1, 7);
  const sands = new THREE.InstancedMesh(sandGeo, kit.sand.clone(), sandCount);
  sands.name = 'coast-sand';
  sands.renderOrder = 1;
  enableShadows(sands, false, true);

  let si = 0;
  for (let i = 0; i < sandCount; i++) {
    const a = (i / sandCount) * Math.PI * 2 + rng() * 0.08;
    const r = mapHalfExtent * (0.86 + rng() * 0.08);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = getGroundHeight(x, z);
    quat.copy(qFlat);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, a + rng()));
    pos.set(x, Math.max(0.02, y) + 0.04, z);
    const sc = 2.2 + rng() * 3.5;
    scl.set(sc * (0.7 + rng() * 0.6), sc, 1);
    setInstanceMatrix(sands, si++, pos, quat, scl, dummy);
  }
  sands.count = si;
  sands.instanceMatrix.needsUpdate = true;
  group.add(sands);

  // Coastal rocks
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, kit.rock, rockCount);
  const rocksDark = new THREE.InstancedMesh(rockGeo, kit.rockDark, rockCount);
  rocks.name = 'coast-rocks';
  rocksDark.name = 'coast-rocks-dark';
  enableShadows(rocks, true, true);
  enableShadows(rocksDark, true, true);

  let ri = 0;
  let rdi = 0;
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + 0.4;
    const r = mapHalfExtent * (0.9 + (i % 3) * 0.035);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = Math.max(-0.1, getGroundHeight(x, z));
    quat.setFromEuler(new THREE.Euler(rng() * 0.9, a, rng() * 0.6));
    const sc = 0.7 + rng() * 1.4;
    pos.set(x, y + 0.15 * sc, z);
    scl.set(sc * (0.9 + rng() * 0.4), sc * (0.5 + rng() * 0.45), sc);
    if (rng() > 0.4) setInstanceMatrix(rocks, ri++, pos, quat, scl, dummy);
    else setInstanceMatrix(rocksDark, rdi++, pos, quat, scl, dummy);
  }
  rocks.count = ri;
  rocksDark.count = rdi;
  rocks.instanceMatrix.needsUpdate = true;
  rocksDark.instanceMatrix.needsUpdate = true;
  group.add(rocks, rocksDark);

  // Pier / dock stubs — readable coastal landmarks
  const pierNodes: THREE.Group[] = [];
  for (let i = 0; i < pierCount; i++) {
    const a = (i / pierCount) * Math.PI * 2 + 0.9;
    const r = mapHalfExtent * 0.94;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = Math.max(0, getGroundHeight(x, z));
    const pier = new THREE.Group();
    pier.name = `coast-pier-${i}`;

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.22, 10),
      kit.wood,
    );
    deck.position.set(0, 0.35, 4.2);
    enableShadows(deck, true, true);
    pier.add(deck);

    for (let p = 0; p < 4; p++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 1.4, 5),
        kit.wood,
      );
      post.position.set((p % 2 === 0 ? -1.2 : 1.2), 0.1, 1.5 + p * 2.2);
      pier.add(post);
    }

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      kit.navAmber,
    );
    tip.position.set(0, 1.1, 8.5);
    pier.add(tip);

    pier.position.set(x, y, z);
    pier.rotation.y = a + Math.PI;
    group.add(pier);
    pierNodes.push(pier);
  }

  const placed = { sand: si, rocks: ri + rdi, piers: pierNodes.length };

  return {
    group,
    setVisibleCount(d: number) {
      const t = Math.max(0, Math.min(1, d / Math.max(1, budget.oceanDetail)));
      sands.count = Math.floor(placed.sand * t);
      const rockWant = Math.floor(placed.rocks * t);
      rocks.count = Math.min(ri, Math.ceil(rockWant * 0.55));
      rocksDark.count = Math.min(rdi, Math.floor(rockWant * 0.45));
      for (let i = 0; i < pierNodes.length; i++) {
        pierNodes[i].visible = i < Math.ceil(pierCount * t);
      }
    },
    dispose() {
      disposeObject3D(group);
      group.parent?.remove(group);
    },
  };
}
