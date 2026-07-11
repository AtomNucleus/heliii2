import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDefaultProfile,
  createMemoryStorage,
  loadProfile,
  persistProfile,
  parseAndMigrateProfile,
  applyRunToProgression,
  evaluateUnlocks,
  buildDailyChallenge,
  evaluateDailyBonus,
  dailyGradePoints,
  utcDateKey,
  seedFromDateKey,
  resolveReducedMotionActive,
  defaultSettings,
  patchSettings,
  PROFILE_STORAGE_KEY,
  LEGACY_BEST_SCORE_KEY,
} from './index.ts';
import { isStrictNewBest } from '../mission/grade.ts';

describe('profile validation / migration', () => {
  it('creates a versioned default profile', () => {
    const p = createDefaultProfile({ now: new Date('2026-07-11T00:00:00Z') });
    assert.equal(p.version, 1);
    assert.equal(p.progression.equippedSkin, 'sunsetGreen');
    assert.equal(p.settings.reducedMotion, 'system');
    assert.equal(p.settings.captions, true);
  });

  it('recovers from corrupt JSON and imports legacy best score', () => {
    const storage = createMemoryStorage({
      [PROFILE_STORAGE_KEY]: '{not-json',
      [LEGACY_BEST_SCORE_KEY]: '12345',
    });
    const loaded = loadProfile({ storage, now: () => new Date('2026-07-11T00:00:00Z') });
    assert.equal(loaded.recovered, true);
    assert.equal(loaded.profile.progression.bestScore, 12345);
  });

  it('migrates unknown version fields and clamps settings', () => {
    const { profile, migrated } = parseAndMigrateProfile(
      {
        version: 99,
        progression: {
          bestScore: -10,
          unlockedSkins: ['sunsetGreen', 'nope'],
          equippedSkin: 'emberStripe',
        },
        settings: {
          steeringSensitivity: 9,
          masterVolume: -2,
          quality: 'ultra',
          reducedMotion: 'maybe',
        },
      },
      { importedBestScore: 500 },
    );
    assert.equal(migrated, true);
    assert.equal(profile.version, 1);
    assert.equal(profile.progression.bestScore, 500);
    assert.equal(profile.progression.equippedSkin, 'sunsetGreen');
    assert.ok(profile.settings.steeringSensitivity <= 1.5);
    assert.ok(profile.settings.masterVolume >= 0);
    assert.equal(profile.settings.quality, 'auto');
    assert.equal(profile.settings.reducedMotion, 'system');
  });

  it('persists without throwing when storage rejects writes', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const ok = persistProfile(createDefaultProfile(), { storage });
    assert.equal(ok, false);
  });
});

describe('progression / unlocks', () => {
  it('tracks phase accomplishments and unlocks skins/loadouts from real run data', () => {
    const profile = createDefaultProfile();
    const daily = buildDailyChallenge(new Date('2026-07-11T12:00:00Z'));
    const result = applyRunToProgression(
      profile,
      {
        outcome: 'won',
        score: 9000,
        grade: 'A',
        time: 500,
        bestCombo: 8,
        phasesCompleted: 8,
        phaseTotal: 8,
        checkpointsUsed: 0,
        completedPhaseIds: ['ingress', 'recon', 'firstStrike'],
        phaseTimes: { ingress: 42.5, recon: 55, firstStrike: 90 },
        rings: 10,
        ringsTotal: 10,
      },
      daily,
    );
    assert.equal(result.progression.completedRuns, 1);
    assert.equal(result.progression.phases.recon.completed, true);
    assert.equal(result.progression.phases.ingress.bestTime, 42.5);
    assert.equal(result.progression.phases.recon.bestTime, 55);
    assert.equal(result.progression.phases.firstStrike.bestTime, 90);
    assert.ok(result.progression.unlockedSkins.includes('nightOps'));
    assert.ok(result.progression.unlockedSkins.includes('emberStripe'));
    assert.ok(result.progression.unlockedSkins.includes('ghostArray'));
    assert.ok(result.progression.unlockedLoadouts.includes('tracerPods'));
    assert.ok(result.progression.unlockedLoadouts.includes('reconSuite'));
    const night = result.newlyUnlocked.find((u) => u.id === 'nightOps');
    assert.ok(night);
    assert.equal(night!.name, 'Night Ops');
    const tracer = result.newlyUnlocked.find((u) => u.id === 'tracerPods');
    assert.ok(tracer);
    assert.equal(tracer!.name, 'Tracer Pods');
  });

  it('keeps the better per-phase bestTime across runs', () => {
    const profile = createDefaultProfile();
    const daily = buildDailyChallenge(new Date('2026-07-11T12:00:00Z'));
    const first = applyRunToProgression(
      profile,
      {
        outcome: 'won',
        score: 1000,
        grade: 'C',
        time: 600,
        bestCombo: 2,
        phasesCompleted: 1,
        phaseTotal: 8,
        checkpointsUsed: 1,
        completedPhaseIds: ['ingress'],
        phaseTimes: { ingress: 60 },
      },
      daily,
    );
    const second = applyRunToProgression(
      { ...profile, progression: first.progression },
      {
        outcome: 'won',
        score: 1200,
        grade: 'C',
        time: 580,
        bestCombo: 3,
        phasesCompleted: 1,
        phaseTotal: 8,
        checkpointsUsed: 0,
        completedPhaseIds: ['ingress'],
        phaseTimes: { ingress: 48 },
      },
      daily,
    );
    assert.equal(second.progression.phases.ingress.bestTime, 48);
    const third = applyRunToProgression(
      { ...profile, progression: second.progression },
      {
        outcome: 'won',
        score: 1100,
        grade: 'C',
        time: 590,
        bestCombo: 2,
        phasesCompleted: 1,
        phaseTotal: 8,
        checkpointsUsed: 0,
        completedPhaseIds: ['ingress'],
        phaseTimes: { ingress: 70 },
      },
      daily,
    );
    assert.equal(third.progression.phases.ingress.bestTime, 48);
  });

  it('evaluateUnlocks stays honest for fresh profiles', () => {
    const u = evaluateUnlocks(createDefaultProfile().progression);
    assert.deepEqual(u.skins, ['sunsetGreen']);
    assert.deepEqual(u.loadouts, ['standard']);
  });
});

