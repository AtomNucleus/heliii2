import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateFragmentSlots,
  debrisPhysicsBudgetFromTier,
  estimateDebrisPhysicsPeak,
} from './budgets.ts';
import {
  createSeededRng,
  generateFragmentBurst,
} from './fragments.ts';
import {
  excessBodiesToCull,
  fragmentOpacity,
  shouldCullFragment,
} from './lifecycle.ts';

describe('allocateFragmentSlots', () => {
  it('respects maxPerBurst and free capacity', () => {
    assert.equal(allocateFragmentSlots(10, 0, { maxBodies: 40, maxPerBurst: 7 }), 7);
    assert.equal(allocateFragmentSlots(10, 38, { maxBodies: 40, maxPerBurst: 7 }), 2);
    assert.equal(allocateFragmentSlots(10, 40, { maxBodies: 40, maxPerBurst: 7 }), 0);
  });

  it('returns 0 for non-positive requests or budgets', () => {
    assert.equal(allocateFragmentSlots(0, 0, { maxBodies: 40, maxPerBurst: 7 }), 0);
    assert.equal(allocateFragmentSlots(5, 0, { maxBodies: 0, maxPerBurst: 7 }), 0);
    assert.equal(allocateFragmentSlots(5, 0, { maxBodies: 40, maxPerBurst: 0 }), 0);
  });
});

describe('debrisPhysicsBudgetFromTier', () => {
  it('scales caps by quality tier', () => {
    const low = debrisPhysicsBudgetFromTier('low');
    const high = debrisPhysicsBudgetFromTier('high');
    assert.ok(low.maxBodies < high.maxBodies);
    assert.ok(low.maxPerBurst < high.maxPerBurst);
    assert.equal(estimateDebrisPhysicsPeak(low), low.maxBodies);
  });
});

describe('generateFragmentBurst', () => {
  it('is deterministic with a seeded RNG', () => {
    const budget = { maxBodies: 40, maxPerBurst: 8 };
    const a = generateFragmentBurst(
      { origin: [1, 2, 3], impulse: 12, colorHint: 0xff0000 },
      budget,
      0,
      createSeededRng(42),
    );
    const b = generateFragmentBurst(
      { origin: [1, 2, 3], impulse: 12, colorHint: 0xff0000 },
      budget,
      0,
      createSeededRng(42),
    );
    assert.equal(a.length, b.length);
    assert.ok(a.length >= 2);
    assert.deepEqual(a[0].position, b[0].position);
    assert.deepEqual(a[0].linearVelocity, b[0].linearVelocity);
    assert.equal(a[0].color, 0xff0000);
  });

  it('honors active occupancy', () => {
    const budget = { maxBodies: 5, maxPerBurst: 10 };
    const specs = generateFragmentBurst(
      { origin: [0, 1, 0], impulse: 20 },
      budget,
      4,
      createSeededRng(7),
    );
    assert.equal(specs.length, 1);
  });
});

describe('shouldCullFragment', () => {
  const budget = debrisPhysicsBudgetFromTier('medium');

  it('culls on max life and max lifetime', () => {
    assert.equal(
      shouldCullFragment(
        { age: 2, maxLife: 1.5, speedSq: 10, sleeping: false, distanceSq: 0 },
        budget,
      ),
      true,
    );
    assert.equal(
      shouldCullFragment(
        {
          age: budget.maxLifetime + 0.1,
          maxLife: 99,
          speedSq: 10,
          sleeping: false,
          distanceSq: 0,
        },
        budget,
      ),
      true,
    );
  });

  it('culls sleeping / slow bodies after min life', () => {
    assert.equal(
      shouldCullFragment(
        {
          age: budget.minLifeBeforeSleepCull + 0.1,
          maxLife: 5,
          speedSq: budget.sleepSpeedSq * 0.5,
          sleeping: false,
          distanceSq: 0,
        },
        budget,
      ),
      true,
    );
    assert.equal(
      shouldCullFragment(
        {
          age: 0.1,
          maxLife: 5,
          speedSq: 0,
          sleeping: true,
          distanceSq: 0,
        },
        budget,
      ),
      false,
    );
  });

  it('culls by distance budget', () => {
    assert.equal(
      shouldCullFragment(
        {
          age: 0.2,
          maxLife: 5,
          speedSq: 40,
          sleeping: false,
          distanceSq: budget.cullDistanceSq + 1,
        },
        budget,
      ),
      true,
    );
  });
});

describe('fragmentOpacity / excessBodiesToCull', () => {
  it('fades opacity with age', () => {
    assert.equal(fragmentOpacity(0, 2), 1);
    assert.equal(fragmentOpacity(1, 2), 0.5);
    assert.equal(fragmentOpacity(2, 2), 0);
  });

  it('computes excess culls after quality drop', () => {
    assert.equal(excessBodiesToCull(30, 12), 18);
    assert.equal(excessBodiesToCull(8, 12), 0);
  });
});
