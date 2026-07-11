import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * World-space speed streaks that rush past the camera at high velocity.
 */
export class SpeedEffects {
  readonly group = new THREE.Group();
  private lines: THREE.Line[] = [];
  private velocities: THREE.Vector3[] = [];
  private life: number[] = [];
  private count = 24;
  private readonly maxCount = 40;
  private readonly tmp = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();

  constructor(scene: THREE.Scene, count = 24) {
    this.count = Math.min(count, this.maxCount);
    this.group.name = 'speed-effects';
    scene.add(this.group);

    const mat = new THREE.LineBasicMaterial({
      color: COLORS.orangeGlow,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < this.maxCount; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(6);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(geo, mat.clone());
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.lines.push(line);
      this.velocities.push(new THREE.Vector3());
      this.life.push(0);
    }
  }

  applyQuality(q: QualitySettings) {
    const next = Math.min(this.maxCount, Math.max(8, q.speedLineCount));
    for (let i = next; i < this.count; i++) {
      this.life[i] = 0;
      this.lines[i].visible = false;
    }
    this.count = next;
  }

  update(
    dt: number,
    camera: THREE.Camera,
    heliPos: THREE.Vector3,
    heliQuat: THREE.Quaternion,
    speed: number,
  ) {
    const speed01 = THREE.MathUtils.clamp((speed - 18) / 35, 0, 1);
    this.forward.set(0, 0, -1).applyQuaternion(heliQuat).normalize();

    if (speed01 < 0.05) {
      for (let i = 0; i < this.count; i++) {
        this.life[i] = 0;
        this.lines[i].visible = false;
      }
      return;
    }

    const spawnChance = speed01 * 0.55;

    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt * (1.8 + speed01 * 2.2);

      if (this.life[i] <= 0) {
        if (Math.random() < spawnChance) {
          this.spawn(i, camera, heliPos);
        } else {
          this.lines[i].visible = false;
          continue;
        }
      }

      const line = this.lines[i];
      line.visible = true;
      const vel = this.velocities[i];
      const attr = line.geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;

      arr[0] += vel.x * dt;
      arr[1] += vel.y * dt;
      arr[2] += vel.z * dt;
      arr[3] += vel.x * dt;
      arr[4] += vel.y * dt;
      arr[5] += vel.z * dt;
      attr.needsUpdate = true;

      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, this.life[i]) * (0.25 + speed01 * 0.55);
    }
  }

  private spawn(i: number, camera: THREE.Camera, heliPos: THREE.Vector3) {
    const side = (Math.random() - 0.5) * 28;
    const up = (Math.random() - 0.5) * 16;
    const ahead = 8 + Math.random() * 30;

    this.tmp.copy(heliPos);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.tmp.addScaledVector(this.forward, ahead);
    this.tmp.addScaledVector(this.right, side);
    this.tmp.addScaledVector(this.camUp, up);

    const len = 1.2 + Math.random() * 3.5;
    const attr = this.lines[i].geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr[0] = this.tmp.x;
    arr[1] = this.tmp.y;
    arr[2] = this.tmp.z;
    arr[3] = this.tmp.x - this.forward.x * len;
    arr[4] = this.tmp.y - this.forward.y * len;
    arr[5] = this.tmp.z - this.forward.z * len;
    attr.needsUpdate = true;

    this.velocities[i].copy(this.forward).multiplyScalar(-(35 + Math.random() * 40));
    this.life[i] = 0.35 + Math.random() * 0.45;
    this.lines[i].visible = true;

    const mat = this.lines[i].material as THREE.LineBasicMaterial;
    mat.color.setHex(Math.random() > 0.5 ? COLORS.orangeGlow : 0xffe0b0);
  }

  dispose() {
    for (const line of this.lines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.group.parent?.remove(this.group);
  }
}
