import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { CombatFxBudget } from './budgets';

export type FinaleKind = 'victory' | 'defeat';

interface Cue {
  at: number;
  kind: 'blast' | 'shock' | 'ember' | 'smoke' | 'flash' | 'debris' | 'spark';
  offset: THREE.Vector3;
  scale: number;
  color: number;
}

export interface FinaleCallbacks {
  blast: (pos: THREE.Vector3, scale: number, color: number) => void;
  shock: (pos: THREE.Vector3, scale: number, color: number, vertical?: boolean) => void;
  ember: (pos: THREE.Vector3, scale: number, color: number) => void;
  smoke: (pos: THREE.Vector3, scale: number, hot: boolean) => void;
  flash: (pos: THREE.Vector3, color: number, intensity: number, range: number) => void;
  debris: (pos: THREE.Vector3, scale: number, color: number) => void;
  spark: (pos: THREE.Vector3, color: number, intensity: number) => void;
}

/**
 * Timed cinematic set-piece sequencer — victory cascade / defeat rupture.
 */
export class FinaleSystem {
  private active = false;
  private kind: FinaleKind = 'victory';
  private elapsed = 0;
  private origin = new THREE.Vector3();
  private cues: Cue[] = [];
  private cueIndex = 0;
  private budget: CombatFxBudget;
  private readonly tmp = new THREE.Vector3();
  private intensity = 0;

  constructor(budget: CombatFxBudget) {
    this.budget = budget;
  }

  applyBudget(budget: CombatFxBudget) {
    this.budget = budget;
  }

  get isActive(): boolean {
    return this.active;
  }

  getIntensity(): number {
    return this.intensity;
  }

  start(kind: FinaleKind, origin: THREE.Vector3) {
    if (!this.budget.enableFinale) {
      // Single punch fallback on low tier
      this.active = true;
      this.kind = kind;
      this.elapsed = 0;
      this.cueIndex = 0;
      this.origin.copy(origin);
      this.intensity = 0.6;
      this.cues = [
        { at: 0, kind: 'blast', offset: new THREE.Vector3(0, 0.4, 0), scale: 1.4, color: COLORS.orangeHot },
        { at: 0, kind: 'shock', offset: new THREE.Vector3(0, 0.2, 0), scale: 1.5, color: COLORS.orangeGlow },
        { at: 0.1, kind: 'smoke', offset: new THREE.Vector3(0, 0.3, 0), scale: 1.3, color: COLORS.orangeHot },
      ];
      return;
    }
    this.active = true;
    this.kind = kind;
    this.elapsed = 0;
    this.cueIndex = 0;
    this.origin.copy(origin);
    this.intensity = kind === 'victory' ? 0.85 : 0.7;
    this.cues = kind === 'victory' ? this.buildVictoryCues() : this.buildDefeatCues();
  }

  private qScale(s: number): number {
    return s * (0.55 + this.budget.scale * 0.45);
  }

  private buildVictoryCues(): Cue[] {
    const teal = COLORS.rimCool;
    const hot = COLORS.orangeHot;
    const glow = COLORS.orangeGlow;
    const cues: Cue[] = [
      { at: 0.0, kind: 'flash', offset: new THREE.Vector3(0, 1, 0), scale: 1.4, color: hot },
      { at: 0.0, kind: 'blast', offset: new THREE.Vector3(0, 0.5, 0), scale: 1.8, color: hot },
      { at: 0.0, kind: 'shock', offset: new THREE.Vector3(0, 0.2, 0), scale: 2.2, color: glow },
      { at: 0.08, kind: 'debris', offset: new THREE.Vector3(0, 1, 0), scale: 1.6, color: hot },
      { at: 0.12, kind: 'smoke', offset: new THREE.Vector3(0, 0.4, 0), scale: 1.8, color: hot },
      { at: 0.18, kind: 'ember', offset: new THREE.Vector3(0, 1.2, 0), scale: 1.5, color: glow },
      { at: 0.28, kind: 'blast', offset: new THREE.Vector3(4.5, 0.3, -2.2), scale: 1.2, color: hot },
      { at: 0.28, kind: 'shock', offset: new THREE.Vector3(4.5, 0.2, -2.2), scale: 1.3, color: teal },
      { at: 0.42, kind: 'blast', offset: new THREE.Vector3(-3.8, 0.4, 3.1), scale: 1.35, color: glow },
      { at: 0.42, kind: 'spark', offset: new THREE.Vector3(-3.8, 1, 3.1), scale: 1.2, color: teal },
      { at: 0.55, kind: 'blast', offset: new THREE.Vector3(2.2, 0.5, 4.8), scale: 1.1, color: hot },
      { at: 0.55, kind: 'smoke', offset: new THREE.Vector3(2.2, 0.3, 4.8), scale: 1.4, color: hot },
      { at: 0.72, kind: 'blast', offset: new THREE.Vector3(-5.2, 0.6, -3.5), scale: 1.5, color: hot },
      { at: 0.72, kind: 'shock', offset: new THREE.Vector3(-5.2, 0.2, -3.5), scale: 1.7, color: glow },
      { at: 0.72, kind: 'debris', offset: new THREE.Vector3(-5.2, 1, -3.5), scale: 1.3, color: hot },
      { at: 0.95, kind: 'flash', offset: new THREE.Vector3(0, 2, 0), scale: 1.6, color: glow },
      { at: 0.95, kind: 'blast', offset: new THREE.Vector3(0, 1.2, 0), scale: 2.4, color: hot },
      { at: 0.95, kind: 'shock', offset: new THREE.Vector3(0, 0.3, 0), scale: 2.8, color: teal },
      { at: 1.05, kind: 'ember', offset: new THREE.Vector3(0, 2, 0), scale: 2.0, color: glow },
      { at: 1.15, kind: 'smoke', offset: new THREE.Vector3(0, 0.5, 0), scale: 2.2, color: hot },
      { at: 1.4, kind: 'ember', offset: new THREE.Vector3(3, 1, -2), scale: 1.2, color: glow },
      { at: 1.55, kind: 'smoke', offset: new THREE.Vector3(-2, 0.4, 2), scale: 1.5, color: hot },
      { at: 1.8, kind: 'ember', offset: new THREE.Vector3(0, 1.5, 0), scale: 1.4, color: glow },
    ];
    if (this.budget.scale < 0.9) {
      return cues.filter((c, i) => i % 2 === 0 || c.at < 0.2 || c.at > 0.9);
    }
    return cues;
  }

