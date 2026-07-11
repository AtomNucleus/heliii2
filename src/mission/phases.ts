/** Authored Operation SUNSET phases — ~9 minute design pace. */

import type { PhaseDefinition, PhaseId } from './types';

export const OPERATION_PHASES: readonly PhaseDefinition[] = [
  {
    id: 'ingress',
    index: 0,
    code: 'P1',
    title: 'INGRESS',
    verb: 'REACH THE GRID',
    brief: 'Lift off and fly to the marked recon grid on the east ridge.',
    objective: 'reach',
    completionBonus: 600,
    paceMinutes: 1.0,
    softTimer: 90,
  },
  {
    id: 'recon',
    index: 1,
    code: 'P2',
    title: 'RECON',
    verb: 'HOLD & SCAN',
    brief: 'Hold inside the scan volume while COMMAND paints targets.',
    objective: 'hold',
    completionBonus: 900,
    paceMinutes: 1.0,
    softTimer: 75,
  },
  {
    id: 'firstStrike',
    index: 2,
    code: 'P3',
    title: 'FIRST STRIKE',
    verb: 'DESTROY DEPOTS',
    brief: 'Neutralize two forward supply depots. Light AA expected.',
    objective: 'destroyPrimary',
    completionBonus: 1500,
    paceMinutes: 1.6,
    softTimer: 120,
  },
  {
    id: 'aaGauntlet',
    index: 3,
    code: 'P4',
    title: 'AA GAUNTLET',
    verb: 'CLEAR THE NEST',
    brief: 'Set-piece: punch through the AA corridor and silence the nest.',
    objective: 'destroyTagged',
    completionBonus: 1800,
    paceMinutes: 1.4,
    softTimer: 110,
  },
  {
    id: 'convoy',
    index: 4,
    code: 'P5',
    title: 'CONVOY INTERCEPT',
    verb: 'STOP THE CONVOY',
    brief: 'A supply convoy is racing the west pass. Destroy it before escape.',
    objective: 'destroyTagged',
    completionBonus: 2200,
    paceMinutes: 1.4,
    softTimer: 100,
  },
  {
    id: 'retaliation',
    index: 5,
    code: 'P6',
    title: 'RETALIATION',
    verb: 'BREAK THE SWARM',
    brief: 'Escalating drone waves inbound. Survive and clear the sky.',
    objective: 'surviveWaves',
    completionBonus: 2000,
    paceMinutes: 1.5,
    softTimer: 120,
  },
  {
    id: 'commandBunker',
    index: 6,
    code: 'P7',
    title: 'COMMAND BUNKER',
    verb: 'DESTROY BUNKER',
    brief: 'Final hard target: multi-stage bunker under heavy AA cover.',
    objective: 'destroyBunker',
    completionBonus: 3500,
    paceMinutes: 1.8,
    softTimer: 150,
  },
  {
    id: 'exfil',
    index: 7,
    code: 'P8',
    title: 'EXFIL',
    verb: 'REACH EXTRACT',
    brief: 'Mission complete on paper — get to the extract LZ alive.',
    objective: 'extract',
    completionBonus: 1200,
    paceMinutes: 0.8,
    softTimer: 70,
  },
] as const;

/** Sum of paceMinutes ≈ 10.5 design; skilled runs land 8–10 minutes. */
export const DESIGN_PACE_MINUTES = OPERATION_PHASES.reduce(
  (sum, p) => sum + p.paceMinutes,
  0,
);

export const PHASE_PAR_SECONDS = Math.round(DESIGN_PACE_MINUTES * 60);

export function getPhaseDef(id: PhaseId): PhaseDefinition {
  const found = OPERATION_PHASES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown phase ${id}`);
  return found;
}

export function nextPhaseId(id: PhaseId): PhaseId | null {
  const i = OPERATION_PHASES.findIndex((p) => p.id === id);
  if (i < 0 || i >= OPERATION_PHASES.length - 1) return null;
  return OPERATION_PHASES[i + 1]!.id;
}

export function phaseByIndex(index: number): PhaseDefinition | null {
  return OPERATION_PHASES[index] ?? null;
}
