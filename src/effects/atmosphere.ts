import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * Floating dust / pollen motes and soft ground haze near the helicopter.
 * Cheap Points volume that follows the craft for atmospheric polish.
 */
export class AtmosphereEffects {
  readonly dust: THREE.Points;
  readonly wash: THREE.Points;
  private readonly dustPos: Float32Array;
  private readonly dustVel: Float32Array;
  private readonly washPos: Float32Array;
  private readonly washLife: Float32Array;
  private dustCount: number;
  private washCount: number;
  private readonly maxDust: number;
  private readonly maxWash = 48;
  private readonly tmp = new THREE.Vector3();
  private time = 0;

  constructor(scene: THREE.Scene, dustCount = 100) {
    this.maxDust = 160;
    this.dustCount = Math.min(dustCount, this.maxDust);
    this.washCount = 32;

    this.dustPos = new Float32Array(this.maxDust * 3);
    this.dustVel = new Float32Array(this.maxDust * 3);
    for (let i = 0; i < this.maxDust; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 60;
      this.dustPos[i * 3 + 1] = Math.random() * 40;
      this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.4;
      this.dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: COLORS.dust,
      size: 0.22,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(dustGeo, dustMat);
    this.dust.frustumCulled = false;
    this.dust.name = 'atmosphere-dust';
    scene.add(this.dust);

    this.washPos = new Float32Array(this.maxWash * 3);
    this.washLife = new Float32Array(this.maxWash);
    for (let i = 0; i < this.maxWash; i++) {
      this.washPos[i * 3 + 1] = -200;
      this.washLife[i] = 0;
    }
    const washGeo = new THREE.BufferGeometry();
    washGeo.setAttribute('position', new THREE.BufferAttribute(this.washPos, 3));
    const washMat = new THREE.PointsMaterial({
      color: 0xd4c4a8,
      size: 0.55,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.wash = new THREE.Points(washGeo, washMat);
    this.wash.frustumCulled = false;
    this.wash.name = 'rotor-wash';
    scene.add(this.wash);
  }

  applyQuality(q: QualitySettings) {
    this.dustCount = Math.min(this.maxDust, Math.max(20, q.atmosphereCount));
    this.washCount = Math.min(this.maxWash, Math.max(8, Math.floor(q.atmosphereCount * 0.35)));
    for (let i = this.dustCount; i < this.maxDust; i++) {
      this.dustPos[i * 3 + 1] = -400;
    }
    for (let i = this.washCount; i < this.maxWash; i++) {
      this.washLife[i] = 0;
      this.washPos[i * 3 + 1] = -200;
    }
  }

  update(
    dt: number,
    heliPos: THREE.Vector3,
    altitude: number,
    speed: number,
    getGroundHeight?: (x: number, z: number) => number,
  ) {
    this.time += dt;
    const dustMat = this.dust.material as THREE.PointsMaterial;
    dustMat.opacity = 0.18 + Math.min(0.25, (1 - Math.min(altitude, 60) / 60) * 0.3);

    for (let i = 0; i < this.dustCount; i++) {
      this.dustPos[i * 3] += this.dustVel[i * 3] * dt;
      this.dustPos[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt + Math.sin(this.time + i) * 0.01;
      this.dustPos[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;

      const dx = this.dustPos[i * 3] - heliPos.x;
      const dy = this.dustPos[i * 3 + 1] - heliPos.y;
      const dz = this.dustPos[i * 3 + 2] - heliPos.z;
      if (Math.abs(dx) > 35) this.dustPos[i * 3] = heliPos.x - Math.sign(dx) * 34;
      if (dy < -8 || dy > 35) this.dustPos[i * 3 + 1] = heliPos.y + Math.random() * 20;
      if (Math.abs(dz) > 35) this.dustPos[i * 3 + 2] = heliPos.z - Math.sign(dz) * 34;
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    const nearGround = altitude < 12;
    const washMat = this.wash.material as THREE.PointsMaterial;
    washMat.opacity = nearGround ? 0.25 + (1 - altitude / 12) * 0.35 : 0;

    if (nearGround) {
      const gy = getGroundHeight
        ? getGroundHeight(heliPos.x, heliPos.z)
        : heliPos.y - altitude;
      const emitRate = 0.08 + (1 - altitude / 12) * 0.2 + Math.min(speed, 20) * 0.004;

      for (let i = 0; i < this.washCount; i++) {
        this.washLife[i] -= dt * 1.4;
        if (this.washLife[i] <= 0 && Math.random() < emitRate) {
          this.washLife[i] = 0.5 + Math.random() * 0.5;
          const ang = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 6;
          this.washPos[i * 3] = heliPos.x + Math.cos(ang) * r;
          this.washPos[i * 3 + 1] = gy + 0.15 + Math.random() * 0.4;
          this.washPos[i * 3 + 2] = heliPos.z + Math.sin(ang) * r;
        } else if (this.washLife[i] > 0) {
          this.tmp.set(
            this.washPos[i * 3] - heliPos.x,
            0,
            this.washPos[i * 3 + 2] - heliPos.z,
          );
          if (this.tmp.lengthSq() > 0.01) {
            this.tmp.normalize().multiplyScalar(4 * dt);
            this.washPos[i * 3] += this.tmp.x;
            this.washPos[i * 3 + 2] += this.tmp.z;
          }
          this.washPos[i * 3 + 1] += 0.4 * dt;
        } else {
          this.washPos[i * 3 + 1] = -200;
        }
      }
      (this.wash.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else {
      for (let i = 0; i < this.washCount; i++) {
        this.washLife[i] = 0;
        this.washPos[i * 3 + 1] = -200;
      }
    }
  }

  dispose() {
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.dust.parent?.remove(this.dust);
    this.wash.geometry.dispose();
    (this.wash.material as THREE.Material).dispose();
    this.wash.parent?.remove(this.wash);
  }
}
