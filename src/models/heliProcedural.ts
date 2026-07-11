import * as THREE from 'three';
import type { HeliMaterialKit } from './heliMaterials';

/**
 * Cohesive stylized attack-helicopter silhouette (arcade scale ~4u long).
 * Original procedural geometry — no external meshes.
 */
export interface ProceduralHeliParts {
  root: THREE.Group;
  bodyRoot: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  /** Extra meshes for near-only LOD (panel greebles, links). */
  nearGreebles: THREE.Object3D[];
  /** Mid LOD keepers (stub wings, chin, gear). */
  midParts: THREE.Object3D[];
  shadowCasters: THREE.Object3D[];
}

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name?: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Airfoil-ish blade: thin tapered box with slight twist via scale. */
function makeBlade(
  length: number,
  chord: number,
  thickness: number,
  mat: THREE.Material,
): THREE.Mesh {
  const blade = mesh(new THREE.BoxGeometry(chord, thickness, length, 1, 1, 4), mat);
  // Taper tip
  const pos = blade.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = (z + length * 0.5) / length; // 0 root → 1 tip
    const taper = 1 - t * 0.35;
    pos.setX(i, pos.getX(i) * taper);
    pos.setY(i, pos.getY(i) * (1 - t * 0.25));
  }
  pos.needsUpdate = true;
  blade.geometry.computeVertexNormals();
  return blade;
}

/**
 * Build the full procedural Attack Heli body + rotors.
 * Caller still attaches detail layer (canopy glass, nav, damage) via heliDetails.
 */
