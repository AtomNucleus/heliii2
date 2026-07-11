/**
 * Adaptive quality tiers for browser performance / memory.
 * Samples frame time and steps settings up/down without thrashing.
 */

import {
  isMobileLikeEnvironment,
  readDeviceCapabilitySignals,
} from '../render/deviceCapability';

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
  /**
   * Rapier visual debris. Off on low / constrained devices — kinematic
   * debris still runs without the ~2MB WASM heap.
   */
  physicsDebris: boolean;
}

const TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    pixelRatioCap: 1,
    shadowMapSize: 512,
    shadowsEnabled: false,
    bloomEnabled: true,
    bloomStrength: 0.1,
    filmGrain: false,
    vignette: true,
    chromaticAberration: false,
    colorGrade: true,
    particleScale: 0.35,
    trailSegments: 12,
    speedLineCount: 6,
    atmosphereCount: 20,
    cloudCount: 3,
    windStreakCount: 5,
    composerScale: 0.65,
    lightShafts: false,
    lightShaftCount: 0,
    contactShadow: true,
    waterResponse: false,
    physicsDebris: false,
  },
  medium: {
    tier: 'medium',
    pixelRatioCap: 1.25,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    bloomEnabled: true,
    bloomStrength: 0.15,
    filmGrain: false,
    vignette: true,
    chromaticAberration: false,
    colorGrade: true,
    particleScale: 0.6,
    trailSegments: 22,
    speedLineCount: 14,
    atmosphereCount: 48,
    cloudCount: 5,
    windStreakCount: 10,
    composerScale: 0.8,
    lightShafts: true,
    lightShaftCount: 2,
    contactShadow: true,
    waterResponse: true,
    physicsDebris: false,
  },
  high: {
    tier: 'high',
    pixelRatioCap: 1.5,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    bloomEnabled: true,
    bloomStrength: 0.2,
    filmGrain: true,
    vignette: true,
    chromaticAberration: true,
    colorGrade: true,
    particleScale: 0.85,
    trailSegments: 32,
    speedLineCount: 24,
    atmosphereCount: 80,
    cloudCount: 8,
    windStreakCount: 16,
    composerScale: 0.95,
    lightShafts: true,
    lightShaftCount: 4,
    contactShadow: true,
    waterResponse: true,
    physicsDebris: true,
  },
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

function readDeviceMemoryGb(): number {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
}

function detectInitialTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = readDeviceMemoryGb();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mobile = isMobileLikeEnvironment(readDeviceCapabilitySignals());

  // Phones / low-RAM browsers start on the lean tier.
  if (mobile || cores <= 4 || mem <= 4 || dpr >= 2.5) return 'low';
  if (cores <= 6 || mem <= 6) return 'medium';
  return 'high';
}

/** Whether to download/init Rapier WASM (~2MB + heap). */
export function shouldEnableRapierDebris(tier: QualityTier = detectInitialTier()): boolean {
  if (!getQualitySettings(tier).physicsDebris) return false;
  const mem = readDeviceMemoryGb();
  if (mem > 0 && mem <= 4) return false;
  if (isMobileLikeEnvironment(readDeviceCapabilitySignals())) return false;
  return true;
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
  private preference: QualityTier | 'auto' = 'auto';

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

  /** Lock adaptive stepping to a preference, or re-enable auto. */
  setPreference(pref: QualityTier | 'auto') {
    this.preference = pref;
    if (pref !== 'auto') {
      this.setTier(pref);
    }
  }

  /** Call once per frame with clamped dt (seconds). */
  update(dt: number) {
    if (this.preference !== 'auto') return;
    const ms = Math.min(dt * 1000, 50);
    this.frameMsEma = this.frameMsEma * 0.92 + ms * 0.08;
    this.settleTimer = Math.max(0, this.settleTimer - dt);
    if (this.settleTimer > 0) return;

    const idx = TIER_ORDER.indexOf(this.tier);
    if (this.frameMsEma > this.downMs && idx > 0) {
      this.setTier(TIER_ORDER[idx - 1]!);
    } else if (this.frameMsEma < this.upMs && idx < TIER_ORDER.length - 1) {
      // Never auto-promote phones into Rapier/high VRAM tiers.
      const next = TIER_ORDER[idx + 1]!;
      if (isMobileLikeEnvironment(readDeviceCapabilitySignals()) && next === 'high') {
        return;
      }
      this.setTier(next);
    }
  }
}
