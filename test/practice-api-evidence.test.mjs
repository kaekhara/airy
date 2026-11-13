import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { dailyStreakBonus, questEligibility } = loadTsModule('../lib/rpg-engine.ts');

function createServices(profile = {}) {
  const documents = new Map([
    ['data/users/user-1/profile', profile],
    ['data/users/user-1/profile/system/rpg-summary-v1', { version: 7, count: 0, total: 0, minutes: 0, proofCount: 0, skillXp: {}, branchXp: {}, dayCounts: {}, dayXp: {}, dayMinutes: {}, dayBranchXp: {} }],
  ]);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    async get() {
      const data = documents.get(path);
      return { exists: data !== undefined, id: path.split('/').at(-1), data: () => data, get: (key) => data?.[key] };
    },
    where: () => ({ query: true, limit: () => ({ query: true }) }),
    limit: () => ({ query: true }),
  });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      const transaction = {
        async get(reference) {
          if (reference.query) return { empty: true, docs: [] };
          const data = documents.get(reference.path);
          return { exists: data !== undefined, data: () => data, get: (key) => data?.[key] };
        },
        create(reference, value) { documents.set(reference.path, value); },
        set(reference, value, options = {}) {
          const old = documents.get(reference.path);
          documents.set(reference.path, options.merge && old ? { ...old, ...value } : value);
        },
      };
      return callback(transaction);
    },
  };
  return { db, auth: { verifyIdToken: async () => ({ uid: 'user-1' }) } };
}

function loadRoute(services, observed) {
  return loadTsModule('../app/api/rpg/practice/route.ts', {
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/bounded-request': { readBoundedRequestText: (request) => request.text() },
    '@/lib/image-evidence': loadTsModule('../lib/image-evidence.ts'),
    '@/lib/rpg-engine': {
      dailyStreakBonus,
      isSkillUnlocked: () => true,
      practiceXp: (input) => { observed.imageCount = input.imageCount; return 20 + input.imageCount * 5; },
      questEligibility,
    },
    '@/lib/rpg-skills': { isSkillProfileGraphValid: () => true },
    '@/lib/rpg-achievements': {
      addProofToRpgSummary: (summary, entry) => {
        observed.summaryWrites = (observed.summaryWrites || 0) + 1;
        return { ...summary, count: (summary.count || 0) + 1, total: (summary.total || 0) + entry.xp };
      },
      achievementMetricsFromSummary: () => ({}),
      buildRpgSummary: () => ({}),
      unlockEligibleAchievementsFromMetrics: () => {
        observed.achievementChecks = (observed.achievementChecks || 0) + 1;
        return { fresh: [], ledger: {}, titles: [] };
      },
    },
    '@/lib/quest-history': { appendQuestCompletion: () => [] },
    '@/lib/rpg-quests': { isCanonicalRecurringQuest: () => true },
  });
}

function request(body) {
  return new Request('https://airy.test/api/rpg/practice', {
    method: 'POST',
    headers: { origin: 'https://airy.test', authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('an arbitrary attachment ID cannot satisfy a quest evidence requirement', async () => {
  const services = createServices({ quests: [{ id: 'q1', skill: 'cyber-net', period: 'personal', requiresEvidence: true }] });
  const { POST } = loadRoute(services, {});
  const response = await POST(request({ eventId: 'event-00000001', skill: 'cyber-net', text: 'Изучил тему', min: 30, imgs: [{ id: 'invented-asset' }], questId: 'q1', utcOffsetMinutes: 0 }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'QUEST_EVIDENCE');
  assert.equal(services.db.documents.has('data/users/user-1/profile/proofs/event_event-00000001'), false);
});

test('an arbitrary attachment ID does not award the image XP bonus', async () => {
  const services = createServices();
  const observed = {};
  const { POST } = loadRoute(services, observed);
  const response = await POST(request({ eventId: 'event-00000002', skill: 'cyber-net', text: 'Изучил тему', min: 30, imgs: [{ id: 'invented-asset' }], utcOffsetMinutes: 0 }));
  assert.equal(response.status, 200);
  assert.equal(observed.imageCount, 0);
  const proof = services.db.documents.get('data/users/user-1/profile/proofs/event_event-00000002');
  assert.equal(proof.xp, 20);
});

test('practice API rejects an overdue personal quest before writing practice or XP', async () => {
  const services = createServices({ quests: [{
    id: 'personal-overdue', skill: 'cyber-net', period: 'personal', title: 'Сдать лабораторную',
    requiredMinutes: 15, dueAt: Date.now() - 13 * 60 * 60 * 1_000, done: false,
  }] });
  const { POST } = loadRoute(services, {});
  const response = await POST(request({ eventId: 'event-overdue-001', skill: 'cyber-net', text: 'Закончил лабораторную', min: 30, imgs: [], questId: 'personal-overdue', utcOffsetMinutes: 0 }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'QUEST_EXPIRED');
  assert.equal(services.db.documents.has('data/users/user-1/profile/proofs/event_event-overdue-001'), false);
  assert.equal(services.db.documents.get('data/users/user-1/profile/system/rpg-summary-v1').count, 0);
});

test('practice save rejects missing or non-numeric minutes and timezone offsets', async () => {
  for (const [index, invalid] of [
    { min: undefined, utcOffsetMinutes: 0 },
    { min: 'not-a-number', utcOffsetMinutes: 0 },
    { min: 30, utcOffsetMinutes: undefined },
    { min: 30, utcOffsetMinutes: 'not-a-number' },
  ].entries()) {
    const services = createServices();
    const { POST } = loadRoute(services, {});
    const response = await POST(request({
      eventId: `invalid-event-${String(index).padStart(4, '0')}`,
      skill: 'cyber-net', text: 'Проверил введённые значения', imgs: [], ...invalid,
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'INVALID_PRACTICE');
    assert.equal([...services.db.documents.keys()].some((path) => path.includes('/proofs/')), false);
  }
});


test('replaying a saved practice event does not reapply XP, summary, or achievement checks', async () => {
  const services = createServices();
  const observed = {};
  const { POST } = loadRoute(services, observed);
  const body = { eventId: 'event-00000003', skill: 'cyber-net', text: 'Изучил тему', min: 30, imgs: [], utcOffsetMinutes: 0 };

  const first = await POST(request(body));
  const firstResult = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstResult.created, true);
  assert.equal(firstResult.entry.xp, 20);

  const replay = await POST(request(body));
  const replayResult = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayResult.created, false);
  assert.equal(replayResult.entry.id, firstResult.entry.id);
  assert.equal(services.db.documents.get('data/users/user-1/profile/system/rpg-summary-v1').count, 1);
  assert.equal(services.db.documents.get('data/users/user-1/profile/system/rpg-summary-v1').total, 20);
  assert.equal(observed.summaryWrites, 1);
  assert.equal(observed.achievementChecks, 1);
});
