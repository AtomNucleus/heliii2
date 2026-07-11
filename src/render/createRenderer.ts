import * as THREE from 'three';
import {
  hasWebGPUEntry,
  resolveRendererPreference,
  shouldAttemptWebGPU,
  type RendererPreference,
} from './preference';
import { setActiveRendererBackend } from './runtime';
import type { GameRendererHandle, RendererInitInfo } from './types';

export interface CreateGameRendererOptions {
  canvas: HTMLCanvasElement;
  /** Override search string (defaults to `window.location.search`). */
  search?: string;
  /** Override storage reader (defaults to localStorage). */
  storageGet?: (key: string) => string | null;
  antialias?: boolean;
  powerPreference?: 'high-performance' | 'low-power' | 'default';
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: {
      powerPreference?: 'high-performance' | 'low-power';
    }) => Promise<{
      requestDevice: () => Promise<{ destroy?: () => void }>;
    } | null>;
  };
};

function readStorage(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function baseInfo(
  preference: RendererPreference,
  backend: RendererInitInfo['backend'],
  fellBack: boolean,
  reason: string,
): RendererInitInfo {
  return {
    backend,
    preference,
    fellBack,
    reason,
    revision: THREE.REVISION,
  };
}

function configureCommon(renderer: {
  setPixelRatio: (n: number) => void;
  setSize: (w: number, h: number) => void;
  toneMapping: number;
  toneMappingExposure: number;
  outputColorSpace: string;
  shadowMap: {
    enabled: boolean;
    type: number;
    autoUpdate?: boolean;
  };
}): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.48;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('autoUpdate' in renderer.shadowMap) {
    renderer.shadowMap.autoUpdate = true;
  }
}

/**
 * Probe WebGPU without binding the game canvas. Avoids leaving a GPU/WebGL
 * context on the display canvas when we later need classic WebGLRenderer.
 */
async function probeWebGPU(
  powerPreference: 'high-performance' | 'low-power' | 'default',
): Promise<boolean> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (!hasWebGPUEntry(gpu) || !gpu) return false;
  try {
    const adapter = await gpu.requestAdapter(
      powerPreference === 'default' ? undefined : { powerPreference },
    );
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    device.destroy?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * If a prior WebGPU attempt bound a context to the canvas, classic WebGL
 * construction can fail. Replace the element with a fresh canvas clone.
 */
function replaceCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const next = canvas.cloneNode(false) as HTMLCanvasElement;
  next.id = canvas.id;
  next.className = canvas.className;
  for (const { name, value } of Array.from(canvas.attributes)) {
    if (name === 'id' || name === 'class') continue;
    next.setAttribute(name, value);
  }
  canvas.parentNode?.replaceChild(next, canvas);
  return next;
}

function createWebGLHandle(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
  fellBack: boolean,
  reason: string,
  antialias: boolean,
  powerPreference: 'high-performance' | 'low-power' | 'default',
): GameRendererHandle {
  let target = canvas;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: target,
      antialias,
      powerPreference,
      stencil: false,
    });
  } catch (err) {
    console.warn('[renderer] WebGL on existing canvas failed, replacing canvas:', err);
    target = replaceCanvas(canvas);
    renderer = new THREE.WebGLRenderer({
      canvas: target,
      antialias,
      powerPreference,
      stencil: false,
    });
  }
  configureCommon(renderer);
  const info = baseInfo(preference, 'webgl', fellBack, reason);
  setActiveRendererBackend('webgl');
  return {
    renderer,
    info,
    isWebGLRenderer: true,
    isWebGPURenderer: false,
  };
}

/**
 * Prefer WebGPU when the browser supports it and init succeeds with a real
 * WebGPU backend. Otherwise use classic WebGLRenderer so EffectComposer +
 * ShaderMaterial paths keep working.
 */
export async function createGameRenderer(
  options: CreateGameRendererOptions,
): Promise<GameRendererHandle> {
  const {
    canvas,
    search = typeof window !== 'undefined' ? window.location.search : '',
    storageGet = readStorage,
    antialias = true,
    powerPreference = 'high-performance',
  } = options;

  const preference = resolveRendererPreference(search, storageGet);

  if (!shouldAttemptWebGPU(preference)) {
    return createWebGLHandle(
      canvas,
      preference,
      false,
      'forced-webgl',
      antialias,
      powerPreference,
    );
  }

  const webgpuReady = await probeWebGPU(powerPreference);
  if (!webgpuReady) {
    return createWebGLHandle(
      canvas,
      preference,
      preference === 'webgpu',
      'webgpu-unavailable',
      antialias,
      powerPreference,
    );
  }

  try {
    const { WebGPURenderer } = await import('three/webgpu');
    const renderer = new WebGPURenderer({
      canvas,
      antialias,
      powerPreference: powerPreference === 'default' ? undefined : powerPreference,
      stencil: false,
    });
    await renderer.init();

    const backend = renderer.backend as { isWebGPUBackend?: boolean };
    if (backend?.isWebGPUBackend === true) {
      configureCommon(renderer);
      const info = baseInfo(preference, 'webgpu', false, 'webgpu-init-ok');
      setActiveRendererBackend('webgpu');
      return {
        renderer,
        info,
        isWebGLRenderer: false,
        isWebGPURenderer: true,
      };
    }

    // Internal WebGL2 fallback of WebGPURenderer — dispose and use classic WebGL
    // on a fresh canvas so EffectComposer / ShaderMaterials keep working.
    renderer.dispose();
    const fresh = replaceCanvas(canvas);
    return createWebGLHandle(
      fresh,
      preference,
      true,
      'webgpu-renderer-webgl2-fallback',
      antialias,
      powerPreference,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[renderer] WebGPU init failed, using WebGL:', message);
    const fresh = replaceCanvas(canvas);
    return createWebGLHandle(
      fresh,
      preference,
      true,
      'webgpu-init-failed',
      antialias,
      powerPreference,
    );
  }
}
