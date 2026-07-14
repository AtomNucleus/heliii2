import * as THREE from 'three';
import type {
  ColliderAABB,
  ContactInfo,
  HeliCollisionShape,
  NearGroundResult,
  WorldImpactResult,
} from './types';
import type { SpatialHash } from './spatialHash';
import { applyDestructibleHit } from './destructible';

/** Arcade heli body sphere — matches ~TARGET_BODY_LENGTH scale. */
export const HELI_COLLISION: HeliCollisionShape = {
  radius: 2.05,
  centerY: 0.15,
};

/** Closing speed (u/s) above which contact counts as a crash. */
export const CRASH_SPEED = 16;
/** Closing speed band for scrape (graze / slide). */
export const SCRAPE_SPEED = 4.5;
/** Minimum penetration before we bother resolving. */
export const MIN_PENETRATION = 0.02;

export interface ResolveTunables {
  crashSpeed: number;
  scrapeSpeed: number;
  scrapeDamageMul: number;
  crashDamageMul: number;
  scrapeFriction: number;
  crashRestitution: number;
  scrapeRestitution: number;
  /** Soft-landing cushion height above ground / rooftops (m). */
  nearGroundHeight: number;
  /** Max vertical closing speed bleed from near-ground assist. */
  nearGroundBleed: number;
}

export const RESOLVE: ResolveTunables = {
  crashSpeed: CRASH_SPEED,
  scrapeSpeed: SCRAPE_SPEED,
  scrapeDamageMul: 0.35,
  crashDamageMul: 1,
  scrapeFriction: 0.94,
  crashRestitution: 0.22,
  scrapeRestitution: 0.05,
  nearGroundHeight: 7.5,
  nearGroundBleed: 0.42,
};

const _center = new THREE.Vector3();
const _push = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _queryIds: number[] = [];

function emptyContact(): ContactInfo {
  return {
    hit: false,
    normal: _normal.set(0, 1, 0).clone(),
    penetration: 0,
    push: _push.set(0, 0, 0).clone(),
    colliderId: -1,
    kind: 'none',
  };
}

function emptyImpact(contact: ContactInfo = emptyContact()): WorldImpactResult {
  return {
    intensity: 0,
    damage: 0,
    scrape: false,
    crash: false,
    impactKind: 'none',
    closingSpeed: 0,
    contact,
    destroyedPropId: -1,
    nearGroundAssist: 0,
  };
}

/**
 * Sphere vs AABB: closest-point penetration with outward normal.
 * Returns false when separated.
 */
export function sphereVsAABB(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  box: ColliderAABB,
  outNormal: THREE.Vector3,
): { hit: boolean; penetration: number } {
  const qx = THREE.MathUtils.clamp(cx, box.minX, box.maxX);
  const qy = THREE.MathUtils.clamp(cy, box.minY, box.maxY);
  const qz = THREE.MathUtils.clamp(cz, box.minZ, box.maxZ);
  let dx = cx - qx;
  let dy = cy - qy;
  let dz = cz - qz;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    if (dist >= radius) return { hit: false, penetration: 0 };
    outNormal.set(dx / dist, dy / dist, dz / dist);
    return { hit: true, penetration: radius - dist };
  }

  // Center inside AABB — push out via nearest face
  const toMinX = cx - box.minX;
  const toMaxX = box.maxX - cx;
  const toMinY = cy - box.minY;
  const toMaxY = box.maxY - cy;
  const toMinZ = cz - box.minZ;
  const toMaxZ = box.maxZ - cz;
  const m = Math.min(toMinX, toMaxX, toMinY, toMaxY, toMinZ, toMaxZ);
  if (m === toMinX) outNormal.set(-1, 0, 0);
  else if (m === toMaxX) outNormal.set(1, 0, 0);
  else if (m === toMinY) outNormal.set(0, -1, 0);
  else if (m === toMaxY) outNormal.set(0, 1, 0);
  else if (m === toMinZ) outNormal.set(0, 0, -1);
  else outNormal.set(0, 0, 1);
  return { hit: true, penetration: m + radius };
}

