import * as THREE from 'three';

export interface AircraftTelemetry {
  rpm: number;
  collective: number;
  pitchRate: number;
  bankRate: number;
}

export function makeAircraft() {
  const craft = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0xd7dfd2,
    roughness: 0.38,
    metalness: 0.18,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x4b6265,
    roughness: 0.48,
    metalness: 0.25,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x315d70,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1,
  });
  const lime = new THREE.MeshStandardMaterial({ color: 0xd6f58c, roughness: 0.4, metalness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x122228, roughness: 0.8 });
  function ellipsoid(material: THREE.Material, scale: number[], position: number[]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    craft.add(mesh);
    return mesh;
  }
  function box(
    material: THREE.Material,
    size: number[],
    position: number[],
    parent: THREE.Group = craft,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(a: number[], b: number[], radius: number, material: THREE.Material) {
    const start = new THREE.Vector3(a[0], a[1], a[2]),
      end = new THREE.Vector3(b[0], b[1], b[2]);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 10),
      material,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    mesh.castShadow = true;
    craft.add(mesh);
  }
  function blurTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 124);
    gradient.addColorStop(0, 'rgba(205,220,198,0.01)');
    gradient.addColorStop(0.52, 'rgba(193,207,185,0.04)');
    gradient.addColorStop(0.78, 'rgba(158,174,151,0.24)');
    gradient.addColorStop(0.96, 'rgba(143,160,138,0.08)');
    gradient.addColorStop(1, 'rgba(145,164,145,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    context.save();
    context.translate(128, 128);
    context.strokeStyle = 'rgba(151,169,144,0.11)';
    context.lineWidth = 8;
    context.shadowColor = 'rgba(179,194,167,0.55)';
    context.shadowBlur = 10;
    for (let i = 0; i < 12; i++) {
      context.rotate(Math.PI / 6);
      context.beginPath();
      context.moveTo(26, 0);
      context.lineTo(120, 0);
      context.stroke();
    }
    context.restore();
    context.beginPath();
    context.arc(128, 128, 121, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(153,175,145,0.26)';
    context.lineWidth = 2;
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  ellipsoid(shell, [1.08, 0.95, 2.1], [0, 0, 0]);
  ellipsoid(glass, [0.98, 0.79, 1.18], [0, 0.15, -1.2]);
  ellipsoid(dark, [0.65, 0.4, 1.5], [0, 0.9, 0.4]);
  ellipsoid(dark, [0.52, 0.36, 0.8], [-0.54, 0.74, 0.5]);
  ellipsoid(dark, [0.52, 0.36, 0.8], [0.54, 0.74, 0.5]);
  tube([0, 0.1, 1.4], [0, 0.6, 6.1], 0.22, shell);
  tube([0, 0.25, 3], [0, 0.52, 5.8], 0.12, dark);
  const fin = box(lime, [0.14, 1.75, 0.9], [0, 1.1, 5.6]);
  fin.rotation.x = 0.25;
  box(dark, [2.4, 0.12, 0.6], [0, 0.5, 4.5]);
  for (const side of [-1, 1]) box(lime, [0.1, 0.48, 0.4], [side * 1.18, 0.65, 4.5]);
  box(lime, [0.1, 0.12, 2.1], [-1.03, -0.07, 0.3]);
  box(lime, [0.1, 0.12, 2.1], [1.03, -0.07, 0.3]);
  tube([0, 0.84, 0], [0, 1.82, 0], 0.1, dark);
  const mastFairing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.42, 12), shell);
  mastFairing.position.y = 1.44;
  craft.add(mastFairing);
  const swashplate = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 24), dark);
  swashplate.position.y = 1.67;
  craft.add(swashplate);
  const swashRing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.07, 24), lime);
  swashRing.position.y = 1.74;
  craft.add(swashRing);
  for (const side of [-1, 1]) {
    tube([side * 0.65, -0.58, -0.6], [side * 1.3, -1.22, -0.7], 0.055, dark);
    tube([side * 0.65, -0.58, 0.95], [side * 1.3, -1.22, 1.05], 0.055, dark);
    tube([side * 1.3, -1.22, -1.8], [side * 1.3, -1.22, 1.8], 0.075, rubber);
    tube([side * 1.3, -1.22, -1.8], [side * 1.3, -0.94, -2.1], 0.075, rubber);
    box(rubber, [0.48, 0.06, 0.42], [side * 1.3, -1.17, -1.25]);
    box(rubber, [0.48, 0.06, 0.42], [side * 1.3, -1.17, 1.2]);
    tube([side * 0.09, 0.2, -2.25], [side * 0.1, 0.79, -1.51], 0.025, shell);
    tube([side * 0.93, 0.08, -0.5], [side * 0.84, 0.77, -0.46], 0.025, shell);
    box(dark, [0.08, 0.05, 0.31], [side * 1.05, 0.1, 0.54]);
    ellipsoid(dark, [0.19, 0.2, 0.28], [side * 0.52, 0.89, 1.7]);
    tube([side * 0.52, 1.14, -0.45], [side * 0.66, 1.2, 0.12], 0.12, dark);
  }
  for (const side of [-1, 1]) {
    tube([side * 0.7, 0.66, -1.65], [side * 0.7, 1.03, -1.75], 0.025, dark);
    tube([side * 1.08, 0.04, -2.12], [side * 1.35, 0.05, -2.9], 0.018, shell);
  }
  tube([0.18, 0.95, 0.3], [0.18, 1.3, 0.48], 0.018, dark);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.84, 0);
  craft.add(rotor);
  const coningBlades: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    const coning = new THREE.Group();
    coning.position.y = 0;
    coningBlades.push(coning);
    const blade = box(dark, [0.26, 0.045, 4.25], [0, 0, -2.05], coning);
    coning.add(blade);
    rotor.add(arm);
    arm.add(coning);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.34), lime);
    tip.position.set(0, 0, -4.0);
    coning.add(tip);
  }
  const diskMaterial = new THREE.MeshBasicMaterial({
    map: blurTexture(),
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disk = new THREE.Mesh(new THREE.CircleGeometry(4.22, 72), diskMaterial);
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 1.86;
  craft.add(disk);
  const tailDisk = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 40),
    new THREE.MeshBasicMaterial({
      map: diskMaterial.map,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  tailDisk.rotation.y = Math.PI / 2;
  tailDisk.position.set(0.28, 0.78, 5.62);
  craft.add(tailDisk);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.28, 0.78, 5.62);
  craft.add(tailRotor);
  for (let i = 0; i < 2; i++) {
    const blade = box(dark, [0.07, 1.5, 0.14], [0, 0, 0], tailRotor);
    blade.rotation.x = (i * Math.PI) / 2;
  }
  const lamps: THREE.Mesh[] = [];
  for (const [x, color] of [
    [-1.07, 0xff6959],
    [1.07, 0xb7ffd1],
  ]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    lamp.position.set(x, 0.02, 0.6);
    craft.add(lamp);
    lamps.push(lamp);
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8d62 }),
  );
  beacon.position.set(0, 1.15, 0.9);
  craft.add(beacon);
  const landingLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe9b5,
      emissive: 0xffbd63,
      emissiveIntensity: 1.8,
      roughness: 0.24,
    }),
  );
  landingLight.position.set(0, -0.15, -1.95);
  craft.add(landingLight);
  return {
    craft,
    update(dt: number, telemetry: AircraftTelemetry) {
      rotor.rotation.y += dt * telemetry.rpm * 18;
      tailRotor.rotation.x += dt * telemetry.rpm * 30;
      const coningAngle = 0.02 + 0.045 * telemetry.collective;
      coningBlades.forEach((blade) => (blade.rotation.x = coningAngle));
      rotor.rotation.x = THREE.MathUtils.clamp(-telemetry.pitchRate * 0.045, -0.06, 0.06);
      rotor.rotation.z = THREE.MathUtils.clamp(telemetry.bankRate * 0.045, -0.06, 0.06);
      beacon.visible = Math.sin(performance.now() * 0.004) > 0.6;
      diskMaterial.opacity = 0.04 + THREE.MathUtils.clamp(telemetry.rpm, 0, 1.1) * 0.1;
      (tailDisk.material as THREE.MeshBasicMaterial).opacity = diskMaterial.opacity * 0.8;
    },
  };
}