describe('daily determinism', () => {
  it('uses UTC date identity and is stable for the same day', () => {
    const a = buildDailyChallenge(new Date('2026-07-11T01:00:00Z'));
    const b = buildDailyChallenge(new Date('2026-07-11T23:59:00Z'));
    assert.equal(a.dateKey, '2026-07-11');
    assert.equal(a.dateKey, b.dateKey);
    assert.equal(a.seed, b.seed);
    assert.equal(a.id, b.id);
    assert.equal(a.kind, b.kind);
    assert.equal(a.bonusPoints, b.bonusPoints);
  });

  it('changes across UTC midnights', () => {
    const a = buildDailyChallenge(new Date('2026-07-11T23:00:00Z'));
    const b = buildDailyChallenge(new Date('2026-07-12T00:00:00Z'));
    assert.notEqual(a.dateKey, b.dateKey);
    assert.notEqual(a.seed, b.seed);
  });

  it('evaluates score_target bonus deterministically', () => {
    // Find a date whose kind is score_target by scanning, or force via known seed path.
    let challenge = buildDailyChallenge(new Date('2026-01-01T00:00:00Z'));
    for (let day = 1; day <= 40; day++) {
      const d = new Date(Date.UTC(2026, 0, day));
      const c = buildDailyChallenge(d);
      if (c.kind === 'score_target') {
        challenge = c;
        break;
      }
    }
    assert.equal(challenge.kind, 'score_target');
    const miss = evaluateDailyBonus(challenge, {
      outcome: 'won',
      score: challenge.scoreTarget - 1,
      time: 100,
      bestCombo: 1,
      checkpointsUsed: 0,
    });
    const hit = evaluateDailyBonus(challenge, {
      outcome: 'won',
      score: challenge.scoreTarget,
      time: 100,
      bestCombo: 1,
      checkpointsUsed: 0,
    });
    assert.equal(miss.met, false);
    assert.equal(hit.met, true);
    assert.equal(hit.bonus, challenge.bonusPoints);
    assert.equal(dailyGradePoints(challenge, {
      outcome: 'won',
      score: challenge.scoreTarget,
      time: 100,
      bestCombo: 1,
      checkpointsUsed: 0,
    }), 2);
  });

  it('seedFromDateKey matches utcDateKey pipeline', () => {
    const key = utcDateKey(new Date('2026-07-11T15:00:00Z'));
    assert.equal(key, '2026-07-11');
    assert.equal(seedFromDateKey(key), seedFromDateKey('2026-07-11'));
  });
});

describe('settings defaults', () => {
  it('defaults reduced motion to system and respects OS until override', () => {
    const s = defaultSettings();
    assert.equal(s.reducedMotion, 'system');
    assert.equal(resolveReducedMotionActive('system', true), true);
    assert.equal(resolveReducedMotionActive('system', false), false);
    assert.equal(resolveReducedMotionActive('on', false), true);
    assert.equal(resolveReducedMotionActive('off', true), false);
  });

  it('patchSettings clamps sensitivity and volume', () => {
    const next = patchSettings(defaultSettings(), {
      steeringSensitivity: 4,
      masterVolume: -1,
      highContrast: true,
    });
    assert.equal(next.steeringSensitivity, 1.5);
    assert.equal(next.masterVolume, 0);
    assert.equal(next.highContrast, true);
  });
});

describe('new-best scoring', () => {
  it('requires a strict improvement over the previous career best', () => {
    assert.equal(isStrictNewBest(10000, 10000), false);
    assert.equal(isStrictNewBest(10000, 10001), true);
    assert.equal(isStrictNewBest(0, 0), false);
    assert.equal(isStrictNewBest(0, 1), true);
  });

  it('persists bonus-inclusive best to profile and legacy mirror', () => {
    const storage = createMemoryStorage();
    const profile = createDefaultProfile({ importedBestScore: 10000 });
    persistProfile(profile, { storage });
    // Simulate recordRun folding a daily/loadout bonus into a tied base score.
    const base = 10000;
    const bonusInclusive = base + 500;
    profile.progression.bestScore = Math.max(profile.progression.bestScore, bonusInclusive);
    persistProfile(profile, { storage });
    assert.equal(Number(storage.getItem(LEGACY_BEST_SCORE_KEY)), 10500);
    assert.equal(isStrictNewBest(10000, bonusInclusive), true);
    assert.equal(isStrictNewBest(10000, base), false);
  });
});
