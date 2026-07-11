import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  normalize,
  positionWorld,
  mix,
  float,
  vec3,
  vec4,
  uniform,
  pow,
  max,
  dot,
  exp,
  abs,
  sin,
  uv,
  length,
  clamp,
  select,
  greaterThan,
} from 'three/tsl';
import { COLORS } from './setupColors';

export interface SkyUniformHandles {
  haze: { value: number };
  time: { value: number };
}

export interface FlareUniformHandles {
  intensity: { value: number };
}

/**
 * WebGPU-compatible sunset sky via TSL MeshBasicNodeMaterial.
 * Mirrors the GLSL ShaderMaterial look used on the WebGL path.
 */
export function createWebGPUSunsetSkyMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: SkyUniformHandles;
} {
  const topColor = uniform(new THREE.Color(COLORS.skyTop));
  const midColor = uniform(new THREE.Color(COLORS.skyMid));
  const horizonColor = uniform(new THREE.Color(COLORS.skyHorizon));
  const bottomColor = uniform(new THREE.Color(COLORS.tealDeep));
  const sunDir = uniform(new THREE.Vector3(0.55, 0.28, -0.45).normalize());
  const sunColor = uniform(new THREE.Color(COLORS.orangeSun));
  const haze = uniform(0.35);
  const time = uniform(0);

  const material = new MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  material.depthWrite = false;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const dir = normalize(positionWorld);
    const h = dir.y;

    const upperT = clamp(h.sub(0.12).div(0.88), 0, 1);
    const upper = mix(midColor, topColor, pow(upperT, 0.85));

    const midT = clamp(h.add(0.08).div(0.2), 0, 1);
    const midBand = mix(horizonColor, midColor, midT);

    const lowT = clamp(h.add(0.45).div(0.37), 0, 1);
    const lower = mix(bottomColor, horizonColor, lowT);

    let col = select(greaterThan(h, float(-0.08)), midBand, lower);
    col = select(greaterThan(h, float(0.12)), upper, col);

    const sun = pow(max(0, dot(dir, sunDir)), 36);
    const glow = pow(max(0, dot(dir, sunDir)), 4);
    const pulse = float(1).add(sin(time.mul(0.35)).mul(0.04));
    col = col.add(sunColor.mul(sun.mul(0.9).mul(pulse).add(glow.mul(0.24).mul(haze))));

    const horizonBand = exp(abs(h).mul(-6)).mul(haze).mul(0.28);
    col = mix(col, horizonColor, horizonBand);

    const cool = pow(max(0, dot(dir, sunDir).mul(-1)), 2).mul(0.08);
    col = col.add(vec3(0.12, 0.28, 0.32).mul(cool));

    return vec4(col, 1);
  })();

  return {
    material,
    uniforms: {
      haze: haze as unknown as { value: number },
      time: time as unknown as { value: number },
    },
  };
}

/**
 * Soft radial sun flare for WebGPU (TSL), matching the WebGL additive disc.
 */
export function createWebGPUSunFlareMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: FlareUniformHandles;
} {
  const colorU = uniform(new THREE.Color(COLORS.orangeHot));
  const intensity = uniform(0.35);

  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.blending = THREE.AdditiveBlending;
  material.side = THREE.DoubleSide;
  material.fragmentNode = Fn(() => {
    const d = uv().sub(0.5);
    const r = length(d).mul(2);
    const a = exp(r.mul(r).mul(-2.8)).mul(intensity);
    const spokesX = pow(max(0, float(1).sub(abs(d.x).mul(8))), 3)
      .mul(exp(abs(d.y).mul(-6)))
      .mul(0.35);
    const spokesY = pow(max(0, float(1).sub(abs(d.y).mul(8))), 3)
      .mul(exp(abs(d.x).mul(-6)))
      .mul(0.28);
    const alpha = clamp(a.add(spokesX.add(spokesY).mul(intensity)), 0, 0.85);
    return vec4(colorU, alpha);
  })();

  return {
    material,
    uniforms: {
      intensity: intensity as unknown as { value: number },
    },
  };
}
