/** Settings resolution + document / runtime application helpers (pure where possible). */

import type { QualityPreference, ReducedMotionPreference, SettingsState } from './types';
import type { QualityTier } from '../effects/quality';

export function resolveReducedMotionActive(
  pref: ReducedMotionPreference,
  systemPrefersReduced: boolean,
): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return systemPrefersReduced;
}

export function readSystemPrefersReducedMotion(
  matchMedia: ((query: string) => { matches: boolean }) | null = typeof window !== 'undefined'
    ? window.matchMedia.bind(window)
    : null,
): boolean {
  try {
    return matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

export function clampSensitivity(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(1.5, Math.max(0.5, v));
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0.88;
  return Math.min(1, Math.max(0, v));
}

/** Map quality preference to an adaptive-quality lock. */
export function qualityPreferenceToTier(
  pref: QualityPreference,
): QualityTier | 'auto' {
  if (pref === 'auto') return 'auto';
  return pref;
}

export type DocumentClassTarget = {
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    toggle: (c: string, force?: boolean) => void;
  };
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

/**
 * Apply accessibility / presentation classes on documentElement.
 * Safe to call repeatedly.
 */
export function applyDocumentSettings(
  settings: SettingsState,
  opts: {
    root?: DocumentClassTarget | null;
    systemPrefersReduced?: boolean;
  } = {},
): { reducedMotionActive: boolean } {
  const root = opts.root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  const system = opts.systemPrefersReduced ?? readSystemPrefersReducedMotion();
  const reducedMotionActive = resolveReducedMotionActive(settings.reducedMotion, system);

  if (root) {
    root.classList.toggle('a11y-reduced-motion', reducedMotionActive);
    root.classList.toggle('a11y-reduced-motion-off', settings.reducedMotion === 'off');
    root.classList.toggle('a11y-high-contrast', settings.highContrast);
    root.classList.toggle('a11y-captions-off', !settings.captions);
    root.setAttribute('data-quality-pref', settings.quality);
    root.setAttribute('data-reduced-motion', reducedMotionActive ? 'on' : 'off');
    root.setAttribute('data-high-contrast', settings.highContrast ? 'on' : 'off');
    root.setAttribute('data-captions', settings.captions ? 'on' : 'off');
  }

  return { reducedMotionActive };
}

export function patchSettings(
  prev: SettingsState,
  patch: Partial<SettingsState>,
): SettingsState {
  return {
    steeringSensitivity: clampSensitivity(
      patch.steeringSensitivity ?? prev.steeringSensitivity,
    ),
    masterVolume: clampVolume(patch.masterVolume ?? prev.masterVolume),
    muted: patch.muted ?? prev.muted,
    quality: patch.quality ?? prev.quality,
    reducedMotion: patch.reducedMotion ?? prev.reducedMotion,
    highContrast: patch.highContrast ?? prev.highContrast,
    captions: patch.captions ?? prev.captions,
  };
}
