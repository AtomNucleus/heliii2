import * as THREE from 'three';
import { SpatialHash, WorldCollision } from '../collision';
import { CAMERA_OCCLUSION } from '../collision/cameraOcclusion';
import {
  createChaseCameraState,
  updateChaseCamera,
  type ChaseCameraOcclusion,
} from '../helicopter/chaseCamera';

type ScenarioId =
  | 'wall-block'
  | 'thin-wall-tunnel'
  | 'lag-through-wall'
  | 'rim-perimeter'
  | 'corner-yaw'
  | 'clear-arm';

interface HarnessScenario {
  id: ScenarioId;
  heli: THREE.Vector3;
  yaw: number;
  walls: Array<{
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  }>;
  halfExtent: number;
  perimeter: boolean;
  expectOccluded: boolean;
}

const SCENARIOS: Record<ScenarioId, HarnessScenario> = {
  'wall-block': {
    id: 'wall-block',
    heli: new THREE.Vector3(0, 8, 0),
    yaw: 0,
    walls: [{ minX: -7, minY: 0, minZ: -25, maxX: 7, maxY: 30, maxZ: -18 }],
    halfExtent: 100,
    perimeter: false,
    expectOccluded: true,
  },
  'thin-wall-tunnel': {
    id: 'thin-wall-tunnel',
    heli: new THREE.Vector3(0, 8, 0),
    yaw: 0,
    walls: [{ minX: -7, minY: 0, minZ: -8, maxX: 7, maxY: 26, maxZ: -4 }],
    halfExtent: 100,
    perimeter: false,
    expectOccluded: true,
  },
  'lag-through-wall': {
    id: 'lag-through-wall',
    heli: new THREE.Vector3(0, 8, 0),
    yaw: 0,
    walls: [{ minX: -8, minY: 0, minZ: -20, maxX: 8, maxY: 28, maxZ: -15 }],
    halfExtent: 100,
    perimeter: false,
    expectOccluded: true,
  },
  'rim-perimeter': {
    id: 'rim-perimeter',
    heli: new THREE.Vector3(90, 8, 0),
    yaw: -Math.PI / 2,
    walls: [],
    halfExtent: 100,
    perimeter: true,
    expectOccluded: true,
  },
  'corner-yaw': {
    id: 'corner-yaw',
    heli: new THREE.Vector3(90, 8, 90),
    yaw: (-3 * Math.PI) / 4,
    walls: [],
    halfExtent: 100,
    perimeter: true,
    expectOccluded: true,
  },
  'clear-arm': {
    id: 'clear-arm',
    heli: new THREE.Vector3(0, 8, 0),
    yaw: 0,
    walls: [{ minX: 30, minY: 0, minZ: 20, maxX: 42, maxY: 25, maxZ: 32 }],
    halfExtent: 100,
    perimeter: false,
    expectOccluded: false,
  },
};

const app = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const status = document.querySelector<HTMLElement>('#harness-status');
if (!app || !canvas || !status) throw new Error('Camera harness shell missing');

const params = new URLSearchParams(location.search);
const requested = params.get('scenario') as ScenarioId | null;
const scenario = SCENARIOS[requested ?? 'wall-block'] ?? SCENARIOS['wall-block'];
const frames = Math.max(1, Math.min(240, Number(params.get('frames')) || 60));
const dt = Math.max(1 / 240, Math.min(0.1, Number(params.get('dt')) || 1 / 60));

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x061018);
scene.fog = new THREE.Fog(0x061018, 80, 230);
scene.add(new THREE.HemisphereLight(0x8eddf5, 0x071019, 1.4));
const sun = new THREE.DirectionalLight(0xffb06b, 2.6);
sun.position.set(35, 65, 22);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(260, 260),
  new THREE.MeshStandardMaterial({ color: 0x102d35, roughness: 0.82, metalness: 0.12 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(260, 52, 0x2e8f92, 0x183f49));

const hash = new SpatialHash([], 12);
const collision = new WorldCollision(hash);
for (const wall of scenario.walls) {
  collision.registerCollider({ ...wall, kind: 'building', tag: 'harness-wall' });
}
if (scenario.perimeter) collision.ensurePerimeterWalls(scenario.halfExtent, 80);

const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0xff315f,
  emissive: 0x5d071e,
  transparent: true,
  opacity: 0.74,
  roughness: 0.42,
  metalness: 0.18,
});
const perimeterMaterial = new THREE.MeshBasicMaterial({
  color: 0xff315f,
  transparent: true,
  opacity: 0.09,
  depthWrite: false,
  side: THREE.DoubleSide,
});
for (const box of hash.all()) {
  const size = new THREE.Vector3(
    box.maxX - box.minX,
    box.maxY - box.minY,
    box.maxZ - box.minZ,
  );
  const isPerimeter = box.tag === 'camera-perimeter';
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    isPerimeter ? perimeterMaterial : wallMaterial,
  );
  mesh.position.set(
    (box.minX + box.maxX) / 2,
    (box.minY + box.maxY) / 2,
    (box.minZ + box.maxZ) / 2,
  );
  mesh.castShadow = !isPerimeter;
  mesh.receiveShadow = !isPerimeter;
  scene.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xff98ad }),
  );
  edges.position.copy(mesh.position);
  scene.add(edges);
}

