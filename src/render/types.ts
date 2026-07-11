import type * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { RendererBackend, RendererPreference } from './preference';

/** Union of supported game renderers (classic WebGL or WebGPU). */
export type GameRendererInstance = THREE.WebGLRenderer | WebGPURenderer;

export interface RendererInitInfo {
  /** Effective graphics API used for drawing. */
  backend: RendererBackend;
  /** User/URL preference that drove selection. */
  preference: RendererPreference;
  /** True when WebGPU was attempted but classic WebGL was used instead. */
  fellBack: boolean;
  /** Human-readable reason for the chosen backend. */
  reason: string;
  /** Three.js revision string when available. */
  revision: string;
  /** Successful WebGL context ladder rung id when backend is webgl. */
  webglAttempt?: string;
}

export interface GameRendererHandle {
  renderer: GameRendererInstance;
  info: RendererInitInfo;
  /** True when this is a classic THREE.WebGLRenderer. */
  isWebGLRenderer: boolean;
  /** True when this is THREE.WebGPURenderer with a live WebGPU backend. */
  isWebGPURenderer: boolean;
}
