import * as THREE from 'three';
import {
  buildColliderHash,
  extractBuildingColliders,
  type ExtractOptions,
} from './buildingColliders';
import { SpatialHash } from './spatialHash';
import {
  applyNearGroundAssist,
  collideAndResolve,
  getLastQueryCount,
  HELI_COLLISION,
  RESOLVE,
  queryDeepestContact,
  type ResolveTunables,
} from './resolve';
import { CollisionDebugOverlay, wantCollisionDebug } from './debug';
import { DebrisSystem } from './destructible';
import { queryProximity } from './proximity';
import type {
  CollisionDebugStats,
  ContactInfo,
  DestructResult,
  HeliCollisionShape,
  ImpactFeedbackEvent,
  NearGroundResult,
  ProceduralColliderSpec,
  ProximityWarning,
  WorldImpactResult,
} from './types';

export interface WorldCollisionOptions extends ExtractOptions {
  cellSize?: number;
  shape?: HeliCollisionShape;
  tunables?: Partial<ResolveTunables>;
}

/**
 * Browser-efficient world/building collision facade.
 * AABB proxies + XZ spatial hash — no physics engine.
 *
 * Hooks for controller / combat / mission:
 * - `onImpact` — scrape/crash feedback
 * - `onPropDestroyed` — destructible set-piece shattered
 * - `onProximity` — obstacle warning level changes
 */
export class WorldCollision {
  readonly hash: SpatialHash;
  readonly shape: HeliCollisionShape;
  readonly debug: CollisionDebugOverlay;
  readonly debris: DebrisSystem;
  private readonly tunables: ResolveTunables;
  private scrapeCooldown = 0;
  private crashCooldown = 0;
  private lastResult: WorldImpactResult | null = null;
  private lastProximity: ProximityWarning | null = null;
  private lastProximityLevel: 0 | 1 | 2 | 3 = 0;
  private proximityCooldown = 0;
  private getGroundHeight: ((x: number, z: number) => number) | null = null;
  private scene: THREE.Scene | null = null;

  /** Fired after a resolved world impact (rate-limited damage already applied). */
  onImpact: ((event: ImpactFeedbackEvent) => void) | null = null;
  /** Fired when a destructible prop is shattered. */
  onPropDestroyed: ((result: DestructResult) => void) | null = null;
  /** Fired when proximity warning level increases (or critical ticks). */
  onProximity: ((warning: ProximityWarning) => void) | null = null;

  constructor(hash: SpatialHash, options: WorldCollisionOptions = {}) {
    this.hash = hash;
    this.shape = options.shape ?? HELI_COLLISION;
    this.tunables = { ...RESOLVE, ...options.tunables };
    this.debug = new CollisionDebugOverlay();
    this.debug.setHash(hash);
    this.debris = new DebrisSystem();
  }

  static fromMeshes(
    meshes: THREE.Object3D[],
    mapBounds: THREE.Box3,
    options: WorldCollisionOptions = {},
  ): WorldCollision {
    const t0 = performance.now();
    const colliders = extractBuildingColliders(meshes, mapBounds, options);
    const hash = buildColliderHash(colliders, options.cellSize);
    const ms = performance.now() - t0;
    const destructibles = colliders.filter((c) => c.hp !== undefined).length;
    console.info('[collision] proxies ready', {
      colliders: colliders.length,
      cells: hash.cellCount,
      cellSize: hash.cellSize,
      buildings: colliders.filter((c) => c.kind === 'building').length,
      props: colliders.filter((c) => c.kind === 'prop').length,
      destructibles,
      ms: Math.round(ms),
    });
    return new WorldCollision(hash, options);
  }

  /** Wire ground sampler for near-ground / rooftop soft-landing assist. */
  setGroundHeightSampler(fn: ((x: number, z: number) => number) | null) {
    this.getGroundHeight = fn;
  }

  attachDebug(scene: THREE.Scene, enable = wantCollisionDebug()) {
    this.scene = scene;
    this.debug.attach(scene);
    this.debug.setEnabled(enable);
    this.debris.attach(scene);
  }

