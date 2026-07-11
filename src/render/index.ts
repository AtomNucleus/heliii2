export {
  resolveRendererPreference,
  shouldAttemptWebGPU,
  hasWebGPUEntry,
  getRendererStorageKey,
} from './preference';
export type { RendererPreference, RendererBackend } from './preference';
export {
  isMobileLikeEnvironment,
  preferWebGLForStability,
  readDeviceCapabilitySignals,
} from './deviceCapability';
export type { DeviceCapabilitySignals, DeviceCapabilityEnv } from './deviceCapability';
export { webglContextFallbackLadder } from './webglFallback';
export type { WebGLContextAttempt, WebGLPowerPreference } from './webglFallback';
export {
  WEBGL_RECOVERY_SESSION_KEY,
  WEBGL_RECOVERY_QUERY_PARAM,
  isWebGLRecoveryArmed,
  hasRecoveryQueryMarker,
  hasWebGLRecoveryLoopGuard,
  armWebGLRecovery,
  clearWebGLRecovery,
  buildAutomaticRecoveryUrl,
  buildCompatibilityModeUrl,
  stripRecoveryQueryParams,
  canAttemptWebGLRecovery,
} from './recovery';
export { createGameRenderer } from './createRenderer';
export type { CreateGameRendererOptions } from './createRenderer';
export { applyRendererDiagnostics, applyRendererFailureDiagnostics } from './diagnostics';
export { getActiveRendererBackend, isWebGPUActive, setActiveRendererBackend } from './runtime';
export type { GameRendererHandle, GameRendererInstance, RendererInitInfo } from './types';
