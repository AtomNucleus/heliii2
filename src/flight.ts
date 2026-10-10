export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface FlightInput {
  forward: number;
  turn: number;
  lift: number;
  boost: boolean;
}
export interface Obstacle {
  min: Vec3;
  max: Vec3;
}
export interface FlightState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  headingTarget: number;
  yawRate: number;
  pitch: number;
  bank: number;
  pitchRate: number;
  bankRate: number;
  time: number;
  collective: number;
  rotorRpm: number;
  altitudeIntegral: number;
  targetAltitude: number;
  integrity: number;
  impactCooldown: number;
  grounded: boolean;
}
export const STEP = 1 / 120;
export const GRAVITY = 9.81;
export const ROTOR_RADIUS = 4.25;
export const HUB_HEIGHT = 1.84;
export const SKID_HEIGHT = 1.4;
export const neutralInput: FlightInput = { forward: 0, turn: 0, lift: 0, boost: false };
export interface Wind {
  x: number;
  z: number;
  gust: number;
}
export const calm: Wind = { x: 0, z: 0, gust: 0 };
export const coastalWind: Wind = { x: 1.8, z: -0.8, gust: 1.6 };
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));
export const speedOf = (state: FlightState) => Math.hypot(state.velocity.x, state.velocity.z);
export function groundEffect(rotorHeight: number): number {
  const z = Math.max(0.6 * ROTOR_RADIUS, rotorHeight);
  return 1 / (1 - (ROTOR_RADIUS / (4 * z)) ** 2);
}
export function translationalLift(airspeed: number): number {
  return 1 + 0.1 * smoothstep(4, 12, airspeed);
}
export function windAt(wind: Wind, time: number, position: Vec3): Vec3 {
  const phase = position.x * 0.013 + position.z * 0.017;
  const a = Math.sin(time * 0.73 + phase);
  const b = Math.sin(time * 1.17 - phase * 1.3 + 1.7);
  const c = Math.sin(time * 1.91 + phase * 0.7 + 3.1);
  const gustX = (a + b + c) / 3;
  const gustZ =
    (Math.sin(time * 0.83 - phase + 2.1) +
      Math.sin(time * 1.39 + phase * 1.2) +
      Math.sin(time * 2.03 - phase * 0.6 + 0.8)) /
    3;
  return {
    x: wind.x + wind.gust * gustX,
    y: wind.gust * 0.25 * Math.sin(time * 0.61 + phase * 0.8),
    z: wind.z + wind.gust * gustZ,
  };
}

