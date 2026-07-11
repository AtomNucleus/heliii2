import * as THREE from 'three';
import type { EnemySystem, EnemyLayoutOptions } from '../combat/enemies';

export interface WaveContext extends EnemyLayoutOptions {
  half: number;
}

export function makeWaveContext(opts: EnemyLayoutOptions): WaveContext {
  return {
    ...opts,
    half: opts.mapHalfExtent * 0.72,
  };
}

function groundAt(ctx: WaveContext, x: number, z: number, lift = 0) {
  return new THREE.Vector3(x, ctx.getGroundHeight(x, z) + lift, z);
}

/** Light ambient threats present from first strike onward. */
export function spawnAmbientThreats(enemies: EnemySystem, ctx: WaveContext) {
  const { half, spawn } = ctx;
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * Math.PI * 2 + 0.55;
    const r = half * (0.38 + (i % 2) * 0.1);
    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 24) continue;
    enemies.spawnEnemy('turret', groundAt(ctx, x, z), {
      primary: false,
      health: 48,
      scoreValue: 280,
      fireCooldown: 1.55 + (i % 2) * 0.2,
      tag: 'ambient',
    });
  }
}

/** Two forward depots for First Strike. */
export function spawnFirstStrikeDepots(enemies: EnemySystem, ctx: WaveContext) {
  const { half, spawn } = ctx;
  const spots: Array<[number, number]> = [
    [half * 0.52, half * 0.32],
    [-half * 0.42, half * 0.4],
  ];
  for (const [x, z] of spots) {
    if (Math.hypot(x - spawn.x, z - spawn.z) < 22) {
      const a = Math.atan2(z, x) + 0.4;
      const nx = Math.cos(a) * half * 0.45;
      const nz = Math.sin(a) * half * 0.45;
      enemies.spawnEnemy('depot', groundAt(ctx, nx, nz), {
        primary: true,
        health: 100,
        scoreValue: 600,
        tag: 'first-strike',
      });
    } else {
      enemies.spawnEnemy('depot', groundAt(ctx, x, z), {
        primary: true,
        health: 100,
        scoreValue: 600,
        tag: 'first-strike',
      });
    }
  }
}

/** AA gauntlet corridor — dense turrets + a few drones (set-piece). */
export function spawnAaGauntlet(enemies: EnemySystem, ctx: WaveContext) {
  const { half } = ctx;
  const axisZ = half * 0.05;
  for (let i = 0; i < 7; i++) {
    const x = -half * 0.15 + i * (half * 0.08);
    const side = i % 2 === 0 ? 1 : -1;
    const z = axisZ + side * (12 + (i % 3) * 4);
    enemies.spawnEnemy('turret', groundAt(ctx, x, z), {
      primary: true,
      health: 60,
      scoreValue: 360,
      fireCooldown: 1.05 + (i % 3) * 0.12,
      tag: 'gauntlet',
    });
  }
  for (let i = 0; i < 3; i++) {
    const cx = half * (0.05 + i * 0.12);
    const cz = axisZ;
    const ground = ctx.getGroundHeight(cx, cz);
    const height = ground + 20 + i * 3;
    enemies.spawnEnemy(
      'drone',
      new THREE.Vector3(cx + 10, height, cz),
      {
        primary: false,
        health: 38,
        scoreValue: 400,
        fireCooldown: 1.4,
        orbitCenter: new THREE.Vector3(cx, height, cz),
        orbitRadius: 11 + i * 2,
        orbitHeight: height,
        orbitAngle: i * 1.7,
        tag: 'gauntlet-escort',
      },
    );
  }
}

/**
 * Convoy trucks (depots) moving west with drone escorts.
 * Returns escape X threshold (west).
 */
