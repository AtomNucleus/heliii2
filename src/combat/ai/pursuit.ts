/**
 * Pure pursuit / evasion / formation steering for drones (no Three.js).
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
  lerp,
} from './vec';

export type MoveIntent =
  | 'orbit'
  | 'pursue'
  | 'evade'
  | 'strafe'
  | 'hold'
  | 'formation'
  | 'intercept'
  | 'flank';

export interface SteeringInput {
  position: Vec3;
  target: Vec3;
  targetVelocity?: Vec3;
  /** Anchor for orbit / escort hold */
  anchor?: Vec3 | null;
  /** Desired world slot when holding formation */
  formationSlot?: Vec3 | null;
  /** 0–1 how strongly to stick to formation slot */
  formationPull?: number;
  preferredRange: number;
  moveSpeed: number;
  pursuitWeight: number;
  evadeWeight: number;
  /** 0–1 pressure from director */
  aggression: number;
  /** Player recently damaged this unit → evade bias */
  underFire: boolean;
  /** Current health / max (0–1) */
  healthRatio?: number;
  /** Prefer cutting ahead of target velocity (interceptors) */
  interceptBias?: number;
  /** Prefer wide flanking arcs (strikers / scouts) */
  flankBias?: number;
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
const _slot = v3();

function pickIntent(input: SteeringInput, range: number): MoveIntent {
  const health = input.healthRatio ?? 1;
  if (
    shouldEvade({
      healthRatio: health,
      underFire: input.underFire,
      evadeWeight: input.evadeWeight,
      distToTarget: range,
      preferredRange: input.preferredRange,
    })
  ) {
    return 'evade';
  }
  // Escorts / high formation affinity hold slot when not pressured
  const pull = input.formationPull ?? 0;
  if (pull > 0.55 && input.formationSlot && !input.underFire && range > input.preferredRange * 0.7) {
    return 'formation';
  }
  const intercept = input.interceptBias ?? 0;
  const flank = input.flankBias ?? 0;
  // Cut ahead when player is moving and interceptor is mid-range
  if (
    intercept > 0.45 &&
    range > input.preferredRange * 0.85 &&
    range < input.preferredRange * 2.2 &&
    input.aggression > 0.4
  ) {
    return 'intercept';
  }
  // Wide flank when close-ish but not in preferred pocket
  if (
    flank > 0.4 &&
    range > input.preferredRange * 0.6 &&
    range < input.preferredRange * 1.6 &&
    input.aggression > 0.45
  ) {
    return 'flank';
  }
  if (range > input.preferredRange * 1.35 && input.pursuitWeight * input.aggression > 0.35) {
    return 'pursue';
  }
  if (input.pursuitWeight > 0.6 && input.aggression > 0.55 && range < input.preferredRange * 1.1) {
    return 'strafe';
  }
  if (pull > 0.35 && input.formationSlot) return 'formation';
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
    case 'intercept': {
      // Cut to a point ahead of the player along their velocity
      const lead = input.targetVelocity ?? v3();
      const leadT = 0.55 + (input.interceptBias ?? 0.5) * 0.55;
      addScaled(_desired, input.target, lead, leadT);
      // Soft lateral offset so multiple interceptors don't stack
      const side = ((input.id % 2) * 2 - 1) * (6 + (input.id % 3) * 2);
      const leadLen = length(lead);
      if (leadLen > 0.5) {
        _evade.x = -lead.z / leadLen;
        _evade.z = lead.x / leadLen;
        _desired.x += _evade.x * side;
        _desired.z += _evade.z * side;
      }
      sub(_tmp, _desired, pos);
      normalize(_tmp, _tmp);
      addScaled(pos, pos, _tmp, speed * input.dt * (0.85 + (input.interceptBias ?? 0.5) * 0.4));
      pos.y += (input.target.y + 3 - pos.y) * clamp(0.1 * input.moveSpeed, 0, 1);
      break;
    }
    case 'flank': {
      // Arc around the player toward their blind side
      const side = ((input.id % 2) * 2 - 1) * (0.9 + (input.flankBias ?? 0.5) * 0.5);
      _desired.x = -_toTarget.z * side;
      _desired.y = Math.sin(input.time * 1.1 + input.id) * 0.2;
      _desired.z = _toTarget.x * side;
      normalize(_desired, _desired);
      // Mix in mild pursuit so flank closes range
      addScaled(_desired, _desired, _toTarget, 0.35 * input.pursuitWeight);
      normalize(_desired, _desired);
      addScaled(pos, pos, _desired, speed * input.dt * 0.95);
      const rangeErr = range - input.preferredRange;
      addScaled(pos, pos, _toTarget, clamp(-rangeErr * 0.03, -0.4, 0.4) * speed * input.dt);
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
      const panic = 0.7 + input.evadeWeight + (1 - (input.healthRatio ?? 1)) * 0.35;
      addScaled(pos, pos, _evade, speed * input.dt * panic);
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
    case 'formation': {
      const slot = input.formationSlot!;
      const pull = clamp(input.formationPull ?? 0.7, 0.2, 1);
      // Blend toward slot while gently facing the player
      lerp(_slot, pos, slot, clamp(pull * 2.2 * input.dt, 0, 1));
      copy(pos, _slot);
      // Soft orbit drift so formation doesn't look frozen
      angle += input.dt * 0.15 * input.moveSpeed;
      const bob = Math.sin(input.time * 1.1 + input.id) * 0.6;
      pos.y += bob * input.dt * 2;
      // Mild pursuit bias when player is close
      if (range < input.preferredRange * 1.2) {
        addScaled(pos, pos, _toTarget, speed * input.dt * 0.12 * input.pursuitWeight);
      }
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

/**
 * Flak-style lofted aim — leads more in Y and adds slight intentional miss radius.
 */
export function aimFlak(
  origin: Vec3,
  target: Vec3,
  targetVel: Vec3,
  leadTime: number,
  time: number,
  id: number,
  out: Vec3 = v3(),
): Vec3 {
  addScaled(_desired, target, targetVel, leadTime * 1.15);
  // Lead high for flak bursts
  _desired.y += 3.5 + Math.sin(time * 1.7 + id) * 1.2;
  // Readable miss cone so flak feels area-denial, not sniper-perfect
  const wobble = 0.08;
  _desired.x += Math.sin(time * 2.3 + id * 1.7) * wobble * dist(origin, target);
  _desired.z += Math.cos(time * 1.9 + id) * wobble * dist(origin, target);
  sub(out, _desired, origin);
  return normalize(out, out);
}

/**
 * Fair aim — lead prediction with a small readable miss cone so bolts aren't sniper-perfect.
 * missScale 0 = perfect lead, 1 = ~8% lateral miss at range.
 */
export function aimFair(
  origin: Vec3,
  target: Vec3,
  targetVel: Vec3,
  leadTime: number,
  time: number,
  id: number,
  missScale = 0.35,
  out: Vec3 = v3(),
): Vec3 {
  addScaled(_desired, target, targetVel, leadTime);
  const range = dist(origin, target);
  const wobble = 0.045 * clamp(missScale, 0, 1);
  _desired.x += Math.sin(time * 1.7 + id * 2.1) * wobble * range;
  _desired.z += Math.cos(time * 1.3 + id * 1.4) * wobble * range;
  // Slight under-lead so fast players can dodge after telegraph
  addScaled(_desired, _desired, targetVel, -leadTime * 0.12 * missScale);
  sub(out, _desired, origin);
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

/**
 * World-space formation slot from orbit anchor + angle (cheap cohesion target).
 */
export function formationSlotWorld(
  anchor: Vec3,
  orbitAngle: number,
  orbitRadius: number,
  orbitHeight: number,
  slotIndex: number,
  spacing = 8,
  out: Vec3 = v3(),
): Vec3 {
  const side = ((slotIndex % 2) * 2 - 1) * Math.ceil(slotIndex / 2);
  const along = Math.floor(slotIndex / 2) * spacing * 0.35;
  const c = Math.cos(orbitAngle);
  const s = Math.sin(orbitAngle);
  const lx = side * spacing * 0.55;
  const lz = along;
  out.x = anchor.x + lx * c - lz * s + Math.cos(orbitAngle) * orbitRadius * 0.15;
  out.y = orbitHeight + slotIndex * 0.35;
  out.z = anchor.z + lx * s + lz * c + Math.sin(orbitAngle) * orbitRadius * 0.15;
  return out;
}
