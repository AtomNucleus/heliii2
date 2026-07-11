import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { WeaponSystem } from './weapons';
import type { CombatEffects } from './effects';

export type EnemyKind = 'turret' | 'drone' | 'depot';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  mesh: THREE.Group;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  radius: number;
  alive: boolean;
  /** Primary objective (must destroy to win) */
  primary: boolean;
  fireCooldown: number;
  fireTimer: number;
  orbitCenter: THREE.Vector3 | null;
  orbitAngle: number;
  orbitRadius: number;
  orbitHeight: number;
  scoreValue: number;
  beacon: THREE.Mesh | null;
  hitFlash: number;
}

export interface EnemyHitResult {
  enemy: Enemy;
  destroyed: boolean;
  points: number;
  overkill: boolean;
}

let nextEnemyId = 1;

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

function makeTurretMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'turret';

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 0.6, 8),
    new THREE.MeshStandardMaterial({
      color: 0x3a4550,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
    }),
  );
  base.position.y = 0.3;
  g.add(base);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0x5a3030,
      emissive: COLORS.orangeHot,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.25,
      flatShading: true,
    }),
  );
  body.position.y = 1.1;
  body.name = 'turret-body';
  g.add(body);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6),
    new THREE.MeshStandardMaterial({
      color: 0x222830,
      emissive: COLORS.orangeSun,
      emissiveIntensity: 0.5,
      flatShading: true,
    }),
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(1.1, 0.15, 0);
  barrel.name = 'turret-barrel';
  body.add(barrel);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.orangeHot,
      emissive: COLORS.orangeHot,
      emissiveIntensity: 1.4,
      flatShading: true,
    }),
  );
  beacon.position.y = 1.95;
  g.add(beacon);

  return g;
}

function makeDroneMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'drone';

  const hull = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x3a2850,
      emissive: 0xaa44ff,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.4,
      flatShading: true,
    }),
  );
  g.add(hull);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.12, 6, 16),
    new THREE.MeshStandardMaterial({
      color: COLORS.orangeGlow,
      emissive: COLORS.orangeSun,
      emissiveIntensity: 0.9,
      flatShading: true,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.name = 'drone-ring';
  g.add(ring);

  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x2a2038,
        emissive: 0x6622aa,
        emissiveIntensity: 0.35,
        flatShading: true,
      }),
    );
    arm.rotation.y = (i / 4) * Math.PI * 2;
    arm.position.y = 0.05;
    g.add(arm);
  }

  return g;
}

function makeDepotMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'depot';

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.4, 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x6a4020,
      emissive: COLORS.orangeSun,
      emissiveIntensity: 0.28,
      roughness: 0.65,
      metalness: 0.2,
      flatShading: true,
    }),
  );
  crate.position.y = 1.2;
  crate.name = 'depot-body';
  g.add(crate);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.35, 0.35),
    new THREE.MeshStandardMaterial({
      color: COLORS.neonGreen,
      emissive: COLORS.neonGreen,
      emissiveIntensity: 1.15,
      flatShading: true,
    }),
  );
  stripe.position.y = 2.0;
  g.add(stripe);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6),
    new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      emissive: COLORS.orangeHot,
      emissiveIntensity: 0.4,
      flatShading: true,
    }),
  );
  antenna.position.set(0.9, 2.8, 0.9);
  g.add(antenna);

  // Vertical objective beacon (easy to spot from altitude)
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.35, 14, 8),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pillar.position.y = 8;
  pillar.name = 'depot-beacon';
  g.add(pillar);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 10),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  cap.position.y = 15.2;
  g.add(cap);

  return g;
}

export interface EnemyLayoutOptions {
  getGroundHeight: (x: number, z: number) => number;
  mapHalfExtent: number;
  spawn: THREE.Vector3;
}

/**
 * Enemy targets + threats: AA turrets, supply depots (primary), orbiting drones.
 */
export class EnemySystem {
  readonly group = new THREE.Group();
  readonly enemies: Enemy[] = [];
  private readonly weapons: WeaponSystem;
  private readonly effects: CombatEffects;
  private tmpDir = new THREE.Vector3();
  private tmpOrigin = new THREE.Vector3();
  private tmpLead = new THREE.Vector3();

  constructor(scene: THREE.Scene, weapons: WeaponSystem, effects: CombatEffects) {
    this.group.name = 'enemies';
    this.weapons = weapons;
    this.effects = effects;
    scene.add(this.group);
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  get primaryAlive(): number {
    return this.enemies.filter((e) => e.alive && e.primary).length;
  }

  get primaryTotal(): number {
    return this.enemies.filter((e) => e.primary).length;
  }

  get killCount(): number {
    return this.enemies.filter((e) => !e.alive).length;
  }

  /** World positions of alive enemies (for rocket homing). */
  getHomingTargets(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const y = e.kind === 'drone' ? e.position.y : e.position.y + 1.2;
      out.push(new THREE.Vector3(e.position.x, y, e.position.z));
    }
    return out;
  }

