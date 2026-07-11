/**
 * Tiny free-list pool for combat FX slots. Avoids per-frame alloc churn.
 */
export class SlotPool<T> {
  private readonly free: T[] = [];
  private readonly all: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    initial = 0,
  ) {
    for (let i = 0; i < initial; i++) {
      const item = factory();
      this.all.push(item);
      this.free.push(item);
    }
  }

  get size(): number {
    return this.all.length;
  }

  get available(): number {
    return this.free.length;
  }

  acquire(): T {
    const item = this.free.pop();
    if (item) return item;
    const created = this.factory();
    this.all.push(created);
    return created;
  }

  release(item: T) {
    this.reset(item);
    this.free.push(item);
  }

  /** Soft-cap: if over max, still acquire but callers should prefer skipping. */
  tryAcquire(maxActive: number, activeCount: number): T | null {
    if (activeCount >= maxActive && this.free.length === 0) return null;
    return this.acquire();
  }

  forEach(fn: (item: T) => void) {
    for (const item of this.all) fn(item);
  }
}
