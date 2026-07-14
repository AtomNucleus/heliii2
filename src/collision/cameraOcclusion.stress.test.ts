/**
 * Adversarial multi-frame stress tests for chase-camera wall / map-edge clipping.
 * Run: npx tsx --test src/collision/cameraOcclusion.stress.test.ts
 *
 * Asserts every frame that the FINAL camera.position sphere (CAMERA_OCCLUSION.radius)
 * never penetrates any solid AABB and never rests past the map rim.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpatialHash, WorldCollision, CAMERA_OCCLUSION, sphereVsAABB } from './index';
import {
  createChaseCameraState,
  updateChaseCamera,
  triggerCameraShake,
  addShake,
  type ChaseCameraOcclusion,
  type ChaseCameraState,
} from '../helicopter/chaseCamera';

const EPSILON = 0.002;
const HALF_EXTENT = 100;
const MAX_SPEED = 70;

interface WallSpec {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  tag?: string;
}

interface FrameFailure {
  scenario: string;
  frame: number;
  kind: 'solid' | 'rim';
  position: { x: number; y: number; z: number };
  detail: string;
}

interface ScenarioResult {
  scenario: string;
  frames: number;
  failures: FrameFailure[];
}

const _normal = new THREE.Vector3();

function checkCameraSafe(
  scenario: string,
  frame: number,
  camera: THREE.PerspectiveCamera,
  hash: SpatialHash,
  halfExtent: number | null,
  failures: FrameFailure[],
): void {
  const pos = camera.position;
  const radius = CAMERA_OCCLUSION.radius;

  for (const box of hash.all()) {
    if (!box.active) continue;
    const hit = sphereVsAABB(pos.x, pos.y, pos.z, radius, box, _normal);
    if (hit.hit && hit.penetration > EPSILON) {
      failures.push({
        scenario,
        frame,
        kind: 'solid',
        position: { x: pos.x, y: pos.y, z: pos.z },
        detail: `penetration=${hit.penetration.toFixed(4)} into AABB id=${box.id} tag=${box.tag ?? ''} [${box.minX.toFixed(1)},${box.minY.toFixed(1)},${box.minZ.toFixed(1)} → ${box.maxX.toFixed(1)},${box.maxY.toFixed(1)},${box.maxZ.toFixed(1)}]`,
      });
      // One solid failure per frame is enough signal
      break;
    }
  }

  if (halfExtent !== null) {
    const pastX = Math.abs(pos.x) > halfExtent + 0.01;
    const pastZ = Math.abs(pos.z) > halfExtent + 0.01;
    if (pastX || pastZ) {
      failures.push({
        scenario,
        frame,
        kind: 'rim',
        position: { x: pos.x, y: pos.y, z: pos.z },
        detail: `past rim halfExtent=${halfExtent} (|x|=${Math.abs(pos.x).toFixed(3)}, |z|=${Math.abs(pos.z).toFixed(3)})`,
      });
    }
  }
}

function makeWorld(
  walls: WallSpec[],
  opts: { halfExtent?: number; perimeter?: boolean; perimeterHeight?: number } = {},
): { hash: SpatialHash; collision: WorldCollision; halfExtent: number } {
  const halfExtent = opts.halfExtent ?? HALF_EXTENT;
  const hash = new SpatialHash([], 12);
  const collision = new WorldCollision(hash);
  for (const w of walls) {
    collision.registerCollider({
      minX: w.minX,
      minY: w.minY,
      minZ: w.minZ,
      maxX: w.maxX,
      maxY: w.maxY,
      maxZ: w.maxZ,
      kind: 'building',
      tag: w.tag ?? 'stress-wall',
    });
  }
  if (opts.perimeter) {
    collision.ensurePerimeterWalls(halfExtent, opts.perimeterHeight ?? 80);
  }
  return { hash, collision, halfExtent };
}

function makeOcclusion(
  collision: WorldCollision,
  cameraBound: number | undefined,
): ChaseCameraOcclusion {
  return {
    resolve(pivot, desired) {
      const result = collision.resolveCameraPosition(pivot, desired, cameraBound);
      return result.hit;
    },
  };
}

function simulate(
  scenario: string,
  opts: {
    walls: WallSpec[];
    heli0: THREE.Vector3;
    yaw0?: number;
    pitch0?: number;
    roll0?: number;
    vel0?: THREE.Vector3;
    speed0?: number;
    boosting?: boolean;
    perimeter?: boolean;
    perimeterHeight?: number;
    halfExtent?: number;
    /**
     * Pass cameraBound into resolveCameraPosition.
     * Defaults to halfExtent. Use `false` to skip the clamp entirely.
     */
    cameraBound?: number | false;
    /** When true, rim check uses halfExtent; when false, skip rim assert. */
    assertRim?: boolean;
    frames: number;
    dt: number | ((frame: number) => number);
    onFrame?: (ctx: {
      frame: number;
      heli: THREE.Vector3;
      velocity: THREE.Vector3;
      yaw: number;
      pitch: number;
      roll: number;
      speed: number;
      boosting: boolean;
      state: ChaseCameraState;
      camera: THREE.PerspectiveCamera;
    }) => {
      yaw?: number;
      pitch?: number;
      roll?: number;
      speed?: number;
      boosting?: boolean;
      heli?: THREE.Vector3;
      velocity?: THREE.Vector3;
    } | void;
    beforeUpdate?: (ctx: {
      frame: number;
      state: ChaseCameraState;
      camera: THREE.PerspectiveCamera;
    }) => void;
    seedCamSmooth?: THREE.Vector3;
  },
): ScenarioResult {
  const { hash, collision, halfExtent } = makeWorld(opts.walls, {
    halfExtent: opts.halfExtent,
    perimeter: opts.perimeter,
    perimeterHeight: opts.perimeterHeight,
  });

  const bound =
    opts.cameraBound === false ? undefined : (opts.cameraBound ?? halfExtent);

  const occlusion = makeOcclusion(collision, bound);
  const heli = opts.heli0.clone();
  const velocity = (opts.vel0 ?? new THREE.Vector3()).clone();
  let yaw = opts.yaw0 ?? 0;
  let pitch = opts.pitch0 ?? 0;
  let roll = opts.roll0 ?? 0;
  let speed = opts.speed0 ?? 0;
  let boosting = opts.boosting ?? false;

  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 500);
  const state = createChaseCameraState(heli);
  if (opts.seedCamSmooth) {
    state.camSmooth.copy(opts.seedCamSmooth);
  }

  const failures: FrameFailure[] = [];
  const assertRim =
    opts.assertRim ?? (Boolean(opts.perimeter) || opts.cameraBound !== undefined);

  for (let frame = 0; frame < opts.frames; frame++) {
    const dt = typeof opts.dt === 'function' ? opts.dt(frame) : opts.dt;

    if (opts.beforeUpdate) {
      opts.beforeUpdate({ frame, state, camera });
    }

    if (opts.onFrame) {
      const patch = opts.onFrame({
        frame,
        heli,
        velocity,
        yaw,
        pitch,
        roll,
        speed,
        boosting,
        state,
        camera,
      });
      if (patch) {
        if (patch.yaw !== undefined) yaw = patch.yaw;
        if (patch.pitch !== undefined) pitch = patch.pitch;
        if (patch.roll !== undefined) roll = patch.roll;
        if (patch.speed !== undefined) speed = patch.speed;
        if (patch.boosting !== undefined) boosting = patch.boosting;
        if (patch.heli) heli.copy(patch.heli);
        if (patch.velocity) velocity.copy(patch.velocity);
      }
    }

    updateChaseCamera(
      state,
      camera,
      heli,
      velocity,
      yaw,
      pitch,
      roll,
      speed,
      boosting,
      MAX_SPEED,
      dt,
      occlusion,
    );

    checkCameraSafe(
      scenario,
      frame,
      camera,
      hash,
      assertRim ? halfExtent : null,
      failures,
    );
  }

  return { scenario, frames: opts.frames, failures };
}

