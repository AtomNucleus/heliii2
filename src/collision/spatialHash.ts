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

  all(): readonly ColliderAABB[] {
    return this.colliders;
  }
}

const _seen = new Set<number>();
