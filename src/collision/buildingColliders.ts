import * as THREE from 'three';
import type { ColliderAABB } from './types';
import { SpatialHash } from './spatialHash';

/** Skip decorative / non-solid materials by name. */
const SKIP_MAT = /water|fence|glass|decal|leaf|foliage|particle/i;
/** Prefer solid structure names when present. */
const BUILDING_HINT = /build|hangar|wall|tower|depot|container|crate|house|roof|bunker|wall/i;

export interface ExtractOptions {
  /** Minimum horizontal footprint (m²) to keep. */
  minFootprint?: number;
  /** Minimum vertical extent to classify as building. */
  minBuildingHeight?: number;
  /** Drop boxes larger than this fraction of map span (likely terrain slabs). */
  maxSpanFraction?: number;
  /** Max colliders retained after filtering (keeps query cheap). */
  maxColliders?: number;
}

const DEFAULTS: Required<ExtractOptions> = {
  minFootprint: 2.5,
  minBuildingHeight: 2.2,
  maxSpanFraction: 0.72,
  maxColliders: 900,
};

/**
 * Derive practical AABB proxies from map meshes.
 * Prefer mesh bounding boxes (cheap, stable) over triangle physics.
 */
export function extractBuildingColliders(
  meshes: THREE.Object3D[],
  mapBounds: THREE.Box3,
  options: ExtractOptions = {},
): ColliderAABB[] {
  const opt = { ...DEFAULTS, ...options };
  const mapSize = new THREE.Vector3();
  mapBounds.getSize(mapSize);
  const maxSpan = Math.max(mapSize.x, mapSize.z) * opt.maxSpanFraction;

  const box = new THREE.Box3();
  const raw: ColliderAABB[] = [];
  let nextId = 0;

  for (const obj of meshes) {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) continue;

    const matName = materialName(mesh);
    if (SKIP_MAT.test(matName) || SKIP_MAT.test(mesh.name)) continue;

    mesh.updateWorldMatrix(true, false);
    box.setFromObject(mesh);
    if (box.isEmpty()) continue;

    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    if (sx < 0.35 || sz < 0.35 || sy < 0.25) continue;

    const footprint = sx * sz;
    if (footprint < opt.minFootprint && sy < opt.minBuildingHeight) continue;

    // Reject near-map-sized slabs (ground / water planes mis-tagged)
    if (sx > maxSpan && sz > maxSpan && sy < opt.minBuildingHeight * 1.5) {
      continue;
    }

    // Clamp into play bounds with a small pad
    const minX = Math.max(box.min.x, mapBounds.min.x - 2);
    const maxX = Math.min(box.max.x, mapBounds.max.x + 2);
    const minZ = Math.max(box.min.z, mapBounds.min.z - 2);
    const maxZ = Math.min(box.max.z, mapBounds.max.z + 2);
    const minY = Math.max(box.min.y, mapBounds.min.y - 1);
    const maxY = Math.min(box.max.y, mapBounds.max.y + 6);
    if (maxX <= minX || maxZ <= minZ || maxY <= minY) continue;

    const height = maxY - minY;
    const span = Math.max(maxX - minX, maxZ - minZ);
    let kind: ColliderAABB['kind'] = 'prop';
    if (
      height >= opt.minBuildingHeight ||
      BUILDING_HINT.test(matName) ||
      BUILDING_HINT.test(mesh.name) ||
      (height > 1.6 && footprint > 8)
    ) {
      kind = 'building';
    } else if (height < 1.1 && span > 10) {
      kind = 'ground';
    }

    // Inflate slightly so thin walls still catch the heli sphere
    const pad = kind === 'building' ? 0.15 : 0.08;
    const entry: ColliderAABB = {
      id: nextId++,
      minX: minX - pad,
      minY,
      minZ: minZ - pad,
      maxX: maxX + pad,
      maxY: maxY + (kind === 'building' ? 0.2 : 0),
      maxZ: maxZ + pad,
      kind,
      active: true,
    };
    // Small props are destructible — crates / barriers shatter on hard hits
    if (kind === 'prop' && height < 4.5 && footprint < 28) {
      const mass = Math.sqrt(footprint) * height;
      entry.maxHp = THREE.MathUtils.clamp(18 + mass * 2.2, 18, 55);
      entry.hp = entry.maxHp;
    }
    raw.push(entry);
  }

  // Prefer buildings; drop excess tiny props if over budget
  raw.sort((a, b) => scoreCollider(b) - scoreCollider(a));
  const capped = raw.slice(0, opt.maxColliders);
  // Re-id sequentially for dense array indexing in SpatialHash
  for (let i = 0; i < capped.length; i++) capped[i].id = i;

  return capped;
}

function scoreCollider(c: ColliderAABB): number {
  const h = c.maxY - c.minY;
  const foot = (c.maxX - c.minX) * (c.maxZ - c.minZ);
  const kindBonus = c.kind === 'building' ? 40 : c.kind === 'ground' ? -5 : 0;
  return kindBonus + h * 2 + Math.sqrt(foot) * 0.5;
}

function materialName(mesh: THREE.Mesh): string {
  const mat = mesh.material;
  if (!mat) return '';
  if (Array.isArray(mat)) return mat.map((m) => m.name || '').join(' ');
  return mat.name || '';
}

/** Build spatial hash from extracted colliders. */
export function buildColliderHash(
  colliders: ColliderAABB[],
  cellSize?: number,
): SpatialHash {
  const avgSpan =
    colliders.length === 0
      ? 12
      : colliders.reduce(
          (s, c) => s + Math.max(c.maxX - c.minX, c.maxZ - c.minZ),
          0,
        ) / colliders.length;
  const size = cellSize ?? THREE.MathUtils.clamp(avgSpan * 1.1, 8, 18);
  return new SpatialHash(colliders, size);
}
