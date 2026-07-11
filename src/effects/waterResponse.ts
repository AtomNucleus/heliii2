import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

export interface WaterResponseContext {
  time: number;
  dt: number;
  heliPos: THREE.Vector3;
  altitude: number;
  speed: number;
  /** Approximate water plane Y. */
  waterY: number;
}

/**
 * Backend-safe water fidelity: MeshStandardMaterial property animation +
 * proximity wake cues. No ShaderMaterial / no claimed SSR.
 */
export class WaterResponse {
  private water: THREE.Mesh | null = null;
  private foam: THREE.Mesh[] = [];
  private enabled = true;
  private quality: 'low' | 'medium' | 'high' = 'high';
  private wake = 0;
  private readonly wakePos = new THREE.Vector3();
  private wakeMesh: THREE.Mesh | null = null;

  bind(water: THREE.Mesh | null, scene?: THREE.Scene, foamMeshes?: THREE.Mesh[]) {
    this.water = water;
    this.foam = foamMeshes ?? [];
    if (scene) {
      if (!this.wakeMesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xb8e8e8,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        this.wakeMesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 3.2, 32), mat);
        this.wakeMesh.rotation.x = -Math.PI / 2;
        this.wakeMesh.name = 'water-wake';
        this.wakeMesh.renderOrder = 3;
        this.wakeMesh.visible = false;
        scene.add(this.wakeMesh);
      }
    }
    if (water) {
      const mat = water.material as THREE.MeshStandardMaterial;
      if (mat.isMeshStandardMaterial) {
        // Richer specular response within standard PBR (both backends).
        mat.roughness = Math.min(mat.roughness, 0.14);
        mat.metalness = Math.max(mat.metalness, 0.78);
        mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 0.55, 1.1);
        water.userData.waterResponseBase = {
          roughness: mat.roughness,
          metalness: mat.metalness,
          opacity: mat.opacity,
          color: mat.color.getHex(),
        };
      }
    }
  }

  applyQuality(q: QualitySettings) {
    this.enabled = q.waterResponse;
    this.quality = q.tier;
    if (this.wakeMesh) {
      this.wakeMesh.visible = this.enabled && q.tier !== 'low';
    }
  }

  update(ctx: WaterResponseContext) {
    if (!this.enabled || !this.water) return;
    const mat = this.water.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial) return;

    const base = this.water.userData.waterResponseBase as
      | { roughness: number; metalness: number; opacity: number; color: number }
      | undefined;

    const baseRough = base?.roughness ?? 0.14;
    const baseMetal = base?.metalness ?? 0.78;
    const baseOp = base?.opacity ?? ((this.water.userData.baseOpacity as number) ?? 0.82);

    // Horizon shimmer + slow swell (existing motion, enriched).
    const shimmer = Math.sin(ctx.time * 0.8) * 0.035;
    const swell = Math.sin(ctx.time * 0.5) * 0.03;
    const sparkle =
      this.quality === 'low'
        ? 0
        : 0.02 * Math.sin(ctx.time * 2.4) * Math.sin(ctx.time * 0.37);

    mat.opacity = THREE.MathUtils.clamp(baseOp * 0.95 + shimmer + sparkle, 0.55, 0.95);
    mat.roughness = THREE.MathUtils.clamp(baseRough + shimmer * 0.4 - sparkle * 0.5, 0.08, 0.35);
    mat.metalness = THREE.MathUtils.clamp(baseMetal + sparkle * 0.8, 0.55, 0.92);

    // Warm sunset specular lean on the water color.
    const warm = 0.5 + 0.5 * Math.sin(ctx.time * 0.2);
    mat.color.setHex(base?.color ?? COLORS.water);
    mat.color.offsetHSL(0.02 * warm * 0.15, 0.02, 0.01 * warm);

    const baseY =
      (this.water.userData.baseY as number | undefined) ??
      (this.water.userData.baseY = this.water.position.y);
    this.water.position.y = baseY + swell;

    // Proximity wake when flying low over water.
    const waterY = ctx.waterY;
    const overWater = ctx.heliPos.y - waterY < 14 && ctx.altitude < 18;
    const targetWake = overWater
      ? THREE.MathUtils.clamp(1 - (ctx.heliPos.y - waterY) / 14, 0, 1) *
        THREE.MathUtils.clamp(ctx.speed / 35, 0.25, 1)
      : 0;
    this.wake = THREE.MathUtils.lerp(this.wake, targetWake, 1 - Math.exp(-ctx.dt * 4));

    if (this.wakeMesh && this.quality !== 'low') {
      const show = this.wake > 0.04;
      this.wakeMesh.visible = show;
      if (show) {
        this.wakePos.set(ctx.heliPos.x, waterY + 0.08, ctx.heliPos.z);
        this.wakeMesh.position.copy(this.wakePos);
        const s = 1.2 + this.wake * 2.8 + Math.sin(ctx.time * 3) * 0.15;
        this.wakeMesh.scale.setScalar(s);
        const wmat = this.wakeMesh.material as THREE.MeshBasicMaterial;
        wmat.opacity = 0.12 + this.wake * 0.35;
      }
    }

    // Foam rings pulse harder near the craft when over water.
    for (let i = 0; i < this.foam.length; i++) {
      const fmat = this.foam[i].material as THREE.MeshStandardMaterial;
      if (!fmat) continue;
      const pulse = 0.32 + 0.14 * Math.sin(ctx.time * 0.7 + i * 0.9);
      fmat.opacity = pulse + this.wake * 0.18;
    }
  }

  dispose() {
    if (this.wakeMesh) {
      this.wakeMesh.geometry.dispose();
      (this.wakeMesh.material as THREE.Material).dispose();
      this.wakeMesh.parent?.remove(this.wakeMesh);
      this.wakeMesh = null;
    }
    this.water = null;
    this.foam = [];
  }
}
