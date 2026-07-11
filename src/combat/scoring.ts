/** Score + combo multiplier for combat missions */

export interface ScoreSnapshot {
  score: number;
  combo: number;
  multiplier: number;
  kills: number;
  rings: number;
  bestCombo: number;
  nearMisses: number;
}

export class ScoringSystem {
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private rings = 0;
  private bestCombo = 0;
  private nearMisses = 0;

  /** Seconds before combo decays by one step */
  private readonly comboWindow = 3.4;
  private readonly maxMultiplier = 5;

  getSnapshot(): ScoreSnapshot {
    return {
      score: this.score,
      combo: this.combo,
      multiplier: this.getMultiplier(),
      kills: this.kills,
      rings: this.rings,
      bestCombo: this.bestCombo,
      nearMisses: this.nearMisses,
    };
  }

  getMultiplier(): number {
    if (this.combo <= 0) return 1;
    return Math.min(this.maxMultiplier, 1 + Math.floor(this.combo / 2));
  }

  update(dt: number) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = Math.max(0, this.combo - 1);
      this.comboTimer = this.combo > 0 ? this.comboWindow * 0.6 : 0;
    }
  }

  private bumpCombo(steps = 1) {
    this.combo += steps;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = this.comboWindow;
  }

  addKill(basePoints: number) {
    this.kills += 1;
    this.bumpCombo(1);
    const gained = Math.round(basePoints * this.getMultiplier());
    this.score += gained;
    return gained;
  }

  addRingBonus(basePoints = 280) {
    this.rings += 1;
    this.bumpCombo(1);
    const gained = Math.round(basePoints * this.getMultiplier());
    this.score += gained;
    return gained;
  }

  addNearMiss(basePoints = 75) {
    this.nearMisses += 1;
    this.bumpCombo(1);
    const gained = Math.round(basePoints * this.getMultiplier());
    this.score += gained;
    return gained;
  }

  addFlat(points: number) {
    this.score += Math.max(0, Math.round(points));
  }

  /** Time bonus at mission end (faster = more). */
  applyTimeBonus(elapsed: number, parSeconds = 210) {
    const leftover = Math.max(0, parSeconds - elapsed);
    const bonus = Math.round(leftover * 14);
    this.score += bonus;
    return bonus;
  }

  /** Survival bonus from remaining health ratio. */
  applyHealthBonus(healthRatio: number) {
    const bonus = Math.round(healthRatio * 1600);
    this.score += bonus;
    return bonus;
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.rings = 0;
    this.bestCombo = 0;
    this.nearMisses = 0;
  }
}
