import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasWebGPUEntry,
  resolveRendererPreference,
  shouldAttemptWebGPU,
} from './preference.ts';
import {
  isMobileLikeEnvironment,
  preferWebGLForStability,
} from './deviceCapability.ts';
import { webglContextFallbackLadder } from './webglFallback.ts';
import {
  WEBGL_RECOVERY_SESSION_KEY,
  armWebGLRecovery,
  buildAutomaticRecoveryUrl,
  buildCompatibilityModeUrl,
  canAttemptWebGLRecovery,
  clearWebGLRecovery,
  hasRecoveryQueryMarker,
  hasWebGLRecoveryLoopGuard,
  isWebGLRecoveryArmed,
  stripRecoveryQueryParams,
} from './recovery.ts';

describe('resolveRendererPreference', () => {
  it('defaults to auto', () => {
    assert.equal(resolveRendererPreference(''), 'auto');
    assert.equal(resolveRendererPreference('?'), 'auto');
  });

  it('honors renderer=webgl and aliases', () => {
    assert.equal(resolveRendererPreference('?renderer=webgl'), 'webgl');
    assert.equal(resolveRendererPreference('?renderer=GL'), 'webgl');
    assert.equal(resolveRendererPreference('?forceRenderer=webgl'), 'webgl');
  });

  it('honors renderer=webgpu and aliases', () => {
    assert.equal(resolveRendererPreference('?renderer=webgpu'), 'webgpu');
    assert.equal(resolveRendererPreference('?renderer=gpu'), 'webgpu');
    assert.equal(resolveRendererPreference('?forceRenderer=webgpu'), 'webgpu');
  });

  it('honors forceWebGL=1 and webgl=1', () => {
    assert.equal(resolveRendererPreference('?forceWebGL=1'), 'webgl');
    assert.equal(resolveRendererPreference('?webgl=1'), 'webgl');
  });

  it('reads localStorage when query is absent', () => {
    assert.equal(
      resolveRendererPreference('', (key) => (key === 'heli.renderer' ? 'webgl' : null)),
      'webgl',
    );
    assert.equal(
      resolveRendererPreference('', (key) => (key === 'heli.renderer' ? 'webgpu' : null)),
      'webgpu',
    );
  });

  it('query overrides storage', () => {
    assert.equal(
      resolveRendererPreference('?renderer=webgl', () => 'webgpu'),
      'webgl',
    );
  });

  it('session recovery forces webgl over auto and storage', () => {
    assert.equal(
      resolveRendererPreference(
        '',
        () => 'webgpu',
        (key) => (key === WEBGL_RECOVERY_SESSION_KEY ? '1' : null),
      ),
      'webgl',
    );
  });

  it('query recovery marker forces webgl over explicit renderer=webgpu', () => {
    assert.equal(
      resolveRendererPreference('?renderer=webgpu&webglRecovery=1'),
      'webgl',
    );
  });
});

describe('shouldAttemptWebGPU', () => {
  it('attempts for auto and webgpu only on desktop-like signals', () => {
    assert.equal(shouldAttemptWebGPU('auto'), true);
    assert.equal(shouldAttemptWebGPU('webgpu'), true);
    assert.equal(shouldAttemptWebGPU('webgl'), false);
  });

  it('prefers WebGL in auto on mobile-like signals', () => {
    assert.equal(
      shouldAttemptWebGPU('auto', { pointerCoarse: true, maxTouchPoints: 5, narrowViewport: true }),
      false,
    );
  });

  it('still attempts WebGPU when explicitly requested on mobile', () => {
    assert.equal(
      shouldAttemptWebGPU('webgpu', {
        pointerCoarse: true,
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      }),
      true,
    );
  });
});

describe('hasWebGPUEntry', () => {
  it('detects presence of gpu object', () => {
    assert.equal(hasWebGPUEntry(undefined), false);
    assert.equal(hasWebGPUEntry(null), false);
    assert.equal(hasWebGPUEntry({}), true);
  });
});

describe('device capability policy', () => {
  it('detects iPhone / iPad Safari via UA', () => {
    assert.equal(
      isMobileLikeEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      }),
      true,
    );
    assert.equal(
      isMobileLikeEnvironment({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      }),
      true,
    );
  });

  it('detects iPadOS desktop UA with touch', () => {
    assert.equal(
      isMobileLikeEnvironment({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      }),
      true,
    );
    assert.equal(
      isMobileLikeEnvironment({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 0,
      }),
      false,
    );
  });

  it('uses coarse+touch without relying on UA alone', () => {
    assert.equal(
      preferWebGLForStability({ pointerCoarse: true, maxTouchPoints: 2 }),
      true,
    );
    assert.equal(
      preferWebGLForStability({ maxTouchPoints: 1 }),
      false,
    );
  });

  it('detects Android Mobile UA', () => {
    assert.equal(
      isMobileLikeEnvironment({
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      }),
      true,
    );
  });
});

describe('webglContextFallbackLadder', () => {
  it('orders desktop attempts aggressively first', () => {
    assert.deepEqual(
      webglContextFallbackLadder().map((s) => s.id),
      ['high-performance-aa', 'default-aa', 'default-no-aa', 'low-power-no-aa'],
    );
  });

  it('starts mobile-stable ladder at default/no-AA', () => {
    assert.deepEqual(
      webglContextFallbackLadder({ mobileStable: true }).map((s) => s.id),
      ['default-no-aa', 'low-power-no-aa'],
    );
  });
});

