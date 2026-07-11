/**
 * Lightweight object pools for combat AI — reuse dead enemy slots & scratch Vec3s.
 * Keeps reinforce / wave churn off the GC hot path.
 */

import type { Vec3 } from './vec';
import { v3 } from './vec';

export interface PoolStats {
  acquired: number;
  released: number;
  created: number;
  size: number;
}

/**
 * Generic free-list pool.
 */
export class ObjectPool<T> {
  private free: T[] = [];
  private readonly factory: () => T;
  private readonly reset?: (item: T) => void;
  private readonly maxSize: number;
  stats: PoolStats = { acquired: 0, released: 0, created: 0, size: 0 };

  constructor(factory: () => T, opts: { reset?: (item: T) => void; maxSize?: number; prewarm?: number } = {}) {
    this.factory = factory;
    this.reset = opts.reset;
    this.maxSize = opts.maxSize ?? 64;
    const n = opts.prewarm ?? 0;
    for (let i = 0; i < n; i++) {
      this.free.push(this.factory());
      this.stats.created++;
    }
    this.stats.size = this.free.length;
  }

  acquire(): T {
    this.stats.acquired++;
    const item = this.free.pop();
    if (item) {
      this.stats.size = this.free.length;
      return item;
    }
    this.stats.created++;
    return this.factory();
  }

  release(item: T) {
    if (this.free.length >= this.maxSize) return;
    this.reset?.(item);
    this.free.push(item);
    this.stats.released++;
    this.stats.size = this.free.length;
  }

  clear() {
    this.free.length = 0;
    this.stats.size = 0;
  }
}

/** Scratch Vec3 pool for AI math (avoids per-frame allocs in hot loops). */
export function createVec3Pool(prewarm = 16): ObjectPool<Vec3> {
  return new ObjectPool(() => v3(), {
    reset: (v) => {
      v.x = 0;
      v.y = 0;
      v.z = 0;
    },
    maxSize: 48,
    prewarm,
  });
}

/**
 * Recycle markers for inactive enemy records (mesh kept hidden until reclaim).
 */
export interface EnemySlotHandle {
  /** Index into EnemySystem.enemies, or -1 if free */
  index: number;
  inUse: boolean;
}

export function createEnemySlotPool(prewarm = 8): ObjectPool<EnemySlotHandle> {
  return new ObjectPool<EnemySlotHandle>(
    (): EnemySlotHandle => ({ index: -1, inUse: false }),
    {
      reset: (h) => {
        h.index = -1;
        h.inUse = false;
      },
      maxSize: 48,
      prewarm,
    },
  );
}
