import assert from 'node:assert/strict';
import test from 'node:test';
import { getQualitySettings } from './quality';

test('low quality avoids bloom render-target allocation', () => {
  const low = getQualitySettings('low');
  assert.equal(low.bloomEnabled, false);
  assert.equal(low.bloomStrength, 0);
  assert.equal(getQualitySettings('medium').bloomEnabled, true);
  assert.equal(getQualitySettings('high').bloomEnabled, true);
});
