import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasWebGPUEntry,
  resolveRendererPreference,
  shouldAttemptWebGPU,
} from './preference.ts';

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
});

describe('shouldAttemptWebGPU', () => {
  it('attempts for auto and webgpu only', () => {
    assert.equal(shouldAttemptWebGPU('auto'), true);
    assert.equal(shouldAttemptWebGPU('webgpu'), true);
    assert.equal(shouldAttemptWebGPU('webgl'), false);
  });
});

describe('hasWebGPUEntry', () => {
  it('detects presence of gpu object', () => {
    assert.equal(hasWebGPUEntry(undefined), false);
    assert.equal(hasWebGPUEntry(null), false);
    assert.equal(hasWebGPUEntry({}), true);
  });
});
