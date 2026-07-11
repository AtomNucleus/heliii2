/**
 * Telegraphed attack state machine — readable windup before fire.
 */

export type TelegraphPhase = 'idle' | 'windup' | 'fire' | 'recover';

export interface TelegraphConfig {
  windup: number;
  fireWindow: number;
  recover: number;
  /** Shots to emit during fire window (burst) */
  shots: number;
  shotGap: number;
}

export interface TelegraphState {
  phase: TelegraphPhase;
  timer: number;
  shotsLeft: number;
  shotTimer: number;
  /** 0–1 visual intensity for glow / scale cues */
  intensity: number;
}

export function createTelegraphState(): TelegraphState {
  return {
    phase: 'idle',
    timer: 0,
    shotsLeft: 0,
    shotTimer: 0,
    intensity: 0,
  };
}

export function defaultTelegraphConfig(
  windup: number,
  shots = 1,
  shotGap = 0.1,
): TelegraphConfig {
  return {
    windup: Math.max(0.05, windup),
    fireWindow: Math.max(0.05, shots * shotGap + 0.05),
    recover: Math.max(0.15, windup * 0.45),
    shots: Math.max(1, shots),
    shotGap,
  };
}

export interface TelegraphUpdateResult {
  state: TelegraphState;
  /** True once per shot that should spawn this frame */
  fire: boolean;
  /** Just entered windup (for toast / SFX hooks) */
  startedWindup: boolean;
}

/**
 * Advance telegraph. When idle and `wantsAttack`, begins windup.
 * Deterministic given identical inputs.
 */
export function updateTelegraph(
  state: TelegraphState,
  config: TelegraphConfig,
  dt: number,
  wantsAttack: boolean,
): TelegraphUpdateResult {
  const next: TelegraphState = {
    phase: state.phase,
    timer: state.timer,
    shotsLeft: state.shotsLeft,
    shotTimer: state.shotTimer,
    intensity: state.intensity,
  };
  let fire = false;
  let startedWindup = false;

  switch (next.phase) {
    case 'idle': {
      next.intensity = Math.max(0, next.intensity - dt * 3);
      if (wantsAttack) {
        next.phase = 'windup';
        next.timer = config.windup;
        next.intensity = 0.25;
        startedWindup = true;
      }
      break;
    }
    case 'windup': {
      next.timer -= dt;
      const t = 1 - Math.max(0, next.timer) / config.windup;
      next.intensity = 0.25 + t * 0.75;
      if (next.timer <= 0) {
        next.phase = 'fire';
        next.timer = config.fireWindow;
        next.shotsLeft = config.shots;
        next.shotTimer = 0;
        next.intensity = 1;
      }
      break;
    }
    case 'fire': {
      next.timer -= dt;
      next.shotTimer -= dt;
      next.intensity = 0.85 + Math.sin(next.timer * 40) * 0.15;
      if (next.shotsLeft > 0 && next.shotTimer <= 0) {
        fire = true;
        next.shotsLeft -= 1;
        next.shotTimer = config.shotGap;
      }
      if (next.timer <= 0 && next.shotsLeft <= 0) {
        next.phase = 'recover';
        next.timer = config.recover;
      }
      break;
    }
    case 'recover': {
      next.timer -= dt;
      next.intensity = Math.max(0, next.timer / config.recover) * 0.35;
      if (next.timer <= 0) {
        next.phase = 'idle';
        next.intensity = 0;
      }
      break;
    }
  }

  return { state: next, fire, startedWindup };
}

/** True while player should see a clear "about to shoot" cue. */
export function isTelegraphVisible(state: TelegraphState): boolean {
  return state.phase === 'windup' || (state.phase === 'fire' && state.intensity > 0.5);
}
