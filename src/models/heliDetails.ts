import * as THREE from 'three';
import type { HeliMaterialKit } from './heliMaterials';

export interface HeliDetailHandles {
  group: THREE.Group;
  canopy: THREE.Mesh;
  interior: THREE.Group;
  weaponPods: THREE.Group;
  navLights: {
    red: THREE.Mesh;
    green: THREE.Mesh;
    strobe: THREE.Mesh;
    beacon: THREE.Mesh;
  };
  navPointLights: {
    red: THREE.PointLight;
    green: THREE.PointLight;
    strobe: THREE.PointLight;
  };
  cockpitLight: THREE.PointLight;
  exhaustGlow: THREE.Mesh;
  exhaustLight: THREE.PointLight;
  damageDecals: THREE.Mesh[];
  rotorBlurInner: THREE.Mesh;
  rotorBlurOuter: THREE.Mesh;
  antenna: THREE.Mesh;
}

function shadowMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Procedural detail layer parented under the helicopter root.
 * Positions are in arcade body space (fuselage ~4 units long, skids at y≈0).
 */
export function attachHeliDetails(
  heli: THREE.Group,
  kit: HeliMaterialKit,
  mainRotor: THREE.Object3D | null,
): HeliDetailHandles {
  const group = new THREE.Group();
  group.name = 'heliDetails';
  heli.add(group);

  // --- Cockpit canopy (glass bubble over nose) ---
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    kit.canopy,
  );
  canopy.name = 'heliCanopy';
  canopy.position.set(0, 1.05, 0.72);
  canopy.scale.set(1.05, 0.72, 1.25);
  group.add(canopy);

  // Frame rails around canopy
  const frameMat = kit.metalDark;
  const frameRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.025, 6, 20, Math.PI * 1.2),
    frameMat,
  );
  frameRing.rotation.x = Math.PI / 2;
  frameRing.position.set(0, 0.95, 0.55);
  frameRing.scale.set(1.05, 1.15, 1);
  group.add(shadowMesh(frameRing));

  // --- Interior (seat + console glow) ---
  const interior = new THREE.Group();
  interior.name = 'heliInterior';
  interior.position.set(0, 0.72, 0.55);
  group.add(interior);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.38), kit.interior);
  seat.position.set(0, 0.05, -0.05);
  interior.add(seat);

  const console = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.22),
    kit.accent.clone(),
  );
  (console.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
  console.position.set(0, 0.12, 0.28);
  interior.add(console);

  const dashGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.08),
    new THREE.MeshBasicMaterial({
      color: 0x39ff9a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  dashGlow.name = 'dashGlow';
  dashGlow.position.set(0, 0.17, 0.28);
  dashGlow.rotation.x = -0.4;
  interior.add(dashGlow);

  const cockpitLight = new THREE.PointLight(0x4ecdc4, 0.55, 2.8, 2);
  cockpitLight.name = 'cockpitLight';
  cockpitLight.position.set(0, 0.35, 0.15);
  interior.add(cockpitLight);

  // --- Weapon pods / pylons (augment GLB missiles) ---
  const weaponPods = new THREE.Group();
  weaponPods.name = 'weaponPods';
  group.add(weaponPods);

  const pylonGeo = new THREE.BoxGeometry(0.12, 0.08, 0.85);
  const railGeo = new THREE.CylinderGeometry(0.035, 0.04, 1.1, 8);
  const tipGeo = new THREE.ConeGeometry(0.05, 0.18, 8);

  for (const side of [-1, 1] as const) {
    const pod = new THREE.Group();
    pod.position.set(side * 0.95, 0.42, 0.15);

    const pylon = shadowMesh(new THREE.Mesh(pylonGeo, kit.metalDark));
    pylon.position.set(0, 0.12, 0);
    pod.add(pylon);

    const rail = shadowMesh(new THREE.Mesh(railGeo, kit.weapon));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0, 0.05);
    pod.add(rail);

    // Twin rocket tubes
    for (const z of [-0.22, 0.22]) {
      const tube = shadowMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.95, 10), kit.weapon),
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(side * 0.12, -0.06, z);
      pod.add(tube);

      const tip = shadowMesh(new THREE.Mesh(tipGeo, kit.accent));
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(side * 0.12, -0.06, z + 0.55);
      pod.add(tip);
    }

    // Hardpoint fairing
    const fairing = shadowMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.55), kit.body),
    );
    fairing.position.set(0, 0.02, -0.1);
    pod.add(fairing);

    weaponPods.add(pod);
  }

  // Chin gun turret hint
  const chin = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 8), kit.metalDark),
  );
  chin.rotation.x = Math.PI / 2;
  chin.position.set(0, 0.28, 1.55);
  weaponPods.add(chin);
  const barrel = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.45, 6), kit.weapon),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.22, 1.85);
  weaponPods.add(barrel);

  // --- Navigation lights ---
  const bulb = new THREE.SphereGeometry(0.055, 10, 8);
  const red = new THREE.Mesh(bulb, kit.navRed);
  red.name = 'navLightRed';
  red.position.set(-0.78, 0.78, 0.35);
  const green = new THREE.Mesh(bulb, kit.navGreen);
  green.name = 'navLightGreen';
  green.position.set(0.78, 0.78, 0.35);
  const strobe = new THREE.Mesh(bulb, kit.navWhite);
  strobe.name = 'navLightStrobe';
  strobe.position.set(0, 0.55, -2.85);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    kit.navWhite.clone(),
  );
  beacon.name = 'navLightBeacon';
  beacon.position.set(0, 1.42, -0.15);
  group.add(red, green, strobe, beacon);

  const redL = new THREE.PointLight(0xff2040, 0.35, 4.5, 2);
  redL.position.copy(red.position);
  const greenL = new THREE.PointLight(0x20ff60, 0.35, 4.5, 2);
  greenL.position.copy(green.position);
  const strobeL = new THREE.PointLight(0xffffff, 0.15, 6, 2);
  strobeL.position.copy(strobe.position);
  group.add(redL, greenL, strobeL);

  // --- Exhaust ---
  const exhaustGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.28, 10),
    kit.exhaust,
  );
  exhaustGlow.name = 'exhaustGlow';
  exhaustGlow.rotation.x = Math.PI / 2;
  exhaustGlow.position.set(0, 0.48, -1.25);
  group.add(exhaustGlow);

  const exhaustLight = new THREE.PointLight(0xff6b20, 0.6, 3.5, 2);
  exhaustLight.name = 'exhaustLight';
  exhaustLight.position.set(0, 0.45, -1.4);
  group.add(exhaustLight);

  // --- Antenna / sensor ---
  const antenna = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.55, 6), kit.metalDark),
  );
  antenna.name = 'heliAntenna';
  antenna.position.set(0.15, 1.35, -0.85);
  group.add(antenna);
  const sensor = shadowMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), kit.weapon),
  );
  sensor.position.set(-0.2, 0.55, 1.35);
  group.add(sensor);

  // Side intake scoops
  for (const side of [-1, 1]) {
    const scoop = shadowMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.45), kit.metalDark),
    );
    scoop.position.set(side * 0.72, 0.7, -0.35);
    group.add(scoop);
  }

  // Tail boom reinforcement rings
  for (const z of [-1.6, -2.2, -2.7]) {
    const ring = shadowMesh(
      new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 12), kit.metalDark),
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 0.65, z);
    group.add(ring);
  }

  // --- Damage decals (hidden until health drops) ---
  const damageDecals: THREE.Mesh[] = [];
  const scarGeo = new THREE.PlaneGeometry(0.45, 0.22);
  const scarSpots = [
    new THREE.Vector3(0.55, 0.7, 0.2),
    new THREE.Vector3(-0.5, 0.55, -0.4),
    new THREE.Vector3(0.2, 0.85, -0.9),
    new THREE.Vector3(-0.35, 0.6, 0.9),
  ];
  for (let i = 0; i < scarSpots.length; i++) {
    const scar = new THREE.Mesh(scarGeo, kit.damageScar.clone());
    scar.name = `damageScar${i}`;
    scar.position.copy(scarSpots[i]);
    scar.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    scar.visible = false;
    group.add(scar);
    damageDecals.push(scar);
  }

  // --- Enhanced rotor blur (inner + outer discs on main rotor) ---
  let rotorBlurInner: THREE.Mesh;
  let rotorBlurOuter: THREE.Mesh;

  const existingBlur = heli.getObjectByName('rotorBlur') as THREE.Mesh | null;
  if (existingBlur && existingBlur.isMesh) {
    existingBlur.material = kit.rotorBlur;
    existingBlur.renderOrder = 2;
    rotorBlurOuter = existingBlur;

    const innerMat = kit.rotorBlur.clone();
    innerMat.opacity = 0.18;
    innerMat.color.setHex(0xd8fff0);
    const circleParams = (existingBlur.geometry as THREE.CircleGeometry).parameters;
    const radius = (circleParams?.radius ?? 1.9) * 0.55;
    rotorBlurInner = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), innerMat);
    rotorBlurInner.name = 'rotorBlurInner';
    rotorBlurInner.rotation.x = -Math.PI / 2;
    rotorBlurInner.position.y = 0.01;
    rotorBlurInner.renderOrder = 3;
    existingBlur.parent?.add(rotorBlurInner);
  } else {
    const parent = mainRotor ?? group;
    rotorBlurOuter = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28), kit.rotorBlur);
    rotorBlurOuter.name = 'rotorBlur';
    rotorBlurOuter.rotation.x = -Math.PI / 2;
    parent.add(rotorBlurOuter);
    rotorBlurInner = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 24),
      kit.rotorBlur.clone(),
    );
    rotorBlurInner.name = 'rotorBlurInner';
    rotorBlurInner.rotation.x = -Math.PI / 2;
    rotorBlurInner.position.y = 0.01;
    parent.add(rotorBlurInner);
  }

  // Mast cap detail on main rotor hub
  if (mainRotor) {
    const hub = shadowMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), kit.metalDark),
    );
    hub.position.y = 0.06;
    mainRotor.add(hub);
  }

  return {
    group,
    canopy,
    interior,
    weaponPods,
    navLights: { red, green, strobe, beacon },
    navPointLights: { red: redL, green: greenL, strobe: strobeL },
    cockpitLight,
    exhaustGlow,
    exhaustLight,
    damageDecals,
    rotorBlurInner,
    rotorBlurOuter,
    antenna,
  };
}
