import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * Fading ribbon trail following the helicopter path.
 * Procedural Line with recycled history buffer — no textures.
 */
export class MotionTrail {
  readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private readonly maxSegments: number;
  private segmentCount: number;
  private head = 0;
  private filled = 0;
  private readonly sampleDist = 0.55;
  private readonly lastSample = new THREE.Vector3(1e9, 1e9, 1e9);
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, maxSegments = 40) {
    this.maxSegments = maxSegments;
    this.segmentCount = maxSegments;
    this.positions = new Float32Array(maxSegments * 3);

    for (let i = 0; i < maxSegments; i++) {
      this.positions[i * 3 + 1] = -500;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);

    const mat = new THREE.LineBasicMaterial({
      color: COLORS.orangeGlow,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.line = new THREE.Line(geo, mat);
    this.line.frustumCulled = false;
    this.line.name = 'motion-trail';
    scene.add(this.line);
  }

  applyQuality(q: QualitySettings) {
    this.segmentCount = Math.min(this.maxSegments, Math.max(8, q.trailSegments));
  }

  reset() {
    this.head = 0;
    this.filled = 0;
    this.lastSample.set(1e9, 1e9, 1e9);
    this.line.geometry.setDrawRange(0, 0);
  }

  update(dt: number, heliPos: THREE.Vector3, speed: number) {
    void dt;
    const speed01 = Math.min(1, speed / 48);
    const mat = this.line.material as THREE.LineBasicMaterial;
    mat.opacity = 0.15 + speed01 * 0.55;
    mat.color.setHex(speed01 > 0.7 ? COLORS.orangeHot : COLORS.neonGreen);

    if (speed < 4) {
      if (this.filled > 0 && Math.random() < 0.08) {
        this.filled = Math.max(0, this.filled - 1);
        this.rebuild();
      }
      return;
    }

    if (this.lastSample.distanceToSquared(heliPos) < this.sampleDist * this.sampleDist) {
      return;
    }

    this.lastSample.copy(heliPos);
    this.tmp.copy(heliPos);
    this.tmp.y -= 0.15;

    const i = this.head % this.segmentCount;
    this.positions[i * 3] = this.tmp.x;
    this.positions[i * 3 + 1] = this.tmp.y;
    this.positions[i * 3 + 2] = this.tmp.z;
    this.head++;
    this.filled = Math.min(this.filled + 1, this.segmentCount);
    this.rebuild();
  }

  private rebuild() {
    const n = Math.min(this.filled, this.segmentCount);
    if (n < 2) {
      this.line.geometry.setDrawRange(0, 0);
      return;
    }

    const ordered = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = ordered.array as Float32Array;
    const start = (this.head - n + this.segmentCount * 8) % this.segmentCount;
    for (let i = 0; i < n; i++) {
      const src = (start + i) % this.segmentCount;
      arr[i * 3] = this.positions[src * 3];
      arr[i * 3 + 1] = this.positions[src * 3 + 1];
      arr[i * 3 + 2] = this.positions[src * 3 + 2];
    }
    ordered.needsUpdate = true;
    this.line.geometry.setDrawRange(0, n);
    this.line.geometry.computeBoundingSphere();
  }

  dispose() {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.line.parent?.remove(this.line);
  }
}
