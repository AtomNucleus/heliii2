import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHeliMaterialKit, upgradeLoadedMaterials, tagKitMaterials } from './heliMaterials';
import { attachHeliDetails } from './heliDetails';
import { bindHeliVisualRuntime } from './heliVisuals';
import { buildProceduralAttackHeli } from './heliProcedural';

export type { HeliVisualUpdateInput } from './heliVisuals';
export { updateHelicopterVisuals, getHeliVisualRuntime } from './heliVisuals';
export { HELI_LOD, distanceToLod } from './heliLod';

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

/** Prefer cohesive procedural Attack Heli; set true to force legacy GLB. */
const PREFER_PROCEDURAL = true;

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
    const local = new THREE.Matrix4().multiplyMatrices(
      inv,
      new THREE.Matrix4().compose(worldPos, worldQuat, worldScale),
    );
    local.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }

  return rotor;
}

function addRotorBlur(mainRotor: THREE.Group, radius: number, material?: THREE.MeshBasicMaterial) {
  const blurMat =
    material ??
    new THREE.MeshBasicMaterial({
      color: 0xa8d4c8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), blurMat);
  blur.rotation.x = -Math.PI / 2;
  blur.name = 'rotorBlur';
  mainRotor.add(blur);
  return blur;
}

function finalizeHelicopterVisuals(
  heli: THREE.Group,
  opts: {
    fromGlb: boolean;
    procedural?: boolean;
    nearOnly?: THREE.Object3D[];
    midOnly?: THREE.Object3D[];
    shadowCasters?: THREE.Object3D[];
    kit?: ReturnType<typeof createHeliMaterialKit>;
  },
) {
  const kit = opts.kit ?? createHeliMaterialKit();
  tagKitMaterials(kit);
  if (opts.fromGlb) {
    upgradeLoadedMaterials(heli, kit);
  }

  const mainRotor = heli.getObjectByName('mainRotor') as THREE.Group | null;
  const details = attachHeliDetails(heli, kit, mainRotor, { procedural: !!opts.procedural });
  bindHeliVisualRuntime(heli, kit, details, {
    nearOnly: opts.nearOnly,
    midOnly: opts.midOnly,
    shadowCasters: opts.shadowCasters,
  });
  enableShadows(heli);
  heli.userData.heliSource = opts.procedural ? 'procedural' : opts.fromGlb ? 'glb' : 'fallback';
  return heli;
}

function prepareLoadedModel(gltfScene: THREE.Group): THREE.Group {
  const heli = new THREE.Group();
  heli.name = 'helicopter';

  const model = new THREE.Group();
  model.name = 'heliModel';
  model.add(gltfScene);

  const bodyMeshes = findByNames(gltfScene, BODY_NAMES);
  const measureTarget = bodyMeshes[0] ?? gltfScene;
  const rawBox = new THREE.Box3().setFromObject(measureTarget);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  const length = Math.max(rawSize.z, rawSize.x, 0.001);
  const scale = TARGET_BODY_LENGTH / length;
  model.scale.setScalar(scale);

  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBox.min.y;

  heli.add(model);
  heli.updateMatrixWorld(true);

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

  const rotorBox = new THREE.Box3().setFromObject(mainRotor);
  const rotorSize = new THREE.Vector3();
  rotorBox.getSize(rotorSize);
  const blurRadius = Math.max(rotorSize.x, rotorSize.z) * 0.48 || 1.9;
  addRotorBlur(mainRotor, blurRadius);

  return finalizeHelicopterVisuals(heli, { fromGlb: true, procedural: false });
}

/**
 * Load the player Attack Heli.
 * Default: cohesive procedural current-gen silhouette + PBR detail layer.
 * Legacy GLB retained (CC-BY Attack Chopper) when PREFER_PROCEDURAL is false
 * or as an explicit fallback if procedural construction throws.
 *
 * API contract for controller / mission:
 * - returns THREE.Group named `helicopter`
 * - children include `mainRotor`, `tailRotor`, `rotorBlur`
 * - call `updateHelicopterVisuals(heli, { dt, time, speed, health, cameraPosition })` each frame
 */
export async function loadHelicopter(): Promise<THREE.Group> {
  if (PREFER_PROCEDURAL) {
    try {
      return createHelicopter();
    } catch (err) {
      console.warn('Procedural heli failed, trying GLB', err);
    }
  }

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
 * Procedural current-gen stylized attack helicopter (primary hero vehicle).
 * Includes main/tail rotors, blur discs, and the shared detail / visual runtime.
 */
export function createHelicopter(): THREE.Group {
  const kit = createHeliMaterialKit();
  tagKitMaterials(kit);
  const parts = buildProceduralAttackHeli(kit);

  return finalizeHelicopterVisuals(parts.root, {
    fromGlb: false,
    procedural: true,
    kit,
    nearOnly: parts.nearGreebles,
    midOnly: parts.midParts,
    shadowCasters: parts.shadowCasters,
  });
}
