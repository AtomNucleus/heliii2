/**
 * Difficulty director — paces pressure fairly from player performance.
 */

import { clamp } from './vec';

export interface DirectorSnapshot {
  /** 0 = calm, 1 = max pressure */
  pressure: number;
  /** Multiplier on enemy fire cadence (higher = faster) */
  fireRateMul: number;
  /** Aggression fed into pursuit steering */
  aggression: number;
  /** Whether dynamic reinforcements may spawn */
  allowReinforce: boolean;
  /** Max concurrent alive non-primary threats */
  threatBudget: number;
  /** Seconds until next reinforcement window */
  reinforceCooldown: number;
  /** Human-readable beat for HUD/debug */
  beat: DirectorBeat;
}

export type DirectorBeat =
  | 'grace'
  | 'probe'
  | 'escalate'
  | 'peak'
  | 'breather'
  | 'finale';

export interface DirectorInput {
  dt: number;
  elapsed: number;
  healthRatio: number;
  /** Seconds since player took damage */
  timeSinceDamage: number;
  /** Seconds since player got a kill */
  timeSinceKill: number;
  kills: number;
  primaryAlive: number;
  primaryTotal: number;
  aliveThreats: number;
  combo: number;
}

export interface DirectorConfig {
  gracePeriod: number;
  baseThreatBudget: number;
  maxThreatBudget: number;
  reinforceBaseCooldown: number;
  lowHealthThreshold: number;
  breatherDamageWindow: number;
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  gracePeriod: 12,
  baseThreatBudget: 8,
  maxThreatBudget: 16,
  reinforceBaseCooldown: 18,
  lowHealthThreshold: 0.32,
  breatherDamageWindow: 4.5,
};

export class DifficultyDirector {
  private pressure = 0.15;
  private reinforceCooldown = 0;
  private beat: DirectorBeat = 'grace';
  private readonly cfg: DirectorConfig;

  constructor(cfg: Partial<DirectorConfig> = {}) {
    this.cfg = { ...DEFAULT_DIRECTOR_CONFIG, ...cfg };
    this.reinforceCooldown = this.cfg.reinforceBaseCooldown * 0.5;
  }

  reset() {
    this.pressure = 0.15;
    this.reinforceCooldown = this.cfg.reinforceBaseCooldown * 0.5;
    this.beat = 'grace';
  }

  update(input: DirectorInput): DirectorSnapshot {
    const { cfg } = this;
    const progress =
      input.primaryTotal > 0
        ? 1 - input.primaryAlive / input.primaryTotal
        : 0;

    // Target pressure from mission progress + idle time
    let target = 0.2 + progress * 0.55;
    if (input.elapsed < cfg.gracePeriod) {
      target = 0.08 + (input.elapsed / cfg.gracePeriod) * 0.12;
      this.beat = 'grace';
    } else if (progress > 0.75) {
      target = 0.85;
      this.beat = 'finale';
    } else if (input.timeSinceKill > 14 && input.healthRatio > 0.55) {
      target = Math.max(target, 0.65);
      this.beat = 'escalate';
    } else if (
      input.healthRatio < cfg.lowHealthThreshold ||
      input.timeSinceDamage < cfg.breatherDamageWindow
    ) {
      target = Math.min(target, 0.28);
      this.beat = 'breather';
    } else if (input.combo >= 5) {
      target = Math.min(1, target + 0.12);
      this.beat = 'peak';
    } else {
      this.beat = progress < 0.25 ? 'probe' : 'escalate';
    }

    // Smooth toward target
    const rate = target > this.pressure ? 0.12 : 0.22;
    this.pressure += (target - this.pressure) * clamp(rate * input.dt * 3, 0, 1);
    this.pressure = clamp(this.pressure, 0, 1);

    this.reinforceCooldown = Math.max(0, this.reinforceCooldown - input.dt);

    const fireRateMul = 0.75 + this.pressure * 0.55;
    const aggression = 0.3 + this.pressure * 0.7;
    const threatBudget = Math.round(
      cfg.baseThreatBudget + this.pressure * (cfg.maxThreatBudget - cfg.baseThreatBudget),
    );

    // Fair reinforce: not during grace/breather, budget free, cooldown ready
    const allowReinforce =
      this.beat !== 'grace' &&
      this.beat !== 'breather' &&
      this.reinforceCooldown <= 0 &&
      input.aliveThreats < threatBudget &&
      input.healthRatio > cfg.lowHealthThreshold &&
      input.timeSinceDamage > cfg.breatherDamageWindow;

    return {
      pressure: this.pressure,
      fireRateMul,
      aggression,
      allowReinforce,
      threatBudget,
      reinforceCooldown: this.reinforceCooldown,
      beat: this.beat,
    };
  }

  /** Call after a reinforcement wave is spawned. */
  noteReinforcement(waveSize: number) {
    const scale = 1 + waveSize * 0.15;
    this.reinforceCooldown = this.cfg.reinforceBaseCooldown * scale * (1.15 - this.pressure * 0.35);
  }

  getBeat(): DirectorBeat {
    return this.beat;
  }
}

/**
 * Pure helper: compute how many units a reinforce wave should add.
 */
export function reinforceWaveSize(
  pressure: number,
  aliveThreats: number,
  threatBudget: number,
): number {
  const room = Math.max(0, threatBudget - aliveThreats);
  if (room <= 0) return 0;
  const desired = Math.round(1 + pressure * 3);
  return clamp(desired, 1, Math.min(4, room));
}
