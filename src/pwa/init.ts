import { PwaController, type MissionSafetyProvider, type PwaControllerOptions } from './controller';

/**
 * Bootstrap PWA registration + install/update UI.
 * Service worker registration is production-only (Vite `import.meta.env.PROD`)
 * so local `vite` / unit tests never get a sticky SW cache.
 */
export async function initPwa(options: {
  root: HTMLElement;
  getMissionSafety: MissionSafetyProvider;
}): Promise<PwaController | null> {
  const updateRoot = document.getElementById('pwa-update');
  const installRoot = document.getElementById('pwa-install');
  if (!updateRoot || !installRoot) {
    console.warn('[pwa] missing #pwa-update / #pwa-install shell');
    return null;
  }

  const enableServiceWorker = import.meta.env.PROD;
  let registerSW: PwaControllerOptions['registerSW'];

  if (enableServiceWorker) {
    try {
      const mod = await import('virtual:pwa-register');
      registerSW = mod.registerSW;
    } catch (err) {
      console.warn('[pwa] virtual:pwa-register unavailable', err);
    }
  }

  const controller = new PwaController({
    root: options.root,
    updateRoot,
    installRoot,
    getMissionSafety: options.getMissionSafety,
    registerSW,
    enableServiceWorker,
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
  });

  controller.start();
  return controller;
}
