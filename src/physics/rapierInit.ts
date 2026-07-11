/**
 * Rapier WASM bootstrap with graceful failure.
 * Authoritative heli/building collision stays on the spatial-hash path;
 * this module only powers visual debris dynamics.
 */

/** Namespace of Rapier APIs after `import RAPIER from '@dimforge/rapier3d-compat'`. */
export type RapierModule = typeof import('@dimforge/rapier3d-compat').default;

export interface RapierInitResult {
  ok: true;
  RAPIER: RapierModule;
}

export interface RapierInitFailure {
  ok: false;
  reason: string;
}

export type RapierInitOutcome = RapierInitResult | RapierInitFailure;

let cached: Promise<RapierInitOutcome> | null = null;

/**
 * Load and initialize Rapier once. Subsequent calls reuse the same promise.
 * Never throws — callers must check `ok`.
 */
export function initRapier(): Promise<RapierInitOutcome> {
  if (!cached) {
    cached = (async (): Promise<RapierInitOutcome> => {
      try {
        const mod = await import('@dimforge/rapier3d-compat');
        const RAPIER = mod.default;
        await RAPIER.init();
        return { ok: true, RAPIER };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn('[physics] Rapier init failed — kinematic debris fallback:', reason);
        return { ok: false, reason };
      }
    })();
  }
  return cached;
}

/** Test helper — clears the init cache. */
export function resetRapierInitCache(): void {
  cached = null;
}
