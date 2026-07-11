import * as THREE from 'three';
import {
  allocateFragmentSlots,
  debrisPhysicsBudgetFromTier,
  type DebrisPhysicsBudget,
} from './budgets';
import {
  generateFragmentBurst,
  type FragmentBurstInput,
  type FragmentSpec,
} from './fragments';
import {
  excessBodiesToCull,
  fragmentOpacity,
  shouldCullFragment,
} from './lifecycle';
import { initRapier, type RapierModule } from './rapierInit';
import type { QualityTier } from '../effects/quality';

export interface DebrisBodySlot {
  mesh: THREE.Mesh;
  /** Rapier rigid body handle; null on kinematic fallback. */
  body: InstanceType<RapierModule['RigidBody']> | null;
  /** Rapier collider handle. */
  collider: InstanceType<RapierModule['Collider']> | null;
  age: number;
  maxLife: number;
  active: boolean;
  /** Kinematic fallback state when Rapier is unavailable. */
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
}

export interface DebrisPhysicsOptions {
  gravityY?: number;
  groundY?: number;
  parent?: THREE.Object3D;
}

/**
 * Visual-only debris dynamics. Uses Rapier when available; otherwise
 * integrates the same FragmentSpec set with simple Euler motion.
 */
export class DebrisPhysicsWorld {
  readonly group = new THREE.Group();
  readonly enabled: boolean;

