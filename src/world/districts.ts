import * as THREE from 'three';
import { createEnvMaterialKit, type EnvMaterialKit } from './materials';
import { createRng, disposeObject3D, enableShadows } from './envUtil';
import type { EnvBudget } from './envBudget';

export type DistrictKind =
  | 'hangar'
  | 'fuel'
  | 'barracks'
  | 'radar'
  | 'yard';

export interface DistrictInfo {
  id: string;
  kind: DistrictKind;
  center: THREE.Vector3;
  radius: number;
  groundY: number;
}

export interface DistrictsHandle {
  group: THREE.Group;
  districts: DistrictInfo[];
  /** Road polyline samples (xz) for props / nav */
  roadSamples: THREE.Vector3[];
  setVisibleCount(compounds: number, navMarkers: number): void;
  dispose(): void;
}

interface DistrictLayout {
  kind: DistrictKind;
  angle: number;
  radiusFrac: number;
  size: number;
}

const LAYOUTS: DistrictLayout[] = [
  { kind: 'hangar', angle: 0.35, radiusFrac: 0.38, size: 18 },
  { kind: 'fuel', angle: 1.55, radiusFrac: 0.44, size: 14 },
  { kind: 'barracks', angle: 2.85, radiusFrac: 0.4, size: 15 },
  { kind: 'radar', angle: 4.2, radiusFrac: 0.48, size: 12 },
  { kind: 'yard', angle: 5.4, radiusFrac: 0.36, size: 16 },
];

function addBox(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  enableShadows(mesh, true, true);
  parent.add(mesh);
  return mesh;
}

function buildHangarCompound(kit: EnvMaterialKit, size: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'district-hangar';
  const half = size * 0.5;

  // Apron pad
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.1, size * 0.85),
    kit.asphalt,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.03;
  enableShadows(apron, false, true);
  g.add(apron);

  // Twin hangars
  for (const sx of [-half * 0.45, half * 0.45]) {
    addBox(g, kit.concreteDark, 7.5, 5.2, 9.5, sx, 2.6, -1.5);
    addBox(g, kit.hangarRoof, 8.2, 0.35, 10.2, sx, 5.4, -1.5);
    // Open bay stripe
    addBox(g, kit.steelDark, 6.2, 3.8, 0.2, sx, 2.0, 3.2);
  }

  // Perimeter jersey wall fragments
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addBox(g, kit.concrete,
      2.8,
      0.9,
      0.4,
      Math.cos(a) * half * 0.95,
      0.45,
      Math.sin(a) * half * 0.95,
      a + Math.PI / 2,
    );
  }

  // Nav chevrons on apron
  for (let i = 0; i < 3; i++) {
    addBox(g, kit.navGreen, 1.8, 0.05, 0.35, 0, 0.08, half * 0.15 + i * 2.2);
  }

  void rng;
  return g;
}

function buildFuelCompound(kit: EnvMaterialKit, size: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'district-fuel';
  const half = size * 0.5;

  const pad = new THREE.Mesh(new THREE.CircleGeometry(half * 0.9, 20), kit.asphalt);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  g.add(pad);

  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 4.2, 10),
      kit.rust,
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-3 + i * 3.2, 1.6, 0);
    enableShadows(tank, true, true);
    g.add(tank);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.52, 0.3, 10),
      kit.warning,
    );
    stripe.rotation.z = Math.PI / 2;
    stripe.position.copy(tank.position);
    g.add(stripe);
  }

  addBox(g, kit.steelDark, 3.5, 2.4, 3.0, half * 0.55, 1.2, -half * 0.35);
  addBox(g, kit.oliveDark, 1.2, 2.8, 1.2, -half * 0.6, 1.4, half * 0.4);

  // Containment berm
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addBox(g, kit.sandbag,
      2.0,
      0.7,
      0.55,
      Math.cos(a) * half * 0.85,
      0.35,
      Math.sin(a) * half * 0.85,
      a,
    );
  }
  return g;
}

