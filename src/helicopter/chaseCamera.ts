import * as THREE from 'three';

export const CAMERA = {
  baseFov: 54,
  maxFov: 70,
  baseHeight: 13.5,
  baseDistance: 34,
  maxDistance: 46,
  lookAhead: 6.5,
  lookHeight: 1.4,
  /** Position follow rate (higher = snappier). */
  posLag: 4.8,
  lookLag: 6.2,
  rollInfluence: 0.2,
  bankLean: 0.12,
  boostFovKick: 5.5,
  boostDistPull: 0.88,
  shakeDecay: 4.2,
  shakeMax: 1.25,
} as const;

export interface CameraShakeState {
  trauma: number;
}

export function createShakeState(): CameraShakeState {
  return { trauma: 0 };
}

export function addShake(shake: CameraShakeState, amount: number): void {
  shake.trauma = Math.min(1, shake.trauma + amount);
}

/** Returns current shake amplitude after decaying trauma. */
export function updateShake(shake: CameraShakeState, dt: number): number {
  shake.trauma = Math.max(0, shake.trauma - CAMERA.shakeDecay * dt * (0.35 + shake.trauma));
  const t = shake.trauma * shake.trauma;
  return t * CAMERA.shakeMax;
}

export interface ChaseCameraState {
  camSmooth: THREE.Vector3;
  lookSmooth: THREE.Vector3;
  currentFov: number;
  shake: CameraShakeState;
  /** Scratch vectors — reused every frame to avoid GC. */
  _camPos: THREE.Vector3;
  _look: THREE.Vector3;
  _back: THREE.Vector3;
  _right: THREE.Vector3;
  _forward: THREE.Vector3;
  _velDir: THREE.Vector3;
  _shakeOffset: THREE.Vector3;
}

export function createChaseCameraState(spawn: THREE.Vector3): ChaseCameraState {
  return {
    camSmooth: spawn.clone().add(new THREE.Vector3(0, CAMERA.baseHeight, CAMERA.baseDistance)),
    lookSmooth: spawn.clone(),
    currentFov: CAMERA.baseFov,
    shake: createShakeState(),
    _camPos: new THREE.Vector3(),
    _look: new THREE.Vector3(),
    _back: new THREE.Vector3(),
    _right: new THREE.Vector3(),
    _forward: new THREE.Vector3(),
    _velDir: new THREE.Vector3(),
    _shakeOffset: new THREE.Vector3(),
  };
}

export function resetChaseCamera(state: ChaseCameraState, spawn: THREE.Vector3): void {
  state.camSmooth.copy(spawn).add(new THREE.Vector3(0, CAMERA.baseHeight, CAMERA.baseDistance));
  state.lookSmooth.copy(spawn);
  state.currentFov = CAMERA.baseFov;
  state.shake.trauma = 0;
}

/**
 * Dynamic chase camera: speed-based distance/FOV, velocity look-ahead,
 * attitude lean, lag smoothing, and trauma-based shake.
 */
export function updateChaseCamera(
  state: ChaseCameraState,
  camera: THREE.PerspectiveCamera,
  heliPos: THREE.Vector3,
  velocity: THREE.Vector3,
  yaw: number,
  pitch: number,
  roll: number,
  speed: number,
  boosting: boolean,
  maxSpeed: number,
  dt: number,
): void {
  const speedRatio = THREE.MathUtils.clamp(speed / maxSpeed, 0, 1.35);
  let distance = THREE.MathUtils.lerp(
    CAMERA.baseDistance,
    CAMERA.maxDistance,
    Math.min(1, speedRatio),
  );
  if (boosting) distance *= CAMERA.boostDistPull;

  const height =
    CAMERA.baseHeight +
    speedRatio * 4.2 +
    (boosting ? 1.2 : 0) -
    pitch * 2.8;

  const back = state._back.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = state._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const forward = state._forward.set(Math.sin(yaw), 0, Math.cos(yaw));

  // Offset with roll for cinematic bank follow
  const camPos = state._camPos
    .copy(heliPos)
    .addScaledVector(back, distance)
    .addScaledVector(right, roll * distance * CAMERA.rollInfluence);
  camPos.y += height;

  const look = state._look.copy(heliPos);
  look.y += CAMERA.lookHeight - pitch * 2.2;

  // Look ahead along facing + velocity
  const lookDist = CAMERA.lookAhead + speedRatio * 5.5 + (boosting ? 3.5 : 0);
  look.addScaledVector(forward, lookDist);
  if (velocity.lengthSq() > 1) {
    const velDir = state._velDir.copy(velocity).normalize();
    look.addScaledVector(velDir, 2.2 * speedRatio);
  }
  // Slight look into the bank
  look.addScaledVector(right, -roll * 2.5);

  const posLag = boosting ? CAMERA.posLag * 0.78 : CAMERA.posLag;
  const lookLag = boosting ? CAMERA.lookLag * 0.88 : CAMERA.lookLag;
  // Lag slightly more when slow for a weighty hover feel
  const hoverLagMul = 1 - speedRatio * 0.15;
  state.camSmooth.lerp(camPos, 1 - Math.exp(-posLag * hoverLagMul * dt));
  state.lookSmooth.lerp(look, 1 - Math.exp(-lookLag * dt));

  // FOV speed feedback
  const targetFov =
    CAMERA.baseFov +
    speedRatio * (CAMERA.maxFov - CAMERA.baseFov) +
    (boosting ? CAMERA.boostFovKick : 0);
  state.currentFov = THREE.MathUtils.damp(state.currentFov, targetFov, 4.8, dt);
  if (Math.abs(camera.fov - state.currentFov) > 0.02) {
    camera.fov = state.currentFov;
    camera.updateProjectionMatrix();
  }

  const shakeAmp = updateShake(state.shake, dt);
  const shakeOffset = state._shakeOffset.set(0, 0, 0);
  if (shakeAmp > 0.001) {
    const t = performance.now() * 0.001;
    shakeOffset.set(
      Math.sin(t * 37.1) * shakeAmp,
      Math.cos(t * 29.7) * shakeAmp * 0.72,
      Math.sin(t * 41.3) * shakeAmp * 0.5,
    );
  }

  camera.position.copy(state.camSmooth).add(shakeOffset);
  camera.lookAt(state.lookSmooth);

  // Subtle bank lean after lookAt (does not fight look direction much)
  camera.rotateZ(roll * CAMERA.bankLean);
}

/** Public hook helpers for external systems (collisions, ring hits, etc.). */
export function triggerCameraShake(state: ChaseCameraState, intensity: number): void {
  addShake(state.shake, THREE.MathUtils.clamp(intensity, 0, 1));
}

export function getShakeTrauma(state: ChaseCameraState): number {
  return state.shake.trauma;
}
