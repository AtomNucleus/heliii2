/** Versioned player profile schema for HELI SUNSET progression + settings. */

import type { PhaseId } from '../mission/types';

export const PROFILE_VERSION = 1 as const;

/** Primary profile blob in localStorage. */
export const PROFILE_STORAGE_KEY = 'heli-sunset-profile-v1';

/** Legacy best-score key — imported on first load so players keep progress. */
export const LEGACY_BEST_SCORE_KEY = 'heli-sunset-op-sunset-best';

export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';
export type ReducedMotionPreference = 'system' | 'on' | 'off';

export type SkinId = 'sunsetGreen' | 'nightOps' | 'emberStripe' | 'ghostArray';
export type LoadoutId = 'standard' | 'tracerPods' | 'reconSuite';

export type DailyModifierKind =
  | 'score_target'
  | 'time_trial'
  | 'combo_focus'
  | 'clean_run';

export interface PhaseAccomplishment {
  completed: boolean;
  completions: number;
  /** Best phase clear time when tracked (seconds). */
  bestTime: number | null;
  /** Short accomplishment tag, e.g. "first clear". */
  label: string | null;
}

export interface ProgressionState {
  bestScore: number;
  bestGrade: string;
  /** Best winning run time (seconds). */
  bestTime: number | null;
  completedRuns: number;
  totalRuns: number;
  phases: Record<PhaseId, PhaseAccomplishment>;
  unlockedSkins: SkinId[];
  unlockedLoadouts: LoadoutId[];
  equippedSkin: SkinId;
  equippedLoadout: LoadoutId;
  /** Last UTC date key that earned the daily bonus (YYYY-MM-DD). */
  lastDailyBonusDate: string | null;
  /** Best daily-bonus score earned (local only — no online boards). */
  bestDailyBonus: number;
}

export interface SettingsState {
  /** Steering axis multiplier 0.5…1.5 */
  steeringSensitivity: number;
  /** Master audio 0…1 */
  masterVolume: number;
  muted: boolean;
  quality: QualityPreference;
  /**
   * Reduced motion: `system` follows prefers-reduced-motion until the player
   * explicitly chooses on/off.
   */
  reducedMotion: ReducedMotionPreference;
  highContrast: boolean;
  /** Radio / caption text preference (critical objective toasts stay visible). */
  captions: boolean;
}

export interface PlayerProfile {
  version: typeof PROFILE_VERSION;
  progression: ProgressionState;
  settings: SettingsState;
  createdAt: string;
  updatedAt: string;
}

export interface DailyChallenge {
  /** UTC calendar date YYYY-MM-DD */
  dateKey: string;
  seed: number;
  /** Short local identity, e.g. DS-A7F2 */
  id: string;
  kind: DailyModifierKind;
  label: string;
  description: string;
  /** Score target when kind is score_target */
  scoreTarget: number;
  /** Time ceiling (seconds) when kind is time_trial */
  timeTarget: number;
  /** Combo target when kind is combo_focus */
  comboTarget: number;
  /** Flat score bonus awarded when the daily target is met (local only). */
  bonusPoints: number;
}

export interface RunProgressInput {
  outcome: 'won' | 'lost';
  score: number;
  grade: string;
  time: number;
  bestCombo: number;
  phasesCompleted: number;
  phaseTotal: number;
  checkpointsUsed: number;
  /** Phase ids completed this run (in order). */
  completedPhaseIds: PhaseId[];
  /** Optional per-phase times if available. */
  phaseTimes?: Partial<Record<PhaseId, number>>;
}

export interface DailyBonusResult {
  met: boolean;
  bonus: number;
  label: string;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
