/**
 * PWA controller — wires Workbox register + beforeinstallprompt to pure policy.
 * Exposes data attributes for tests and a small HUD-aligned UI shell.
 */

import {
  createInitialPwaState,
  INSTALL_DISMISS_KEY,
  isDisplayStandalone,
  reducePwaState,
  shouldRestoreInstallDismissed,
  snapshotPwaPolicy,
  type MissionSafety,
  type PwaPolicySnapshot,
  type PwaPolicyState,
} from './policy';

export type MissionSafetyProvider = () => MissionSafety;

export interface PwaControllerOptions {
  root: HTMLElement;
  updateRoot: HTMLElement;
  installRoot: HTMLElement;
  getMissionSafety: MissionSafetyProvider;
  /** Injected registerSW from virtual:pwa-register (production only). */
  registerSW?: (options: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: Error) => void;
  }) => (reloadPage?: boolean) => Promise<void>;
  matchMedia?: (query: string) => boolean;
  storage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  /** When false, skip SW registration (dev / tests). */
  enableServiceWorker?: boolean;
}

export class PwaController {
  private state: PwaPolicyState;
  private readonly root: HTMLElement;
  private readonly updateRoot: HTMLElement;
  private readonly installRoot: HTMLElement;
  private readonly getMissionSafety: MissionSafetyProvider;
  private readonly storage: PwaControllerOptions['storage'];
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private offlineReady = false;

  constructor(private readonly opts: PwaControllerOptions) {
    this.root = opts.root;
    this.updateRoot = opts.updateRoot;
    this.installRoot = opts.installRoot;
    this.getMissionSafety = opts.getMissionSafety;
    this.storage = opts.storage;

    const standalone = isDisplayStandalone(
      opts.matchMedia ?? ((q) => window.matchMedia(q).matches),
      typeof navigator !== 'undefined'
        ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
        : false,
    );

    const swSupported =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator && opts.enableServiceWorker !== false;

    this.state = createInitialPwaState({
      serviceWorkerSupported: swSupported,
      displayStandalone: standalone,
    });

    if (
      !standalone &&
      this.storage &&
      shouldRestoreInstallDismissed((k) => this.storage?.getItem(k) ?? null)
    ) {
      this.state = reducePwaState(this.state, { type: 'install-dismissed' });
    }

    this.bindUi();
    this.syncDom();
  }

