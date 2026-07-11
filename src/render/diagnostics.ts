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
  if (info.webglAttempt) {
    root.dataset.rendererWebglAttempt = info.webglAttempt;
  } else {
    delete root.dataset.rendererWebglAttempt;
  }
  // Clear prior failure attrs on a successful init.
  delete root.dataset.rendererErrorStage;
  delete root.dataset.rendererErrorReason;

  const canvas = root.querySelector('#game-canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.dataset.rendererBackend = info.backend;
    if (info.webglAttempt) {
      canvas.dataset.rendererWebglAttempt = info.webglAttempt;
    } else {
      delete canvas.dataset.rendererWebglAttempt;
    }
  }
}

/** Surface graphics boot failure stage/reason for support + Playwright. */
export function applyRendererFailureDiagnostics(
  root: HTMLElement | null,
  failure: { stage: string; reason: string },
): void {
  if (!root) return;
  root.dataset.rendererErrorStage = failure.stage;
  root.dataset.rendererErrorReason = failure.reason;
}
