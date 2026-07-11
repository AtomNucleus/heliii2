import * as THREE from 'three';
import { COLORS } from '../scene/setup';

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  fromPlayer: boolean;
  alive: boolean;
  /** Soft homing toward nearest enemy (player rockets only). */
  homing: number;
  trail: THREE.Mesh | null;
}

export interface WeaponFireRequest {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  speed?: number;
  damage?: number;
  life?: number;
  fromPlayer?: boolean;
  color?: number;
  scale?: number;
  homing?: number;
}

/**
 * Shared projectile pool for player rockets and enemy AA bolts.
 * Desktop: F / J / LMB. Mobile: setFireHeld via touch button.
 */
export class WeaponSystem {
  readonly group = new THREE.Group();
  private projectiles: Projectile[] = [];
  private cooldown = 0;
  private readonly fireCooldown: number;
  private fireHeld = false;
  private fireQueued = false;
  private tmpAim = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, fireCooldown = 0.26) {
    this.group.name = 'weapons';
    this.fireCooldown = fireCooldown;
    scene.add(this.group);
    this.bindInput();
  }

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' || e.code === 'KeyJ') {
        e.preventDefault();
        this.fireHeld = true;
        this.fireQueued = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyF' || e.code === 'KeyJ') {
        this.fireHeld = false;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('#mobile-controls, .overlay, button, a')) return;
      this.fireHeld = true;
      this.fireQueued = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });
  }

  /** Mobile / external fire press */
  setFireHeld(held: boolean) {
    if (held && !this.fireHeld) this.fireQueued = true;
    this.fireHeld = held;
  }

  queueFire() {
    this.fireQueued = true;
  }

  get wantsFire(): boolean {
    return this.fireQueued || this.fireHeld;
  }

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  get cooldownRatio(): number {
    return Math.max(0, this.cooldown / this.fireCooldown);
  }

  get activeProjectiles(): readonly Projectile[] {
    return this.projectiles;
  }

  update(dt: number, homingTargets?: ReadonlyArray<THREE.Vector3>) {
    if (this.cooldown > 0) this.cooldown -= dt;

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.despawn(p);
        continue;
      }

      // Soft arcade homing for player rockets
      if (p.fromPlayer && p.homing > 0 && homingTargets && homingTargets.length > 0) {
        let bestDist = Infinity;
        let best: THREE.Vector3 | null = null;
        for (const t of homingTargets) {
          this.tmpDir.subVectors(t, p.mesh.position);
          const d = this.tmpDir.lengthSq();
          if (d < bestDist && d < 55 * 55) {
            // Prefer targets roughly ahead of the rocket
            const ahead = p.velocity.dot(this.tmpDir);
            if (ahead > 0) {
              bestDist = d;
              best = t;
            }
          }
        }
        if (best) {
          this.tmpAim.subVectors(best, p.mesh.position).normalize();
          const speed = p.velocity.length();
          p.velocity.normalize().lerp(this.tmpAim, p.homing * dt).normalize().multiplyScalar(speed);
          p.mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            p.velocity.clone().normalize(),
          );
        }
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.z += dt * 5;

      if (p.trail) {
        p.trail.position.copy(p.mesh.position).addScaledVector(p.velocity, -0.012);
        const mat = p.trail.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.75, p.life * 0.45);
      }
    }
  }

  /**
   * Attempt player fire. Returns true if a rocket was spawned.
   */
  tryPlayerFire(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (!this.wantsFire) return false;
    if (this.cooldown > 0) return false;

    this.fireQueued = false;
    this.cooldown = this.fireCooldown;
    this.spawn({
      origin,
      direction,
      speed: 98,
      damage: 36,
      life: 2.5,
      fromPlayer: true,
      color: COLORS.neonGreen,
      scale: 1,
      homing: 2.4,
    });
    return true;
  }

  spawnEnemyBolt(origin: THREE.Vector3, direction: THREE.Vector3, damage = 12) {
    this.spawn({
      origin,
      direction,
      speed: 46,
      damage,
      life: 3.4,
      fromPlayer: false,
      color: COLORS.orangeHot,
      scale: 0.72,
      homing: 0,
    });
  }

  spawn(req: WeaponFireRequest): Projectile {
    const dir = req.direction.clone().normalize();
    const speed = req.speed ?? 70;
    const scale = req.scale ?? 1;
    const color = req.color ?? COLORS.neonGreen;

    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18 * scale, 0.55 * scale, 4, 8),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.7,
        roughness: 0.3,
        metalness: 0.2,
        flatShading: true,
      }),
    );
    mesh.position.copy(req.origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.group.add(mesh);

    let trail: THREE.Mesh | null = null;
    if (req.fromPlayer !== false) {
      trail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * scale, 0.14 * scale, 1.1 * scale, 5),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      trail.quaternion.copy(mesh.quaternion);
      this.group.add(trail);
    }

    const projectile: Projectile = {
      mesh,
      velocity: dir.multiplyScalar(speed),
      life: req.life ?? 2.5,
      damage: req.damage ?? 20,
      radius: 1.15 * scale,
      fromPlayer: req.fromPlayer ?? true,
      alive: true,
      homing: req.homing ?? 0,
      trail,
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  despawn(p: Projectile) {
    if (!p.alive && !p.mesh.parent) return;
    p.alive = false;
    if (p.mesh.parent) this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
    if (p.trail) {
      if (p.trail.parent) this.group.remove(p.trail);
      p.trail.geometry.dispose();
      (p.trail.material as THREE.Material).dispose();
      p.trail = null;
    }
  }

  compact() {
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  clear() {
    for (const p of this.projectiles) {
      if (p.alive || p.mesh.parent) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        if (p.trail) {
          this.group.remove(p.trail);
          p.trail.geometry.dispose();
          (p.trail.material as THREE.Material).dispose();
        }
      }
    }
    this.projectiles.length = 0;
    this.cooldown = 0;
    this.fireHeld = false;
    this.fireQueued = false;
  }

  reset() {
    this.clear();
  }
}
