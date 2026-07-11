import * as THREE from 'three';
import {
  preferWebGLForStability,
  readDeviceCapabilitySignals,
  type DeviceCapabilitySignals,
} from './deviceCapability';
import {
  hasWebGPUEntry,
  resolveRendererPreference,
  shouldAttemptWebGPU,
  type RendererPreference,
} from './preference';
import { setActiveRendererBackend } from './runtime';
import type { GameRendererHandle, RendererInitInfo } from './types';
import { webglContextFallbackLadder, type WebGLContextAttempt } from './webglFallback';
import { withTimeout, withTimeoutFallback } from '../utils/withTimeout';

const WEBGPU_PROBE_TIMEOUT_MS = 4_000;
const WEBGPU_INIT_TIMEOUT_MS = 10_000;

export interface CreateGameRendererOptions {
  canvas: HTMLCanvasElement;
  /** Override search string (defaults to `window.location.search`). */
  search?: string;
  /** Override storage reader (defaults to localStorage). */
  storageGet?: (key: string) => string | null;
  /** Override session storage reader (defaults to sessionStorage). */
  sessionGet?: (key: string) => string | null;
  /** Override device capability signals (defaults to live browser read). */
  deviceSignals?: DeviceCapabilitySignals;
  /**
   * @deprecated Ladder owns antialias / powerPreference. Kept for API compat;
   * ignored when the fallback ladder runs.
   */
  antialias?: boolean;
  /**
   * @deprecated Ladder owns antialias / powerPreference. Kept for API compat;
   * ignored when the fallback ladder runs.
   */
  powerPreference?: 'high-performance' | 'low-power' | 'default';
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: {
      powerPreference?: 'high-performance' | 'low-power';
    }) => Promise<unknown | null>;
  };
};

function readStorage(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function baseInfo(
  preference: RendererPreference,
  backend: RendererInitInfo['backend'],
  fellBack: boolean,
  reason: string,
  webglAttempt?: string,
): RendererInitInfo {
  return {
    backend,
    preference,
    fellBack,
    reason,
    revision: THREE.REVISION,
    ...(webglAttempt ? { webglAttempt } : {}),
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
}, pixelRatioCap: number): void {
  // Apply a conservative cap before Three/composer allocate their first render
  // targets. Adaptive quality can lower this further after startup.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
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
 * Probe WebGPU via adapter only — do not request a GPUDevice that we immediately
 * destroy (avoids extra device churn before Three creates the real one).
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
    return adapter != null;
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

function tryCreateWebGLRenderer(
  canvas: HTMLCanvasElement,
  attempt: WebGLContextAttempt,
): THREE.WebGLRenderer {
  return new THREE.WebGLRenderer({
    canvas,
    antialias: attempt.antialias,
    powerPreference: attempt.powerPreference,
    stencil: false,
  });
}

function createWebGLHandle(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
  fellBack: boolean,
  reason: string,
  mobileStable: boolean,
): GameRendererHandle {
  const ladder = webglContextFallbackLadder({ mobileStable });
  let target = canvas;
  let lastError: unknown;

  for (let i = 0; i < ladder.length; i++) {
    const attempt = ladder[i]!;
    if (i > 0) {
      target = replaceCanvas(target);
    }
    try {
      const renderer = tryCreateWebGLRenderer(target, attempt);
      configureCommon(renderer, mobileStable ? 1 : 1.5);
      const info = baseInfo(preference, 'webgl', fellBack, reason, attempt.id);
      setActiveRendererBackend('webgl');
      console.info(`[renderer] WebGL context ok attempt=${attempt.id} reason=${reason}`);
      return {
        renderer,
        info,
        isWebGLRenderer: true,
        isWebGPURenderer: false,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[renderer] WebGL attempt ${attempt.id} failed:`, err);
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
  throw new Error(
    `WebGL2 initialization failed after ${ladder.length} attempts (${message}). `
      + 'This device/browser does not appear to support WebGL2.',
  );
}

function webglPolicyReason(
  preference: RendererPreference,
  signals: DeviceCapabilitySignals,
): string {
  if (preference === 'webgl') return 'forced-webgl';
  if (preference === 'auto' && preferWebGLForStability(signals)) {
    return 'mobile-stability-policy';
  }
  return 'webgl-selected';
}

/**
 * Prefer WebGPU when the browser supports it and init succeeds with a real
 * WebGPU backend. Otherwise use classic WebGLRenderer so EffectComposer +
 * ShaderMaterial paths keep working.
 *
 * In `auto` on phone/coarse/mobile-like environments, prefer classic WebGL
 * for stability. Explicit `?renderer=webgpu` still attempts WebGPU.
 */
export async function createGameRenderer(
  options: CreateGameRendererOptions,
): Promise<GameRendererHandle> {
  const {
    canvas,
    search = typeof window !== 'undefined' ? window.location.search : '',
    storageGet = readStorage,
    sessionGet = readSession,
    deviceSignals = readDeviceCapabilitySignals(),
  } = options;

  const preference = resolveRendererPreference(search, storageGet, sessionGet);
  const mobileStable = preferWebGLForStability(deviceSignals);

  if (!shouldAttemptWebGPU(preference, deviceSignals)) {
    return createWebGLHandle(
      canvas,
      preference,
      false,
      webglPolicyReason(preference, deviceSignals),
      mobileStable,
    );
  }

  // Desktop / explicit WebGPU: probe adapter only, then init Three's renderer.
  const webgpuReady = await withTimeoutFallback(
    probeWebGPU(mobileStable ? 'default' : 'high-performance'),
    WEBGPU_PROBE_TIMEOUT_MS,
    'webgpu-probe',
    false,
  );
  if (!webgpuReady) {
    return createWebGLHandle(
      canvas,
      preference,
      preference === 'webgpu',
      'webgpu-unavailable',
      mobileStable,
    );
  }

  try {
    const { WebGPURenderer } = await import('three/webgpu');
    const renderer = new WebGPURenderer({
      canvas,
      antialias: !mobileStable,
      powerPreference: mobileStable ? undefined : 'high-performance',
      stencil: false,
    });
    await withTimeout(renderer.init(), WEBGPU_INIT_TIMEOUT_MS, 'webgpu-renderer-init');

    const backend = renderer.backend as { isWebGPUBackend?: boolean };
    if (backend?.isWebGPUBackend === true) {
      configureCommon(renderer, mobileStable ? 1 : 1.5);
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
      mobileStable,
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
      mobileStable,
    );
  }
}
