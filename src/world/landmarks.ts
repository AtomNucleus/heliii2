import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import { createRng, makeBasic, makeEmissiveBasic } from './envUtil';
import type { EnvBudget } from './envBudget';

export interface LandmarkHandle {
  group: THREE.Group;
  /** World positions useful for navigation / combat framing */
  anchors: THREE.Vector3[];
  setVisibleCount(count: number): void;
  dispose(): void;
}

function radioTower(height: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-radio-tower';
  const legMat = makeBasic(0x6a7380);
  const lightMat = makeEmissiveBasic(COLORS.orangeHot, 1.4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, height, 4), legMat);
    leg.position.set(Math.cos(a) * 1.1, height * 0.5, Math.sin(a) * 1.1);
    leg.rotation.z = Math.cos(a) * 0.08;
    leg.rotation.x = -Math.sin(a) * 0.08;
    g.add(leg);
  }
  for (let y = 4; y < height; y += 5) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05 * (1 - y / height * 0.35), 0.05, 4, 10),
      legMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lightMat);
  beacon.position.y = height + 0.2;
  beacon.name = 'landmark-beacon';
  g.add(beacon);
  return g;
}

function waterTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-water-tower';
  const steel = makeBasic(0x5a6874);
  const tank = makeBasic(0x3a8a9a);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 10, 6), steel);
  legs.position.y = 5;
  g.add(legs);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), tank);
  bowl.position.y = 11.2;
  bowl.scale.y = 0.72;
  g.add(bowl);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 6), steel);
  cap.position.y = 13.2;
  g.add(cap);
  return g;
}

function yardCrane(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-crane';
  const mat = makeBasic(0xc45a20);
  const dark = makeBasic(0x3a4048);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 0.7), mat);
  mast.position.y = 7;
  g.add(mast);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(16, 0.45, 0.45), mat);
  boom.position.set(5, 13.5, 0);
  g.add(boom);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.5), dark);
  counter.position.set(-3.5, 13.5, 0);
  g.add(counter);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), dark);
  cabin.position.set(0, 12.2, 0);
  g.add(cabin);
  return g;
}

function billboard(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-billboard';
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 6, 5),
    makeBasic(0x3a4048),
  );
  post.position.y = 3;
  g.add(post);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(7, 3.2, 0.25),
    makeBasic(0x1a2a32),
  );
  board.position.y = 7.2;
  g.add(board);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 2.6, 0.12),
    makeEmissiveBasic(COLORS.orangeSun, 0.9),
  );
  glow.position.set(0, 7.2, 0.2);
  g.add(glow);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.35, 0.14),
    makeEmissiveBasic(COLORS.neonGreen, 1.1),
  );
  stripe.position.set(0, 6.3, 0.22);
  g.add(stripe);
  return g;
}

function hangarBeacon(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-hangar-beacon';
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.5, 0.5, 8),
    makeBasic(0x3a4550),
  );
  base.position.y = 0.25;
  g.add(base);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 5, 6),
    makeBasic(0x4a5560),
  );
  stem.position.y = 2.9;
  g.add(stem);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 10),
    makeEmissiveBasic(COLORS.neonGreen, 1.5),
  );
  light.position.y = 5.6;
  light.name = 'landmark-beacon';
  g.add(light);
  return g;
}

function silo(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-silo';
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.4, 9, 10),
    makeBasic(0x6a7885),
  );
  body.position.y = 4.5;
  g.add(body);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.25, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
    makeBasic(0x4a5a68),
  );
  dome.position.y = 9;
  g.add(dome);
  return g;
}

function fuelTank(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-fuel-tank';
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 5.5, 12),
    makeBasic(0x8a4030),
  );
  tank.rotation.z = Math.PI / 2;
  tank.position.y = 2.0;
  g.add(tank);
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.35, 2.2),
    makeBasic(0x3a4048),
  );
  stand.position.y = 0.4;
  g.add(stand);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(1.82, 1.82, 0.35, 12),
    makeEmissiveBasic(COLORS.orangeHot, 1.0),
  );
  stripe.rotation.z = Math.PI / 2;
  stripe.position.y = 2.0;
  g.add(stripe);
  return g;
}

function watchTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmark-watch-tower';
  const mat = makeBasic(0x4a5560);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8, 0.35), mat);
  for (const [x, z] of [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ] as const) {
    const p = post.clone();
    p.position.set(x, 4, z);
    g.add(p);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), mat);
  deck.position.y = 8.1;
  g.add(deck);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.0, 2.4),
    makeBasic(0x3a4850),
  );
  cabin.position.y = 9.2;
  g.add(cabin);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    makeEmissiveBasic(COLORS.orangeSun, 1.3),
  );
  light.position.y = 10.5;
  light.name = 'landmark-beacon';
  g.add(light);
  return g;
}

const BUILDERS = [
  radioTower.bind(null, 22),
  waterTower,
  yardCrane,
  billboard,
  hangarBeacon,
  silo,
  fuelTank,
  watchTower,
];

/**
 * Distinct authored landmarks for silhouette readability from the air.
 */
export function createLandmarks(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): LandmarkHandle {
  const group = new THREE.Group();
  group.name = 'env-landmarks';
  const rng = createRng(0x1a4d4a);
  const anchors: THREE.Vector3[] = [];
  const nodes: THREE.Group[] = [];

  const count = Math.min(budget.landmarks, BUILDERS.length);
  const half = mapHalfExtent * 0.62;

  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2 + 0.35;
    const r = half * (0.48 + (i % 3) * 0.1);
    let x = Math.cos(t) * r;
    let z = Math.sin(t) * r;
    // Nudge away from spawn
    if (Math.hypot(x - spawn.x, z - spawn.z) < 30) {
      x += Math.cos(t + 1) * 18;
      z += Math.sin(t + 1) * 18;
    }
    const y = getGroundHeight(x, z);
    const node = BUILDERS[i]();
    node.position.set(x, y, z);
    node.rotation.y = rng() * Math.PI * 2;
    const sc = 0.9 + rng() * 0.25;
    node.scale.setScalar(sc);
    group.add(node);
    nodes.push(node);
    anchors.push(new THREE.Vector3(x, y, z));
  }

  return {
    group,
    anchors,
    setVisibleCount(n: number) {
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].visible = i < n;
      }
    },
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      group.parent?.remove(group);
    },
  };
}
