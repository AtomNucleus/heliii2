import type * as THREE from 'three';
import type { RendererBackend, RendererPreference } from './preference';

/**
 * Minimal renderer surface shared by classic WebGL and WebGPU backends.
 * Avoids a hard type import from `three/webgpu` on the shared boot path.
 */
export interface GameRendererInstance {
  domElement: HTMLCanvasElement;
  toneMapping: number;
  toneMappingExposure: number;
  outputColorSpace: string;
  shadowMap: {
    enabled: boolean;
    type: number;
    autoUpdate?: boolean;
  };
  setPixelRatio: (n: number) => void;
  setSize: (w: number, h: number, updateStyle?: boolean) => void;
  setAnimationLoop: (cb: ((time: number, frame?: unknown) => void) | null) => void;
  render?: (scene: THREE.Object3D, camera: THREE.Camera) => void;
  dispose: () => void;
}

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
