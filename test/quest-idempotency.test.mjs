import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTsModule } from './load-ts.mjs';

const require = createRequire(import.meta.url);
const { fingerprint, getOrCreateIntent, clearIntent } = require('../public/quest-idempotency.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('quest add retries reuse the pending request id until the server confirms success', () => {
  const storage = memoryStorage(), tasks = [{ skill: 'py-base', title: 'Повтори цикл', requiredMinutes: 20 }];
  const signature = fingerprint({ userId: 'user-1', quests: tasks });
  let created = 0;
  const first = getOrCreateIntent(storage, 'pending', signature, () => `quest-${++created}-id`);
  const retry = getOrCreateIntent(storage, 'pending', signature, () => `quest-${++created}-id`);
  assert.equal(retry.requestId, first.requestId);
  assert.equal(retry.recovered, true);
  assert.equal(created, 1);

  clearIntent(storage, 'pending', first.requestId, signature);
  const nextIntent = getOrCreateIntent(storage, 'pending', signature, () => `quest-${++created}-id`);
  assert.notEqual(nextIntent.requestId, first.requestId);
});

test('quest add intents are account and payload scoped and stale clearing is harmless', () => {
  const storage = memoryStorage();
  const tasks = [{ skill: 'py-base', title: 'Практика', requiredMinutes: 20 }];
  const firstFingerprint = fingerprint({ userId: 'user-1', quests: tasks });
  const secondFingerprint = fingerprint({ userId: 'user-2', quests: tasks });
  const changedFingerprint = fingerprint({ userId: 'user-1', quests: [{ ...tasks[0], title: 'Другой план' }] });
  assert.notEqual(firstFingerprint, secondFingerprint);
  assert.notEqual(firstFingerprint, changedFingerprint);

  const first = getOrCreateIntent(storage, 'pending', firstFingerprint, () => 'request-one');
  const changed = getOrCreateIntent(storage, 'pending', changedFingerprint, () => 'request-two');
  clearIntent(storage, 'pending', first.requestId, firstFingerprint);
  assert.equal(JSON.parse(storage.getItem('pending')).requestId, changed.requestId);
});

function fakeFirestore() {
  const documents = new Map([
    ['data/users/user-1/profile/system/rpg-summary-v1', { version: 6, branchXp: {}, skillXp: {} }],
  ]);
  const ref = (path) => ({ path, collection: (name) => ref(`${path}/${name}`), doc: (id) => ref(`${path}/${id}`) });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(reference) {
          const value = documents.get(reference.path);
          return {
            exists: value !== undefined,
            data: () => value,
            get: (key) => value?.[key],
          };
        },
        set(reference, value, options = {}) { writes.push({ kind: 'set', reference, value, options }); },
        create(reference, value) { writes.push({ kind: 'create', reference, value }); },
      };
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.kind === 'create' && documents.has(write.reference.path)) throw new Error('ALREADY_EXISTS');
        const current = documents.get(write.reference.path);
        documents.set(write.reference.path, write.kind === 'set' && write.options.merge && current
          ? { ...current, ...write.value }
          : write.value);
      }
      return result;
    },
  };
  return db;
}

test('quest API makes add retries idempotent and rejects request id reuse with changed content', async () => {
  const db = fakeFirestore();
  const services = { db, auth: { verifyIdToken: async () => ({ uid: 'user-1' }) } };
  const dependencies = {
    'node:crypto': require('node:crypto'),
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-engine': { isSkillGraphAcyclic: () => true, isSkillUnlocked: () => true },
    '@/lib/rpg-skills': { isSkillProfileGraphValid: () => true },
    '@/lib/rpg-quests': { isQuestDueAtValid: () => true, recurringQuestSpecs: () => [] },
    '@/lib/quest-history': { archiveCompletedQuests: (history) => history || [] },
    '@/lib/bounded-request': { readBoundedRequestText: async (request, maxBytes) => {
      const text = await request.text();
      return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
    } },
    '@/lib/firestore-errors': { isFirestorePermissionDenied: (error) => [7, '7', 'permission-denied', 'PERMISSION_DENIED', 'firestore/permission-denied'].includes(error?.code) },
  };
  const { POST } = loadTsModule('../app/api/rpg/quests/route.ts', dependencies);
  const post = (requestId, quests) => POST(new Request('https://airy.test/api/rpg/quests', {
    method: 'POST',
    headers: { origin: 'https://airy.test', authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'add', requestId, quests }),
  }));
  const original = [{ skill: 'py-base', title: 'Практика цикла', requiredMinutes: 20 }];

  const first = await post('quest-request-001', original);
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.replayed, false);
  assert.equal(firstBody.quests.length, 1);

  const retry = await post('quest-request-001', original);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.replayed, true);
  assert.deepEqual(retryBody.quests.map((quest) => quest.id), firstBody.quests.map((quest) => quest.id));
  assert.equal(db.documents.get('data/users/user-1/profile').quests.length, 1);

  const conflict = await post('quest-request-001', [{ ...original[0], title: 'Другой квест' }]);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'IDEMPOTENCY_CONFLICT');
  assert.equal(db.documents.get('data/users/user-1/profile').quests.length, 1);

  const intentionalSecondAdd = await post('quest-request-002', original);
  assert.equal(intentionalSecondAdd.status, 200);
  assert.equal((await intentionalSecondAdd.json()).quests.length, 2);
});
