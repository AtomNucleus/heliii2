import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { WeaponSystem } from './weapons';
import type { CombatEffects } from './effects';
import {
  type DroneRole,
  type TurretMode,
  type TelegraphState,
  type MoveIntent,
  type DirectorSnapshot,
  type WaveSpec,
  type WaveRuntimeState,
  type EliteProfile,
  getDroneRole,
  getTurretMode,
  createTelegraphState,
  defaultTelegraphConfig,
  updateTelegraph,
  steerDrone,
  aimFair,
  aimFlak,
  sweepYawOffset,
  planMissionEncounter,
  hashSeed,
  createRng,
  buildFormation,
  slotWorldPosition,
  pickReinforceSpawnAnchor,
  defaultWaveSheet,
  createWaveRuntime,
  resetWaveRuntime,
  pickNextWave,
  markWaveFired,
  compileWaveSpecs,
  shouldReclaimCorpse,
  getEliteProfile,
  finaleEliteRoles,
  shouldReleaseFinale,
  formationSlotWorld,
  ObjectPool,
  v3,
} from './ai';

export type EnemyKind = 'turret' | 'drone' | 'depot';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  mesh: THREE.Group;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  radius: number;
  alive: boolean;
  /** Primary objective (must destroy to win) */
  primary: boolean;
  fireCooldown: number;
  fireTimer: number;
  orbitCenter: THREE.Vector3 | null;
  orbitAngle: number;
  orbitRadius: number;
  orbitHeight: number;
  scoreValue: number;
  beacon: THREE.Mesh | null;
  hitFlash: number;
  /** AI extensions (optional for API compat) */
  droneRole?: DroneRole;
  turretMode?: TurretMode;
  telegraph: TelegraphState;
  moveIntent: MoveIntent;
  underFireTimer: number;
  formationId: number;
  formationSlot: number;
  boltDamage: number;
  engageRange: number;
  minRange: number;
  leadTime: number;
  telegraphDuration: number;
  burstCount: number;
  burstGap: number;
  sweepHalfAngle: number;
  sweepPeriod: number;
  pursuitWeight: number;
  evadeWeight: number;
  preferredRange: number;
  moveSpeed: number;
  aimYaw: number;
  /** Elite id when applicable */
  eliteId?: string;
  /** Seconds since death (for pool reclaim) */
  deadFor: number;
  interceptBias: number;
  flankBias: number;
  formationPull: number;
  /** Optional mission tag (convoy, bunker, wave, etc.) */
  tag: string | null;
  /** Optional linear patrol velocity (XZ units/sec) */
  velocity: THREE.Vector3 | null;
  /** Authored mesh scale (primary pulse multiplies this, never replaces it) */
  baseScale: number;
}

export interface EnemyHitResult {
  enemy: Enemy;
  destroyed: boolean;
  points: number;
  overkill: boolean;
}

let nextEnemyId = 1;

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}

function makeTurretMesh(mode: TurretMode = 'tracker'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'turret';

  const accent =
    mode === 'flak' ? 0xff6622 : mode === 'burst' ? 0xff3344 : mode === 'sweep' ? 0xffaa33 : COLORS.orangeHot;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 0.6, 8),
    new THREE.MeshStandardMaterial({
      color: 0x3a4550,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
    }),
  );
  base.position.y = 0.3;
  g.add(base);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0x5a3030,
      emissive: accent,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.25,
      flatShading: true,
    }),
  );
  body.position.y = 1.1;
  body.name = 'turret-body';
  g.add(body);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6),
    new THREE.MeshStandardMaterial({
      color: 0x222830,
      emissive: accent,
      emissiveIntensity: 0.5,
      flatShading: true,
    }),
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(1.1, 0.15, 0);
  barrel.name = 'turret-barrel';
  body.add(barrel);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.4,
      flatShading: true,
    }),
  );
  beacon.position.y = 1.95;
  beacon.name = 'turret-beacon';
  g.add(beacon);

  return g;
}

function makeDroneMesh(tint = 0xaa44ff, elite = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'drone';

  const hull = new THREE.Mesh(
    new THREE.OctahedronGeometry(elite ? 1.35 : 1.1, 0),
    new THREE.MeshStandardMaterial({
      color: elite ? 0x4a3020 : 0x3a2850,
      emissive: tint,
      emissiveIntensity: elite ? 0.85 : 0.55,
      roughness: 0.4,
      metalness: 0.4,
      flatShading: true,
    }),
  );
  hull.name = 'drone-hull';
  g.add(hull);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(elite ? 1.7 : 1.4, elite ? 0.16 : 0.12, 6, 16),
    new THREE.MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: elite ? 1.2 : 0.9,
      flatShading: true,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.name = 'drone-ring';
  g.add(ring);

  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, elite ? 1.9 : 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x2a2038,
        emissive: tint,
        emissiveIntensity: 0.35,
        flatShading: true,
      }),
    );
    arm.rotation.y = (i / 4) * Math.PI * 2;
    arm.position.y = 0.05;
    g.add(arm);
  }

  // Telegraph glow disc (hidden until windup)
  const telegraph = new THREE.Mesh(
    new THREE.RingGeometry(elite ? 2.0 : 1.6, elite ? 2.6 : 2.1, 16),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.name = 'drone-telegraph';
  g.add(telegraph);

  return g;
}

function makeDepotMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'depot';

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.4, 3.2),
    new THREE.MeshStandardMaterial({
      color: 0x6a4020,
      emissive: COLORS.orangeSun,
      emissiveIntensity: 0.28,
      roughness: 0.65,
      metalness: 0.2,
      flatShading: true,
    }),
  );
  crate.position.y = 1.2;
  crate.name = 'depot-body';
  g.add(crate);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.35, 0.35),
    new THREE.MeshStandardMaterial({
      color: COLORS.neonGreen,
      emissive: COLORS.neonGreen,
      emissiveIntensity: 1.15,
      flatShading: true,
    }),
  );
  stripe.position.y = 2.0;
  g.add(stripe);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6),
    new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      emissive: COLORS.orangeHot,
      emissiveIntensity: 0.4,
      flatShading: true,
    }),
  );
  antenna.position.set(0.9, 2.8, 0.9);
  g.add(antenna);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.35, 14, 8),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pillar.position.y = 8;
  pillar.name = 'depot-beacon';
  g.add(pillar);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 10),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonGreen,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  cap.position.y = 15.2;
  g.add(cap);

  return g;
}

export interface CombatSpaceAnchor {
  kind: 'depot' | 'aa' | 'approach';
  center: THREE.Vector3;
  radius: number;
  groundY: number;
}

export interface EnemyLayoutOptions {
  getGroundHeight: (x: number, z: number) => number;
  mapHalfExtent: number;
  spawn: THREE.Vector3;
  /** Optional seed for deterministic layouts */
  seed?: number;
  /** Optional authored combat spaces from the environment layer */
  combatSpaces?: CombatSpaceAnchor[];
}

export interface EnemyUpdateContext {
  director?: DirectorSnapshot;
  /** Optional toast callback for encounter labels */
  onToast?: (message: string) => void;
}

interface PooledDroneMesh {
  mesh: THREE.Group;
  tint: number;
  elite: boolean;
}

/**
 * Enemy targets + threats: AA turrets, supply depots (primary), role-driven drones.
 */
export class EnemySystem {
  readonly group = new THREE.Group();
  readonly enemies: Enemy[] = [];
  private readonly weapons: WeaponSystem;
  private readonly effects: CombatEffects;
  private tmpDir = new THREE.Vector3();
  private tmpOrigin = new THREE.Vector3();
  private tmpSlot = v3();
  private layoutOpts: EnemyLayoutOptions | null = null;
  private waveSheet: WaveSpec[] = [];
  private waveRuntime: WaveRuntimeState = createWaveRuntime();
  private encounterBeats = compileWaveSpecs([]);
  private primariesDestroyed = 0;
  private reinforceRng = createRng(1);
  private finaleFired = false;
  private readonly droneMeshPool = new ObjectPool<PooledDroneMesh>(
    () => ({ mesh: makeDroneMesh(), tint: 0xaa44ff, elite: false }),
    {
      maxSize: 24,
      prewarm: 6,
      reset: (item) => {
        item.mesh.visible = false;
        item.mesh.position.set(0, -999, 0);
      },
    },
  );

  constructor(scene: THREE.Scene, weapons: WeaponSystem, effects: CombatEffects) {
    this.group.name = 'enemies';
    this.weapons = weapons;
    this.effects = effects;
    scene.add(this.group);
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  get primaryAlive(): number {
    return this.enemies.filter((e) => e.alive && e.primary).length;
  }

  get primaryTotal(): number {
    return this.enemies.filter((e) => e.primary).length;
  }

  get killCount(): number {
    return this.enemies.filter((e) => !e.alive).length;
  }

  get aliveThreats(): number {
    return this.enemies.filter((e) => e.alive && !e.primary).length;
  }

  /** Alive enemies matching an optional tag filter. */
  countAlive(filter?: { kind?: EnemyKind; primary?: boolean; tag?: string }): number {
    return this.enemies.filter((e) => {
      if (!e.alive) return false;
      if (filter?.kind && e.kind !== filter.kind) return false;
      if (filter?.primary != null && e.primary !== filter.primary) return false;
      if (filter?.tag && e.tag !== filter.tag) return false;
      return true;
    }).length;
  }

  getAlive(filter?: { kind?: EnemyKind; primary?: boolean; tag?: string }): Enemy[] {
    return this.enemies.filter((e) => {
      if (!e.alive) return false;
      if (filter?.kind && e.kind !== filter.kind) return false;
      if (filter?.primary != null && e.primary !== filter.primary) return false;
      if (filter?.tag && e.tag !== filter.tag) return false;
      return true;
    });
  }

  /** World positions of alive enemies (for rocket homing). */
  getHomingTargets(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const y = e.kind === 'drone' ? e.position.y : e.position.y + 1.2;
      out.push(new THREE.Vector3(e.position.x, y, e.position.z));
    }
    return out;
  }

