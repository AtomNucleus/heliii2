/**
 * Pure mission director / state machine for Operation SUNSET.
 * Owns act framing, phase transitions, soft pacing timers, and outcome —
 * StrikeMission remains the combat/world adapter.
 */

import {
  OPERATION_PHASES,
  getPhaseDef,
  nextPhaseId,
  PHASE_PAR_SECONDS,
} from './phases';
import type { PhaseDefinition, PhaseId } from './types';
import type { MissionOutcome } from '../combat/mission';

export type ActId = 1 | 2 | 3;

export interface ActDefinition {
  id: ActId;
  code: string;
  title: string;
  /** Inclusive phase ids belonging to this act */
  phases: readonly PhaseId[];
}

/** Three-act vertical slice: setup → escalation → climax/exfil. */
export const OPERATION_ACTS: readonly ActDefinition[] = [
  {
    id: 1,
    code: 'ACT I',
    title: 'INFILTRATION',
    phases: ['ingress', 'recon', 'firstStrike'],
  },
  {
    id: 2,
    code: 'ACT II',
    title: 'ESCALATION',
    phases: ['aaGauntlet', 'convoy', 'retaliation'],
  },
  {
    id: 3,
    code: 'ACT III',
    title: 'SUNSET',
    phases: ['commandBunker', 'exfil'],
  },
] as const;

export function actForPhase(phaseId: PhaseId): ActDefinition {
  const found = OPERATION_ACTS.find((a) => a.phases.includes(phaseId));
  if (!found) throw new Error(`No act for phase ${phaseId}`);
  return found;
}

export type DirectorTransition =
  | { type: 'phaseEnter'; phaseId: PhaseId; def: PhaseDefinition; act: ActDefinition; isMissionStart: boolean }
  | { type: 'phaseComplete'; phaseId: PhaseId; def: PhaseDefinition; bonus: number }
  | { type: 'softNudge'; phaseId: PhaseId; def: PhaseDefinition }
  | { type: 'missionEnd'; outcome: 'won' | 'lost' };

export type DirectorListener = (event: DirectorTransition) => void;

/**
 * Lightweight finite-state director. Combat systems stay outside;
 * this only advances authored beats and pacing clocks.
 */
export class MissionDirector {
  private phaseId: PhaseId = 'ingress';
  private phaseElapsed = 0;
  private softNudgeSent = false;
  private phasesCompleted = 0;
  private outcome: MissionOutcome = 'playing';
  private readonly listeners: DirectorListener[] = [];

  onTransition(listener: DirectorListener) {
    this.listeners.push(listener);
  }

  private emit(event: DirectorTransition) {
    for (const listener of this.listeners) listener(event);
  }

  get currentPhaseId(): PhaseId {
    return this.phaseId;
  }

  get currentPhase(): PhaseDefinition {
    return getPhaseDef(this.phaseId);
  }

  get currentAct(): ActDefinition {
    return actForPhase(this.phaseId);
  }

  get elapsedInPhase(): number {
    return this.phaseElapsed;
  }

  get completedCount(): number {
    return this.phasesCompleted;
  }

  get phaseTotal(): number {
    return OPERATION_PHASES.length;
  }

  get missionOutcome(): MissionOutcome {
    return this.outcome;
  }

  get parSeconds(): number {
    return PHASE_PAR_SECONDS;
  }

  get isPlaying(): boolean {
    return this.outcome === 'playing';
  }

  /** HUD-friendly act + phase tag, e.g. "ACT II · P4". */
  hudTag(): string {
    const act = this.currentAct;
    const def = this.currentPhase;
    return `${act.code} · ${def.code}`;
  }

  reset() {
    this.phaseId = 'ingress';
    this.phaseElapsed = 0;
    this.softNudgeSent = false;
    this.phasesCompleted = 0;
    this.outcome = 'playing';
    this.enterPhase('ingress', true);
  }

  /** Advance soft timers; may emit softNudge once per phase. */
  tick(dt: number) {
    if (this.outcome !== 'playing') return;
    this.phaseElapsed += dt;
    const def = this.currentPhase;
    if (
      !this.softNudgeSent &&
      def.softTimer != null &&
      this.phaseElapsed > def.softTimer
    ) {
      this.softNudgeSent = true;
      this.emit({ type: 'softNudge', phaseId: this.phaseId, def });
    }
  }

  /** Soft-reset phase clock after checkpoint respawn (keep objective progress). */
  onCheckpointRecover() {
    this.phaseElapsed = 0;
    this.softNudgeSent = false;
  }

  /**
   * Mark current phase complete and enter the next, or win the mission.
   * Returns the next phase id, or null if the mission ended.
   */
  completeCurrentPhase(): PhaseId | null {
    if (this.outcome !== 'playing') return null;
    const def = this.currentPhase;
    this.phasesCompleted += 1;
    this.emit({
      type: 'phaseComplete',
      phaseId: this.phaseId,
      def,
      bonus: def.completionBonus,
    });

    const next = nextPhaseId(this.phaseId);
    if (!next) {
      this.outcome = 'won';
      this.emit({ type: 'missionEnd', outcome: 'won' });
      return null;
    }
    this.enterPhase(next, false);
    return next;
  }

  failMission() {
    if (this.outcome !== 'playing') return;
    this.outcome = 'lost';
    this.emit({ type: 'missionEnd', outcome: 'lost' });
  }

  private enterPhase(id: PhaseId, isMissionStart: boolean) {
    this.phaseId = id;
    this.phaseElapsed = 0;
    this.softNudgeSent = false;
    const def = getPhaseDef(id);
    const act = actForPhase(id);
    this.emit({
      type: 'phaseEnter',
      phaseId: id,
      def,
      act,
      isMissionStart,
    });
  }
}
