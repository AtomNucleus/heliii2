import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface BurstSlot {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  active: boolean;
  count: number;
}

/**
 * Pooled additive particle bursts — layered explosion cores / muzzle / hits.
 */
export class BurstSystem {
  readonly group = new THREE.Group();
  private active: BurstSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<BurstSlot>;
  private readonly maxParticles: number;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget, maxParticles = 48) {
    this.group.name = 'combat-bursts';
    parent.add(this.group);
    this.budget = budget;
    this.maxParticles = maxParticles;

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.points.visible = false;
        if (slot.points.parent) this.group.remove(slot.points);
      },
      4,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): BurstSlot {
    const positions = new Float32Array(this.maxParticles * 3);
    const velocities = new Float32Array(this.maxParticles * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: COLORS.orangeHot,
      size: 0.5,
      transparent: true,
      opacity: 1,
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

  spawn(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot, lifeMul = 1): void {
    let slot = this.pool.tryAcquire(this.budget.maxBursts, this.active.length);
    if (!slot) {
      const oldest = this.active.shift();
      if (oldest) this.release(oldest);
      slot = this.pool.acquire();
    }

    const count = Math.min(
      this.maxParticles,
      Math.max(8, Math.floor(this.budget.burstParticles * scale * this.budget.scale)),
    );
    slot.count = count;
    slot.life = (0.55 + scale * 0.35) * lifeMul;
    slot.maxLife = slot.life;
    slot.active = true;

    const mat = slot.points.material as THREE.PointsMaterial;
    mat.color.setHex(color);
    mat.size = (0.42 + scale * 0.28) * this.budget.scale;
    mat.opacity = 0.95;

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const upBias = 0.35 + Math.random() * 0.65;
      const dirX = Math.sin(phi) * Math.cos(theta);
      const dirY = Math.abs(Math.cos(phi)) * upBias + 0.15;
      const dirZ = Math.sin(phi) * Math.sin(theta);
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      const speed = (6 + Math.random() * 14) * scale;
      slot.velocities[i * 3] = (dirX / len) * speed;
      slot.velocities[i * 3 + 1] = (dirY / len) * speed;
      slot.velocities[i * 3 + 2] = (dirZ / len) * speed;
      slot.positions[i * 3] = position.x + (Math.random() - 0.5) * 0.35 * scale;
      slot.positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.35 * scale;
      slot.positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.35 * scale;
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
        slot.velocities[p * 3 + 1] -= 16 * dt;
        slot.velocities[p * 3] *= 1 - 0.55 * dt;
        slot.velocities[p * 3 + 2] *= 1 - 0.55 * dt;
      }
      attr.needsUpdate = true;
      const mat = slot.points.material as THREE.PointsMaterial;
      const t = Math.max(0, slot.life / slot.maxLife);
      mat.opacity = t * 0.95;
      mat.size *= 1 - dt * 0.35;

      if (slot.life <= 0) {
        this.active.splice(i, 1);
        this.release(slot);
      }
    }
  }

  private release(slot: BurstSlot) {
    this.pool.release(slot);
  }

  clear() {
    for (const slot of this.active) this.release(slot);
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
