import type { CombatFxBudget } from './budgets';

export interface CameraImpulseSample {
  /** Trauma 0..1 for chase-camera shake. */
  trauma: number;
  /** Degrees of temporary FOV punch (caller may ignore). */
  fovKick: number;
}

/**
 * Accumulates blast / hit impulses for the chase camera.
 * Callers consume once per frame so trauma is not double-applied.
 */
export class CameraImpulseSystem {
  private pendingTrauma = 0;
  private pendingFov = 0;
  private budget: CombatFxBudget;

  constructor(budget: CombatFxBudget) {
    this.budget = budget;
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  /** Queue a combat impulse (explosion, hull hit, finale). */
  punch(trauma: number, fovKick = 0) {
    const s = this.budget.cameraImpulseScale;
    this.pendingTrauma = Math.min(1, this.pendingTrauma + trauma * s);
    this.pendingFov = Math.min(8, this.pendingFov + fovKick * s);
  }

  /** Soft continuous rumble while hull is critical — does not stack forever. */
  setHullRumble(ratio: number) {
    if (ratio >= 0.35) return;
    const rumble = (0.35 - ratio) * 0.08 * this.budget.cameraImpulseScale;
    if (rumble > this.pendingTrauma) {
      this.pendingTrauma = rumble;
    }
  }

  /**
   * Drain pending impulse for camera coupling.
   * Returns current pending values then clears trauma (FOV decays softly).
   */
  consume(_dt: number): CameraImpulseSample {
    const sample: CameraImpulseSample = {
      trauma: this.pendingTrauma,
      fovKick: this.pendingFov,
    };
    this.pendingTrauma = 0;
    this.pendingFov *= 0.35;
    if (this.pendingFov < 0.05) this.pendingFov = 0;
    return sample;
  }

  peek(): CameraImpulseSample {
    return { trauma: this.pendingTrauma, fovKick: this.pendingFov };
  }

  clear() {
    this.pendingTrauma = 0;
    this.pendingFov = 0;
  }
}
