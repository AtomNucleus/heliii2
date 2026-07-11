/**
 * Deterministic unit tests for combat AI pure logic.
 * Run: npx --yes tsx --test src/combat/ai/ai.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createRng,
  hashSeed,
  rngFloat,
  DRONE_ROLES,
  roleMixForCount,
  TURRET_MODES,
  turretModeMix,
  sweepYawOffset,
  buildFormation,
  slotWorldPosition,
  steerDrone,
  aimWithLead,
  shouldEvade,
  createTelegraphState,
  defaultTelegraphConfig,
  updateTelegraph,
  isTelegraphVisible,
  DifficultyDirector,
  reinforceWaveSize,
  placeFairPoints,
  planMissionEncounter,
  v3,
  distXZ,
} from './index';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it('hashSeed is stable', () => {
    assert.equal(hashSeed('heli-test'), hashSeed('heli-test'));
    assert.notEqual(hashSeed('heli-test'), hashSeed('heli-test-2'));
  });

  it('rngFloat stays in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const v = rngFloat(rng, 2, 5);
      assert.ok(v >= 2 && v < 5);
    }
  });
});

describe('roles & turrets', () => {
  it('role mix covers requested count with known roles', () => {
    const mix = roleMixForCount(8);
    assert.equal(mix.length, 8);
    for (const r of mix) assert.ok(r in DRONE_ROLES);
  });

  it('turret mix assigns distinct modes', () => {
    const mix = turretModeMix(8);
    assert.equal(mix.length, 8);
    const unique = new Set(mix);
    assert.ok(unique.size >= 3);
    for (const m of mix) assert.ok(m in TURRET_MODES);
  });

  it('sweep yaw offset is bounded and periodic', () => {
    const half = 0.5;
    for (let t = 0; t < 10; t += 0.25) {
      const o = sweepYawOffset(t, 2.8, half, 0);
      assert.ok(Math.abs(o) <= half + 1e-9);
    }
    assert.ok(
      Math.abs(sweepYawOffset(0, 2.8, half) - sweepYawOffset(2.8, 2.8, half)) < 1e-9,
    );
  });
});

describe('formations', () => {
  it('builds exact slot counts', () => {
    for (const kind of ['wedge', 'vic', 'line', 'diamond', 'circle'] as const) {
      const layout = buildFormation(kind, 5, 10);
      assert.equal(layout.slots.length, 5);
    }
  });

  it('slotWorldPosition rotates offsets', () => {
    const out = slotWorldPosition(v3(0, 10, 0), Math.PI / 2, v3(10, 0, 0));
    assert.ok(Math.abs(out.x) < 1e-9);
    assert.ok(Math.abs(out.z - 10) < 1e-9);
  });
});

describe('pursuit / evasion', () => {
  it('pursue moves closer when far', () => {
    const start = v3(0, 20, 0);
    const target = v3(40, 20, 0);
    const a = steerDrone({
      position: start,
      target,
      preferredRange: 20,
      moveSpeed: 1.2,
      pursuitWeight: 0.9,
      evadeWeight: 0.2,
      aggression: 0.8,
      underFire: false,
      dt: 0.5,
      time: 1,
      id: 1,
      orbitAngle: 0,
      orbitRadius: 12,
      orbitHeight: 20,
    });
    assert.equal(a.intent, 'pursue');
    assert.ok(distXZ(a.position, target) < distXZ(start, target));
  });

  it('underFire triggers evade for high evadeWeight', () => {
    const r = steerDrone({
      position: v3(10, 20, 0),
      target: v3(0, 20, 0),
      preferredRange: 25,
      moveSpeed: 1,
      pursuitWeight: 0.5,
      evadeWeight: 0.85,
      aggression: 0.5,
      underFire: true,
      dt: 0.2,
      time: 0,
      id: 2,
      orbitAngle: 0,
      orbitRadius: 12,
      orbitHeight: 20,
    });
    assert.equal(r.intent, 'evade');
  });

  it('shouldEvade respects health and range', () => {
    assert.equal(
      shouldEvade({
        healthRatio: 0.2,
        underFire: false,
        evadeWeight: 0.5,
        distToTarget: 40,
        preferredRange: 30,
      }),
      true,
    );
    assert.equal(
      shouldEvade({
        healthRatio: 1,
        underFire: false,
        evadeWeight: 0.5,
        distToTarget: 40,
        preferredRange: 30,
      }),
      false,
    );
  });

  it('aimWithLead produces unit-ish direction', () => {
    const dir = aimWithLead(v3(0, 0, 0), v3(10, 0, 0), v3(0, 0, 5), 0.4);
    const len = Math.hypot(dir.x, dir.y, dir.z);
    assert.ok(Math.abs(len - 1) < 0.05);
    assert.ok(dir.x > 0.5);
  });
});

describe('telegraph', () => {
  it('windup → fire → recover → idle', () => {
    let state = createTelegraphState();
    const cfg = defaultTelegraphConfig(0.3, 2, 0.05);
    let fired = 0;

    // start
    let r = updateTelegraph(state, cfg, 0.016, true);
    state = r.state;
    assert.equal(state.phase, 'windup');
    assert.equal(r.startedWindup, true);
    assert.ok(isTelegraphVisible(state));

    // finish windup
    r = updateTelegraph(state, cfg, 0.35, false);
    state = r.state;
    assert.equal(state.phase, 'fire');

    // collect shots
    for (let i = 0; i < 20; i++) {
      r = updateTelegraph(state, cfg, 0.05, false);
      state = r.state;
      if (r.fire) fired++;
    }
    assert.equal(fired, 2);
    assert.ok(state.phase === 'recover' || state.phase === 'idle');
  });
});

describe('difficulty director', () => {
  it('stays in grace early, then escalates with progress', () => {
    const d = new DifficultyDirector();
    let snap = d.update({
      dt: 0.5,
      elapsed: 2,
      healthRatio: 1,
      timeSinceDamage: 99,
      timeSinceKill: 99,
      kills: 0,
      primaryAlive: 4,
      primaryTotal: 4,
      aliveThreats: 6,
      combo: 0,
    });
    assert.equal(snap.beat, 'grace');
    assert.ok(snap.pressure < 0.35);
    assert.equal(snap.allowReinforce, false);

    // Advance past grace with progress
    for (let t = 0; t < 40; t++) {
      snap = d.update({
        dt: 0.5,
        elapsed: 15 + t * 0.5,
        healthRatio: 0.9,
        timeSinceDamage: 20,
        timeSinceKill: 5,
        kills: 3,
        primaryAlive: 2,
        primaryTotal: 4,
        aliveThreats: 4,
        combo: 2,
      });
    }
    assert.notEqual(snap.beat, 'grace');
    assert.ok(snap.pressure > 0.2);
  });

  it('breather when low health', () => {
    const d = new DifficultyDirector({ gracePeriod: 0 });
    // warm up
    for (let i = 0; i < 10; i++) {
      d.update({
        dt: 0.5,
        elapsed: 20 + i,
        healthRatio: 0.9,
        timeSinceDamage: 30,
        timeSinceKill: 2,
        kills: 4,
        primaryAlive: 2,
        primaryTotal: 4,
        aliveThreats: 5,
        combo: 1,
      });
    }
    const snap = d.update({
      dt: 0.5,
      elapsed: 40,
      healthRatio: 0.2,
      timeSinceDamage: 0.5,
      timeSinceKill: 10,
      kills: 4,
      primaryAlive: 2,
      primaryTotal: 4,
      aliveThreats: 5,
      combo: 0,
    });
    assert.equal(snap.beat, 'breather');
    assert.equal(snap.allowReinforce, false);
  });

  it('reinforceWaveSize respects budget', () => {
    assert.equal(reinforceWaveSize(0.9, 14, 16), 2);
    assert.equal(reinforceWaveSize(1, 16, 16), 0);
    assert.ok(reinforceWaveSize(0.5, 0, 10) >= 1);
  });
});

describe('fair spawning', () => {
  it('placeFairPoints keeps distance from player and peers', () => {
    const pts = placeFairPoints(5, {
      seed: 12345,
      mapHalf: 100,
      playerSpawn: v3(0, 0, 0),
      minPlayerDist: 30,
      minSeparation: 18,
      getGroundHeight: () => 0,
    });
    assert.equal(pts.length, 5);
    for (const p of pts) {
      assert.ok(distXZ(v3(p.x, 0, p.z), v3(0, 0, 0)) >= 30 - 1e-6);
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z);
        assert.ok(d >= 18 - 1e-6);
      }
    }
  });

  it('planMissionEncounter is deterministic', () => {
    const opts = {
      seed: 0xbeef,
      mapHalfExtent: 200,
      playerSpawn: v3(10, 0, -5),
      getGroundHeight: (x: number, z: number) => Math.sin(x * 0.01) + Math.cos(z * 0.01),
      depotCount: 4,
      turretCount: 8,
      droneCount: 8,
    };
    const a = planMissionEncounter(opts);
    const b = planMissionEncounter(opts);
    assert.equal(a.depots.length, b.depots.length);
    assert.equal(a.turrets.length, b.turrets.length);
    assert.equal(a.drones.length, b.drones.length);
    assert.deepEqual(
      a.drones.map((d) => d.role),
      b.drones.map((d) => d.role),
    );
    assert.deepEqual(
      a.turrets.map((t) => t.mode),
      b.turrets.map((t) => t.mode),
    );
    assert.ok(a.drones.some((d) => d.role === 'interceptor'));
    assert.ok(a.drones.some((d) => d.role === 'gunship'));
    assert.ok(a.turrets.some((t) => t.mode === 'burst'));
    assert.ok(a.formations.length >= 2);
  });
});
