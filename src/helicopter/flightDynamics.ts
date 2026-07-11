import * as THREE from 'three';

/** Tunable arcade flight constants — weighty, responsive, modern. */
export const FLIGHT = {
  maxSpeed: 56,
  boostMaxSpeed: 88,
  accel: 36,
  reverseAccel: 24,
  verticalAccel: 44,
  boostAccel: 72,
  dragHoriz: 1.42,
  dragVert: 0.9,
  turnBase: 1.95,
  turnAtSpeed: 1.05,
  maxPitch: 0.4,
  maxRoll: 0.52,
  attitudeResponse: 8.2,
  /** Counter-gravity when idle so the heli floats instead of sinking. */
  hoverLiftBias: 10.2,
  hoverSnap: 12.5,
  hoverDeadzone: 0.14,
  gravity: 11.5,
  maxClimb: 34,
  maxDive: -30,
  /** Extra lift when close to terrain (ground cushion). */
  groundEffectHeight: 8,
  groundEffectStrength: 18,
  boostDuration: 1.1,
  boostCooldown: 2.5,
  evasiveImpulse: 52,
  evasiveYawKick: 1.65,
  impactSpeedThreshold: 11,
  softImpactMul: 0.22,
  hardImpactMul: 0.48,
  /** Soft world-edge spring (units/s² past the soft margin). */
  boundSoftMargin: 14,
  boundSpring: 55,
  boundDamping: 3.2,
  /** Soft ceiling pushdown starts this far below maxAltitude. */
  ceilingSoftMargin: 28,
  ceilingSpring: 42,
} as const;

export interface FlightAxes {
  /** -1 reverse … +1 forward */
  throttle: number;
  /** -1 left … +1 right (yaw) */
  turn: number;
  /** -1 descend … +1 ascend */
  lift: number;
  /** 0..1 boost request */
  boost: number;
}

export interface BoostState {
  active: boolean;
  timer: number;
  cooldown: number;
  justActivated: boolean;
  evasiveSide: number;
}

export function createBoostState(): BoostState {
  return {
    active: false,
    timer: 0,
    cooldown: 0,
    justActivated: false,
    evasiveSide: 0,
  };
}

export function createAxes(): FlightAxes {
  return { throttle: 0, turn: 0, lift: 0, boost: 0 };
}

/**
 * Smooth digital/analog axes toward targets for weighty response.
 * Higher `response` = snappier.
 */
export function dampAxes(
  current: FlightAxes,
  target: FlightAxes,
  dt: number,
  response = 10,
): void {
  current.throttle = THREE.MathUtils.damp(current.throttle, target.throttle, response, dt);
  current.turn = THREE.MathUtils.damp(current.turn, target.turn, response * 1.2, dt);
  current.lift = THREE.MathUtils.damp(current.lift, target.lift, response * 0.92, dt);
  current.boost = THREE.MathUtils.damp(current.boost, target.boost, response * 1.35, dt);
}

/** Ease-in acceleration — soft start, firm mid-range punch, taper near top speed. */
export function accelCurve(input: number, speedRatio: number): number {
  const mag = Math.abs(input);
  if (mag < 1e-4) return 0;
  const speedEase = 1 - speedRatio * speedRatio * 0.5;
  const shaped = mag * mag * (3 - 2 * mag); // smoothstep
  return Math.sign(input) * shaped * speedEase;
}

export function updateBoost(
  boost: BoostState,
  request: number,
  turnAxis: number,
  dt: number,
): void {
  boost.justActivated = false;
  boost.evasiveSide = 0;

  if (boost.cooldown > 0) {
    boost.cooldown = Math.max(0, boost.cooldown - dt);
  }

  if (boost.active) {
    boost.timer -= dt;
    if (boost.timer <= 0) {
      boost.active = false;
      boost.timer = 0;
      boost.cooldown = FLIGHT.boostCooldown;
    }
    return;
  }

  if (request > 0.55 && boost.cooldown <= 0) {
    boost.active = true;
    boost.timer = FLIGHT.boostDuration;
    boost.justActivated = true;
    if (Math.abs(turnAxis) > 0.45) {
      boost.evasiveSide = Math.sign(turnAxis);
    }
  }
}

/**
 * Hover assist: when lift input is near zero, damp vertical velocity
 * so the heli feels planted in the air rather than floaty or sinking.
 */
