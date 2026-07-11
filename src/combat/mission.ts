import * as THREE from 'three';
import type { QualitySettings } from '../effects/quality';
import { HealthSystem } from './health';
import { ScoringSystem, type ScoreSnapshot } from './scoring';
import { WeaponSystem } from './weapons';
import { EnemySystem, type Enemy, type EnemyLayoutOptions } from './enemies';
import { CombatEffects } from './effects';
import {
  DifficultyDirector,
  reinforceWaveSize,
  pickReinforceRoles,
  reinforceFormationForPressure,
  type DirectorBeat,
  type DirectorSnapshot,
} from './ai';
import type { CheckpointSystem } from '../rings/checkpoints';

export type MissionOutcome = 'playing' | 'won' | 'lost';

export interface MissionHudState {
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
  /** Difficulty director beat (optional HUD) */
  directorBeat?: DirectorBeat;
  pressure?: number;
}

export interface MissionEndSummary {
  outcome: 'won' | 'lost';
  score: number;
  kills: number;
  rings: number;
  bestCombo: number;
  time: number;
  timeBonus: number;
  healthBonus: number;
}

export type MissionEvent =
  | { type: 'kill'; enemy: Enemy; points: number; combo: number; primary: boolean }
  | { type: 'hit'; enemy: Enemy }
  | { type: 'damage'; amount: number; source: string; remaining: number }
  | { type: 'ring'; points: number }
  | { type: 'fire' }
  | { type: 'nearMiss'; points: number }
  | { type: 'toast'; message: string };

export type MissionEventListener = (event: MissionEvent) => void;

/**
 * Orchestrates strike-run combat: destroy primary depots while surviving AA fire.
 * Checkpoint rings remain as heal + score/combo bonuses.
 */
export class CombatMission {
  readonly health: HealthSystem;
  readonly scoring: ScoringSystem;
  readonly weapons: WeaponSystem;
  readonly enemies: EnemySystem;
  readonly effects: CombatEffects;
  readonly director: DifficultyDirector;

