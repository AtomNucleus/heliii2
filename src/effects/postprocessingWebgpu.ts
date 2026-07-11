import * as THREE from 'three';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import {
  pass,
  uniform,
  vec2,
  vec3,
  float,
  mix,
  dot,
  smoothstep,
  Fn,
  screenUV,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js';
import type { QualitySettings } from './quality';
import type { PostProcessingHandle } from './postprocessingTypes';

/**
 * WebGPU / TSL post stack mirroring the WebGL EffectComposer look:
 * bloom → sunset grade → vignette → RGB shift → optional film grain.
 *
 * Not a pixel-perfect GLSL port, but preserves cinematic identity
 * (warm grade, teal shadows, bloom, speed-driven punch).
 */
export function createWebGPUPostProcessing(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingHandle {
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');

  const bloomStrength = uniform(0.18);
  const bloomRadius = uniform(0.42);
  const bloomThreshold = uniform(0.88);
  const bloomNode = bloom(sceneColor, bloomStrength, bloomRadius, bloomThreshold);

  const warmth = uniform(0.12);
  const contrast = uniform(1.06);
  const saturation = uniform(1.08);
  const tealLift = uniform(0.04);
  const speedPunch = uniform(0);
  const vignetteOffset = uniform(1.15);
  const vignetteDarkness = uniform(1.05);
  const filmIntensity = uniform(0.28);

  const enableBloom = uniform(1);
  const enableGrade = uniform(1);
  const enableVignette = uniform(1);
  const enableRgb = uniform(1);
  const enableFilm = uniform(0);

  const bloomed = sceneColor.add(bloomNode.mul(enableBloom));

  const graded = Fn(() => {
    let col = bloomed.rgb;

    const contrasted = col.sub(0.5).mul(contrast).add(0.5);
    col = mix(col, contrasted, enableGrade);

    const luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    const satCol = mix(vec3(luma), col, saturation);
    col = mix(col, satCol, enableGrade);

    const shadowMask = float(1).sub(smoothstep(float(0.15), float(0.55), luma));
    const highlightMask = smoothstep(float(0.45), float(0.9), luma);
    const warmLift = vec3(warmth, warmth.mul(0.45), warmth.mul(-0.25)).mul(highlightMask);
    const teal = vec3(tealLift.mul(-0.4), tealLift.mul(0.55), tealLift).mul(shadowMask);
    col = col.add(warmLift.add(teal).mul(enableGrade));

    const punch = speedPunch.mul(speedPunch);
    const urgency = vec3(luma).mul(vec3(1.05, 0.95, 0.88));
    col = mix(col, urgency, punch.mul(0.18).mul(enableGrade));
    col = col.mul(float(1).add(punch.mul(0.04).mul(enableGrade)));

    const uvCoord = screenUV.sub(vec2(0.5)).mul(vignetteOffset);
    const vig = mix(col, vec3(float(1).sub(vignetteDarkness)), dot(uvCoord, uvCoord));
    col = mix(col, vig, enableVignette);

    return col;
  })();

  // TSL display nodes are loosely typed across three/tsl revisions — keep chain explicit.
  const rgbNode = rgbShift(graded as any, 0.0004, 0);
  const afterRgb = mix(graded as any, rgbNode as any, enableRgb);
  const filmNode = film(afterRgb as any, filmIntensity);
  const outputNode = mix(afterRgb as any, filmNode as any, enableFilm);

  const pipeline = new RenderPipeline(renderer, outputNode as any);

  let speedIntensity = 0;
  let qualityScale = 1;
  let filmTime = 0;

  const setSpeedIntensity = (t: number) => {
    speedIntensity = THREE.MathUtils.clamp(t, 0, 1);
  };

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    scenePass.setResolutionScale(qualityScale);
    bloomNode.setResolutionScale(qualityScale);
    bloomNode.setSize(
      Math.max(1, Math.floor(w * qualityScale)),
      Math.max(1, Math.floor(h * qualityScale)),
    );
  };

  const applyQuality = (q: QualitySettings) => {
    qualityScale = q.composerScale;
    enableBloom.value = q.bloomEnabled ? 1 : 0;
    bloomStrength.value = q.bloomStrength;
    enableGrade.value = q.colorGrade ? 1 : 0;
    enableVignette.value = q.vignette ? 1 : 0;
    enableRgb.value = q.chromaticAberration ? 1 : 0;
    enableFilm.value = q.filmGrain ? 1 : 0;
    onResize();
  };

  const update = (dt: number) => {
    filmTime += dt;
    const punch = speedIntensity * speedIntensity;
    speedPunch.value = punch;
    warmth.value = 0.1 + punch * 0.06;
    vignetteOffset.value = 1.12 + punch * 0.18;
    vignetteDarkness.value = 1.0 + punch * 0.35;
    rgbNode.amount.value = 0.00035 + punch * 0.0028;
    rgbNode.angle.value = filmTime * 0.15;
    filmIntensity.value = 0.18 + punch * 0.2;
  };

  window.addEventListener('resize', onResize);
  onResize();

  return {
    backend: 'webgpu',
    setSpeedIntensity,
    applyQuality,
    update,
    onResize,
    render: () => {
      pipeline.render();
    },
  };
}
