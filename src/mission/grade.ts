/** Replayable grade / best-score helpers for Operation SUNSET. */

import { PHASE_PAR_SECONDS } from './phases';
import type { StrikeEndSummary } from './types';

const BEST_SCORE_KEY = 'heli-sunset-op-sunset-best';

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): { best: number; isNewBest: boolean } {
  const prev = loadBestScore();
  const best = Math.max(prev, Math.floor(score));
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(best));
  } catch {
    /* ignore quota / private mode */
  }
  return { best, isNewBest: best > prev && score > 0 };
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
}): string {
  if (input.outcome !== 'won') {
    if (input.phasesCompleted >= input.phaseTotal - 1) return 'D';
    if (input.phasesCompleted >= 4) return 'E';
    return 'F';
  }

  let points = 0;
  // Time vs par (faster is better, but not punishing early finishes too hard)
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
  return `Grade ${summary.grade}${best} · ${summary.phasesCompleted} phases · Fruzer strike`;
}
