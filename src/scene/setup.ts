import * as THREE from 'three';

/** Shared sunset / teal palette */
export const COLORS = {
  tealDeep: 0x0a2a2e,
  tealShadow: 0x0d3d42,
  tealMid: 0x1a5a5e,
  orangeSun: 0xff8c3a,
  orangeGlow: 0xffb347,
  orangeHot: 0xff6b20,
  neonGreen: 0x39ff9a,
  neonDim: 0x1a8f5a,
  water: 0x1a4a55,
  waterDeep: 0x0d2a32,
  grass: 0x2d6b3a,
  grassDark: 0x1a4a28,
  pine: 0x1e5c32,
  pineDark: 0x0f3a1e,
  rock: 0x4a5560,
  rockDark: 0x2a3238,
  sand: 0xc4a574,
  pad: 0x3a4550,
  padMark: 0x39ff9a,
  skyTop: 0x1a3040,
  skyHorizon: 0xff7a3c,
  fog: 0x2a4550,
};

export function createSceneSetup(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.skyTop);
  // Light fog so textured Fruzer Polygon materials stay readable at distance
  scene.fog = new THREE.FogExp2(COLORS.fog, 0.002);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.5,
    800,
  );
  camera.position.set(0, 12, 20);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Higher exposure so textured BR materials aren't crushed by ACES
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Warm key light — keep sunset feel without black unlit faces
  const sunLight = new THREE.DirectionalLight(COLORS.orangeGlow, 1.85);
  sunLight.position.set(80, 45, -60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 350;
  sunLight.shadow.camera.left = -140;
  sunLight.shadow.camera.right = 140;
  sunLight.shadow.camera.top = 140;
  sunLight.shadow.camera.bottom = -140;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // Stronger cool fill so shadowed faces stay readable
  const fillLight = new THREE.DirectionalLight(COLORS.tealMid, 0.85);
  fillLight.position.set(-40, 20, 30);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x5a7080, 0.72);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(COLORS.orangeGlow, COLORS.tealDeep, 0.7);
  scene.add(hemi);

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, sunLight, onResize };
}

export type SceneSetup = ReturnType<typeof createSceneSetup>;
