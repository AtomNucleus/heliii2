/** Deterministic local daily challenge from UTC date (no online boards). */

import type { DailyBonusResult, DailyChallenge, DailyModifierKind, RunProgressInput } from './types';

const KINDS: DailyModifierKind[] = [
  'score_target',
  'time_trial',
  'combo_focus',
  'clean_run',
];

/** Mulberry32 — small deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC calendar key YYYY-MM-DD. */
export function utcDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Stable 32-bit seed from a date key string. */
export function seedFromDateKey(dateKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Mix in a game-specific salt so keys differ from other products.
  h ^= 0x48454c49; // 'HELI'
  return h >>> 0;
}

function challengeId(seed: number): string {
  const a = (seed >>> 16) & 0xffff;
  return `DS-${a.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Build today's (or supplied UTC date) local daily challenge.
 * Modifiers adjust end grading/scoring presentation only — they do not reseed
 * authored mission content (avoids destabilizing phase scripting).
 */
export function buildDailyChallenge(date: Date = new Date()): DailyChallenge {
  const dateKey = utcDateKey(date);
  const seed = seedFromDateKey(dateKey);
  const rnd = mulberry32(seed);
  const kind = KINDS[Math.floor(rnd() * KINDS.length)]!;

  const scoreTarget = 9000 + Math.floor(rnd() * 9000); // 9k–18k
  const timeTarget = 420 + Math.floor(rnd() * 240); // 7–11 min
  const comboTarget = 6 + Math.floor(rnd() * 7); // 6–12
  const bonusPoints = 400 + Math.floor(rnd() * 401); // 400–800

  let label = '';
  let description = '';
  switch (kind) {
    case 'score_target':
      label = 'Score Run';
      description = `Local daily target: score ≥ ${scoreTarget.toLocaleString()} (no online board).`;
      break;
    case 'time_trial':
      label = 'Time Trial';
      description = `Local daily target: win under ${formatClock(timeTarget)} (no online board).`;
      break;
    case 'combo_focus':
      label = 'Combo Focus';
      description = `Local daily target: best combo ≥ ${comboTarget} (no online board).`;
      break;
    case 'clean_run':
      label = 'Clean Hull';
      description =
        'Local daily target: win without checkpoint recovers (no online board).';
      break;
  }

  return {
    dateKey,
    seed,
    id: challengeId(seed),
    kind,
    label,
    description,
    scoreTarget,
    timeTarget,
    comboTarget,
    bonusPoints,
  };
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Evaluate whether a finished run meets today's local daily target.
 * Pure / deterministic given the same challenge + run input.
 */
export function evaluateDailyBonus(
  challenge: DailyChallenge,
  run: Pick<
    RunProgressInput,
    'outcome' | 'score' | 'time' | 'bestCombo' | 'checkpointsUsed'
  >,
): DailyBonusResult {
  if (run.outcome !== 'won') {
    return { met: false, bonus: 0, label: `${challenge.label} — not met` };
  }

  let met = false;
  switch (challenge.kind) {
    case 'score_target':
      met = run.score >= challenge.scoreTarget;
      break;
    case 'time_trial':
      met = run.time <= challenge.timeTarget;
      break;
    case 'combo_focus':
      met = run.bestCombo >= challenge.comboTarget;
      break;
    case 'clean_run':
      met = run.checkpointsUsed === 0;
      break;
  }

  return {
    met,
    bonus: met ? challenge.bonusPoints : 0,
    label: met
      ? `${challenge.label} cleared · +${challenge.bonusPoints}`
      : `${challenge.label} — not met`,
  };
}

/**
 * Extra grade points from daily target (0–2). Used by grade overlay only.
 */
export function dailyGradePoints(
  challenge: DailyChallenge,
  run: Pick<
    RunProgressInput,
    'outcome' | 'score' | 'time' | 'bestCombo' | 'checkpointsUsed'
  >,
): number {
  const { met } = evaluateDailyBonus(challenge, run);
  return met ? 2 : 0;
}
