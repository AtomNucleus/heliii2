import * as THREE from 'three';

/**
 * Fruzer Polygon (Chicken Gun export) packs color swatches, decals, and UI
 * icons into shared atlases. Legitimate buildings pin every UV to one tiny
 * swatch. Broken primitives stretch TEXCOORD_0 across large atlas regions,
 * painting icons/flags across walls — the visual "scrambled mess".
 *
 * Repair:
 *  - Tiny UV spans → keep atlas + nearest filtering (crisp flat colors)
 *  - Large UV spans → bake a solid color sampled at the UV bounding-box center
 *  - Water keeps its intentional unwrap; fences keep alpha-tested solids
 */

/** UV span above this stretches packed atlas content across a mesh */
export const ATLAS_UV_SPAN_LIMIT = 0.14;

export interface UvSpanInfo {
  spanU: number;
  spanV: number;
  /** Bounding-box center (more stable than vertex-mean on irregular meshes) */
  centerU: number;
  centerV: number;
  isSwatch: boolean;
  isScrambled: boolean;
}

export function measureUvSpan(
  geometry: THREE.BufferGeometry,
  attributeName: 'uv' | 'uv1' = 'uv',
): UvSpanInfo | null {
  const attr = geometry.getAttribute(attributeName) as THREE.BufferAttribute | undefined;
  if (!attr || attr.count < 1) return null;

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < attr.count; i++) {
    const u = attr.getX(i);
    const v = attr.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const spanU = Math.max(0, maxU - minU);
  const spanV = Math.max(0, maxV - minV);
  const maxSpan = Math.max(spanU, spanV);

  return {
    spanU,
    spanV,
    centerU: (minU + maxU) * 0.5,
    centerV: (minV + maxV) * 0.5,
    isSwatch: maxSpan < 0.05,
    isScrambled: maxSpan > ATLAS_UV_SPAN_LIMIT,
  };
}

