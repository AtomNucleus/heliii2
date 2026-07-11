import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from '../effects/quality';
import {
  CombatFx,
  type CameraImpulseSample,
  type FinaleKind,
  type ImpactSurface,
  type TrailKind,
} from '../effects/combat';

/**
 * Combat VFX facade — thin compatible wrapper over src/effects/combat.
 * Public API stays compatible with existing combat callers.
 */
export class CombatEffects {
  private readonly fx: CombatFx;

  constructor(scene: THREE.Scene) {
    this.fx = new CombatFx(scene);
  }

  get group(): THREE.Group {
    return this.fx.group;
  }

  applyQuality(q: QualitySettings) {
    this.fx.applyQuality(q);
  }

  setCamera(camera: THREE.Camera | null) {
    this.fx.setCamera(camera);
  }

  setGroundHeight(fn: ((x: number, z: number) => number) | null) {
    this.fx.setGroundHeight(fn);
  }

  setWaterLevel(y: number | null) {
    this.fx.setWaterLevel(y);
  }

  setFollowTarget(pos: THREE.Vector3 | null) {
    this.fx.setFollowTarget(pos);
  }

  bindDebrisPhysics(world: import('../physics').DebrisPhysicsWorld | null) {
    this.fx.bindDebrisPhysics(world);
  }

  setHullHealthRatio(ratio: number) {
    this.fx.setHullHealthRatio(ratio);
  }

  getDamageIntensity(): number {
    return this.fx.getDamageIntensity();
  }

  consumeCameraImpulse(dt: number): CameraImpulseSample {
    return this.fx.consumeCameraImpulse(dt);
  }

  peekCameraImpulse(): CameraImpulseSample {
    return this.fx.peekCameraImpulse();
  }

  getBudget() {
    return this.fx.getBudget();
  }

  spawnExplosion(position: THREE.Vector3, scale = 1, color = COLORS.orangeHot) {
    this.fx.spawnExplosion(position, scale, color);
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    this.fx.spawnMuzzleFlash(position, direction);
  }

  spawnHitSpark(position: THREE.Vector3) {
    this.fx.spawnHitSpark(position);
  }

  spawnImpact(
    position: THREE.Vector3,
    surface: ImpactSurface = 'metal',
    intensity = 1,
    normal?: THREE.Vector3,
  ) {
    this.fx.spawnImpact(position, surface, intensity, normal);
  }

  spawnImpactAt(position: THREE.Vector3, intensity = 1) {
    this.fx.spawnImpactAt(position, intensity);
  }

  spawnTracer(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color = COLORS.orangeHot,
  ) {
    this.fx.spawnTracer(origin, direction, color);
  }

  beginTrail(kind: TrailKind, color: number): number {
    return this.fx.beginTrail(kind, color);
  }

  pushTrail(key: number, position: THREE.Vector3) {
    this.fx.pushTrail(key, position);
  }

  endTrail(key: number) {
    this.fx.endTrail(key);
  }

  syncProjectileTrails(
    projectiles: ReadonlyArray<{
      mesh: THREE.Object3D;
      alive: boolean;
      fromPlayer: boolean;
      velocity: THREE.Vector3;
    }>,
  ) {
    this.fx.syncProjectileTrails(projectiles);
  }

  spawnDamageFeedback(position: THREE.Vector3, amount: number): number {
    return this.fx.spawnDamageFeedback(position, amount);
  }

  playFinale(kind: FinaleKind, origin: THREE.Vector3) {
    this.fx.playFinale(kind, origin);
  }

  update(dt: number) {
    this.fx.update(dt);
  }

  clear() {
    this.fx.clear();
  }

  dispose() {
    this.fx.dispose();
  }
}
