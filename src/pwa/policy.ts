/**
 * Pure PWA update / install state policy (no DOM, no Workbox).
 * Controllers and tests share this so UI decisions stay deterministic.
 */

export type SwLifecycle = 'unsupported' | 'pending' | 'registered' | 'waiting' | 'controlling';

export type UpdatePhase = 'none' | 'available' | 'deferred' | 'reloading';

export type InstallPhase =
  | 'unsupported'
  | 'available'
  | 'dismissed'
  | 'installed'
  | 'standalone';

export type MissionSafety = 'safe' | 'active';

export interface PwaPolicyState {
  sw: SwLifecycle;
  update: UpdatePhase;
  install: InstallPhase;
}

export interface PwaPolicySnapshot extends PwaPolicyState {
  /** True when an update banner should be visible. */
  showUpdateUi: boolean;
  /** True when an install affordance should be visible. */
  showInstallUi: boolean;
  /** True when activating the waiting worker is allowed immediately. */
  canActivateNow: boolean;
  /** Label hint for the primary update action. */
  updateAction: 'reload' | 'defer' | 'none';
}

export function createInitialPwaState(opts?: {
  serviceWorkerSupported?: boolean;
  displayStandalone?: boolean;
}): PwaPolicyState {
  // Display mode and SW support are independent: standalone/installed apps
  // still need SW registration for precache updates.
  return {
    sw: opts?.serviceWorkerSupported === false ? 'unsupported' : 'pending',
    update: 'none',
    install: opts?.displayStandalone ? 'standalone' : 'unsupported',
  };
}

export function reducePwaState(
  state: PwaPolicyState,
  event:
    | { type: 'sw-registered' }
    | { type: 'sw-controlling' }
    | { type: 'sw-waiting' }
    | { type: 'update-available' }
    | { type: 'update-deferred' }
    | { type: 'update-reloading' }
    | { type: 'update-cleared' }
    | { type: 'install-available' }
    | { type: 'install-dismissed' }
    | { type: 'install-accepted' }
    | { type: 'install-installed' }
    | { type: 'display-standalone' },
): PwaPolicyState {
  switch (event.type) {
    case 'sw-registered':
      return { ...state, sw: state.sw === 'waiting' ? 'waiting' : 'registered' };
    case 'sw-controlling':
      return { ...state, sw: 'controlling' };
    case 'sw-waiting':
    case 'update-available':
      return {
        ...state,
        sw: state.sw === 'unsupported' ? state.sw : 'waiting',
        update: state.update === 'deferred' ? 'deferred' : 'available',
      };
    case 'update-deferred':
      return state.update === 'none' ? state : { ...state, update: 'deferred' };
    case 'update-reloading':
      return { ...state, update: 'reloading' };
    case 'update-cleared':
      return { ...state, update: 'none' };
    case 'install-available':
      if (state.install === 'standalone' || state.install === 'installed' || state.install === 'dismissed') {
        return state;
      }
      return { ...state, install: 'available' };
    case 'install-dismissed':
      return state.install === 'available' ? { ...state, install: 'dismissed' } : state;
    case 'install-accepted':
    case 'install-installed':
      return { ...state, install: 'installed' };
    case 'display-standalone':
      return { ...state, install: 'standalone', update: state.update };
    default:
      return state;
  }
}

/**
 * Decide what the player-facing UI should do given policy state + mission safety.
 * Activation never auto-interrupts an active mission.
 */
export function snapshotPwaPolicy(
  state: PwaPolicyState,
  mission: MissionSafety,
): PwaPolicySnapshot {
  const updateReady = state.update === 'available' || state.update === 'deferred';
  const showUpdateUi = updateReady || state.update === 'reloading';
  const showInstallUi = state.install === 'available';
  const canActivateNow = updateReady && mission === 'safe';
  let updateAction: PwaPolicySnapshot['updateAction'] = 'none';
  if (state.update === 'reloading') {
    updateAction = 'none';
  } else if (updateReady) {
    updateAction = canActivateNow ? 'reload' : 'defer';
  }

  return {
    ...state,
    showUpdateUi,
    showInstallUi,
    canActivateNow,
    updateAction,
  };
}

/** Persist dismiss across sessions without inventing install support. */
export const INSTALL_DISMISS_KEY = 'heli.pwa.installDismissed';

export function shouldRestoreInstallDismissed(
  storageGet: (key: string) => string | null | undefined,
): boolean {
  return storageGet(INSTALL_DISMISS_KEY) === '1';
}

export function isDisplayStandalone(matches: (query: string) => boolean, navigatorStandalone?: boolean): boolean {
  if (navigatorStandalone) return true;
  return matches('(display-mode: standalone)') || matches('(display-mode: fullscreen)');
}