describe('WebGL recovery URL / session', () => {
  it('arms and clears session recovery flag', () => {
    const store = new Map<string, string>();
    assert.equal(isWebGLRecoveryArmed((k) => store.get(k) ?? null), false);
    armWebGLRecovery((k, v) => {
      store.set(k, v);
    });
    assert.equal(isWebGLRecoveryArmed((k) => store.get(k) ?? null), true);
    clearWebGLRecovery((k) => {
      store.delete(k);
    });
    assert.equal(isWebGLRecoveryArmed((k) => store.get(k) ?? null), false);
  });

  it('automatic recovery URL stamps only the transient marker', () => {
    const next = buildAutomaticRecoveryUrl(
      'https://cdn.example.com/games/heli/?foo=1&renderer=webgpu&bar=2#boot',
    );
    assert.equal(next.startsWith('/games/heli/'), true);
    assert.match(next, /[?&]webglRecovery=1/);
    assert.match(next, /[?&]foo=1/);
    assert.match(next, /[?&]bar=2/);
    assert.match(next, /[?&]renderer=webgpu/);
    assert.equal(next.includes('renderer=webgl'), false);
    assert.equal(next.endsWith('#boot'), true);
  });

  it('manual compatibility URL sets explicit renderer=webgl', () => {
    const next = buildCompatibilityModeUrl(
      'https://cdn.example.com/games/heli/?foo=1&renderer=webgpu&bar=2#boot',
      { includeRecoveryMarker: true },
    );
    assert.equal(next.startsWith('/games/heli/'), true);
    assert.match(next, /[?&]renderer=webgl/);
    assert.match(next, /[?&]foo=1/);
    assert.match(next, /[?&]bar=2/);
    assert.match(next, /[?&]webglRecovery=1/);
    assert.equal(next.includes('renderer=webgpu'), false);
    assert.equal(next.endsWith('#boot'), true);
  });

  it('drops forceRenderer alias when forcing webgl', () => {
    const next = buildCompatibilityModeUrl(
      'https://example.com/app/?forceRenderer=webgpu&x=1',
    );
    assert.match(next, /renderer=webgl/);
    assert.equal(next.includes('forceRenderer'), false);
    assert.match(next, /[?&]x=1/);
  });

  it('stripRecoveryQueryParams removes only the recovery marker', () => {
    const cleaned = stripRecoveryQueryParams(
      'https://cdn.example.com/games/heli/?foo=1&webglRecovery=1&renderer=webgl&bar=2#boot',
    );
    assert.equal(cleaned.startsWith('/games/heli/'), true);
    assert.equal(cleaned.includes('webglRecovery'), false);
    assert.match(cleaned, /[?&]foo=1/);
    assert.match(cleaned, /[?&]bar=2/);
    assert.match(cleaned, /[?&]renderer=webgl/);
    assert.equal(cleaned.endsWith('#boot'), true);
  });

  it('stripRecoveryQueryParams preserves user renderer after automatic recovery', () => {
    const recovered = buildAutomaticRecoveryUrl(
      'https://example.com/app/?renderer=webgpu&x=1#h',
    );
    const cleaned = stripRecoveryQueryParams(`https://example.com${recovered}`);
    assert.equal(cleaned.includes('webglRecovery'), false);
    assert.match(cleaned, /renderer=webgpu/);
    assert.match(cleaned, /[?&]x=1/);
    assert.equal(cleaned.endsWith('#h'), true);
  });

  it('prevents recovery loops via session or query marker', () => {
    assert.equal(canAttemptWebGLRecovery(''), true);
    assert.equal(canAttemptWebGLRecovery('?webglRecovery=1'), false);
    assert.equal(
      canAttemptWebGLRecovery('', (k) => (k === WEBGL_RECOVERY_SESSION_KEY ? '1' : null)),
      false,
    );
    assert.equal(hasWebGLRecoveryLoopGuard('?webglRecovery=1'), true);
    assert.equal(hasRecoveryQueryMarker('?webglRecovery=1'), true);
    assert.equal(hasRecoveryQueryMarker('?renderer=webgl'), false);
  });

  it('keeps loop guard through full-stack init until cleanup', () => {
    const store = new Map<string, string>();
    armWebGLRecovery((k, v) => {
      store.set(k, v);
    });
    const recoveredPath = buildAutomaticRecoveryUrl(
      'https://example.com/play/?renderer=webgpu&skin=neon',
    );
    const recoveredSearch = new URL(`https://example.com${recoveredPath}`).search;
    // Guard stays active for preference + further recovery while marker/session live.
    assert.equal(
      canAttemptWebGLRecovery(recoveredSearch, (k) => store.get(k) ?? null),
      false,
    );
    assert.equal(
      resolveRendererPreference(recoveredSearch, undefined, (k) => store.get(k) ?? null),
      'webgl',
    );

    // Cleanup only after successful full graphics stack (simulated here).
    clearWebGLRecovery((k) => {
      store.delete(k);
    });
    const cleanedPath = stripRecoveryQueryParams(`https://example.com${recoveredPath}`);
    const cleanedSearch = new URL(`https://example.com${cleanedPath}`).search;
    assert.equal(
      canAttemptWebGLRecovery(cleanedSearch, (k) => store.get(k) ?? null),
      true,
    );
    assert.equal(
      resolveRendererPreference(cleanedSearch, undefined, (k) => store.get(k) ?? null),
      'webgpu',
    );
    assert.match(cleanedPath, /renderer=webgpu/);
    assert.match(cleanedPath, /skin=neon/);
    assert.equal(cleanedPath.includes('webglRecovery'), false);
  });
});
