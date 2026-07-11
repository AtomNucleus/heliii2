import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface SparkSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  length: number;
}

/**
 * Fast streak sparks for impacts and ricochets.
 */
export class SparkSystem {
  readonly group = new THREE.Group();
  private active: SparkSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<SparkSlot>;
  private readonly geo: THREE.CylinderGeometry;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmpDir = new THREE.Vector3();

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'vfx-sparks';
    parent.add(this.group);
    this.budget = budget;
    this.geo = new THREE.CylinderGeometry(0.025, 0.01, 1, 4);

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      12,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): SparkSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.visible = false;
    return {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      active: false,
      length: 1,
    };
  }

  spawn(position: THREE.Vector3, color = COLORS.neonGreen, intensity = 1) {
    const n = Math.max(
      3,
      Math.floor(this.budget.sparksPerHit * this.budget.scale * intensity),
    );
    for (let i = 0; i < n; i++) {
      const slot = this.pool.tryAcquire(this.budget.maxSparks, this.active.length);
      if (!slot) break;

      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 0.95;

      const speed = (12 + Math.random() * 28) * intensity;
      this.tmpDir
        .set(Math.random() * 2 - 1, Math.random() * 1.4 + 0.1, Math.random() * 2 - 1)
        .normalize();
      slot.velocity.copy(this.tmpDir).multiplyScalar(speed);
      slot.length = 0.35 + Math.random() * 0.75 * intensity;
      slot.life = 0.12 + Math.random() * 0.22;
      slot.maxLife = slot.life;
      slot.active = true;

      slot.mesh.position.copy(position);
      slot.mesh.scale.set(1, slot.length, 1);
      slot.mesh.quaternion.setFromUnitVectors(this.up, this.tmpDir);
      slot.mesh.visible = true;
      this.group.add(slot.mesh);
      this.active.push(slot);
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= 28 * dt;
      slot.velocity.multiplyScalar(1 - 1.8 * dt);

      const speed = slot.velocity.length();
      if (speed > 0.15) {
        this.tmpDir.copy(slot.velocity).normalize();
        slot.mesh.quaternion.setFromUnitVectors(this.up, this.tmpDir);
      }
      const t = Math.max(0, slot.life / slot.maxLife);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t;
      slot.mesh.scale.set(1, slot.length * (0.4 + t * 0.6), 1);

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