/**
 * Query spatial hash and pick the deepest sphere overlap.
 */
export function queryDeepestContact(
  position: THREE.Vector3,
  shape: HeliCollisionShape,
  hash: SpatialHash,
): ContactInfo {
  _center.set(position.x, position.y + shape.centerY, position.z);
  const r = shape.radius;
  const count = hash.queryIds(
    _center.x - r,
    _center.x + r,
    _center.z - r,
    _center.z + r,
    _queryIds,
  );

  let bestPen = 0;
  let bestId = -1;
  let bestKind: ContactInfo['kind'] = 'none';
  _normal.set(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const box = hash.getCollider(_queryIds[i]);
    if (!box) continue;
    // Camera-only rim slabs — never resolve against the heli body
    if (box.tag === 'camera-perimeter') continue;
    // Cheap Y reject
    if (_center.y + r < box.minY || _center.y - r > box.maxY) continue;
    if (_center.x + r < box.minX || _center.x - r > box.maxX) continue;
    if (_center.z + r < box.minZ || _center.z - r > box.maxZ) continue;

    const hit = sphereVsAABB(_center.x, _center.y, _center.z, r, box, _closest);
    if (!hit.hit || hit.penetration <= bestPen) continue;
    bestPen = hit.penetration;
    bestId = box.id;
    bestKind = box.kind;
    _normal.copy(_closest);
  }

  if (bestPen < MIN_PENETRATION) return emptyContact();

  _push.copy(_normal).multiplyScalar(bestPen + 0.03);
  return {
    hit: true,
    normal: _normal.clone(),
    penetration: bestPen,
    push: _push.clone(),
    colliderId: bestId,
    kind: bestKind,
  };
}

/**
 * Soft-landing cushion when descending toward ground or a rooftop.
 * Preserves flight feel — only bleeds excess vertical closing speed.
 */
export function applyNearGroundAssist(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  groundY: number,
  hash: SpatialHash | null,
  shape: HeliCollisionShape = HELI_COLLISION,
  tunables: ResolveTunables = RESOLVE,
): NearGroundResult {
  let surfaceY = groundY;
  // Sample nearby rooftops under the craft (cheap hash query)
  if (hash) {
    _center.set(position.x, position.y + shape.centerY, position.z);
    const pad = shape.radius + 1.5;
    const count = hash.queryIds(
      _center.x - pad,
      _center.x + pad,
      _center.z - pad,
      _center.z + pad,
      _queryIds,
    );
    for (let i = 0; i < count; i++) {
      const box = hash.getCollider(_queryIds[i]);
      if (!box) continue;
      if (box.tag === 'camera-perimeter') continue;
      if (_center.x < box.minX - 0.5 || _center.x > box.maxX + 0.5) continue;
      if (_center.z < box.minZ - 0.5 || _center.z > box.maxZ + 0.5) continue;
      // Only consider tops below the craft
      if (box.maxY > position.y + 0.5) continue;
      if (box.maxY > surfaceY) surfaceY = box.maxY;
    }
  }

  const clearance = position.y - surfaceY - shape.radius * 0.35;
  const band = tunables.nearGroundHeight;
  if (clearance >= band || velocity.y >= -1.5) {
    return { assist: 0, verticalClosing: Math.max(0, -velocity.y), flared: false };
  }

  const t = THREE.MathUtils.clamp(1 - clearance / band, 0, 1);
  const assist = t * t;
  const closing = Math.max(0, -velocity.y);
  // Bleed only the excess — keep intentional landings responsive
  const bleed = assist * tunables.nearGroundBleed * closing;
  if (bleed > 0.05 && velocity.y < 0) {
    velocity.y += bleed;
  }
  return {
    assist,
    verticalClosing: Math.max(0, -velocity.y),
    flared: assist > 0.35 && closing > 8,
  };
}

/**
 * Apply contact: push-out, slide/scrape or crash bounce, damage.
 * Mutates position + velocity. Optionally damages destructible props.
 */
