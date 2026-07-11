/**
 * Pure pursuit / evasion steering for drones (no Three.js).
 */

import {
  type Vec3,
  v3,
  copy,
  sub,
  addScaled,
  normalize,
  length,
  dist,
  clamp,
} from './vec';

export type MoveIntent = 'orbit' | 'pursue' | 'evade' | 'strafe' | 'hold';

export interface SteeringInput {
  position: Vec3;
  target: Vec3;
  targetVelocity?: Vec3;
  /** Anchor for orbit / escort hold */
  anchor?: Vec3 | null;
  preferredRange: number;
  moveSpeed: number;
  pursuitWeight: number;
  evadeWeight: number;
  /** 0–1 pressure from director */
  aggression: number;
  /** Player recently damaged this unit → evade bias */
  underFire: boolean;
  dt: number;
  time: number;
  id: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitHeight: number;
}

export interface SteeringResult {
  position: Vec3;
  orbitAngle: number;
  yaw: number;
  intent: MoveIntent;
}

const _toTarget = v3();
const _desired = v3();
const _evade = v3();
const _tmp = v3();

function pickIntent(input: SteeringInput, range: number): MoveIntent {
  if (input.underFire && input.evadeWeight > 0.4) return 'evade';
  if (range < input.preferredRange * 0.55 && input.evadeWeight > 0.3) return 'evade';
  if (range > input.preferredRange * 1.35 && input.pursuitWeight * input.aggression > 0.35) {
    return 'pursue';
  }
  if (input.pursuitWeight > 0.6 && input.aggression > 0.55 && range < input.preferredRange * 1.1) {
    return 'strafe';
  }
  if (input.anchor) return 'orbit';
  return 'hold';
}

/**
 * Advance drone position for one tick.
 */
export function steerDrone(input: SteeringInput): SteeringResult {
  const range = dist(input.position, input.target);
  const intent = pickIntent(input, range);
  const speed = input.moveSpeed * (14 + input.aggression * 8);
  const pos = copy(v3(), input.position);
  let angle = input.orbitAngle;

  sub(_toTarget, input.target, input.position);
  normalize(_toTarget, _toTarget);

  switch (intent) {
    case 'pursue': {
      const lead = input.targetVelocity ?? v3();
      addScaled(_desired, input.target, lead, 0.25);
      sub(_tmp, _desired, pos);
      normalize(_tmp, _tmp);
      addScaled(pos, pos, _tmp, speed * input.dt * input.pursuitWeight);
      pos.y += (input.target.y + 4 - pos.y) * clamp(0.08 * input.moveSpeed, 0, 1);
      break;
    }
    case 'evade': {
      _evade.x = -_toTarget.x;
      _evade.y = -_toTarget.y * 0.3;
      _evade.z = -_toTarget.z;
      const side = Math.sin(input.time * 2.1 + input.id) * 0.55;
      _evade.x += -_toTarget.z * side;
      _evade.z += _toTarget.x * side;
      normalize(_evade, _evade);
      addScaled(pos, pos, _evade, speed * input.dt * (0.7 + input.evadeWeight));
      pos.y += Math.sin(input.time * 1.7 + input.id) * 4 * input.dt;
      break;
    }
    case 'strafe': {
      const side = ((input.id % 2) * 2 - 1) * (0.8 + input.aggression * 0.4);
      _desired.x = -_toTarget.z * side;
      _desired.y = Math.sin(input.time * 1.3 + input.id) * 0.25;
      _desired.z = _toTarget.x * side;
      normalize(_desired, _desired);
      const rangeErr = range - input.preferredRange;
      addScaled(_desired, _desired, _toTarget, clamp(-rangeErr * 0.04, -0.5, 0.5));
      addScaled(pos, pos, _desired, speed * input.dt);
      break;
    }
    case 'orbit': {
      const anchor = input.anchor ?? input.position;
      angle += input.dt * (0.45 + input.moveSpeed * 0.25);
      const bob = Math.sin(input.time * 1.4 + input.id) * 1.6;
      pos.x = anchor.x + Math.cos(angle) * input.orbitRadius;
      pos.y = input.orbitHeight + bob;
      pos.z = anchor.z + Math.sin(angle) * input.orbitRadius;
      break;
    }
    case 'hold':
    default: {
      pos.y = input.orbitHeight + Math.sin(input.time * 1.2 + input.id) * 1.2;
      break;
    }
  }

  sub(_tmp, input.target, pos);
  const yaw = length(_tmp) > 0.01 ? Math.atan2(_tmp.x, _tmp.z) : angle + Math.PI / 2;

  return { position: pos, orbitAngle: angle, yaw, intent };
}

/**
 * Compute aim direction with lead prediction.
 */
export function aimWithLead(
  origin: Vec3,
  target: Vec3,
  targetVel: Vec3,
  leadTime: number,
  out: Vec3 = v3(),
): Vec3 {
  addScaled(_desired, target, targetVel, leadTime);
  sub(out, _desired, origin);
  normalize(out, out);
  out.y += 0.04;
  return normalize(out, out);
}

/** Whether unit should prefer evasion this frame. */
export function shouldEvade(opts: {
  healthRatio: number;
  underFire: boolean;
  evadeWeight: number;
  distToTarget: number;
  preferredRange: number;
}): boolean {
  if (opts.underFire && opts.evadeWeight >= 0.4) return true;
  if (opts.healthRatio < 0.35 && opts.evadeWeight >= 0.3) return true;
  if (opts.distToTarget < opts.preferredRange * 0.45) return true;
  return false;
}