  /** Nearest alive enemy along forward cone (for crosshair lock). */
  findAimTarget(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    maxDist = 70,
    coneDot = 0.82,
  ): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const y = e.kind === 'drone' ? e.position.y : e.position.y + 1.2;
      this.tmpOrigin.set(e.position.x, y, e.position.z);
      this.tmpDir.subVectors(this.tmpOrigin, origin);
      const dist = this.tmpDir.length();
      if (dist < 4 || dist > maxDist) continue;
      this.tmpDir.multiplyScalar(1 / dist);
      const dot = forward.dot(this.tmpDir);
      if (dot < coneDot) continue;
      const score = dot * 2 - dist * 0.01 + (e.primary ? 0.15 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  spawnMission(opts: EnemyLayoutOptions) {
    this.clear();
    const { getGroundHeight, mapHalfExtent, spawn } = opts;
    const half = mapHalfExtent * 0.72;

    const depotSpots: Array<[number, number]> = [
      [half * 0.55, half * 0.35],
      [-half * 0.5, half * 0.45],
      [half * 0.15, -half * 0.55],
      [-half * 0.35, -half * 0.4],
      [half * 0.65, -half * 0.15],
    ];

    for (const [x, z] of depotSpots) {
      if (Math.hypot(x - spawn.x, z - spawn.z) < 28) continue;
      const y = getGroundHeight(x, z);
      this.addEnemy('depot', new THREE.Vector3(x, y, z), {
        primary: true,
        health: 95,
        scoreValue: 550,
      });
    }

    while (this.primaryTotal < 4) {
      const a = Math.random() * Math.PI * 2;
      const r = half * (0.35 + Math.random() * 0.4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 30) continue;
      const y = getGroundHeight(x, z);
      this.addEnemy('depot', new THREE.Vector3(x, y, z), {
        primary: true,
        health: 95,
        scoreValue: 550,
      });
    }

    const turretCount = 8;
    for (let i = 0; i < turretCount; i++) {
      const t = (i / turretCount) * Math.PI * 2 + 0.4;
      const r = half * (0.4 + (i % 3) * 0.12);
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 22) continue;
      const y = getGroundHeight(x, z);
      this.addEnemy('turret', new THREE.Vector3(x, y, z), {
        primary: false,
        health: 55,
        scoreValue: 320,
        fireCooldown: 1.25 + (i % 3) * 0.28,
      });
    }

    const droneCount = 6;
    for (let i = 0; i < droneCount; i++) {
      const t = (i / droneCount) * Math.PI * 2;
      const cx = Math.cos(t + 1.1) * half * 0.35;
      const cz = Math.sin(t + 1.1) * half * 0.35;
      const ground = getGroundHeight(cx, cz);
      const orbitR = 14 + (i % 3) * 5;
      const height = ground + 18 + (i % 4) * 4;
      const pos = new THREE.Vector3(cx + orbitR, height, cz);
      this.addEnemy('drone', pos, {
        primary: false,
        health: 42,
        scoreValue: 420,
        fireCooldown: 1.65 + (i % 2) * 0.25,
        orbitCenter: new THREE.Vector3(cx, height, cz),
        orbitRadius: orbitR,
        orbitHeight: height,
        orbitAngle: t,
      });
    }
  }

  private addEnemy(
    kind: EnemyKind,
    position: THREE.Vector3,
    opts: {
      primary: boolean;
      health: number;
      scoreValue: number;
      fireCooldown?: number;
      orbitCenter?: THREE.Vector3;
      orbitRadius?: number;
      orbitHeight?: number;
      orbitAngle?: number;
    },
  ) {
    let mesh: THREE.Group;
    let radius: number;
    if (kind === 'turret') {
      mesh = makeTurretMesh();
      radius = 2.4;
    } else if (kind === 'drone') {
      mesh = makeDroneMesh();
      radius = 1.8;
    } else {
      mesh = makeDepotMesh();
      radius = 2.8;
    }

    mesh.position.copy(position);
    this.group.add(mesh);

    const beacon =
      kind === 'depot'
        ? ((mesh.getObjectByName('depot-beacon') as THREE.Mesh) ?? null)
        : null;

    const enemy: Enemy = {
      id: nextEnemyId++,
      kind,
      mesh,
      position: position.clone(),
      health: opts.health,
      maxHealth: opts.health,
      radius,
      alive: true,
      primary: opts.primary,
      fireCooldown: opts.fireCooldown ?? 99,
      fireTimer: Math.random() * (opts.fireCooldown ?? 2),
      orbitCenter: opts.orbitCenter ?? null,
      orbitAngle: opts.orbitAngle ?? 0,
      orbitRadius: opts.orbitRadius ?? 0,
      orbitHeight: opts.orbitHeight ?? position.y,
      scoreValue: opts.scoreValue,
      beacon,
      hitFlash: 0,
    };
    this.enemies.push(enemy);
  }

