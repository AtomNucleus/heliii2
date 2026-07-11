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
  getDroneRole,
  getTurretMode,
  createTelegraphState,
  defaultTelegraphConfig,
  updateTelegraph,
  steerDrone,
  aimWithLead,
  sweepYawOffset,
  planMissionEncounter,
  hashSeed,
  createRng,
  buildFormation,
  slotWorldPosition,
  pickReinforceSpawnAnchor,
  defaultEncounterBeats,
  type EncounterBeat,
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

function makeDroneMesh(tint = 0xaa44ff): THREE.Group {
  const g = new THREE.Group();
  g.name = 'drone';

  const hull = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x3a2850,
      emissive: tint,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.4,
      flatShading: true,
    }),
  );
  hull.name = 'drone-hull';
  g.add(hull);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.12, 6, 16),
    new THREE.MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 0.9,
      flatShading: true,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.name = 'drone-ring';
  g.add(ring);

  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 1.6),
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
    new THREE.RingGeometry(1.6, 2.1, 16),
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
  private layoutOpts: EnemyLayoutOptions | null = null;
  private encounterBeats: EncounterBeat[] = [];
  private beatsFired = new Set<number>();
  private primariesDestroyed = 0;
  private reinforceRng = createRng(1);

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
      const score = dot * 2 - dist * 0.01 + (e.primary ? 0.15 : 0);
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
    this.encounterBeats = defaultEncounterBeats();
    this.beatsFired.clear();
    this.primariesDestroyed = 0;

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
        },
      );
    }
  }

  /**
   * Spawn a reinforcement formation (director-gated). Returns count added.
   */
  spawnReinforcement(
    roles: DroneRole[],
    formationKind: EncounterBeat['formation'],
    heliPos: THREE.Vector3,
    _label?: string,
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
    const layout = buildFormation(formationKind, roles.length, 12);
    const formationId = 1000 + this.enemies.length;

    for (let i = 0; i < roles.length; i++) {
      const role = roles[i]!;
      const profile = getDroneRole(role);
      const slot = layout.slots[i] ?? layout.slots[0]!;
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
        formationSlot: i,
      });
    }
    return roles.length;
  }

  /**
   * Tick encounter pacing beats (scripted waves). Returns toast label if any.
   */
  tickEncounterPacing(elapsed: number, director?: DirectorSnapshot): string | null {
    // Scripted beats skip only during opening grace; breathers still allow authored waves.
    if (director?.beat === 'grace') return null;

    for (let i = 0; i < this.encounterBeats.length; i++) {
      if (this.beatsFired.has(i)) continue;
      const beat = this.encounterBeats[i]!;
      const timeReady = elapsed >= beat.atTime;
      const objReady = this.primariesDestroyed >= beat.afterPrimariesDestroyed;
      // Fire when either time or objective gate is met (whichever comes first after grace)
      if (!timeReady && !objReady) continue;

      this.beatsFired.add(i);
      return beat.label;
    }
    return null;
  }

  /** Fire the beat at index (used after tickEncounterPacing returns a label). */
  releaseEncounterBeat(label: string, heliPos: THREE.Vector3): number {
    const beat = this.encounterBeats.find((b) => b.label === label);
    if (!beat) return 0;
    return this.spawnReinforcement(beat.droneRoles, beat.formation, heliPos, label);
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
    },
  ) {
    let mesh: THREE.Group;
    let radius: number;
    if (kind === 'turret') {
      mesh = makeTurretMesh(opts.turretMode ?? 'tracker');
      radius = 2.4;
    } else if (kind === 'drone') {
      const tint = opts.droneRole ? getDroneRole(opts.droneRole).tint : 0xaa44ff;
      mesh = makeDroneMesh(tint);
      radius = 1.8;
    } else {
      mesh = makeDepotMesh();
      radius = 2.8;
    }

    mesh.position.copy(position);
    this.group.add(mesh);

    const beacon =
      kind === 'depot'
        ? ((mesh.getObjectByName('depot-beacon') as THREE.Mesh) ?? null)
        : kind === 'turret'
          ? ((mesh.getObjectByName('turret-beacon') as THREE.Mesh) ?? null)
          : null;

    const fireCooldown = opts.fireCooldown ?? 99;
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
    };
    this.enemies.push(enemy);
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
      if (!enemy.alive) continue;

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

      // --- Drone movement (roles / pursuit / evasion / formations) ---
      if (enemy.kind === 'drone') {
        const steered = steerDrone({
          position: v3(enemy.position.x, enemy.position.y, enemy.position.z),
          target: v3(heliPos.x, heliPos.y, heliPos.z),
          targetVelocity: v3(heliVel.x, heliVel.y, heliVel.z),
          anchor: enemy.orbitCenter
            ? v3(enemy.orbitCenter.x, enemy.orbitCenter.y, enemy.orbitCenter.z)
            : null,
          preferredRange: enemy.preferredRange,
          moveSpeed: enemy.moveSpeed,
          pursuitWeight: enemy.pursuitWeight,
          evadeWeight: enemy.evadeWeight,
          aggression,
          underFire: enemy.underFireTimer > 0,
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
        if (ring) ring.rotation.z = time * 3.2;

        // Telegraph ring visual
        const tel = enemy.mesh.getObjectByName('drone-telegraph') as THREE.Mesh | undefined;
        if (tel) {
          const mat = tel.material as THREE.MeshBasicMaterial;
          mat.opacity = enemy.telegraph.intensity * 0.85;
          tel.scale.setScalar(1 + enemy.telegraph.intensity * 0.35);
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
        const pulse = 1 + Math.sin(time * 3 + enemy.id) * 0.045;
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

      const aim = aimWithLead(
        v3(this.tmpOrigin.x, this.tmpOrigin.y, this.tmpOrigin.z),
        v3(heliPos.x, heliPos.y, heliPos.z),
        v3(heliVel.x, heliVel.y, heliVel.z),
        enemy.leadTime,
      );

      if (enemy.kind === 'turret' && enemy.turretMode === 'sweep') {
        // Align bolt to turret aim yaw (sweep already baked into aimYaw)
        const s = Math.sin(enemy.aimYaw);
        const c = Math.cos(enemy.aimYaw);
        this.tmpDir.set(s, aim.y * 0.85, c).normalize();
      } else {
        this.tmpDir.set(aim.x, aim.y, aim.z);
      }

      this.weapons.spawnEnemyBolt(this.tmpOrigin, this.tmpDir, enemy.boltDamage);
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
          enemy.mesh.visible = false;
          if (enemy.primary) this.primariesDestroyed += 1;
          this.effects.spawnExplosion(
            bodyPos.clone(),
            enemy.kind === 'depot' ? 2.0 : 1.25,
            enemy.kind === 'drone'
              ? (enemy.droneRole ? getDroneRole(enemy.droneRole).tint : 0xaa44ff)
              : COLORS.orangeHot,
          );
          results.push({
            enemy,
            destroyed: true,
            points: enemy.scoreValue,
            overkill: before < p.damage * 0.5,
          });
        } else {
          this.effects.spawnHitSpark(p.mesh.position.clone());
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
        damage = Math.max(damage, enemy.kind === 'depot' ? 18 : 12);
      }
    }
    return damage;
  }

  clear() {
    for (const enemy of this.enemies) {
      this.group.remove(enemy.mesh);
      disposeObject(enemy.mesh);
    }
    this.enemies.length = 0;
    this.beatsFired.clear();
    this.primariesDestroyed = 0;
  }

  reset(opts: EnemyLayoutOptions) {
    this.spawnMission(opts);
  }
}