  setDebugEnabled(on: boolean) {
    this.debug.setEnabled(on);
    try {
      window.localStorage?.setItem('heli.debugCollision', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  toggleDebug(): boolean {
    const on = this.debug.toggle();
    this.setDebugEnabled(on);
    return on;
  }

  getStats(): CollisionDebugStats {
    return this.debug.getStats();
  }

  query(position: THREE.Vector3): ContactInfo {
    return queryDeepestContact(position, this.shape, this.hash);
  }

  /** Obstacle proximity for HUD / audio (does not mutate flight state). */
  queryProximity(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ): ProximityWarning {
    return queryProximity(position, velocity, this.hash, this.shape);
  }

  getLastProximity(): ProximityWarning | null {
    return this.lastProximity;
  }

  /**
   * Register a procedural / mission set-piece AABB (depot, barrier, …).
   * Inserts into the spatial hash without a full rebuild.
   */
  registerCollider(spec: ProceduralColliderSpec): number {
    const kind = spec.kind ?? 'prop';
    const entry = {
      minX: spec.minX,
      minY: spec.minY,
      minZ: spec.minZ,
      maxX: spec.maxX,
      maxY: spec.maxY,
      maxZ: spec.maxZ,
      kind,
      active: true as boolean,
      tag: spec.tag,
      hp: undefined as number | undefined,
      maxHp: undefined as number | undefined,
    };
    if (spec.destructible || spec.hp !== undefined) {
      const hp = spec.hp ?? 32;
      entry.hp = hp;
      entry.maxHp = hp;
    }
    const id = this.hash.addCollider(entry);
    this.debug.setHash(this.hash);
    return id;
  }

  /** Soft-disable a collider (combat kill / scripted removal). */
  disableCollider(id: number): boolean {
    const ok = this.hash.setActive(id, false);
    if (ok) this.debug.markInactive(id);
    return ok;
  }

  /** Re-enable a previously disabled collider. */
  enableCollider(id: number): boolean {
    return this.hash.setActive(id, true);
  }

  /**
   * Mission / restart: restore destructible HP, clear debris, reset cooldowns.
   */
  reset() {
    this.hash.resetDestructibles();
    this.debris.reset();
    this.scrapeCooldown = 0;
    this.crashCooldown = 0;
    this.proximityCooldown = 0;
    this.lastResult = null;
    this.lastProximity = null;
    this.lastProximityLevel = 0;
    this.debug.setHash(this.hash);
    this.debug.recordFrame({
      propsDestroyed: 0,
      debrisAlive: 0,
      activeColliders: this.hash.activeCount(),
    });
  }

  /**
   * Resolve heli vs buildings for one frame.
   * Rate-limits scrape damage so continuous contact doesn't melt the hull.
   */
  resolve(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    dt: number,
  ): WorldImpactResult {
    const t0 = performance.now();
    if (this.scrapeCooldown > 0) this.scrapeCooldown -= dt;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.proximityCooldown > 0) this.proximityCooldown -= dt;

    // Near-ground / rooftop soft-landing assist (before contact resolve)
    let nearAssist = 0;
    if (this.getGroundHeight) {
      const groundY = this.getGroundHeight(position.x, position.z);
      const ng: NearGroundResult = applyNearGroundAssist(
        position,
        velocity,
        groundY,
        this.hash,
        this.shape,
        this.tunables,
      );
      nearAssist = ng.assist;
    }

    const result = collideAndResolve(
      position,
      velocity,
      this.hash,
      this.shape,
      this.tunables,
    );
    result.nearGroundAssist = nearAssist;

    // Rate-limit damage ticks
    if (result.crash) {
      if (this.crashCooldown > 0) {
        result.damage = 0;
      } else if (result.damage > 0) {
        this.crashCooldown = 0.35;
      }
    } else if (result.scrape) {
      if (this.scrapeCooldown > 0) {
        result.damage = 0;
      } else if (result.damage > 0) {
        this.scrapeCooldown = 0.22;
      }
    }

    // Destructible shatter VFX + hooks
    if (result.destroyedPropId >= 0) {
      const box = this.hash.getCollider(result.destroyedPropId);
      if (box) {
        const center = new THREE.Vector3(
          (box.minX + box.maxX) * 0.5,
          (box.minY + box.maxY) * 0.5,
          (box.minZ + box.maxZ) * 0.5,
        );
        this.debris.spawn(center, result.closingSpeed, box.kind);
        this.debug.markInactive(result.destroyedPropId);
        const dest: DestructResult = {
          destroyed: true,
          colliderId: result.destroyedPropId,
          kind: box.kind,
          center,
          impulse: result.closingSpeed,
          tag: box.tag,
        };
        this.onPropDestroyed?.(dest);
      }
    }

    if (result.contact.hit && (result.intensity > 0.02 || result.damage > 0)) {
      const box =
        result.contact.colliderId >= 0
          ? this.hash.getCollider(result.contact.colliderId)
          : undefined;
      this.onImpact?.({
        kind: result.impactKind,
        source:
          result.contact.kind === 'prop'
            ? 'prop'
            : result.contact.kind === 'ground'
              ? 'ground'
              : 'building',
        intensity: result.intensity,
        damage: result.damage,
        closingSpeed: result.closingSpeed,
        position: position.clone(),
        normal: result.contact.normal.clone(),
        scrape: result.scrape,
        crash: result.crash,
        destroyedProp: result.destroyedPropId >= 0,
        nearGroundAssist: nearAssist,
        colliderId: result.contact.colliderId,
        tag: box?.tag,
      });
    }

    // Proximity warnings (cheap; reuse hash)
    const prox = queryProximity(position, velocity, this.hash, this.shape);
    this.lastProximity = prox;
    if (
      prox.level > 0 &&
      (prox.level > this.lastProximityLevel ||
        (prox.level >= 3 && this.proximityCooldown <= 0))
    ) {
      this.onProximity?.(prox);
      this.proximityCooldown = prox.level >= 3 ? 0.55 : 0.9;
    }
    this.lastProximityLevel = prox.level;

    this.debris.update(dt);
    this.lastResult = result;
    const resolveMs = performance.now() - t0;
    this.debug.recordFrame({
      lastQueryCount: getLastQueryCount(),
      lastHit: result.contact.hit,
      lastImpactKind: result.impactKind,
      lastClosingSpeed: result.closingSpeed,
      lastDamage: result.damage,
      lastResolveMs: resolveMs,
      colliderCount: this.hash.size,
      activeColliders: this.hash.activeCount(),
      hashCells: this.hash.cellCount,
      debrisAlive: this.debris.alive,
      propsDestroyed: this.debris.propsDestroyed,
      proximityLevel: prox.level,
      proximityDistance: Number.isFinite(prox.distance) ? prox.distance : 999,
    });
    this.debug.update(
      position,
      result.contact.hit ? result.contact.normal : null,
      result.contact.hit,
      result.impactKind,
      prox,
    );

    return result;
  }

  getLastResult(): WorldImpactResult | null {
    return this.lastResult;
  }

  dispose() {
    if (this.scene) {
      this.debug.detach(this.scene);
      this.debris.detach(this.scene);
    }
    this.debris.dispose();
  }
}
