import * as THREE from 'three';
import { COLORS } from '../scene/setup';

/**
 * Procedural low-poly helicopter built from primitives.
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
  const blurMat = new THREE.MeshBasicMaterial({
    color: 0xa8d4c8,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Fuselage
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  heli.add(body);

  // Nose taper
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 4), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.5, 1.55);
  nose.castShadow = true;
  heli.add(nose);

  // Cockpit glass
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
  cockpit.position.set(0, 0.85, 0.55);
  cockpit.scale.set(1, 0.7, 1.1);
  heli.add(cockpit);

  // Tail boom
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.2), darkMat);
  boom.position.set(0, 0.65, -2.0);
  boom.castShadow = true;
  heli.add(boom);

  // Vertical stabilizer
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.55), darkMat);
  fin.position.set(0, 1.0, -3.0);
  heli.add(fin);

  // Horizontal stabilizer
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.35), darkMat);
  hStab.position.set(0, 0.7, -2.95);
  heli.add(hStab);

  // Skids
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

  // Accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.6), accentMat);
  stripe.position.set(0, 0.55, 0.1);
  heli.add(stripe);

  // Main rotor mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.45, 6), rotorMat);
  mast.position.set(0, 1.15, 0);
  heli.add(mast);

  // Main rotor group (spins)
  const mainRotor = new THREE.Group();
  mainRotor.name = 'mainRotor';
  mainRotor.position.set(0, 1.38, 0);

  const bladeGeo = new THREE.BoxGeometry(0.18, 0.03, 3.6);
  const blade1 = new THREE.Mesh(bladeGeo, rotorMat);
  const blade2 = new THREE.Mesh(bladeGeo, rotorMat);
  blade2.rotation.y = Math.PI / 2;
  mainRotor.add(blade1, blade2);

  // Rotor blur disc
  const blur = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), blurMat);
  blur.rotation.x = -Math.PI / 2;
  blur.name = 'rotorBlur';
  mainRotor.add(blur);

  heli.add(mainRotor);

  // Tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.name = 'tailRotor';
  tailRotor.position.set(0.18, 0.95, -3.05);

  const tBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.04), rotorMat);
  const tBlade2 = tBlade.clone();
  tBlade2.rotation.z = Math.PI / 2;
  tailRotor.add(tBlade, tBlade2);
  heli.add(tailRotor);

  // Exhaust glow
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

  heli.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return heli;
}
