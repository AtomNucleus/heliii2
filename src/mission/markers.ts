import * as THREE from 'three';
import { COLORS } from '../scene/setup';

export interface WaypointTarget {
  id: string;
  position: THREE.Vector3;
  /** Optional label for HUD */
  label?: string;
  color?: number;
  /** Reach radius in meters (XZ) */
  radius?: number;
}

/**
 * Lightweight 3D objective beacons that guide the player between phases.
 * Mobile-friendly: few draw calls, additive materials, no textures.
 */
export class ObjectiveMarkers {
  readonly group = new THREE.Group();
  private readonly markers = new Map<
    string,
    {
      root: THREE.Group;
      pillar: THREE.Mesh;
      ring: THREE.Mesh;
      arrow: THREE.Mesh;
      position: THREE.Vector3;
      color: number;
      radius: number;
    }
  >();
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.name = 'objective-markers';
    scene.add(this.group);
  }

  clear() {
    for (const m of this.markers.values()) {
      this.group.remove(m.root);
      m.root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
    }
    this.markers.clear();
  }

  setTargets(targets: WaypointTarget[]) {
    const keep = new Set(targets.map((t) => t.id));
    for (const id of [...this.markers.keys()]) {
      if (!keep.has(id)) {
        const m = this.markers.get(id)!;
        this.group.remove(m.root);
        this.markers.delete(id);
      }
    }
    for (const t of targets) {
      const existing = this.markers.get(t.id);
      if (existing) {
        existing.position.copy(t.position);
        existing.root.position.copy(t.position);
        existing.radius = t.radius ?? existing.radius;
        continue;
      }
      this.addMarker(t);
    }
  }

  /** True if heli is inside any marker's XZ radius (and near altitude). */
  isInsideAny(heliPos: THREE.Vector3, maxAltDelta = 28): boolean {
    for (const m of this.markers.values()) {
      const dx = m.position.x - heliPos.x;
      const dz = m.position.z - heliPos.z;
      const d = Math.hypot(dx, dz);
      if (d <= m.radius && Math.abs(heliPos.y - m.position.y) <= maxAltDelta) {
        return true;
      }
    }
    return false;
  }

  /** Nearest marker distance in XZ (meters), or null if none. */
  getNearestDistance(from: THREE.Vector3): number | null {
    let best: number | null = null;
    for (const m of this.markers.values()) {
      const dx = m.position.x - from.x;
      const dz = m.position.z - from.z;
      const d = Math.hypot(dx, dz);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  /** Primary objective world position (first marker), if any. */
  getPrimaryPosition(): THREE.Vector3 | null {
    for (const m of this.markers.values()) return m.position.clone();
    return null;
  }

  update(dt: number, time: number, heliPos: THREE.Vector3) {
    void dt;
    for (const m of this.markers.values()) {
      m.root.position.copy(m.position);
      const pulse = 1 + Math.sin(time * 2.8) * 0.06;
      m.pillar.scale.set(1, pulse, 1);
      const mat = m.pillar.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.28 + Math.sin(time * 3.1) * 0.1;

      m.ring.rotation.y = time * 1.4;
      m.ring.position.y = 1.2 + Math.sin(time * 2.2) * 0.35;

      this.tmp.subVectors(m.position, heliPos);
      this.tmp.y = 0;
      if (this.tmp.lengthSq() > 0.01) {
        const yaw = Math.atan2(this.tmp.x, this.tmp.z);
        m.arrow.rotation.y = yaw;
      }
      m.arrow.position.y = 16 + Math.sin(time * 3.5) * 0.5;
    }
  }

  private addMarker(t: WaypointTarget) {
    const color = t.color ?? COLORS.neonGreen;
    const root = new THREE.Group();
    root.name = `waypoint-${t.id}`;
    root.position.copy(t.position);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.4, 16, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pillar.position.y = 8;
    root.add(pillar);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.12, 6, 20),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    root.add(ring);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.8, 5),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.y = 16;
    root.add(arrow);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cap.position.y = 16.2;
    root.add(cap);

    this.group.add(root);
    this.markers.set(t.id, {
      root,
      pillar,
      ring,
      arrow,
      position: t.position.clone(),
      color,
      radius: t.radius ?? 14,
    });
  }
}