function buildBarracks(kit: EnvMaterialKit, size: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'district-barracks';
  const half = size * 0.5;

  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size * 0.75),
    kit.concrete,
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = 0.02;
  g.add(yard);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = -half * 0.55 + col * 4.2;
      const z = -half * 0.25 + row * 5.5;
      addBox(g, kit.olive, 3.6, 3.2, 4.0, x, 1.6, z);
      addBox(g, kit.oliveDark, 3.8, 0.25, 4.2, x, 3.3, z);
    }
  }

  // Flag mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 5), kit.steel);
  mast.position.set(half * 0.55, 3.5, half * 0.2);
  g.add(mast);
  addBox(g, kit.navAmber, 1.4, 0.7, 0.08, half * 0.55 + 0.75, 6.4, half * 0.2);

  return g;
}

function buildRadar(kit: EnvMaterialKit, size: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'district-radar';
  const half = size * 0.5;

  addBox(g, kit.concreteDark, size * 0.7, 0.3, size * 0.7, 0, 0.15, 0);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    kit.steel,
  );
  dish.position.set(0, 4.2, 0);
  dish.rotation.x = -0.35;
  enableShadows(dish, true, true);
  g.add(dish);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3.5, 6), kit.steelDark);
  stem.position.y = 1.9;
  g.add(stem);

  addBox(g, kit.oliveDark, 3.2, 2.2, 3.5, half * 0.45, 1.1, half * 0.35);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), kit.navHot);
  beacon.position.set(0, 6.6, 0);
  beacon.name = 'district-beacon';
  g.add(beacon);

  // Fence posts
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 2.0, 4),
      kit.steelDark,
    );
    post.position.set(Math.cos(a) * half * 0.9, 1.0, Math.sin(a) * half * 0.9);
    g.add(post);
  }
  return g;
}

function buildYard(kit: EnvMaterialKit, size: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'district-yard';
  const half = size * 0.5;

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.05, size * 0.9),
    kit.asphalt,
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.025;
  g.add(pad);

  // Warehouse + shed row
  addBox(g, kit.concrete, 8, 4.5, 6, -half * 0.25, 2.25, -half * 0.15);
  addBox(g, kit.hangarRoof, 8.4, 0.3, 6.4, -half * 0.25, 4.6, -half * 0.15);
  addBox(g, kit.olive, 4.5, 3.0, 4.0, half * 0.4, 1.5, half * 0.1);

  // Crate stacks
  for (let i = 0; i < 8; i++) {
    const sx = 0.8 + rng() * 0.5;
    addBox(g, rng() > 0.5 ? kit.wood : kit.oliveDark,
      sx,
      sx * 0.85,
      sx,
      -half * 0.55 + (i % 4) * 1.5,
      sx * 0.42,
      half * 0.35 + Math.floor(i / 4) * 1.6,
      rng() * 0.4,
    );
  }

  // Road stripe through yard
  addBox(g, kit.navAmber, size * 0.9, 0.04, 0.35, 0, 0.06, half * 0.05);
  return g;
}

function buildDistrictNode(
  kind: DistrictKind,
  kit: EnvMaterialKit,
  size: number,
  rng: () => number,
): THREE.Group {
  switch (kind) {
    case 'hangar':
      return buildHangarCompound(kit, size, rng);
    case 'fuel':
      return buildFuelCompound(kit, size);
    case 'barracks':
      return buildBarracks(kit, size);
    case 'radar':
      return buildRadar(kit, size);
    case 'yard':
    default:
      return buildYard(kit, size, rng);
  }
}

/**
 * Authored military districts + connecting asphalt roads + nav markers.
 * Gives the island readable composition from the air beyond random scatter.
 */
