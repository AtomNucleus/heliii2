import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import type { QualitySettings } from './quality';

/** Sunset cinematic grade — warm midtones, teal shadows, soft contrast. */
const SunsetGradeShader = {
  name: 'SunsetGradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    warmth: { value: 0.12 },
    contrast: { value: 1.06 },
    saturation: { value: 1.08 },
    tealLift: { value: 0.04 },
    vignetteMix: { value: 0 },
    speedPunch: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float contrast;
    uniform float saturation;
    uniform float tealLift;
    uniform float speedPunch;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // Soft contrast around mid-gray
      col = (col - 0.5) * contrast + 0.5;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, saturation);

      // Warm highlights / teal shadow split
      float shadowMask = 1.0 - smoothstep(0.15, 0.55, luma);
      float highlightMask = smoothstep(0.45, 0.9, luma);
      col += vec3(warmth, warmth * 0.45, -warmth * 0.25) * highlightMask;
      col += vec3(-tealLift * 0.4, tealLift * 0.55, tealLift) * shadowMask;

      // High-speed desat + slight crush for urgency
      col = mix(col, vec3(luma) * vec3(1.05, 0.95, 0.88), speedPunch * 0.18);
      col *= 1.0 + speedPunch * 0.04;

      gl_FragColor = vec4(clamp(col, 0.0, 1.2), tex.a);
    }
  `,
};

export interface PostProcessingHandle {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  vignette: ShaderPass;
  rgbShift: ShaderPass;
  film: FilmPass;
  grade: ShaderPass;
  /** 0..1 flight intensity — drives chromatic aberration & vignette punch */
  setSpeedIntensity: (t: number) => void;
  applyQuality: (q: QualitySettings) => void;
  update: (dt: number) => void;
  onResize: () => void;
  render: () => void;
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingHandle {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.18,
    0.42,
    0.88,
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(SunsetGradeShader);
  composer.addPass(grade);

  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms['offset'].value = 1.15;
  vignette.uniforms['darkness'].value = 1.05;
  composer.addPass(vignette);

  const rgbShift = new ShaderPass(RGBShiftShader);
  rgbShift.uniforms['amount'].value = 0.0004;
  rgbShift.uniforms['angle'].value = 0;
  composer.addPass(rgbShift);

  // FilmPass(intensity, grayscale) — r170 API
  const film = new FilmPass(0.28, false);
  film.enabled = false;
  composer.addPass(film);

  composer.addPass(new OutputPass());

  let speedIntensity = 0;
  let qualityScale = 1;
  let filmTime = 0;

  const setSpeedIntensity = (t: number) => {
    speedIntensity = THREE.MathUtils.clamp(t, 0, 1);
  };

  const applyQuality = (q: QualitySettings) => {
    qualityScale = q.composerScale;
    bloom.enabled = q.bloomEnabled;
    bloom.strength = q.bloomStrength;
    grade.enabled = q.colorGrade;
    vignette.enabled = q.vignette;
    rgbShift.enabled = q.chromaticAberration;
    film.enabled = q.filmGrain;
    onResize();
  };

  const update = (dt: number) => {
    filmTime += dt;
    const punch = speedIntensity * speedIntensity;

    vignette.uniforms['offset'].value = 1.12 + punch * 0.18;
    vignette.uniforms['darkness'].value = 1.0 + punch * 0.35;

    if (grade.enabled) {
      grade.uniforms['speedPunch'].value = punch;
      grade.uniforms['warmth'].value = 0.1 + punch * 0.06;
    }

    if (rgbShift.enabled) {
      rgbShift.uniforms['amount'].value = 0.00035 + punch * 0.0028;
      rgbShift.uniforms['angle'].value = filmTime * 0.15;
    }

    if (film.enabled) {
      const u = film.uniforms as Record<string, { value: number }>;
      if (u.intensity) u.intensity.value = 0.18 + punch * 0.2;
    }
  };

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sw = Math.max(1, Math.floor(w * qualityScale));
    const sh = Math.max(1, Math.floor(h * qualityScale));
    composer.setSize(sw, sh);
    bloom.resolution.set(sw, sh);
  };
  window.addEventListener('resize', onResize);
  onResize();

  return {
    composer,
    bloom,
    vignette,
    rgbShift,
    film,
    grade,
    setSpeedIntensity,
    applyQuality,
    update,
    onResize,
    render: () => composer.render(),
  };
}
