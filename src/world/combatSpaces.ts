import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import { makeBasic, makeEmissiveBasic } from './envUtil';
import type { EnvBudget } from './envBudget';

export type CombatSpaceKind = 'depot' | 'aa' | 'approach';

export interface CombatSpace {
  id: string;
  kind: CombatSpaceKind;
  center: THREE.Vector3;
  radius: number;
  /** Suggested ground Y for props / enemies */
  groundY: number;
}

export interface CombatSpacesHandle {
  group: THREE.Group;
  spaces: CombatSpace[];
  setVisibleCount(count: number): void;
  dispose(): void;
}

function buildArenaPad(radius: number, kind: CombatSpaceKind): THREE.Group {
  const g = new THREE.Group();
  g.name = `combat-arena-${kind}`;

  const ringColor =
    kind === 'depot' ? COLORS.neonGreen : kind === 'aa' ? COLORS.orangeHot : COLORS.rimCool;

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.85, 24),
    makeBasic(0x2a3038, {
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.05;
  pad.renderOrder = 2;
  g.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius * 0.92, 32),
    makeEmissiveBasic(ringColor, 1.05),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.renderOrder = 3;
  g.add(ring);

  // Inner chevron marks for aerial readability
  const markMat = makeEmissiveBasic(ringColor, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.28, 0.06, 0.35), markMat);
    mark.position.set(Math.cos(a) * radius * 0.4, 0.1, Math.sin(a) * radius * 0.4);
    mark.rotation.y = a;
    g.add(mark);
  }

  // Cover crates / sandbags around perimeter
  const coverMat = makeBasic(kind === 'depot' ? 0x5a4a30 : 0x4a5058);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.7), coverMat);
    crate.position.set(
      Math.cos(a) * radius * 0.95,
      0.45,
      Math.sin(a) * radius * 0.95,
    );
    crate.rotation.y = a + Math.PI / 2;
    g.add(crate);
  }

  // Corner posts with tip lights
  const postMat = makeBasic(0x3a4048);
  const tipMat = makeEmissiveBasic(ringColor, 1.3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5), postMat);
    post.position.set(Math.cos(a) * radius, 1.1, Math.sin(a) * radius);
    g.add(post);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), tipMat);
    tip.position.set(Math.cos(a) * radius, 2.3, Math.sin(a) * radius);
    tip.name = 'combat-beacon';
    g.add(tip);
  }

  if (kind === 'depot') {
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.35, 0.12),
      makeEmissiveBasic(COLORS.neonGreen, 1.2),
    );
    banner.position.set(0, 0.35, 0);
    g.add(banner);
  }

  return g;
}

/**
 * Authored combat arenas: readable strike zones with pads, cover, and beacons.
 * Positions are deterministic from map extent so enemy layout can snap to them.
 */
export function createCombatSpaces(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
): CombatSpacesHandle {
  const group = new THREE.Group();
  group.name = 'env-combat-spaces';

  const half = mapHalfExtent * 0.68;
  const layouts: Array<{ kind: CombatSpaceKind; x: number; z: number; radius: number }> = [
    { kind: 'depot', x: half * 0.55, z: half * 0.35, radius: 9 },
    { kind: 'depot', x: -half * 0.5, z: half * 0.45, radius: 9 },
    { kind: 'depot', x: half * 0.15, z: -half * 0.55, radius: 9 },
    { kind: 'depot', x: -half * 0.35, z: -half * 0.4, radius: 8.5 },
    { kind: 'depot', x: half * 0.65, z: -half * 0.15, radius: 8.5 },
    { kind: 'aa', x: half * 0.2, z: half * 0.6, radius: 7 },
    { kind: 'aa', x: -half * 0.55, z: -half * 0.15, radius: 7 },
    { kind: 'approach', x: spawn.x + half * 0.15, z: spawn.z - half * 0.2, radius: 11 },
  ];

  const spaces: CombatSpace[] = [];
  const nodes: THREE.Group[] = [];
  const max = budget.combatSpaces;

  let id = 0;
  for (const layout of layouts) {
    if (spaces.length >= max) break;
    if (Math.hypot(layout.x - spawn.x, layout.z - spawn.z) < 20 && layout.kind !== 'approach') {
      continue;
    }
    const groundY = getGroundHeight(layout.x, layout.z);
    const arena = buildArenaPad(layout.radius, layout.kind);
    arena.position.set(layout.x, groundY, layout.z);
    group.add(arena);
    nodes.push(arena);
    spaces.push({
      id: `space-${id++}`,
      kind: layout.kind,
      center: new THREE.Vector3(layout.x, groundY, layout.z),
      radius: layout.radius,
      groundY,
    });
  }

  // Ensure at least 3 depot spaces even if spawn filtering removed some
  while (spaces.filter((s) => s.kind === 'depot').length < Math.min(3, max)) {
    const a = spaces.length * 1.7;
    const r = half * 0.45;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 24) break;
    const groundY = getGroundHeight(x, z);
    const arena = buildArenaPad(8.5, 'depot');
    arena.position.set(x, groundY, z);
    group.add(arena);
    nodes.push(arena);
    spaces.push({
      id: `space-${id++}`,
      kind: 'depot',
      center: new THREE.Vector3(x, groundY, z),
      radius: 8.5,
      groundY,
    });
    if (spaces.length >= max) break;
  }

  return {
    group,
    spaces,
    setVisibleCount(count: number) {
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].visible = i < count;
      }
    },
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      });
      group.parent?.remove(group);
    },
  };
}