  /** Nearest alive enemy along forward cone (for crosshair lock). */
  findAimTarget(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    maxDist = 70,
    coneDot = 0.82,
  ): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const y = e.kind === 'drone' ? e.position.y : e.position.y + 1.2;
      this.tmpOrigin.set(e.position.x, y, e.position.z);
      this.tmpDir.subVectors(this.tmpOrigin, origin);
      const dist = this.tmpDir.length();
      if (dist < 4 || dist > maxDist) continue;
      this.tmpDir.multiplyScalar(1 / dist);
      const dot = forward.dot(this.tmpDir);
      if (dot < coneDot) continue;
      const score = dot * 2 - dist * 0.01 + (e.primary ? 0.15 : 0) + (e.eliteId ? 0.1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  spawnMission(opts: EnemyLayoutOptions) {
    this.clear();
    this.layoutOpts = opts;
    this.waveSheet = defaultWaveSheet();
    this.encounterBeats = compileWaveSpecs(this.waveSheet);
    resetWaveRuntime(this.waveRuntime);
    this.primariesDestroyed = 0;
    this.finaleFired = false;

    const seed =
      opts.seed ??
      hashSeed(
        `heli-${Math.round(opts.spawn.x)}-${Math.round(opts.spawn.z)}-${Math.round(opts.mapHalfExtent)}`,
      );
    this.reinforceRng = createRng(seed ^ 0xabc123);

    const plan = planMissionEncounter({
      seed,
      mapHalfExtent: opts.mapHalfExtent,
      playerSpawn: v3(opts.spawn.x, opts.spawn.y, opts.spawn.z),
      getGroundHeight: opts.getGroundHeight,
      depotCount: 4,
      turretCount: 8,
      droneCount: 8,
    });

    const authoredDepots = (opts.combatSpaces ?? []).filter((space) => space.kind === 'depot');
    const authoredAa = (opts.combatSpaces ?? []).filter((space) => space.kind === 'aa');
    for (let i = 0; i < Math.min(plan.depots.length, authoredDepots.length); i++) {
      const space = authoredDepots[i]!;
      plan.depots[i]!.position = v3(space.center.x, space.groundY, space.center.z);
    }
    for (let i = 0; i < Math.min(plan.turrets.length, authoredAa.length); i++) {
      const space = authoredAa[i]!;
      const angle = (i / Math.max(1, authoredAa.length)) * Math.PI * 2;
      plan.turrets[i]!.position = v3(
        space.center.x + Math.cos(angle) * space.radius * 0.55,
        space.groundY,
        space.center.z + Math.sin(angle) * space.radius * 0.55,
      );
    }

    for (const d of plan.depots) {
      this.addEnemy('depot', new THREE.Vector3(d.position.x, d.position.y, d.position.z), {
        primary: true,
        health: 95,
        scoreValue: 550,
      });
    }

    for (const t of plan.turrets) {
      const profile = getTurretMode(t.mode);
      this.addEnemy('turret', new THREE.Vector3(t.position.x, t.position.y, t.position.z), {
        primary: false,
        health: profile.health,
        scoreValue: profile.scoreValue,
        fireCooldown: profile.fireCooldown,
        turretMode: t.mode,
        boltDamage: profile.boltDamage,
        engageRange: profile.engageRange,
        minRange: profile.minRange,
        leadTime: profile.leadTime,
        telegraphDuration: profile.telegraphDuration,
        burstCount: profile.burstCount,
        burstGap: profile.burstGap,
        sweepHalfAngle: profile.sweepHalfAngle,
        sweepPeriod: profile.sweepPeriod,
      });
    }

    for (const d of plan.drones) {
      const profile = getDroneRole(d.role);
      this.addEnemy(
        'drone',
        new THREE.Vector3(d.position.x, d.position.y, d.position.z),
        {
          primary: false,
          health: profile.health,
          scoreValue: profile.scoreValue,
          fireCooldown: profile.fireCooldown,
          orbitCenter: new THREE.Vector3(d.orbitCenter.x, d.orbitCenter.y, d.orbitCenter.z),
          orbitRadius: d.orbitRadius,
          orbitHeight: d.orbitHeight,
          orbitAngle: d.orbitAngle,
          droneRole: d.role,
          boltDamage: profile.boltDamage,
          engageRange: profile.engageRange,
          minRange: profile.minRange,
          leadTime: profile.leadTime,
          telegraphDuration: profile.telegraphDuration,
          pursuitWeight: profile.pursuitWeight,
          evadeWeight: profile.evadeWeight,
          preferredRange: profile.preferredRange,
          moveSpeed: profile.moveSpeed,
          formationId: d.formationId,
          formationSlot: d.formationSlot,
          interceptBias: profile.interceptBias,
          flankBias: profile.flankBias,
          formationPull: profile.formationAffinity,
        },
      );
    }
  }

  /**
   * Spawn a reinforcement formation (director-gated). Returns count added.
   */
  spawnReinforcement(
    roles: DroneRole[],
    formationKind: WaveSpec['formation'],
    heliPos: THREE.Vector3,
    _label?: string,
    elite?: EliteProfile | null,
  ): number {
    if (!this.layoutOpts) return 0;
    const anchorFlat = pickReinforceSpawnAnchor(
      this.reinforceRng,
      v3(heliPos.x, heliPos.y, heliPos.z),
      this.layoutOpts.mapHalfExtent * 0.72,
    );
    const ground = this.layoutOpts.getGroundHeight(anchorFlat.x, anchorFlat.z);
    const height = ground + 22;
    const anchor = v3(anchorFlat.x, height, anchorFlat.z);
    const yaw = this.reinforceRng() * Math.PI * 2;
    const total = roles.length + (elite ? 1 : 0);
    const layout = buildFormation(formationKind, total, 12);
    const formationId = 1000 + this.enemies.length;
    let spawned = 0;

    if (elite) {
      const base = getDroneRole(elite.baseRole);
      const slot = layout.slots[0]!;
      const pos = slotWorldPosition(anchor, yaw, slot.offset);
      this.addEnemy('drone', new THREE.Vector3(pos.x, pos.y, pos.z), {
        primary: false,
        health: Math.round(base.health * elite.healthMul),
        scoreValue: Math.round(base.scoreValue * elite.scoreMul),
        fireCooldown: base.fireCooldown * 1.1,
        orbitCenter: new THREE.Vector3(anchor.x, height, anchor.z),
        orbitRadius: 14,
        orbitHeight: height + slot.offset.y,
        orbitAngle: yaw,
        droneRole: elite.baseRole,
        boltDamage: Math.round(base.boltDamage * elite.damageMul),
        engageRange: base.engageRange,
        minRange: base.minRange,
        leadTime: base.leadTime,
        telegraphDuration: base.telegraphDuration * elite.telegraphMul,
        pursuitWeight: base.pursuitWeight,
        evadeWeight: base.evadeWeight,
        preferredRange: base.preferredRange,
        moveSpeed: base.moveSpeed * 0.95,
        formationId,
        formationSlot: 0,
        interceptBias: base.interceptBias,
        flankBias: base.flankBias,
        formationPull: elite.formationPull,
        eliteId: elite.id,
        tintOverride: elite.tint,
      });
      spawned++;
    }

    for (let i = 0; i < roles.length; i++) {
      const role = roles[i]!;
      const profile = getDroneRole(role);
      const slotIndex = elite ? i + 1 : i;
      const slot = layout.slots[slotIndex] ?? layout.slots[0]!;
      const pos = slotWorldPosition(anchor, yaw, slot.offset);
      this.addEnemy('drone', new THREE.Vector3(pos.x, pos.y, pos.z), {
        primary: false,
        health: profile.health,
        scoreValue: profile.scoreValue,
        fireCooldown: profile.fireCooldown,
        orbitCenter: new THREE.Vector3(anchor.x, height, anchor.z),
        orbitRadius: 10 + i * 3,
        orbitHeight: height + slot.offset.y,
        orbitAngle: yaw + (i / roles.length) * Math.PI * 2,
        droneRole: role,
        boltDamage: profile.boltDamage,
        engageRange: profile.engageRange,
        minRange: profile.minRange,
        leadTime: profile.leadTime,
        telegraphDuration: profile.telegraphDuration,
        pursuitWeight: profile.pursuitWeight,
        evadeWeight: profile.evadeWeight,
        preferredRange: profile.preferredRange,
        moveSpeed: profile.moveSpeed,
        formationId,
        formationSlot: slotIndex,
        interceptBias: profile.interceptBias,
        flankBias: profile.flankBias,
        formationPull: profile.formationAffinity,
      });
      spawned++;
    }
    return spawned;
  }

  /**
   * Tick encounter pacing beats (scripted waves). Returns toast label if any.
   * Pressure / threat-budget aware via wave sheet gates.
   */
  tickEncounterPacing(elapsed: number, director?: DirectorSnapshot): string | null {
    const blocked = director?.beat === 'grace';

    // Finale elite encounter (once)
    if (
      !this.finaleFired &&
      shouldReleaseFinale({
        beat: director?.beat ?? 'probe',
        primariesDestroyed: this.primariesDestroyed,
        primaryTotal: this.primaryTotal,
        elapsed,
        alreadyFired: this.finaleFired,
      }) &&
      !blocked
    ) {
      this.finaleFired = true;
      markWaveFired(this.waveRuntime, { id: 'finale-wing' } as WaveSpec);
      return 'FINALE WING';
    }

    const next = pickNextWave(this.waveSheet, this.waveRuntime, {
      elapsed,
      primariesDestroyed: this.primariesDestroyed,
      pressure: director?.pressure ?? 0.4,
      aliveThreats: this.aliveThreats,
      blocked: !!blocked,
    });
    if (!next) return null;
    markWaveFired(this.waveRuntime, next);
    return next.label;
  }

  /** Fire the beat at index (used after tickEncounterPacing returns a label). */
  releaseEncounterBeat(label: string, heliPos: THREE.Vector3): number {
    if (label === 'FINALE WING') {
      const pack = finaleEliteRoles();
      const elite = getEliteProfile(pack.eliteId);
      return this.spawnReinforcement(pack.wingmen, 'diamond', heliPos, label, elite);
    }
    const wave = this.waveSheet.find((b) => b.label === label);
    if (wave) {
      return this.spawnReinforcement(wave.roles, wave.formation, heliPos, label);
    }
    const beat = this.encounterBeats.find((b) => b.label === label);
    if (!beat) return 0;
    return this.spawnReinforcement(beat.droneRoles, beat.formation, heliPos, label);
  }

  private acquireDroneMesh(tint: number, elite: boolean): THREE.Group {
    // Prefer pooled mesh of matching elite flag; else create fresh
    const pooled = this.droneMeshPool.acquire();
    if (pooled.tint === tint && pooled.elite === elite && pooled.mesh.children.length > 0) {
      pooled.mesh.visible = true;
      return pooled.mesh;
    }
    // Mismatch — dispose pooled placeholder and build correct mesh
    if (pooled.mesh.parent) this.group.remove(pooled.mesh);
    disposeObject(pooled.mesh);
    const mesh = makeDroneMesh(tint, elite);
    pooled.mesh = mesh;
    pooled.tint = tint;
    pooled.elite = elite;
    return mesh;
  }

  private releaseDroneMesh(enemy: Enemy) {
    if (enemy.kind !== 'drone') return;
    if (enemy.mesh.parent) this.group.remove(enemy.mesh);
    enemy.mesh.visible = false;
    this.droneMeshPool.release({
      mesh: enemy.mesh,
      tint: enemy.droneRole ? getDroneRole(enemy.droneRole).tint : 0xaa44ff,
      elite: !!enemy.eliteId,
    });
  }

  /** Public spawn used by authored mission waves. */
  spawnEnemy(
    kind: EnemyKind,
    position: THREE.Vector3,
    opts: {
      primary?: boolean;
      health?: number;
      scoreValue?: number;
      fireCooldown?: number;
      orbitCenter?: THREE.Vector3;
      orbitRadius?: number;
      orbitHeight?: number;
      orbitAngle?: number;
      tag?: string;
      velocity?: THREE.Vector3;
      scale?: number;
    } = {},
  ): Enemy {
    const defaults =
      kind === 'depot'
        ? { health: 95, scoreValue: 550, fireCooldown: 99, primary: true }
        : kind === 'turret'
          ? { health: 55, scoreValue: 320, fireCooldown: 1.35, primary: false }
          : { health: 42, scoreValue: 420, fireCooldown: 1.7, primary: false };

    return this.addEnemy(kind, position, {
      primary: opts.primary ?? defaults.primary,
      health: opts.health ?? defaults.health,
      scoreValue: opts.scoreValue ?? defaults.scoreValue,
      fireCooldown: opts.fireCooldown ?? defaults.fireCooldown,
      orbitCenter: opts.orbitCenter,
      orbitRadius: opts.orbitRadius,
      orbitHeight: opts.orbitHeight,
      orbitAngle: opts.orbitAngle,
      tag: opts.tag,
      velocity: opts.velocity,
      scale: opts.scale,
    });
  }

  /** Remove alive enemies matching a tag (despawn without score). */
  despawnByTag(tag: string) {
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.tag !== tag) continue;
      enemy.alive = false;
      enemy.mesh.visible = false;
    }
  }

  /** Clear every enemy mesh (full reset helper). */
  clearAlive() {
    this.clear();
  }

  private addEnemy(
    kind: EnemyKind,
    position: THREE.Vector3,
    opts: {
      primary: boolean;
      health: number;
      scoreValue: number;
      fireCooldown?: number;
      orbitCenter?: THREE.Vector3;
      orbitRadius?: number;
      orbitHeight?: number;
      orbitAngle?: number;
      droneRole?: DroneRole;
      turretMode?: TurretMode;
      boltDamage?: number;
      engageRange?: number;
      minRange?: number;
      leadTime?: number;
      telegraphDuration?: number;
      burstCount?: number;
      burstGap?: number;
      sweepHalfAngle?: number;
      sweepPeriod?: number;
      pursuitWeight?: number;
      evadeWeight?: number;
      preferredRange?: number;
      moveSpeed?: number;
      formationId?: number;
      formationSlot?: number;
      interceptBias?: number;
      flankBias?: number;
      formationPull?: number;
      eliteId?: string;
      tintOverride?: number;
      tag?: string;
      velocity?: THREE.Vector3;
      scale?: number;
    },
  ): Enemy {
    let mesh: THREE.Group;
    let radius: number;
    if (kind === 'turret') {
      mesh = makeTurretMesh(opts.turretMode ?? 'tracker');
      radius = 2.4;
    } else if (kind === 'drone') {
      const tint =
        opts.tintOverride ??
        (opts.droneRole ? getDroneRole(opts.droneRole).tint : 0xaa44ff);
      mesh = this.acquireDroneMesh(tint, !!opts.eliteId);
      radius = opts.eliteId ? 2.2 : 1.8;
    } else {
      mesh = makeDepotMesh();
      radius = 2.8;
    }

    if (opts.scale && opts.scale !== 1) {
      mesh.scale.setScalar(opts.scale);
      radius *= opts.scale;
    }

    mesh.position.copy(position);
    mesh.visible = true;
    this.group.add(mesh);

    const beacon =
      kind === 'depot'
        ? ((mesh.getObjectByName('depot-beacon') as THREE.Mesh) ?? null)
        : kind === 'turret'
          ? ((mesh.getObjectByName('turret-beacon') as THREE.Mesh) ?? null)
          : null;

    const fireCooldown = opts.fireCooldown ?? 99;
    const baseScale = opts.scale ?? 1;
    const enemy: Enemy = {
      id: nextEnemyId++,
      kind,
      mesh,
      position: position.clone(),
      health: opts.health,
      maxHealth: opts.health,
      radius,
      alive: true,
      primary: opts.primary,
      fireCooldown,
      fireTimer: fireCooldown * 0.35 + (opts.formationSlot ?? 0) * 0.15,
      orbitCenter: opts.orbitCenter ?? null,
      orbitAngle: opts.orbitAngle ?? 0,
      orbitRadius: opts.orbitRadius ?? 0,
      orbitHeight: opts.orbitHeight ?? position.y,
      scoreValue: opts.scoreValue,
      beacon,
      hitFlash: 0,
      droneRole: opts.droneRole,
      turretMode: opts.turretMode,
      telegraph: createTelegraphState(),
      moveIntent: 'orbit',
      underFireTimer: 0,
      formationId: opts.formationId ?? -1,
      formationSlot: opts.formationSlot ?? 0,
      boltDamage: opts.boltDamage ?? (kind === 'drone' ? 11 : 14),
      engageRange: opts.engageRange ?? (kind === 'drone' ? 58 : 72),
      minRange: opts.minRange ?? 7,
      leadTime: opts.leadTime ?? 0.35,
      telegraphDuration: opts.telegraphDuration ?? 0.4,
      burstCount: opts.burstCount ?? 1,
      burstGap: opts.burstGap ?? 0.1,
      sweepHalfAngle: opts.sweepHalfAngle ?? 0,
      sweepPeriod: opts.sweepPeriod ?? 1,
      pursuitWeight: opts.pursuitWeight ?? 0.5,
      evadeWeight: opts.evadeWeight ?? 0.4,
      preferredRange: opts.preferredRange ?? 30,
      moveSpeed: opts.moveSpeed ?? 1,
      aimYaw: 0,
      eliteId: opts.eliteId,
      deadFor: 0,
      interceptBias: opts.interceptBias ?? 0,
      flankBias: opts.flankBias ?? 0,
      formationPull: opts.formationPull ?? 0,
      tag: opts.tag ?? null,
      velocity: opts.velocity?.clone() ?? null,
      baseScale,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  update(
    dt: number,
    time: number,
    heliPos: THREE.Vector3,
    heliVel: THREE.Vector3,
    playerAlive: boolean,
    ctx: EnemyUpdateContext = {},
  ) {
    const aggression = ctx.director?.aggression ?? 0.5;
    const fireRateMul = ctx.director?.fireRateMul ?? 1;

    for (const enemy of this.enemies) {
      // Soft reclaim of dead drone meshes into pool
      if (!enemy.alive) {
        if (enemy.kind === 'drone' && enemy.mesh.parent) {
          enemy.deadFor += dt;
          if (shouldReclaimCorpse(enemy.deadFor, 2.2)) {
            this.releaseDroneMesh(enemy);
          }
        }
        continue;
      }

      if (enemy.underFireTimer > 0) {
        enemy.underFireTimer = Math.max(0, enemy.underFireTimer - dt);
      }

      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
        enemy.mesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissiveIntensity !== undefined) {
              mat.emissiveIntensity =
                (mat.userData.baseEmissive ?? mat.emissiveIntensity) + enemy.hitFlash * 1.2;
            }
          }
        });
      }

      // --- Drone movement (roles / pursuit / evasion / formations / intercept) ---
      if (enemy.kind === 'drone') {
        let formationSlot = null as ReturnType<typeof formationSlotWorld> | null;
        if (enemy.orbitCenter && enemy.formationPull > 0.2) {
          formationSlot = formationSlotWorld(
            v3(enemy.orbitCenter.x, enemy.orbitCenter.y, enemy.orbitCenter.z),
            enemy.orbitAngle,
            enemy.orbitRadius,
            enemy.orbitHeight,
            enemy.formationSlot,
            8,
            this.tmpSlot,
          );
        }

        const steered = steerDrone({
          position: v3(enemy.position.x, enemy.position.y, enemy.position.z),
          target: v3(heliPos.x, heliPos.y, heliPos.z),
          targetVelocity: v3(heliVel.x, heliVel.y, heliVel.z),
          anchor: enemy.orbitCenter
            ? v3(enemy.orbitCenter.x, enemy.orbitCenter.y, enemy.orbitCenter.z)
            : null,
          formationSlot,
          formationPull: enemy.formationPull,
          preferredRange: enemy.preferredRange,
          moveSpeed: enemy.moveSpeed,
          pursuitWeight: enemy.pursuitWeight,
          evadeWeight: enemy.evadeWeight,
          aggression,
          underFire: enemy.underFireTimer > 0,
          healthRatio: enemy.health / enemy.maxHealth,
          interceptBias: enemy.interceptBias,
          flankBias: enemy.flankBias,
          dt,
          time,
          id: enemy.id,
          orbitAngle: enemy.orbitAngle,
          orbitRadius: enemy.orbitRadius,
          orbitHeight: enemy.orbitHeight,
        });
        enemy.position.set(steered.position.x, steered.position.y, steered.position.z);
        enemy.orbitAngle = steered.orbitAngle;
        enemy.moveIntent = steered.intent;
        enemy.mesh.position.copy(enemy.position);
        enemy.mesh.rotation.y = steered.yaw;
        const ring = enemy.mesh.getObjectByName('drone-ring');
        if (ring) ring.rotation.z = time * (enemy.eliteId ? 4.2 : 3.2);

        // Telegraph ring visual — readable windup cue
        const tel = enemy.mesh.getObjectByName('drone-telegraph') as THREE.Mesh | undefined;
        if (tel) {
          const mat = tel.material as THREE.MeshBasicMaterial;
          mat.opacity = enemy.telegraph.intensity * (enemy.eliteId ? 1.0 : 0.85);
          tel.scale.setScalar(1 + enemy.telegraph.intensity * (enemy.eliteId ? 0.55 : 0.35));
        }
      } else if (enemy.velocity) {
        enemy.position.addScaledVector(enemy.velocity, dt);
        // Keep moving ground units visually alive without leaving their lane.
        enemy.position.y += Math.sin(time * 2 + enemy.id) * 0.01;
        enemy.mesh.position.copy(enemy.position);
        if (enemy.velocity.lengthSq() > 0.01) {
          enemy.mesh.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
        }
      }

      // --- Turret aim ---
      if (enemy.kind === 'turret') {
        const body = enemy.mesh.getObjectByName('turret-body');
        this.tmpDir.subVectors(heliPos, enemy.position);
        this.tmpDir.y = 0;
        if (body && this.tmpDir.lengthSq() > 0.01) {
          let yaw = Math.atan2(this.tmpDir.x, this.tmpDir.z);
          if (enemy.turretMode === 'sweep') {
            yaw += sweepYawOffset(
              time,
              enemy.sweepPeriod,
              enemy.sweepHalfAngle,
              enemy.id * 0.37,
            );
          }
          // Smooth toward aim
          let delta = yaw - enemy.aimYaw;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const turn = (enemy.turretMode ? getTurretMode(enemy.turretMode).turnRate : 2) * dt;
          enemy.aimYaw += Math.max(-turn, Math.min(turn, delta));
          body.rotation.y = enemy.aimYaw;
        }

        if (enemy.beacon) {
          const mat = enemy.beacon.material as THREE.MeshStandardMaterial;
          if (mat.userData.baseEmissive === undefined) {
            mat.userData.baseEmissive = mat.emissiveIntensity;
          }
          mat.emissiveIntensity =
            (mat.userData.baseEmissive as number) + enemy.telegraph.intensity * 1.8;
        }
      }

      if (enemy.primary) {
        const pulse = enemy.baseScale * (1 + Math.sin(time * 3 + enemy.id) * 0.045);
        enemy.mesh.scale.setScalar(pulse);
        if (enemy.beacon) {
          const mat = enemy.beacon.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.22 + Math.sin(time * 2.5 + enemy.id) * 0.12;
        }
      }

      if (!playerAlive) continue;
      if (enemy.kind === 'depot') continue;

      const dist = enemy.position.distanceTo(heliPos);
      const inRange = dist <= enemy.engageRange && dist >= enemy.minRange;

      // Fire cadence gate (director-scaled)
      enemy.fireTimer -= dt * fireRateMul;
      const wantsAttack = inRange && enemy.fireTimer <= 0 && enemy.telegraph.phase === 'idle';

      const telCfg = defaultTelegraphConfig(
        enemy.telegraphDuration,
        enemy.burstCount,
        enemy.burstGap,
      );
      const telResult = updateTelegraph(enemy.telegraph, telCfg, dt, wantsAttack);
      enemy.telegraph = telResult.state;

      if (telResult.startedWindup) {
        // Lock next volley cadence when windup begins
        enemy.fireTimer = enemy.fireCooldown;
      }

      if (!telResult.fire) continue;

      this.tmpOrigin.copy(enemy.position);
      this.tmpOrigin.y += enemy.kind === 'drone' ? 0.5 : 1.4;

      let aim;
      if (enemy.kind === 'turret' && enemy.turretMode === 'flak') {
        aim = aimFlak(
          v3(this.tmpOrigin.x, this.tmpOrigin.y, this.tmpOrigin.z),
          v3(heliPos.x, heliPos.y, heliPos.z),
          v3(heliVel.x, heliVel.y, heliVel.z),
          enemy.leadTime,
          time,
          enemy.id,
        );
      } else {
        // Fair lead with slight miss cone — dodgeable after telegraph
        const miss =
          enemy.turretMode === 'sweep' ? 0.55 : enemy.turretMode === 'burst' ? 0.4 : 0.32;
        aim = aimFair(
          v3(this.tmpOrigin.x, this.tmpOrigin.y, this.tmpOrigin.z),
          v3(heliPos.x, heliPos.y, heliPos.z),
          v3(heliVel.x, heliVel.y, heliVel.z),
          enemy.leadTime,
          time,
          enemy.id,
          miss,
        );
      }

      if (enemy.kind === 'turret' && enemy.turretMode === 'sweep') {
        // Align bolt to turret aim yaw (sweep already baked into aimYaw)
        const s = Math.sin(enemy.aimYaw);
        const c = Math.cos(enemy.aimYaw);
        this.tmpDir.set(s, aim.y * 0.85, c).normalize();
      } else {
        this.tmpDir.set(aim.x, aim.y, aim.z);
      }

      this.weapons.spawnEnemyBolt(this.tmpOrigin, this.tmpDir, enemy.boltDamage);
      this.effects.spawnTracer(this.tmpOrigin, this.tmpDir, COLORS.orangeHot);
    }
  }

  applyProjectileHits(
    projectiles: ReadonlyArray<{
      mesh: THREE.Mesh;
      radius: number;
      damage: number;
      fromPlayer: boolean;
      alive: boolean;
    }>,
  ): EnemyHitResult[] {
    const results: EnemyHitResult[] = [];

    for (const p of projectiles) {
      if (!p.alive || !p.fromPlayer) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const hitRadius = enemy.radius + p.radius;
        const bodyY = enemy.kind === 'drone' ? enemy.position.y : enemy.position.y + 1.2;
        const bodyPos = this.tmpOrigin.set(enemy.position.x, bodyY, enemy.position.z);
        if (p.mesh.position.distanceTo(bodyPos) > hitRadius) continue;

        (p as { alive: boolean }).alive = false;

        const before = enemy.health;
        enemy.health -= p.damage;
        enemy.hitFlash = 1;
        enemy.underFireTimer = 1.4;
        enemy.mesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissiveIntensity !== undefined && mat.userData.baseEmissive === undefined) {
              mat.userData.baseEmissive = mat.emissiveIntensity;
            }
          }
        });

        if (enemy.health <= 0) {
          enemy.alive = false;
          enemy.deadFor = 0;
          enemy.mesh.visible = false;
          if (enemy.primary) this.primariesDestroyed += 1;
          this.effects.spawnExplosion(
            bodyPos.clone(),
            enemy.kind === 'depot' ? 2.0 : enemy.eliteId ? 1.7 : 1.25,
            enemy.kind === 'drone'
              ? (enemy.eliteId
                  ? (getEliteProfile(enemy.eliteId)?.tint ?? 0xffdd44)
                  : enemy.droneRole
                    ? getDroneRole(enemy.droneRole).tint
                    : 0xaa44ff)
              : COLORS.orangeHot,
          );
          results.push({
            enemy,
            destroyed: true,
            points: enemy.scoreValue,
            overkill: before < p.damage * 0.5,
          });
        } else {
          this.effects.spawnImpact(p.mesh.position.clone(), 'metal', 0.9);
          results.push({ enemy, destroyed: false, points: 0, overkill: false });
        }
        break;
      }
    }

    return results;
  }

  checkRamming(heliPos: THREE.Vector3): number {
    let damage = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const bodyY = enemy.kind === 'drone' ? enemy.position.y : enemy.position.y + 1.0;
      const d = heliPos.distanceTo(
        this.tmpOrigin.set(enemy.position.x, bodyY, enemy.position.z),
      );
      if (d < enemy.radius + 1.5) {
        damage = Math.max(damage, enemy.kind === 'depot' ? 18 : enemy.eliteId ? 16 : 12);
      }
    }
    return damage;
  }

  clear() {
    for (const enemy of this.enemies) {
      if (enemy.kind === 'drone') {
        this.releaseDroneMesh(enemy);
      } else {
        this.group.remove(enemy.mesh);
        disposeObject(enemy.mesh);
      }
    }
    this.enemies.length = 0;
    resetWaveRuntime(this.waveRuntime);
    this.primariesDestroyed = 0;
    this.finaleFired = false;
  }

  reset(opts: EnemyLayoutOptions) {
    this.spawnMission(opts);
  }
}
