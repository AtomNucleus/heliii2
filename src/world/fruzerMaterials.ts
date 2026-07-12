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
 *
 * Startup note: never sample atlases with one canvas per texel. Decode each
 * texture once into a CPU pixel buffer, then sample from cache while yielding
 * across the ~1k Fruzer primitives so mobile browsers stay responsive.
 */

/** UV span above this stretches packed atlas content across a mesh */
export const ATLAS_UV_SPAN_LIMIT = 0.14;

/** How many meshes to convert before yielding back to the browser */
export const FRUZER_MATERIAL_CHUNK = 64;

export interface UvSpanInfo {
  spanU: number;
  spanV: number;
  /** Bounding-box center (more stable than vertex-mean on irregular meshes) */
  centerU: number;
  centerV: number;
  isSwatch: boolean;
  isScrambled: boolean;
}

export interface AtlasPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
  channels: number;
}

export interface FruzerMaterialStats {
  meshes: number;
  baked: number;
  swatch: number;
  water: number;
  /** Distinct atlas textures decoded for CPU sampling */
  atlasesDecoded: number;
  /** Canvas elements created while decoding atlases (should stay tiny) */
  canvasAllocations: number;
}

export interface ApplyFruzerMaterialsOptions {
  /** Meshes per event-loop turn (default FRUZER_MATERIAL_CHUNK) */
  chunkSize?: number;
  yieldToMain?: () => Promise<void>;
  onChunk?: (done: number, total: number) => void;
}

const atlasPixelCache = new WeakMap<THREE.Texture, AtlasPixels | null>();

/** Test/diagnostics: how many canvases were created for atlas decode. */
let atlasCanvasAllocations = 0;

export function getAtlasCanvasAllocations(): number {
  return atlasCanvasAllocations;
}

export function resetAtlasPixelCacheForTests(): void {
  atlasCanvasAllocations = 0;
}

function defaultYieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

/** True when the texture image can be safely drawn/read on the CPU. */
export function isAtlasImageReady(image: unknown): boolean {
  if (!image || typeof image !== 'object') return false;
  const img = image as {
    width?: number;
    height?: number;
    data?: ArrayLike<number>;
    complete?: boolean;
  };
  if (!img.width || !img.height) return false;
  if (img.data && img.data.length > 0) return true;
  if ('complete' in img && img.complete === false) return false;
  return true;
}

/**
 * Decode a texture's image into a reusable CPU pixel buffer.
 * At most one canvas allocation per texture (not per sample).
 */
export function getAtlasPixels(texture: THREE.Texture): AtlasPixels | null {
  if (atlasPixelCache.has(texture)) {
    return atlasPixelCache.get(texture) ?? null;
  }

  const image = texture.image as
    | { width: number; height: number; data?: ArrayLike<number> }
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;

  if (!isAtlasImageReady(image)) {
    atlasPixelCache.set(texture, null);
    return null;
  }

  const width = image!.width;
  const height = image!.height;

  if ('data' in image! && image!.data && (image as { data: ArrayLike<number> }).data.length) {
    const data = (image as { data: ArrayLike<number> }).data;
    const channels = Math.max(1, Math.floor(data.length / (width * height)));
    const pixels: AtlasPixels = { width, height, data, channels };
    atlasPixelCache.set(texture, pixels);
    return pixels;
  }

  if (typeof document === 'undefined') {
    atlasPixelCache.set(texture, null);
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    atlasCanvasAllocations += 1;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      atlasPixelCache.set(texture, null);
      return null;
    }
    ctx.drawImage(image as CanvasImageSource, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    const pixels: AtlasPixels = { width, height, data, channels: 4 };
    atlasPixelCache.set(texture, pixels);
    // Drop canvas backing store promptly on engines that honor this.
    canvas.width = 0;
    canvas.height = 0;
    return pixels;
  } catch {
    atlasPixelCache.set(texture, null);
    return null;
  }
}

/** Wait until GLTF HTML images / bitmaps are CPU-readable. */
export async function ensureAtlasImageReady(
  texture: THREE.Texture,
  timeoutMs = 3_000,
): Promise<boolean> {
  const image = texture.image as
    | HTMLImageElement
    | ImageBitmap
    | { width?: number; height?: number; data?: ArrayLike<number>; decode?: () => Promise<void> }
    | undefined;

  if (!image) return false;
  if (isAtlasImageReady(image)) return true;

  const started = Date.now();

  if (typeof (image as HTMLImageElement).decode === 'function') {
    try {
      await Promise.race([
        (image as HTMLImageElement).decode(),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('atlas-decode-timeout')), timeoutMs);
        }),
      ]);
    } catch {
      // Fall through to readiness poll / failure.
    }
  }

  while (!isAtlasImageReady(image) && Date.now() - started < timeoutMs) {
    await defaultYieldToMain();
  }

  return isAtlasImageReady(image);
}

