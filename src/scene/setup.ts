import * as THREE from 'three';
import type { QualitySettings } from '../effects/quality';
import type { GameRendererHandle, RendererInitInfo } from '../render/types';
import { isWebGPUActive } from '../render/runtime';
import { COLORS } from './setupColors';

export { COLORS } from './setupColors';

/** Lazily loaded WebGPU/TSL sky module — never pulled on the mobile WebGL path. */
type WebGPUSkyModule = typeof import('./skyMaterials');
let webgpuSkyModule: WebGPUSkyModule | null = null;

export interface AtmosphereState {
  /** 0..1 — denser haze near horizon / low altitude */
  haze: number;
  /** 0..1 — warm sun intensity pulse */
  sunPulse: number;
  /** World-space focus for shadow / fog follow */
  focus: THREE.Vector3;
}

type SkyHandles = {
  kind: 'webgl' | 'webgpu';
  uniforms: any;
};

type FlareHandles = {
  kind: 'webgl' | 'webgpu';
  uniforms: any;
};

/**
 * Procedural gradient sky dome with sun disc glow (BackSide sphere).
 * Uses ShaderMaterial on WebGL and TSL NodeMaterial on WebGPU.
 */
export function createSunsetSkyDome(radius = 520): THREE.Mesh {
  if (isWebGPUActive() && webgpuSkyModule) {
    const { material, uniforms } = webgpuSkyModule.createWebGPUSunsetSkyMaterial();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
    sky.name = 'sunset-sky';
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.userData.skyHandles = { kind: 'webgpu', uniforms } satisfies SkyHandles;
    return sky;
  }

  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      midColor: { value: new THREE.Color(COLORS.skyMid) },
      horizonColor: { value: new THREE.Color(COLORS.skyHorizon) },
      bottomColor: { value: new THREE.Color(COLORS.tealDeep) },
      sunDir: { value: new THREE.Vector3(0.55, 0.28, -0.45).normalize() },
      sunColor: { value: new THREE.Color(COLORS.orangeSun) },
      haze: { value: 0.35 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float haze;
      uniform float time;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;
        vec3 col;
        if (h > 0.12) {
          float t = clamp((h - 0.12) / 0.88, 0.0, 1.0);
          col = mix(midColor, topColor, pow(t, 0.85));
        } else if (h > -0.08) {
          float t = clamp((h + 0.08) / 0.2, 0.0, 1.0);
          col = mix(horizonColor, midColor, t);
        } else {
          float t = clamp((h + 0.45) / 0.37, 0.0, 1.0);
          col = mix(bottomColor, horizonColor, t);
        }
        float sun = pow(max(0.0, dot(dir, sunDir)), 36.0);
        float glow = pow(max(0.0, dot(dir, sunDir)), 4.0);
        float pulse = 1.0 + 0.04 * sin(time * 0.35);
        col += sunColor * (sun * 0.9 * pulse + glow * 0.24 * haze);
        float horizonBand = exp(-abs(h) * 6.0) * haze * 0.28;
        col = mix(col, horizonColor, horizonBand);
        float cool = pow(max(0.0, -dot(dir, sunDir)), 2.0) * 0.08;
        col += vec3(0.12, 0.28, 0.32) * cool;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sunset-sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.userData.skyHandles = {
    kind: 'webgl',
    uniforms: mat.uniforms,
  } satisfies SkyHandles;
  return sky;
}

/** Soft volumetric-feeling sun disc + corona for the Fruzer skyline. */
export function createSunDisc(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sun-disc';
  group.position.set(90, 38, -70);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(11, 20, 20),
    new THREE.MeshBasicMaterial({ color: COLORS.orangeSun, fog: false }),
  );
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(17, 20, 20),
    new THREE.MeshBasicMaterial({
      color: COLORS.orangeGlow,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(28, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffaa66,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(halo);

  const flareGeo = new THREE.PlaneGeometry(70, 70);
  let flare: THREE.Mesh;
  if (isWebGPUActive() && webgpuSkyModule) {
    const { material, uniforms } = webgpuSkyModule.createWebGPUSunFlareMaterial();
    flare = new THREE.Mesh(flareGeo, material);
    flare.userData.flareHandles = { kind: 'webgpu', uniforms } satisfies FlareHandles;
  } else {
    const flareMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        color: { value: new THREE.Color(COLORS.orangeHot) },
        intensity: { value: 0.35 },
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
        uniform float intensity;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float a = exp(-r * r * 2.8) * intensity;
          float spokes = pow(max(0.0, 1.0 - abs(d.x) * 8.0), 3.0) * exp(-abs(d.y) * 6.0) * 0.35;
          spokes += pow(max(0.0, 1.0 - abs(d.y) * 8.0), 3.0) * exp(-abs(d.x) * 6.0) * 0.28;
          gl_FragColor = vec4(color, clamp(a + spokes * intensity, 0.0, 0.85));
        }
      `,
    });
    flare = new THREE.Mesh(flareGeo, flareMat);
    flare.userData.flareHandles = {
      kind: 'webgl',
      uniforms: flareMat.uniforms,
    } satisfies FlareHandles;
  }
  flare.name = 'sun-flare';
  flare.renderOrder = -900;
  group.add(flare);

  return group;
}

export async function createSceneSetup(canvas: HTMLCanvasElement) {
  const { createGameRenderer } = await import('../render/createRenderer');
  const gameRenderer = await createGameRenderer({ canvas });
  // Prime WebGPU sky/TSL only when that backend actually won — keeps phones on WebGL lean.
  if (gameRenderer.isWebGPURenderer) {
    webgpuSkyModule = await import('./skyMaterials');
  } else {
    webgpuSkyModule = null;
  }
  return createSceneSetupWithRenderer(canvas, gameRenderer);
}

export function createSceneSetupWithRenderer(
  _canvas: HTMLCanvasElement,
  gameRenderer: GameRendererHandle,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.skyTop);
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.0011);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.5,
    1400,
  );
  camera.position.set(0, 12, 20);

  const renderer = gameRenderer.renderer;
  const rendererInfo: RendererInitInfo = gameRenderer.info;

  // Warm key — sunset disc
  const sunLight = new THREE.DirectionalLight(COLORS.orangeGlow, 1.95);
  sunLight.position.set(80, 45, -60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 380;
  sunLight.shadow.camera.left = -140;
  sunLight.shadow.camera.right = 140;
  sunLight.shadow.camera.top = 140;
  sunLight.shadow.camera.bottom = -140;
  sunLight.shadow.bias = -0.00032;
  sunLight.shadow.normalBias = 0.03;
  sunLight.shadow.radius = 2.5;
  scene.add(sunLight);

  // Cool fill — keeps shadowed Fruzer faces readable
  const fillLight = new THREE.DirectionalLight(COLORS.tealMid, 0.72);
  fillLight.position.set(-50, 28, 40);
  scene.add(fillLight);

  // Rim from opposite horizon (teal edge light)
  const rimLight = new THREE.DirectionalLight(COLORS.rimCool, 0.35);
  rimLight.position.set(-70, 18, -40);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0x5a7080, 0.78);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(COLORS.orangeGlow, COLORS.tealDeep, 0.92);
  scene.add(hemi);

  // Soft volumetric-feeling sun glow (no real volumetrics — cheap point)
  const sunGlow = new THREE.PointLight(COLORS.orangeHot, 1.1, 220, 2);
  sunGlow.position.copy(sunLight.position);
  scene.add(sunGlow);

  const atmosphere: AtmosphereState = {
    haze: 0.4,
    sunPulse: 0,
    focus: new THREE.Vector3(),
  };

  const baseFogDensity = 0.0011;
  const fogColor = new THREE.Color(COLORS.fog);
  let skyMesh: THREE.Mesh | null = null;
  let sunDisc: THREE.Group | null = null;

  const attachSky = (sky: THREE.Mesh) => {
    skyMesh = sky;
  };

  const attachSunDisc = (disc: THREE.Group) => {
    sunDisc = disc;
  };

  /** Drive fog / exposure / sun glow from flight context. */
  const updateAtmosphere = (dt: number, altitude: number, speed: number) => {
    atmosphere.sunPulse = (atmosphere.sunPulse + dt * 0.35) % (Math.PI * 2);
    const lowAlt = THREE.MathUtils.clamp(1 - altitude / 80, 0, 1);
    const speedHaze = THREE.MathUtils.clamp(speed / 55, 0, 1) * 0.15;
    atmosphere.haze = THREE.MathUtils.lerp(
      atmosphere.haze,
      0.28 + lowAlt * 0.35 + speedHaze,
      1 - Math.exp(-dt * 3),
    );

    const fog = scene.fog as THREE.FogExp2;
    fog.density = baseFogDensity * (0.85 + atmosphere.haze * 0.55);
    fogColor.set(COLORS.fog).lerp(new THREE.Color(COLORS.fogNear), atmosphere.haze * 0.35);
    fog.color.copy(fogColor);
    // Keep background close to fog so distant Fruzer edges blend cleanly
    scene.background = fogColor;

    const pulse = 1 + Math.sin(atmosphere.sunPulse) * 0.04;
    sunLight.intensity = 1.85 * pulse;
    sunGlow.intensity = 0.95 + atmosphere.haze * 0.45;
    sunGlow.position.copy(sunLight.position);
    renderer.toneMappingExposure = 1.42 + atmosphere.haze * 0.12;

    if (skyMesh) {
      const handles = skyMesh.userData.skyHandles as SkyHandles | undefined;
      if (handles?.uniforms) {
        const hazeU = handles.uniforms.haze;
        const timeU = handles.uniforms.time;
        if (hazeU) hazeU.value = atmosphere.haze;
        if (timeU) timeU.value = (timeU.value as number) + dt;
      }
    }

    if (sunDisc) {
      const flare = sunDisc.getObjectByName('sun-flare') as THREE.Mesh | undefined;
      if (flare) {
        flare.quaternion.copy(camera.quaternion);
        const handles = flare.userData.flareHandles as FlareHandles | undefined;
        const intensity = handles?.uniforms?.intensity;
        if (intensity) {
          intensity.value =
            0.28 + atmosphere.haze * 0.22 + Math.sin(atmosphere.sunPulse) * 0.03;
        }
      }
      const glowMesh = sunDisc.children[1] as THREE.Mesh | undefined;
      if (glowMesh) {
        const gmat = glowMesh.material as THREE.MeshBasicMaterial;
        gmat.opacity = 0.32 + atmosphere.haze * 0.12;
      }
    }
  };

  const applyQuality = (q: QualitySettings) => {
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatioCap);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = q.shadowsEnabled;
    sunLight.castShadow = q.shadowsEnabled;
    if (q.shadowsEnabled) {
      const size = q.shadowMapSize;
      if (sunLight.shadow.mapSize.x !== size) {
        sunLight.shadow.mapSize.set(size, size);
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;
      }
      // Tighter contact treatment — reduce peter-panning without acne.
      sunLight.shadow.bias = q.tier === 'high' ? -0.00028 : -0.0004;
      sunLight.shadow.normalBias = q.tier === 'high' ? 0.028 : 0.035;
      sunLight.shadow.radius = q.tier === 'low' ? 1 : q.tier === 'medium' ? 2 : 3;
    }
  };

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    rendererInfo,
    gameRenderer,
    sunLight,
    fillLight,
    rimLight,
    sunGlow,
    ambient,
    hemi,
    atmosphere,
    updateAtmosphere,
    applyQuality,
    attachSky,
    attachSunDisc,
    onResize,
  };
}

export type SceneSetup = ReturnType<typeof createSceneSetupWithRenderer>;
