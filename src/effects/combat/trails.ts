import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';
import { SlotPool } from './pool';

export type TrailKind = 'missile' | 'bolt';

interface TrailSlot {
  line: THREE.Line;
  positions: Float32Array;
  head: number;
  filled: number;
  life: number;
  maxLife: number;
  active: boolean;
  key: number;
  kind: TrailKind;
}

const MAX_SEGMENTS = 24;

/**
 * Pooled ribbon trails for player missiles and enemy bolts.
 * Synced by projectile object identity (numeric key).
 */
export class ProjectileTrailSystem {
  readonly group = new THREE.Group();
  private active: TrailSlot[] = [];
  private budget: CombatFxBudget;
  private readonly pool: SlotPool<TrailSlot>;
  private readonly keyMap = new Map<number, TrailSlot>();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private nextKey = 1;

  constructor(parent: THREE.Object3D, budget: CombatFxBudget) {
    this.group.name = 'combat-projectile-trails';
    parent.add(this.group);
    this.budget = budget;
    this.pool = new SlotPool(
      () => this.createSlot(),
      (slot) => {
        slot.active = false;
        slot.line.visible = false;
        slot.head = 0;
        slot.filled = 0;
        slot.key = 0;
        if (slot.line.parent) this.group.remove(slot.line);
      },
      4,
    );
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  private createSlot(): TrailSlot {
    const positions = new Float32Array(MAX_SEGMENTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    return {
      line,
      positions,
      head: 0,
      filled: 0,
      life: 0,
      maxLife: 1,
      active: false,
      key: 0,
      kind: 'missile',
    };
  }

  /** Allocate a trail key for a projectile; returns 0 if budget exhausted. */
  acquire(kind: TrailKind, color: number): number {
    const slot = this.pool.tryAcquire(this.budget.maxTrails, this.active.length);
    if (!slot) return 0;
    const key = this.nextKey++;
    const mat = slot.line.material as THREE.LineBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = kind === 'missile' ? 0.75 : 0.45;
    slot.kind = kind;
    slot.key = key;
    slot.head = 0;
    slot.filled = 0;
    slot.life = kind === 'missile' ? 2.8 : 1.6;
    slot.maxLife = slot.life;
    slot.active = true;
    slot.line.visible = true;
    slot.line.geometry.setDrawRange(0, 0);
    this.group.add(slot.line);
    this.active.push(slot);
    this.keyMap.set(key, slot);
    return key;
  }

  push(key: number, position: THREE.Vector3) {
    const slot = this.keyMap.get(key);
    if (!slot || !slot.active) return;

    const segs = Math.min(MAX_SEGMENTS, Math.max(6, this.budget.trailSegments));
    const i = slot.head % segs;
    slot.positions[i * 3] = position.x;
    slot.positions[i * 3 + 1] = position.y;
    slot.positions[i * 3 + 2] = position.z;
    slot.head++;
    slot.filled = Math.min(segs, slot.filled + 1);

    // Rewrite buffer in chronological order for Line draw
    const attr = slot.line.geometry.attributes.position as THREE.BufferAttribute;
    const start = slot.head - slot.filled;
    for (let n = 0; n < slot.filled; n++) {
      const src = (start + n) % segs;
      attr.setXYZ(
        n,
        slot.positions[src * 3],
        slot.positions[src * 3 + 1],
        slot.positions[src * 3 + 2],
      );
    }
    attr.needsUpdate = true;
    slot.line.geometry.setDrawRange(0, slot.filled);
    slot.life = slot.maxLife;
  }

  release(key: number) {
    const slot = this.keyMap.get(key);
    if (!slot) return;
    this.keyMap.delete(key);
    const idx = this.active.indexOf(slot);
    if (idx >= 0) this.active.splice(idx, 1);
    this.pool.release(slot);
  }

  /** Fade orphaned trails; keep active ones alive while pushed. */
  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      // Only decay if not recently pushed (life refreshed on push)
      slot.life -= dt;
      const mat = slot.line.material as THREE.LineBasicMaterial;
      const base = slot.kind === 'missile' ? 0.75 : 0.45;
      mat.opacity = base * Math.max(0.15, slot.life / slot.maxLife) * this.budget.scale;

      if (slot.life <= 0) {
        this.keyMap.delete(slot.key);
        this.active.splice(i, 1);
        this.pool.release(slot);
      }
    }
  }

  /** One-shot ghost streak behind a bolt (no persistent key). */
  spawnGhost(origin: THREE.Vector3, direction: THREE.Vector3, color: number, length = 3.5) {
    const key = this.acquire('bolt', color);
    if (!key) return;
    this.tmpDir.copy(direction).normalize();
    const steps = Math.min(8, this.budget.trailSegments);
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      this.push(
        key,
        this.tmp.copy(origin).addScaledVector(this.tmpDir, -length * (1 - t)),
      );
    }
    // Let it fade quickly
    const slot = this.keyMap.get(key);
    if (slot) {
      slot.life = 0.22;
      slot.maxLife = 0.22;
    }
  }

  clear() {
    for (const slot of this.active) {
      this.keyMap.delete(slot.key);
      this.pool.release(slot);
    }
    this.active.length = 0;
    this.keyMap.clear();
  }

  dispose() {
    this.clear();
    this.pool.forEach((slot) => {
      slot.line.geometry.dispose();
      (slot.line.material as THREE.Material).dispose();
    });
  }
}