export function buildProceduralAttackHeli(kit: HeliMaterialKit): ProceduralHeliParts {
  const root = new THREE.Group();
  root.name = 'helicopter';

  const bodyRoot = new THREE.Group();
  bodyRoot.name = 'heliModel';
  root.add(bodyRoot);

  const nearGreebles: THREE.Object3D[] = [];
  const midParts: THREE.Object3D[] = [];
  const shadowCasters: THREE.Object3D[] = [];

  const body = kit.body;
  const dark = kit.metalDark;
  const accent = kit.accent;
  const rotorMat = kit.rotor;
  const weapon = kit.weapon;

  // --- Fuselage core (angular attack profile) ---
  const fuselage = mesh(
    new THREE.BoxGeometry(1.15, 0.72, 2.55),
    body,
    'Helicopter_Body_Cube001',
  );
  fuselage.position.set(0, 0.62, 0.05);
  bodyRoot.add(fuselage);
  shadowCasters.push(fuselage);

  // Nose / chin taper
  const nose = mesh(new THREE.BoxGeometry(0.85, 0.48, 1.05), body, 'heliNose');
  nose.position.set(0, 0.52, 1.55);
  nose.scale.set(1, 0.92, 1);
  bodyRoot.add(nose);

  const chinFairing = mesh(new THREE.BoxGeometry(0.55, 0.28, 0.7), dark, 'heliChinFairing');
  chinFairing.position.set(0, 0.28, 1.7);
  bodyRoot.add(chinFairing);
  midParts.push(chinFairing);

  // Upper deck / engine hump
  const hump = mesh(new THREE.BoxGeometry(0.95, 0.38, 1.4), body, 'heliEngineHump');
  hump.position.set(0, 1.05, -0.15);
  bodyRoot.add(hump);

  // Side cheek fairings (silhouette width)
  for (const side of [-1, 1]) {
    const cheek = mesh(new THREE.BoxGeometry(0.22, 0.45, 1.6), body);
    cheek.position.set(side * 0.62, 0.58, 0.1);
    bodyRoot.add(cheek);
  }

  // Accent stripe / IR suppress band
  const stripe = mesh(new THREE.BoxGeometry(1.18, 0.08, 1.8), accent, 'heliAccentStripe');
  stripe.position.set(0, 0.55, 0.15);
  bodyRoot.add(stripe);
  nearGreebles.push(stripe);

  // Cockpit tub (solid under glass — glass added in details)
  const tub = mesh(new THREE.BoxGeometry(0.78, 0.35, 0.95), dark, 'heliCockpitTub');
  tub.position.set(0, 0.88, 0.85);
  bodyRoot.add(tub);

  // Stub wings
  const wings = new THREE.Group();
  wings.name = 'stubWings';
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(1.15, 0.07, 0.55), dark);
    wing.position.set(side * 0.95, 0.48, 0.05);
    wing.rotation.z = side * 0.06;
    wings.add(wing);

    const tip = mesh(new THREE.BoxGeometry(0.12, 0.22, 0.35), dark);
    tip.position.set(side * 1.5, 0.52, 0.05);
    wings.add(tip);
  }
  bodyRoot.add(wings);
  midParts.push(wings);
  shadowCasters.push(wings);

  // Engine side intakes + exhaust trunks
  for (const side of [-1, 1]) {
    const intake = mesh(new THREE.BoxGeometry(0.28, 0.32, 0.55), dark);
    intake.position.set(side * 0.55, 0.85, -0.55);
    bodyRoot.add(intake);

    const trunk = mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.4, 10), kit.exhaust);
    trunk.rotation.x = Math.PI / 2;
    trunk.position.set(side * 0.28, 0.72, -1.15);
    bodyRoot.add(trunk);
  }

  // Tail boom
  const boom = mesh(new THREE.BoxGeometry(0.28, 0.26, 2.35), dark, 'heliBoom');
  boom.position.set(0, 0.72, -2.05);
  bodyRoot.add(boom);
  shadowCasters.push(boom);

  // Boom taper sleeve
  const boomSleeve = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.7), body);
  boomSleeve.position.set(0, 0.72, -1.15);
  bodyRoot.add(boomSleeve);

  // Vertical fin + horizontal stab
  const fin = mesh(new THREE.BoxGeometry(0.08, 0.85, 0.55), dark, 'heliFin');
  fin.position.set(0, 1.15, -3.05);
  bodyRoot.add(fin);

  const hStab = mesh(new THREE.BoxGeometry(1.05, 0.06, 0.38), dark, 'heliHStab');
  hStab.position.set(0, 0.78, -2.95);
  bodyRoot.add(hStab);
  midParts.push(hStab);

  // Tail rotor shroud ring (stylized fenestron hint — open side)
  const shroud = mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 20), dark, 'heliTailShroud');
  shroud.position.set(0.22, 1.05, -3.15);
  shroud.rotation.y = Math.PI / 2;
  bodyRoot.add(shroud);
  midParts.push(shroud);

  // Landing gear / skids
  const gear = new THREE.Group();
  gear.name = 'landingGear';
  const skidGeo = new THREE.BoxGeometry(0.07, 0.07, 2.15);
  const skidL = mesh(skidGeo, dark);
  skidL.position.set(-0.52, 0.07, 0.15);
  const skidR = mesh(skidGeo.clone(), dark);
  skidR.position.set(0.52, 0.07, 0.15);
  gear.add(skidL, skidR);

  const strutGeo = new THREE.BoxGeometry(0.05, 0.38, 0.05);
  for (const x of [-0.52, 0.52]) {
    for (const z of [-0.55, 0.65]) {
      const strut = mesh(strutGeo, dark);
      strut.position.set(x, 0.26, z);
      gear.add(strut);
    }
  }
  // Cross tubes
  const cross = mesh(new THREE.BoxGeometry(1.04, 0.04, 0.04), dark);
  cross.position.set(0, 0.12, 0.15);
  gear.add(cross);
  bodyRoot.add(gear);
  midParts.push(gear);

  // Panel greebles
  for (const [x, y, z, sx, sy, sz] of [
    [0.58, 0.75, 0.4, 0.06, 0.18, 0.35],
    [-0.58, 0.75, 0.4, 0.06, 0.18, 0.35],
    [0.4, 1.15, -0.4, 0.2, 0.08, 0.25],
    [-0.4, 1.15, -0.4, 0.2, 0.08, 0.25],
  ] as const) {
    const g = mesh(new THREE.BoxGeometry(sx, sy, sz), dark);
    g.position.set(x, y, z);
    bodyRoot.add(g);
    nearGreebles.push(g);
  }

  // Mast
  const mast = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 10), rotorMat, 'heliMast');
  mast.position.set(0, 1.35, -0.05);
  bodyRoot.add(mast);

  // --- Main rotor (4-blade) ---
  const mainRotor = new THREE.Group();
  mainRotor.name = 'mainRotor';
  mainRotor.position.set(0, 1.58, -0.05);

  const hub = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 12), dark, 'mainRotorHub');
  mainRotor.add(hub);

  const bladeLen = 3.7;
  for (let i = 0; i < 4; i++) {
    const blade = makeBlade(bladeLen, 0.22, 0.035, rotorMat);
    blade.name = i === 0 ? 'Propellers_Cube000' : `mainBlade${i}`;
    blade.rotation.y = (i * Math.PI) / 2;
    // Slight collective pitch
    blade.rotation.z = 0.08;
    blade.position.y = 0.02;
    mainRotor.add(blade);

    // Pitch link greeble
    const link = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.35), dark);
    link.rotation.y = (i * Math.PI) / 2;
    link.position.set(
      Math.sin((i * Math.PI) / 2) * 0.25,
      -0.04,
      Math.cos((i * Math.PI) / 2) * 0.25,
    );
    mainRotor.add(link);
    nearGreebles.push(link);
  }

  // Rotor blur disc
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(bladeLen * 0.52, 32),
    kit.rotorBlur,
  );
  blur.name = 'rotorBlur';
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 0.01;
  blur.renderOrder = 2;
  mainRotor.add(blur);

  root.add(mainRotor);

  // --- Tail rotor ---
  const tailRotor = new THREE.Group();
  tailRotor.name = 'tailRotor';
  tailRotor.position.set(0.22, 1.05, -3.15);

  const tHub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), dark);
  tHub.rotation.z = Math.PI / 2;
  tailRotor.add(tHub);

  for (let i = 0; i < 4; i++) {
    const tb = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.03), rotorMat);
    tb.name = i === 0 ? 'Back_Propeller_Cube004' : `tailBlade${i}`;
    tb.rotation.z = (i * Math.PI) / 2;
    tailRotor.add(tb);
  }
  root.add(tailRotor);

  // Placeholder wingtip missiles (names match GLB classifier)
  for (const side of [-1, 1]) {
    const missile = mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.85, 8),
      weapon,
      side < 0 ? 'Missiles_Cube007' : 'Missiles001_Cube007',
    );
    missile.rotation.x = Math.PI / 2;
    missile.position.set(side * 1.35, 0.42, 0.05);
    bodyRoot.add(missile);
  }

  return {
    root,
    bodyRoot,
    mainRotor,
    tailRotor,
    nearGreebles,
    midParts,
    shadowCasters,
  };
}
