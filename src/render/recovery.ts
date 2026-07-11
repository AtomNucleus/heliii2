/**
 * Session-scoped WebGL recovery after a post-selection WebGPU setup failure.
 * Pure URL / storage helpers — no DOM side effects.
 */

export const WEBGL_RECOVERY_SESSION_KEY = 'heli.webglRecovery';
export const WEBGL_RECOVERY_QUERY_PARAM = 'webglRecovery';

export function isWebGLRecoveryArmed(
  sessionGet?: (key: string) => string | null,
): boolean {
  return sessionGet?.(WEBGL_RECOVERY_SESSION_KEY) === '1';
}

/** True when the visible URL carries the one-shot recovery query marker. */
export function hasRecoveryQueryMarker(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.get(WEBGL_RECOVERY_QUERY_PARAM) === '1';
}

/**
 * True when a prior recovery already committed (session flag or query marker).
 * While active, preference resolution forces WebGL and further auto-recovery is blocked.
 */
export function hasWebGLRecoveryLoopGuard(
  search: string,
  sessionGet?: (key: string) => string | null,
): boolean {
  return isWebGLRecoveryArmed(sessionGet) || hasRecoveryQueryMarker(search);
}

export function armWebGLRecovery(sessionSet: (key: string, value: string) => void): void {
  sessionSet(WEBGL_RECOVERY_SESSION_KEY, '1');
}

export function clearWebGLRecovery(sessionRemove: (key: string) => void): void {
  sessionRemove(WEBGL_RECOVERY_SESSION_KEY);
}

/**
 * Automatic WebGPU→WebGL recovery URL: stamps only the transient recovery marker.
 * Does not set `renderer=webgl`, so future sessions can reassess after cleanup.
 */
export function buildAutomaticRecoveryUrl(href: string): string {
  const url = new URL(href, 'https://example.invalid');
  url.searchParams.set(WEBGL_RECOVERY_QUERY_PARAM, '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Manual compatibility-mode URL: explicit `renderer=webgl` (user choice) while
 * preserving pathname (deployment subpaths), other query parameters, and hash.
 * Optionally stamps a one-shot loop guard for the reload itself.
 */
export function buildCompatibilityModeUrl(
  href: string,
  options?: { includeRecoveryMarker?: boolean },
): string {
  const url = new URL(href, 'https://example.invalid');
  url.searchParams.set('renderer', 'webgl');
  // Drop conflicting force alias so renderer=webgl is authoritative.
  url.searchParams.delete('forceRenderer');
  if (options?.includeRecoveryMarker) {
    url.searchParams.set(WEBGL_RECOVERY_QUERY_PARAM, '1');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Remove only recovery-added query parameters from a URL.
 * Preserves path, unrelated query params (including user-authored `renderer=`), and hash.
 */
export function stripRecoveryQueryParams(href: string): string {
  const url = new URL(href, 'https://example.invalid');
  url.searchParams.delete(WEBGL_RECOVERY_QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Whether a one-time WebGPU→WebGL recovery reload is still allowed. */
export function canAttemptWebGLRecovery(
  search: string,
  sessionGet?: (key: string) => string | null,
): boolean {
  return !hasWebGLRecoveryLoopGuard(search, sessionGet);
}
