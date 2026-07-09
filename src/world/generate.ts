import * as THREE from 'three';
import { COLORS } from '../scene/setup';

export interface WorldObjects {
  group: THREE.Group;
  water: THREE.Mesh;
  landingPad: THREE.Group;
  spawnPosition: THREE.Vector3;
  /** Sample approximate ground height at xz (for soft collision) */
  getGroundHeight: (x: number, z: number) => number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Simple multi-octave height for islands / hills */
function terrainHeight(x: number, z: number): number {
  const n1 = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 4;
  const n2 = Math.sin(x * 0.08 + 1.2) * Math.cos(z * 0.07) * 1.8;
  const n3 = Math.sin(x * 0.15) * Math.sin(z * 0.12) * 0.6;
  // Island mounds
  const islands = [
    { cx: 0, cz: 0, r: 28, h: 5 },
    { cx: 45, cz: -30, r: 22, h: 7 },
    { cx: -50, cz: 20, r: 20, h: 6 },
    { cx: 30, cz: 50, r: 18, h: 5.5 },
    { cx: -35, cz: -45, r: 24, h: 8 },
    { cx: 70, cz: 15, r: 16, h: 4.5 },
    { cx: -20, cz: 65, r: 15, h: 4 },
  ];
  let islandH = 0;
  for (const isl of islands) {
    const dx = x - isl.cx;
    const dz = z - isl.cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < isl.r) {
      const t = 1 - d / isl.r;
      islandH = Math.max(islandH, isl.h * t * t * (3 - 2 * t));
    }
  }
  const base = islandH + n1 + n2 + n3;
  return Math.max(0, base);
}

function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      midColor: { value: new THREE.Color(0x5a3a50) },
      horizonColor: { value: new THREE.Color(COLORS.skyHorizon) },
      bottomColor: { value: new THREE.Color(COLORS.tealDeep) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col;
        if (h > 0.15) {
          float t = clamp((h - 0.15) / 0.85, 0.0, 1.0);
          col = mix(midColor, topColor, t);
        } else if (h > -0.05) {
          float t = clamp((h + 0.05) / 0.2, 0.0, 1.0);
          col = mix(horizonColor, midColor, t);
        } else {
          float t = clamp((h + 0.4) / 0.35, 0.0, 1.0);
          col = mix(bottomColor, horizonColor, t);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

function createSun(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(90, 38, -70);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 16),
    new THREE.MeshBasicMaterial({ color: COLORS.orangeSun }),
  );
  group.add(sun);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(18, 16, 16),
    new THREE.MeshBasicMaterial({
      color: COLORS.orangeGlow,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  group.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(28, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffaa66,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  group.add(halo);

  return group;
}

function createTerrain(): THREE.Mesh {
  const size = 220;
  const segments = 80;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors: number[] = [];
  const cGrass = new THREE.Color(COLORS.grass);
  const cDark = new THREE.Color(COLORS.grassDark);
  const cSand = new THREE.Color(COLORS.sand);
  const cRock = new THREE.Color(COLORS.rock);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = terrainHeight(x, z);
    // Flatten start pad area
    if (Math.hypot(x, z) < 8) {
      y = Math.max(y, 2.2);
      y = THREE.MathUtils.lerp(y, 2.4, 1 - Math.hypot(x, z) / 8);
    }
    pos.setY(i, y);

    const color = new THREE.Color();
    if (y < 0.8) {
      color.copy(cSand);
    } else if (y < 2.5) {
      color.lerpColors(cSand, cGrass, (y - 0.8) / 1.7);
    } else if (y < 6) {
      color.lerpColors(cGrass, cDark, (y - 2.5) / 3.5);
    } else {
      color.lerpColors(cDark, cRock, Math.min(1, (y - 6) / 4));
    }
    // Teal shadow tint on north-facing slopes (approx by noise)
    color.lerp(new THREE.Color(COLORS.tealShadow), 0.12);
    colors.push(color.r, color.g, color.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function createWater(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(280, 280, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.water,
    roughness: 0.15,
    metalness: 0.65,
    transparent: true,
    opacity: 0.72,
    flatShading: true,
  });
  const water = new THREE.Mesh(geo, mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.15;
  water.receiveShadow = true;
  water.name = 'water';

  // Shoreline highlight ring (subtle)
  return water;
}

function createShoreHighlights(parent: THREE.Group) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7ec8c8,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const islands = [
    { cx: 0, cz: 0, r: 28 },
    { cx: 45, cz: -30, r: 22 },
    { cx: -50, cz: 20, r: 20 },
    { cx: 30, cz: 50, r: 18 },
    { cx: -35, cz: -45, r: 24 },
    { cx: 70, cz: 15, r: 16 },
    { cx: -20, cz: 65, r: 15 },
  ];
  for (const isl of islands) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(isl.r * 0.92, isl.r * 1.05, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(isl.cx, 0.2, isl.cz);
    parent.add(ring);
  }
}

function createPineTree(rng: () => number): THREE.Group {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x4a3020, flatShading: true, roughness: 0.9 }),
  );
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  tree.add(trunk);

  const pineMat = new THREE.MeshStandardMaterial({
    color: COLORS.pine,
    flatShading: true,
    roughness: 0.85,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: COLORS.pineDark,
    flatShading: true,
    roughness: 0.85,
  });

  const layers = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 1.1 - i * 0.25;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.4, 6), i % 2 === 0 ? pineMat : darkMat);
    cone.position.y = 1.2 + i * 0.7;
    cone.castShadow = true;
    tree.add(cone);
  }
  return tree;
}