export function resolveWorldImpact(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  contact: ContactInfo,
  tunables: ResolveTunables = RESOLVE,
  hash?: SpatialHash | null,
): WorldImpactResult {
  if (!contact.hit || contact.penetration < MIN_PENETRATION) {
    return emptyImpact(contact);
  }

  position.add(contact.push);

  const n = contact.normal;
  const closing = -velocity.dot(n); // >0 into surface
  const closingSpeed = Math.max(0, closing);

  // Remove inbound normal component (slide)
  if (closing > 0) {
    velocity.addScaledVector(n, closing);
    const isCrash = closingSpeed >= tunables.crashSpeed;
    const restitution = isCrash
      ? tunables.crashRestitution
      : tunables.scrapeRestitution;
    velocity.addScaledVector(n, closing * restitution);

    if (isCrash) {
      velocity.x *= 0.82;
      velocity.z *= 0.82;
      if (n.y < 0.55) velocity.y *= 0.88;
    } else if (closingSpeed >= tunables.scrapeSpeed) {
      // Scrape friction along the wall / roof
      velocity.x *= tunables.scrapeFriction;
      velocity.z *= tunables.scrapeFriction;
      if (Math.abs(n.y) < 0.35) {
        // Vertical wall: bleed a bit of climb/dive
        velocity.y *= 0.96;
      }
    }
  }

  let intensity = 0;
  let damage = 0;
  let scrape = false;
  let crash = false;
  let impactKind: WorldImpactResult['impactKind'] = 'none';
  let destroyedPropId = -1;

  if (closingSpeed >= tunables.crashSpeed) {
    crash = true;
    impactKind = 'crash';
    const t = THREE.MathUtils.clamp(
      (closingSpeed - tunables.crashSpeed) / (tunables.crashSpeed * 1.2),
      0,
      1,
    );
    intensity = 0.45 + t * t * 0.55;
    damage = (10 + intensity * 22) * tunables.crashDamageMul;
    if (contact.kind === 'building') damage *= 1.1;
  } else if (closingSpeed >= tunables.scrapeSpeed || contact.penetration > 0.35) {
    scrape = true;
    impactKind = 'scrape';
    const t = THREE.MathUtils.clamp(
      closingSpeed / tunables.crashSpeed,
      0,
      1,
    );
    intensity = 0.08 + t * 0.28;
    // Continuous scrape deals tiny ticks; caller may rate-limit
    damage =
      closingSpeed >= tunables.scrapeSpeed
        ? (1.2 + t * 3.5) * tunables.scrapeDamageMul
        : 0.4 * tunables.scrapeDamageMul;
  } else if (closingSpeed > 1.2) {
    intensity = THREE.MathUtils.clamp(closingSpeed / tunables.scrapeSpeed, 0, 1) * 0.12;
  }

  // Destructible props absorb impact energy and may shatter
  if (hash && contact.colliderId >= 0 && (crash || closingSpeed >= 7)) {
    const dest = applyDestructibleHit(
      hash,
      contact.colliderId,
      closingSpeed,
      crash,
    );
    if (dest.destroyed) {
      destroyedPropId = dest.colliderId;
      // Prop ate the hit — soften hull damage
      damage *= 0.35;
      intensity = Math.min(intensity, 0.55);
      // Extra outward kick so we don't re-penetrate debris volume
      velocity.addScaledVector(n, Math.min(8, closingSpeed * 0.25));
    } else if (dest.impulse > 0 && contact.kind === 'prop') {
      damage *= 0.75;
    }
  }

  return {
    intensity,
    damage,
    scrape,
    crash,
    impactKind,
    closingSpeed,
    contact,
    destroyedPropId,
    nearGroundAssist: 0,
  };
}

/**
 * Convenience: query + resolve in one call.
 */
export function collideAndResolve(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  hash: SpatialHash,
  shape: HeliCollisionShape = HELI_COLLISION,
  tunables?: ResolveTunables,
): WorldImpactResult {
  const contact = queryDeepestContact(position, shape, hash);
  return resolveWorldImpact(position, velocity, contact, tunables, hash);
}

/** Expose last broadphase query size for debug HUD. */
export function getLastQueryCount(): number {
  return _queryIds.length;
}