  private buildDefeatCues(): Cue[] {
    const hot = COLORS.orangeHot;
    const glow = COLORS.orangeGlow;
    const cues: Cue[] = [
      { at: 0.0, kind: 'flash', offset: new THREE.Vector3(0, 0.5, 0), scale: 1.2, color: hot },
      { at: 0.0, kind: 'blast', offset: new THREE.Vector3(0, 0.2, 0), scale: 1.4, color: hot },
      { at: 0.0, kind: 'spark', offset: new THREE.Vector3(0, 0.8, 0), scale: 1.6, color: glow },
      { at: 0.05, kind: 'debris', offset: new THREE.Vector3(0, 0.6, 0), scale: 1.1, color: hot },
      { at: 0.1, kind: 'shock', offset: new THREE.Vector3(0, 0.15, 0), scale: 1.5, color: hot },
      { at: 0.15, kind: 'smoke', offset: new THREE.Vector3(0, 0.3, 0), scale: 1.3, color: hot },
      { at: 0.35, kind: 'spark', offset: new THREE.Vector3(1.2, 0.4, -0.8), scale: 1.1, color: glow },
      { at: 0.45, kind: 'ember', offset: new THREE.Vector3(0, 0.8, 0), scale: 1.2, color: glow },
      { at: 0.55, kind: 'smoke', offset: new THREE.Vector3(0.5, 0.2, 0.4), scale: 1.5, color: hot },
      { at: 0.75, kind: 'blast', offset: new THREE.Vector3(-0.8, 0.3, 0.6), scale: 0.9, color: hot },
      { at: 0.9, kind: 'smoke', offset: new THREE.Vector3(0, 0.4, 0), scale: 1.8, color: hot },
      { at: 1.1, kind: 'ember', offset: new THREE.Vector3(0, 1, 0), scale: 1.3, color: glow },
      { at: 1.4, kind: 'smoke', offset: new THREE.Vector3(0, 0.5, 0), scale: 1.6, color: hot },
    ];
    if (this.budget.scale < 0.6) {
      return cues.filter((c) => c.at <= 0.6).slice(0, 7);
    }
    return cues;
  }

  update(dt: number, cbs: FinaleCallbacks) {
    if (!this.active) {
      this.intensity = Math.max(0, this.intensity - dt * 0.8);
      return;
    }

    this.elapsed += dt;
    this.intensity = Math.max(
      0.15,
      this.intensity - dt * (this.kind === 'victory' ? 0.22 : 0.35),
    );

    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at <= this.elapsed) {
      const cue = this.cues[this.cueIndex++];
      const pos = this.tmp.copy(this.origin).add(cue.offset);
      const s = this.qScale(cue.scale);
      switch (cue.kind) {
        case 'blast':
          cbs.blast(pos, s, cue.color);
          break;
        case 'shock':
          cbs.shock(pos, s, cue.color, cue.scale > 2);
          break;
        case 'ember':
          cbs.ember(pos, s, cue.color);
          break;
        case 'smoke':
          cbs.smoke(pos, s, true);
          break;
        case 'flash':
          cbs.flash(pos, cue.color, 6 + cue.scale * 4, 22 + cue.scale * 10);
          break;
        case 'debris':
          cbs.debris(pos, s, cue.color);
          break;
        case 'spark':
          cbs.spark(pos, cue.color, 0.8 + cue.scale * 0.5);
          break;
      }
    }

    const endAt = this.kind === 'victory' ? 2.4 : 1.8;
    if (this.elapsed >= endAt && this.cueIndex >= this.cues.length) {
      this.active = false;
    }
  }

  clear() {
    this.active = false;
    this.cues.length = 0;
    this.cueIndex = 0;
    this.elapsed = 0;
    this.intensity = 0;
  }
}
