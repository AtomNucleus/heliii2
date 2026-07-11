import type { Enemy } from '../combat/enemies';
import type { MissionEndSummary, MissionEvent, MissionOutcome } from '../combat/mission';

export type PhaseId =
  | 'ingress'
  | 'recon'
  | 'firstStrike'
  | 'aaGauntlet'
  | 'convoy'
  | 'retaliation'
  | 'commandBunker'
  | 'exfil';

export type ObjectiveKind =
  | 'reach'
  | 'hold'
  | 'destroyPrimary'
  | 'destroyTagged'
  | 'surviveWaves'
  | 'destroyBunker'
  | 'extract';

export interface PhaseDefinition {
  id: PhaseId;
  index: number;
  code: string;
  title: string;
  verb: string;
  brief: string;
  objective: ObjectiveKind;
  /** Score awarded when the phase objective completes */
  completionBonus: number;
  /** Design pacing hint (minutes) — sums ~9 for an 8–10 min run */
  paceMinutes: number;
  /** Soft time pressure (seconds) before a pacing nudge toast */
  softTimer?: number;
}

export interface MissionCheckpoint {
  phaseId: PhaseId;
  position: { x: number; y: number; z: number };
  label: string;
}

export interface PhaseHudState {
  phaseId: PhaseId;
  phaseIndex: number;
  phaseTotal: number;
  code: string;
  title: string;
  verb: string;
  detail: string;
  progress: number;
  countLabel: string;
}

export interface StrikeHudState {
  time: number;
  health: number;
  healthMax: number;
  score: number;
  combo: number;
  multiplier: number;
  targetsLeft: number;
  targetsTotal: number;
  rings: number;
  ringsTotal: number;
  kills: number;
  weaponReady: boolean;
  aimLocked: boolean;
  phase: PhaseHudState;
  checkpointLabel: string | null;
  lives: number;
  gradePreview: string;
}

export interface StrikeEndSummary extends MissionEndSummary {
  grade: string;
  phasesCompleted: number;
  checkpointsUsed: number;
  bestScore: number;
  isNewBest: boolean;
}

export type StrikeMissionEvent =
  | MissionEvent
  | { type: 'phase'; phaseId: PhaseId; title: string }
  | { type: 'radio'; callsign: string; text: string; hold: number }
  | { type: 'checkpoint'; label: string }
  | { type: 'setpiece'; name: string }
  | { type: 'wave'; wave: number; total: number };

export type StrikeEventListener = (event: StrikeMissionEvent) => void;

export type { MissionOutcome, Enemy };
