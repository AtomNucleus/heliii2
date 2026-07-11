import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface DebrisSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

const DEBRIS_COLORS = [0x4a5560, 0x3a3030, 0x5a4030, 0x2a3238, COLORS.orangeHot];

/**
 * Tumbling mesh shards for destruction — pooled boxes / tetrahedra.
 */
export class DebrisSystem {
  readonly group = new THREE.Group();
  private active: DebrisSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<DebrisSlot>;
  private readonly sharedGeos: THREE.BufferGeometry[];
  private readonly gravity = 22;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-debris';
    parent.add(this.group);
    this.budget = budget;
    this.sharedGeos = [
      new THREE.BoxGeometry(0.35, 0.22, 0.28),
      new THREE.TetrahedronGeometry(0.28, 0),
      new THREE.BoxGeometry(0.5, 0.12, 0.2),
    ];

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      8,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): DebrisSlot {
    const geo = this.sharedGeos[0];
    const mat = new THREE.MeshStandardMaterial({
      color: DEBRIS_COLORS[0],
      emissive: COLORS.orangeHot,
      emissiveIntensity: 0.35,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    return {
      mesh,
      velocity: new THREE.Vector3(),
      angular: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      active: false,
    };
  }

  spawn(position: THREE.Vector3, scale = 1, colorHint?: number) {
    if (!this.budget.enableDebris) return;
    const n = Math.max(
      2,
      Math.floor(this.budget.debrisPerKill * this.budget.scale * Math.min(1.6, scale)),
    );
    for (let i = 0; i < n; i++) {
      const slot = this.pool.tryAcquire(this.budget.maxDebris, this.active.length);
      if (!slot) break;

      const geo = this.sharedGeos[i % this.sharedGeos.length];
      slot.mesh.geometry = geo;
      const mat = slot.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(colorHint ?? DEBRIS_COLORS[i % DEBRIS_COLORS.length]);
      mat.emissive.setHex(COLORS.orangeHot);
      mat.emissiveIntensity = 0.25 + Math.random() * 0.55;
      mat.opacity = 1;

      const s = (0.55 + Math.random() * 0.9) * scale * this.budget.scale;
      slot.mesh.scale.setScalar(s);
      slot.mesh.position.copy(position);
      slot.mesh.position.x += (Math.random() - 0.5) * 0.6 * scale;
      slot.mesh.position.y += 0.4 + Math.random() * 0.8 * scale;
      slot.mesh.position.z += (Math.random() - 0.5) * 0.6 * scale;
      slot.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

      const speed = (7 + Math.random() * 14) * scale;
      const theta = Math.random() * Math.PI * 2;
      slot.velocity.set(
        Math.cos(theta) * speed * (0.5 + Math.random()),
        (6 + Math.random() * 12) * scale,
        Math.sin(theta) * speed * (0.5 + Math.random()),
      );
      slot.angular.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
      );
      slot.life = 0.9 + Math.random() * 0.85 + scale * 0.2;
      slot.maxLife = slot.life;
      slot.active = true;
      slot.mesh.visible = true;
      this.group.add(slot.mesh);
      this.active.push(slot);
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      slot.velocity.y -= this.gravity * dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.mesh.rotation.x += slot.angular.x * dt;
      slot.mesh.rotation.y += slot.angular.y * dt;
      slot.mesh.rotation.z += slot.angular.z * dt;
      slot.velocity.x *= 1 - 0.35 * dt;
      slot.velocity.z *= 1 - 0.35 * dt;

      const mat = slot.mesh.material as THREE.MeshStandardMaterial;
      const t = Math.max(0, slot.life / slot.maxLife);
      mat.opacity = t;
      mat.emissiveIntensity = t * 0.55;

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
    for (const geo of this.sharedGeos) geo.dispose();
    this.pool.forEach((slot) => {
      (slot.mesh.material as THREE.Material).dispose();
    });
  }
}
