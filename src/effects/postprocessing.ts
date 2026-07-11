import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { GameRendererInstance } from '../render/types';
import { getActiveRendererBackend } from '../render/runtime';
import { createWebGLPostProcessing } from './postprocessingWebgl';
import { createWebGPUPostProcessing } from './postprocessingWebgpu';
import type { PostProcessingHandle } from './postprocessingTypes';

export type { PostProcessingHandle } from './postprocessingTypes';

/**
 * Backend-specific post-processing factory.
 * WebGL → classic EffectComposer / GLSL passes.
 * WebGPU → TSL RenderPipeline (bloom, grade, vignette, RGB shift, film).
 */
export function createPostProcessing(
  renderer: GameRendererInstance,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingHandle {
  const backend = getActiveRendererBackend();
  if (backend === 'webgpu') {
    return createWebGPUPostProcessing(renderer as WebGPURenderer, scene, camera);
  }
  return createWebGLPostProcessing(renderer as THREE.WebGLRenderer, scene, camera);
}
