/**
 * Smoke checks for Operation SUNSET mission authoring (no Three.js).
 * Run: node scripts/verify-mission.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const phasesSrc = readFileSync(join(root, 'src/mission/phases.ts'), 'utf8');
const gradeSrc = readFileSync(join(root, 'src/mission/grade.ts'), 'utf8');
const strikeSrc = readFileSync(join(root, 'src/mission/strikeMission.ts'), 'utf8');
const directorSrc = readFileSync(join(root, 'src/mission/director.ts'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.ts'), 'utf8');

const paceMatches = [...phasesSrc.matchAll(/paceMinutes:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
const paceSum = paceMatches.reduce((a, b) => a + b, 0);
const phaseIds = [...phasesSrc.matchAll(/id:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);

const checks = [];

function assert(name, cond, detail = '') {
  checks.push({ name, ok: !!cond, detail });
}

assert(
  'has 8 authored phases',
  phaseIds.length === 8,
  `got ${phaseIds.length}: ${phaseIds.join(',')}`,
);
assert('design pace is 8–11 minutes', paceSum >= 8 && paceSum <= 11, `sum=${paceSum}`);
assert('grade helpers present', /gradeFromRun|loadBestScore|saveBestScore/.test(gradeSrc));
assert(
  'strike mission has checkpoints',
  /saveCheckpoint|checkpointsUsed|STARTING_LIVES/.test(strikeSrc),
);
assert('strike mission has radio', /RadioChatter|RADIO_SCRIPTS/.test(strikeSrc));
assert(
  'strike mission has waves/setpieces',
  /spawnRetaliationWave|setpiece|spawnConvoy|spawnCommandBunker/.test(strikeSrc),
);
assert(
  'mission director state machine',
  /MissionDirector|OPERATION_ACTS|softNudge|onCheckpointRecover/.test(directorSrc),
);
assert('three-act framing', /ACT I|ACT II|ACT III|INFILTRATION|ESCALATION/.test(directorSrc));
assert(
  'main integrates StrikeMission',
  /StrikeMission/.test(mainSrc) && /updateStrike|showRadio/.test(mainSrc),
);
assert(
  'main stays thin on mission logic',
  !/spawnFirstStrikeDepots|OPERATION_PHASES|MissionDirector/.test(mainSrc),
);
assert(
  'profile / daily progression wired',
  /initProfileSession|recordRun|MetaPanel|getDailyChallenge/.test(mainSrc),
);
assert(
  'end summary propagates phaseTimes into recordRun',
  /phaseTimes/.test(strikeSrc) &&
    /phaseTimes:\s*summary\.phaseTimes|phaseTimes:\s*summary\.phaseTimes/.test(mainSrc),
);
assert(
  'new best uses strict pre-record comparison',
  /previousBest/.test(mainSrc) && /isStrictNewBest/.test(mainSrc),
);
assert(
  'unlock messaging uses human-facing names',
  /newlyUnlocked\.map\(\(u\)\s*=>\s*u\.name\)/.test(mainSrc),
);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed. Design pace ≈ ${paceSum.toFixed(1)} min.`);
