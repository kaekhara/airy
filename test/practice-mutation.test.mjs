import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

function fakeServices() {
  const documents = new Map([
    ['data/users/user-1/profile/system/rpg-summary-v1', { version: 7, total: 10, lastDay: '2026-11-10', dayCounts: { '2026-11-10': 1 } }],
    ['data/users/user-1/profile/proofs/event-00000001', { xp: 10, skill: 'py-base', min: 20, ts: 1, day: '2026-11-10', branchXp: 4 }],
  ]);
  const ref = (path) => ({ path, collection: (name) => ref(`${path}/${name}`), doc: (id) => ref(`${path}/${id}`) });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      const transaction = {
        async get(reference) {
          const value = documents.get(reference.path);
          return { exists: value !== undefined, data: () => value, get: (key) => value?.[key] };
        },
        set(reference, value, options = {}) {
          const current = documents.get(reference.path);
          documents.set(reference.path, options.merge && current ? { ...current, ...value } : value);
        },
        delete(reference) { documents.delete(reference.path); },
      };
      return callback(transaction);
    },
  };
  return { db, auth: { verifyIdToken: async () => ({ uid: 'user-1' }) } };
}

test('practice deletion retry succeeds when the first delete already committed', async () => {
  const services = fakeServices();
  const dependencies = {
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-engine': { isSkillGraphAcyclic: () => true, isSkillUnlocked: () => true, practiceEditXp: (_saved, fallback) => fallback, practiceXp: () => 1, questEditEligibility: () => 'ok' },
    '@/lib/rpg-skills': { isSkillProfileGraphValid: () => true },
    '@/lib/rpg-achievements': { achievementMetricsFromSummary: () => ({}), buildRpgSummary: () => ({}), mutateRpgSummary: () => ({ version: 7, total: 0 }), rebuildRpgSummaryAfterMutation: () => ({}), removeProofFromRpgSummary: () => ({ version: 7, total: 0 }), unlockEligibleAchievementsFromMetrics: () => ({ fresh: [], ledger: {}, titles: [] }) },
    '@/lib/quest-history': { appendQuestCompletion: () => [] },
    '@/lib/rpg-quests': { isCanonicalRecurringQuest: () => true },
    '@/lib/bounded-request': { readBoundedRequestText: async (request, maxBytes) => {
      const text = await request.text();
      return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
    } },
  };
  const { DELETE } = loadTsModule('../app/api/rpg/practice/[eventId]/route.ts', dependencies);
  const request = () => new Request('https://airy.test/api/rpg/practice/event-00000001', {
    method: 'DELETE', headers: { origin: 'https://airy.test', authorization: 'Bearer token' },
  });

  const first = await DELETE(request(), { params: Promise.resolve({ eventId: 'event-00000001' }) });
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.deleted, true);
  assert.equal(firstBody.summary.total, 0);

  const retry = await DELETE(request(), { params: Promise.resolve({ eventId: 'event-00000001' }) });
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.deleted, false);
  assert.equal(retryBody.summary.total, 0);
});
