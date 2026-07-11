import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface EmberSlot {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  active: boolean;
  count: number;
}

/**
 * Slow rising ember / ash particles — residual fire after blasts & hull damage.
 */
export class EmberSystem {
  readonly group = new THREE.Group();
  private active: EmberSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<EmberSlot>;
  private readonly maxParticles = 24;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-embers';
    parent.add(this.group);
    this.budget = budget;
    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.points.visible = false;
        if (slot.points.parent) this.group.remove(slot.points);
      },
      2,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): EmberSlot {
    const positions = new Float32Array(this.maxParticles * 3);
    const velocities = new Float32Array(this.maxParticles * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: COLORS.orangeGlow,
      size: 0.28,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    return {
      points,
      positions,
      velocities,
      life: 0,
      maxLife: 1,
      active: false,
      count: 0,
    };
  }

  spawn(position: THREE.Vector3, scale = 1, color = COLORS.orangeGlow) {
    if (this.budget.maxEmbers <= 0) return;

    let slot = this.pool.tryAcquire(this.budget.maxEmbers, this.active.length);
    if (!slot) {
      const oldest = this.active.shift();
      if (oldest) this.pool.release(oldest);
      slot = this.pool.acquire();
    }

    const count = Math.min(
      this.maxParticles,
      Math.max(6, Math.floor(14 * scale * this.budget.scale)),
    );
    slot.count = count;
    slot.life = 1.4 + scale * 0.8;
    slot.maxLife = slot.life;
    slot.active = true;

    const mat = slot.points.material as THREE.PointsMaterial;
    mat.color.setHex(color);
    mat.size = (0.22 + scale * 0.12) * this.budget.scale;
    mat.opacity = 0.9;

    for (let i = 0; i < count; i++) {
      const spread = 0.9 * scale;
      slot.positions[i * 3] = position.x + (Math.random() - 0.5) * spread;
      slot.positions[i * 3 + 1] = position.y + Math.random() * 0.5 * scale;
      slot.positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * spread;
      slot.velocities[i * 3] = (Math.random() - 0.5) * 1.2 * scale;
      slot.velocities[i * 3 + 1] = 1.2 + Math.random() * 2.8 * scale;
      slot.velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2 * scale;
    }
    for (let i = count; i < this.maxParticles; i++) {
      slot.positions[i * 3 + 1] = -9999;
    }

    (slot.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    slot.points.visible = true;
    this.group.add(slot.points);
    this.active.push(slot);
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      const attr = slot.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let p = 0; p < slot.count; p++) {
        slot.positions[p * 3] += slot.velocities[p * 3] * dt;
        slot.positions[p * 3 + 1] += slot.velocities[p * 3 + 1] * dt;
        slot.positions[p * 3 + 2] += slot.velocities[p * 3 + 2] * dt;
        slot.velocities[p * 3] += (Math.random() - 0.5) * 2.5 * dt;
        slot.velocities[p * 3 + 2] += (Math.random() - 0.5) * 2.5 * dt;
        slot.velocities[p * 3 + 1] *= 1 - 0.15 * dt;
      }
      attr.needsUpdate = true;
      const mat = slot.points.material as THREE.PointsMaterial;
      const t = Math.max(0, slot.life / slot.maxLife);
      mat.opacity = t * 0.85;
      mat.size *= 1 - dt * 0.12;

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
    this.pool.forEach((slot) => {
      slot.points.geometry.dispose();
      (slot.points.material as THREE.Material).dispose();
    });
  }
}
