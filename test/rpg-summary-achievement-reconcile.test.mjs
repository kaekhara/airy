import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/achievement-catalog.js';
import { loadTsModule } from './load-ts.mjs';

function createServices({ profile = {}, summary = {}, proofs = [], beforeTransaction } = {}) {
  const documents = new Map([
    ['data/users/user-1/profile', profile],
    ['data/users/user-1/profile/system/rpg-summary-v1', summary],
  ]);
  let proofLimit = proofs.length || 1;
  let proofOffset = 0;
  const proofCollection = {
    orderBy() { return this; },
    limit(value) { proofLimit = value; return this; },
    startAfter(snapshot) { proofOffset = snapshot.index + 1; return this; },
    async get() {
      const page = proofs.slice(proofOffset, proofOffset + proofLimit);
      const docs = page.map((data, index) => ({ index: proofOffset + index, data: () => data }));
      proofOffset = 0;
      return { docs };
    },
  };
  const ref = (path) => ({
    path,
    collection(name) {
      if (path === 'data/users/user-1/profile' && name === 'proofs') return proofCollection;
      return ref(`${path}/${name}`);
    },
    doc(id) { return ref(`${path}/${id}`); },
    async get() {
      const data = documents.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      beforeTransaction?.(documents);
      const transaction = {
        async get(reference) {
          const data = documents.get(reference.path);
          return { exists: data !== undefined, data: () => data };
        },
        set(reference, value, options = {}) {
          const current = documents.get(reference.path);
          documents.set(reference.path, options.merge && current ? { ...current, ...value } : value);
        },
      };
      return callback(transaction);
    },
  };
  return { db, auth: { verifyIdToken: async () => ({ uid: 'user-1' }) } };
}

function loadRoute(services) {
  const rpgEngine = loadTsModule('../lib/rpg-engine.ts');
  const imageEvidence = loadTsModule('../lib/image-evidence.ts');
  const achievements = loadTsModule('../lib/rpg-achievements.ts', {
    '@/lib/rpg-engine': rpgEngine,
    '@/lib/image-evidence': imageEvidence,
    '@/public/achievement-catalog.js': catalog,
  });
  return loadTsModule('../app/api/rpg/summary/route.ts', {
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-achievements': achievements,
  });
}

function request() {
  return new Request('https://airy.test/api/rpg/summary', {
    headers: { authorization: 'Bearer token' },
  });
}

test('summary reconciliation awards achievements for existing progress exactly once', async () => {
  const services = createServices({
    profile: {},
    summary: { version: 7, count: 2, total: 250, minutes: 0, skillXp: {}, branchXp: {}, dayCounts: {}, dayXp: {}, dayMinutes: {}, dayBranchXp: {} },
  });
  const { GET } = loadRoute(services);

  const firstResponse = await GET(request());
  assert.equal(firstResponse.status, 200);
  const first = services.db.documents.get('data/users/user-1/profile');
  assert.ok(first.achievementUnlocks['xp-250']);
  assert.ok(first.unlockedTitles.includes('Титул «Опыт 250»'));
  const firstAwardedAt = first.achievementUnlocks['xp-250'].at;

  const secondResponse = await GET(request());
  assert.equal(secondResponse.status, 200);
  const second = services.db.documents.get('data/users/user-1/profile');
  assert.equal(second.achievementUnlocks['xp-250'].at, firstAwardedAt);
  assert.equal(second.unlockedTitles.filter((title) => title === 'Титул «Опыт 250»').length, 1);
});

test('summary rebuild unlocks achievements using the rebuilt server proof history', async () => {
  const services = createServices({
    profile: { rpgSummaryNeedsRebuild: true },
    summary: { version: 6 },
    proofs: [
      { skill: 'cyber-net', xp: 20, min: 30, day: '2026-11-10', text: 'Изучил сетевые основы' },
    ],
  });
  const { GET } = loadRoute(services);

  const response = await GET(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.summary.version, 7);
  assert.equal(result.summary.total, 20);
  const profile = services.db.documents.get('data/users/user-1/profile');
  assert.equal(profile.rpgSummaryNeedsRebuild, false);
  assert.ok(profile.achievementUnlocks['entries-1']);
});

test('summary rebuild streams proof history across Firestore pages', async () => {
  const proofs = Array.from({ length: 1_005 }, (_, index) => ({
    skill: 'cyber-net', xp: 2, branchXp: 1, min: 5,
    day: '2026-11-10', ts: Date.parse('2026-11-10T08:00:00Z') + index,
  }));
  const services = createServices({ profile: { rpgSummaryNeedsRebuild: true }, summary: { version: 6 }, proofs });
  const { GET } = loadRoute(services);

  const response = await GET(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.summary.count, 1_005);
  assert.equal(result.summary.total, 2_010);
  assert.equal(result.summary.branchXp.cyber, 1_005);
  assert.deepEqual(result.summary.dayCounts, { '2026-11-10': 1_005 });
});

test('summary retries when a rebuild becomes necessary after the initial read', async () => {
  let first = true;
  const services = createServices({
    profile: {},
    summary: { version: 7, count: 0, total: 0, skillXp: {}, branchXp: {}, dayCounts: {}, dayXp: {}, dayMinutes: {}, dayBranchXp: {} },
    proofs: [{ skill: 'cyber-net', xp: 20, min: 30, day: '2026-11-10' }],
    beforeTransaction(documents) {
      if (!first) return;
      first = false;
      documents.set('data/users/user-1/profile', { rpgSummaryNeedsRebuild: true });
      documents.set('data/users/user-1/profile/system/rpg-summary-v1', { version: 6 });
    },
  });
  const { GET } = loadRoute(services);

  const response = await GET(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.summary.version, 7);
  assert.equal(result.summary.total, 20);
  assert.equal(services.db.documents.get('data/users/user-1/profile').rpgSummaryNeedsRebuild, false);
});
