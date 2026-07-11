import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * Warm exhaust / rotor wash particle trail behind the helicopter.
 * Uses a single Points mesh with recycled slots for performance.
 */
export class ExhaustParticles {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private sizes: Float32Array;
  private count: number;
  private activeScale = 1;
  private readonly maxCount = 140;
  private readonly tmpBack = new THREE.Vector3();
  private readonly tmpEmit = new THREE.Vector3();

  constructor(scene: THREE.Scene, count = 96) {
    this.count = Math.min(count, this.maxCount);
    this.positions = new Float32Array(this.maxCount * 3);
    this.velocities = new Float32Array(this.maxCount * 3);
    this.life = new Float32Array(this.maxCount);
    this.sizes = new Float32Array(this.maxCount);

    for (let i = 0; i < this.maxCount; i++) {
      this.life[i] = Math.random();
      this.positions[i * 3 + 1] = -200;
      this.sizes[i] = 0.2 + Math.random() * 0.35;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: COLORS.orangeGlow,
      size: 0.4,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'exhaust-particles';
    scene.add(this.points);
  }

  applyQuality(q: QualitySettings) {
    this.activeScale = q.particleScale;
    const next = Math.max(24, Math.floor(this.maxCount * q.particleScale));
    for (let i = next; i < this.count; i++) {
      this.life[i] = 0;
      this.positions[i * 3 + 1] = -200;
    }
    this.count = next;
  }

  update(dt: number, heliPos: THREE.Vector3, heliQuat: THREE.Quaternion, speed: number) {
    this.tmpBack.set(0, 0, -1).applyQuaternion(heliQuat).normalize();
    this.tmpEmit.copy(heliPos).addScaledVector(this.tmpBack, 1.35);
    this.tmpEmit.y -= 0.25;

    const speed01 = Math.min(1, speed / 50);
    const rate = (0.03 + speed01 * 0.045) * this.activeScale;
    const mat = this.points.material as THREE.PointsMaterial;
    mat.color.setHex(speed01 > 0.65 ? COLORS.orangeHot : COLORS.orangeGlow);
    mat.size = 0.28 + speed01 * 0.35;
    mat.opacity = 0.32 + speed01 * 0.45;

    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt * (0.9 + Math.random() * 0.8);
      if (this.life[i] <= 0 && Math.random() < rate * 12) {
        this.life[i] = 0.7 + Math.random() * 0.5;
        this.positions[i * 3] = this.tmpEmit.x + (Math.random() - 0.5) * 0.55;
        this.positions[i * 3 + 1] = this.tmpEmit.y + (Math.random() - 0.5) * 0.35;
        this.positions[i * 3 + 2] = this.tmpEmit.z + (Math.random() - 0.5) * 0.55;
        const spread = 1.2 + Math.random() * 2.5;
        this.velocities[i * 3] = this.tmpBack.x * (2 + speed01 * 4) + (Math.random() - 0.5) * spread;
        this.velocities[i * 3 + 1] = 0.4 + Math.random() * 1.8 + speed01 * 0.5;
        this.velocities[i * 3 + 2] = this.tmpBack.z * (2 + speed01 * 4) + (Math.random() - 0.5) * spread;
        this.sizes[i] = 0.15 + Math.random() * 0.4 * (1 + speed01);
      }

      if (this.life[i] > 0) {
        this.positions[i * 3] += this.velocities[i * 3] * dt;
        this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
        this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
        this.velocities[i * 3 + 1] += 1.6 * dt;
        this.velocities[i * 3] *= 1 - 0.4 * dt;
        this.velocities[i * 3 + 2] *= 1 - 0.4 * dt;
      } else {
        this.positions[i * 3 + 1] = -200;
      }
    }

    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.parent?.remove(this.points);
  }
}