  update(
    dt: number,
    time: number,
    heliPos: THREE.Vector3,
    heliVel: THREE.Vector3,
    playerAlive: boolean,
  ) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
        enemy.mesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissiveIntensity !== undefined) {
              mat.emissiveIntensity = (mat.userData.baseEmissive ?? mat.emissiveIntensity) + enemy.hitFlash * 1.2;
            }
          }
        });
      }

      if (enemy.kind === 'drone' && enemy.orbitCenter) {
        enemy.orbitAngle += dt * 0.58;
        enemy.position.set(
          enemy.orbitCenter.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius,
          enemy.orbitHeight + Math.sin(time * 1.4 + enemy.id) * 1.6,
          enemy.orbitCenter.z + Math.sin(enemy.orbitAngle) * enemy.orbitRadius,
        );
        enemy.mesh.position.copy(enemy.position);
        enemy.mesh.rotation.y = enemy.orbitAngle + Math.PI / 2;
        const ring = enemy.mesh.getObjectByName('drone-ring');
        if (ring) ring.rotation.z = time * 3.2;
      }

      if (enemy.kind === 'turret') {
        const body = enemy.mesh.getObjectByName('turret-body');
        this.tmpDir.subVectors(heliPos, enemy.position);
        this.tmpDir.y = 0;
        if (body && this.tmpDir.lengthSq() > 0.01) {
          body.rotation.y = Math.atan2(this.tmpDir.x, this.tmpDir.z);
        }
      }

      if (enemy.primary) {
        const pulse = 1 + Math.sin(time * 3 + enemy.id) * 0.045;
        enemy.mesh.scale.setScalar(pulse);
        if (enemy.beacon) {
          const mat = enemy.beacon.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.22 + Math.sin(time * 2.5 + enemy.id) * 0.12;
        }
      }

      if (!playerAlive) continue;
      if (enemy.kind === 'depot') continue;

      const dist = enemy.position.distanceTo(heliPos);
      const range = enemy.kind === 'drone' ? 58 : 72;
      if (dist > range || dist < 7) continue;

      enemy.fireTimer -= dt;
      if (enemy.fireTimer > 0) continue;
      enemy.fireTimer = enemy.fireCooldown;

      this.tmpOrigin.copy(enemy.position);
      this.tmpOrigin.y += enemy.kind === 'drone' ? 0.5 : 1.4;

      // Lead the player slightly for readable but threatening fire
      this.tmpLead.copy(heliPos).addScaledVector(heliVel, 0.35);
      this.tmpDir.subVectors(this.tmpLead, this.tmpOrigin).normalize();
      this.tmpDir.y += 0.04;
      this.tmpDir.normalize();
      this.weapons.spawnEnemyBolt(
        this.tmpOrigin,
        this.tmpDir,
        enemy.kind === 'drone' ? 11 : 14,
      );
    }
  }

  applyProjectileHits(
    projectiles: ReadonlyArray<{
      mesh: THREE.Mesh;
      radius: number;
      damage: number;
      fromPlayer: boolean;
      alive: boolean;
    }>,
  ): EnemyHitResult[] {
    const results: EnemyHitResult[] = [];

    for (const p of projectiles) {
      if (!p.alive || !p.fromPlayer) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const hitRadius = enemy.radius + p.radius;
        const bodyY = enemy.kind === 'drone' ? enemy.position.y : enemy.position.y + 1.2;
        const bodyPos = this.tmpOrigin.set(enemy.position.x, bodyY, enemy.position.z);
        if (p.mesh.position.distanceTo(bodyPos) > hitRadius) continue;

        (p as { alive: boolean }).alive = false;

        const before = enemy.health;
        enemy.health -= p.damage;
        enemy.hitFlash = 1;
        enemy.mesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissiveIntensity !== undefined && mat.userData.baseEmissive === undefined) {
              mat.userData.baseEmissive = mat.emissiveIntensity;
            }
          }
        });

        if (enemy.health <= 0) {
          enemy.alive = false;
          enemy.mesh.visible = false;
          this.effects.spawnExplosion(
            bodyPos.clone(),
            enemy.kind === 'depot' ? 2.0 : 1.25,
            enemy.kind === 'drone' ? 0xaa44ff : COLORS.orangeHot,
          );
          results.push({
            enemy,
            destroyed: true,
            points: enemy.scoreValue,
            overkill: before < p.damage * 0.5,
          });
        } else {
          this.effects.spawnHitSpark(p.mesh.position.clone());
          results.push({ enemy, destroyed: false, points: 0, overkill: false });
        }
        break;
      }
    }

    return results;
  }

  checkRamming(heliPos: THREE.Vector3): number {
    let damage = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const bodyY = enemy.kind === 'drone' ? enemy.position.y : enemy.position.y + 1.0;
      const d = heliPos.distanceTo(
        this.tmpOrigin.set(enemy.position.x, bodyY, enemy.position.z),
      );
      if (d < enemy.radius + 1.5) {
        damage = Math.max(damage, enemy.kind === 'depot' ? 18 : 12);
      }
    }
    return damage;
  }

  clear() {
    for (const enemy of this.enemies) {
      this.group.remove(enemy.mesh);
      disposeObject(enemy.mesh);
    }
    this.enemies.length = 0;
  }

  reset(opts: EnemyLayoutOptions) {
    this.spawnMission(opts);
  }
}
