import * as THREE from 'three';
import { CombatFx } from '../effects/combat/CombatFx';
import { getQualitySettings, type QualityTier } from '../effects/quality';
import { COLORS } from '../scene/setupColors';

type VfxScenario = 'explosion' | 'tracers' | 'heli-hero' | 'quality-low';

const app = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const status = document.querySelector<HTMLElement>('#harness-status');
if (!app || !canvas || !status) throw new Error('VFX harness shell missing');

const params = new URLSearchParams(location.search);
const requested = params.get('scenario') as VfxScenario | null;
const scenario: VfxScenario = ['explosion', 'tracers', 'heli-hero', 'quality-low'].includes(
  requested ?? '',
)
  ? (requested as VfxScenario)
  : 'explosion';
const quality: QualityTier = scenario === 'quality-low' ? 'low' : 'medium';
const seed = Number(params.get('seed')) || 0x51a7e;
const steps = Math.max(1, Math.min(120, Number(params.get('steps')) || 7));
const dt = 1 / 60;

function createRng(initialSeed: number): () => number {
  let state = initialSeed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.48;
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.skyTop);
scene.fog = new THREE.FogExp2(COLORS.fog, 0.006);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 420);
camera.position.set(28, 18, 34);
camera.lookAt(0, 5, 0);

scene.add(new THREE.HemisphereLight(COLORS.orangeGlow, COLORS.tealDeep, 1.25));
const sun = new THREE.DirectionalLight(COLORS.orangeHot, 3.2);
sun.position.set(-28, 50, 24);
sun.castShadow = quality !== 'low';
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const rim = new THREE.DirectionalLight(COLORS.rimCool, 1.4);
rim.position.set(25, 16, -32);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(170, 170),
  new THREE.MeshStandardMaterial({
    color: COLORS.tealDeep,
    roughness: 0.76,
    metalness: 0.16,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Authored synthetic skyline: stable, fast, and useful for lighting/readability snapshots.
const city = new THREE.Group();
city.name = 'harness-city';
const cityRng = createRng(0xc17c1);
for (let i = 0; i < 42; i++) {
  const w = 3 + cityRng() * 5;
  const d = 3 + cityRng() * 5;
  const h = 5 + cityRng() * 21;
  const x = (cityRng() - 0.5) * 100;
  const z = -15 - cityRng() * 65;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COLORS.tealMid).multiplyScalar(0.35 + cityRng() * 0.24),
    emissive: cityRng() > 0.76 ? new THREE.Color(0x52250d) : new THREE.Color(0x031010),
    emissiveIntensity: 0.65,
    roughness: 0.58,
    metalness: 0.32,
  });
  const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  building.position.set(x, h / 2, z);
  building.castShadow = true;
  building.receiveShadow = true;
  city.add(building);
}
scene.add(city);

function createHelicopter(): THREE.Group {
  const heli = new THREE.Group();
  heli.name = 'harness-helicopter';
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x174f56,
    emissive: 0x031b1c,
    metalness: 0.74,
    roughness: 0.24,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x10252d,
    emissive: 0x082c31,
    metalness: 0.85,
    roughness: 0.08,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.55, 4.4, 8, 14), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  heli.add(body);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.48, 18, 12), glassMat);
  cockpit.scale.set(1.35, 0.84, 0.78);
  cockpit.position.x = 2.1;
  cockpit.castShadow = true;
  heli.add(cockpit);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.42, 0.55), bodyMat);
  tail.position.x = -5.2;
  tail.rotation.z = -0.06;
  heli.add(tail);
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0xc6fff7,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.08, 48), rotorMat);
  rotor.position.y = 1.72;
  heli.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 6, 24), rotorMat);
  tailRotor.position.set(-8.35, 0.35, 0);
  tailRotor.rotation.y = Math.PI / 2;
  heli.add(tailRotor);
  return heli;
}

const heli = createHelicopter();
heli.position.set(-5, 7.5, 2);
heli.rotation.y = -0.25;
scene.add(heli);

const landingGlow = new THREE.Mesh(
  new THREE.RingGeometry(5.5, 5.8, 64),
  new THREE.MeshBasicMaterial({
    color: COLORS.rimCool,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }),
);
landingGlow.rotation.x = -Math.PI / 2;
landingGlow.position.y = 0.035;
scene.add(landingGlow);

const combat = new CombatFx(scene);
combat.applyQuality(getQualitySettings(quality));
combat.setCamera(camera);
combat.setGroundHeight(() => 0);
combat.setFollowTarget(heli.position);

const originalRandom = Math.random;
Math.random = createRng(seed);
try {
  if (scenario === 'explosion' || scenario === 'quality-low') {
    combat.spawnExplosion(new THREE.Vector3(4, 2.2, -3), 1.65, COLORS.orangeHot);
    combat.spawnImpact(
      new THREE.Vector3(4, 0.15, -3),
      'ground',
      1.3,
      new THREE.Vector3(0, 1, 0),
    );
  } else if (scenario === 'tracers') {
    const origin = new THREE.Vector3(-1.2, 7.5, 1);
    const directions = [
      new THREE.Vector3(0.8, -0.03, -1),
      new THREE.Vector3(0.72, 0.03, -1),
      new THREE.Vector3(0.9, 0.08, -1),
    ];
    for (const direction of directions) {
      combat.spawnMuzzleFlash(origin, direction);
      combat.spawnTracer(origin, direction, COLORS.neonGreen);
    }
  } else {
    combat.spawnMuzzleFlash(
      new THREE.Vector3(0.2, 7.2, 1),
      new THREE.Vector3(0.9, 0, -1),
    );
  }
  for (let i = 0; i < steps; i++) combat.update(dt);
} finally {
  Math.random = originalRandom;
}

function visibleLeaves(root: THREE.Object3D | undefined): number {
  if (!root) return 0;
  let count = 0;
  root.traverse((child) => {
    if (child !== root && child.visible && child.children.length === 0) count++;
  });
  return count;
}

const burstCount = visibleLeaves(scene.getObjectByName('combat-bursts'));
const smokeCount = visibleLeaves(scene.getObjectByName('combat-smoke-fire'));
const tracerCount = visibleLeaves(scene.getObjectByName('combat-tracers'));
const debrisCount = visibleLeaves(scene.getObjectByName('combat-debris'));
const fxVisible = burstCount + smokeCount + tracerCount + debrisCount;
const expectsExplosion = scenario === 'explosion' || scenario === 'quality-low';
const harnessPass = expectsExplosion
  ? burstCount > 0 && smokeCount > 0 && fxVisible > 2
  : scenario === 'tracers'
    ? tracerCount > 0
    : fxVisible > 0;

Object.assign(app.dataset, {
  harnessReady: '1',
  harnessKind: 'vfx',
  harnessScenario: scenario,
  harnessPass: harnessPass ? '1' : '0',
  quality,
  seed: String(seed),
  burstCount: String(burstCount),
  smokeCount: String(smokeCount),
  tracerCount: String(tracerCount),
  debrisCount: String(debrisCount),
  visibleFxCount: String(fxVisible),
});
status.textContent = [
  `SCENARIO  ${scenario}`,
  `RESULT    ${harnessPass ? 'PASS' : 'FAIL'}`,
  `QUALITY   ${quality.toUpperCase()}   SEED  ${seed}`,
  `BURSTS    ${burstCount}   SMOKE  ${smokeCount}`,
  `TRACERS   ${tracerCount}   DEBRIS ${debrisCount}`,
  `FIXED STEP ${steps} × ${dt.toFixed(4)}s`,
].join('\n');

renderer.render(scene, camera);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
});