export function spawnConvoy(enemies: EnemySystem, ctx: WaveContext): number {
  const { half } = ctx;
  const startX = half * 0.55;
  const laneZ = -half * 0.28;
  const speed = 9.5;
  const escapeX = -half * 0.78;

  for (let i = 0; i < 4; i++) {
    const x = startX - i * 14;
    const z = laneZ + (i % 2 === 0 ? 0 : 5);
    enemies.spawnEnemy('depot', groundAt(ctx, x, z, 0.2), {
      primary: true,
      health: 85,
      scoreValue: 700,
      tag: 'convoy',
      velocity: new THREE.Vector3(-speed, 0, 0),
      scale: 0.92,
    });
  }

  for (let i = 0; i < 3; i++) {
    const x = startX - i * 18;
    const z = laneZ;
    const ground = ctx.getGroundHeight(x, z);
    const height = ground + 16 + i * 2;
    enemies.spawnEnemy('drone', new THREE.Vector3(x, height, z + 8), {
      primary: false,
      health: 40,
      scoreValue: 380,
      fireCooldown: 1.5,
      tag: 'convoy-escort',
      velocity: new THREE.Vector3(-speed * 0.95, 0, 0),
    });
  }

  return escapeX;
}

/** Escalating retaliation wave (1-based index). */
export function spawnRetaliationWave(
  enemies: EnemySystem,
  ctx: WaveContext,
  wave: number,
) {
  const { half, spawn } = ctx;
  const count = 3 + wave * 2;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2 + wave * 0.4;
    const r = half * (0.28 + (wave % 3) * 0.06);
    const cx = spawn.x * 0.15 + Math.cos(t) * r;
    const cz = spawn.z * 0.15 + Math.sin(t) * r;
    const ground = ctx.getGroundHeight(cx, cz);
    const height = ground + 16 + (i % 4) * 3 + wave * 1.5;
    const orbitR = 12 + (i % 3) * 4 + wave;
    enemies.spawnEnemy(
      'drone',
      new THREE.Vector3(cx + orbitR, height, cz),
      {
        primary: true,
        health: 36 + wave * 4,
        scoreValue: 380 + wave * 40,
        fireCooldown: Math.max(0.85, 1.55 - wave * 0.12),
        orbitCenter: new THREE.Vector3(cx, height, cz),
        orbitRadius: orbitR,
        orbitHeight: height,
        orbitAngle: t,
        tag: 'retaliation',
      },
    );
  }

  // Wave 2+ adds ground AA pressure
  if (wave >= 2) {
    for (let i = 0; i < wave; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = half * (0.35 + Math.random() * 0.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      enemies.spawnEnemy('turret', groundAt(ctx, x, z), {
        primary: false,
        health: 50,
        scoreValue: 300,
        fireCooldown: 1.15,
        tag: 'retaliation-aa',
      });
    }
  }
}

/** Multi-stage command bunker + heavy cover. */
export function spawnCommandBunker(enemies: EnemySystem, ctx: WaveContext) {
  const { half } = ctx;
  const bx = -half * 0.2;
  const bz = half * 0.48;
  enemies.spawnEnemy('depot', groundAt(ctx, bx, bz), {
    primary: true,
    health: 280,
    scoreValue: 2000,
    tag: 'bunker',
    scale: 1.55,
  });

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 18 + (i % 2) * 6;
    const x = bx + Math.cos(a) * r;
    const z = bz + Math.sin(a) * r;
    enemies.spawnEnemy('turret', groundAt(ctx, x, z), {
      primary: false,
      health: 65,
      scoreValue: 340,
      fireCooldown: 0.95 + (i % 3) * 0.1,
      tag: 'bunker-aa',
    });
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const cx = bx + Math.cos(a) * 22;
    const cz = bz + Math.sin(a) * 22;
    const ground = ctx.getGroundHeight(cx, cz);
    const height = ground + 22;
    enemies.spawnEnemy('drone', new THREE.Vector3(cx + 12, height, cz), {
      primary: false,
      health: 45,
      scoreValue: 420,
      fireCooldown: 1.25,
      orbitCenter: new THREE.Vector3(cx, height, cz),
      orbitRadius: 12,
      orbitHeight: height,
      orbitAngle: a,
      tag: 'bunker-escort',
    });
  }
}

export function bunkerHealthRatio(enemies: EnemySystem): number {
  const bunkers = enemies.getAlive({ tag: 'bunker' });
  if (bunkers.length === 0) return 0;
  const b = bunkers[0]!;
  return b.health / b.maxHealth;
}
