import * as THREE from 'three';
import type { ColliderAABB, DestructResult } from './types';
import type { SpatialHash } from './spatialHash';

/** Impulse / HP thresholds for shattering props. */
export const DESTRUCT = {
  /** Closing speed needed before prop HP starts draining. */
  minClosing: 7,
  /** HP damage per unit closing speed above min. */
  hpPerSpeed: 1.35,
  /** Extra HP drain on crash-classified hits. */
  crashBonus: 12,
  /** Max debris chunks spawned per shatter. */
  maxDebris: 10,
  debrisLife: 1.35,
  gravity: 28,
} as const;

interface DebrisPiece {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinY: number;
  life: number;
  maxLife: number;
}

const _center = new THREE.Vector3();
const _empty: DestructResult = {
  destroyed: false,
  colliderId: -1,
  kind: 'none',
  center: new THREE.Vector3(),
  impulse: 0,
};

/**
 * Apply impact energy to a destructible collider.
 * Soft-disables the AABB on shatter (hash buckets stay valid).
 */
export function applyDestructibleHit(
  hash: SpatialHash,
  colliderId: number,
  closingSpeed: number,
  isCrash: boolean,
): DestructResult {
  const box = hash.getCollider(colliderId);
  if (!box || box.hp === undefined || box.maxHp === undefined) {
    return { ..._empty, center: _center.set(0, 0, 0).clone() };
  }
  if (box.active === false) {
    return {
      destroyed: false,
      colliderId,
      kind: box.kind,
      center: aabbCenter(box),
      impulse: 0,
      tag: box.tag,
    };
  }

  if (closingSpeed < DESTRUCT.minClosing && !isCrash) {
    return {
      destroyed: false,
      colliderId,
      kind: box.kind,
      center: aabbCenter(box),
      impulse: 0,
      tag: box.tag,
    };
  }

  const over = Math.max(0, closingSpeed - DESTRUCT.minClosing);
  let dmg = over * DESTRUCT.hpPerSpeed;
  if (isCrash) dmg += DESTRUCT.crashBonus;
  // Buildings never shatter via this path (no hp), but large props take less
  if (box.kind === 'prop') dmg *= 1;
  else dmg *= 0.35;

  box.hp = Math.max(0, box.hp - dmg);
  const impulse = dmg;

  if (box.hp > 0) {
    return {
      destroyed: false,
      colliderId,
      kind: box.kind,
      center: aabbCenter(box),
      impulse,
      tag: box.tag,
    };
  }

  hash.setActive(colliderId, false);
  return {
    destroyed: true,
    colliderId,
    kind: box.kind,
    center: aabbCenter(box),
    impulse,
    tag: box.tag,
  };
}

function aabbCenter(box: ColliderAABB): THREE.Vector3 {
  return new THREE.Vector3(
    (box.minX + box.maxX) * 0.5,
    (box.minY + box.maxY) * 0.5,
    (box.minZ + box.maxZ) * 0.5,
  );
}

/**
 * Lightweight debris burst for shattered set-pieces.
 * Instanced-looking box chunks with gravity — no physics engine.
 */
export class DebrisSystem {
  readonly group = new THREE.Group();
  private readonly pieces: DebrisPiece[] = [];
  private readonly pool: DebrisPiece[] = [];
  private readonly geo: THREE.BoxGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private destroyedCount = 0;

  constructor() {
    this.group.name = 'collisionDebris';
    this.geo = new THREE.BoxGeometry(0.45, 0.35, 0.55);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xc4a574,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
  }

  attach(scene: THREE.Scene) {
    scene.add(this.group);
  }

  detach(scene: THREE.Scene) {
    scene.remove(this.group);
  }

  get alive(): number {
    return this.pieces.length;
  }

  get propsDestroyed(): number {
    return this.destroyedCount;
  }

  reset() {
    while (this.pieces.length) {
      const p = this.pieces.pop()!;
      p.mesh.visible = false;
      this.pool.push(p);
    }
    this.destroyedCount = 0;
  }

  spawn(center: THREE.Vector3, impulse: number, kind: ColliderAABB['kind'] = 'prop') {
    this.destroyedCount++;
    const count = THREE.MathUtils.clamp(
      4 + Math.floor(impulse / 8),
      4,
      DESTRUCT.maxDebris,
    );
    const color = kind === 'building' ? 0x8a6a4a : 0xc4a574;
    for (let i = 0; i < count; i++) {
      const piece = this.acquire();
      (piece.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      piece.mesh.position.copy(center);
      piece.mesh.position.x += (Math.random() - 0.5) * 1.2;
      piece.mesh.position.y += (Math.random() - 0.5) * 0.8;
      piece.mesh.position.z += (Math.random() - 0.5) * 1.2;
      const spread = 6 + impulse * 0.15;
      piece.vx = (Math.random() - 0.5) * spread;
      piece.vy = 4 + Math.random() * (6 + impulse * 0.08);
      piece.vz = (Math.random() - 0.5) * spread;
      piece.spinX = (Math.random() - 0.5) * 10;
      piece.spinY = (Math.random() - 0.5) * 10;
      piece.maxLife = DESTRUCT.debrisLife * (0.7 + Math.random() * 0.5);
      piece.life = piece.maxLife;
      piece.mesh.scale.setScalar(0.55 + Math.random() * 0.7);
      piece.mesh.visible = true;
      this.pieces.push(piece);
    }
  }

  update(dt: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pieces.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vy -= DESTRUCT.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.spinX * dt;
      p.mesh.rotation.y += p.spinY * dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, p.life / p.maxLife);
    }
  }

  dispose() {
    this.reset();
    this.geo.dispose();
    this.mat.dispose();
    for (const p of this.pool) {
      (p.mesh.material as THREE.Material).dispose();
    }
    this.pool.length = 0;
  }

  private acquire(): DebrisPiece {
    const pooled = this.pool.pop();
    if (pooled) return pooled;
    const mat = this.mat.clone();
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);
    return {
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      spinX: 0,
      spinY: 0,
      life: 0,
      maxLife: 1,
    };
  }
}