function samplePixels(
  pixels: AtlasPixels,
  u: number,
  v: number,
  target: THREE.Color,
): THREE.Color {
  const wrap = (t: number) => {
    const f = t - Math.floor(t);
    return f < 0 ? f + 1 : f;
  };
  const uu = wrap(u);
  const vv = wrap(v);
  const x = Math.min(pixels.width - 1, Math.max(0, Math.floor(uu * pixels.width)));
  const y = Math.min(pixels.height - 1, Math.max(0, Math.floor(vv * pixels.height)));
  const channels = pixels.channels;
  const idx = (y * pixels.width + x) * channels;
  const r = (pixels.data[idx] ?? 255) / 255;
  const g = (pixels.data[idx + Math.min(1, channels - 1)] ?? r) / 255;
  const b = (pixels.data[idx + Math.min(2, channels - 1)] ?? r) / 255;
  return target.setRGB(r, g, b);
}

/** Sample an atlas texel in UV space (glTF: flipY usually false → V=0 at top). */
export function sampleAtlasColor(
  texture: THREE.Texture,
  u: number,
  v: number,
  target = new THREE.Color(),
): THREE.Color {
  const pixels = getAtlasPixels(texture);
  if (!pixels) return target.setRGB(1, 1, 1);
  return samplePixels(pixels, u, v, target);
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
  return { material: basic, mode: 'swatch' };
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material) meshes.push(mesh);
  });
  return meshes;
}

function emptyStats(): FruzerMaterialStats {
  return {
    meshes: 0,
    baked: 0,
    swatch: 0,
    water: 0,
    atlasesDecoded: 0,
    canvasAllocations: 0,
  };
}

/**
 * Async Fruzer material repair: decode atlases once, convert meshes in chunks,
 * dispose shared source materials only after the pass finishes.
 */
export async function applyFruzerMaterials(
  root: THREE.Object3D,
  options: ApplyFruzerMaterialsOptions = {},
): Promise<FruzerMaterialStats> {
  const meshes = collectMeshes(root);
  const stats = emptyStats();
  stats.meshes = meshes.length;
  if (meshes.length === 0) return stats;

  const chunkSize = Math.max(1, options.chunkSize ?? FRUZER_MATERIAL_CHUNK);
  const yieldToMain = options.yieldToMain ?? defaultYieldToMain;
  const canvasBefore = atlasCanvasAllocations;

  const sourceMaterials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      sourceMaterials.add(m);
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
  }

  for (const tex of textures) {
    await ensureAtlasImageReady(tex);
    // Warm CPU cache once per atlas (HTMLImage/ImageBitmap → one canvas).
    if (getAtlasPixels(tex)) stats.atlasesDecoded += 1;
  }

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];
    for (const m of mats) {
      const prepared = prepareFruzerMaterial(m, mesh.geometry);
      next.push(prepared.material);
      if (prepared.mode === 'baked') stats.baked += 1;
      else if (prepared.mode === 'water') stats.water += 1;
      else stats.swatch += 1;
    }
    mesh.material = next.length === 1 ? next[0] : next;

    if ((i + 1) % chunkSize === 0 && i + 1 < meshes.length) {
      options.onChunk?.(i + 1, meshes.length);
      await yieldToMain();
    }
  }

  options.onChunk?.(meshes.length, meshes.length);

  for (const m of sourceMaterials) {
    try {
      m.dispose?.();
    } catch {
      // Already disposed or renderer-backed dispose — safe to ignore at boot.
    }
  }

  stats.canvasAllocations = atlasCanvasAllocations - canvasBefore;
  return stats;
}

/** Sync helper for unit tests / tiny scenes — prefer async apply in production. */
export function applyFruzerMaterialsSync(root: THREE.Object3D): FruzerMaterialStats {
  const meshes = collectMeshes(root);
  const stats = emptyStats();
  stats.meshes = meshes.length;
  const canvasBefore = atlasCanvasAllocations;
  const sourceMaterials = new Set<THREE.Material>();

  for (const mesh of meshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];
    for (const m of mats) {
      sourceMaterials.add(m);
      const prepared = prepareFruzerMaterial(m, mesh.geometry);
      next.push(prepared.material);
      if (prepared.mode === 'baked') stats.baked += 1;
      else if (prepared.mode === 'water') stats.water += 1;
      else stats.swatch += 1;
    }
    mesh.material = next.length === 1 ? next[0] : next;
  }

  for (const m of sourceMaterials) m.dispose?.();
  stats.canvasAllocations = atlasCanvasAllocations - canvasBefore;
  stats.atlasesDecoded = stats.canvasAllocations; // best-effort for sync path
  return stats;
}
