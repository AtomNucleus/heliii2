import type { QualitySettings } from './quality';
import type { RendererBackend } from '../render/preference';

/**
 * Shared post-processing contract for WebGL (EffectComposer) and
 * WebGPU (TSL RenderPipeline) backends.
 */
export interface PostProcessingHandle {
  backend: RendererBackend;
  /** 0..1 flight intensity — drives chromatic aberration & vignette punch */
  setSpeedIntensity: (t: number) => void;
  applyQuality: (q: QualitySettings) => void;
  update: (dt: number) => void;
  onResize: () => void;
  render: () => void;
}
