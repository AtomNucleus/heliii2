import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface FlashLightSlot {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peakIntensity: number;
  active: boolean;
}

/**
 * Short-lived pooled point lights for muzzle / blast punch.
 * Disabled on low tier via budget.maxFlashLights === 0.
 */
export class FlashLightSystem {
  readonly group = new THREE.Group();
  private active: FlashLightSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<FlashLightSlot>;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-flash-lights';
    parent.add(this.group);
    this.budget = budget;
    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.light.visible = false;
        slot.light.intensity = 0;
        if (slot.light.parent) this.group.remove(slot.light);
      },
      2,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
    if (!budget.enableFlashLights || budget.maxFlashLights === 0) {
      this.clear();
    }
  }

  private createSlot(): FlashLightSlot {
    const light = new THREE.PointLight(COLORS.orangeHot, 0, 18, 2);
    light.visible = false;
    light.castShadow = false;
    return { light, life: 0, maxLife: 1, peakIntensity: 0, active: false };
  }

  spawn(
    position: THREE.Vector3,
    color = COLORS.orangeHot,
    intensity = 4.5,
    range = 16,
    life = 0.12,
  ) {
    if (!this.budget.enableFlashLights || this.budget.maxFlashLights <= 0) return;

    let slot = this.pool.tryAcquire(this.budget.maxFlashLights, this.active.length);
    if (!slot) {
      const oldest = this.active.shift();
      if (oldest) this.pool.release(oldest);
      slot = this.pool.acquire();
    }

    slot.light.color.setHex(color);
    slot.light.intensity = intensity * this.budget.scale;
    slot.light.distance = range * (0.75 + this.budget.scale * 0.35);
    slot.light.position.copy(position);
    slot.peakIntensity = slot.light.intensity;
    slot.life = life;
    slot.maxLife = life;
    slot.active = true;
    slot.light.visible = true;
    this.group.add(slot.light);
    this.active.push(slot);
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      const t = Math.max(0, slot.life / slot.maxLife);
      const envelope = t > 0.7 ? 1 : t * t;
      slot.light.intensity = slot.peakIntensity * envelope;
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
      slot.light.dispose();
    });
  }
}
