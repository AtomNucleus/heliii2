import type { RendererInitInfo } from './types';

/**
 * Surface renderer backend for diagnostics / Playwright via data attributes.
 * Non-intrusive: attributes only, no visible UI chrome.
 */
export function applyRendererDiagnostics(
  root: HTMLElement | null,
  info: RendererInitInfo,
): void {
  if (!root) return;
  root.dataset.rendererBackend = info.backend;
  root.dataset.rendererPreference = info.preference;
  root.dataset.rendererFallback = info.fellBack ? '1' : '0';
  root.dataset.rendererReason = info.reason;
  root.dataset.threeRevision = info.revision;

  const canvas = root.querySelector('#game-canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.dataset.rendererBackend = info.backend;
  }
}