function noiseHash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return (value - Math.floor(value)) * 2 - 1;
}
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smoothstep(0, 1, x - ix),
    fz = smoothstep(0, 1, z - iz);
  const a = noiseHash(ix, iz),
    b = noiseHash(ix + 1, iz),
    c = noiseHash(ix, iz + 1),
    d = noiseHash(ix + 1, iz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

export const islands = [
  { x: -40, z: 25, rx: 100, rz: 105, height: 3.2, peakX: -67, peakZ: 24, peak: 15 },
  { x: 150, z: -170, rx: 92, rz: 120, height: 5, peakX: 187, peakZ: -180, peak: 30 },
  { x: -150, z: -240, rx: 115, rz: 85, height: 4, peakX: -184, peakZ: -247, peak: 24 },
  { x: 25, z: -450, rx: 140, rz: 94, height: 7, peakX: 12, peakZ: -476, peak: 36 },
];
const terrainStructures = [
  [0, 45, 25],
  [-22, 40, 25],
  [-29, 31.9, 12],
  [-26.4, 31.9, 12],
  [-23.8, 31.9, 12],
  [-21.2, 31.9, 12],
  [-18.6, 31.9, 12],
  [-16, 31.9, 12],
  [122, -205, 12],
  [-155, -210, 12],
  [-126, -260, 12],
  [55, -435, 12],
  [126, -259, 12],
];
export function islandHeight(x: number, z: number, island: (typeof islands)[number]): number {
  const dx = (x - island.x) / island.rx,
    dz = (z - island.z) / island.rz;
  const angle = Math.atan2(dz, dx);
  const edge = 1 + Math.sin(angle * 5 + island.x) * 0.045 + Math.cos(angle * 3) * 0.04;
  const r = Math.hypot(dx, dz) / edge;
  if (r >= 1) return -1.5;
  const coast = clamp((1 - r) / 0.22, 0, 1);
  const h =
    island.height +
    Math.exp(-((x - island.peakX) ** 2 + (z - island.peakZ) ** 2) / 650) * island.peak;
  const base = -1.5 + (h + 1.5) * coast * coast * (3 - 2 * coast);
  const structureFade = Math.min(
    1,
    ...terrainStructures.map(([sx, sz, radius]) =>
      smoothstep(radius, radius + 9, Math.hypot(x - sx, z - sz)),
    ),
  );
  const detail =
    (valueNoise(x * 0.09 + island.x, z * 0.09 + island.z) * 0.55 +
      valueNoise(x * 0.19 - island.z, z * 0.19 + island.x) * 0.3 +
      valueNoise(x * 0.38 + island.x * 0.7, z * 0.38 - island.z * 0.7) * 0.15) *
    0.8 *
    smoothstep(0, 0.16, coast) *
    structureFade;
  return base + detail;
}
export function terrainHeight(x: number, z: number): number {
  return Math.max(0, ...islands.map((island) => islandHeight(x, z, island)));
}
export function createFlight(): FlightState {
  const y = terrainHeight(0, 45) + 6;
  return {
    position: { x: 0, y, z: 45 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    headingTarget: 0,
    yawRate: 0,
    pitch: 0,
    bank: 0,
    pitchRate: 0,
    bankRate: 0,
    time: 0,
    collective: 1 / (1 - y * 0.00009),
    rotorRpm: 1,
    altitudeIntegral: 0,
    targetAltitude: y,
    integrity: 100,
    impactCooldown: 0,
    grounded: false,
  };
}

function impact(state: FlightState, amount: number): number {
  if (state.impactCooldown > 0 || amount < 3) return 0;
  const damage = clamp(amount, 3, 65);
  state.integrity = Math.max(0, state.integrity - damage);
  state.impactCooldown = 0.65;
  return damage;
}

export function stepFlight(
  state: FlightState,
  input: FlightInput,
  dt: number,
  obstacles: readonly Obstacle[] = [],
  sensitivity = 1,
  wind: Wind = calm,
): number {
  dt = clamp(dt, 0, 1 / 30);
  state.impactCooldown = Math.max(0, state.impactCooldown - dt);
  const forward = clamp(input.forward, -1, 1),
    turn = clamp(input.turn, -1, 1),
    lift = clamp(input.lift, -1, 1);
  state.time += dt;
  const gust = windAt(wind, state.time, state.position);
  const airVelocity = {
    x: state.velocity.x - gust.x,
    y: state.velocity.y - gust.y,
    z: state.velocity.z - gust.z,
  };
  const f = { x: -Math.sin(state.yaw), z: -Math.cos(state.yaw) };
  const r = { x: Math.cos(state.yaw), z: -Math.sin(state.yaw) };
  const groundVelForward = state.velocity.x * f.x + state.velocity.z * f.z;
  const groundVelRight = state.velocity.x * r.x + state.velocity.z * r.z;
  const airspeed = Math.hypot(airVelocity.x, airVelocity.z);
  const windForward = gust.x * f.x + gust.z * f.z;
  const windRight = gust.x * r.x + gust.z * r.z;
  const speed = speedOf(state);
  let targetPitch =
    Math.abs(forward) < 0.01
      ? clamp(groundVelForward * 0.03 + windForward * 0.004, -0.3, 0.3)
      : -forward * (input.boost && forward > 0 ? 0.42 : 0.3);
  let targetBank = turn * Math.min(0.45, 0.02 + speed * 0.009);
  if (Math.abs(turn) < 0.01)
    targetBank += clamp(-groundVelRight * 0.03 - windRight * 0.09, -0.25, 0.25);
  const gustVariation =
    wind.gust *
    (Math.sin(state.time * 1.13 + state.position.x * 0.03) -
      Math.sin((state.time - dt) * 1.13 + state.position.x * 0.03));
  state.pitchRate +=
    (16 * (targetPitch - state.pitch) - 8 * state.pitchRate + gustVariation * 0.08) * dt;
  state.bankRate +=
    (16 * (targetBank - state.bank) - 8 * state.bankRate - gustVariation * 0.06) * dt;
  state.pitch += state.pitchRate * dt;
  state.bank += state.bankRate * dt;
  const turnRate = -turn * sensitivity * (1.3 - Math.min(speed / 140, 0.35)) * 0.75;
  if (Math.abs(turn) > 0.01) state.headingTarget = state.yaw;
  const headingHoldError = Math.atan2(
    Math.sin(state.headingTarget - state.yaw),
    Math.cos(state.headingTarget - state.yaw),
  );
  const headingHold = Math.abs(turn) < 0.01 ? headingHoldError * 4 : 0;
  const desiredHeading = Math.atan2(-airVelocity.x, -airVelocity.z);
  const headingError = Math.atan2(
    Math.sin(desiredHeading - state.yaw),
    Math.cos(desiredHeading - state.yaw),
  );
  const weathervane = headingError * 0.35 * smoothstep(12, 30, airspeed);
  state.yawRate = damp(state.yawRate, turnRate + weathervane + headingHold, 4, dt);
  state.yaw += state.yawRate * dt;
  if (Math.abs(turn) > 0.01) state.headingTarget = state.yaw;
  const terrain = terrainHeight(state.position.x, state.position.z);
  const ground = terrain + SKID_HEIGHT;
  state.targetAltitude = clamp(
    state.targetAltitude + lift * (input.boost ? 15 : 10) * dt,
    SKID_HEIGHT,
    160,
  );
  const desiredY = Math.max(ground, state.targetAltitude);
  const altitudeError = desiredY - state.position.y;
  state.altitudeIntegral = clamp(state.altitudeIntegral + altitudeError * dt * 1.5, -4, 4);
  const climbFeedForward = Math.max(0, lift) * 9 * clamp((160 - state.targetAltitude) / 15, 0, 1);
  const commandedAcceleration = clamp(
    altitudeError * 8 - state.velocity.y * 5 + state.altitudeIntegral * 0.2 + climbFeedForward,
    -7,
    9,
  );
  const density = 1 - state.position.y * 0.00009;
  const estimate = state.rotorRpm ** 2 * density;
  const collectiveCommand = clamp(
    (GRAVITY + commandedAcceleration) /
      (GRAVITY * estimate * Math.max(0.6, Math.cos(state.pitch) * Math.cos(state.bank))),
    0.15,
    1.95,
  );
  state.collective = damp(state.collective, collectiveCommand, 9, dt);
  const rotorHeight = state.position.y + HUB_HEIGHT - Math.max(0, terrain);
  const thrust =
    GRAVITY *
    state.collective *
    state.rotorRpm ** 2 *
    density *
    groundEffect(rotorHeight) *
    translationalLift(airspeed);
  const liftForward = thrust * Math.sin(-state.pitch);
  const liftRight = thrust * Math.sin(state.bank) * Math.cos(state.pitch);
  const liftVertical = thrust * Math.cos(state.pitch) * Math.cos(state.bank);
  const airForward = airVelocity.x * f.x + airVelocity.z * f.z;
  const airRight = airVelocity.x * r.x + airVelocity.z * r.z;
  const dragForward =
    -(0.035 + 0.0011 * Math.hypot(airVelocity.x, airVelocity.y, airVelocity.z)) * airForward;
  const dragRight =
    -(0.9 + 0.004 * Math.hypot(airVelocity.x, airVelocity.y, airVelocity.z)) * airRight;
  const dragVertical = -0.3 * airVelocity.y;
  state.velocity.x +=
    (liftForward * f.x + liftRight * r.x + dragForward * f.x + dragRight * r.x) * dt;
  state.velocity.z +=
    (liftForward * f.z + liftRight * r.z + dragForward * f.z + dragRight * r.z) * dt;
  state.velocity.y += (liftVertical - GRAVITY + dragVertical) * dt;
  state.rotorRpm = damp(state.rotorRpm, 1 - 0.05 * Math.max(0, state.collective - 1.05), 2, dt);
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;
  let damage = 0;
  const surface = terrainHeight(state.position.x, state.position.z) + SKID_HEIGHT;
  state.grounded = state.position.y <= surface + 0.1;
  if (state.position.y < surface) {
    damage += impact(state, Math.max(0, -state.velocity.y - 3) * 6 + Math.max(0, speed - 8) * 1.4);
    state.position.y = surface;
    state.velocity.y = Math.max(0, state.velocity.y * -0.12);
    state.velocity.x *= Math.exp(-3 * dt);
    state.velocity.z *= Math.exp(-3 * dt);
    if (lift < 0) {
      state.targetAltitude = surface;
      state.altitudeIntegral = 0;
    }
  }
  const radius = 1.65;
  for (const box of obstacles) {
    const p = state.position;
    if (
      p.x < box.min.x - radius ||
      p.x > box.max.x + radius ||
      p.y < box.min.y - radius ||
      p.y > box.max.y + radius ||
      p.z < box.min.z - radius ||
      p.z > box.max.z + radius
    )
      continue;
    const faces = [
      {
        distance: p.x - (box.min.x - radius),
        axis: 'x' as const,
        value: box.min.x - radius,
        normal: -1,
      },
      {
        distance: box.max.x + radius - p.x,
        axis: 'x' as const,
        value: box.max.x + radius,
        normal: 1,
      },
      {
        distance: p.y - (box.min.y - radius),
        axis: 'y' as const,
        value: box.min.y - radius,
        normal: -1,
      },
      {
        distance: box.max.y + radius - p.y,
        axis: 'y' as const,
        value: box.max.y + radius,
        normal: 1,
      },
      {
        distance: p.z - (box.min.z - radius),
        axis: 'z' as const,
        value: box.min.z - radius,
        normal: -1,
      },
      {
        distance: box.max.z + radius - p.z,
        axis: 'z' as const,
        value: box.max.z + radius,
        normal: 1,
      },
    ];
    faces.sort((a, b) => a.distance - b.distance);
    const face = faces[0],
      velocity = state.velocity[face.axis];
    state.position[face.axis] = face.value;
    if (velocity * face.normal < 0) {
      damage += impact(state, Math.abs(velocity) * 2.5);
      state.velocity[face.axis] = -velocity * 0.25;
    }
  }
  const range = Math.hypot(state.position.x, state.position.z + 190);
  if (range > 850) {
    const nx = state.position.x / range,
      nz = (state.position.z + 190) / range;
    state.position.x = nx * 850;
    state.position.z = nz * 850 - 190;
    const outward = state.velocity.x * nx + state.velocity.z * nz;
    if (outward > 0) {
      state.velocity.x -= outward * nx;
      state.velocity.z -= outward * nz;
    }
  }
  return damage;
}

export const course = [
  { x: 0, y: 17, z: -55, name: 'Into the blue' },
  { x: 100, y: 25, z: -135, name: 'The eastern shore' },
  { x: 140, y: 28, z: -285, name: 'Lighthouse approach' },
  { x: 40, y: 45, z: -390, name: 'Above the headland' },
  { x: -95, y: 32, z: -340, name: 'The long way home' },
  { x: -145, y: 24, z: -170, name: 'Island hopping' },
  { x: -70, y: 20, z: -45, name: 'Homeward bound' },
  { x: 0, y: 15, z: 40, name: 'One perfect finish' },
];
export function segmentHitsRing(a: Vec3, b: Vec3, index: number): boolean {
  const ring = course[index];
  if (!ring) return false;
  const previous = index ? course[index - 1] : { x: 0, y: 9, z: 45 };
  const nx = ring.x - previous.x,
    nz = ring.z - previous.z;
  const da = (a.x - ring.x) * nx + (a.z - ring.z) * nz;
  const db = (b.x - ring.x) * nx + (b.z - ring.z) * nz;
  if (da === db || da * db > 0) return false;
  const t = da / (da - db);
  const x = a.x + (b.x - a.x) * t - ring.x;
  const y = a.y + (b.y - a.y) * t - ring.y;
  const z = a.z + (b.z - a.z) * t - ring.z;
  return x * x + y * y + z * z < 8.3 ** 2;
}
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
