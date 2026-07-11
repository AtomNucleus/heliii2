import * as THREE from 'three';

/**
 * Fruzer Polygon ships as Chicken Gun–style packed atlases: color swatches,
 * decals, and UI icons share one sheet. Materials sample TEXCOORD_0.
 *
 * Many primitives correctly pin every vertex to one swatch (flat look).
 * Others stretch UVs across large atlas regions — that paints icons, flags,
 * and unrelated tiles across buildings (the "scrambled mess").
 *
 * Strategy:
 * - Small / flat UV spans → keep nearest-filter atlas sampling (crisp swatches)
 * - Large UV spans on packed atlases → bake a solid color from the dominant UV
 * - Water keeps its intentional unwrap; fences keep alpha-tested solids
 */

/** UV spans above this scramble packed atlas content across a mesh */
export const ATLAS_UV_SPAN_LIMIT = 0.14;

export interface UvSpanInfo {
  spanU: number;
  spanV: number;
  midU: number;
  midV: number;
  /** True when the primitive is a single atlas texel / tiny swatch */
  isSwatch: boolean;
  /** True when UVs would stretch scrambled atlas content */
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
  let sumU = 0;
  let sumV = 0;

  for (let i = 0; i < attr.count; i++) {
    const u = attr.getX(i);
    const v = attr.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    sumU += u;
    sumV += v;
  }

  const spanU = Math.max(0, maxU - minU);
  const spanV = Math.max(0, maxV - minV);
  const maxSpan = Math.max(spanU, spanV);
  return {
    spanU,
    spanV,
    midU: sumU / attr.count,
    midV: sumV / attr.count,
    isSwatch: maxSpan < 0.05,
    isScrambled: maxSpan > ATLAS_UV_SPAN_LIMIT,
  };
}

/** Sample an atlas texel in UV space (glTF: V+ down, flipY usually false). */
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
  // glTF / Three GLTFLoader: flipY=false → V=0 is top of image
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

  // Browser decode path — draw one pixel through a tiny canvas
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

function prepareAtlasTexture(map: THREE.Texture) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.channel = 0;
  // Palette swatches need nearest filtering — bilinear muddies them brown
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
}

export interface PreparedFruzerMaterial {
  material: THREE.MeshBasicMaterial;
  mode: 'swatch' | 'baked' | 'water';
}

/**
 * Convert a Sketchfab PBR material into a flat unlit material that will not
 * scramble packed atlas content across the mesh.
 */
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

  // Water keeps its unwrap — small intentional sheet, not a packed icon atlas
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

  // Large UV span on a packed atlas → bake the dominant swatch color
  if (map && uv?.isScrambled) {
    const baked = sampleAtlasColor(map, uv.midU, uv.midV).multiply(baseColor);
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

/** Apply Fruzer material prep across a loaded map root; returns mesh count stats. */
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
