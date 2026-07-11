import * as THREE from 'three';
import { COLORS } from '../../scene/setup';
import type { QualitySettings } from '../quality';
import {
  combatBudgetFromQuality,
  estimateCombatFxPeak,
  type CombatFxBudget,
} from './budgets';
import { BurstSystem } from './bursts';
import { DebrisSystem } from './debris';
import { SparkSystem } from './sparks';
import { SmokeFireSystem } from './smokeFire';
import { ShockwaveSystem } from './shockwaves';
import { TracerSystem } from './tracers';
import { ProjectileTrailSystem, type TrailKind } from './trails';
import { DecalSystem } from './decals';
import {
  ImpactSystem,
  inferImpactSurface,
  type ImpactSurface,
} from './impacts';
import { EmberSystem } from './embers';
import { FlashLightSystem } from './flashLights';
import { HullDamageSystem } from './hullDamage';
import { CameraImpulseSystem, type CameraImpulseSample } from './cameraImpulse';
import { FinaleSystem, type FinaleKind } from './finale';

export interface ProjectileTrailHandle {
  /** Opaque key from ProjectileTrailSystem; 0 = none. */
  trailKey: number;
}

/**
 * Premium combat VFX orchestrator — pooled explosions, debris, sparks,
 * smoke/fire, shockwaves, tracers, missile trails, surface impacts,
 * hull damage, flash lights, and camera impulses.
 */
export class CombatFx {
  readonly group = new THREE.Group();

  private budget: CombatFxBudget;
  private readonly bursts: BurstSystem;
  private readonly debris: DebrisSystem;
  private readonly sparks: SparkSystem;
  private readonly smoke: SmokeFireSystem;
  private readonly waves: ShockwaveSystem;
  private readonly tracers: TracerSystem;
  private readonly trails: ProjectileTrailSystem;
  private readonly decals: DecalSystem;
  private readonly impacts: ImpactSystem;
  private readonly embers: EmberSystem;
  private readonly lights: FlashLightSystem;
  private readonly hull: HullDamageSystem;
  private readonly cameraImpulse: CameraImpulseSystem;
  private readonly finale: FinaleSystem;

  private followPos: THREE.Vector3 | null = null;
  private getGroundHeight: ((x: number, z: number) => number) | null = null;
  private waterY: number | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly trailByUuid = new Map<string, number>();
  private readonly finaleCbs;

  constructor(scene: THREE.Scene) {
    this.group.name = 'combat-fx';
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
    this.trails = new ProjectileTrailSystem(this.group, this.budget);
    this.decals = new DecalSystem(this.group, this.budget);
    this.impacts = new ImpactSystem(this.group, this.budget);
    this.embers = new EmberSystem(this.group, this.budget);
    this.lights = new FlashLightSystem(this.group, this.budget);
    this.hull = new HullDamageSystem(
      this.group,
      this.budget,
      this.smoke,
      this.embers,
      this.sparks,
    );
    this.cameraImpulse = new CameraImpulseSystem(this.budget);
    this.finale = new FinaleSystem(this.budget);

    this.finaleCbs = {
      blast: (pos: THREE.Vector3, scale: number, color: number) => {
        this.bursts.spawn(pos, scale, color);
        this.bursts.spawn(pos, scale * 0.4, COLORS.orangeGlow, 0.5);
      },
      shock: (pos: THREE.Vector3, scale: number, color: number, vertical?: boolean) => {
        this.waves.spawn(pos, scale, color, !!vertical);
      },
      ember: (pos: THREE.Vector3, scale: number, color: number) => {
        this.embers.spawn(pos, scale, color);
      },
      smoke: (pos: THREE.Vector3, scale: number, hot: boolean) => {
        this.smoke.spawn(pos, scale, hot);
      },
      flash: (pos: THREE.Vector3, color: number, intensity: number, range: number) => {
        this.lights.spawn(pos, color, intensity, range, 0.18);
        this.cameraImpulse.punch(0.35, 2.5);
      },
      debris: (pos: THREE.Vector3, scale: number, color: number) => {
        this.debris.spawn(pos, scale, color);
      },
      spark: (pos: THREE.Vector3, color: number, intensity: number) => {
        this.sparks.spawn(pos, color, intensity);
      },
    };
  }

