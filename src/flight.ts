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
  yawRate: number;
  pitch: number;
  bank: number;
  targetAltitude: number;
  integrity: number;
  impactCooldown: number;
  grounded: boolean;
}
export const STEP = 1 / 120;
export const neutralInput: FlightInput = { forward: 0, turn: 0, lift: 0, boost: false };
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));
export const speedOf = (state: FlightState) => Math.hypot(state.velocity.x, state.velocity.z);

export const islands = [
  { x: -40, z: 25, rx: 100, rz: 105, height: 3.2, peakX: -67, peakZ: 24, peak: 15 },
  { x: 150, z: -170, rx: 92, rz: 120, height: 5, peakX: 187, peakZ: -180, peak: 30 },
  { x: -150, z: -240, rx: 115, rz: 85, height: 4, peakX: -184, peakZ: -247, peak: 24 },
  { x: 25, z: -450, rx: 140, rz: 94, height: 7, peakX: 12, peakZ: -476, peak: 36 },
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
  return -1.5 + (h + 1.5) * coast * coast * (3 - 2 * coast);
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
    yawRate: 0,
    pitch: 0,
    bank: 0,
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
): number {
  dt = clamp(dt, 0, 1 / 30);
  state.impactCooldown = Math.max(0, state.impactCooldown - dt);
  const forward = clamp(input.forward, -1, 1),
    turn = clamp(input.turn, -1, 1),
    lift = clamp(input.lift, -1, 1);
  const speed = speedOf(state);
  state.yawRate = damp(
    state.yawRate,
    -turn * sensitivity * (1.3 - Math.min(speed / 140, 0.35)),
    5,
    dt,
  );
  state.yaw += state.yawRate * dt;
  const acceleration = input.boost && forward > 0 ? 37 : 22;
  state.velocity.x += -Math.sin(state.yaw) * forward * acceleration * dt;
  state.velocity.z += -Math.cos(state.yaw) * forward * acceleration * dt;
  const drag = 0.22 + speed * 0.0055 + (Math.abs(forward) < 0.01 ? 0.75 : 0);
  state.velocity.x *= Math.exp(-drag * dt);
  state.velocity.z *= Math.exp(-drag * dt);
  const ground = terrainHeight(state.position.x, state.position.z) + 1.4;
  state.targetAltitude = clamp(
    state.targetAltitude + lift * (input.boost ? 15 : 10) * dt,
    1.4,
    160,
  );
  // A critically damped altitude servo models assisted collective without frame-dependent impulses.
  const desiredY = Math.max(ground, state.targetAltitude);
  const verticalAcceleration = clamp(
    (desiredY - state.position.y) * 9 - state.velocity.y * 6,
    -24,
    24,
  );
  state.velocity.y += verticalAcceleration * dt;
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;
  state.pitch = damp(state.pitch, -forward * (input.boost ? 0.25 : 0.16), 4, dt);
  state.bank = damp(state.bank, turn * Math.min(0.36, 0.12 + speed * 0.006), 4, dt);
  let damage = 0;
  const surface = terrainHeight(state.position.x, state.position.z) + 1.4;
  state.grounded = state.position.y <= surface + 0.1;
  if (state.position.y < surface) {
    damage += impact(state, Math.max(0, -state.velocity.y - 3) * 6 + Math.max(0, speed - 8) * 1.4);
    state.position.y = surface;
    state.velocity.y = Math.max(0, state.velocity.y * -0.12);
    state.velocity.x *= Math.exp(-3 * dt);
    state.velocity.z *= Math.exp(-3 * dt);
    if (lift < 0) state.targetAltitude = surface;
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
