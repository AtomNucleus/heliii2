import * as THREE from 'three';
import { COLORS } from '../scene/setup';

/** Shared PBR kit for Attack Chopper meshes + procedural accents. */
export interface HeliMaterialKit {
  body: THREE.MeshStandardMaterial;
  rotor: THREE.MeshStandardMaterial;
  weapon: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  interior: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  exhaust: THREE.MeshStandardMaterial;
  navRed: THREE.MeshStandardMaterial;
  navGreen: THREE.MeshStandardMaterial;
  navWhite: THREE.MeshStandardMaterial;
  damageScar: THREE.MeshStandardMaterial;
  rotorBlur: THREE.MeshBasicMaterial;
  all: THREE.Material[];
}

function canvasNoise(size = 64, tint = '#2a6b55'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 36) | 0;
    img.data[i] = Math.min(255, img.data[i] + n - 12);
    img.data[i + 1] = Math.min(255, img.data[i + 1] + n - 8);
    img.data[i + 2] = Math.min(255, img.data[i + 2] + n - 16);
  }
  ctx.putImageData(img, 0, 0);
  // Panel lines
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  for (let y = 8; y < size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 10; x < size; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  // Rivet dots
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 4; y < size; y += 16) {
    for (let x = 4; x < size; x += 20) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function roughnessMap(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 140 + ((Math.random() * 80) | 0);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

/** Cheap procedural normal from luminance noise (tangent-ish). */
function normalMap(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xr = h[y * size + ((x + 1) % size)];
      const xl = h[y * size + ((x - 1 + size) % size)];
      const yu = h[((y + 1) % size) * size + x];
      const yd = h[((y - 1 + size) % size) * size + x];
      const dx = (xl - xr) * 2;
      const dy = (yd - yu) * 2;
      const dz = 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      const o = i * 4;
      img.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((dz / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  // Carve panel grooves into normal
  for (let y = 8; y < size; y += 16) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      img.data[o + 1] = Math.max(0, img.data[o + 1] - 40);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build procedural PBR materials (no external assets / runtime services).
 */
export function createHeliMaterialKit(): HeliMaterialKit {
  const albedo = canvasNoise(96, '#2f8f6c');
  const rough = roughnessMap(64);
  const normal = normalMap(64);

  const body = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo,
    roughnessMap: rough,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.4,
    metalness: 0.4,
    envMapIntensity: 1.2,
  });

  const rotor = new THREE.MeshStandardMaterial({
    color: 0x1a2226,
    roughness: 0.5,
    metalness: 0.68,
    envMapIntensity: 0.95,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.25, 0.25),
  });

  const weapon = new THREE.MeshStandardMaterial({
    color: 0x3a4548,
    roughness: 0.32,
    metalness: 0.78,
    envMapIntensity: 1.25,
  });

  const canopy = new THREE.MeshPhysicalMaterial({
    color: 0x5eb8d8,
    roughness: 0.06,
    metalness: 0.12,
    transmission: 0.62,
    thickness: 0.4,
    transparent: true,
    opacity: 0.68,
    envMapIntensity: 1.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });

  const interior = new THREE.MeshStandardMaterial({
    color: 0x12181c,
    roughness: 0.72,
    metalness: 0.18,
    emissive: new THREE.Color(0x1a4038),
    emissiveIntensity: 0.45,
  });

  const metalDark = new THREE.MeshStandardMaterial({
    color: 0x1a2226,
    roughness: 0.46,
    metalness: 0.72,
    envMapIntensity: 1.05,
  });

  const accent = new THREE.MeshStandardMaterial({
    color: COLORS.orangeSun,
    roughness: 0.38,
    metalness: 0.38,
    emissive: COLORS.orangeHot,
    emissiveIntensity: 0.38,
  });

  const exhaust = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.52,
    metalness: 0.58,
    emissive: COLORS.orangeHot,
    emissiveIntensity: 0.9,
  });

  const navRed = new THREE.MeshStandardMaterial({
    color: 0xff2244,
    emissive: 0xff1030,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    metalness: 0.2,
  });
  const navGreen = new THREE.MeshStandardMaterial({
    color: 0x22ff66,
    emissive: 0x18ff55,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    metalness: 0.2,
  });
  const navWhite = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.15,
  });

  const damageScar = new THREE.MeshStandardMaterial({
    color: 0x2a1810,
    roughness: 0.88,
    metalness: 0.12,
    emissive: COLORS.orangeHot,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const rotorBlur = new THREE.MeshBasicMaterial({
    color: 0xb8e0d4,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const all: THREE.Material[] = [
    body,
    rotor,
    weapon,
    canopy,
    interior,
    metalDark,
    accent,
    exhaust,
    navRed,
    navGreen,
    navWhite,
    damageScar,
    rotorBlur,
  ];

  return {
    body,
    rotor,
    weapon,
    canopy,
    interior,
    metalDark,
    accent,
    exhaust,
    navRed,
    navGreen,
    navWhite,
    damageScar,
    rotorBlur,
    all,
  };
}

function classifyMesh(name: string): 'body' | 'rotor' | 'weapon' | 'other' {
  const n = name.toLowerCase();
  if (n.includes('missile') || n.includes('weapon') || n.includes('rocket')) return 'weapon';
  if (n.includes('propeller') || n.includes('rotor') || n.includes('blade')) return 'rotor';
  if (n.includes('body') || n.includes('helicopter') || n.includes('heli')) return 'body';
  return 'other';
}

/**
 * Retune GLB MeshStandardMaterials in-place (legacy path).
 */
export function upgradeLoadedMaterials(root: THREE.Object3D, kit: HeliMaterialKit) {
  const shared = new Map<
    THREE.Material,
    {
      body: THREE.MeshStandardMaterial;
      rotor: THREE.MeshStandardMaterial;
      weapon: THREE.MeshStandardMaterial;
      other: THREE.MeshStandardMaterial;
    }
  >();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const kind = classifyMesh(mesh.name);
    const src = mesh.material;
    const list = Array.isArray(src) ? src : [src];
    const upgraded: THREE.Material[] = [];

    for (const mat of list) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) {
        upgraded.push(mat);
        continue;
      }

      let variants = shared.get(mat);
      if (!variants) {
        const base = mat.clone();
        if (!base.map) {
          base.map = kit.body.map;
          base.color.set(0xffffff);
        }
        if (!base.roughnessMap) base.roughnessMap = kit.body.roughnessMap;
        if (!base.normalMap && kit.body.normalMap) {
          base.normalMap = kit.body.normalMap;
          base.normalScale = kit.body.normalScale.clone();
        }

        const body = base.clone();
        body.metalness = THREE.MathUtils.clamp(body.metalness || 0.32, 0.28, 0.48);
        body.roughness = THREE.MathUtils.clamp(body.roughness || 0.45, 0.35, 0.55);
        body.envMapIntensity = 1.2;
        body.emissive.setHex(0x0a1814);
        body.emissiveIntensity = 0.08;
        body.userData.heliKind = 'body';
        body.userData.baseEmissiveIntensity = body.emissiveIntensity;
        body.needsUpdate = true;

        const rotor = base.clone();
        rotor.color.multiplyScalar(0.35);
        rotor.metalness = 0.65;
        rotor.roughness = 0.48;
        rotor.envMapIntensity = 0.95;
        rotor.userData.heliKind = 'rotor';
        rotor.userData.baseEmissiveIntensity = rotor.emissiveIntensity;
        rotor.needsUpdate = true;

        const weapon = base.clone();
        weapon.color.multiplyScalar(0.55);
        weapon.metalness = 0.75;
        weapon.roughness = 0.32;
        weapon.envMapIntensity = 1.25;
        weapon.emissive.setHex(COLORS.orangeHot);
        weapon.emissiveIntensity = 0.12;
        weapon.userData.heliKind = 'weapon';
        weapon.userData.baseEmissiveIntensity = weapon.emissiveIntensity;
        weapon.needsUpdate = true;

        const other = base.clone();
        other.metalness = Math.max(other.metalness, 0.3);
        other.roughness = Math.min(other.roughness, 0.55);
        other.envMapIntensity = 1.05;
        other.userData.heliKind = 'other';
        other.userData.baseEmissiveIntensity = other.emissiveIntensity;
        other.needsUpdate = true;

        variants = { body, rotor, weapon, other };
        shared.set(mat, variants);
      }

      upgraded.push(variants[kind === 'other' ? 'other' : kind]);
    }

    mesh.material = Array.isArray(src) ? upgraded : upgraded[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/** Tag procedural kit materials for runtime damage / boost response. */
export function tagKitMaterials(kit: HeliMaterialKit) {
  kit.body.userData.heliKind = 'body';
  kit.body.userData.baseEmissiveIntensity = kit.body.emissiveIntensity;
  kit.rotor.userData.heliKind = 'rotor';
  kit.rotor.userData.baseEmissiveIntensity = kit.rotor.emissiveIntensity;
  kit.weapon.userData.heliKind = 'weapon';
  kit.weapon.userData.baseEmissiveIntensity = 0.12;
  kit.accent.userData.heliKind = 'body';
  kit.accent.userData.baseEmissiveIntensity = kit.accent.emissiveIntensity;
}