  /** Current quality budget (for diagnostics). */
  getBudget(): CombatFxBudget {
    return this.budget;
  }

  getPeakEstimate() {
    return estimateCombatFxPeak(this.budget);
  }

  applyQuality(q: QualitySettings) {
    this.budget = combatBudgetFromQuality(q);
    this.bursts.applyBudget(this.budget);
    this.debris.applyBudget(this.budget);
    this.sparks.applyBudget(this.budget);
    this.smoke.applyBudget(this.budget);
    this.waves.applyBudget(this.budget);
    this.tracers.applyBudget(this.budget);
    this.trails.applyBudget(this.budget);
    this.decals.applyBudget(this.budget);
    this.impacts.applyBudget(this.budget);
    this.embers.applyBudget(this.budget);
    this.lights.applyBudget(this.budget);
    this.hull.applyBudget(this.budget);
    this.cameraImpulse.applyBudget(this.budget);
    this.finale.applyBudget(this.budget);
  }

  setCamera(camera: THREE.Camera | null) {
    this.smoke.setCamera(camera);
  }

  setGroundHeight(fn: ((x: number, z: number) => number) | null) {
    this.getGroundHeight = fn;
    this.decals.setGroundHeight(fn);
  }

  setWaterLevel(y: number | null) {
    this.waterY = y;
  }

  setFollowTarget(pos: THREE.Vector3 | null) {
    this.followPos = pos;
  }

  /** Drive continuous hull smoke/fire from mission health ratio. */
  setHullHealthRatio(ratio: number) {
    this.hull.setHealthRatio(ratio);
    this.cameraImpulse.setHullRumble(ratio);
  }

  getDamageIntensity(): number {
    return this.hull.getIntensity();
  }

  consumeCameraImpulse(dt: number): CameraImpulseSample {
    return this.cameraImpulse.consume(dt);
  }

  peekCameraImpulse(): CameraImpulseSample {
    return this.cameraImpulse.peek();
  }

  spawnExplosion(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot) {
    this.bursts.spawn(position, scale, color);
    this.bursts.spawn(position, scale * 0.45, COLORS.orangeGlow, 0.55);
    this.waves.spawn(position, scale, color, false);
    if (scale > 0.7) {
      this.waves.spawn(position, scale * 0.65, color, true);
    }
    this.smoke.spawn(position, scale, true);
    this.debris.spawn(position, scale, color);
    this.sparks.spawn(position, color, 0.7 + scale * 0.5);
    this.embers.spawn(position, scale * 0.7, COLORS.orangeGlow);
    this.decals.spawn(position, scale);
    this.lights.spawn(position, color, 5 + scale * 3, 14 + scale * 8, 0.14);
    this.cameraImpulse.punch(0.22 + scale * 0.28, 1.2 + scale * 1.5);

    const surface = inferImpactSurface(position, this.getGroundHeight, this.waterY);
    if (surface === 'ground' || surface === 'water') {
      this.impacts.spawn(position, surface, 0.8 + scale * 0.4);
    }
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    const tip = this.tmp.copy(position).addScaledVector(direction, 1.05);
    this.tracers.spawnMuzzle(tip, direction, COLORS.neonGreen);
    this.bursts.spawn(tip, 0.28, COLORS.neonGreen, 0.45);
    this.sparks.spawn(tip, COLORS.neonGreen, 0.45);
    this.lights.spawn(tip, COLORS.neonGreen, 3.2, 10, 0.06);
    this.cameraImpulse.punch(0.04, 0.35);
  }

  /** Legacy hit spark — routes to metal impact. */
  spawnHitSpark(position: THREE.Vector3) {
    this.spawnImpact(position, 'metal', 1);
  }

  spawnImpact(
    position: THREE.Vector3,
    surface: ImpactSurface = 'metal',
    intensity = 1,
    normal?: THREE.Vector3,
  ) {
    this.impacts.spawn(position, surface, intensity, normal);
    if (surface === 'metal') {
      this.sparks.spawn(position, COLORS.neonGreen, intensity);
      this.bursts.spawn(position, 0.28 * intensity, COLORS.neonGreen, 0.45);
      this.lights.spawn(position, COLORS.neonGreen, 2.5 * intensity, 8, 0.05);
    } else if (surface === 'ground') {
      this.smoke.spawn(position, 0.4 * intensity, false);
      this.bursts.spawn(position, 0.3 * intensity, COLORS.orangeHot, 0.4);
    } else if (surface === 'water') {
      this.bursts.spawn(position, 0.35 * intensity, COLORS.rimCool, 0.5);
    } else {
      this.sparks.spawn(position, COLORS.orangeGlow, 0.6 * intensity);
    }
    this.cameraImpulse.punch(0.06 * intensity, 0.2);
  }