function formatFailures(failures: FrameFailure[]): string {
  if (failures.length === 0) return '(none)';
  const head = failures.slice(0, 12);
  return head
    .map(
      (f) =>
        `[${f.scenario} frame=${f.frame} ${f.kind}] pos=(${f.position.x.toFixed(3)}, ${f.position.y.toFixed(3)}, ${f.position.z.toFixed(3)}) ${f.detail}`,
    )
    .join('\n') + (failures.length > 12 ? `\n... +${failures.length - 12} more` : '');
}

describe('camera occlusion adversarial stress', () => {
  it('1. rapid yaw spin (full 360 in ~1.5s) hovering 6m in front of a tall wall', () => {
    // Wall south of heli; hover facing +Z initially, spin so chase arm sweeps into wall
    const heli = new THREE.Vector3(0, 10, 0);
    // Near face of wall at z = -6 (6m in front when looking -Z / yaw=π)
    const wall: WallSpec = {
      minX: -20,
      minY: 0,
      minZ: -10,
      maxX: 20,
      maxY: 40,
      maxZ: -6,
    };
    const duration = 1.5;
    const dt = 1 / 60;
    const frames = Math.ceil(duration / dt);
    const yawRate = (Math.PI * 2) / duration;

    const result = simulate('rapid-yaw-spin', {
      walls: [wall],
      heli0: heli,
      yaw0: 0,
      frames,
      dt,
      onFrame({ frame }) {
        return { yaw: frame * dt * yawRate };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `rapid yaw spin leaked camera into solids:\n${formatFailures(result.failures)}`,
    );
  });

  it('2. fast backward flight into a wall (camera between heli and wall, arm → 0)', () => {
    // Facing +Z (yaw=0): chase camera trails on -Z. Heli flies -Z toward a wall so the
    // lens sits between craft and geometry while the arm compresses hard.
    // Keep pivot outside the camera-sphere clearance of the near face (otherwise t→0
    // places the lens at an already-penetrating pivot — unsatisfiable on-arm).
    const wall: WallSpec = {
      minX: -12,
      minY: 0,
      minZ: -30,
      maxX: 12,
      maxY: 28,
      maxZ: -22,
    };
    const heli0 = new THREE.Vector3(0, 10, 8);
    const dt = 1 / 60;
    const frames = 200;
    const backSpeed = 32;
    // Near face -22; keep heli.z >= -22 + radius + margin
    const stopZ = -20.4; // barely clear of radius 1.5 vs near face -22

    const result = simulate('backward-into-wall', {
      walls: [wall],
      heli0,
      yaw0: 0,
      vel0: new THREE.Vector3(0, 0, -backSpeed),
      speed0: backSpeed,
      frames,
      dt,
      // Seed far behind / through the wall so lag must recover without tunneling
      seedCamSmooth: new THREE.Vector3(0, 18, -42),
      onFrame({ frame, heli }) {
        const t = frame * dt;
        const z = Math.max(stopZ, 8 - backSpeed * t);
        heli.set(0, 10, z);
        const stopped = z <= stopZ;
        return {
          heli,
          velocity: new THREE.Vector3(0, 0, stopped ? 0 : -backSpeed),
          speed: stopped ? 0 : backSpeed,
        };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `backward into wall leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('3. heavy camera shake while pressed against a wall', () => {
    const wall: WallSpec = {
      minX: -10,
      minY: 0,
      minZ: -18,
      maxX: 10,
      maxY: 30,
      maxZ: -12,
    };
    // Face the wall (yaw=π → forward -Z); sit close so occlusion is high and shake is scaled
    const heli = new THREE.Vector3(0, 10, -9.5);
    const dt = 1 / 60;
    const frames = 150;

    const result = simulate('heavy-shake-against-wall', {
      walls: [wall],
      heli0: heli,
      yaw0: Math.PI,
      frames,
      dt,
      beforeUpdate({ frame, state }) {
        if (frame === 20) {
          triggerCameraShake(state, 1);
          addShake(state.shake, 1);
        }
        if (frame > 20 && frame % 8 === 0) {
          addShake(state.shake, 1);
        }
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `shake against wall leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('4. thin wall (0.5 thick) between pivot and desired; heli moves parallel', () => {
    // Thin slab at z=-8..-7.5; heli at z=0 moving along +X; yaw=π so arm goes -Z through slab
    const wall: WallSpec = {
      minX: -40,
      minY: 0,
      minZ: -8,
      maxX: 40,
      maxY: 26,
      maxZ: -7.5,
    };
    const dt = 1 / 60;
    const frames = 240;
    const parallelSpeed = 12;

    const result = simulate('thin-wall-parallel', {
      walls: [wall],
      heli0: new THREE.Vector3(-20, 10, 0),
      yaw0: Math.PI,
      vel0: new THREE.Vector3(parallelSpeed, 0, 0),
      speed0: parallelSpeed,
      frames,
      dt,
      onFrame({ frame, heli }) {
        const x = -20 + parallelSpeed * frame * dt;
        heli.set(x, 10, 0);
        return { heli, speed: parallelSpeed, velocity: new THREE.Vector3(parallelSpeed, 0, 0) };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `thin wall parallel leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('5. map-edge: heli hugging rim, yaw sweep past perimeter with ensurePerimeterWalls', () => {
    const half = 100;
    const heli0 = new THREE.Vector3(half - 8, 10, 0); // near +X rim
    const duration = 2.0;
    const dt = 1 / 60;
    const frames = Math.ceil(duration / dt);
    const yawRate = (Math.PI * 2) / duration;

    const result = simulate('map-edge-yaw-sweep', {
      walls: [],
      heli0,
      yaw0: -Math.PI / 2, // facing +X, camera toward -X initially... facing +X means forward=(1,0,0), back=(-1,0,0)
      perimeter: true,
      perimeterHeight: 80,
      halfExtent: half,
      cameraBound: half,
      assertRim: true,
      frames,
      dt,
      onFrame({ frame }) {
        // Sweep so desired camera frequently aims past +X rim
        return { yaw: -Math.PI / 2 + frame * dt * yawRate };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `map-edge yaw sweep leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('6. concave corner: two perpendicular walls; heli inside, yaw sweep', () => {
    const walls: WallSpec[] = [
      { minX: -2, minY: 0, minZ: -25, maxX: 25, maxY: 32, maxZ: -2 },
      { minX: -25, minY: 0, minZ: -2, maxX: -2, maxY: 32, maxZ: 25 },
    ];
    // Tight in the concave open quadrant
    const heli = new THREE.Vector3(4.5, 10, 4.5);
    const duration = 2.5;
    const dt = 1 / 60;
    const frames = Math.ceil(duration / dt);
    const yawRate = (Math.PI * 2) / duration;

    const result = simulate('concave-corner-yaw', {
      walls,
      heli0: heli,
      yaw0: (-3 * Math.PI) / 4,
      roll0: 0.35,
      frames,
      dt,
      onFrame({ frame }) {
        // Oscillate roll while sweeping yaw (bank lean into walls)
        const yaw = (-3 * Math.PI) / 4 + frame * dt * yawRate;
        const roll = 0.45 * Math.sin(frame * dt * 4.2);
        return { yaw, roll };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `corner yaw sweep leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('7. variable dt (1/240 ↔ 0.1) during rapid yaw spin against wall', () => {
    const wall: WallSpec = {
      minX: -20,
      minY: 0,
      minZ: -10,
      maxX: 20,
      maxY: 40,
      maxZ: -6,
    };
    const heli = new THREE.Vector3(0, 10, 0);
    const frames = 200;
    // Accumulate ~1.5s of yaw with alternating dt
    let simTime = 0;
    const yawRate = (Math.PI * 2) / 1.5;

    const result = simulate('variable-dt-yaw-spin', {
      walls: [wall],
      heli0: heli,
      yaw0: 0,
      frames,
      dt: (frame) => (frame % 2 === 0 ? 1 / 240 : 0.1),
      onFrame({ frame }) {
        const dt = frame % 2 === 0 ? 1 / 240 : 0.1;
        // Use previous frame's dt contribution — approximate with current
        const yaw = simTime * yawRate;
        simTime += dt;
        return { yaw };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `variable-dt yaw spin leaked camera:\n${formatFailures(result.failures)}`,
    );
  });

  it('8. camera above perimeter wall height (heli y=95 near rim) — horizontal clamp must hold', () => {
    const half = 100;
    const wallHeight = 80;
    const heli0 = new THREE.Vector3(half - 6, 95, 0);
    const duration = 2.0;
    const dt = 1 / 60;
    const frames = Math.ceil(duration / dt);
    const yawRate = (Math.PI * 2) / duration;

    const result = simulate('above-perimeter-wall-height', {
      walls: [],
      heli0,
      yaw0: -Math.PI / 2,
      perimeter: true,
      perimeterHeight: wallHeight,
      halfExtent: half,
      cameraBound: half,
      assertRim: true,
      frames,
      dt,
      onFrame({ frame }) {
        return { yaw: -Math.PI / 2 + frame * dt * yawRate };
      },
    });

    assert.equal(
      result.failures.length,
      0,
      `above-perimeter height rim clamp failed:\n${formatFailures(result.failures)}`,
    );
  });
});
