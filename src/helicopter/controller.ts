import * as THREE from 'three';
import {
  FLIGHT,
  createAxes,
  createBoostState,
  dampAxes,
  updateBoost,
  integrateVelocity,
  computeAttitudeTargets,
  yawRate,
  resolveGroundImpact,
  applySoftBounds,
  type FlightAxes,
  type BoostState,
} from './flightDynamics';
import {
  createChaseCameraState,
  resetChaseCamera,
  updateChaseCamera,
  triggerCameraShake,
  getShakeTrauma,
  type ChaseCameraState,
} from './chaseCamera';
import type {
  ImpactKind,
  ProximityWarning,
  WorldCollision,
  WorldImpactResult,
} from '../collision';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Hold E / Q / mobile BOOST for afterburner + evasive bank */
  boost: boolean;
}

/** Optional analog overrides for touch (and future gamepad). */
export interface AnalogAxes {
  /** -1 left … +1 right */
  steerX?: number;
  /** -1 back … +1 forward */
  steerY?: number;
  /** -1 descend … +1 ascend */
  lift?: number;
}

export type TouchInputPayload = Partial<InputState> & AnalogAxes;

export interface FlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
}

export interface DamageState {
  health: number;
  lastImpact: number;
  totalDamage: number;
}

export interface ImpactEventInfo {
  source: 'ground' | 'building' | 'prop';
  kind: ImpactKind;
  scrape: boolean;
  crash: boolean;
  closingSpeed: number;
  destroyedProp?: boolean;
  nearGroundAssist?: number;
  colliderId?: number;
  tag?: string;
}

function createInputState(): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
  };
}

function resetInputState(input: InputState) {
  input.forward = false;
  input.back = false;
  input.left = false;
  input.right = false;
  input.up = false;
  input.down = false;
  input.boost = false;
}

/**
 * Arcade helicopter controller: WASD / arrows + Space/Shift,
 * E/Q boost, soft banking, dynamic chase camera, hover assist,
 * soft ground + building collision with damage/shake hooks, soft world bounds.
 */
export class HelicopterController {
  readonly heli: THREE.Group;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: InputState = createInputState();

  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private velocity = new THREE.Vector3();
  private getGroundHeight: (x: number, z: number) => number;
  private readonly keyboardInput = createInputState();
  private readonly touchInput = createInputState();
  private readonly touchAnalog: AnalogAxes = {};
  private readonly axes = createAxes();
  private readonly targetAxes = createAxes();
  private readonly boost: BoostState = createBoostState();
  private evasiveTimer = 0;
  private evasiveSide = 0;
  private camState: ChaseCameraState;
  private damage: DamageState = { health: 100, lastImpact: 0, totalDamage: 0 };
  private worldBound = 105;
  /** Visual map half-extent used for chase-camera rim clamp (tighter than heli soft bound). */
  private cameraBound = 105;
  private maxAltitude = 200;
  private boundPressure = 0;
  private worldCollision: WorldCollision | null = null;
  private lastWorldImpact: WorldImpactResult | null = null;
  private lastProximity: ProximityWarning | null = null;
  private scrapeShakeTimer = 0;
  private scrapeNotifyCooldown = 0;
  /** Player steering sensitivity multiplier (0.5…1.5). */
  private steeringSensitivity = 1;
  /** Camera shake scale (0 when reduced motion). */
  private shakeScale = 1;
  /** Stable chase-camera occlusion hook (avoids per-frame alloc). */
  private readonly cameraOcclusion = {
    resolve: (pivot: THREE.Vector3, desired: THREE.Vector3): boolean => {
      const collision = this.worldCollision;
      if (collision) {
        return collision.resolveCameraPosition(pivot, desired, this.cameraBound).hit;
      }
      const beforeX = desired.x;
      const beforeZ = desired.z;
      const limit = Math.max(8, this.cameraBound - 1.5);
      desired.x = THREE.MathUtils.clamp(desired.x, -limit, limit);
      desired.z = THREE.MathUtils.clamp(desired.z, -limit, limit);
      return desired.x !== beforeX || desired.z !== beforeZ;
    },
  };

  private mainRotor: THREE.Object3D | null = null;
  private tailRotor: THREE.Object3D | null = null;
  private rotorBlur: THREE.Mesh | null = null;

  /**
   * Impact listener: intensity 0..1, damage dealt, optional world/ground info.
   */
  onImpact:
    | ((intensity: number, damage: number, info?: ImpactEventInfo) => void)
    | null = null;

  enabled = false;