  /** Infer surface from ground height then spawn. */
  spawnImpactAt(position: THREE.Vector3, intensity = 1) {
    const surface = inferImpactSurface(position, this.getGroundHeight, this.waterY);
    this.spawnImpact(position, surface, intensity);
  }

  spawnTracer(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color = COLORS.orangeHot,
  ) {
    this.tracers.spawnBolt(origin, direction, color);
    this.trails.spawnGhost(origin, direction, color, 2.8);
  }

  /** Begin a pooled missile/bolt ribbon trail; returns key (0 if skipped). */
  beginTrail(kind: TrailKind, color: number): number {
    return this.trails.acquire(kind, color);
  }

  pushTrail(key: number, position: THREE.Vector3) {
    if (key) this.trails.push(key, position);
  }

  endTrail(key: number) {
    if (key) this.trails.release(key);
  }

  /**
   * Keep ribbon trails in sync with live projectiles.
   * Uses mesh.uuid → trail key map; allocates on first sight.
   */
  syncProjectileTrails(
    projectiles: ReadonlyArray<{
      mesh: THREE.Object3D;
      alive: boolean;
      fromPlayer: boolean;
      velocity: THREE.Vector3;
    }>,
  ) {
    const seen = new Set<string>();
    for (const p of projectiles) {
      if (!p.alive) continue;
      const id = p.mesh.uuid;
      seen.add(id);
      let key = this.trailByUuid.get(id);
      if (!key) {
        const kind = p.fromPlayer ? 'missile' : 'bolt';
        const color = p.fromPlayer ? COLORS.neonGreen : COLORS.orangeHot;
        key = this.trails.acquire(kind, color);
        if (key) this.trailByUuid.set(id, key);
      }
      if (key) this.trails.push(key, p.mesh.position);
    }
    for (const [id, key] of this.trailByUuid) {
      if (!seen.has(id)) {
        this.trails.release(key);
        this.trailByUuid.delete(id);
      }
    }
  }

  spawnDamageFeedback(position: THREE.Vector3, amount: number): number {
    const sting = this.hull.trigger(position, amount);
    if (amount > 8) {
      this.bursts.spawn(position, 0.35 + sting * 0.4, COLORS.orangeHot, 0.4);
    }
    this.cameraImpulse.punch(0.15 + sting * 0.45, 0.8 + sting * 1.2);
    this.lights.spawn(position, COLORS.orangeHot, 2 + sting * 3, 9, 0.08);
    return sting;
  }

  playFinale(kind: FinaleKind, origin: THREE.Vector3) {
    this.finale.start(kind, origin);
    this.cameraImpulse.punch(kind === 'victory' ? 0.55 : 0.7, 3.5);
  }

  update(dt: number) {
    this.bursts.update(dt);
    this.debris.update(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.waves.update(dt);
    this.tracers.update(dt);
    this.trails.update(dt);
    this.decals.update(dt);
    this.impacts.update(dt);
    this.embers.update(dt);
    this.lights.update(dt);
    this.hull.update(dt, this.followPos ?? undefined);
    this.finale.update(dt, this.finaleCbs);
  }

  clear() {
    this.bursts.clear();
    this.debris.clear();
    this.sparks.clear();
    this.smoke.clear();
    this.waves.clear();
    this.tracers.clear();
    this.trails.clear();
    this.decals.clear();
    this.impacts.clear();
    this.embers.clear();
    this.lights.clear();
    this.hull.clear();
    this.finale.clear();
    this.cameraImpulse.clear();
    this.trailByUuid.clear();
  }

  dispose() {
    this.clear();
    this.bursts.dispose();
    this.debris.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
    this.waves.dispose();
    this.tracers.dispose();
    this.trails.dispose();
    this.decals.dispose();
    this.impacts.dispose();
    this.embers.dispose();
    this.lights.dispose();
    this.hull.dispose();
    this.group.parent?.remove(this.group);
  }
}