/** Sample an atlas texel in UV space (glTF: flipY usually false → V=0 at top). */
export function sampleAtlasColor(
  texture: THREE.Texture,
  u: number,
  v: number,
  target = new THREE.Color(),
): THREE.Color {
  const image = texture.image as
    | { width: number; height: number; data?: ArrayLike<number> }
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;

  if (!image || !('width' in image) || !image.width || !image.height) {
    return target.setRGB(1, 1, 1);
  }

  const width = image.width;
  const height = image.height;
  const wrap = (t: number) => {
    const f = t - Math.floor(t);
    return f < 0 ? f + 1 : f;
  };
  const uu = wrap(u);
  const vv = wrap(v);
  const x = Math.min(width - 1, Math.max(0, Math.floor(uu * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(vv * height)));

  if ('data' in image && image.data && (image as { data: ArrayLike<number> }).data.length) {
    const data = (image as { data: ArrayLike<number> }).data;
    const channels = Math.max(1, Math.floor(data.length / (width * height)));
    const idx = (y * width + x) * channels;
    const r = (data[idx] ?? 255) / 255;
    const g = (data[idx + Math.min(1, channels - 1)] ?? r) / 255;
    const b = (data[idx + Math.min(2, channels - 1)] ?? r) / 255;
    return target.setRGB(r, g, b);
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return target.setRGB(1, 1, 1);
    ctx.drawImage(image as CanvasImageSource, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return target.setRGB(r / 255, g / 255, b / 255);
  } catch {
    return target.setRGB(1, 1, 1);
  }
}

/**
 * Sample UV bbox center plus inset corners; pick the median RGB channel-wise.
 * Avoids baking a single outlier texel when the stretch covers mixed icons.
 */
export function sampleDominantAtlasColor(
  texture: THREE.Texture,
  uv: UvSpanInfo,
  target = new THREE.Color(),
): THREE.Color {
  const insetU = uv.spanU * 0.2;
  const insetV = uv.spanV * 0.2;
  const minU = uv.centerU - uv.spanU * 0.5 + insetU;
  const maxU = uv.centerU + uv.spanU * 0.5 - insetU;
  const minV = uv.centerV - uv.spanV * 0.5 + insetV;
  const maxV = uv.centerV + uv.spanV * 0.5 - insetV;

  const samples = [
    sampleAtlasColor(texture, uv.centerU, uv.centerV),
    sampleAtlasColor(texture, minU, minV),
    sampleAtlasColor(texture, maxU, minV),
    sampleAtlasColor(texture, minU, maxV),
    sampleAtlasColor(texture, maxU, maxV),
  ];

  const rs = samples.map((c) => c.r).sort((a, b) => a - b);
  const gs = samples.map((c) => c.g).sort((a, b) => a - b);
  const bs = samples.map((c) => c.b).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return target.setRGB(rs[mid], gs[mid], bs[mid]);
}

function prepareAtlasTexture(map: THREE.Texture) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.channel = 0;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
}

export type FruzerMaterialMode = 'swatch' | 'baked' | 'water';

export interface PreparedFruzerMaterial {
  material: THREE.MeshBasicMaterial;
  mode: FruzerMaterialMode;
}

/** Convert Sketchfab PBR into unlit material that will not scramble atlases. */
export function prepareFruzerMaterial(
  src: THREE.Material,
  geometry: THREE.BufferGeometry,
): PreparedFruzerMaterial {
  const std = src as THREE.MeshStandardMaterial;
  const name = std.name || '';
  const isFence = /fence/i.test(name);
  const isWater = /water/i.test(name);
  const map = std.map ?? null;
  const baseColor = std.color?.clone?.() ?? new THREE.Color(0xffffff);
  const uv = measureUvSpan(geometry, 'uv');

  if (map) prepareAtlasTexture(map);

  if (isWater && map && uv && !uv.isSwatch) {
    const basic = new THREE.MeshBasicMaterial({
      map,
      color: baseColor,
      transparent: true,
      opacity: Math.min(std.opacity ?? 1, 0.85),
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    basic.name = name;
    src.dispose?.();
    return { material: basic, mode: 'water' };
  }

  if (map && uv?.isScrambled) {
    const baked = sampleDominantAtlasColor(map, uv).multiply(baseColor);
    const basic = new THREE.MeshBasicMaterial({
      color: baked,
      transparent: std.transparent || isFence,
      opacity: std.opacity ?? 1,
      alphaTest: std.alphaTest > 0 ? std.alphaTest : isFence ? 0.5 : 0,
      side: isFence ? THREE.DoubleSide : (std.side ?? THREE.FrontSide),
      depthWrite: std.depthWrite !== false,
    });
    basic.name = name;
    src.dispose?.();
    return { material: basic, mode: 'baked' };
  }

  const basic = new THREE.MeshBasicMaterial({
    map: map ?? null,
    color: baseColor,
    transparent: std.transparent || isWater,
    opacity: std.opacity ?? 1,
    alphaTest: std.alphaTest > 0 ? std.alphaTest : isFence ? 0.5 : 0,
    side: isFence || isWater ? THREE.DoubleSide : (std.side ?? THREE.FrontSide),
    depthWrite: isWater ? false : std.depthWrite !== false,
  });
  basic.name = name;
  if (isWater) basic.opacity = Math.min(basic.opacity, 0.85);
  src.dispose?.();
  return { material: basic, mode: 'swatch' };
}

export function applyFruzerMaterials(root: THREE.Object3D): {
  meshes: number;
  baked: number;
  swatch: number;
  water: number;
} {
  let meshes = 0;
  let baked = 0;
  let swatch = 0;
  let water = 0;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    meshes++;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];
    for (const m of mats) {
      const prepared = prepareFruzerMaterial(m, mesh.geometry);
      next.push(prepared.material);
      if (prepared.mode === 'baked') baked++;
      else if (prepared.mode === 'water') water++;
      else swatch++;
    }
    mesh.material = next.length === 1 ? next[0] : next;
  });

  return { meshes, baked, swatch, water };
}
