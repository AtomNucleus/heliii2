import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  course,
  calm,
  coastalWind,
  createFlight,
  formatTime,
  groundEffect,
  neutralInput,
  segmentHitsRing,
  speedOf,
  STEP,
  stepFlight,
  terrainHeight,
  translationalLift,
  windAt,
  type FlightInput,
} from './flight';
import { deadzone } from './controls';
import { parsePreferences } from './preferences';

function simulate(seconds: number, input: FlightInput = neutralInput, wind = calm) {
  const state = createFlight();
  for (let i = 0; i < seconds / STEP; i++) stepFlight(state, input, STEP, [], 1, wind);
  return state;
}
test('hover assist holds altitude without drift over a minute', () => {
  const state = simulate(60);
  assert.ok(Math.abs(state.position.y - createFlight().position.y) < 0.01);
  assert.ok(speedOf(state) < 1e-6);
});
test('tilted rotor thrust accelerates forward and boost raises terminal speed', () => {
  const forward = createFlight();
  forward.position.z = 0;
  for (let i = 0; i < 10 / STEP; i++) stepFlight(forward, { ...neutralInput, forward: 1 }, STEP);
  assert.ok(speedOf(forward) > 20 && speedOf(forward) < 45);
  assert.ok(forward.position.z < -100);
  assert.ok(forward.pitch < -0.2);
  const terminal = (boost: boolean) => {
    const state = createFlight();
    state.position = { x: 0, y: 80, z: -190 };
    state.targetAltitude = 80;
    for (let i = 0; i < 40 / STEP; i++)
      stepFlight(state, { ...neutralInput, forward: 1, turn: 0.25, boost }, STEP);
    return state;
  };
  const normal = terminal(false);
  const boost = terminal(true);
  assert.ok(speedOf(normal) > 32 && speedOf(normal) < 45);
  assert.ok(speedOf(boost) > speedOf(normal) * 1.15);
});
test('release transitions to a flare and settles to a stop', () => {
  const state = simulate(4, { ...neutralInput, forward: 1 }),
    before = speedOf(state),
    z = state.position.z;
  stepFlight(state, neutralInput, STEP);
  assert.ok(Math.abs(speedOf(state) - before) < before * 0.02);
  assert.ok(state.position.z < z);
  for (let i = 0; i < 1.5 / STEP; i++) stepFlight(state, neutralInput, STEP);
  assert.ok(state.pitch > 0.05);
  for (let i = 0; i < 18.5 / STEP; i++) stepFlight(state, neutralInput, STEP);
  assert.ok(speedOf(state) < 0.05);
});
test('positive turn input turns right and banks into the turn', () => {
  const state = simulate(1, { ...neutralInput, forward: 1, turn: 1 });
  assert.ok(state.yaw < 0);
  assert.ok(state.position.x > 0);
  assert.ok(state.bank > 0);
});
test('collective climbs then holds the new altitude', () => {
  const state = simulate(3, { ...neutralInput, lift: 1 });
  assert.ok(state.position.y > 30);
  const target = state.targetAltitude;
  for (let i = 0; i < 8 / STEP; i++) stepFlight(state, neutralInput, STEP);
  assert.ok(Math.abs(state.position.y - target) < 0.05);
});
test('altitude ceiling and gentle landing stay bounded', () => {
  const high = simulate(60, { ...neutralInput, lift: 1 });
  assert.ok(high.position.y <= 160.5);
  assert.equal(high.targetAltitude, 160);
  const low = simulate(8, { ...neutralInput, lift: -1 });
  assert.ok(low.position.y >= terrainHeight(low.position.x, low.position.z) + 1.4);
  assert.equal(low.integrity, 100);
});
test('obstacle collision separates the hull, rebounds, and throttles damage', () => {
  const state = createFlight();
  state.position = { x: 0, y: 12, z: 2 };
  state.targetAltitude = 12;
  state.velocity.z = -30;
  const obstacle = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 20, z: 0 } };
  let damage = 0;
  for (let i = 0; i < 8; i++) damage += stepFlight(state, neutralInput, STEP, [obstacle]);
  assert.ok(damage > 0);
  assert.ok(state.position.z >= 1.65);
  assert.ok(state.velocity.z > 0);
  assert.ok(state.integrity >= 35);
});
test('fixed timestep produces equivalent trajectories at 30, 60, and 144 render Hz', () => {
  const run = (hz: number) => {
    const state = createFlight();
    let accumulator = 0;
    for (let frame = 0; frame < hz * 6; frame++) {
      accumulator += 1 / hz;
      while (accumulator + 1e-10 >= STEP) {
        stepFlight(state, { forward: 1, turn: 0.15, lift: 0.1, boost: false }, STEP);
        accumulator -= STEP;
      }
    }
    return state;
  };
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(144));
  const runWind = (hz: number) => {
    const state = createFlight();
    let accumulator = 0;
    for (let frame = 0; frame < hz * 6; frame++) {
      accumulator += 1 / hz;
      while (accumulator + 1e-10 >= STEP) {
        stepFlight(
          state,
          { forward: 1, turn: 0.15, lift: 0.1, boost: false },
          STEP,
          [],
          1,
          coastalWind,
        );
        accumulator -= STEP;
      }
    }
    return state;
  };
  assert.deepEqual(runWind(30), runWind(60));
  assert.deepEqual(runWind(60), runWind(144));
});
test('ground effect and translational lift stay within realistic bounds', () => {
  assert.ok(groundEffect(3.24) > 1.08);
  assert.ok(groundEffect(25) < 1.01);
  assert.equal(translationalLift(0), 1);
  assert.ok(translationalLift(15) > 1.08);
});
test('hover collective trims lower in ground effect than out of ground effect', () => {
  const near = createFlight(),
    high = createFlight();
  near.position.y = terrainHeight(near.position.x, near.position.z) + 2;
  near.targetAltitude = near.position.y;
  high.position.y = 60;
  high.targetAltitude = 60;
  for (let i = 0; i < 30 / STEP; i++) {
    stepFlight(near, neutralInput, STEP);
    stepFlight(high, neutralInput, STEP);
  }
  assert.ok(near.collective < high.collective);
});
test('coastal wind is deterministic and induces a stable leaning hover', () => {
  const gust = windAt(coastalWind, 12.5, { x: 4, y: 8, z: -2 });
  assert.deepEqual(gust, windAt(coastalWind, 12.5, { x: 4, y: 8, z: -2 }));
  assert.deepEqual(windAt(calm, 12.5, { x: 4, y: 8, z: -2 }), { x: 0, y: 0, z: 0 });
  const start = createFlight(),
    state = simulate(30, neutralInput, coastalWind);
  assert.ok(Math.abs(state.position.y - start.position.y) < 0.3);
  assert.ok(
    Math.hypot(state.position.x - start.position.x, state.position.z - start.position.z) < 15,
  );
  assert.ok(Math.abs(state.pitch) + Math.abs(state.bank) > 0.01);
  assert.ok(Math.abs(state.yaw) < 0.02);
});
test('coastal wind causes only modest heading drift in forward flight', () => {
  const state = simulate(20, { ...neutralInput, forward: 1 }, coastalWind);
  assert.ok(Math.abs(state.yaw) < 0.08);
});
test('coastal forward flight reaches the first course ring', () => {
  const state = createFlight();
  let previous = { ...state.position },
    reached = false;
  for (let i = 0; i < 20 / STEP; i++) {
    stepFlight(state, { ...neutralInput, forward: 1 }, STEP, [], 1, coastalWind);
    if (segmentHitsRing(previous, state.position, 0)) {
      reached = true;
      break;
    }
    previous = { ...state.position };
  }
  assert.ok(reached);
});
test('checkpoint detection sweeps through the ring plane at high speed', () => {
  const ring = course[0];
  assert.equal(segmentHitsRing({ ...ring, z: ring.z + 25 }, { ...ring, z: ring.z - 25 }, 0), true);
  assert.equal(
    segmentHitsRing(
      { ...ring, x: ring.x + 10, z: ring.z + 25 },
      { ...ring, x: ring.x + 10, z: ring.z - 25 },
      0,
    ),
    false,
  );
});
test('being near a ring without crossing it does not count', () => {
  const ring = course[0];
  assert.equal(segmentHitsRing({ ...ring, z: ring.z + 2 }, { ...ring, z: ring.z + 1 }, 0), false);
  assert.equal(segmentHitsRing(ring, ring, 0), false);
});
test('all eight route rings are above terrain with flight clearance', () => {
  course.forEach((ring) => assert.ok(ring.y - 8.5 > terrainHeight(ring.x, ring.z) + 1.4));
});
test('world boundary prevents flying out of the navigable map', () => {
  const state = createFlight();
  state.position.x = 900;
  state.velocity.x = 30;
  stepFlight(state, neutralInput, STEP);
  assert.ok(Math.hypot(state.position.x, state.position.z + 190) <= 850.001);
});
test('gamepad deadzone rejects drift while preserving full stick range', () => {
  assert.equal(deadzone(0.1), 0);
  assert.equal(deadzone(-0.1), 0);
  assert.equal(deadzone(1), 1);
  assert.equal(deadzone(-1), -1);
});
test('stored settings reject malformed values and respect motion preference', () => {
  assert.equal(parsePreferences('invalid', true).reducedMotion, true);
  assert.equal(
    parsePreferences('{"volume":4,"sensitivity":0,"quality":"potato","bestTime":-2}').volume,
    1,
  );
  assert.equal(parsePreferences('{"sensitivity":0}').sensitivity, 0.5);
  assert.equal(parsePreferences('{"bestTime":-2}').bestTime, null);
  assert.equal(parsePreferences('null').quality, 'high');
});
test('valid settings and best time survive serialization', () => {
  const settings = parsePreferences(
    '{"volume":0.3,"muted":true,"sensitivity":1.2,"quality":"low","reducedMotion":true,"bestTime":95}',
  );
  assert.deepEqual(parsePreferences(JSON.stringify(settings)), settings);
});
test('flight clock formats minutes without wall-clock drift', () => {
  assert.equal(formatTime(65.8), '01:05');
  assert.equal(formatTime(-1), '00:00');
});
