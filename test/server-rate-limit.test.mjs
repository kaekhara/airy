import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { consumeServerRateLimit } = loadTsModule('../lib/server-rate-limit.ts');

function fakeFirestore() {
  const documents = new Map();
  return {
    documents,
    doc(path) { return { path }; },
    async runTransaction(callback) {
      const transaction = {
        async get(reference) {
          const value = documents.get(reference.path);
          return { exists: Boolean(value), data: () => value };
        },
        set(reference, value) { documents.set(reference.path, value); },
      };
      return callback(transaction);
    },
  };
}

test('server rate limit is shared by key and atomically counts the fixed window', async () => {
  const db = fakeFirestore();
  const limit = async (...args) => JSON.parse(JSON.stringify(await consumeServerRateLimit(db, ...args)));
  const runLimit = (...args) => limit(...args);
  assert.deepEqual(await runLimit('user-1', 'mika-chat', 1_000, 2, 60_000), { allowed: true, retryAfter: 0 });
  assert.deepEqual(await runLimit('user-1', 'mika-chat', 5_000, 2, 60_000), { allowed: true, retryAfter: 0 });
  assert.deepEqual(await runLimit('user-1', 'mika-chat', 10_000, 2, 60_000), { allowed: false, retryAfter: 51 });
  assert.deepEqual(await runLimit('user-2', 'mika-chat', 10_000, 2, 60_000), { allowed: true, retryAfter: 0 });
  assert.deepEqual(await runLimit('user-1', 'mika-chat', 61_000, 2, 60_000), { allowed: true, retryAfter: 0 });
});

test('server rate limit rejects unsafe document path segments', async () => {
  const db = fakeFirestore();
  await assert.rejects(() => consumeServerRateLimit(db, '../uid', 'mika-chat', 1, 1), /INVALID_RATE_LIMIT_KEY/);
  await assert.rejects(() => consumeServerRateLimit(db, 'uid', 'bad/bucket', 1, 1), /INVALID_RATE_LIMIT_KEY/);
});