export function applyHoverAssist(
  velocity: THREE.Vector3,
  liftAxis: number,
  dt: number,
): void {
  if (Math.abs(liftAxis) > FLIGHT.hoverDeadzone) return;
  velocity.y = THREE.MathUtils.damp(velocity.y, 0, FLIGHT.hoverSnap, dt);
}

/**
 * Ground-effect cushion: progressive upward bias as clearance shrinks.
 */
export function applyGroundEffect(
  velocity: THREE.Vector3,
  clearance: number,
  liftAxis: number,
  dt: number,
): void {
  if (clearance >= FLIGHT.groundEffectHeight) return;
  // Don't fight intentional descent hard — soften the cushion when diving
  const diveFactor = liftAxis < -FLIGHT.hoverDeadzone ? 0.35 : 1;
  const t = 1 - THREE.MathUtils.clamp(clearance / FLIGHT.groundEffectHeight, 0, 1);
  const cushion = t * t * FLIGHT.groundEffectStrength * diveFactor;
  velocity.y += cushion * dt;
}

export function computeAttitudeTargets(
  axes: FlightAxes,
  velocity: THREE.Vector3,
  yaw: number,
  boosting: boolean,
): { pitch: number; roll: number } {
  const forward = _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  const right = _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const forwardSpeed = velocity.dot(forward);
  const lateralSpeed = velocity.dot(right);
  const speed = velocity.length();
  const speedRatio = THREE.MathUtils.clamp(speed / FLIGHT.maxSpeed, 0, 1.4);

  // Pitch from throttle intent + actual forward speed (weighty nose dip)
  let pitch =
    -axes.throttle * 0.3 -
    THREE.MathUtils.clamp(forwardSpeed / FLIGHT.maxSpeed, -1, 1) * 0.15;
  if (boosting) pitch -= 0.07;

  // Roll from turn input + lateral slip
  let roll =
    -axes.turn * (0.36 + speedRatio * 0.14) -
    THREE.MathUtils.clamp(lateralSpeed / FLIGHT.maxSpeed, -1, 1) * 0.24;
  if (boosting && Math.abs(axes.turn) > 0.3) {
    roll -= Math.sign(axes.turn) * 0.1;
  }

  return {
    pitch: THREE.MathUtils.clamp(pitch, -FLIGHT.maxPitch, FLIGHT.maxPitch * 0.72),
    roll: THREE.MathUtils.clamp(roll, -FLIGHT.maxRoll, FLIGHT.maxRoll),
  };
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _horiz = new THREE.Vector2();

export function integrateVelocity(
  velocity: THREE.Vector3,
  yaw: number,
  axes: FlightAxes,
  boosting: boolean,
  evasiveSide: number,
  dt: number,
  clearance = 999,
): void {
  const forward = _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  const right = _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const horizSpeed = Math.hypot(velocity.x, velocity.z);
  const speedRatio = THREE.MathUtils.clamp(
    horizSpeed / (boosting ? FLIGHT.boostMaxSpeed : FLIGHT.maxSpeed),
    0,
    1,
  );

  const accel = _accel.set(0, 0, 0);
  const throttleCurve = accelCurve(axes.throttle, speedRatio);
  if (throttleCurve >= 0) {
    accel.addScaledVector(forward, throttleCurve * FLIGHT.accel);
  } else {
    accel.addScaledVector(forward, throttleCurve * FLIGHT.reverseAccel);
  }

  if (boosting) {
    accel.addScaledVector(forward, FLIGHT.boostAccel * (0.62 + axes.throttle * 0.38));
  }

  // Vertical: gravity always; lift input overrides hover bias
  accel.y -= FLIGHT.gravity;
  if (Math.abs(axes.lift) > FLIGHT.hoverDeadzone) {
    accel.y += axes.lift * FLIGHT.verticalAccel;
  } else {
    accel.y += FLIGHT.hoverLiftBias;
  }

  if (evasiveSide !== 0) {
    accel.addScaledVector(right, -evasiveSide * FLIGHT.evasiveImpulse);
  }

  velocity.addScaledVector(accel, dt);

  const dragH = boosting ? FLIGHT.dragHoriz * 0.52 : FLIGHT.dragHoriz;
  velocity.x *= Math.exp(-dragH * dt);
  velocity.z *= Math.exp(-dragH * dt);
  velocity.y *= Math.exp(-FLIGHT.dragVert * dt);

  applyHoverAssist(velocity, axes.lift, dt);
  applyGroundEffect(velocity, clearance, axes.lift, dt);

  const maxH = boosting ? FLIGHT.boostMaxSpeed : FLIGHT.maxSpeed;
  _horiz.set(velocity.x, velocity.z);
  if (_horiz.length() > maxH) {
    _horiz.setLength(maxH);
    velocity.x = _horiz.x;
    velocity.z = _horiz.y;
  }
  velocity.y = THREE.MathUtils.clamp(velocity.y, FLIGHT.maxDive, FLIGHT.maxClimb);
}

export function yawRate(axes: FlightAxes, speed: number, boosting: boolean): number {
  const speedRatio = THREE.MathUtils.clamp(speed / FLIGHT.maxSpeed, 0, 1);
  const rate =
    FLIGHT.turnBase +
    (1 - speedRatio) * FLIGHT.turnAtSpeed +
    (boosting ? 0.32 : 0);
  return -axes.turn * rate;
}

export interface ImpactResult {
  intensity: number;
  damage: number;
  bounced: boolean;
}

/** Soft ground collision with damage/shake intensity from impact speed. */
export function resolveGroundImpact(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  groundY: number,
  minClearance = 2.0,
): ImpactResult {
  const minY = groundY + minClearance;
  if (position.y >= minY) {
    return { intensity: 0, damage: 0, bounced: false };
  }

  const impactSpeed = Math.max(0, -velocity.y);
  position.y = minY;

  let intensity = 0;
  let damage = 0;
  if (impactSpeed > 2) {
    const t = THREE.MathUtils.clamp(
      (impactSpeed - 2) / (FLIGHT.impactSpeedThreshold * 1.5),
      0,
      1,
    );
    intensity = t * t;
    damage = intensity * (impactSpeed > FLIGHT.impactSpeedThreshold ? 18 : 6);
  }

  if (velocity.y < 0) {
    const mul =
      impactSpeed > FLIGHT.impactSpeedThreshold
        ? FLIGHT.hardImpactMul
        : FLIGHT.softImpactMul;
    velocity.y *= -mul;
    if (impactSpeed > FLIGHT.impactSpeedThreshold) {
      velocity.x *= 0.7;
      velocity.z *= 0.7;
    }
  }

  return { intensity, damage, bounced: true };
}

export interface BoundResult {
  /** 0..1 how hard the soft edge is pushing (for shake / VFX). */
  pressure: number;
}

/**
 * Soft world XZ bounds + soft altitude ceiling.
 * Springs the craft back instead of hard-clamping for a modern arcade feel.
 */
export function applySoftBounds(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  worldBound: number,
  maxAltitude: number,
  dt: number,
): BoundResult {
  let pressure = 0;
  const soft = FLIGHT.boundSoftMargin;
  const spring = FLIGHT.boundSpring;
  const damp = FLIGHT.boundDamping;

  const applyAxis = (axis: 'x' | 'z') => {
    const v = position[axis];
    const over = Math.abs(v) - (worldBound - soft);
    if (over <= 0) return;
    const dir = Math.sign(v);
    const t = THREE.MathUtils.clamp(over / soft, 0, 1.5);
    // Progressive spring + damping of outbound velocity
    velocity[axis] -= dir * spring * t * t * dt;
    if (dir * velocity[axis] > 0) {
      velocity[axis] *= Math.exp(-damp * t * dt);
    }
    // Hard safety clamp past the absolute edge
    if (Math.abs(v) > worldBound) {
      position[axis] = dir * worldBound;
      if (dir * velocity[axis] > 0) velocity[axis] *= -0.15;
      pressure = Math.max(pressure, 1);
    } else {
      pressure = Math.max(pressure, t);
    }
  };

  applyAxis('x');
  applyAxis('z');

  // Soft ceiling
  const ceilStart = maxAltitude - FLIGHT.ceilingSoftMargin;
  if (position.y > ceilStart) {
    const over = position.y - ceilStart;
    const t = THREE.MathUtils.clamp(over / FLIGHT.ceilingSoftMargin, 0, 1.25);
    velocity.y -= FLIGHT.ceilingSpring * t * t * dt;
    if (velocity.y > 0) {
      velocity.y *= Math.exp(-FLIGHT.boundDamping * t * dt);
    }
    pressure = Math.max(pressure, t * 0.65);
    if (position.y > maxAltitude) {
      position.y = maxAltitude;
      if (velocity.y > 0) velocity.y *= -0.1;
      pressure = Math.max(pressure, 0.85);
    }
  }

  return { pressure };
}
