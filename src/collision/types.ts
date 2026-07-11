import type * as THREE from 'three';

/** Axis-aligned building / prop proxy in world space. */
export interface ColliderAABB {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Rough classification for tuning / debug color. */
  kind: 'building' | 'prop' | 'ground';
  /**
   * When false, broadphase still finds the id but narrowphase skips it.
   * Used for destroyed destructible props without rebuilding the hash.
   */
  active?: boolean;
  /** Hit points for destructible props (undefined = indestructible). */
  hp?: number;
  maxHp?: number;
  /** Optional tag for mission / combat hooks (depot, barrier, …). */
  tag?: string;
}

export type ImpactKind = 'none' | 'scrape' | 'crash';

export interface ContactInfo {
  hit: boolean;
  /** Outward normal from solid into free space. */
  normal: THREE.Vector3;
  /** Penetration depth along the normal. */
  penetration: number;
  /** World-space push to clear the collider. */
  push: THREE.Vector3;
  /** Collider id when known (−1 if synthetic / ground slab). */
  colliderId: number;
  kind: ColliderAABB['kind'] | 'none';
}

export interface WorldImpactResult {
  intensity: number;
  damage: number;
  /** Continuous low-speed contact (wall graze / rooftop skim). */
  scrape: boolean;
  /** High closing-speed hit. */
  crash: boolean;
  impactKind: ImpactKind;
  /** Closing speed into the surface (units/s). */
  closingSpeed: number;
  contact: ContactInfo;
  /** Prop destroyed this frame (−1 if none). */
  destroyedPropId: number;
  /** Near-ground / rooftop soft-landing assist 0..1. */
  nearGroundAssist: number;
}

export interface CollisionDebugStats {
  colliderCount: number;
  activeColliders: number;
  hashCells: number;
  lastQueryCount: number;
  lastHit: boolean;
  lastImpactKind: ImpactKind;
  lastClosingSpeed: number;
  lastDamage: number;
  lastResolveMs: number;
  debrisAlive: number;
  propsDestroyed: number;
  proximityLevel: number;
  proximityDistance: number;
}

export interface HeliCollisionShape {
  /** Primary body sphere radius. */
  radius: number;
  /** Vertical offset of sphere center from heli root (usually slightly below). */
  centerY: number;
}

/** Feedback event for audio / HUD / VFX consumers. */
export interface ImpactFeedbackEvent {
  kind: ImpactKind;
  source: 'building' | 'prop' | 'ground' | 'debris';
  intensity: number;
  damage: number;
  closingSpeed: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  scrape: boolean;
  crash: boolean;
  destroyedProp: boolean;
  nearGroundAssist: number;
  colliderId: number;
  tag?: string;
}

export interface NearGroundResult {
  /** 0..1 how strongly the safety cushion is engaged. */
  assist: number;
  /** Softened vertical closing speed after assist. */
  verticalClosing: number;
  /** True when flare reduced an otherwise hard landing. */
  flared: boolean;
}

export interface DestructResult {
  destroyed: boolean;
  colliderId: number;
  kind: ColliderAABB['kind'] | 'none';
  center: THREE.Vector3;
  impulse: number;
  tag?: string;
}

/** Obstacle proximity warning for HUD / audio / mission pacing. */
export interface ProximityWarning {
  /** 0 = clear, 1 = caution, 2 = warning, 3 = critical. */
  level: 0 | 1 | 2 | 3;
  /** Distance from heli sphere surface to nearest solid (m). */
  distance: number;
  /** Unit vector from heli toward the obstacle. */
  direction: THREE.Vector3;
  colliderId: number;
  kind: ColliderAABB['kind'] | 'none';
  /** True when the obstacle sits in the velocity / nose cone. */
  ahead: boolean;
  tag?: string;
}

/** Options when registering a procedural / mission set-piece collider. */
export interface ProceduralColliderSpec {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  kind?: ColliderAABB['kind'];
  /** When set, prop can be shattered by hard impacts. */
  destructible?: boolean;
  hp?: number;
  tag?: string;
}
