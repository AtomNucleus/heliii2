/** Pure validation + migration for the player profile blob. */

import { ALL_PHASE_IDS, createDefaultProfile, defaultPhaseMap, isBetterGrade } from './defaults';
import type {
  LoadoutId,
  PhaseAccomplishment,
  PlayerProfile,
  ProgressionState,
  QualityPreference,
  ReducedMotionPreference,
  SettingsState,
  SkinId,
} from './types';
import { PROFILE_VERSION } from './types';

const SKIN_IDS: SkinId[] = ['sunsetGreen', 'nightOps', 'emberStripe', 'ghostArray'];
const LOADOUT_IDS: LoadoutId[] = ['standard', 'tracerPods', 'reconSuite'];
const QUALITY: QualityPreference[] = ['auto', 'low', 'medium', 'high'];
const REDUCED: ReducedMotionPreference[] = ['system', 'on', 'off'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asFiniteNumber(v: unknown, fallback: number, min?: number, max?: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (min != null) out = Math.max(min, out);
  if (max != null) out = Math.min(max, out);
  return out;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function clampInt(n: number, min = 0): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.floor(n));
}

function sanitizeSkinId(v: unknown, fallback: SkinId): SkinId {
  return SKIN_IDS.includes(v as SkinId) ? (v as SkinId) : fallback;
}

function sanitizeLoadoutId(v: unknown, fallback: LoadoutId): LoadoutId {
  return LOADOUT_IDS.includes(v as LoadoutId) ? (v as LoadoutId) : fallback;
}

function sanitizeSkinList(v: unknown): SkinId[] {
  const base: SkinId[] = ['sunsetGreen'];
  if (!Array.isArray(v)) return base;
  const out = new Set<SkinId>(base);
  for (const item of v) {
    if (SKIN_IDS.includes(item as SkinId)) out.add(item as SkinId);
  }
  return [...out];
}

function sanitizeLoadoutList(v: unknown): LoadoutId[] {
  const base: LoadoutId[] = ['standard'];
  if (!Array.isArray(v)) return base;
  const out = new Set<LoadoutId>(base);
  for (const item of v) {
    if (LOADOUT_IDS.includes(item as LoadoutId)) out.add(item as LoadoutId);
  }
  return [...out];
}

function sanitizePhase(
  raw: unknown,
  fallback: PhaseAccomplishment,
): PhaseAccomplishment {
  if (!isRecord(raw)) return { ...fallback };
  const completions = clampInt(asFiniteNumber(raw.completions, fallback.completions, 0));
  const bestTimeRaw = raw.bestTime;
  const bestTime =
    bestTimeRaw == null
      ? null
      : Math.max(0, asFiniteNumber(bestTimeRaw, fallback.bestTime ?? 0, 0));
  return {
    completed: asBool(raw.completed, fallback.completed) || completions > 0,
    completions,
    bestTime: bestTime != null && bestTime > 0 ? bestTime : null,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 64) : fallback.label,
  };
}

function sanitizePhases(raw: unknown): Record<string, PhaseAccomplishment> {
  const base = defaultPhaseMap();
  if (!isRecord(raw)) return base;
  for (const id of ALL_PHASE_IDS) {
    base[id] = sanitizePhase(raw[id], base[id]!);
  }
  return base;
}

function sanitizeSettings(raw: unknown, fallback: SettingsState): SettingsState {
  if (!isRecord(raw)) return { ...fallback };
  const quality = QUALITY.includes(raw.quality as QualityPreference)
    ? (raw.quality as QualityPreference)
    : fallback.quality;
  const reducedMotion = REDUCED.includes(raw.reducedMotion as ReducedMotionPreference)
    ? (raw.reducedMotion as ReducedMotionPreference)
    : fallback.reducedMotion;
  return {
    steeringSensitivity: asFiniteNumber(raw.steeringSensitivity, fallback.steeringSensitivity, 0.5, 1.5),
    masterVolume: asFiniteNumber(raw.masterVolume, fallback.masterVolume, 0, 1),
    muted: asBool(raw.muted, fallback.muted),
    quality,
    reducedMotion,
    highContrast: asBool(raw.highContrast, fallback.highContrast),
    captions: asBool(raw.captions, fallback.captions),
  };
}