function createRock(rng: () => number): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(0.4 + rng() * 0.6, 0);
  // Squash randomly
  geo.scale(1 + rng() * 0.5, 0.5 + rng() * 0.6, 1 + rng() * 0.4);
  const mat = new THREE.MeshStandardMaterial({
    color: rng() > 0.5 ? COLORS.rock : COLORS.rockDark,
    flatShading: true,
    roughness: 0.95,
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function createMountains(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.tealShadow,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const mat2 = new THREE.MeshStandardMaterial({
    color: 0x1a3540,
    flatShading: true,
    roughness: 1,
  });

  const peaks = [
    { x: -90, z: -80, s: 28, h: 45 },
    { x: -110, z: -20, s: 22, h: 38 },
    { x: 100, z: -90, s: 32, h: 50 },
    { x: 120, z: 10, s: 24, h: 40 },
    { x: -80, z: 100, s: 26, h: 42 },
    { x: 60, z: 110, s: 30, h: 48 },
    { x: 0, z: -120, s: 35, h: 55 },
    { x: -130, z: 50, s: 20, h: 35 },
  ];

  peaks.forEach((p, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(p.s, p.h, 5), i % 2 === 0 ? mat : mat2);
    cone.position.set(p.x, p.h * 0.35, p.z);
    cone.castShadow = true;
    group.add(cone);
  });

  return group;
}

function createLandingPad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = 'landingPad';
  pad.position.set(0, 2.45, 0);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.2, 0.25, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.pad,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.2,
    }),
  );
  base.receiveShadow = true;
  pad.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.5, 4.2, 32),
    new THREE.MeshStandardMaterial({
      color: COLORS.padMark,
      emissive: COLORS.neonGreen,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  pad.add(ring);

  // H marking
  const hMat = new THREE.MeshStandardMaterial({
    color: COLORS.padMark,
    emissive: COLORS.neonGreen,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const hLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 2.2), hMat);
  hLeft.position.set(-0.7, 0.15, 0);
  const hRight = hLeft.clone();
  hRight.position.x = 0.7;
  const hMid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.35), hMat);
  hMid.position.set(0, 0.15, 0);
  pad.add(hLeft, hRight, hMid);

  // Corner lights
  const lightMat = new THREE.MeshStandardMaterial({
    color: COLORS.orangeSun,
    emissive: COLORS.orangeSun,
    emissiveIntensity: 1.2,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), lightMat);
    light.position.set(Math.cos(a) * 4.6, 0.2, Math.sin(a) * 4.6);
    pad.add(light);
  }

  return pad;
}

function scatterProps(parent: THREE.Group, getHeight: (x: number, z: number) => number) {
  const rng = seededRandom(42);

  // Trees
  for (let i = 0; i < 180; i++) {
    const x = (rng() - 0.5) * 180;
    const z = (rng() - 0.5) * 180;
    const y = getHeight(x, z);
    if (y < 1.2 || y > 7.5) continue;
    if (Math.hypot(x, z) < 10) continue; // keep pad clear
    const tree = createPineTree(rng);
    const scale = 0.7 + rng() * 0.9;
    tree.scale.setScalar(scale);
    tree.position.set(x, y, z);
    tree.rotation.y = rng() * Math.PI * 2;
    parent.add(tree);
  }

  // Rocks
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * 160;
    const z = (rng() - 0.5) * 160;
    const y = getHeight(x, z);
    if (y < 0.5) continue;
    if (Math.hypot(x, z) < 8) continue;
    const rock = createRock(rng);
    rock.position.set(x, y + 0.15, z);
    rock.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
    parent.add(rock);
  }
}

export function generateWorld(scene: THREE.Scene): WorldObjects {
  const group = new THREE.Group();
  group.name = 'world';

  const sky = createSkyDome();
  scene.add(sky);
  scene.add(createSun());

  const terrain = createTerrain();
  group.add(terrain);

  const water = createWater();
  group.add(water);
  createShoreHighlights(group);

  group.add(createMountains());

  const landingPad = createLandingPad();
  group.add(landingPad);

  const getGroundHeight = (x: number, z: number) => terrainHeight(x, z);

  scatterProps(group, getGroundHeight);

  scene.add(group);

  return {
    group,
    water,
    landingPad,
    spawnPosition: new THREE.Vector3(0, 4.5, 0),
    getGroundHeight,
  };
}

/** Subtle water shimmer via material opacity / color pulse */
export function updateWater(water: THREE.Mesh, time: number) {
  const mat = water.material as THREE.MeshStandardMaterial;
  mat.opacity = 0.68 + Math.sin(time * 0.8) * 0.04;
  water.position.y = 0.12 + Math.sin(time * 0.5) * 0.04;
}
