import assert from 'node:assert/strict';
import test from 'node:test';
import { withTimeout, withTimeoutFallback } from './withTimeout';

test('withTimeout resolves values that settle before the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 100, 'quick-step'), 7);
});

test('withTimeout rejects stalled startup work with a useful label', async () => {
  await assert.rejects(
    withTimeout(new Promise<never>(() => undefined), 10, 'stalled-step'),
    /stalled-step timed out after 10ms/,
  );
});

test('withTimeoutFallback returns the fallback after a timeout', async () => {
  const result = await withTimeoutFallback(
    new Promise<boolean>(() => undefined),
    10,
    'optional-probe',
    false,
  );
  assert.equal(result, false);
});
