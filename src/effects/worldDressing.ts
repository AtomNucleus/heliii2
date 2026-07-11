import * as THREE from 'three';
import { COLORS } from '../scene/setup';
import { isWebGPUActive } from '../render/runtime';
import type { QualitySettings } from './quality';

interface CloudSlot {
  mesh: THREE.Mesh;
  drift: THREE.Vector3;
  baseY: number;
  phase: number;
}

/**
 * Procedural world dressing: drifting sunset clouds, wind streaks,
 * and a soft horizon haze band. Pure Three.js — no textures/services.
 */
export class WorldDressing {
  readonly group = new THREE.Group();
  private clouds: CloudSlot[] = [];
  private wind: THREE.LineSegments;
  private windPos: Float32Array;
  private windVel: Float32Array;
  private windLife: Float32Array;
  private windCount = 14;
  private readonly maxWind = 28;
  private haze: THREE.Mesh;
  private cloudCount = 8;
  private readonly maxClouds = 12;
  private readonly tmp = new THREE.Vector3();
  private time = 0;
  private readonly windDir = new THREE.Vector3(0.65, 0.02, -0.35).normalize();

  constructor(scene: THREE.Scene) {
    this.group.name = 'world-dressing';
    scene.add(this.group);

    const cloudMat = this.makeCloudMaterial();
    for (let i = 0; i < this.maxClouds; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cloudMat.clone());
      mesh.frustumCulled = false;
      mesh.renderOrder = -800;
      mesh.visible = i < this.cloudCount;
      this.group.add(mesh);
      const slot: CloudSlot = {
        mesh,
        drift: new THREE.Vector3(
          (0.4 + Math.random() * 0.8) * this.windDir.x,
          0,
          (0.4 + Math.random() * 0.8) * this.windDir.z,
        ),
        baseY: 55 + Math.random() * 45,
        phase: Math.random() * Math.PI * 2,
      };
      this.placeCloud(slot, new THREE.Vector3(), true);
      this.clouds.push(slot);
    }

