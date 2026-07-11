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
}

export interface CollisionDebugStats {
  colliderCount: number;
  hashCells: number;
  lastQueryCount: number;
  lastHit: boolean;
  lastImpactKind: ImpactKind;
  lastClosingSpeed: number;
  lastDamage: number;
  lastResolveMs: number;
}

export interface HeliCollisionShape {
  /** Primary body sphere radius. */
  radius: number;
  /** Vertical offset of sphere center from heli root (usually slightly below). */
  centerY: number;
}
