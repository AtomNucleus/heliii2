export interface Preferences {
  volume: number;
  muted: boolean;
  sensitivity: number;
  quality: 'high' | 'low';
  reducedMotion: boolean;
  bestTime: number | null;
}
export const PROFILE_KEY = 'helios-flight-v1';
export function parsePreferences(raw: string | null, reducedMotion = false): Preferences {
  const defaults: Preferences = {
    volume: 0.7,
    muted: false,
    sensitivity: 1,
    quality: 'high',
    reducedMotion,
    bestTime: null,
  };
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const number = (n: unknown, min: number, max: number, fallback: number) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    return {
      volume: number(value.volume, 0, 1, 0.7),
      muted: typeof value.muted === 'boolean' ? value.muted : false,
      sensitivity: number(value.sensitivity, 0.5, 1.5, 1),
      quality: value.quality === 'low' ? 'low' : 'high',
      reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : reducedMotion,
      bestTime:
        typeof value.bestTime === 'number' && Number.isFinite(value.bestTime) && value.bestTime > 0
          ? value.bestTime
          : null,
    };
  } catch {
    return defaults;
  }
}
export function loadPreferences(): Preferences {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PROFILE_KEY);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return parsePreferences(raw, matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export function savePreferences(settings: Preferences): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(settings));
  } catch {
    /* Flight remains available without storage. */
  }
}
