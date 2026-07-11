import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COLORS } from '../scene/setup';

/** Target fuselage length in world units (arcade scale). */
const TARGET_BODY_LENGTH = 4;

const MAIN_ROTOR_NAMES = ['Propellers_Cube000', 'Propellers_Cube.000'];
const TAIL_ROTOR_NAMES = [
  'Back_Propeller001_Cube003',
  'Back_Propeller_Cube004',
  'Back_Propeller.001_Cube.003',
  'Back_Propeller_Cube.004',
];
const BODY_NAMES = ['Helicopter_Body_Cube001', 'Helicopter_Body_Cube.001'];

function enableShadows(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

function findByNames(root: THREE.Object3D, names: string[]): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  const set = new Set(names);
  root.traverse((obj) => {
    if (set.has(obj.name)) found.push(obj);
  });
  return found;
}

function findByNameIncludes(root: THREE.Object3D, needles: string[]): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const n = obj.name.toLowerCase();
    if (needles.some((needle) => n.includes(needle.toLowerCase()))) {
      found.push(obj);
    }
  });
  return found;
}

/**
 * Reparent meshes into a named spin group whose origin is at the meshes' combined center.
 * Local transforms are adjusted so world placement stays the same.
 */
function wrapAsRotor(
  parent: THREE.Object3D,
  meshes: THREE.Object3D[],
  name: string,
): THREE.Group {
  const rotor = new THREE.Group();
  rotor.name = name;

  const box = new THREE.Box3();
  for (const mesh of meshes) {
    box.expandByObject(mesh);
  }
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Convert world hub into parent local space
  parent.worldToLocal(center);
  rotor.position.copy(center);
  parent.add(rotor);

  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);
    mesh.parent?.remove(mesh);
    rotor.add(mesh);
    rotor.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(rotor.matrixWorld).invert();
    const local = new THREE.Matrix4().multiplyMatrices(inv, new THREE.Matrix4().compose(worldPos, worldQuat, worldScale));
    local.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }

  return rotor;
}

function addRotorBlur(mainRotor: THREE.Group, radius: number) {
  const blurMat = new THREE.MeshBasicMaterial({
    color: 0xa8d4c8,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), blurMat);
  blur.rotation.x = -Math.PI / 2;
  blur.name = 'rotorBlur';
  mainRotor.add(blur);
}

function prepareLoadedModel(gltfScene: THREE.Group): THREE.Group {
  const heli = new THREE.Group();
  heli.name = 'helicopter';

  const model = new THREE.Group();
  model.name = 'heliModel';
  model.add(gltfScene);

  // Measure body (or whole model) before scale
  const bodyMeshes = findByNames(gltfScene, BODY_NAMES);
  const measureTarget = bodyMeshes[0] ?? gltfScene;
  const rawBox = new THREE.Box3().setFromObject(measureTarget);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  const length = Math.max(rawSize.z, rawSize.x, 0.001);
  const scale = TARGET_BODY_LENGTH / length;
  model.scale.setScalar(scale);

  // Model nose already faces +Z (game forward); keep orientation.
  // Center horizontally on XZ; keep skids near y=0.
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBox.min.y;

  heli.add(model);
  heli.updateMatrixWorld(true);

  // Main rotor
  let mainMeshes = findByNames(heli, MAIN_ROTOR_NAMES);
  if (mainMeshes.length === 0) {
    mainMeshes = findByNameIncludes(heli, ['Propeller']).filter(
      (o) => !o.name.toLowerCase().includes('back'),
    );
  }
  let mainRotor: THREE.Group;
  if (mainMeshes.length > 0) {
    mainRotor = wrapAsRotor(heli, mainMeshes, 'mainRotor');
  } else {
    mainRotor = new THREE.Group();
    mainRotor.name = 'mainRotor';
    mainRotor.position.set(0, 1.4, 0);
    heli.add(mainRotor);
  }

  // Tail rotors (may be one or two blades)
  let tailMeshes = findByNames(heli, TAIL_ROTOR_NAMES);
  if (tailMeshes.length === 0) {
    tailMeshes = findByNameIncludes(heli, ['Back_Propeller', 'back_propeller', 'Tail']);
  }
  if (tailMeshes.length > 0) {
    wrapAsRotor(heli, tailMeshes, 'tailRotor');
  } else {
    const tailRotor = new THREE.Group();
    tailRotor.name = 'tailRotor';
    tailRotor.position.set(0.1, 1.0, -2.0);
    heli.add(tailRotor);
  }

  // Blur disc sized from main rotor span
  const rotorBox = new THREE.Box3().setFromObject(mainRotor);
  const rotorSize = new THREE.Vector3();
  rotorBox.getSize(rotorSize);
  const blurRadius = Math.max(rotorSize.x, rotorSize.z) * 0.48 || 1.9;
  addRotorBlur(mainRotor, blurRadius);

  enableShadows(heli);
  return heli;
}

