import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fingerprint, getOrCreateIntent, clearIntent } = require('../public/practice-idempotency.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const draft = (overrides = {}) => ({
  userId: 'user-1', skill: 'py-base', text: 'Solved a small exercise', minutes: 25, link: '', questId: '',
  files: [{ name: 'proof.png', size: 1024, lastModified: 100, type: 'image/png' }],
  ...overrides,
});

test('same practice draft recovers its pending idempotency key after a reload', () => {
  const storage = memoryStorage();
  let id = 0;
  const signature = fingerprint(draft());
  const first = getOrCreateIntent(storage, 'pending', signature, () => `event-id-${++id}`);
  const afterReload = getOrCreateIntent(storage, 'pending', signature, () => `event-id-${++id}`);

  assert.equal(first.eventId, 'event-id-1');
  assert.equal(afterReload.eventId, first.eventId);
  assert.equal(afterReload.recovered, true);
  assert.equal(id, 1);
});

test('a changed practice draft receives a new id and does not clear another pending request', () => {
  const storage = memoryStorage();
  let id = 0;
  const original = fingerprint(draft());
  const changed = fingerprint(draft({ text: 'Solved another exercise' }));
  const first = getOrCreateIntent(storage, 'pending', original, () => `event-id-${++id}`);
  const second = getOrCreateIntent(storage, 'pending', changed, () => `event-id-${++id}`);

  assert.notEqual(second.eventId, first.eventId);
  clearIntent(storage, 'pending', first.eventId, original);
  assert.equal(JSON.parse(storage.getItem('pending')).eventId, second.eventId);
});

test('practice fingerprint includes account and evidence identity', () => {
  const base = fingerprint(draft());
  assert.notEqual(fingerprint(draft({ userId: 'user-2' })), base);
  assert.notEqual(fingerprint(draft({ files: [{ name: 'proof.png', size: 2048, lastModified: 100, type: 'image/png' }] })), base);
});
