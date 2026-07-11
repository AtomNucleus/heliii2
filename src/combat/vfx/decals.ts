import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

interface DecalSlot {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
  grow: number;
}

/**
 * Ground scorch / impact blot approximations (no textures — procedural discs).
 */
export class DecalSystem {
  readonly group = new THREE.Group();
  private active: DecalSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<DecalSlot>;
  private readonly geo: THREE.CircleGeometry;
  private getGroundHeight: ((x: number, z: number) => number) | null = null;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'vfx-decals';
    parent.add(this.group);
    this.budget = budget;
    this.geo = new THREE.CircleGeometry(1, 20);

    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.mesh.visible = false;
        if (slot.mesh.parent) this.group.remove(slot.mesh);
      },
      4,
    );
  }

  setGroundHeight(fn: ((x: number, z: number) => number) | null) {
    this.getGroundHeight = fn;
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): DecalSlot {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a1210,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 1;
    return { mesh, life: 0, maxLife: 1, active: false, grow: 1 };
  }

  /**
   * Spawn a scorch if the blast is near ground. Returns false if skipped.
   */
  spawn(position: THREE.Vector3, scale = 1, color = 0x2a1810): boolean {
    if (!this.budget.enableDecals) return false;

    let groundY = position.y;
    if (this.getGroundHeight) {
      groundY = this.getGroundHeight(position.x, position.z);
    }
    const heightAbove = position.y - groundY;
    if (heightAbove > 6.5 * Math.max(1, scale)) return false;

    let slot = this.pool.tryAcquire(this.budget.maxDecals, this.active.length);
    if (!slot) {
      const oldest = this.active.shift();
      if (oldest) this.pool.release(oldest);
      slot = this.pool.acquire();
    }

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.7;

    const s = (1.4 + scale * 1.8) * this.budget.scale;
    slot.mesh.position.set(position.x, groundY + 0.06, position.z);
    slot.mesh.scale.setScalar(0.35 * s);
    slot.grow = s;
    slot.life = 2.8 + scale * 1.2;
    slot.maxLife = slot.life;
    slot.active = true;
    slot.mesh.visible = true;
    this.group.add(slot.mesh);
    this.active.push(slot);

    // Hot inner glow disc
    if (this.active.length < this.budget.maxDecals) {
      const glow = this.pool.tryAcquire(this.budget.maxDecals, this.active.length);
      if (glow) {
        const gm = glow.mesh.material as THREE.MeshBasicMaterial;
        gm.color.setHex(COLORS.orangeHot);
        gm.opacity = 0.55;
        glow.mesh.position.set(position.x, groundY + 0.08, position.z);
        glow.mesh.scale.setScalar(0.18 * s);
        glow.grow = s * 0.55;
        glow.life = 0.55 + scale * 0.2;
        glow.maxLife = glow.life;
        glow.active = true;
        glow.mesh.visible = true;
        this.group.add(glow.mesh);
        this.active.push(glow);
      }
    }
    return true;
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.life -= dt;
      const t = 1 - Math.max(0, slot.life / slot.maxLife);
      // Quick expand then hold
      const expand = Math.min(1, t * 4);
      const s = THREE.MathUtils.lerp(0.35, 1, expand) * slot.grow;
      slot.mesh.scale.setScalar(s);
      const mat = slot.mesh.material as THREE.MeshBasicMaterial;
      const fadeStart = 0.55;
      mat.opacity =
        t < fadeStart
          ? 0.7 * (1 - t * 0.15)
          : 0.7 * Math.max(0, (1 - (t - fadeStart) / (1 - fadeStart)));

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