    this.windPos = new Float32Array(this.maxWind * 6);
    this.windVel = new Float32Array(this.maxWind * 3);
    this.windLife = new Float32Array(this.maxWind);
    for (let i = 0; i < this.maxWind; i++) {
      this.windLife[i] = 0;
      this.windPos[i * 6 + 1] = -400;
      this.windPos[i * 6 + 4] = -400;
    }
    const windGeo = new THREE.BufferGeometry();
    windGeo.setAttribute('position', new THREE.BufferAttribute(this.windPos, 3));
    const windMat = new THREE.LineBasicMaterial({
      color: 0xffe2c0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.wind = new THREE.LineSegments(windGeo, windMat);
    this.wind.frustumCulled = false;
    this.wind.name = 'wind-streaks';
    this.group.add(this.wind);

    // Soft horizon haze torus / ring — cheap atmospheric depth cue
    const hazeGeo = new THREE.CylinderGeometry(280, 320, 28, 48, 1, true);
    const hazeMat = isWebGPUActive()
      ? new THREE.MeshBasicMaterial({
          color: COLORS.skyHorizon,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      : new THREE.ShaderMaterial({
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            color: { value: new THREE.Color(COLORS.skyHorizon) },
            opacity: { value: 0.18 },
            time: { value: 0 },
          },
          vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        void main() {
          vUv = uv;
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
          fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        varying vec2 vUv;
        varying float vY;
        void main() {
          float band = 1.0 - smoothstep(0.0, 14.0, abs(vY));
          float pulse = 0.85 + 0.15 * sin(time * 0.2 + vUv.x * 6.28);
          float a = band * opacity * pulse;
          gl_FragColor = vec4(color, a);
        }
      `,
        });
    this.haze = new THREE.Mesh(hazeGeo, hazeMat);
    this.haze.position.y = 8;
    this.haze.name = 'horizon-haze';
    this.haze.renderOrder = -850;
    this.group.add(this.haze);
  }

  private makeCloudMaterial(): THREE.Material {
    if (isWebGPUActive()) {
      // WebGPURenderer does not support ShaderMaterial — soft billboard stand-in.
      return new THREE.MeshBasicMaterial({
        color: COLORS.cloud,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Custom shaders must explicitly include Three's fog uniforms/chunks.
      // These distant clouds already blend into the horizon by opacity.
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        color: { value: new THREE.Color(COLORS.cloud) },
        opacity: { value: 0.45 },
        soft: { value: 1.6 },
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
        uniform float soft;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          // Soft multi-lobe cloud silhouette
          float d = length(p * vec2(1.0, 1.35));
          float lobe =
            exp(-pow(length(p - vec2(-0.25, 0.05)) * soft, 2.0)) +
            exp(-pow(length(p - vec2(0.2, -0.08)) * soft * 1.1, 2.0)) +
            exp(-pow(length(p - vec2(0.0, 0.12)) * soft * 0.9, 2.0)) * 0.8;
          float a = clamp(lobe * 0.55, 0.0, 1.0) * opacity * (1.0 - smoothstep(0.75, 1.15, d));
          if (a < 0.02) discard;
          vec3 col = mix(color * 0.75, color, clamp(lobe, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }

  private placeCloud(slot: CloudSlot, focus: THREE.Vector3, initial: boolean) {
    const ang = Math.random() * Math.PI * 2;
    const r = initial ? 40 + Math.random() * 180 : 120 + Math.random() * 160;
    const x = focus.x + Math.cos(ang) * r;
    const z = focus.z + Math.sin(ang) * r;
    const w = 28 + Math.random() * 55;
    const h = w * (0.28 + Math.random() * 0.22);
    slot.mesh.scale.set(w, h, 1);
    slot.mesh.position.set(x, slot.baseY + Math.sin(slot.phase) * 4, z);
    slot.mesh.rotation.y = ang + Math.PI * 0.5;
    const mat = slot.mesh.material;
    const opacity = 0.28 + Math.random() * 0.28;
    const hex = Math.random() > 0.55 ? COLORS.cloud : 0xffb080;
    if (mat instanceof THREE.ShaderMaterial) {
      mat.uniforms.opacity.value = opacity;
      mat.uniforms.color.value.setHex(hex);
    } else if (mat instanceof THREE.MeshBasicMaterial) {
      mat.opacity = opacity;
      mat.color.setHex(hex);
    }
  }

  applyQuality(q: QualitySettings) {
    this.cloudCount = Math.min(this.maxClouds, Math.max(3, q.cloudCount));
    this.windCount = Math.min(this.maxWind, Math.max(6, q.windStreakCount));
    for (let i = 0; i < this.maxClouds; i++) {
      this.clouds[i].mesh.visible = i < this.cloudCount;
    }
    for (let i = this.windCount; i < this.maxWind; i++) {
      this.windLife[i] = 0;
      this.windPos[i * 6 + 1] = -400;
      this.windPos[i * 6 + 4] = -400;
    }
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, altitude: number) {
    this.time += dt;
    this.tmp.copy(focus);

    // Clouds drift with wind and gently bob; wrap around focus
    for (let i = 0; i < this.cloudCount; i++) {
      const slot = this.clouds[i];
      slot.mesh.position.x += slot.drift.x * dt * 2.2;
      slot.mesh.position.z += slot.drift.z * dt * 2.2;
      slot.mesh.position.y = slot.baseY + Math.sin(this.time * 0.15 + slot.phase) * 3.5;
      // Face roughly toward camera for billboard feel without full lock
      slot.mesh.lookAt(camera.position.x, slot.mesh.position.y, camera.position.z);

      const dx = slot.mesh.position.x - focus.x;
      const dz = slot.mesh.position.z - focus.z;
      if (dx * dx + dz * dz > 220 * 220) {
        this.placeCloud(slot, focus, false);
      }
    }

    // Horizon haze follows player XZ
    this.haze.position.x = focus.x;
    this.haze.position.z = focus.z;
    const hazeOpacity = 0.12 + THREE.MathUtils.clamp(1 - altitude / 100, 0, 1) * 0.12;
    const hazeMat = this.haze.material;
    if (hazeMat instanceof THREE.ShaderMaterial) {
      hazeMat.uniforms.time.value = this.time;
      hazeMat.uniforms.opacity.value = hazeOpacity;
    } else if (hazeMat instanceof THREE.MeshBasicMaterial) {
      hazeMat.opacity = hazeOpacity;
    }

    // Ambient wind streaks in mid air
    const spawnChance = 0.35;
    for (let i = 0; i < this.windCount; i++) {
      this.windLife[i] -= dt * 0.55;
      if (this.windLife[i] <= 0) {
        if (Math.random() < spawnChance * dt * 8) {
          const side = (Math.random() - 0.5) * 90;
          const up = 8 + Math.random() * 50;
          const ahead = (Math.random() - 0.5) * 90;
          const ox = focus.x + this.windDir.x * ahead + this.windDir.z * side;
          const oy = focus.y * 0.15 + up;
          const oz = focus.z + this.windDir.z * ahead - this.windDir.x * side;
          const len = 4 + Math.random() * 10;
          this.windPos[i * 6] = ox;
          this.windPos[i * 6 + 1] = oy;
          this.windPos[i * 6 + 2] = oz;
          this.windPos[i * 6 + 3] = ox - this.windDir.x * len;
          this.windPos[i * 6 + 4] = oy - this.windDir.y * len;
          this.windPos[i * 6 + 5] = oz - this.windDir.z * len;
          this.windVel[i * 3] = this.windDir.x * (6 + Math.random() * 8);
          this.windVel[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
          this.windVel[i * 3 + 2] = this.windDir.z * (6 + Math.random() * 8);
          this.windLife[i] = 1.2 + Math.random() * 1.8;
        } else {
          this.windPos[i * 6 + 1] = -400;
          this.windPos[i * 6 + 4] = -400;
        }
      } else {
        for (let k = 0; k < 2; k++) {
          this.windPos[i * 6 + k * 3] += this.windVel[i * 3] * dt;
          this.windPos[i * 6 + k * 3 + 1] += this.windVel[i * 3 + 1] * dt;
          this.windPos[i * 6 + k * 3 + 2] += this.windVel[i * 3 + 2] * dt;
        }
      }
    }
    (this.wind.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.wind.material as THREE.LineBasicMaterial).opacity =
      0.12 + THREE.MathUtils.clamp(altitude / 80, 0, 1) * 0.12;
  }

  dispose() {
    for (const slot of this.clouds) {
      slot.mesh.geometry.dispose();
      (slot.mesh.material as THREE.Material).dispose();
    }
    this.wind.geometry.dispose();
    (this.wind.material as THREE.Material).dispose();
    this.haze.geometry.dispose();
    (this.haze.material as THREE.Material).dispose();
    this.group.parent?.remove(this.group);
  }
}
