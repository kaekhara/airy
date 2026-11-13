import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { withRetry } = require('../public/quest-sync.js');

test('quest sync retries a transient failure once and resolves with the next result', async () => {
  let calls = 0, waits = [];
  const result = await withRetry(async () => {
    calls++;
    if (calls === 1) throw new TypeError('network unavailable');
    return { quests: ['daily'] };
  }, { attempts: 2, delayMs: 900, wait: async (ms) => waits.push(ms) });
  assert.deepEqual(result, { quests: ['daily'] });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [900]);
});

test('quest sync does not retry a permanent error or exceed the configured attempt cap', async () => {
  let calls = 0, waits = 0;
  const permanent = new Error('AUTH_REQUIRED');
  await assert.rejects(withRetry(async () => { calls++; throw permanent; }, {
    attempts: 3,
    shouldRetry: (error) => error instanceof TypeError,
    wait: async () => { waits++; },
  }), (error) => error === permanent);
  assert.equal(calls, 1);
  assert.equal(waits, 0);

  calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new TypeError('offline'); }, {
    attempts: 99,
    wait: async () => {},
  }));
  assert.equal(calls, 3);
});
