import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface WaveSlot {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  grow: number;
  active: boolean;
  vertical: boolean;
}

/**
 * Expanding additive shock rings for blast read.
 */
export class ShockwaveSystem {
  readonly group = new THREE.Group();
  private active: WaveSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<WaveSlot>;
  private readonly geo: THREE.RingGeometry;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'vfx-shockwaves';
    parent.add(this.group);
    this.budget = budget;
    this.geo = new THREE.RingGeometry(0.25, 0.55, 32);

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      3,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): WaveSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.orangeHot,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 3;
    return {
      mesh,
      life: 0,
      maxLife: 1,
      grow: 8,
      active: false,
      vertical: false,
    };
  }

  spawn(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot, vertical = false): void {
    let slot = this.pool.tryAcquire(this.budget.maxWaves, this.active.length);
    if (!slot) {
      const oldest = this.active.shift();
      if (oldest) this.pool.release(oldest);
      slot = this.pool.acquire();
    }

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.9;

    slot.mesh.position.copy(position);
    slot.mesh.scale.setScalar(0.35 * scale);
    if (vertical) {
      slot.mesh.rotation.set(0, 0, 0);
      slot.mesh.lookAt(position.x, position.y + 1, position.z);
    } else {
      slot.mesh.rotation.set(-Math.PI / 2, 0, 0);
    }
    slot.grow = (10 + scale * 8) * this.budget.scale;
    slot.life = 0.38 + scale * 0.18;
    slot.maxLife = slot.life;
    slot.vertical = vertical;
    slot.active = true;
    slot.mesh.visible = true;
    this.group.add(slot.mesh);
    this.active.push(slot);

    // Secondary softer ring on larger blasts
    if (scale > 1.2 && this.active.length < this.budget.maxWaves) {
      const delayed = this.pool.tryAcquire(this.budget.maxWaves, this.active.length);
      if (delayed) {
        const m2 = delayed.mesh.material as THREE.MeshBasicMaterial;
        m2.color.setHex(color);
        m2.opacity = 0.55;
        delayed.mesh.position.copy(position);
        delayed.mesh.rotation.set(-Math.PI / 2, 0, 0);
        delayed.mesh.scale.setScalar(0.2 * scale);
        delayed.grow = (14 + scale * 10) * this.budget.scale;
        delayed.life = 0.55 + scale * 0.2;
        delayed.maxLife = delayed.life;
        delayed.vertical = false;
        delayed.active = true;
        delayed.mesh.visible = true;
        this.group.add(delayed.mesh);
        this.active.push(delayed);
      }
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      const t = 1 - Math.max(0, slot.life / slot.maxLife);
      const s = 0.35 + t * slot.grow;
      slot.mesh.scale.set(s, s, s);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - t) * (1 - t) * 0.9);

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
