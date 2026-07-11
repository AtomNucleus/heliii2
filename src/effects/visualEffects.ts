import * as THREE from 'three';
import type { SceneSetup } from '../scene/setup';
import { AdaptiveQuality, type QualitySettings } from './quality';
import { createPostProcessing, type PostProcessingHandle } from './postprocessing';
import { ExhaustParticles } from './particles';
import { MotionTrail } from './trails';
import { SpeedEffects } from './speedEffects';
import { AtmosphereEffects } from './atmosphere';
import { WorldDressing } from './worldDressing';
import { RotorAmbience } from './rotorAmbience';
import { LightShafts } from './lightShafts';
import { ContactShadow } from './contactShadow';
import { WaterResponse } from './waterResponse';

export interface VisualEffectsUpdateContext {
  dt: number;
  heliPos: THREE.Vector3;
  heliQuat: THREE.Quaternion;
  speed: number;
  altitude: number;
  getGroundHeight?: (x: number, z: number) => number;
  /** Optional boost multiplier from gameplay */
  boosting?: boolean;
  /** Optional camera shake 0..1 */
  shake?: number;
  /** Elapsed time for water / shafts */
  time?: number;
  /** Water plane Y if known */
  waterY?: number;
}

/**
 * Facade wiring postprocessing + modular VFX + adaptive quality.
 * Integration: construct once after scene setup, call `update` / `render` each frame.
 */
export class VisualEffects {
  readonly quality: AdaptiveQuality;
  readonly post: PostProcessingHandle;
  readonly exhaust: ExhaustParticles;
  readonly trail: MotionTrail;
  readonly speedFx: SpeedEffects;
  readonly atmosphere: AtmosphereEffects;
  readonly dressing: WorldDressing;
  readonly rotor: RotorAmbience;
  readonly lightShafts: LightShafts;
  readonly contactShadow: ContactShadow;
  readonly waterResponse: WaterResponse;

  private readonly sceneSetup: SceneSetup;
  private readonly unsub: () => void;
  private readonly sunDir = new THREE.Vector3(0.55, 0.28, -0.45).normalize();
  private reducedMotion = false;

  /** Async factory so WebGPU post stays off the mobile WebGL parse path. */
  static async create(sceneSetup: SceneSetup): Promise<VisualEffects> {
    const post = await createPostProcessing(
      sceneSetup.renderer,
      sceneSetup.scene,
      sceneSetup.camera,
    );
    return new VisualEffects(sceneSetup, post);
  }

  private constructor(sceneSetup: SceneSetup, post: PostProcessingHandle) {
    this.sceneSetup = sceneSetup;
    this.quality = new AdaptiveQuality();
    this.post = post;
    this.exhaust = new ExhaustParticles(sceneSetup.scene);
    this.trail = new MotionTrail(sceneSetup.scene);
    this.speedFx = new SpeedEffects(sceneSetup.scene);
    this.atmosphere = new AtmosphereEffects(sceneSetup.scene);
    this.dressing = new WorldDressing(sceneSetup.scene);
    this.rotor = new RotorAmbience(sceneSetup.scene);
    this.lightShafts = new LightShafts(sceneSetup.scene);
    this.contactShadow = new ContactShadow(sceneSetup.scene);
    this.waterResponse = new WaterResponse();

    this.unsub = this.quality.onChange((q) => this.applyQuality(q));
    this.applyQuality(this.quality.current);
  }

  /** Bind ocean mesh for richer water response (after world load). */
  bindWater(water: THREE.Mesh | null, foam?: THREE.Mesh[]) {
    this.waterResponse.bind(water, this.sceneSetup.scene, foam);
    this.waterResponse.applyQuality(this.quality.current);
  }

