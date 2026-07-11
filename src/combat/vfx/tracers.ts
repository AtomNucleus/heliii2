import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface TracerSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  length: number;
}

interface FlashSlot {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
}

/**
 * Muzzle streaks + short ballistic tracers.
 */
export class TracerSystem {
  readonly group = new THREE.Group();
  private tracers: TracerSlot[] = [];
  private flashes: FlashSlot[] = [];
  private budget: CombatFxBudget;
  private readonly tracerPool: SlotPool<TracerSlot>;
  private readonly flashPool: SlotPool<FlashSlot>;
  private readonly tracerGeo: THREE.CylinderGeometry;
  private readonly flashGeo: THREE.SphereGeometry;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'vfx-tracers';
    parent.add(this.group);
    this.budget = budget;
    this.tracerGeo = new THREE.CylinderGeometry(0.05, 0.14, 1, 5);
    this.flashGeo = new THREE.SphereGeometry(0.35, 8, 8);

    this.tracerPool = new SlotPool(
      () => this.createTracer(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      6,
    );
    this.flashPool = new SlotPool(
      () => this.createFlash(),
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

  private createTracer(): TracerSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
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

  private createFlash(): FlashSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.flashGeo, mat);
    mesh.visible = false;
    return { mesh, life: 0, maxLife: 1, active: false };
  }

  spawnMuzzle(position: THREE.Vector3, direction: THREE.Vector3, color = COLORS.neonGreen) {
    const dir = this.tmp.copy(direction).normalize();
    const tip = position.clone().addScaledVector(dir, 0.35);

    const flash = this.flashPool.tryAcquire(this.budget.maxFlashes, this.flashes.length);
    if (flash) {
      const mat = flash.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 0.95;
      flash.mesh.position.copy(tip);
      flash.mesh.scale.setScalar(0.7 + Math.random() * 0.35);
      flash.life = 0.07;
      flash.maxLife = flash.life;
      flash.active = true;
      flash.mesh.visible = true;
      this.group.add(flash.mesh);
      this.flashes.push(flash);
    }

    const streak = this.tracerPool.tryAcquire(this.budget.maxTracers, this.tracers.length);
    if (streak) {
      const mat = streak.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 0.9;
      streak.length = 1.4 + Math.random() * 0.5;
      streak.mesh.position.copy(tip).addScaledVector(dir, streak.length * 0.35);
      streak.mesh.scale.set(1, streak.length, 1);
      streak.mesh.quaternion.setFromUnitVectors(this.up, dir);
      streak.velocity.copy(dir).multiplyScalar(40);
      streak.life = 0.1;
      streak.maxLife = streak.life;
      streak.active = true;
      streak.mesh.visible = true;
      this.group.add(streak.mesh);
      this.tracers.push(streak);
    }
  }

  /** Short ballistic tracer that travels briefly (enemy bolts / rocket ghost). */
  spawnBolt(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color = COLORS.orangeHot,
    speed = 90,
    life = 0.18,
  ) {
    const slot = this.tracerPool.tryAcquire(this.budget.maxTracers, this.tracers.length);
    if (!slot) return;
    const dir = this.tmp.copy(direction).normalize();
    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.85;
    slot.length = 1.8;
    slot.mesh.position.copy(origin);
    slot.mesh.scale.set(0.85, slot.length, 0.85);
    slot.mesh.quaternion.setFromUnitVectors(this.up, dir);
    slot.velocity.copy(dir).multiplyScalar(speed);
    slot.life = life;
    slot.maxLife = life;
    slot.active = true;
    slot.mesh.visible = true;
    this.group.add(slot.mesh);
    this.tracers.push(slot);
  }

  update(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const slot = this.tracers[i];
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, slot.life / slot.maxLife) * 0.9;
      if (slot.life <= 0) {
        this.tracers.splice(i, 1);
        this.tracerPool.release(slot);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const slot = this.flashes[i];
      slot.life -= dt;
      const t = Math.max(0, slot.life / slot.maxLife);
      slot.mesh.scale.setScalar(0.5 + (1 - t) * 0.8);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t;
      if (slot.life <= 0) {
        this.flashes.splice(i, 1);
        this.flashPool.release(slot);
      }
    }
  }

  clear() {
    for (const s of this.tracers) this.tracerPool.release(s);
    for (const s of this.flashes) this.flashPool.release(s);
    this.tracers.length = 0;
    this.flashes.length = 0;
  }

  dispose() {
    this.clear();
    this.tracerGeo.dispose();
    this.flashGeo.dispose();
    this.tracerPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
    this.flashPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
  }
}