  /** Start listening / register SW. Safe to call once after DOM is ready. */
  start(): void {
    this.listenInstall();
    this.listenInstalled();

    if (this.state.sw === 'unsupported' || !this.opts.registerSW || this.opts.enableServiceWorker === false) {
      this.syncDom();
      return;
    }

    this.updateSW = this.opts.registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.updateRoot.dataset.dismissed = '0';
        this.state = reducePwaState(this.state, { type: 'update-available' });
        this.syncDom();
      },
      onOfflineReady: () => {
        this.offlineReady = true;
        this.state = reducePwaState(this.state, { type: 'sw-controlling' });
        this.syncDom();
      },
      onRegisteredSW: (_url, reg) => {
        this.state = reducePwaState(this.state, { type: 'sw-registered' });
        if (reg?.waiting) {
          this.state = reducePwaState(this.state, { type: 'sw-waiting' });
        }
        this.syncDom();
      },
      onRegisterError: (err) => {
        console.warn('[pwa] service worker registration failed', err);
        this.syncDom();
      },
    });

    this.syncDom();
  }

  /** Re-evaluate mission-gated update UI (call on phase changes). */
  refresh(): void {
    this.syncDom();
    const snap = this.snapshot();
    const dismissed = this.updateRoot.dataset.dismissed === '1';
    // Auto-apply only when the player chose "APPLY LATER", not when they dismissed.
    if (snap.update === 'deferred' && snap.canActivateNow && !dismissed) {
      void this.activateUpdate();
    }
  }

  snapshot(): PwaPolicySnapshot {
    return snapshotPwaPolicy(this.state, this.getMissionSafety());
  }

  getState(): PwaPolicyState {
    return { ...this.state };
  }

  isOfflineReady(): boolean {
    return this.offlineReady;
  }

  async activateUpdate(): Promise<void> {
    const snap = this.snapshot();
    if (!snap.showUpdateUi || snap.update === 'reloading') return;

    if (!snap.canActivateNow) {
      this.state = reducePwaState(this.state, { type: 'update-deferred' });
      this.updateRoot.dataset.dismissed = '0';
      this.syncDom();
      return;
    }

    this.state = reducePwaState(this.state, { type: 'update-reloading' });
    this.syncDom();
    try {
      await this.updateSW?.(true);
    } catch (err) {
      console.warn('[pwa] update activation failed', err);
      this.state = reducePwaState(this.state, { type: 'update-available' });
      this.syncDom();
    }
  }

  dismissUpdate(): void {
    // Keep waiting worker; hide banner. Does not auto-apply when mission ends.
    this.state = reducePwaState(this.state, { type: 'update-deferred' });
    this.updateRoot.dataset.dismissed = '1';
    this.syncDom();
  }

  async promptInstall(): Promise<void> {
    if (!this.deferredPrompt || this.state.install !== 'available') return;
    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        this.state = reducePwaState(this.state, { type: 'install-accepted' });
      } else {
        this.state = reducePwaState(this.state, { type: 'install-dismissed' });
        this.persistInstallDismiss();
      }
    } catch (err) {
      console.warn('[pwa] install prompt failed', err);
      this.deferredPrompt = null;
      this.state = reducePwaState(this.state, { type: 'install-dismissed' });
      this.persistInstallDismiss();
    }
    this.syncDom();
  }

  dismissInstall(): void {
    this.deferredPrompt = null;
    this.state = reducePwaState(this.state, { type: 'install-dismissed' });
    this.persistInstallDismiss();
    this.syncDom();
  }

  private persistInstallDismiss(): void {
    try {
      this.storage?.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* ignore quota / private mode */
    }
  }

  private bindUi(): void {
    this.updateRoot.querySelector('[data-pwa-action="reload"]')?.addEventListener('click', () => {
      void this.activateUpdate();
    });
    this.updateRoot.querySelector('[data-pwa-action="dismiss-update"]')?.addEventListener('click', () => {
      this.dismissUpdate();
    });
    this.installRoot.querySelector('[data-pwa-action="install"]')?.addEventListener('click', () => {
      void this.promptInstall();
    });
    this.installRoot.querySelector('[data-pwa-action="dismiss-install"]')?.addEventListener('click', () => {
      this.dismissInstall();
    });
  }

  private listenInstall(): void {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      if (this.state.install === 'dismissed' || this.state.install === 'standalone' || this.state.install === 'installed') {
        return;
      }
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.state = reducePwaState(this.state, { type: 'install-available' });
      this.syncDom();
    });
  }

  private listenInstalled(): void {
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.state = reducePwaState(this.state, { type: 'install-installed' });
      this.syncDom();
    });
  }

  private syncDom(): void {
    const snap = this.snapshot();
    this.root.dataset.pwaSw = snap.sw;
    this.root.dataset.pwaUpdate = snap.update;
    this.root.dataset.pwaInstall = snap.install;
    this.root.dataset.pwaOfflineReady = this.offlineReady ? 'true' : 'false';

    const updateDismissed = this.updateRoot.dataset.dismissed === '1' && snap.update === 'deferred';
    const showUpdate = snap.showUpdateUi && !updateDismissed;
    this.updateRoot.hidden = !showUpdate;
    this.updateRoot.dataset.visible = showUpdate ? 'true' : 'false';
    this.updateRoot.dataset.action = snap.updateAction;

    const msg = this.updateRoot.querySelector('[data-pwa-update-msg]');
    const reloadBtn = this.updateRoot.querySelector<HTMLButtonElement>('[data-pwa-action="reload"]');
    if (msg) {
      if (snap.update === 'reloading') {
        msg.textContent = 'Applying update…';
      } else if (snap.updateAction === 'defer') {
        msg.textContent = 'Update ready · applies after mission';
      } else {
        msg.textContent = 'Update ready';
      }
    }
    if (reloadBtn) {
      reloadBtn.disabled = snap.update === 'reloading';
      reloadBtn.textContent =
        snap.updateAction === 'defer' ? 'APPLY LATER' : snap.update === 'reloading' ? 'RELOADING…' : 'RELOAD';
    }

    const showInstall = snap.showInstallUi;
    this.installRoot.hidden = !showInstall;
    this.installRoot.dataset.visible = showInstall ? 'true' : 'false';
  }
}

/** Minimal BeforeInstallPrompt typing (not in all TS DOM libs). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
