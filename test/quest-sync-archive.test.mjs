import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTsModule } from './load-ts.mjs';

const require = createRequire(import.meta.url);

function createServices(profile) {
  const documents = new Map([['data/users/user-1/profile', profile]]);
  const ref = (path) => ({ path, collection: (name) => ref(`${path}/${name}`), doc: (id) => ref(`${path}/${id}`) });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(reference) {
          const value = documents.get(reference.path);
          return { exists: value !== undefined, data: () => value, get: (key) => value?.[key] };
        },
        set(reference, value, options = {}) { writes.push({ reference, value, options }); },
      };
      const result = await callback(transaction);
      for (const write of writes) {
        const current = documents.get(write.reference.path);
        documents.set(write.reference.path, write.options.merge && current ? { ...current, ...write.value } : write.value);
      }
      return result;
    },
  };
  return { db, auth: { verifyIdToken: async () => ({ uid: 'user-1' }) } };
}

test('quest sync moves completed legacy board entries to history without blocking recurring quests', async () => {
  const now = Date.now();
  const completed = Array.from({ length: 120 }, (_, index) => ({
    id: `legacy-personal-${index}`, skill: 'py-base', title: `Старый квест ${index}`,
    period: 'personal', done: true, createdAt: now - (120 - index) * 1_000,
    completedAt: now - (120 - index) * 1_000, requiredMinutes: 20,
  }));
  const profile = {
    quests: completed.concat([{ id: 'personal-active-01', skill: 'py-base', title: 'Продолжаю', period: 'personal', done: false }]),
    questHistory: [],
  };
  const services = createServices(profile);
  const quests = loadTsModule('../lib/rpg-quests.ts');
  const dependencies = {
    'node:crypto': require('node:crypto'),
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-engine': { isSkillUnlocked: () => true },
    '@/lib/rpg-skills': { isSkillProfileGraphValid: () => true },
    '@/lib/rpg-quests': quests,
    '@/lib/quest-history': loadTsModule('../lib/quest-history.ts'),
    '@/lib/bounded-request': { readBoundedRequestText: (request) => request.text() },
  };
  const { POST } = loadTsModule('../app/api/rpg/quests/route.ts', dependencies);
  const response = await POST(new Request('https://airy.test/api/rpg/quests', {
    method: 'POST', headers: { origin: 'https://airy.test', authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sync', offset: 0 }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.quests.length, 4);
  assert.equal(result.quests.filter((quest) => quest.period === 'personal').length, 1);
  assert.equal(result.profilePatch.questHistory.length, 120);
  assert.equal(result.quests.filter((quest) => quest.done !== true).length, 4);

  const retry = await POST(new Request('https://airy.test/api/rpg/quests', {
    method: 'POST', headers: { origin: 'https://airy.test', authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sync', offset: 0 }),
  }));
  assert.equal(retry.status, 200);
  const retried = await retry.json();
  assert.equal(retried.profilePatch.questHistory.length, 120);
  assert.equal(retried.quests.length, 4);
});

test('permanently deleting a quest archive entry removes only archive metadata and retains the practice profile', async () => {
  const questId = 'old-quest-1';
  const profile = {
    quests: [{ id: questId, skill: 'py-base', title: 'Старый квест', period: 'personal', done: true }],
    questHistory: [{ id: questId, title: 'Старый квест', skill: 'py-base', period: 'personal', completedAt: Date.now(), eventId: 'event-quest-001', xp: 0 }],
    totalXp: 340, unlockedTitles: ['Первый шаг'],
  };
  const services = createServices(profile);
  const quests = loadTsModule('../lib/rpg-quests.ts');
  const dependencies = {
    'node:crypto': require('node:crypto'),
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-engine': { isSkillUnlocked: () => true },
    '@/lib/rpg-skills': { isSkillProfileGraphValid: () => true },
    '@/lib/rpg-quests': quests,
    '@/lib/quest-history': loadTsModule('../lib/quest-history.ts'),
    '@/lib/bounded-request': { readBoundedRequestText: (request) => request.text() },
  };
  const { POST } = loadTsModule('../app/api/rpg/quests/route.ts', dependencies);
  const response = await POST(new Request('https://airy.test/api/rpg/quests', {
    method: 'POST', headers: { origin: 'https://airy.test', authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'purge-archive', id: questId }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.profilePatch.questHistory.length, 0);
  assert.deepEqual(result.profilePatch.purgedQuestArchiveIds, [questId]);
  assert.deepEqual(result.quests, []);
  const savedProfile = services.db.documents.get('data/users/user-1/profile');
  assert.deepEqual(savedProfile.quests, []);
  assert.deepEqual(savedProfile.questHistory, []);
  assert.equal(savedProfile.totalXp, 340);
  assert.deepEqual(savedProfile.unlockedTitles, ['Первый шаг']);
});
