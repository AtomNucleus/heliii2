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

  private readonly sceneSetup: SceneSetup;
  private readonly unsub: () => void;

  constructor(sceneSetup: SceneSetup) {
    this.sceneSetup = sceneSetup;
    this.quality = new AdaptiveQuality();
    this.post = createPostProcessing(
      sceneSetup.renderer,
      sceneSetup.scene,
      sceneSetup.camera,
    );
    this.exhaust = new ExhaustParticles(sceneSetup.scene);
    this.trail = new MotionTrail(sceneSetup.scene);
    this.speedFx = new SpeedEffects(sceneSetup.scene);
    this.atmosphere = new AtmosphereEffects(sceneSetup.scene);
    this.dressing = new WorldDressing(sceneSetup.scene);
    this.rotor = new RotorAmbience(sceneSetup.scene);

    this.unsub = this.quality.onChange((q) => this.applyQuality(q));
    this.applyQuality(this.quality.current);
  }

  applyQuality(q: QualitySettings) {
    this.sceneSetup.applyQuality(q);
    this.post.applyQuality(q);
    this.exhaust.applyQuality(q);
    this.trail.applyQuality(q);
    this.speedFx.applyQuality(q);
    this.atmosphere.applyQuality(q);
    this.dressing.applyQuality(q);
    this.rotor.applyQuality(q);
  }

  update(ctx: VisualEffectsUpdateContext) {
    const { dt, heliPos, heliQuat, speed, altitude, getGroundHeight, boosting, shake } = ctx;
    this.quality.update(dt);

    const boostMul = boosting ? 1.35 : 1;
    const speed01 = Math.min(1, Math.max(0, (speed - 10) / 45)) * boostMul;
    this.post.setSpeedIntensity(Math.min(1, speed01 + (shake ?? 0) * 0.25));
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
      speed * (boosting ? 1.3 : 1),
    );
    this.atmosphere.update(dt, heliPos, altitude, speed, getGroundHeight);
    this.dressing.update(dt, heliPos, this.sceneSetup.camera, altitude);
    this.rotor.update(dt, heliPos, heliQuat, speed);
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
  createPostProcessing,
};
export type { QualitySettings, PostProcessingHandle };
