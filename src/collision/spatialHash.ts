import type { ColliderAABB } from './types';

/**
 * XZ spatial hash for AABB broadphase.
 * Y is ignored for bucketing (buildings are tall; XZ locality dominates).
 */
export class SpatialHash {
  readonly cellSize: number;
  private readonly cells = new Map<number, number[]>();
  private readonly colliders: ColliderAABB[];

  constructor(colliders: ColliderAABB[], cellSize = 12) {
    this.colliders = colliders;
    this.cellSize = Math.max(4, cellSize);
    for (let i = 0; i < colliders.length; i++) {
      this.insert(colliders[i]);
    }
  }

  get size(): number {
    return this.colliders.length;
  }

  get cellCount(): number {
    return this.cells.size;
  }

  private key(ix: number, iz: number): number {
    // Pack signed cell coords into a single int key
    return ((ix + 0x8000) & 0xffff) | (((iz + 0x8000) & 0xffff) << 16);
  }

  private insert(c: ColliderAABB) {
    const minIx = Math.floor(c.minX / this.cellSize);
    const maxIx = Math.floor(c.maxX / this.cellSize);
    const minIz = Math.floor(c.minZ / this.cellSize);
    const maxIz = Math.floor(c.maxZ / this.cellSize);
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const k = this.key(ix, iz);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(c.id);
      }
    }
  }

  /**
   * Gather unique collider ids overlapping an XZ query AABB (expanded by pad).
   * Writes into `out` and returns the count (avoids alloc in hot path).
   */
  queryIds(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    out: number[],
  ): number {
    out.length = 0;
    const minIx = Math.floor(minX / this.cellSize);
    const maxIx = Math.floor(maxX / this.cellSize);
    const minIz = Math.floor(minZ / this.cellSize);
    const maxIz = Math.floor(maxZ / this.cellSize);
    const seen = _seen;
    seen.clear();

    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const bucket = this.cells.get(this.key(ix, iz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const id = bucket[i];
          if (seen.has(id)) continue;
          const c = this.colliders[id];
          if (!c || c.active === false) continue;
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out.length;
  }

  getCollider(id: number): ColliderAABB | undefined {
    return this.colliders[id];
  }

  /**
   * Append a collider and bucket it (procedural / mission set-pieces).
   * Returns the assigned id.
   */
  addCollider(partial: Omit<ColliderAABB, 'id'> & { id?: number }): number {
    const id = this.colliders.length;
    const entry: ColliderAABB = {
      ...partial,
      id,
      active: partial.active !== false,
    };
    this.colliders.push(entry);
    this.insert(entry);
    return id;
  }

  /** Soft-disable without rebuilding buckets (destructible props). */
  setActive(id: number, active: boolean): boolean {
    const c = this.colliders[id];
    if (!c) return false;
    c.active = active;
    return true;
  }

  isActive(id: number): boolean {
    const c = this.colliders[id];
    return !!c && c.active !== false;
  }

  activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.colliders.length; i++) {
      if (this.colliders[i].active !== false) n++;
    }
    return n;
  }

  /** Restore HP + active for all destructible props (mission reset). */
  resetDestructibles(): number {
    let n = 0;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.maxHp === undefined) continue;
      c.hp = c.maxHp;
      c.active = true;
      n++;
    }
    return n;
  }

  all(): readonly ColliderAABB[] {
    return this.colliders;
  }
}

const _seen = new Set<number>();
