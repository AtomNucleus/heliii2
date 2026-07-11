import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

export type ImpactSurface = 'metal' | 'ground' | 'water' | 'air';

interface ImpactSlot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
  length: number;
}

const SURFACE_COLORS: Record<ImpactSurface, number> = {
  metal: COLORS.neonGreen,
  ground: COLORS.orangeHot,
  water: COLORS.rimCool,
  air: COLORS.orangeGlow,
};

/**
 * Surface-typed impact bursts — sparks for metal, dust for ground,
 * spray rings for water, soft flash for air.
 */
export class ImpactSystem {
  readonly group = new THREE.Group();
  private streaks: ImpactSlot[] = [];
  private rings: ImpactSlot[] = [];
  private budget: CombatFxBudget;
  private readonly streakPool: SlotPool<ImpactSlot>;
  private readonly ringPool: SlotPool<ImpactSlot>;
  private readonly streakGeo: THREE.CylinderGeometry;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-impacts';
    parent.add(this.group);
    this.budget = budget;
    this.streakGeo = new THREE.CylinderGeometry(0.02, 0.008, 1, 4);
    this.ringGeo = new THREE.RingGeometry(0.15, 0.4, 20);

    this.streakPool = new SlotPool(
      () => this.createStreak(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      10,
    );
    this.ringPool = new SlotPool(
      () => this.createRing(),
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

  private createStreak(): ImpactSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.streakGeo, mat);
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

  private createRing(): ImpactSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.rimCool,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
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

  spawn(
    position: THREE.Vector3,
    surface: ImpactSurface = 'metal',
    intensity = 1,
    normal?: THREE.Vector3,
  ) {
    const color = SURFACE_COLORS[surface];
    const n = Math.max(
      2,
      Math.floor(this.budget.sparksPerHit * 0.7 * this.budget.scale * intensity),
    );
    const count = Math.min(n, this.budget.maxImpacts - this.streaks.length);

    const basis = normal
      ? this.tmp.copy(normal).normalize()
      : this.tmp.set(0, 1, 0);

    for (let i = 0; i < count; i++) {
      const slot = this.streakPool.tryAcquire(this.budget.maxImpacts, this.streaks.length);
      if (!slot) break;

      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = surface === 'water' ? 0.7 : 0.95;

      // Reflect-ish scatter around surface normal
      this.tmpDir
        .set(
          (Math.random() - 0.5) * 2,
          Math.random() * (surface === 'ground' ? 1.2 : 1.6) + 0.15,
          (Math.random() - 0.5) * 2,
        )
        .addScaledVector(basis, 0.6)
        .normalize();

      const speed =
        (surface === 'metal' ? 18 : surface === 'water' ? 10 : 12) +
        Math.random() * 16 * intensity;
      slot.velocity.copy(this.tmpDir).multiplyScalar(speed);
      slot.length =
        (surface === 'metal' ? 0.45 : 0.3) + Math.random() * 0.55 * intensity;
      slot.life =
        (surface === 'water' ? 0.28 : 0.14) + Math.random() * 0.18;
      slot.maxLife = slot.life;
      slot.active = true;
      slot.mesh.position.copy(position);
      slot.mesh.scale.set(1, slot.length, 1);
      slot.mesh.quaternion.setFromUnitVectors(this.up, this.tmpDir);
      slot.mesh.visible = true;
      this.group.add(slot.mesh);
      this.streaks.push(slot);
    }

    if (surface === 'water' || surface === 'ground') {
      const ring = this.ringPool.tryAcquire(4, this.rings.length);
      if (ring) {
        const mat = ring.mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(surface === 'water' ? COLORS.rimCool : 0x6a5040);
        mat.opacity = surface === 'water' ? 0.75 : 0.5;
        ring.mesh.position.copy(position);
        ring.mesh.position.y += 0.05;
        ring.mesh.rotation.set(-Math.PI / 2, 0, 0);
        ring.mesh.scale.setScalar(0.4 * intensity);
        ring.life = surface === 'water' ? 0.45 : 0.3;
        ring.maxLife = ring.life;
        ring.length = 2.5 + intensity;
        ring.active = true;
        ring.mesh.visible = true;
        this.group.add(ring.mesh);
        this.rings.push(ring);
      }
    }
  }

  update(dt: number) {
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const slot = this.streaks[i];
      slot.life -= dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.velocity.y -= 22 * dt;
      slot.velocity.multiplyScalar(1 - 1.5 * dt);
      const speed = slot.velocity.length();
      if (speed > 0.1) {
        this.tmp.copy(slot.velocity).normalize();
        slot.mesh.quaternion.setFromUnitVectors(this.up, this.tmp);
      }
      const t = Math.max(0, slot.life / slot.maxLife);
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      slot.mesh.scale.set(1, slot.length * (0.35 + t * 0.65), 1);
      if (slot.life <= 0) {
        this.streaks.splice(i, 1);
        this.streakPool.release(slot);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const slot = this.rings[i];
      slot.life -= dt;
      const t = 1 - Math.max(0, slot.life / slot.maxLife);
      slot.mesh.scale.setScalar(0.4 + t * slot.length);
      (slot.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.7);
      if (slot.life <= 0) {
        this.rings.splice(i, 1);
        this.ringPool.release(slot);
      }
    }
  }

  clear() {
    for (const s of this.streaks) this.streakPool.release(s);
    for (const s of this.rings) this.ringPool.release(s);
    this.streaks.length = 0;
    this.rings.length = 0;
  }

  dispose() {
    this.clear();
    this.streakGeo.dispose();
    this.ringGeo.dispose();
    this.streakPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
    this.ringPool.forEach((s) => (s.mesh.material as THREE.Material).dispose());
  }
}

/**
 * Infer impact surface from height above ground / optional water plane.
 */
export function inferImpactSurface(
  position: THREE.Vector3,
  getGroundHeight: ((x: number, z: number) => number) | null,
  waterY: number | null = null,
): ImpactSurface {
  if (!getGroundHeight) return 'air';
  const gy = getGroundHeight(position.x, position.z);
  const h = position.y - gy;
  if (waterY !== null && gy <= waterY + 0.4 && h < 2.5) return 'water';
  if (h < 1.2) return 'ground';
  if (h < 4.5) return 'ground';
  return 'air';
}
