/**
 * Ordered WebGL context attribute attempts for mobile / constrained GPUs.
 * Pure — no Three.js / DOM.
 */

export type WebGLPowerPreference = 'high-performance' | 'low-power' | 'default';

export interface WebGLContextAttempt {
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
  /** Stable id for diagnostics (`data-renderer-webgl-attempt`). */
  id: string;
}

const FULL_LADDER: readonly WebGLContextAttempt[] = [
  { antialias: true, powerPreference: 'high-performance', id: 'high-performance-aa' },
  { antialias: true, powerPreference: 'default', id: 'default-aa' },
  { antialias: false, powerPreference: 'default', id: 'default-no-aa' },
  { antialias: false, powerPreference: 'low-power', id: 'low-power-no-aa' },
];

/**
 * Desktop: high-performance+AA → default+AA → default no-AA → low-power no-AA.
 * Mobile-stable: begin at default/no-AA (skip aggressive high-performance / AA rungs).
 */
export function webglContextFallbackLadder(options?: {
  mobileStable?: boolean;
}): WebGLContextAttempt[] {
  if (options?.mobileStable) {
    return FULL_LADDER.slice(2).map((step) => ({ ...step }));
  }
  return FULL_LADDER.map((step) => ({ ...step }));
}
