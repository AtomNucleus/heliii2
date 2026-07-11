import type { RendererBackend } from './preference';

let backend: RendererBackend = 'webgl';

/** Module-level backend flag for material factories that cannot take an explicit arg. */
export function setActiveRendererBackend(next: RendererBackend): void {
  backend = next;
}

export function getActiveRendererBackend(): RendererBackend {
  return backend;
}

export function isWebGPUActive(): boolean {
  return backend === 'webgpu';
}
