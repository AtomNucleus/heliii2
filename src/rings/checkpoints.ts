import * as THREE from 'three';
import { COLORS } from '../scene/setup';

export interface CheckpointRing {
  mesh: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  index: number;
}

const RING_RADIUS = 3.2;
const COLLECT_RADIUS = 3.8;

/** 10 checkpoint positions weaving across islands */
const RING_LAYOUT: Array<[number, number, number]> = [
  [0, 8, 18],
  [18, 10, 35],
  [40, 12, 20],
  [48, 14, -15],
  [25, 11, -40],
  [-5, 13, -50],
  [-35, 15, -35],
  [-48, 12, 5],
  [-30, 14, 40],
  [10, 16, 55],
];

export class CheckpointSystem {
  readonly rings: CheckpointRing[] = [];
  readonly group = new THREE.Group();
  nextIndex = 0;
  readonly total = RING_LAYOUT.length;

  private particlePools: THREE.Points[] = [];

  constructor(scene: THREE.Scene) {
    this.group.name = 'checkpoints';
    RING_LAYOUT.forEach((pos, i) => {
      const ring = this.createRing(i);
      ring.position.set(pos[0], pos[1], pos[2]);
      // Face roughly toward previous / next for variety
      ring.rotation.y = (i * 0.7) % (Math.PI * 2);
      ring.rotation.x = Math.sin(i) * 0.25;

      this.group.add(ring);
      this.rings.push({
        mesh: ring,
        position: ring.position.clone(),
        collected: false,
        index: i,
      });

      const particles = this.createRingParticles();
      particles.position.copy(ring.position);
      this.group.add(particles);
      this.particlePools.push(particles);
    });
    scene.add(this.group);
    this.refreshVisibility();
  }

  private createRing(index: number): THREE.Group {
    const g = new THREE.Group();
    g.name = `ring-${index}`;

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.28, 8, 24),
      new THREE.MeshStandardMaterial({
        color: COLORS.neonGreen,
        emissive: COLORS.neonGreen,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.4,
        flatShading: true,
      }),
    );
    g.add(torus);

    // Inner glow shell
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.5, 8, 24),
      new THREE.MeshBasicMaterial({
        color: COLORS.neonGreen,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    g.add(glow);

    // Number marker (small box cluster)
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.15),
      new THREE.MeshStandardMaterial({
        color: COLORS.orangeSun,
        emissive: COLORS.orangeHot,
        emissiveIntensity: 0.8,
        flatShading: true,
      }),
    );
    badge.position.set(0, RING_RADIUS + 0.8, 0);
    g.add(badge);

    return g;
  }

  private createRingParticles(): THREE.Points {
    const count = 40;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = RING_RADIUS * (0.7 + Math.random() * 0.5);
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: COLORS.neonGreen,
      size: 0.25,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  private refreshVisibility() {
    this.rings.forEach((ring, i) => {
      const active = i === this.nextIndex;
      const upcoming = i > this.nextIndex && i <= this.nextIndex + 2;
      ring.mesh.visible = !ring.collected && (active || upcoming || i < this.nextIndex + 1);
      if (ring.collected) {
        ring.mesh.visible = false;
        this.particlePools[i].visible = false;
      } else {
        // Dim upcoming rings slightly
        ring.mesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat.emissiveIntensity !== undefined) {
              mat.emissiveIntensity = active ? 1.6 : upcoming ? 0.7 : 0.4;
            }
            if (mat.opacity !== undefined && mat.transparent) {
              mat.opacity = active ? 0.22 : 0.1;
            }
          }
        });
        this.particlePools[i].visible = active || upcoming;
      }
    });
  }

  /** Returns true if a new ring was collected this frame */
  tryCollect(heliPos: THREE.Vector3): boolean {
    if (this.nextIndex >= this.total) return false;
    const ring = this.rings[this.nextIndex];
    if (ring.collected) return false;

    if (heliPos.distanceTo(ring.position) < COLLECT_RADIUS) {
      ring.collected = true;
      ring.mesh.visible = false;
      this.particlePools[this.nextIndex].visible = false;
      this.nextIndex += 1;
      this.refreshVisibility();
      return true;
    }
    return false;
  }

  get collectedCount(): number {
    return this.nextIndex;
  }

  get complete(): boolean {
    return this.nextIndex >= this.total;
  }

  update(time: number) {
    this.rings.forEach((ring, i) => {
      if (ring.collected) return;
      const pulse = 1 + Math.sin(time * 3 + i) * 0.08;
      ring.mesh.scale.setScalar(pulse);
      ring.mesh.rotation.z = time * 0.4 + i;

      const pts = this.particlePools[i];
      if (pts.visible) {
        pts.rotation.y = time * 0.6;
        const mat = pts.material as THREE.PointsMaterial;
        mat.opacity = 0.45 + Math.sin(time * 4 + i) * 0.25;
      }
    });
  }

  reset() {
    this.nextIndex = 0;
    this.rings.forEach((ring) => {
      ring.collected = false;
      ring.mesh.visible = true;
      ring.mesh.scale.setScalar(1);
    });
    this.particlePools.forEach((p) => {
      p.visible = true;
    });
    this.refreshVisibility();
  }
}