  constructor(
    heli: THREE.Group,
    camera: THREE.PerspectiveCamera,
    getGroundHeight: (x: number, z: number) => number,
  ) {
    this.heli = heli;
    this.camera = camera;
    this.getGroundHeight = getGroundHeight;
    this.camState = createChaseCameraState(heli.position);

    this.mainRotor = heli.getObjectByName('mainRotor') ?? null;
    this.tailRotor = heli.getObjectByName('tailRotor') ?? null;
    this.rotorBlur = (heli.getObjectByName('rotorBlur') as THREE.Mesh) ?? null;

    this.bindInput();
  }

  /** Wire map-derived building/prop colliders. */
  setWorldCollision(collision: WorldCollision | null) {
    this.worldCollision = collision;
  }

  getWorldCollision(): WorldCollision | null {
    return this.worldCollision;
  }

  getLastWorldImpact(): WorldImpactResult | null {
    return this.lastWorldImpact;
  }

  /** Latest obstacle proximity warning (0..3). */
  getProximityWarning(): ProximityWarning | null {
    return this.lastProximity ?? this.worldCollision?.getLastProximity() ?? null;
  }

  getProximityLevel(): number {
    return this.getProximityWarning()?.level ?? 0;
  }

  private bindInput() {
    const setKey = (code: string, pressed: boolean) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keyboardInput.forward = pressed;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keyboardInput.back = pressed;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keyboardInput.left = pressed;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keyboardInput.right = pressed;
          break;
        case 'Space':
          this.keyboardInput.up = pressed;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keyboardInput.down = pressed;
          break;
        case 'KeyE':
        case 'KeyQ':
          this.keyboardInput.boost = pressed;
          break;
      }
      this.syncInput();
    };

    window.addEventListener('keydown', (e) => {
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
      }
      setKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));
  }

  setTouchInput(nextInput: TouchInputPayload) {
    const { steerX, steerY, lift, ...buttons } = nextInput;
    Object.assign(this.touchInput, buttons);
    if (steerX !== undefined) this.touchAnalog.steerX = steerX;
    if (steerY !== undefined) this.touchAnalog.steerY = steerY;
    if (lift !== undefined) this.touchAnalog.lift = lift;
    this.syncInput();
  }

  clearTouchInput() {
    resetInputState(this.touchInput);
    delete this.touchAnalog.steerX;
    delete this.touchAnalog.steerY;
    delete this.touchAnalog.lift;
    this.syncInput();
  }

  private syncInput() {
    this.input.forward = this.keyboardInput.forward || this.touchInput.forward;
    this.input.back = this.keyboardInput.back || this.touchInput.back;
    this.input.left = this.keyboardInput.left || this.touchInput.left;
    this.input.right = this.keyboardInput.right || this.touchInput.right;
    this.input.up = this.keyboardInput.up || this.touchInput.up;
    this.input.down = this.keyboardInput.down || this.touchInput.down;
    this.input.boost = this.keyboardInput.boost || this.touchInput.boost;
  }

  /** Soft clamp half-extent for XZ (map-dependent) */
  setWorldBound(halfExtent: number) {
    this.worldBound = halfExtent;
  }

  /** Visual map half-extent for chase-camera rim occlusion (tighter than heli soft bound). */
  setCameraBound(halfExtent: number) {
    this.cameraBound = Math.max(8, halfExtent);
  }

  setMaxAltitude(y: number) {
    this.maxAltitude = y;
  }

  reset(spawn: THREE.Vector3) {
    this.heli.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.heli.rotation.set(0, 0, 0);
    resetInputState(this.keyboardInput);
    resetInputState(this.touchInput);
    delete this.touchAnalog.steerX;
    delete this.touchAnalog.steerY;
    delete this.touchAnalog.lift;
    this.syncInput();
    Object.assign(this.axes, createAxes());
    Object.assign(this.targetAxes, createAxes());
    Object.assign(this.boost, createBoostState());
    this.evasiveTimer = 0;
    this.evasiveSide = 0;
    this.boundPressure = 0;
    this.damage = { health: 100, lastImpact: 0, totalDamage: 0 };
    this.lastWorldImpact = null;
    this.lastProximity = null;
    this.scrapeShakeTimer = 0;
    this.scrapeNotifyCooldown = 0;
    this.worldCollision?.reset();
    resetChaseCamera(this.camState, spawn);
    this.camera.fov = this.camState.currentFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camState.camSmooth);
    this.camera.lookAt(this.camState.lookSmooth);
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  getAltitude(): number {
    const ground = this.getGroundHeight(this.heli.position.x, this.heli.position.z);
    return Math.max(0, this.heli.position.y - ground);
  }

  getState(): FlightState {
    return {
      position: this.heli.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.getSpeed(),
    };
  }

  isBoosting(): boolean {
    return this.boost.active;
  }

  getBoostTimer(): number {
    return this.boost.timer;
  }

  getBoostCooldown(): number {
    return this.boost.cooldown;
  }

  getHealth(): number {
    return this.damage.health;
  }

  getDamageState(): DamageState {
    return { ...this.damage };
  }

  /** Current camera shake trauma 0..1 (for HUD / VFX hooks). */
  getCameraShake(): number {
    return getShakeTrauma(this.camState);
  }

  /** Soft world-edge / ceiling pressure 0..1 (for VFX / audio hooks). */
  getBoundPressure(): number {
    return this.boundPressure;
  }

  /** Inject shake from external events (ring scrape, explosions, etc.). */
  addCameraShake(intensity: number) {
    triggerCameraShake(this.camState, intensity * this.shakeScale);
  }

  setSteeringSensitivity(value: number) {
    this.steeringSensitivity = THREE.MathUtils.clamp(value, 0.5, 1.5);
  }

  getSteeringSensitivity(): number {
    return this.steeringSensitivity;
  }

  /** 0 disables shake (reduced motion); 1 is default. */
  setShakeScale(scale: number) {
    this.shakeScale = THREE.MathUtils.clamp(scale, 0, 1);
    if (this.shakeScale <= 0.001) {
      this.camState.shake.trauma = 0;
    }
  }

  private buildTargetAxes(): FlightAxes {
    const a = this.targetAxes;
    const sens = this.steeringSensitivity;

    if (this.touchAnalog.steerY !== undefined) {
      a.throttle = THREE.MathUtils.clamp(this.touchAnalog.steerY * sens, -1, 1);
    } else {
      a.throttle =
        ((this.input.forward ? 1 : 0) + (this.input.back ? -1 : 0)) * sens;
    }

    if (this.touchAnalog.steerX !== undefined) {
      a.turn = THREE.MathUtils.clamp(this.touchAnalog.steerX * sens, -1, 1);
    } else {
      a.turn =
        ((this.input.right ? 1 : 0) + (this.input.left ? -1 : 0)) * sens;
    }

    if (this.touchAnalog.lift !== undefined) {
      a.lift = THREE.MathUtils.clamp(this.touchAnalog.lift, -1, 1);
    } else {
      a.lift = (this.input.up ? 1 : 0) + (this.input.down ? -1 : 0);
    }

    a.boost = this.input.boost ? 1 : 0;
    return a;
  }

  private applyImpactDamage(
    intensity: number,
    damage: number,
    info: ImpactEventInfo,
  ) {
    if (intensity > 0.02) {
      const shakeMul = info.scrape ? 0.45 : info.crash ? 1.05 : 0.85;
      triggerCameraShake(this.camState, intensity * shakeMul * this.shakeScale);
    }
    if (damage > 0) {
      this.damage.health = Math.max(0, this.damage.health - damage);
      this.damage.lastImpact = Math.max(this.damage.lastImpact, intensity);
      this.damage.totalDamage += damage;
      this.onImpact?.(intensity, damage, info);
      if (info.scrape) this.scrapeNotifyCooldown = 0.2;
      return;
    }
    if (info.scrape && intensity > 0.05 && this.scrapeNotifyCooldown <= 0) {
      this.scrapeNotifyCooldown = 0.28;
      this.onImpact?.(intensity, 0, info);
    }
  }

  update(dt: number) {
    // Rotor animation always runs for visual life.
    const rotorSpeed = 28 + this.getSpeed() * 0.4 + (this.boost.active ? 12 : 0);
    if (this.mainRotor) this.mainRotor.rotation.y += rotorSpeed * dt;
    if (this.tailRotor) this.tailRotor.rotation.x += rotorSpeed * 1.6 * dt;
    if (this.rotorBlur) {
      const mat = this.rotorBlur.material as THREE.MeshBasicMaterial;
      const blurBoost = this.boost.active ? 0.12 : 0;
      mat.opacity =
        0.2 +
        Math.min(0.35, (this.getSpeed() / FLIGHT.maxSpeed) * 0.25 + blurBoost);
    }

    if (!this.enabled) {
      this.updateCamera(dt);
      return;
    }

    if (this.scrapeNotifyCooldown > 0) {
      this.scrapeNotifyCooldown = Math.max(0, this.scrapeNotifyCooldown - dt);
    }

    this.buildTargetAxes();
    dampAxes(this.axes, this.targetAxes, dt, 11);

    updateBoost(this.boost, this.axes.boost, this.axes.turn, dt);
    if (this.boost.justActivated) {
      triggerCameraShake(this.camState, 0.26 + Math.abs(this.boost.evasiveSide) * 0.18);
      if (this.boost.evasiveSide !== 0) {
        this.evasiveSide = this.boost.evasiveSide;
        this.evasiveTimer = 0.2;
        this.yaw += -this.boost.evasiveSide * FLIGHT.evasiveYawKick * 0.08;
      }
    }

    let evasive = 0;
    if (this.evasiveTimer > 0) {
      this.evasiveTimer -= dt;
      evasive = this.evasiveSide;
      if (this.evasiveTimer <= 0) {
        this.evasiveSide = 0;
        evasive = 0;
      }
    }

    const ground = this.getGroundHeight(this.heli.position.x, this.heli.position.z);
    const clearance = Math.max(0, this.heli.position.y - ground);

    const speed = this.getSpeed();
    this.yaw += yawRate(this.axes, speed, this.boost.active) * dt;

    integrateVelocity(
      this.velocity,
      this.yaw,
      this.axes,
      this.boost.active,
      evasive,
      dt,
      clearance,
    );

    this.heli.position.addScaledVector(this.velocity, dt);

    // Soft ground collision + damage/shake hooks
    const groundClosing = Math.max(0, -this.velocity.y);
    const impact = resolveGroundImpact(this.heli.position, this.velocity, ground, 2.0);
    if (impact.intensity > 0.02 || impact.damage > 0) {
      this.applyImpactDamage(impact.intensity, impact.damage, {
        source: 'ground',
        kind: impact.damage > 8 ? 'crash' : impact.intensity > 0.08 ? 'scrape' : 'none',
        scrape: impact.damage > 0 && impact.damage <= 8,
        crash: impact.damage > 8,
        closingSpeed: groundClosing,
      });
    } else {
      this.damage.lastImpact = Math.max(0, this.damage.lastImpact - dt * 2);
    }

    // Building / prop AABB collision — scrape along walls, crash on hard hits
    if (this.worldCollision) {
      const worldHit = this.worldCollision.resolve(
        this.heli.position,
        this.velocity,
        dt,
      );
      this.lastWorldImpact = worldHit;
      this.lastProximity = this.worldCollision.getLastProximity();
      if (worldHit.contact.hit) {
        if (worldHit.scrape) {
          this.scrapeShakeTimer = Math.max(this.scrapeShakeTimer, 0.12);
        }
        const src: ImpactEventInfo['source'] =
          worldHit.contact.kind === 'prop' ? 'prop' : 'building';
        this.applyImpactDamage(worldHit.intensity, worldHit.damage, {
          source: src,
          kind: worldHit.impactKind,
          scrape: worldHit.scrape,
          crash: worldHit.crash,
          closingSpeed: worldHit.closingSpeed,
          destroyedProp: worldHit.destroyedPropId >= 0,
          nearGroundAssist: worldHit.nearGroundAssist,
          colliderId: worldHit.contact.colliderId,
        });
      }
      // Subtle shake when proximity is critical and closing fast
      if (
        this.lastProximity &&
        this.lastProximity.level >= 3 &&
        this.lastProximity.ahead &&
        this.getSpeed() > 18
      ) {
        triggerCameraShake(this.camState, 0.04 * dt * 8);
      }
    }

    if (this.scrapeShakeTimer > 0) {
      this.scrapeShakeTimer -= dt;
      triggerCameraShake(this.camState, 0.08 * dt * 10);
    }

    // Soft world bounds + altitude ceiling
    const bounds = applySoftBounds(
      this.heli.position,
      this.velocity,
      this.worldBound,
      this.maxAltitude,
      dt,
    );
    this.boundPressure = THREE.MathUtils.damp(this.boundPressure, bounds.pressure, 8, dt);
    if (bounds.pressure > 0.55) {
      triggerCameraShake(this.camState, (bounds.pressure - 0.55) * 0.35 * dt * 8);
    }

    // Visual banking / pitch from dynamics
    const attitude = computeAttitudeTargets(
      this.axes,
      this.velocity,
      this.yaw,
      this.boost.active,
    );
    this.pitch = THREE.MathUtils.damp(
      this.pitch,
      attitude.pitch,
      FLIGHT.attitudeResponse,
      dt,
    );
    this.roll = THREE.MathUtils.damp(
      this.roll,
      attitude.roll,
      FLIGHT.attitudeResponse,
      dt,
    );

    this.heli.rotation.order = 'YXZ';
    this.heli.rotation.y = this.yaw;
    this.heli.rotation.x = this.pitch;
    this.heli.rotation.z = this.roll;

    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    updateChaseCamera(
      this.camState,
      this.camera,
      this.heli.position,
      this.velocity,
      this.yaw,
      this.pitch,
      this.roll,
      this.getSpeed(),
      this.boost.active,
      FLIGHT.maxSpeed,
      dt,
      this.cameraOcclusion,
    );
  }
}
