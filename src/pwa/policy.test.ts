import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createInitialPwaState,
  isDisplayStandalone,
  reducePwaState,
  shouldRestoreInstallDismissed,
  snapshotPwaPolicy,
} from './policy.ts';

describe('createInitialPwaState', () => {
  it('starts pending when SW is supported', () => {
    assert.deepEqual(createInitialPwaState({ serviceWorkerSupported: true }), {
      sw: 'pending',
      update: 'none',
      install: 'unsupported',
    });
  });

  it('marks SW unsupported when missing', () => {
    assert.equal(createInitialPwaState({ serviceWorkerSupported: false }).sw, 'unsupported');
  });

  it('marks install standalone without blocking SW registration', () => {
    assert.deepEqual(createInitialPwaState({ serviceWorkerSupported: true, displayStandalone: true }), {
      sw: 'pending',
      update: 'none',
      install: 'standalone',
    });
  });

  it('keeps SW unsupported in standalone when the browser has no SW API', () => {
    assert.deepEqual(
      createInitialPwaState({ serviceWorkerSupported: false, displayStandalone: true }),
      {
        sw: 'unsupported',
        update: 'none',
        install: 'standalone',
      },
    );
  });
});

describe('reducePwaState + snapshotPwaPolicy', () => {
  it('surfaces update UI but defers activation during an active mission', () => {
    let state = createInitialPwaState({ serviceWorkerSupported: true });
    state = reducePwaState(state, { type: 'sw-registered' });
    state = reducePwaState(state, { type: 'update-available' });

    const active = snapshotPwaPolicy(state, 'active');
    assert.equal(active.showUpdateUi, true);
    assert.equal(active.canActivateNow, false);
    assert.equal(active.updateAction, 'defer');

    const safe = snapshotPwaPolicy(state, 'safe');
    assert.equal(safe.canActivateNow, true);
    assert.equal(safe.updateAction, 'reload');
  });

  it('keeps deferred update until cleared or reloading', () => {
    let state = createInitialPwaState({ serviceWorkerSupported: true });
    state = reducePwaState(state, { type: 'update-available' });
    state = reducePwaState(state, { type: 'update-deferred' });
    assert.equal(state.update, 'deferred');
    assert.equal(snapshotPwaPolicy(state, 'active').updateAction, 'defer');
    state = reducePwaState(state, { type: 'update-reloading' });
    assert.equal(state.update, 'reloading');
  });

  it('only shows install UI when beforeinstallprompt made it available', () => {
    let state = createInitialPwaState({ serviceWorkerSupported: true });
    assert.equal(snapshotPwaPolicy(state, 'safe').showInstallUi, false);

    state = reducePwaState(state, { type: 'install-available' });
    assert.equal(snapshotPwaPolicy(state, 'safe').showInstallUi, true);

    state = reducePwaState(state, { type: 'install-dismissed' });
    assert.equal(snapshotPwaPolicy(state, 'safe').showInstallUi, false);
    // Re-offer should not override dismiss in the same session policy chain
    state = reducePwaState(state, { type: 'install-available' });
    assert.equal(state.install, 'dismissed');
  });

  it('treats standalone / installed as non-installable', () => {
    let state = createInitialPwaState({ displayStandalone: true });
    state = reducePwaState(state, { type: 'install-available' });
    assert.equal(state.install, 'standalone');
    assert.equal(snapshotPwaPolicy(state, 'safe').showInstallUi, false);
  });
});

describe('install dismiss persistence helpers', () => {
  it('reads dismiss flag', () => {
    assert.equal(shouldRestoreInstallDismissed(() => '1'), true);
    assert.equal(shouldRestoreInstallDismissed(() => null), false);
  });
});

describe('isDisplayStandalone', () => {
  it('detects media query or iOS navigator.standalone', () => {
    assert.equal(
      isDisplayStandalone((q) => q.includes('standalone')),
      true,
    );
    assert.equal(isDisplayStandalone(() => false, true), true);
    assert.equal(isDisplayStandalone(() => false, false), false);
  });
});
