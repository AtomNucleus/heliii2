import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * Sunset god-ray shafts — additive planes aimed along the sun direction.
 * MeshBasicMaterial only (WebGPU + WebGL safe). Not true volumetric lighting.
 */
export class LightShafts {
  readonly group = new THREE.Group();
  private readonly shafts: THREE.Mesh[] = [];
  private readonly sunDir = new THREE.Vector3(0.55, 0.28, -0.45).normalize();
  private count = 4;
  private readonly maxShafts = 6;
  private enabled = true;
  private intensity = 1;
  private time = 0;
  private readonly focus = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.name = 'light-shafts';
    scene.add(this.group);

    for (let i = 0; i < this.maxShafts; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.orangeGlow,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      // Tall thin plane — reads as a light shaft in low-poly sunset art
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 90), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -700;
      mesh.visible = false;
      this.group.add(mesh);
      this.shafts.push(mesh);
    }
  }

  applyQuality(q: QualitySettings) {
    this.enabled = q.lightShafts;
    this.count = this.enabled
      ? Math.min(this.maxShafts, Math.max(2, q.lightShaftCount))
      : 0;
    this.intensity = q.tier === 'low' ? 0.55 : q.tier === 'medium' ? 0.8 : 1;
    for (let i = 0; i < this.maxShafts; i++) {
      this.shafts[i].visible = i < this.count;
    }
  }

  setSunDirection(dir: THREE.Vector3) {
    this.sunDir.copy(dir).normalize();
  }

  update(dt: number, focus: THREE.Vector3, haze: number) {
    if (!this.enabled || this.count <= 0) {
      for (const s of this.shafts) s.visible = false;
      return;
    }
    this.time += dt;
    this.focus.copy(focus);

    for (let i = 0; i < this.count; i++) {
      const mesh = this.shafts[i];
      mesh.visible = true;
      const spread = (i / Math.max(1, this.count - 1) - 0.5) * 48;
      const along = 30 + (i % 3) * 18;
      // Place shafts between focus and sun, offset laterally
      const side = new THREE.Vector3()
        .crossVectors(this.sunDir, new THREE.Vector3(0, 1, 0))
        .normalize();
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);

      mesh.position
        .copy(this.focus)
        .addScaledVector(this.sunDir, along)
        .addScaledVector(side, spread)
        .add(new THREE.Vector3(0, 20 + (i % 2) * 8, 0));

      // Orient plane to face roughly toward camera while aligning with sun
      mesh.lookAt(
        mesh.position.x - this.sunDir.x,
        mesh.position.y - this.sunDir.y,
        mesh.position.z - this.sunDir.z,
      );
      mesh.rotateY(Math.sin(this.time * 0.15 + i) * 0.05);

      const pulse = 0.85 + 0.15 * Math.sin(this.time * 0.35 + i * 1.1);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity =
        (0.035 + haze * 0.05) * this.intensity * pulse * (1 - (i / this.count) * 0.25);
      const warm = i % 2 === 0 ? COLORS.orangeGlow : COLORS.orangeSun;
      mat.color.setHex(warm);
    }
  }

  dispose() {
    for (const mesh of this.shafts) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.group.parent?.remove(this.group);
  }
}
