/**
 * Adaptive quality tiers for browser performance.
 * Samples frame time and steps settings up/down without thrashing.
 */

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  pixelRatioCap: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  bloomEnabled: boolean;
  bloomStrength: number;
  filmGrain: boolean;
  vignette: boolean;
  chromaticAberration: boolean;
  colorGrade: boolean;
  particleScale: number;
  trailSegments: number;
  speedLineCount: number;
  atmosphereCount: number;
  cloudCount: number;
  windStreakCount: number;
  composerScale: number;
  /** Additive sunset light shafts (not true volumetrics). */
  lightShafts: boolean;
  lightShaftCount: number;
  /** Soft ground contact blob under the craft. */
  contactShadow: boolean;
  /** MeshStandard water response / wake cues. */
  waterResponse: boolean;
  /** Rapier visual debris (falls back to kinematic if init fails). */
  physicsDebris: boolean;
}

const TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    shadowMapSize: 512,
    shadowsEnabled: false,
    bloomEnabled: true,
    bloomStrength: 0.12,
    filmGrain: false,
    vignette: true,
    chromaticAberration: false,
    colorGrade: true,
    particleScale: 0.45,
    trailSegments: 16,
    speedLineCount: 10,
    atmosphereCount: 36,
    cloudCount: 4,
    windStreakCount: 8,
    composerScale: 0.75,
    lightShafts: false,
    lightShaftCount: 0,
    contactShadow: true,
    waterResponse: true,
    physicsDebris: true,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.5,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    bloomEnabled: true,
    bloomStrength: 0.17,
    filmGrain: false,
    vignette: true,
    chromaticAberration: true,
    colorGrade: true,
    particleScale: 0.75,
    trailSegments: 28,
    speedLineCount: 22,
    atmosphereCount: 72,
    cloudCount: 7,
    windStreakCount: 14,
    composerScale: 0.9,
    lightShafts: true,
    lightShaftCount: 3,
    contactShadow: true,
    waterResponse: true,
    physicsDebris: true,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    bloomEnabled: true,
    bloomStrength: 0.22,
    filmGrain: true,
    vignette: true,
    chromaticAberration: true,
    colorGrade: true,
    particleScale: 1,
    trailSegments: 40,
    speedLineCount: 34,
    atmosphereCount: 110,
    cloudCount: 10,
    windStreakCount: 22,
    composerScale: 1,
    lightShafts: true,
    lightShaftCount: 5,
    contactShadow: true,
    waterResponse: true,
    physicsDebris: true,
  },
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

function detectInitialTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cores <= 2 || mem <= 2 || dpr >= 2.5) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

export function getQualitySettings(tier: QualityTier): QualitySettings {
  return { ...TIERS[tier] };
}

export class AdaptiveQuality {
  private tier: QualityTier;
  private settings: QualitySettings;
  private frameMsEma = 16.7;
  private settleTimer = 0;
  private readonly listeners = new Set<(s: QualitySettings) => void>();
  /** When set, adaptive stepping is disabled and tier stays locked. */
  private locked: QualityTier | null = null;

  /** Target ~55fps before stepping down; ~58fps before stepping up */
  private readonly downMs = 22;
  private readonly upMs = 15.5;
  private readonly settleSec = 2.5;

  constructor(initial?: QualityTier) {
    this.tier = initial ?? detectInitialTier();
    this.settings = getQualitySettings(this.tier);
  }

  get current(): QualitySettings {
    return this.settings;
  }

  get currentTier(): QualityTier {
    return this.tier;
  }

  onChange(fn: (s: QualitySettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTier(tier: QualityTier) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.settings = getQualitySettings(tier);
    this.settleTimer = this.settleSec;
    for (const fn of this.listeners) fn(this.settings);
  }

  /**
   * Lock to a fixed tier, or pass null for auto adaptive.
   * Does not interrupt mid-frame; applies on next setTier/update.
   */
  setPreference(pref: QualityTier | 'auto') {
    if (pref === 'auto') {
      this.locked = null;
      return;
    }
    this.locked = pref;
    this.setTier(pref);
  }

  /** Call once per frame with clamped dt (seconds). */
  update(dt: number) {
    if (this.locked) return;
    const ms = Math.min(dt * 1000, 50);
    this.frameMsEma = this.frameMsEma * 0.92 + ms * 0.08;
    this.settleTimer = Math.max(0, this.settleTimer - dt);
    if (this.settleTimer > 0) return;

    const idx = TIER_ORDER.indexOf(this.tier);
    if (this.frameMsEma > this.downMs && idx > 0) {
      this.setTier(TIER_ORDER[idx - 1]!);
    } else if (this.frameMsEma < this.upMs && idx < TIER_ORDER.length - 1) {
      this.setTier(TIER_ORDER[idx + 1]!);
    }
  }
}
