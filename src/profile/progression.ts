/** Progression updates + unlock evaluation from real mission end summaries. */

import { isBetterGrade, loadoutDef, skinDef } from './defaults';
import { evaluateDailyBonus } from './daily';
import type {
  DailyBonusResult,
  DailyChallenge,
  LoadoutId,
  PlayerProfile,
  ProgressionState,
  RunProgressInput,
  SkinId,
} from './types';
import type { PhaseId } from '../mission/types';

export interface UnlockEvent {
  kind: 'skin' | 'loadout';
  id: string;
  name: string;
}

export interface ProgressionApplyResult {
  progression: ProgressionState;
  newlyUnlocked: UnlockEvent[];
  daily: DailyBonusResult;
  /** Flat score points from equipped loadout perk (skill-gated, not combat power). */
  loadoutBonus: number;
  loadoutBonusLabel: string | null;
}

function cloneProgression(p: ProgressionState): ProgressionState {
  return {
    ...p,
    phases: Object.fromEntries(
      Object.entries(p.phases).map(([k, v]) => [k, { ...v }]),
    ) as ProgressionState['phases'],
    unlockedSkins: [...p.unlockedSkins],
    unlockedLoadouts: [...p.unlockedLoadouts],
  };
}

/** Evaluate unlock criteria against current progression (after run merge). */
export function evaluateUnlocks(prog: ProgressionState): {
  skins: SkinId[];
  loadouts: LoadoutId[];
} {
  const skins = new Set<SkinId>(prog.unlockedSkins);
  const loadouts = new Set<LoadoutId>(prog.unlockedLoadouts);

  skins.add('sunsetGreen');
  loadouts.add('standard');

  if (prog.completedRuns >= 1) skins.add('nightOps');
  if (prog.bestScore >= 8000) skins.add('emberStripe');
  if (prog.bestGrade === 'S' || prog.bestGrade === 'A') skins.add('ghostArray');

  if (prog.phases.firstStrike?.completed) loadouts.add('tracerPods');
  if (prog.phases.recon?.completed) loadouts.add('reconSuite');

  return { skins: [...skins], loadouts: [...loadouts] };
}

export interface RunProgressInputWithRings extends RunProgressInput {
  rings?: number;
  ringsTotal?: number;
}

/**
 * Merge a finished run into progression. Pure — does not touch storage.
 */
export function applyRunToProgression(
  profile: PlayerProfile,
  run: RunProgressInputWithRings,
  daily: DailyChallenge,
): ProgressionApplyResult {
  const progression = cloneProgression(profile.progression);
  progression.totalRuns += 1;

  const dailyResult = evaluateDailyBonus(daily, run);

  if (run.outcome === 'won') {
    progression.completedRuns += 1;
    if (run.score > progression.bestScore) {
      progression.bestScore = Math.floor(run.score);
    }
    if (isBetterGrade(run.grade, progression.bestGrade)) {
      progression.bestGrade = run.grade.toUpperCase();
    }
    if (progression.bestTime == null || run.time < progression.bestTime) {
      progression.bestTime = run.time;
    }
  }

  for (const phaseId of run.completedPhaseIds) {
    const slot = progression.phases[phaseId as PhaseId];
    if (!slot) continue;
    const wasComplete = slot.completed;
    slot.completed = true;
    slot.completions += 1;
    const phaseTime = run.phaseTimes?.[phaseId as PhaseId];
    if (phaseTime != null && phaseTime > 0) {
      if (slot.bestTime == null || phaseTime < slot.bestTime) {
        slot.bestTime = phaseTime;
      }
    }
    if (!wasComplete) {
      slot.label = 'First clear';
    } else if (run.outcome === 'won' && run.checkpointsUsed === 0) {
      slot.label = 'Clean clear';
    } else if (!slot.label) {
      slot.label = 'Cleared';
    }
  }

  let loadoutBonus = 0;
  let loadoutBonusLabel: string | null = null;
  const def = loadoutDef(progression.equippedLoadout);
  if (run.outcome === 'won' && def.endBonus.points > 0) {
    if (def.endBonus.when === 'clean_win' && run.checkpointsUsed === 0) {
      loadoutBonus = def.endBonus.points;
      loadoutBonusLabel = def.endBonus.label;
    } else if (
      def.endBonus.when === 'rings_ten' &&
      (run.rings ?? 0) >= (run.ringsTotal ?? 10)
    ) {
      loadoutBonus = def.endBonus.points;
      loadoutBonusLabel = def.endBonus.label;
    }
  }

  if (dailyResult.met) {
    progression.lastDailyBonusDate = daily.dateKey;
    progression.bestDailyBonus = Math.max(progression.bestDailyBonus, dailyResult.bonus);
  }

  const scoreForUnlocks = Math.floor(run.score + dailyResult.bonus + loadoutBonus);
  if (run.outcome === 'won' && scoreForUnlocks > progression.bestScore) {
    progression.bestScore = scoreForUnlocks;
  }

  const beforeSkins = new Set(progression.unlockedSkins);
  const beforeLoadouts = new Set(progression.unlockedLoadouts);
  const unlocked = evaluateUnlocks(progression);
  progression.unlockedSkins = unlocked.skins;
  progression.unlockedLoadouts = unlocked.loadouts;

  const newlyUnlocked: UnlockEvent[] = [];
  for (const id of unlocked.skins) {
    if (!beforeSkins.has(id)) {
      newlyUnlocked.push({ kind: 'skin', id, name: skinDef(id).name });
    }
  }
  for (const id of unlocked.loadouts) {
    if (!beforeLoadouts.has(id)) {
      newlyUnlocked.push({ kind: 'loadout', id, name: loadoutDef(id).name });
    }
  }

  return {
    progression,
    newlyUnlocked,
    daily: dailyResult,
    loadoutBonus,
    loadoutBonusLabel,
  };
}

export function equipSkin(prog: ProgressionState, skin: SkinId): ProgressionState {
  if (!prog.unlockedSkins.includes(skin)) return prog;
  return { ...prog, equippedSkin: skin };
}

export function equipLoadout(prog: ProgressionState, loadout: LoadoutId): ProgressionState {
  if (!prog.unlockedLoadouts.includes(loadout)) return prog;
  return { ...prog, equippedLoadout: loadout };
}