  applyQuality(q: QualitySettings) {
    const effective: QualitySettings = this.reducedMotion
      ? {
          ...q,
          filmGrain: false,
          chromaticAberration: false,
          speedLineCount: Math.min(q.speedLineCount, 4),
          bloomStrength: Math.min(q.bloomStrength, 0.12),
        }
      : q;
    this.sceneSetup.applyQuality(effective);
    this.post.applyQuality(effective);
    this.exhaust.applyQuality(effective);
    this.trail.applyQuality(effective);
    this.speedFx.applyQuality(effective);
    this.atmosphere.applyQuality(effective);
    this.dressing.applyQuality(effective);
    this.rotor.applyQuality(effective);
    this.lightShafts.applyQuality(effective);
    this.contactShadow.applyQuality(effective);
    this.waterResponse.applyQuality(effective);
  }

  /** Reduce camera-adjacent speed FX / film / chromatic when reduced motion is on. */
  setReducedMotion(active: boolean) {
    if (this.reducedMotion === active) return;
    this.reducedMotion = active;
    this.applyQuality(this.quality.current);
  }

  update(ctx: VisualEffectsUpdateContext) {
    const {
      dt,
      heliPos,
      heliQuat,
      speed,
      altitude,
      getGroundHeight,
      boosting,
      shake,
      time,
      waterY,
    } = ctx;
    this.quality.update(this.reducedMotion ? 0 : dt);

    const boostMul = boosting ? 1.35 : 1;
    const speed01 = Math.min(1, Math.max(0, (speed - 10) / 45)) * boostMul;
    const speedIntensity = this.reducedMotion
      ? Math.min(0.15, speed01 * 0.2)
      : Math.min(1, speed01 + (shake ?? 0) * 0.25);
    this.post.setSpeedIntensity(speedIntensity);
    this.post.update(dt);

    this.sceneSetup.updateAtmosphere(dt, altitude, speed);
    this.sceneSetup.atmosphere.focus.copy(heliPos);

    this.exhaust.update(dt, heliPos, heliQuat, speed * (boosting ? 1.25 : 1));
    this.trail.update(dt, heliPos, speed * (boosting ? 1.2 : 1));
    this.speedFx.update(
      dt,
      this.sceneSetup.camera,
      heliPos,
      heliQuat,
      this.reducedMotion ? Math.min(speed, 12) : speed * (boosting ? 1.3 : 1),
    );
    this.atmosphere.update(dt, heliPos, altitude, speed, getGroundHeight);
    this.dressing.update(dt, heliPos, this.sceneSetup.camera, altitude);
    this.rotor.update(dt, heliPos, heliQuat, speed);

    this.sunDir.set(
      this.sceneSetup.sunLight.position.x - heliPos.x,
      this.sceneSetup.sunLight.position.y - heliPos.y,
      this.sceneSetup.sunLight.position.z - heliPos.z,
    ).normalize();
    this.lightShafts.setSunDirection(this.sunDir);
    this.lightShafts.update(dt, heliPos, this.sceneSetup.atmosphere.haze);
    this.contactShadow.update(heliPos, altitude, getGroundHeight);

    const elapsed = time ?? 0;
    const wy = waterY ?? -0.55;
    this.waterResponse.update({
      time: elapsed,
      dt,
      heliPos,
      altitude,
      speed,
      waterY: wy,
    });
  }

  render() {
    this.post.render();
  }

  resetTrail() {
    this.trail.reset();
  }

  dispose() {
    this.unsub();
    this.exhaust.dispose();
    this.trail.dispose();
    this.speedFx.dispose();
    this.atmosphere.dispose();
    this.dressing.dispose();
    this.rotor.dispose();
    this.lightShafts.dispose();
    this.contactShadow.dispose();
    this.waterResponse.dispose();
  }
}

export {
  AdaptiveQuality,
  ExhaustParticles,
  MotionTrail,
  SpeedEffects,
  AtmosphereEffects,
  WorldDressing,
  RotorAmbience,
  LightShafts,
  ContactShadow,
  WaterResponse,
  createPostProcessing,
};
export type { QualitySettings, PostProcessingHandle };