function sanitizeProgression(raw: unknown, fallback: ProgressionState): ProgressionState {
  if (!isRecord(raw)) return structuredClone(fallback);
  const unlockedSkins = sanitizeSkinList(raw.unlockedSkins);
  const unlockedLoadouts = sanitizeLoadoutList(raw.unlockedLoadouts);
  let equippedSkin = sanitizeSkinId(raw.equippedSkin, fallback.equippedSkin);
  let equippedLoadout = sanitizeLoadoutId(raw.equippedLoadout, fallback.equippedLoadout);
  if (!unlockedSkins.includes(equippedSkin)) equippedSkin = 'sunsetGreen';
  if (!unlockedLoadouts.includes(equippedLoadout)) equippedLoadout = 'standard';
  const bestGrade = asString(raw.bestGrade, fallback.bestGrade).toUpperCase().slice(0, 1);
  const validGrade = /^[SABCDEF]$/.test(bestGrade) ? bestGrade : fallback.bestGrade;
  const bestTimeRaw = raw.bestTime;
  const bestTime =
    bestTimeRaw == null
      ? null
      : Math.max(0, asFiniteNumber(bestTimeRaw, fallback.bestTime ?? 0, 0));
  return {
    bestScore: clampInt(asFiniteNumber(raw.bestScore, fallback.bestScore, 0)),
    bestGrade: validGrade,
    bestTime: bestTime != null && bestTime > 0 ? bestTime : null,
    completedRuns: clampInt(asFiniteNumber(raw.completedRuns, fallback.completedRuns, 0)),
    totalRuns: clampInt(asFiniteNumber(raw.totalRuns, fallback.totalRuns, 0)),
    phases: sanitizePhases(raw.phases) as ProgressionState['phases'],
    unlockedSkins,
    unlockedLoadouts,
    equippedSkin,
    equippedLoadout,
    lastDailyBonusDate:
      typeof raw.lastDailyBonusDate === 'string' ? raw.lastDailyBonusDate.slice(0, 16) : null,
    bestDailyBonus: clampInt(asFiniteNumber(raw.bestDailyBonus, fallback.bestDailyBonus, 0)),
  };
}

export interface ParseProfileResult {
  profile: PlayerProfile;
  /** True when JSON was invalid / missing and a fresh profile was created. */
  recovered: boolean;
  /** True when fields were repaired or a version bump occurred. */
  migrated: boolean;
}

/**
 * Validate and migrate an unknown JSON value into a PlayerProfile.
 * Always returns a usable profile; never throws.
 */
export function parseAndMigrateProfile(
  raw: unknown,
  opts?: {
    now?: Date;
    importedBestScore?: number;
    prefersReducedMotion?: boolean;
  },
): ParseProfileResult {
  const defaults = createDefaultProfile(opts);
  if (raw == null) {
    if ((opts?.importedBestScore ?? 0) > 0) {
      defaults.progression.bestScore = Math.max(
        defaults.progression.bestScore,
        Math.floor(opts!.importedBestScore!),
      );
    }
    return { profile: defaults, recovered: true, migrated: false };
  }

  if (!isRecord(raw)) {
    return { profile: defaults, recovered: true, migrated: false };
  }

  const version = asFiniteNumber(raw.version, 0);
  let migrated = version !== PROFILE_VERSION;

  // Future versions: best-effort field salvage rather than hard fail.
  const progression = sanitizeProgression(raw.progression, defaults.progression);
  const settings = sanitizeSettings(raw.settings, defaults.settings);

  // Preserve / merge legacy imported best score.
  if ((opts?.importedBestScore ?? 0) > progression.bestScore) {
    progression.bestScore = Math.floor(opts!.importedBestScore!);
    migrated = true;
  }

  // Ensure equipped items are unlocked.
  if (!progression.unlockedSkins.includes(progression.equippedSkin)) {
    progression.equippedSkin = 'sunsetGreen';
    migrated = true;
  }
  if (!progression.unlockedLoadouts.includes(progression.equippedLoadout)) {
    progression.equippedLoadout = 'standard';
    migrated = true;
  }

  const nowIso = (opts?.now ?? new Date()).toISOString();
  const profile: PlayerProfile = {
    version: PROFILE_VERSION,
    progression,
    settings,
    createdAt: asString(raw.createdAt, defaults.createdAt) || defaults.createdAt,
    updatedAt: migrated ? nowIso : asString(raw.updatedAt, nowIso) || nowIso,
  };

  return { profile, recovered: false, migrated };
}

/** Soft merge for best-grade string after a run. */
export function mergeBestGrade(prev: string, next: string): string {
  return isBetterGrade(next, prev) ? next.toUpperCase() : prev;
}
