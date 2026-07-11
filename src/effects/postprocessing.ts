import * as THREE from 'three';
import type { GameRendererInstance } from '../render/types';
import { getActiveRendererBackend } from '../render/runtime';
import type { PostProcessingHandle } from './postprocessingTypes';

export type { PostProcessingHandle } from './postprocessingTypes';

/**
 * Backend-specific post-processing factory (async so WebGPU/TSL stays off the
 * classic WebGL download+parse path used on phones).
 */
export async function createPostProcessing(
  renderer: GameRendererInstance,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<PostProcessingHandle> {
  const backend = getActiveRendererBackend();
  if (backend === 'webgpu') {
    const { createWebGPUPostProcessing } = await import('./postprocessingWebgpu');
    // WebGPURenderer is only constructed on this path.
    return createWebGPUPostProcessing(renderer as never, scene, camera);
  }
  const { createWebGLPostProcessing } = await import('./postprocessingWebgl');
  return createWebGLPostProcessing(renderer as THREE.WebGLRenderer, scene, camera);
}
