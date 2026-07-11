import * as THREE from 'three';
import {
  buildColliderHash,
  extractBuildingColliders,
  type ExtractOptions,
} from './buildingColliders';
import { SpatialHash } from './spatialHash';
import {
  collideAndResolve,
  getLastQueryCount,
  HELI_COLLISION,
  queryDeepestContact,
  RESOLVE,
  type ResolveTunables,
} from './resolve';
import { CollisionDebugOverlay, wantCollisionDebug } from './debug';
import type {
  CollisionDebugStats,
  ContactInfo,
  HeliCollisionShape,
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
 */
export class WorldCollision {
  readonly hash: SpatialHash;
  readonly shape: HeliCollisionShape;
  readonly debug: CollisionDebugOverlay;
  private readonly tunables: ResolveTunables;
  private scrapeCooldown = 0;
  private crashCooldown = 0;
  private lastResult: WorldImpactResult | null = null;

  constructor(hash: SpatialHash, options: WorldCollisionOptions = {}) {
    this.hash = hash;
    this.shape = options.shape ?? HELI_COLLISION;
    this.tunables = { ...RESOLVE, ...options.tunables };
    this.debug = new CollisionDebugOverlay();
    this.debug.setHash(hash);
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
    console.info('[collision] proxies ready', {
      colliders: colliders.length,
      cells: hash.cellCount,
      cellSize: hash.cellSize,
      buildings: colliders.filter((c) => c.kind === 'building').length,
      ms: Math.round(ms),
    });
    return new WorldCollision(hash, options);
  }

  attachDebug(scene: THREE.Scene, enable = wantCollisionDebug()) {
    this.debug.attach(scene);
    this.debug.setEnabled(enable);
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

    const result = collideAndResolve(
      position,
      velocity,
      this.hash,
      this.shape,
      this.tunables,
    );

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
      hashCells: this.hash.cellCount,
    });
    this.debug.update(
      position,
      result.contact.hit ? result.contact.normal : null,
      result.contact.hit,
      result.impactKind,
    );

    return result;
  }

  getLastResult(): WorldImpactResult | null {
    return this.lastResult;
  }
}
