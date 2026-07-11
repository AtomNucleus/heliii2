import * as THREE from 'three';
import type {
  ColliderAABB,
  CollisionDebugStats,
  ImpactKind,
  ProximityWarning,
} from './types';
import type { SpatialHash } from './spatialHash';
import { HELI_COLLISION } from './resolve';

const KIND_COLOR: Record<ColliderAABB['kind'], number> = {
  building: 0xff5533,
  prop: 0xffcc33,
  ground: 0x44aaff,
};

/**
 * Lightweight wireframe overlay for collider AABBs + heli sphere.
 * Toggle with setEnabled / URL ?debugCollision=1 / KeyC when hooked.
 */
export class CollisionDebugOverlay {
  readonly group = new THREE.Group();
  private readonly boxGroup = new THREE.Group();
  private readonly heliMesh: THREE.Mesh;
  private readonly normalHelper: THREE.ArrowHelper;
  private readonly proxHelper: THREE.ArrowHelper;
  private readonly boxById = new Map<number, THREE.LineSegments>();
  private enabled = false;
  private hash: SpatialHash | null = null;
  private stats: CollisionDebugStats = {
    colliderCount: 0,
    activeColliders: 0,
    hashCells: 0,
    lastQueryCount: 0,
    lastHit: false,
    lastImpactKind: 'none',
    lastClosingSpeed: 0,
    lastDamage: 0,
    lastResolveMs: 0,
    debrisAlive: 0,
    propsDestroyed: 0,
    proximityLevel: 0,
    proximityDistance: 999,
  };

  constructor() {
    this.group.name = 'collisionDebug';
    this.group.visible = false;
    this.group.add(this.boxGroup);

    this.heliMesh = new THREE.Mesh(
      new THREE.SphereGeometry(HELI_COLLISION.radius, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x33ff99,
        wireframe: true,
        depthTest: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.heliMesh.name = 'heliColliderDebug';
    this.group.add(this.heliMesh);

    this.normalHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      4,
      0xffffff,
      0.6,
      0.35,
    );
    this.normalHelper.visible = false;
    this.group.add(this.normalHelper);

    this.proxHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(),
      8,
      0xffaa00,
      0.8,
      0.4,
    );
    this.proxHelper.visible = false;
    this.group.add(this.proxHelper);
  }

  attach(scene: THREE.Scene) {
    scene.add(this.group);
  }

  detach(scene: THREE.Scene) {
    scene.remove(this.group);
  }

  setHash(hash: SpatialHash | null) {
    this.hash = hash;
    this.rebuildBoxes();
    this.stats.colliderCount = hash?.size ?? 0;
    this.stats.activeColliders = hash?.activeCount() ?? 0;
    this.stats.hashCells = hash?.cellCount ?? 0;
  }

  /** Dim a shattered / disabled collider in the overlay. */
  markInactive(id: number) {
    const line = this.boxById.get(id);
    if (!line) return;
    const mat = line.material as THREE.LineBasicMaterial;
    mat.opacity = 0.08;
    mat.color.setHex(0x666666);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on;
    if (on && this.boxGroup.children.length === 0) this.rebuildBoxes();
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  getStats(): CollisionDebugStats {
    return { ...this.stats };
  }

  recordFrame(partial: Partial<CollisionDebugStats>) {
    Object.assign(this.stats, partial);
  }

  update(
    heliPos: THREE.Vector3,
    contactNormal?: THREE.Vector3 | null,
    hit = false,
    impactKind: ImpactKind = 'none',
    proximity?: ProximityWarning | null,
  ) {
    if (!this.enabled) return;
    this.heliMesh.position.set(
      heliPos.x,
      heliPos.y + HELI_COLLISION.centerY,
      heliPos.z,
    );
    const mat = this.heliMesh.material as THREE.MeshBasicMaterial;
    if (impactKind === 'crash') mat.color.setHex(0xff2244);
    else if (impactKind === 'scrape') mat.color.setHex(0xffaa22);
    else if (proximity && proximity.level >= 2) mat.color.setHex(0xffee55);
    else mat.color.setHex(0x33ff99);

    if (hit && contactNormal) {
      this.normalHelper.visible = true;
      this.normalHelper.position.copy(this.heliMesh.position);
      this.normalHelper.setDirection(contactNormal.clone().normalize());
    } else {
      this.normalHelper.visible = false;
    }

    if (proximity && proximity.level > 0 && Number.isFinite(proximity.distance)) {
      this.proxHelper.visible = true;
      this.proxHelper.position.copy(this.heliMesh.position);
      this.proxHelper.setDirection(proximity.direction.clone().normalize());
      this.proxHelper.setLength(
        Math.min(18, Math.max(2, proximity.distance)),
        0.7,
        0.35,
      );
      const proxMat = this.proxHelper.line.material as THREE.LineBasicMaterial;
      const coneMat = this.proxHelper.cone.material as THREE.MeshBasicMaterial;
      const col =
        proximity.level >= 3 ? 0xff2244 : proximity.level === 2 ? 0xff8800 : 0xffcc44;
      proxMat.color.setHex(col);
      coneMat.color.setHex(col);
    } else {
      this.proxHelper.visible = false;
    }
  }

  private rebuildBoxes() {
    while (this.boxGroup.children.length) {
      const child = this.boxGroup.children.pop()!;
      const mesh = child as THREE.LineSegments;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose?.();
    }
    this.boxById.clear();
    if (!this.hash) return;

    const colliders = this.hash.all();
    // Cap visual density for browser perf
    const stride = colliders.length > 400 ? 2 : 1;
    for (let i = 0; i < colliders.length; i += stride) {
      const c = colliders[i];
      const sx = Math.max(0.05, c.maxX - c.minX);
      const sy = Math.max(0.05, c.maxY - c.minY);
      const sz = Math.max(0.05, c.maxZ - c.minZ);
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(geo);
      geo.dispose();
      const inactive = c.active === false;
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: inactive ? 0x666666 : KIND_COLOR[c.kind],
          transparent: true,
          opacity: inactive
            ? 0.08
            : c.kind === 'building'
              ? 0.55
              : c.hp !== undefined
                ? 0.45
                : 0.35,
        }),
      );
      line.position.set(
        (c.minX + c.maxX) * 0.5,
        (c.minY + c.maxY) * 0.5,
        (c.minZ + c.maxZ) * 0.5,
      );
      this.boxGroup.add(line);
      this.boxById.set(c.id, line);
    }
  }
}

/** Read URL / localStorage preference for collision debug. */
export function wantCollisionDebug(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    if (q.get('debugCollision') === '1' || q.get('debugColliders') === '1') {
      return true;
    }
    return window.localStorage?.getItem('heli.debugCollision') === '1';
  } catch {
    return false;
  }
}
