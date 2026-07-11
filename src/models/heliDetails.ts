import * as THREE from 'three';
import type { HeliMaterialKit } from './heliMaterials';

export interface HeliDetailHandles {
  group: THREE.Group;
  canopy: THREE.Mesh;
  canopyFrame: THREE.Group;
  interior: THREE.Group;
  cockpitExtras: THREE.Group;
  weaponPods: THREE.Group;
  chinGun: THREE.Group;
  landingGearDetail: THREE.Group;
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
  damageSparks: THREE.Points;
  rotorBlurInner: THREE.Mesh;
  rotorBlurOuter: THREE.Mesh;
  tailRotorBlur: THREE.Mesh;
  antenna: THREE.Mesh;
  /** Optional blade tip refs for flex animation */
  mainBlades: THREE.Mesh[];
}

function shadowMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Procedural detail layer: angular canopy, weapon pods, lights, damage, rotor blur.
 * Positions match arcade attack-heli body (~4u long, skids at y≈0).
 */
export function attachHeliDetails(
  heli: THREE.Group,
  kit: HeliMaterialKit,
  mainRotor: THREE.Object3D | null,
  options: { procedural?: boolean } = {},
): HeliDetailHandles {
  const group = new THREE.Group();
  group.name = 'heliDetails';
  heli.add(group);

  const mainBlades: THREE.Mesh[] = [];
  if (mainRotor) {
    mainRotor.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.name.includes('Blade') || m.name.includes('Propeller'))) {
        mainBlades.push(m);
      }
    });
  }

  // --- Angular attack canopy (flat panels, not bubble) ---
  const canopyGeo = new THREE.BoxGeometry(0.72, 0.42, 1.05);
  // Bevel-ish: scale top via morph — use wedge from cone slice instead
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    kit.canopy,
  );
  canopy.name = 'heliCanopy';
  canopy.position.set(0, 1.12, 0.78);
  canopy.scale.set(1.15, 0.65, 1.35);
  // Flatten for attack profile
  if (options.procedural) {
    canopy.scale.set(1.05, 0.55, 1.2);
    canopy.position.set(0, 1.08, 0.82);
  }
  group.add(canopy);

  const canopyFrame = new THREE.Group();
  canopyFrame.name = 'canopyFrame';
  group.add(canopyFrame);

  const frameMat = kit.metalDark;
  // Longitudinal frame rails
  for (const x of [-0.32, 0.32]) {
    const rail = shadowMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.95), frameMat),
    );
    rail.position.set(x, 1.05, 0.75);
    canopyFrame.add(rail);
  }
  // Cross bow
  const bow = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.04), frameMat));
  bow.position.set(0, 1.18, 0.55);
  canopyFrame.add(bow);
  const bow2 = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.04), frameMat));
  bow2.position.set(0, 1.12, 1.05);
  canopyFrame.add(bow2);

  // Windshield wiper hint
  const wiper = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.35), frameMat));
  wiper.position.set(0.15, 1.2, 1.0);
  wiper.rotation.y = 0.3;
  canopyFrame.add(wiper);

  // --- Interior ---
  const interior = new THREE.Group();
  interior.name = 'heliInterior';
  interior.position.set(0, 0.78, 0.65);
  group.add(interior);

  const seat = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.36), kit.interior));
  seat.position.set(0, 0.08, -0.08);
  interior.add(seat);

  const headrest = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), kit.interior));
  headrest.position.set(0, 0.32, -0.22);
  interior.add(headrest);

  const console = shadowMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.24), kit.accent.clone()),
  );
  (console.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.75;
  console.position.set(0, 0.14, 0.3);
  interior.add(console);

  const dashGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.07),
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
  dashGlow.position.set(0, 0.19, 0.3);
  dashGlow.rotation.x = -0.45;
  interior.add(dashGlow);

  // MFD panels
  const cockpitExtras = new THREE.Group();
  cockpitExtras.name = 'cockpitExtras';
  for (const x of [-0.14, 0.14]) {
    const mfd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.09),
      new THREE.MeshBasicMaterial({
        color: 0x2a8cff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mfd.position.set(x, 0.18, 0.32);
    mfd.rotation.x = -0.5;
    cockpitExtras.add(mfd);
  }
  // Collective / stick stubs
  const stick = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 6), kit.metalDark));
  stick.position.set(0.12, 0.12, 0.05);
  cockpitExtras.add(stick);
  interior.add(cockpitExtras);

  const cockpitLight = new THREE.PointLight(0x4ecdc4, 0.55, 2.8, 2);
  cockpitLight.name = 'cockpitLight';
  cockpitLight.position.set(0, 0.38, 0.12);
  interior.add(cockpitLight);

  // --- Weapon pods / pylons ---
  const weaponPods = new THREE.Group();
  weaponPods.name = 'weaponPods';
  group.add(weaponPods);

  for (const side of [-1, 1] as const) {
    const pod = new THREE.Group();
    pod.name = side < 0 ? 'weaponPodL' : 'weaponPodR';
    pod.position.set(side * 1.05, 0.4, 0.08);

    const pylon = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.9), kit.metalDark));
    pylon.position.set(0, 0.1, 0);
    pod.add(pylon);

    // Rocket pod (19-tube stylized cylinder cluster)
    const cluster = shadowMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.95, 12), kit.weapon),
    );
    cluster.rotation.x = Math.PI / 2;
    cluster.position.set(side * 0.08, -0.05, 0.05);
    pod.add(cluster);

    const noseCone = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 10), kit.weapon));
    noseCone.rotation.x = -Math.PI / 2;
    noseCone.position.set(side * 0.08, -0.05, 0.62);
    pod.add(noseCone);

    // Rail missile under wing
    const rail = shadowMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 8), kit.weapon),
    );
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * 0.28, -0.02, 0);
    pod.add(rail);

    const tip = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), kit.accent));
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 0.28, -0.02, 0.58);
    pod.add(tip);

    const fairing = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.5), kit.body));
    fairing.position.set(0, 0.05, -0.15);
    pod.add(fairing);

    weaponPods.add(pod);
  }

  // Chin gun turret
  const chinGun = new THREE.Group();
  chinGun.name = 'chinGun';
  const chinBase = shadowMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), kit.metalDark),
  );
  chinBase.position.set(0, 0.22, 1.65);
  chinGun.add(chinBase);
  const chin = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 8), kit.metalDark),
  );
  chin.rotation.x = Math.PI / 2;
  chin.position.set(0, 0.2, 1.72);
  chinGun.add(chin);
  const barrel = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.55, 6), kit.weapon),
  );
  barrel.name = 'chinBarrel';
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.18, 2.05);
  chinGun.add(barrel);
  group.add(chinGun);

  // Landing gear detail (cables / steps — near LOD)
  const landingGearDetail = new THREE.Group();
  landingGearDetail.name = 'landingGearDetail';
  for (const x of [-0.52, 0.52]) {
    const step = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.08), kit.metalDark));
    step.position.set(x * 0.7, 0.35, 0.55);
    landingGearDetail.add(step);
  }
  group.add(landingGearDetail);

  // --- Navigation lights ---
  const bulb = new THREE.SphereGeometry(0.05, 10, 8);
  const red = new THREE.Mesh(bulb, kit.navRed);
  red.name = 'navLightRed';
  red.position.set(-1.48, 0.55, 0.05);
  const green = new THREE.Mesh(bulb, kit.navGreen);
  green.name = 'navLightGreen';
  green.position.set(1.48, 0.55, 0.05);
  const strobe = new THREE.Mesh(bulb, kit.navWhite);
  strobe.name = 'navLightStrobe';
  strobe.position.set(0, 0.55, -3.15);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), kit.navWhite.clone());
  beacon.name = 'navLightBeacon';
  beacon.position.set(0, 1.48, -0.2);
  group.add(red, green, strobe, beacon);

  const redL = new THREE.PointLight(0xff2040, 0.35, 4.5, 2);
  redL.name = 'navPointRed';
  redL.position.copy(red.position);
  const greenL = new THREE.PointLight(0x20ff60, 0.35, 4.5, 2);
  greenL.name = 'navPointGreen';
  greenL.position.copy(green.position);
  const strobeL = new THREE.PointLight(0xffffff, 0.15, 6, 2);
  strobeL.name = 'navPointStrobe';
  strobeL.position.copy(strobe.position);
  group.add(redL, greenL, strobeL);

  // --- Twin exhaust glow ---
  const exhaustGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 0.26, 10),
    kit.exhaust,
  );
  exhaustGlow.name = 'exhaustGlow';
  exhaustGlow.rotation.x = Math.PI / 2;
  exhaustGlow.position.set(0.28, 0.72, -1.35);
  group.add(exhaustGlow);

  // Mirror second exhaust mesh (share material)
  const exhaustGlow2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 0.26, 10),
    kit.exhaust,
  );
  exhaustGlow2.name = 'exhaustGlow2';
  exhaustGlow2.rotation.x = Math.PI / 2;
  exhaustGlow2.position.set(-0.28, 0.72, -1.35);
  group.add(exhaustGlow2);

  const exhaustLight = new THREE.PointLight(0xff6b20, 0.55, 3.5, 2);
  exhaustLight.name = 'exhaustLight';
  exhaustLight.position.set(0, 0.7, -1.5);
  group.add(exhaustLight);

  // --- Antenna / EO sensor ---
  const antenna = shadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.5, 6), kit.metalDark),
  );
  antenna.name = 'heliAntenna';
  antenna.position.set(0.18, 1.4, -0.75);
  group.add(antenna);

  const sensor = shadowMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), kit.weapon),
  );
  sensor.name = 'eoSensor';
  sensor.position.set(0, 0.38, 1.95);
  group.add(sensor);

  // Side IR jammer boxes
  for (const side of [-1, 1]) {
    const jam = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.28), kit.metalDark));
    jam.position.set(side * 0.7, 0.95, -0.85);
    group.add(jam);
  }

  // --- Damage decals ---
  const damageDecals: THREE.Mesh[] = [];
  const scarGeo = new THREE.PlaneGeometry(0.5, 0.24);
  const scarSpots = [
    { p: new THREE.Vector3(0.58, 0.72, 0.25), ry: Math.PI / 2 },
    { p: new THREE.Vector3(-0.55, 0.58, -0.35), ry: -Math.PI / 2 },
    { p: new THREE.Vector3(0.25, 0.95, -0.7), ry: 0.4 },
    { p: new THREE.Vector3(-0.4, 0.62, 0.95), ry: -0.6 },
    { p: new THREE.Vector3(0.15, 0.75, -1.8), ry: Math.PI / 2 },
    { p: new THREE.Vector3(-0.2, 1.05, 0.1), ry: 0.2 },
  ];
  for (let i = 0; i < scarSpots.length; i++) {
    const scar = new THREE.Mesh(scarGeo, kit.damageScar.clone());
    scar.name = `damageScar${i}`;
    scar.position.copy(scarSpots[i].p);
    scar.rotation.y = scarSpots[i].ry;
    scar.visible = false;
    group.add(scar);
    damageDecals.push(scar);
  }

  // Damage spark points (GPU-cheap Points)
  const sparkCount = 24;
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    sparkPos[i * 3] = (Math.random() - 0.5) * 1.2;
    sparkPos[i * 3 + 1] = 0.4 + Math.random() * 0.6;
    sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const damageSparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: 0xff6622,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
  damageSparks.name = 'damageSparks';
  damageSparks.visible = false;
  group.add(damageSparks);

  // --- Rotor blur discs ---
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
    const radius = (circleParams?.radius ?? 1.9) * 0.52;
    rotorBlurInner = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), innerMat);
    rotorBlurInner.name = 'rotorBlurInner';
    rotorBlurInner.rotation.x = -Math.PI / 2;
    rotorBlurInner.position.y = 0.015;
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
    rotorBlurInner.position.y = 0.015;
    parent.add(rotorBlurInner);
  }

  // Tail rotor blur
  const tailRotor = heli.getObjectByName('tailRotor');
  const tailBlurMat = kit.rotorBlur.clone();
  tailBlurMat.opacity = 0.2;
  tailBlurMat.color.setHex(0xc8e8e0);
  const tailRotorBlur = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), tailBlurMat);
  tailRotorBlur.name = 'tailRotorBlur';
  tailRotorBlur.rotation.y = Math.PI / 2;
  if (tailRotor) {
    tailRotor.add(tailRotorBlur);
  } else {
    tailRotorBlur.position.set(0.22, 1.05, -3.15);
    group.add(tailRotorBlur);
  }

  // Mast cap
  if (mainRotor && !mainRotor.getObjectByName('mainRotorHub')) {
    const hub = shadowMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10), kit.metalDark),
    );
    hub.name = 'mainRotorHub';
    hub.position.y = 0.06;
    mainRotor.add(hub);
  }

  // Silence unused geo warning for canopyGeo if we switched — dispose
  canopyGeo.dispose();

  return {
    group,
    canopy,
    canopyFrame,
    interior,
    cockpitExtras,
    weaponPods,
    chinGun,
    landingGearDetail,
    navLights: { red, green, strobe, beacon },
    navPointLights: { red: redL, green: greenL, strobe: strobeL },
    cockpitLight,
    exhaustGlow,
    exhaustLight,
    damageDecals,
    damageSparks,
    rotorBlurInner,
    rotorBlurOuter,
    tailRotorBlur,
    antenna,
    mainBlades,
  };
}