export function createDistricts(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): DistrictsHandle {
  const group = new THREE.Group();
  group.name = 'env-districts';
  const kit = createEnvMaterialKit();
  const rng = createRng(0xd15a1c);
  const half = mapHalfExtent * 0.72;

  const districts: DistrictInfo[] = [];
  const nodes: THREE.Group[] = [];
  const roadSamples: THREE.Vector3[] = [];
  const navMarkers: THREE.Mesh[] = [];

  const maxCompounds = Math.min(budget.compounds, LAYOUTS.length);

  for (let i = 0; i < maxCompounds; i++) {
    const layout = LAYOUTS[i];
    let x = Math.cos(layout.angle) * half * layout.radiusFrac;
    let z = Math.sin(layout.angle) * half * layout.radiusFrac;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 28) {
      x += Math.cos(layout.angle + 0.8) * 22;
      z += Math.sin(layout.angle + 0.8) * 22;
    }
    const groundY = getGroundHeight(x, z);
    const node = buildDistrictNode(layout.kind, kit, layout.size, rng);
    node.position.set(x, groundY, z);
    node.rotation.y = layout.angle + Math.PI * 0.5 + (rng() - 0.5) * 0.2;
    group.add(node);
    nodes.push(node);
    districts.push({
      id: `district-${layout.kind}`,
      kind: layout.kind,
      center: new THREE.Vector3(x, groundY, z),
      radius: layout.size * 0.55,
      groundY,
    });
  }

  // Connecting roads between consecutive districts (asphalt strips)
  const roadMat = kit.asphalt.clone();
  roadMat.transparent = true;
  roadMat.opacity = 0.72;
  roadMat.depthWrite = false;
  const stripeMat = kit.navAmber.clone();
  stripeMat.emissiveIntensity = 0.45;

  for (let i = 0; i < districts.length; i++) {
    const a = districts[i];
    const b = districts[(i + 1) % districts.length];
    const dx = b.center.x - a.center.x;
    const dz = b.center.z - a.center.z;
    const len = Math.hypot(dx, dz);
    if (len < 8) continue;
    const midX = (a.center.x + b.center.x) * 0.5;
    const midZ = (a.center.z + b.center.z) * 0.5;
    const midY = getGroundHeight(midX, midZ) + 0.05;
    const yaw = Math.atan2(dx, dz);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, len * 0.72),
      roadMat,
    );
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -yaw;
    road.position.set(midX, midY, midZ);
    road.renderOrder = 1;
    road.name = `district-road-${i}`;
    group.add(road);

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, len * 0.65),
      stripeMat,
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.rotation.z = -yaw;
    stripe.position.set(midX, midY + 0.02, midZ);
    stripe.renderOrder = 2;
    group.add(stripe);

    // Sample points along road for consumers
    const steps = 4;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const sx = a.center.x + dx * t;
      const sz = a.center.z + dz * t;
      roadSamples.push(new THREE.Vector3(sx, getGroundHeight(sx, sz), sz));
    }
  }

  // Nav markers along ring between districts
  const maxNav = budget.navMarkers;
  for (let i = 0; i < maxNav; i++) {
    const t = (i / maxNav) * Math.PI * 2;
    const r = mapHalfExtent * (0.32 + (i % 3) * 0.08);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 14) continue;
    const y = getGroundHeight(x, z);
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.35),
      i % 2 === 0 ? kit.navGreen : kit.navAmber,
    );
    marker.position.set(x, y + 0.1, z);
    marker.rotation.y = t;
    marker.name = 'nav-marker';
    group.add(marker);
    navMarkers.push(marker);
  }

  return {
    group,
    districts,
    roadSamples,
    setVisibleCount(compounds: number, navCount: number) {
      for (let i = 0; i < nodes.length; i++) nodes[i].visible = i < compounds;
      for (let i = 0; i < navMarkers.length; i++) navMarkers[i].visible = i < navCount;
    },
    dispose() {
      disposeObject3D(group);
      group.parent?.remove(group);
    },
  };
}