/**
 * Load the textured Attack Chopper GLB and wire named rotor groups for the controller.
 */
export async function loadHelicopter(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('/models/helicopter.glb');
    return prepareLoadedModel(gltf.scene);
  } catch (err) {
    console.warn('Failed to load helicopter.glb, using procedural fallback', err);
    return createHelicopter();
  }
}

/**
 * Procedural low-poly helicopter fallback (primitives).
 * Includes main rotor (blur disc) and tail rotor.
 */
export function createHelicopter(): THREE.Group {
  const heli = new THREE.Group();
  heli.name = 'helicopter';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2a8f6a,
    roughness: 0.45,
    metalness: 0.35,
    flatShading: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a40,
    roughness: 0.55,
    metalness: 0.4,
    flatShading: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccee,
    roughness: 0.15,
    metalness: 0.6,
    transparent: true,
    opacity: 0.75,
    flatShading: true,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: COLORS.orangeSun,
    roughness: 0.4,
    metalness: 0.3,
    emissive: COLORS.orangeHot,
    emissiveIntensity: 0.25,
    flatShading: true,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2528,
    roughness: 0.6,
    metalness: 0.5,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  heli.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 4), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.5, 1.55);
  nose.castShadow = true;
  heli.add(nose);

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
    glassMat,
  );
  cockpit.position.set(0, 0.85, 0.55);
  cockpit.scale.set(1, 0.7, 1.1);
  heli.add(cockpit);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.2), darkMat);
  boom.position.set(0, 0.65, -2.0);
  boom.castShadow = true;
  heli.add(boom);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.55), darkMat);
  fin.position.set(0, 1.0, -3.0);
  heli.add(fin);

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.35), darkMat);
  hStab.position.set(0, 0.7, -2.95);
  heli.add(hStab);

  const skidGeo = new THREE.BoxGeometry(0.08, 0.08, 2.0);
  const skidL = new THREE.Mesh(skidGeo, darkMat);
  skidL.position.set(-0.55, 0.08, 0.1);
  const skidR = skidL.clone();
  skidR.position.x = 0.55;
  heli.add(skidL, skidR);

  const strutGeo = new THREE.BoxGeometry(0.06, 0.35, 0.06);
  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.5, 0.6]) {
      const strut = new THREE.Mesh(strutGeo, darkMat);
      strut.position.set(x, 0.25, z);
      heli.add(strut);
    }
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.6), accentMat);
  stripe.position.set(0, 0.55, 0.1);
  heli.add(stripe);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.45, 6), rotorMat);
  mast.position.set(0, 1.15, 0);
  heli.add(mast);

  const mainRotor = new THREE.Group();
  mainRotor.name = 'mainRotor';
  mainRotor.position.set(0, 1.38, 0);

  const bladeGeo = new THREE.BoxGeometry(0.18, 0.03, 3.6);
  const blade1 = new THREE.Mesh(bladeGeo, rotorMat);
  const blade2 = new THREE.Mesh(bladeGeo, rotorMat);
  blade2.rotation.y = Math.PI / 2;
  mainRotor.add(blade1, blade2);
  addRotorBlur(mainRotor, 1.9);
  heli.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.name = 'tailRotor';
  tailRotor.position.set(0.18, 0.95, -3.05);

  const tBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.04), rotorMat);
  const tBlade2 = tBlade.clone();
  tBlade2.rotation.z = Math.PI / 2;
  tailRotor.add(tBlade, tBlade2);
  heli.add(tailRotor);

  const exhaust = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.2, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: COLORS.orangeHot,
      emissiveIntensity: 0.6,
      flatShading: true,
    }),
  );
  exhaust.position.set(0, 0.45, -1.15);
  heli.add(exhaust);

  enableShadows(heli);
  return heli;
}
