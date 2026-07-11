import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import type { SmokeFireSystem } from './smokeFire';
import type { EmberSystem } from './embers';
import type { SparkSystem } from './sparks';
import { SlotPool } from './pool';

interface PulseSlot {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
}

/**
 * Continuous helicopter hull damage — smoke / fire / embers by health ratio,
 * plus sting pulses on hit.
 */
export class HullDamageSystem {
  readonly group = new THREE.Group();
  private pulses: PulseSlot[] = [];
  private readonly pool: SlotPool<PulseSlot>;
  private readonly geo: THREE.RingGeometry;
  private budget: CombatFxBudget;
  private healthRatio = 1;
  private intensity = 0;
  private emitAcc = 0;
  private readonly offset = new THREE.Vector3();
  private readonly emitPos = new THREE.Vector3();
  private readonly overlayColor = new THREE.Color(COLORS.orangeHot);

  constructor(
    parent: THREE.Object3D,
    budget: CombatFxBudget,
    private readonly smoke: SmokeFireSystem,
    private readonly embers: EmberSystem,
    private readonly sparks: SparkSystem,
  ) {
    this.group.name = 'combat-hull-damage';
    parent.add(this.group);
    this.budget = budget;
    this.geo = new THREE.RingGeometry(0.4, 0.85, 24);

    this.pool = new SlotPool(
      () => this.createPulse(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      2,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  getIntensity(): number {
    return this.intensity;
  }

  setHealthRatio(ratio: number) {
    this.healthRatio = THREE.MathUtils.clamp(ratio, 0, 1);
  }

  private createPulse(): PulseSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.orangeHot,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.visible = false;
    return { mesh, life: 0, maxLife: 1, active: false };
  }

  /**
   * Trigger damage sting at world position (heli).
   * @returns intensity 0..1 for optional camera/HUD coupling
   */
  trigger(position: THREE.Vector3, amount: number): number {
    const sting = Math.min(1, amount / 22);
    this.intensity = Math.min(1, this.intensity + sting * 0.85);

    const slot = this.pool.tryAcquire(4, this.pulses.length);
    if (slot) {
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.overlayColor);
      mat.opacity = 0.55 + sting * 0.4;
      slot.mesh.position.copy(position);
      slot.mesh.lookAt(position.x, position.y + 1, position.z);
      slot.mesh.scale.setScalar(0.8 + sting);
      slot.life = 0.28 + sting * 0.2;
      slot.maxLife = slot.life;
      slot.active = true;
      slot.mesh.visible = true;
      this.group.add(slot.mesh);
      this.pulses.push(slot);
    }

    this.sparks.spawn(position, COLORS.orangeHot, 0.55 + sting * 0.7);
    if (amount > 8) {
      this.smoke.spawnPuff(position, true, 0.45 + sting * 0.35);
    }
    return sting;
  }

  update(dt: number, followPos?: THREE.Vector3) {
    this.intensity = Math.max(0, this.intensity - dt * 1.6);

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const slot = this.pulses[i];
      slot.life -= dt;
      if (followPos) {
        slot.mesh.position.lerp(followPos, 0.35);
      }
      const t = 1 - Math.max(0, slot.life / slot.maxLife);
      slot.mesh.scale.setScalar(0.8 + t * 3.5);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - t) * 0.75);
      if (slot.life <= 0) {
        this.pulses.splice(i, 1);
        this.pool.release(slot);
      }
    }

    if (!this.budget.enableHullDamage || !followPos) return;
    if (this.healthRatio >= 0.72) return;

    // Continuous leak: smoke below 72%, fire below 40%, embers below 28%
    const damage = 1 - this.healthRatio;
    const interval = THREE.MathUtils.lerp(0.55, 0.12, Math.min(1, damage / 0.85));
    this.emitAcc += dt;
    if (this.emitAcc < interval) return;
    this.emitAcc = 0;

    this.offset.set(
      (Math.random() - 0.5) * 1.4,
      -0.2 + Math.random() * 0.6,
      (Math.random() - 0.5) * 1.2,
    );
    this.emitPos.copy(followPos).add(this.offset);

    const hot = this.healthRatio < 0.4;
    this.smoke.spawnPuff(this.emitPos, hot, 0.45 + damage * 0.55);

    if (this.healthRatio < 0.28 && Math.random() < 0.45) {
      this.embers.spawn(this.emitPos, 0.45 + damage * 0.4, COLORS.orangeGlow);
    }
    if (this.healthRatio < 0.2 && Math.random() < 0.35) {
      this.sparks.spawn(this.emitPos, COLORS.orangeHot, 0.35);
    }
  }

  clear() {
    for (const slot of this.pulses) this.pool.release(slot);
    this.pulses.length = 0;
    this.intensity = 0;
    this.emitAcc = 0;
    this.healthRatio = 1;
  }

  dispose() {
    this.clear();
    this.geo.dispose();
    this.pool.forEach((slot) => {
      (slot.mesh.material as THREE.Material).dispose();
    });
  }
}
