import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import type { QualitySettings } from './quality';

/**
 * Rotor / heat ambience near the craft: spinning disc shimmer + heat haze points.
 * Complements the helicopter model's rotor blur without touching controller code.
 */
export class RotorAmbience {
  readonly group = new THREE.Group();
  private disc: THREE.Mesh;
  private heat: THREE.Points;
  private heatPos: Float32Array;
  private heatLife: Float32Array;
  private heatCount = 24;
  private readonly maxHeat = 40;
  private enabled = true;
  private readonly tmp = new THREE.Vector3();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'rotor-ambience';
    scene.add(this.group);

    const discMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        color: { value: new THREE.Color(0xa8d8ff) },
        opacity: { value: 0.12 },
        time: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float ring = smoothstep(0.15, 0.45, r) * (1.0 - smoothstep(0.75, 1.0, r));
          float swirl = 0.5 + 0.5 * sin(atan(p.y, p.x) * 6.0 - time * 14.0);
          float a = ring * opacity * (0.55 + swirl * 0.45);
          gl_FragColor = vec4(color, a);
        }
      `,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.name = 'rotor-shimmer';
    this.group.add(this.disc);

    this.heatPos = new Float32Array(this.maxHeat * 3);
    this.heatLife = new Float32Array(this.maxHeat);
    for (let i = 0; i < this.maxHeat; i++) {
      this.heatLife[i] = 0;
      this.heatPos[i * 3 + 1] = -300;
    }
    const heatGeo = new THREE.BufferGeometry();
    heatGeo.setAttribute('position', new THREE.BufferAttribute(this.heatPos, 3));
    const heatMat = new THREE.PointsMaterial({
      color: COLORS.orangeGlow,
      size: 0.18,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.heat = new THREE.Points(heatGeo, heatMat);
    this.heat.frustumCulled = false;
    this.heat.name = 'heat-haze';
    this.group.add(this.heat);
  }

  applyQuality(q: QualitySettings) {
    this.enabled = q.tier !== 'low';
    this.group.visible = this.enabled;
    this.heatCount = Math.min(
      this.maxHeat,
      Math.max(10, Math.floor(20 * q.particleScale)),
    );
    if (!this.enabled) {
      for (let i = 0; i < this.maxHeat; i++) {
        this.heatLife[i] = 0;
        this.heatPos[i * 3 + 1] = -300;
      }
    }
  }

  update(dt: number, heliPos: THREE.Vector3, heliQuat: THREE.Quaternion, speed: number) {
    if (!this.enabled) return;
    this.time += dt;

    this.group.position.copy(heliPos);
    this.group.quaternion.copy(heliQuat);

    const discMat = this.disc.material as THREE.ShaderMaterial;
    discMat.uniforms.time.value = this.time;
    const speed01 = Math.min(1, speed / 45);
    discMat.uniforms.opacity.value = 0.08 + speed01 * 0.1;
    this.disc.position.set(0, 0.55, 0.1);

    // Heat shimmer rising from exhaust / engine area
    this.tmp.set(0, -0.1, -1.1);
    for (let i = 0; i < this.heatCount; i++) {
      this.heatLife[i] -= dt * 1.6;
      if (this.heatLife[i] <= 0 && Math.random() < 0.35) {
        this.heatLife[i] = 0.4 + Math.random() * 0.5;
        this.heatPos[i * 3] = this.tmp.x + (Math.random() - 0.5) * 0.5;
        this.heatPos[i * 3 + 1] = this.tmp.y + Math.random() * 0.2;
        this.heatPos[i * 3 + 2] = this.tmp.z + (Math.random() - 0.5) * 0.4;
      } else if (this.heatLife[i] > 0) {
        this.heatPos[i * 3] += (Math.random() - 0.5) * 0.4 * dt;
        this.heatPos[i * 3 + 1] += (1.2 + Math.random()) * dt;
        this.heatPos[i * 3 + 2] += (Math.random() - 0.5) * 0.3 * dt;
      } else {
        this.heatPos[i * 3 + 1] = -300;
      }
    }
    (this.heat.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.heat.material as THREE.PointsMaterial).opacity = 0.2 + speed01 * 0.25;
  }

  dispose() {
    this.disc.geometry.dispose();
    (this.disc.material as THREE.Material).dispose();
    this.heat.geometry.dispose();
    (this.heat.material as THREE.Material).dispose();
    this.group.parent?.remove(this.group);
  }
}
