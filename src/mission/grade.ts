/** Replayable grade / best-score helpers for Operation SUNSET. */

import { PHASE_PAR_SECONDS } from './phases';
import type { StrikeEndSummary } from './types';
import { getBestScore, noteBestScore } from '../profile/session';
import { LEGACY_BEST_SCORE_KEY } from '../profile/types';

/** @deprecated Prefer PROFILE_STORAGE_KEY — kept for imports/tests. */
export const BEST_SCORE_KEY = LEGACY_BEST_SCORE_KEY;

export function loadBestScore(): number {
  try {
    return getBestScore();
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): { best: number; isNewBest: boolean } {
  try {
    return noteBestScore(score);
  } catch {
    return { best: Math.max(0, Math.floor(score)), isNewBest: false };
  }
}

export function gradeFromRun(input: {
  outcome: 'won' | 'lost';
  score: number;
  time: number;
  healthRatio: number;
  bestCombo: number;
  phasesCompleted: number;
  phaseTotal: number;
  checkpointsUsed: number;
  /** Optional extra points from local daily target (0–2). */
  dailyPoints?: number;
}): string {
  if (input.outcome !== 'won') {
    if (input.phasesCompleted >= input.phaseTotal - 1) return 'D';
    if (input.phasesCompleted >= 4) return 'E';
    return 'F';
  }

  let points = 0;
  const timeRatio = input.time / PHASE_PAR_SECONDS;
  if (timeRatio <= 0.85) points += 3;
  else if (timeRatio <= 1.0) points += 2;
  else if (timeRatio <= 1.15) points += 1;

  if (input.healthRatio >= 0.7) points += 2;
  else if (input.healthRatio >= 0.4) points += 1;

  if (input.bestCombo >= 10) points += 2;
  else if (input.bestCombo >= 6) points += 1;

  if (input.checkpointsUsed === 0) points += 2;
  else if (input.checkpointsUsed <= 1) points += 1;

  if (input.score >= 18000) points += 2;
  else if (input.score >= 12000) points += 1;

  points += Math.max(0, Math.min(2, Math.floor(input.dailyPoints ?? 0)));

  if (points >= 10) return 'S';
  if (points >= 8) return 'A';
  if (points >= 6) return 'B';
  if (points >= 4) return 'C';
  return 'D';
}

export function previewGrade(score: number, time: number, healthRatio: number): string {
  return gradeFromRun({
    outcome: 'won',
    score,
    time,
    healthRatio,
    bestCombo: 0,
    phasesCompleted: 8,
    phaseTotal: 8,
    checkpointsUsed: 0,
  });
}

export function formatEndSubtitle(summary: StrikeEndSummary): string {
  const best = summary.isNewBest ? ' · NEW BEST' : '';
  const daily = summary.dailyLabel ? ` · ${summary.dailyLabel}` : '';
  return `Grade ${summary.grade}${best}${daily} · ${summary.phasesCompleted} phases · Fruzer strike`;
}

/** True only when the final (bonus-inclusive) score strictly beats the prior career best. */
export function isStrictNewBest(previousBest: number, finalScore: number): boolean {
  return finalScore > previousBest && finalScore > 0;
}
