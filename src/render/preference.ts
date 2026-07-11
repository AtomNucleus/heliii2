/**
 * Pure renderer preference resolution (URL query + optional localStorage).
 * Kept free of Three.js / DOM so unit tests can exercise selection logic.
 */

export type RendererPreference = 'auto' | 'webgpu' | 'webgl';

export type RendererBackend = 'webgpu' | 'webgl';

const STORAGE_KEY = 'heli.renderer';

export function getRendererStorageKey(): string {
  return STORAGE_KEY;
}

/**
 * Resolve preferred backend from a query string and optional storage getter.
 *
 * Query (any one wins, first match):
 * - `?renderer=webgl|webgpu|auto`
 * - `?forceRenderer=webgl|webgpu`
 * - `?forceWebGL=1` → webgl
 * - `?webgl=1` → webgl
 *
 * localStorage key `heli.renderer` = `webgl` | `webgpu` when query is absent.
 */
export function resolveRendererPreference(
  search: string,
  storageGet?: (key: string) => string | null,
): RendererPreference {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);

  if (params.get('forceWebGL') === '1' || params.get('webgl') === '1') {
    return 'webgl';
  }

  const fromQuery = normalizePreference(
    params.get('renderer') ?? params.get('forceRenderer'),
  );
  if (fromQuery) return fromQuery;

  const stored = normalizePreference(storageGet?.(STORAGE_KEY) ?? null);
  if (stored === 'webgl' || stored === 'webgpu') return stored;

  return 'auto';
}

export function shouldAttemptWebGPU(preference: RendererPreference): boolean {
  return preference === 'auto' || preference === 'webgpu';
}

/** Whether the environment exposes the WebGPU entry point (not a full adapter probe). */
export function hasWebGPUEntry(gpu: unknown): boolean {
  return gpu != null && typeof gpu === 'object';
}

function normalizePreference(value: string | null | undefined): RendererPreference | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'webgl' || v === 'gl') return 'webgl';
  if (v === 'webgpu' || v === 'gpu') return 'webgpu';
  if (v === 'auto') return 'auto';
  return null;
}
