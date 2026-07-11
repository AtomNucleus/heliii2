/** Default profile, phase map, and unlock tables. */

import { OPERATION_PHASES } from '../mission/phases';
import type { PhaseId } from '../mission/types';
import type {
  LoadoutId,
  PhaseAccomplishment,
  PlayerProfile,
  ProgressionState,
  SettingsState,
  SkinId,
} from './types';
import { PROFILE_VERSION } from './types';

export const ALL_PHASE_IDS: PhaseId[] = OPERATION_PHASES.map((p) => p.id);

export function emptyPhaseAccomplishment(): PhaseAccomplishment {
  return {
    completed: false,
    completions: 0,
    bestTime: null,
    label: null,
  };
}

export function defaultPhaseMap(): Record<PhaseId, PhaseAccomplishment> {
  const map = {} as Record<PhaseId, PhaseAccomplishment>;
  for (const id of ALL_PHASE_IDS) {
    map[id] = emptyPhaseAccomplishment();
  }
  return map;
}

export function defaultSettings(_opts?: {
  prefersReducedMotion?: boolean;
}): SettingsState {
  return {
    steeringSensitivity: 1,
    masterVolume: 0.88,
    muted: false,
    quality: 'auto',
    // Explicit 'system' until the player overrides — runtime resolves against OS.
    reducedMotion: 'system',
    highContrast: false,
    captions: true,
  };
}

export function defaultProgression(importedBestScore = 0): ProgressionState {
  return {
    bestScore: Math.max(0, Math.floor(importedBestScore)),
    bestGrade: '',
    bestTime: null,
    completedRuns: 0,
    totalRuns: 0,
    phases: defaultPhaseMap(),
    unlockedSkins: ['sunsetGreen'],
    unlockedLoadouts: ['standard'],
    equippedSkin: 'sunsetGreen',
    equippedLoadout: 'standard',
    lastDailyBonusDate: null,
    bestDailyBonus: 0,
  };
}

export function createDefaultProfile(opts?: {
  now?: Date;
  importedBestScore?: number;
  prefersReducedMotion?: boolean;
}): PlayerProfile {
  const now = (opts?.now ?? new Date()).toISOString();
  return {
    version: PROFILE_VERSION,
    progression: defaultProgression(opts?.importedBestScore ?? 0),
    settings: defaultSettings({ prefersReducedMotion: opts?.prefersReducedMotion }),
    createdAt: now,
    updatedAt: now,
  };
}

export interface SkinDef {
  id: SkinId;
  name: string;
  blurb: string;
  /** Unlock hint for locked UI. */
  unlockHint: string;
}

export interface LoadoutDef {
  id: LoadoutId;
  name: string;
  blurb: string;
  unlockHint: string;
  /** Documented end-run flat bonus when a skill condition is met (not combat power). */
  endBonus: {
    label: string;
    points: number;
    /** Condition key evaluated at end summary. */
    when: 'always_cosmetic' | 'clean_win' | 'rings_ten';
  };
}

export const SKIN_DEFS: readonly SkinDef[] = [
  {
    id: 'sunsetGreen',
    name: 'Sunset Green',
    blurb: 'Default Fruzer livery.',
    unlockHint: 'Starter',
  },
  {
    id: 'nightOps',
    name: 'Night Ops',
    blurb: 'Low-vis charcoal with cool nav tips.',
    unlockHint: 'Complete 1 mission',
  },
  {
    id: 'emberStripe',
    name: 'Ember Stripe',
    blurb: 'Hot accent stripes and amber canopy edge.',
    unlockHint: 'Best score ≥ 8,000',
  },
  {
    id: 'ghostArray',
    name: 'Ghost Array',
    blurb: 'Pale canopy + muted body for stealth look.',
    unlockHint: 'Earn grade A or better',
  },
] as const;

export const LOADOUT_DEFS: readonly LoadoutDef[] = [
  {
    id: 'standard',
    name: 'Standard',
    blurb: 'Stock pods. No score modifier.',
    unlockHint: 'Starter',
    endBonus: { label: 'Standard', points: 0, when: 'always_cosmetic' },
  },
  {
    id: 'tracerPods',
    name: 'Tracer Pods',
    blurb: 'Brighter weapon glow. +250 if you win with 0 checkpoint recovers.',
    unlockHint: 'Clear First Strike',
    endBonus: { label: 'Clean Tracer', points: 250, when: 'clean_win' },
  },
  {
    id: 'reconSuite',
    name: 'Recon Suite',
    blurb: 'Cool sensor accents. +200 if you secure all 10 rings.',
    unlockHint: 'Clear Recon',
    endBonus: { label: 'Full Ring Sweep', points: 200, when: 'rings_ten' },
  },
] as const;

export function skinDef(id: SkinId): SkinDef {
  return SKIN_DEFS.find((s) => s.id === id) ?? SKIN_DEFS[0]!;
}

export function loadoutDef(id: LoadoutId): LoadoutDef {
  return LOADOUT_DEFS.find((l) => l.id === id) ?? LOADOUT_DEFS[0]!;
}

/** Grade rank for comparisons (higher = better). */
export function gradeRank(grade: string): number {
  const order = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const i = order.indexOf(grade.toUpperCase());
  return i < 0 ? -1 : order.length - i;
}

export function isBetterGrade(next: string, prev: string): boolean {
  if (!next) return false;
  if (!prev) return true;
  return gradeRank(next) > gradeRank(prev);
}
