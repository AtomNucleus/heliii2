import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface SmokeSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  grow: number;
  spin: number;
  isFire: boolean;
}

/**
 * Rising smoke + fire puffs as soft additive planes (camera-facing).
 */
export class SmokeFireSystem {
  readonly group = new THREE.Group();
  private active: SmokeSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<SmokeSlot>;
  private readonly geo: THREE.PlaneGeometry;
  private camera: THREE.Camera | null = null;
  private readonly coolColor = new THREE.Color(0x4a4038);

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-smoke-fire';
    parent.add(this.group);
    this.budget = budget;
    this.geo = new THREE.PlaneGeometry(1, 1);

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      10,
    );
  }

  setCamera(camera: THREE.Camera | null) {
    this.camera = camera;
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): SmokeSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.orangeHot,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 2;
    return {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      active: false,
      grow: 1,
      spin: 0,
      isFire: false,
    };
  }

  spawn(position: THREE.Vector3, scale = 1, hot = true) {
    if (!this.budget.enableSmoke) return;
    const n = Math.max(
      2,
      Math.floor(this.budget.smokePerExplosion * this.budget.scale * Math.min(1.5, scale)),
    );
    for (let i = 0; i < n; i++) {
      const slot = this.pool.tryAcquire(this.budget.maxSmoke, this.active.length);
      if (!slot) break;

      const isFire = hot && i < Math.ceil(n * 0.45);
      slot.isFire = isFire;
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(isFire ? COLORS.orangeHot : 0x6a5a52);
      mat.blending = isFire ? THREE.AdditiveBlending : THREE.NormalBlending;
      mat.opacity = isFire ? 0.75 : 0.42;

      slot.mesh.position.copy(position);
      slot.mesh.position.x += (Math.random() - 0.5) * 0.8 * scale;
      slot.mesh.position.y += 0.2 + Math.random() * 0.6 * scale;
      slot.mesh.position.z += (Math.random() - 0.5) * 0.8 * scale;

      const base = (isFire ? 1.1 : 1.6) * scale * this.budget.scale;
      slot.mesh.scale.setScalar(base * (0.6 + Math.random() * 0.5));
      slot.grow = (isFire ? 2.2 : 3.4) * scale;
      slot.spin = (Math.random() - 0.5) * 1.4;
      slot.velocity.set(
        (Math.random() - 0.5) * 1.8 * scale,
        (isFire ? 3.5 : 2.2) + Math.random() * 2.5 * scale,
        (Math.random() - 0.5) * 1.8 * scale,
      );
      slot.life = (isFire ? 0.45 : 1.1) + Math.random() * (isFire ? 0.35 : 0.9) + scale * 0.15;
      slot.maxLife = slot.life;
      slot.active = true;
      slot.mesh.visible = true;
      this.group.add(slot.mesh);
      this.active.push(slot);
    }
  }

  /** Single soft puff — used by continuous hull damage. */
  spawnPuff(position: THREE.Vector3, hot: boolean, scale = 0.55) {
    if (!this.budget.enableSmoke) return;
    const slot = this.pool.tryAcquire(this.budget.maxSmoke, this.active.length);
    if (!slot) return;

    slot.isFire = hot;
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(hot ? COLORS.orangeHot : 0x5a5048);
    mat.blending = hot ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.opacity = hot ? 0.65 : 0.38;

    slot.mesh.position.copy(position);
    slot.mesh.position.x += (Math.random() - 0.5) * 0.5;
    slot.mesh.position.y += 0.1 + Math.random() * 0.3;
    slot.mesh.position.z += (Math.random() - 0.5) * 0.5;
    slot.mesh.scale.setScalar((hot ? 0.7 : 1.0) * scale * this.budget.scale);
    slot.grow = hot ? 1.6 : 2.4;
    slot.spin = (Math.random() - 0.5) * 1.2;
    slot.velocity.set(
      (Math.random() - 0.5) * 0.8,
      (hot ? 2.2 : 1.6) + Math.random() * 1.2,
      (Math.random() - 0.5) * 0.8,
    );
    slot.life = hot ? 0.55 : 1.2;
    slot.maxLife = slot.life;
    slot.active = true;
    slot.mesh.visible = true;
    this.group.add(slot.mesh);
    this.active.push(slot);
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y += (slot.isFire ? 1.2 : 0.6) * dt;
      slot.velocity.x *= 1 - 0.4 * dt;
      slot.velocity.z *= 1 - 0.4 * dt;

      const t = 1 - Math.max(0, slot.life / slot.maxLife);
      const s = slot.mesh.scale.x + slot.grow * dt * (0.35 + t);
      slot.mesh.scale.setScalar(s);
      slot.mesh.rotation.z += slot.spin * dt;

      if (this.camera) {
        slot.mesh.lookAt(this.camera.position);
      }

      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      const fade = Math.max(0, slot.life / slot.maxLife);
      mat.opacity = fade * (slot.isFire ? 0.7 : 0.4);

      if (slot.isFire && t > 0.45) {
        mat.color.lerp(this.coolColor, dt * 2.5);
      }

      if (slot.life <= 0) {
        this.active.splice(i, 1);
        this.pool.release(slot);
      }
    }
  }

  clear() {
    for (const slot of this.active) this.pool.release(slot);
    this.active.length = 0;
  }

  dispose() {
    this.clear();
    this.geo.dispose();
    this.pool.forEach((slot) => {
      (slot.mesh.material as THREE.Material).dispose();
    });
  }
}
