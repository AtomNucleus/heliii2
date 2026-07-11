import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from '../effects/quality';
import {
  BurstSystem,
  DebrisSystem,
  SparkSystem,
  SmokeFireSystem,
  ShockwaveSystem,
  TracerSystem,
  DecalSystem,
  DamageFeedbackSystem,
  combatBudgetFromQuality,
  type CombatFxBudget,
} from './vfx';

/**
 * Premium combat VFX facade — pooled explosions, debris, sparks, smoke/fire,
 * shockwaves, tracers, impact decals, and damage feedback.
 * Public API stays compatible with existing combat callers.
 */
export class CombatEffects {
  readonly group = new THREE.Group();

  private budget: CombatFxBudget;
  private readonly bursts: BurstSystem;
  private readonly debris: DebrisSystem;
  private readonly sparks: SparkSystem;
  private readonly smoke: SmokeFireSystem;
  private readonly waves: ShockwaveSystem;
  private readonly tracers: TracerSystem;
  private readonly decals: DecalSystem;
  private readonly damageFx: DamageFeedbackSystem;
  private followPos: THREE.Vector3 | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.name = 'combat-effects';
    scene.add(this.group);

    this.budget = combatBudgetFromQuality({
      tier: 'high',
      particleScale: 1,
    } as QualitySettings);

    this.bursts = new BurstSystem(this.group, this.budget);
    this.debris = new DebrisSystem(this.group, this.budget);
    this.sparks = new SparkSystem(this.group, this.budget);
    this.smoke = new SmokeFireSystem(this.group, this.budget);
    this.waves = new ShockwaveSystem(this.group, this.budget);
    this.tracers = new TracerSystem(this.group, this.budget);
    this.decals = new DecalSystem(this.group, this.budget);
    this.damageFx = new DamageFeedbackSystem(this.group, this.budget);
  }

  /** Hook adaptive quality — budgets clamp active pooled FX. */
  applyQuality(q: QualitySettings) {
    this.budget = combatBudgetFromQuality(q);
    this.bursts.applyBudget(this.budget);
    this.debris.applyBudget(this.budget);
    this.sparks.applyBudget(this.budget);
    this.smoke.applyBudget(this.budget);
    this.waves.applyBudget(this.budget);
    this.tracers.applyBudget(this.budget);
    this.decals.applyBudget(this.budget);
    this.damageFx.applyBudget(this.budget);
  }

  setCamera(camera: THREE.Camera | null) {
    this.smoke.setCamera(camera);
  }

  setGroundHeight(fn: ((x: number, z: number) => number) | null) {
    this.decals.setGroundHeight(fn);
  }

  /** Optional follow target for damage pulse (heli). */
  setFollowTarget(pos: THREE.Vector3 | null) {
    this.followPos = pos;
  }

  getDamageIntensity(): number {
    return this.damageFx.getIntensity();
  }

  spawnExplosion(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot) {
    this.bursts.spawn(position, scale, color);
    // Hot core flash burst
    this.bursts.spawn(position, scale * 0.45, COLORS.orangeGlow, 0.55);
    this.waves.spawn(position, scale, color, false);
    if (scale > 0.7) {
      this.waves.spawn(position, scale * 0.65, color, true);
    }
    this.smoke.spawn(position, scale, true);
    this.debris.spawn(position, scale, color);
    this.sparks.spawn(position, color, 0.7 + scale * 0.5);
    this.decals.spawn(position, scale);
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    const tip = this.tmp.copy(position).addScaledVector(direction, 1.05);
    this.tracers.spawnMuzzle(tip, direction, COLORS.neonGreen);
    this.bursts.spawn(tip, 0.28, COLORS.neonGreen, 0.45);
    this.sparks.spawn(tip, COLORS.neonGreen, 0.45);
  }

  spawnHitSpark(position: THREE.Vector3) {
    this.sparks.spawn(position, COLORS.neonGreen, 1);
    this.bursts.spawn(position, 0.32, COLORS.neonGreen, 0.5);
    this.smoke.spawn(position, 0.35, true);
  }

  /** Enemy bolt / rocket ghost tracer. */
  spawnTracer(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color = COLORS.orangeHot,
  ) {
    this.tracers.spawnBolt(origin, direction, color);
  }

  /**
   * Player hull damage sting — pulse + sparks + light smoke.
   * @returns 0..1 intensity for camera shake coupling
   */
  spawnDamageFeedback(position: THREE.Vector3, amount: number): number {
    const sting = this.damageFx.trigger(position, amount);
    this.sparks.spawn(position, COLORS.orangeHot, 0.55 + sting * 0.7);
    if (amount > 8) {
      this.bursts.spawn(position, 0.35 + sting * 0.4, COLORS.orangeHot, 0.4);
      this.smoke.spawn(position, 0.4 + sting * 0.3, true);
    }
    return sting;
  }

  update(dt: number) {
    this.bursts.update(dt);
    this.debris.update(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.waves.update(dt);
    this.tracers.update(dt);
    this.decals.update(dt);
    this.damageFx.update(dt, this.followPos ?? undefined);
  }

  clear() {
    this.bursts.clear();
    this.debris.clear();
    this.sparks.clear();
    this.smoke.clear();
    this.waves.clear();
    this.tracers.clear();
    this.decals.clear();
    this.damageFx.clear();
  }

  dispose() {
    this.clear();
    this.bursts.dispose();
    this.debris.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
    this.waves.dispose();
    this.tracers.dispose();
    this.decals.dispose();
    this.damageFx.dispose();
    this.group.parent?.remove(this.group);
  }
}
