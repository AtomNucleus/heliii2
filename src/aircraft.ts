import * as THREE from 'three';

export function makeAircraft() {
  const craft = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0xd7dfd2,
    roughness: 0.32,
    metalness: 0.62,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24343a, roughness: 0.37, metalness: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x244c60,
    roughness: 0.1,
    metalness: 0.55,
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
  box(lime, [0.1, 0.12, 2.1], [-1.03, -0.07, 0.3]);
  box(lime, [0.1, 0.12, 2.1], [1.03, -0.07, 0.3]);
  tube([0, 0.84, 0], [0, 1.82, 0], 0.1, dark);
  for (const side of [-1, 1]) {
    tube([side * 0.65, -0.58, -0.6], [side * 1.3, -1.22, -0.7], 0.055, dark);
    tube([side * 0.65, -0.58, 0.95], [side * 1.3, -1.22, 1.05], 0.055, dark);
    tube([side * 1.3, -1.22, -1.8], [side * 1.3, -1.22, 1.8], 0.075, rubber);
    tube([side * 1.3, -1.22, -1.8], [side * 1.3, -0.94, -2.1], 0.075, rubber);
    tube([side * 0.09, 0.2, -2.25], [side * 0.1, 0.79, -1.51], 0.025, shell);
    tube([side * 0.93, 0.08, -0.5], [side * 0.84, 0.77, -0.46], 0.025, shell);
    box(dark, [0.08, 0.05, 0.31], [side * 1.05, 0.1, 0.54]);
    ellipsoid(dark, [0.19, 0.2, 0.28], [side * 0.52, 0.89, 1.7]);
  }
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.84, 0);
  craft.add(rotor);
  for (let i = 0; i < 4; i++) {
    const blade = box(dark, [0.26, 0.045, 4.25], [0, 0, -2.05], new THREE.Group());
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    arm.add(blade);
    rotor.add(arm);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.34), lime);
    tip.position.set(0, 0, -4.0);
    arm.add(tip);
  }
  const diskMaterial = new THREE.MeshBasicMaterial({
    color: 0xbac8a9,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.5, 4.15, 72), diskMaterial);
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 1.86;
  craft.add(disk);
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
  return {
    craft,
    update(time: number, rpm: number) {
      rotor.rotation.y = time * rpm;
      tailRotor.rotation.x = time * rpm * 1.7;
      beacon.visible = Math.sin(time * 4) > 0.6;
      diskMaterial.opacity = rpm > 20 ? 0.09 : 0.02;
    },
  };
}
