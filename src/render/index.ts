export {
  resolveRendererPreference,
  shouldAttemptWebGPU,
  hasWebGPUEntry,
  getRendererStorageKey,
} from './preference';
export type { RendererPreference, RendererBackend } from './preference';
export { createGameRenderer } from './createRenderer';
export type { CreateGameRendererOptions } from './createRenderer';
export { applyRendererDiagnostics } from './diagnostics';
export { getActiveRendererBackend, isWebGPUActive, setActiveRendererBackend } from './runtime';
export type { GameRendererHandle, GameRendererInstance, RendererInitInfo } from './types';