  private readonly RAPIER: RapierModule | null;
  private readonly world: InstanceType<RapierModule['World']> | null;
  private budget: DebrisPhysicsBudget;
  private readonly slots: DebrisBodySlot[] = [];
  private readonly active: DebrisBodySlot[] = [];
  private readonly pool: DebrisBodySlot[] = [];
  private readonly sharedGeos: THREE.BufferGeometry[];
  private readonly gravityY: number;
  private readonly follow = new THREE.Vector3();
  private hasFollow = false;
  private accumulator = 0;
  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }

  private constructor(
    RAPIER: RapierModule | null,
    world: InstanceType<RapierModule['World']> | null,
    options: DebrisPhysicsOptions,
    budget: DebrisPhysicsBudget,
  ) {
    this.RAPIER = RAPIER;
    this.world = world;
    this.enabled = !!world;
    this.budget = budget;
    this.gravityY = options.gravityY ?? -22;
    this.group.name = 'rapier-debris';
    if (options.parent) options.parent.add(this.group);

    this.sharedGeos = [
      new THREE.BoxGeometry(0.35, 0.22, 0.28),
      new THREE.TetrahedronGeometry(0.28, 0),
      new THREE.BoxGeometry(0.5, 0.12, 0.2),
    ];
  }

  static async create(
    options: DebrisPhysicsOptions = {},
    tier: QualityTier = 'high',
  ): Promise<DebrisPhysicsWorld> {
    const budget = debrisPhysicsBudgetFromTier(tier);
    const outcome = await initRapier();
    if (!outcome.ok || !budget.enabled) {
      return new DebrisPhysicsWorld(null, null, options, budget);
    }

    const RAPIER = outcome.RAPIER;
    const gravityY = options.gravityY ?? -22;
    const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
    world.timestep = 1 / budget.stepHz;

    // Static ground plane for believable impacts (visual only).
    const groundY = options.groundY ?? 0;
    const groundBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY - 0.5, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setRestitution(0.15).setFriction(0.7),
      groundBody,
    );

    return new DebrisPhysicsWorld(RAPIER, world, options, budget);
  }

  /** Always-safe factory when async init is not desired (kinematic only). */
  static createKinematic(
    options: DebrisPhysicsOptions = {},
    tier: QualityTier = 'medium',
  ): DebrisPhysicsWorld {
    return new DebrisPhysicsWorld(null, null, options, debrisPhysicsBudgetFromTier(tier));
  }

  get activeCount(): number {
    return this.active.length;
  }

  get usingRapier(): boolean {
    return this.enabled && !!this.world;
  }

  getBudget(): DebrisPhysicsBudget {
    return this.budget;
  }

  applyBudget(budget: DebrisPhysicsBudget) {
    this.budget = budget;
    if (this.world) {
      this.world.timestep = 1 / Math.max(20, budget.stepHz);
    }
    const drop = excessBodiesToCull(this.active.length, budget.maxBodies);
    for (let i = 0; i < drop; i++) {
      const slot = this.active[0];
      if (!slot) break;
      this.releaseSlot(slot);
      this.active.shift();
    }
  }

  applyQualityTier(tier: QualityTier) {
    this.applyBudget(debrisPhysicsBudgetFromTier(tier));
  }

  setFollowTarget(pos: THREE.Vector3 | null) {
    if (!pos) {
      this.hasFollow = false;
      return;
    }
    this.follow.copy(pos);
    this.hasFollow = true;
  }

  setGroundY(y: number) {
    // Ground is fixed at create-time for simplicity; kinematic path uses soft floor.
    void y;
  }

  /**
   * Spawn a burst from a pure FragmentBurstInput.
   * Returns number of fragments actually created.
   */
  spawnBurst(input: FragmentBurstInput, specs?: FragmentSpec[]): number {
    if (this._disposed || !this.budget.enabled) return 0;
    const fragments =
      specs ??
      generateFragmentBurst(input, this.budget, this.active.length, Math.random);
    let spawned = 0;
    for (const spec of fragments) {
      if (this.active.length >= this.budget.maxBodies) break;
      if (!this.spawnSpec(spec)) break;
      spawned++;
    }
    return spawned;
  }

  /** Convenience for combat / collision call sites. */
  spawnAt(
    position: THREE.Vector3,
    impulse: number,
    colorHint?: number,
  ): number {
    return this.spawnBurst({
      origin: [position.x, position.y, position.z],
      impulse,
      colorHint,
      geoCount: this.sharedGeos.length,
    });
  }

  update(dt: number) {
    if (this._disposed || dt <= 0) return;

    if (this.world && this.RAPIER) {
      this.accumulator += dt;
      const step = this.world.timestep;
      let guard = 0;
      while (this.accumulator >= step && guard < 4) {
        this.world.step();
        this.accumulator -= step;
        guard++;
      }
      // Avoid spiral of death — drop remainder if heavily behind.
      if (this.accumulator > step * 2) this.accumulator = 0;
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.age += dt;

      let speedSq: number;
      let sleeping = false;

      if (slot.body && this.world) {
        const t = slot.body.translation();
        const r = slot.body.rotation();
        slot.mesh.position.set(t.x, t.y, t.z);
        slot.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        const lv = slot.body.linvel();
        speedSq = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
        sleeping = slot.body.isSleeping();
      } else {
        // Kinematic fallback — mirrors previous combat debris feel.
        slot.velocity.y += this.gravityY * dt;
        slot.mesh.position.addScaledVector(slot.velocity, dt);
        slot.mesh.rotation.x += slot.angular.x * dt;
        slot.mesh.rotation.y += slot.angular.y * dt;
        slot.mesh.rotation.z += slot.angular.z * dt;
        slot.velocity.x *= 1 - 0.35 * dt;
        slot.velocity.z *= 1 - 0.35 * dt;
        // Soft ground bounce for believable impacts without Rapier.
        if (slot.mesh.position.y < 0.05) {
          slot.mesh.position.y = 0.05;
          if (slot.velocity.y < 0) {
            slot.velocity.y *= -0.25;
            slot.velocity.x *= 0.7;
            slot.velocity.z *= 0.7;
            slot.angular.multiplyScalar(0.6);
          }
          sleeping = slot.velocity.lengthSq() < this.budget.sleepSpeedSq;
        }
        speedSq = slot.velocity.lengthSq();
      }

      const mat = slot.mesh.material as THREE.MeshStandardMaterial;
      const t = fragmentOpacity(slot.age, slot.maxLife);
      mat.opacity = t;
      mat.emissiveIntensity = t * 0.55;

      let distanceSq = Number.POSITIVE_INFINITY;
      if (this.hasFollow) {
        distanceSq = slot.mesh.position.distanceToSquared(this.follow);
      }

      if (
        shouldCullFragment(
          {
            age: slot.age,
            maxLife: slot.maxLife,
            speedSq,
            sleeping,
            distanceSq,
          },
          this.budget,
        )
      ) {
        this.active.splice(i, 1);
        this.releaseSlot(slot);
      }
    }
  }

  clear() {
    for (const slot of this.active) this.releaseSlot(slot);
    this.active.length = 0;
    this.accumulator = 0;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
    for (const geo of this.sharedGeos) geo.dispose();
    for (const slot of this.pool) {
      (slot.mesh.material as THREE.Material).dispose();
    }
    for (const slot of this.slots) {
      if (slot.mesh.material) {
        (slot.mesh.material as THREE.Material).dispose();
      }
    }
    this.pool.length = 0;
    this.world?.free();
    this.group.parent?.remove(this.group);
  }

  private spawnSpec(spec: FragmentSpec): boolean {
    const free = allocateFragmentSlots(1, this.active.length, this.budget);
    if (free <= 0) return false;

    const slot = this.acquireSlot();
    const geo = this.sharedGeos[spec.geoIndex % this.sharedGeos.length];
    slot.mesh.geometry = geo;
    const mat = slot.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(spec.color);
    mat.emissiveIntensity = 0.35;
    mat.opacity = 1;
    slot.mesh.scale.setScalar(spec.scale);
    slot.mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
    slot.mesh.rotation.set(0, 0, 0);
    slot.mesh.quaternion.identity();
    slot.age = 0;
    slot.maxLife = spec.life;
    slot.active = true;
    slot.velocity.set(
      spec.linearVelocity[0],
      spec.linearVelocity[1],
      spec.linearVelocity[2],
    );
    slot.angular.set(
      spec.angularVelocity[0],
      spec.angularVelocity[1],
      spec.angularVelocity[2],
    );

    if (this.world && this.RAPIER) {
      const desc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spec.position[0], spec.position[1], spec.position[2])
        .setLinvel(
          spec.linearVelocity[0],
          spec.linearVelocity[1],
          spec.linearVelocity[2],
        )
        .setAngvel({
          x: spec.angularVelocity[0],
          y: spec.angularVelocity[1],
          z: spec.angularVelocity[2],
        })
        .setCanSleep(true)
        .setCcdEnabled(true);
      const body = this.world.createRigidBody(desc);
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.cuboid(
          spec.halfExtents[0],
          spec.halfExtents[1],
          spec.halfExtents[2],
        )
          .setDensity(Math.max(0.2, spec.mass / Math.max(0.01, spec.halfExtents[0] * spec.halfExtents[1] * spec.halfExtents[2] * 8)))
          .setRestitution(0.28)
          .setFriction(0.55),
        body,
      );
      slot.body = body;
      slot.collider = collider;
    } else {
      slot.body = null;
      slot.collider = null;
    }

    slot.mesh.visible = true;
    this.group.add(slot.mesh);
    this.active.push(slot);
    return true;
  }

  private acquireSlot(): DebrisBodySlot {
    const pooled = this.pool.pop();
    if (pooled) return pooled;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a5560,
      emissive: 0xff6b20,
      emissiveIntensity: 0.35,
      roughness: 0.7,
      metalness: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(this.sharedGeos[0], mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    const slot: DebrisBodySlot = {
      mesh,
      body: null,
      collider: null,
      age: 0,
      maxLife: 1,
      active: false,
      velocity: new THREE.Vector3(),
      angular: new THREE.Vector3(),
    };
    this.slots.push(slot);
    return slot;
  }

  private releaseSlot(slot: DebrisBodySlot) {
    if (slot.body && this.world) {
      this.world.removeRigidBody(slot.body);
    }
    slot.body = null;
    slot.collider = null;
    slot.active = false;
    slot.mesh.visible = false;
    if (slot.mesh.parent) this.group.remove(slot.mesh);
    this.pool.push(slot);
  }
}

/** Shared runtime handle — set during boot, null until ready / on failure path. */
let sharedDebrisPhysics: DebrisPhysicsWorld | null = null;

export function getSharedDebrisPhysics(): DebrisPhysicsWorld | null {
  return sharedDebrisPhysics;
}

export function setSharedDebrisPhysics(world: DebrisPhysicsWorld | null) {
  sharedDebrisPhysics = world;
}

export async function ensureSharedDebrisPhysics(
  options?: DebrisPhysicsOptions,
  tier?: QualityTier,
): Promise<DebrisPhysicsWorld> {
  if (sharedDebrisPhysics && !sharedDebrisPhysics.disposed) {
    return sharedDebrisPhysics;
  }
  sharedDebrisPhysics = await DebrisPhysicsWorld.create(options, tier);
  return sharedDebrisPhysics;
}
