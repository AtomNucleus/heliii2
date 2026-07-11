import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import { createRng, makeBasic, makeEmissiveBasic } from './envUtil';
import type { EnvBudget } from './envBudget';

interface FlagSlot {
  mesh: THREE.Mesh;
  phase: number;
  baseRot: number;
}

interface BlinkSlot {
  mesh: THREE.Mesh;
  phase: number;
  rate: number;
  mat: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
}

interface SmokeSlot {
  mesh: THREE.Mesh;
  phase: number;
  baseY: number;
  mat: THREE.MeshStandardMaterial;
}

interface BirdSlot {
  mesh: THREE.Mesh;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  center: THREE.Vector3;
}

export interface EnvAnimationHandle {
  group: THREE.Group;
  update(dt: number, time: number): void;
  setBudgets(flags: number, lights: number, smoke: number, birds: number): void;
  dispose(): void;
}

/**
 * Lightweight animated dressing: flags, nav blinkers, smoke columns, birds.
 */
export function createEnvAnimation(
  getGroundHeight: (x: number, z: number) => number,
  mapHalfExtent: number,
  budget: EnvBudget,
  spawn: THREE.Vector3,
  landmarkAnchors: THREE.Vector3[],
): EnvAnimationHandle {
  const group = new THREE.Group();
  group.name = 'env-animation';
  const rng = createRng(0xa41e01);

  const flags: FlagSlot[] = [];
  const blinks: BlinkSlot[] = [];
  const smokes: SmokeSlot[] = [];
  const birds: BirdSlot[] = [];

  // Flags
  const flagGeo = new THREE.PlaneGeometry(1.6, 0.9, 4, 1);
  const flagMat = makeBasic(COLORS.orangeSun, {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const poleMat = makeBasic(0x3a4048);
  for (let i = 0; i < budget.flags; i++) {
    const t = (i / Math.max(1, budget.flags)) * Math.PI * 2 + 0.2;
    const r = mapHalfExtent * (0.25 + (i % 3) * 0.12);
    let x = Math.cos(t) * r;
    let z = Math.sin(t) * r;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 12) {
      x += 14;
      z += 8;
    }
    const y = getGroundHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.5, 5), poleMat);
    pole.position.set(x, y + 2.25, z);
    group.add(pole);

    const flag = new THREE.Mesh(flagGeo, flagMat.clone());
    flag.position.set(x + 0.85, y + 4.0, z);
    flag.rotation.y = t + Math.PI * 0.5;
    group.add(flag);
    flags.push({ mesh: flag, phase: rng() * Math.PI * 2, baseRot: flag.rotation.y });
  }

  // Blink lights — prefer landmark beacons + scattered poles
  const blinkGeo = new THREE.SphereGeometry(0.28, 6, 6);
  for (let i = 0; i < budget.blinkLights; i++) {
    const mat = makeEmissiveBasic(
      i % 3 === 0 ? COLORS.neonGreen : COLORS.orangeHot,
      1.2,
    );
    const mesh = new THREE.Mesh(blinkGeo, mat);
    if (i < landmarkAnchors.length) {
      const a = landmarkAnchors[i];
      mesh.position.set(a.x, a.y + 12 + (i % 4) * 2, a.z);
    } else {
      const t = rng() * Math.PI * 2;
      const r = mapHalfExtent * (0.3 + rng() * 0.4);
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const y = getGroundHeight(x, z);
      mesh.position.set(x, y + 5 + rng() * 8, z);
    }
    group.add(mesh);
    blinks.push({
      mesh,
      phase: rng() * Math.PI * 2,
      rate: 1.2 + rng() * 2.4,
      mat,
      baseColor: mat.color.clone(),
    });
  }

  // Smoke columns
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < budget.smokeColumns; i++) {
    const t = (i / Math.max(1, budget.smokeColumns)) * Math.PI * 2 + 1.1;
    const r = mapHalfExtent * (0.4 + (i % 2) * 0.15);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;
    const y = getGroundHeight(x, z);
    const mat = makeBasic(0xbba890, {
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    mesh.position.set(x, y + 6, z);
    mesh.scale.set(4 + rng() * 3, 10 + rng() * 6, 1);
    mesh.renderOrder = 5;
    group.add(mesh);
    smokes.push({ mesh, phase: rng() * Math.PI * 2, baseY: y + 5, mat });
  }

  // Birds — simple chevron billboards orbiting
  const birdGeo = new THREE.BufferGeometry();
  const birdVerts = new Float32Array([
    -0.6, 0, 0, 0, 0.15, 0, 0.6, 0, 0, -0.25, 0, 0, 0, -0.2, 0, 0.25, 0, 0,
  ]);
  birdGeo.setAttribute('position', new THREE.BufferAttribute(birdVerts, 3));
  const birdMat = makeBasic(0x1a1e24);
  for (let i = 0; i < budget.birds; i++) {
    const mesh = new THREE.Mesh(birdGeo, birdMat);
    mesh.frustumCulled = false;
    const center = new THREE.Vector3(
      (rng() - 0.5) * mapHalfExtent * 0.8,
      0,
      (rng() - 0.5) * mapHalfExtent * 0.8,
    );
    center.y = getGroundHeight(center.x, center.z);
    group.add(mesh);
    birds.push({
      mesh,
      angle: rng() * Math.PI * 2,
      radius: 18 + rng() * 40,
      height: 28 + rng() * 35,
      speed: 0.25 + rng() * 0.45,
      center,
    });
  }

  let enabled = budget.animate;

  return {
    group,
    update(dt: number, time: number) {
      if (!enabled) return;

      for (const f of flags) {
        if (!f.mesh.visible) continue;
        const wave = Math.sin(time * 3.2 + f.phase) * 0.35;
        f.mesh.rotation.y = f.baseRot + wave * 0.25;
        f.mesh.rotation.z = wave * 0.15;
        f.mesh.scale.x = 1 + Math.sin(time * 4.0 + f.phase) * 0.08;
      }

      for (const b of blinks) {
        if (!b.mesh.visible) continue;
        const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(time * b.rate + b.phase));
        b.mat.color.copy(b.baseColor).multiplyScalar(0.45 + pulse * 0.9);
        b.mesh.scale.setScalar(0.85 + pulse * 0.35);
      }

      for (const s of smokes) {
        if (!s.mesh.visible) continue;
        s.mesh.position.y = s.baseY + Math.sin(time * 0.4 + s.phase) * 1.2;
        s.mesh.rotation.y = time * 0.15 + s.phase;
        s.mat.opacity = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(time * 0.7 + s.phase));
        s.mesh.scale.x = 4 + Math.sin(time * 0.5 + s.phase) * 0.8;
      }

      for (const bird of birds) {
        if (!bird.mesh.visible) continue;
        bird.angle += dt * bird.speed;
        const x = bird.center.x + Math.cos(bird.angle) * bird.radius;
        const z = bird.center.z + Math.sin(bird.angle) * bird.radius;
        const y =
          bird.center.y +
          bird.height +
          Math.sin(bird.angle * 2.5) * 3;
        bird.mesh.position.set(x, y, z);
        bird.mesh.rotation.y = -bird.angle + Math.PI * 0.5;
        bird.mesh.rotation.z = Math.sin(time * 8 + bird.angle) * 0.35;
      }
    },
    setBudgets(flagN: number, lightN: number, smokeN: number, birdN: number) {
      enabled = true;
      for (let i = 0; i < flags.length; i++) flags[i].mesh.visible = i < flagN;
      for (let i = 0; i < blinks.length; i++) blinks[i].mesh.visible = i < lightN;
      for (let i = 0; i < smokes.length; i++) smokes[i].mesh.visible = i < smokeN;
      for (let i = 0; i < birds.length; i++) birds[i].mesh.visible = i < birdN;
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
