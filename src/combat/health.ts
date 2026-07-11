/** Player hull health / damage state for strike-run missions */

export interface DamageEvent {
  amount: number;
  source: string;
  remaining: number;
}

export type DamageListener = (event: DamageEvent) => void;

export class HealthSystem {
  readonly max: number;
  private current: number;
  private invulnTimer = 0;
  private readonly invulnDuration: number;
  private readonly listeners: DamageListener[] = [];

  constructor(max = 100, invulnDuration = 0.42) {
    this.max = max;
    this.current = max;
    this.invulnDuration = invulnDuration;
  }

  get value(): number {
    return this.current;
  }

  get ratio(): number {
    return this.current / this.max;
  }

  get alive(): boolean {
    return this.current > 0;
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  onDamage(listener: DamageListener) {
    this.listeners.push(listener);
  }

  update(dt: number) {
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }
  }

  /** Returns actual damage applied (0 if blocked / dead). */
  takeDamage(amount: number, source = 'unknown'): number {
    if (!this.alive || amount <= 0) return 0;
    if (this.invulnTimer > 0) return 0;

    const applied = Math.min(this.current, amount);
    this.current -= applied;
    this.invulnTimer = this.invulnDuration;

    const event: DamageEvent = {
      amount: applied,
      source,
      remaining: this.current,
    };
    for (const listener of this.listeners) listener(event);
    return applied;
  }

  heal(amount: number) {
    if (!this.alive || amount <= 0) return;
    this.current = Math.min(this.max, this.current + amount);
  }

  /** Brief post-respawn / checkpoint invulnerability. */
  grantInvulnerability(seconds = 1.5) {
    this.invulnTimer = Math.max(this.invulnTimer, seconds);
  }

  reset() {
    this.current = this.max;
    this.invulnTimer = 0;
  }
}