  private outcome: MissionOutcome = 'playing';
  private elapsed = 0;
  private ramCooldown = 0;
  private nearMissCooldown = 0;
  private readonly layoutOpts: EnemyLayoutOptions;
  private readonly checkpoints: CheckpointSystem;
  private lastSummary: MissionEndSummary | null = null;
  private damageFlash = 0;
  private aimLocked = false;
  private timeSinceDamage = 999;
  private timeSinceKill = 999;
  private lastDirector: DirectorSnapshot | null = null;
  private readonly listeners: MissionEventListener[] = [];
  private readonly forward = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly heliPos = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    layoutOpts: EnemyLayoutOptions,
    checkpoints: CheckpointSystem,
  ) {
    this.layoutOpts = layoutOpts;
    this.checkpoints = checkpoints;
    this.health = new HealthSystem(100, 0.5);
    this.scoring = new ScoringSystem();
    this.weapons = new WeaponSystem(scene, 0.24);
    this.effects = new CombatEffects(scene);
    this.enemies = new EnemySystem(scene, this.weapons, this.effects);
    this.director = new DifficultyDirector();
    this.enemies.spawnMission(layoutOpts);
    this.effects.setGroundHeight(layoutOpts.getGroundHeight);

    this.health.onDamage((ev) => {
      this.timeSinceDamage = 0;
      this.damageFlash = 1;
      this.effects.spawnDamageFeedback(this.heliPos, ev.amount);
      this.emit({
        type: 'damage',
        amount: ev.amount,
        source: ev.source,
        remaining: ev.remaining,
      });
    });
  }

  /** Adaptive quality budgets for pooled combat VFX. */
  applyQuality(q: QualitySettings) {
    this.effects.applyQuality(q);
  }

  setEffectsCamera(camera: THREE.Camera | null) {
    this.effects.setCamera(camera);
  }

  onEvent(listener: MissionEventListener) {
    this.listeners.push(listener);
  }

  private emit(event: MissionEvent) {
    for (const listener of this.listeners) listener(event);
  }

  get phase(): MissionOutcome {
    return this.outcome;
  }

  get summary(): MissionEndSummary | null {
    return this.lastSummary;
  }

  getDamageFlash(): number {
    return this.damageFlash;
  }

  getAimLocked(): boolean {
    return this.aimLocked;
  }

  reset() {
    this.outcome = 'playing';
    this.elapsed = 0;
    this.ramCooldown = 0;
    this.nearMissCooldown = 0;
    this.damageFlash = 0;
    this.aimLocked = false;
    this.timeSinceDamage = 999;
    this.timeSinceKill = 999;
    this.lastDirector = null;
    this.lastSummary = null;
    this.health.reset();
    this.scoring.reset();
    this.weapons.reset();
    this.effects.clear();
    this.director.reset();
    this.enemies.reset(this.layoutOpts);
    this.checkpoints.reset();
  }

  getDirectorSnapshot(): DirectorSnapshot | null {
    return this.lastDirector;
  }

  getHudState(): MissionHudState {
    const snap = this.scoring.getSnapshot();
    return {
      time: this.elapsed,
      health: this.health.value,
      healthMax: this.health.max,
      score: snap.score,
      combo: snap.combo,
      multiplier: snap.multiplier,
      targetsLeft: this.enemies.primaryAlive,
      targetsTotal: this.enemies.primaryTotal,
      rings: this.checkpoints.collectedCount,
      ringsTotal: this.checkpoints.total,
      kills: snap.kills,
      weaponReady: this.weapons.ready,
      aimLocked: this.aimLocked,
      directorBeat: this.lastDirector?.beat,
      pressure: this.lastDirector?.pressure,
    };
  }

  get weaponReady(): boolean {
    return this.weapons.ready;
  }

  /** External damage (hard landing) feeds the same hull pool. */
  applyExternalDamage(amount: number, source = 'impact'): number {
    if (this.outcome !== 'playing') return 0;
    return this.health.takeDamage(amount, source);
  }

  /**
   * Per-frame combat update. Call only while mission is playing.
   */
  update(
    dt: number,
    time: number,
    heli: THREE.Object3D,
    yaw: number,
    heliVelocity?: THREE.Vector3,
  ): MissionOutcome {
    if (this.outcome !== 'playing') {
      // Keep finale / residual FX ticking after win/lose
      this.effects.update(dt);
      return this.outcome;
    }

    this.elapsed += dt;
    this.timeSinceDamage += dt;
    this.timeSinceKill += dt;
    this.health.update(dt);
    this.scoring.update(dt);
    this.heliPos.copy(heli.position);
    this.effects.setFollowTarget(this.heliPos);
    this.effects.setHullHealthRatio(this.health.ratio);
    this.effects.update(dt);

    const snap = this.scoring.getSnapshot();
    const director = this.director.update({
      dt,
      elapsed: this.elapsed,
      healthRatio: this.health.ratio,
      timeSinceDamage: this.timeSinceDamage,
      timeSinceKill: this.timeSinceKill,
      kills: snap.kills,
      primaryAlive: this.enemies.primaryAlive,
      primaryTotal: this.enemies.primaryTotal,
      aliveThreats: this.enemies.aliveThreats,
      combo: snap.combo,
    });
    this.lastDirector = director;

    const vel = heliVelocity ?? new THREE.Vector3();
    this.enemies.update(dt, time, heli.position, vel, this.health.alive, { director });

    // Scripted encounter beats + fair director reinforcements
    const beatLabel = this.enemies.tickEncounterPacing(this.elapsed, director);
    if (beatLabel) {
      const n = this.enemies.releaseEncounterBeat(beatLabel, heli.position);
      if (n > 0) {
        this.director.noteReinforcement(n);
        this.emit({ type: 'toast', message: beatLabel });
      }
    } else if (director.allowReinforce) {
      const wave = reinforceWaveSize(
        director.pressure,
        this.enemies.aliveThreats,
        director.threatBudget,
      );
      if (wave > 0) {
        const progress =
          this.enemies.primaryTotal > 0
            ? 1 - this.enemies.primaryAlive / this.enemies.primaryTotal
            : 0;
        const bias = progress > 0.65 ? 'late' : progress < 0.3 ? 'early' : 'mid';
        const roles = pickReinforceRoles(director.pressure, wave, bias);
        const formation = reinforceFormationForPressure(director.pressure);
        const n = this.enemies.spawnReinforcement(roles, formation, heli.position);
        if (n > 0) {
          this.director.noteReinforcement(n);
          this.emit({ type: 'toast', message: 'HOSTILE REINFORCEMENTS' });
        }
      }
    }

    const homing = this.enemies.getHomingTargets();
    this.weapons.update(dt, homing);
    this.effects.syncProjectileTrails(this.weapons.activeProjectiles);

    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    }
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    if (this.nearMissCooldown > 0) this.nearMissCooldown -= dt;

    // Aim + fire
    this.forward.set(Math.sin(yaw), -0.06, Math.cos(yaw)).normalize();
    this.muzzle
      .copy(heli.position)
      .add(new THREE.Vector3(0, -0.35, 0))
      .addScaledVector(this.forward, 3.4);

    const aim = this.enemies.findAimTarget(heli.position, this.forward);
    this.aimLocked = !!aim;

    if (this.weapons.tryPlayerFire(this.muzzle, this.forward)) {
      this.effects.spawnMuzzleFlash(this.muzzle, this.forward);
      this.emit({ type: 'fire' });
    }

    // Projectile vs enemies
    const hits = this.enemies.applyProjectileHits(this.weapons.activeProjectiles);
    for (const p of this.weapons.activeProjectiles) {
      if (!p.alive) this.weapons.despawn(p);
    }
    this.weapons.compact();

    for (const hit of hits) {
      if (hit.destroyed) {
        this.timeSinceKill = 0;
        const points = this.scoring.addKill(hit.points);
        this.emit({
          type: 'kill',
          enemy: hit.enemy,
          points,
          combo: this.scoring.getSnapshot().combo,
          primary: hit.enemy.primary,
        });
        if (hit.enemy.primary) {
          const left = this.enemies.primaryAlive;
          if (left > 0) {
            this.emit({
              type: 'toast',
              message: `DEPOT DOWN · ${left} LEFT`,
            });
          }
        } else if (this.scoring.getSnapshot().combo >= 4 && this.scoring.getSnapshot().combo % 2 === 0) {
          this.emit({
            type: 'toast',
            message: `COMBO x${this.scoring.getMultiplier()}`,
          });
        }
      } else {
        this.emit({ type: 'hit', enemy: hit.enemy });
      }
    }

    // Enemy bolts vs player + near-miss scoring
    for (const p of this.weapons.activeProjectiles) {
      if (!p.alive || p.fromPlayer) continue;
      const dist = p.mesh.position.distanceTo(heli.position);
      if (dist < 2.5 + p.radius) {
        const applied = this.health.takeDamage(p.damage, 'aa-fire');
        this.effects.spawnImpact(p.mesh.position.clone(), 'metal', 1.1);
        this.weapons.despawn(p);
        if (applied > 0) this.damageFlash = 1;
      } else if (
        dist < 7.5 &&
        this.nearMissCooldown <= 0 &&
        this.health.alive
      ) {
        const points = this.scoring.addNearMiss(80);
        this.nearMissCooldown = 0.55;
        this.emit({ type: 'nearMiss', points });
      }
    }
    this.weapons.compact();

    // Ramming
    if (this.ramCooldown <= 0) {
      const ramDmg = this.enemies.checkRamming(heli.position);
      if (ramDmg > 0) {
        const applied = this.health.takeDamage(ramDmg, 'collision');
        if (applied > 0) {
          this.damageFlash = 1;
          this.ramCooldown = 0.85;
        }
      }
    }

    // Ring bonuses (heal + combo)
    if (this.checkpoints.tryCollect(heli.position)) {
      const points = this.scoring.addRingBonus(300);
      this.health.heal(8);
      this.emit({ type: 'ring', points });
    }

    // Win / lose
    if (!this.health.alive) {
      this.finish('lost');
      return this.outcome;
    }
    if (this.enemies.primaryAlive <= 0) {
      this.finish('won');
      return this.outcome;
    }

    return this.outcome;
  }

  private finish(outcome: 'won' | 'lost') {
    this.outcome = outcome;
    this.effects.playFinale(
      outcome === 'won' ? 'victory' : 'defeat',
      this.heliPos,
    );
    const snap: ScoreSnapshot = this.scoring.getSnapshot();
    let timeBonus = 0;
    let healthBonus = 0;
    if (outcome === 'won') {
      timeBonus = this.scoring.applyTimeBonus(this.elapsed, 210);
      healthBonus = this.scoring.applyHealthBonus(this.health.ratio);
      // Ring completion bonus
      if (snap.rings >= this.checkpoints.total) {
        this.scoring.addFlat(1000);
      }
    }
    this.lastSummary = {
      outcome,
      score: this.scoring.getSnapshot().score,
      kills: snap.kills,
      rings: snap.rings,
      bestCombo: snap.bestCombo,
      time: this.elapsed,
      timeBonus,
      healthBonus,
    };
  }
}