const heli = new THREE.Group();
heli.position.copy(scenario.heli);
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(1.2, 3.4, 6, 10),
  new THREE.MeshStandardMaterial({
    color: 0x28cfc0,
    emissive: 0x063b3a,
    metalness: 0.6,
    roughness: 0.28,
  }),
);
body.rotation.z = Math.PI / 2;
body.castShadow = true;
heli.add(body);
const rotor = new THREE.Mesh(
  new THREE.BoxGeometry(9, 0.08, 0.22),
  new THREE.MeshBasicMaterial({ color: 0xb8fff8 }),
);
rotor.position.y = 1.55;
heli.add(rotor);
scene.add(heli);

const chaseCamera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 300);
const chaseState = createChaseCameraState(scenario.heli);
if (scenario.id === 'lag-through-wall') {
  chaseState.camSmooth.set(0, 18, -38);
}

let everOccluded = false;
const occlusion: ChaseCameraOcclusion = {
  resolve(pivot, desired) {
    const result = collision.resolveCameraPosition(pivot, desired, scenario.halfExtent);
    everOccluded ||= result.hit;
    return result.hit;
  },
};

for (let i = 0; i < frames; i++) {
  updateChaseCamera(
    chaseState,
    chaseCamera,
    scenario.heli,
    new THREE.Vector3(),
    scenario.yaw,
    0,
    0,
    0,
    false,
    70,
    dt,
    occlusion,
  );
}

const pivot = scenario.heli.clone();
pivot.y += 1.4;
const cameraMarker = new THREE.Mesh(
  new THREE.SphereGeometry(CAMERA_OCCLUSION.radius, 18, 12),
  new THREE.MeshStandardMaterial({
    color: 0xff9c58,
    emissive: 0x8c2c09,
    roughness: 0.22,
  }),
);
cameraMarker.position.copy(chaseCamera.position);
scene.add(cameraMarker);

const armGeometry = new THREE.BufferGeometry().setFromPoints([pivot, chaseCamera.position]);
const arm = new THREE.Line(
  armGeometry,
  new THREE.LineBasicMaterial({ color: everOccluded ? 0xffd166 : 0x68fff2 }),
);
scene.add(arm);

const pivotMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.45, 14, 10),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
pivotMarker.position.copy(pivot);
scene.add(pivotMarker);

function sphereInsideSolid(position: THREE.Vector3): boolean {
  for (const box of hash.all()) {
    const x = THREE.MathUtils.clamp(position.x, box.minX, box.maxX);
    const y = THREE.MathUtils.clamp(position.y, box.minY, box.maxY);
    const z = THREE.MathUtils.clamp(position.z, box.minZ, box.maxZ);
    const distanceSq =
      (position.x - x) ** 2 + (position.y - y) ** 2 + (position.z - z) ** 2;
    if (distanceSq < CAMERA_OCCLUSION.radius ** 2 - 1e-4) return true;
  }
  return false;
}

const insideSolid = sphereInsideSolid(chaseCamera.position);
const pastRim =
  Math.abs(chaseCamera.position.x) > scenario.halfExtent + 0.01 ||
  Math.abs(chaseCamera.position.z) > scenario.halfExtent + 0.01;
const scenarioPass =
  !insideSolid &&
  !pastRim &&
  (scenario.expectOccluded ? everOccluded : !everOccluded);

Object.assign(app.dataset, {
  harnessReady: '1',
  harnessKind: 'camera',
  harnessScenario: scenario.id,
  harnessPass: scenarioPass ? '1' : '0',
  camOccluded: everOccluded ? '1' : '0',
  camInsideSolid: insideSolid ? '1' : '0',
  camPastRim: pastRim ? '1' : '0',
  camX: chaseCamera.position.x.toFixed(3),
  camY: chaseCamera.position.y.toFixed(3),
  camZ: chaseCamera.position.z.toFixed(3),
  perimeterCount: String(hash.all().filter((b) => b.tag === 'camera-perimeter').length),
});
status.textContent = [
  `SCENARIO  ${scenario.id}`,
  `RESULT    ${scenarioPass ? 'PASS' : 'FAIL'}`,
  `CAMERA    ${chaseCamera.position.toArray().map((v) => v.toFixed(2)).join(', ')}`,
  `OCCLUDED  ${everOccluded ? 'YES' : 'NO'}   INSIDE SOLID  ${insideSolid ? 'YES' : 'NO'}`,
  `RIM       ${pastRim ? 'OUTSIDE' : 'CLEAR'}   FIXED STEPS  ${frames}`,
].join('\n');

const observer = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
const focus = pivot.clone().lerp(chaseCamera.position, 0.45);
observer.position.copy(focus).add(new THREE.Vector3(35, 30, 44));
if (scenario.id.startsWith('rim') || scenario.id === 'corner-yaw') {
  observer.position.copy(focus).add(new THREE.Vector3(42, 42, 48));
}
observer.lookAt(focus);

rotor.rotation.y = Math.PI / 8;
renderer.render(scene, observer);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  observer.aspect = innerWidth / innerHeight;
  observer.updateProjectionMatrix();
  renderer.render(scene, observer);
});
