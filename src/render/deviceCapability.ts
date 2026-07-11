/**
 * Pure device-capability signals for renderer backend policy.
 * Prefer pointer/touch/viewport over UA; include iOS Safari when needed.
 */

export interface DeviceCapabilitySignals {
  maxTouchPoints?: number;
  /** `(pointer: coarse)` media query. */
  pointerCoarse?: boolean;
  /** Narrow layout heuristic (e.g. max-width ≤ 900). */
  narrowViewport?: boolean;
  userAgent?: string;
  platform?: string;
}

export interface DeviceCapabilityEnv {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: {
    maxTouchPoints?: number;
    userAgent?: string;
    platform?: string;
  };
  innerWidth?: number;
}

const NARROW_VIEWPORT_PX = 900;

/**
 * Phone / tablet-like environments where WebGPU + TSL post is often unstable.
 * Uses coarse pointer, touch points, and viewport first; UA only for iOS / Android
 * Mobile and iPadOS-desktop-UA cases.
 */
export function isMobileLikeEnvironment(signals: DeviceCapabilitySignals): boolean {
  const touch = (signals.maxTouchPoints ?? 0) > 0;
  const coarse = signals.pointerCoarse === true;
  const narrow = signals.narrowViewport === true;
  const ua = signals.userAgent ?? '';

  const iosUa = /iPhone|iPod|iPad/i.test(ua);
  // iPadOS 13+ may report as Macintosh while exposing touch points.
  const ipadDesktopUa = /Macintosh/i.test(ua) && touch;
  const androidMobile = /Android/i.test(ua) && /Mobile/i.test(ua);

  if (iosUa || ipadDesktopUa || androidMobile) return true;

  // Capability signals — avoid classifying desktop touch (e.g. Surface) by touch alone.
  if (coarse && touch) return true;
  if (coarse && narrow) return true;
  if (touch && narrow) return true;

  return false;
}

/** When true, `auto` preference should take classic WebGL for stability. */
export function preferWebGLForStability(signals: DeviceCapabilitySignals): boolean {
  return isMobileLikeEnvironment(signals);
}

/** Read live browser signals (injectable for tests). */
export function readDeviceCapabilitySignals(
  env: DeviceCapabilityEnv = typeof window !== 'undefined' ? window : {},
): DeviceCapabilitySignals {
  const nav = env.navigator;
  let pointerCoarse: boolean | undefined;
  try {
    pointerCoarse = env.matchMedia?.('(pointer: coarse)')?.matches;
  } catch {
    pointerCoarse = undefined;
  }

  const width = env.innerWidth;
  return {
    maxTouchPoints: nav?.maxTouchPoints,
    pointerCoarse,
    narrowViewport: typeof width === 'number' ? width <= NARROW_VIEWPORT_PX : undefined,
    userAgent: nav?.userAgent,
    platform: nav?.platform,
  };
}
