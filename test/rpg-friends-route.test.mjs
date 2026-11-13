import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

function fakeServices() {
  const documents = new Map();
  const ref = (path) => ({
    path,
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    async get() { return snapshot(documents.get(path), path); },
    where(field, operator, value) { return query(path, [[field, operator, value]]); },
    async create(value) {
      if (documents.has(path)) throw new Error('already exists');
      documents.set(path, structuredClone(value));
    },
  });
  const query = (path, filters = []) => ({
    where(field, operator, value) { return query(path, [...filters, [field, operator, value]]); },
    orderBy() { return this; },
    limit() { return this; },
    async get() {
      const prefix = `${path}/`;
      const docs = [...documents.entries()]
        .filter(([key, value]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/') && filters.every(([field, operator, target]) => operator !== '==' || value?.[field] === target))
        .map(([key, value]) => snapshot(value, key));
      return { docs, size: docs.length };
    },
  });
  const snapshot = (value, path) => ({
    exists: value !== undefined,
    id: path.split('/').at(-1),
    data: () => value === undefined ? undefined : structuredClone(value),
    get: (key) => value?.[key],
  });
  const db = {
    documents,
    doc: ref,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(documentRef) { return snapshot(documents.get(documentRef.path), documentRef.path); },
        set(documentRef, value, options = {}) { writes.push(['set', documentRef.path, structuredClone(value), options]); },
        delete(documentRef) { writes.push(['delete', documentRef.path]); },
      };
      const result = await callback(transaction);
      for (const [operation, path, value, options] of writes) {
        if (operation === 'delete') documents.delete(path);
        else {
          const current = documents.get(path);
          documents.set(path, options.merge && current ? { ...current, ...value } : value);
        }
      }
      return result;
    },
  };
  return {
    db,
    auth: { verifyIdToken: async (token) => ({ uid: token, email_verified: true }) },
  };
}

test('friends API creates one-use invites, connects both profiles, handles retries, and removes reciprocally', async () => {
  const services = fakeServices();
  services.db.documents.set('data/users/owner/profile', { name: 'Owner', avatar: '🌸' });
  services.db.documents.set('data/users/guest/profile', { name: 'Guest', avatar: '🌙' });
  const achievements = new Map();
  const unlockEligibleMetricAchievements = (metric, count) => {
    const ids = metric === 'friendCount' && count >= 1 ? ['friends-1'] : [];
    const previous = achievements.get(count) || [];
    const fresh = ids.filter((id) => !previous.includes(id));
    achievements.set(count, [...previous, ...fresh]);
    return { fresh: fresh.map((id) => ({ id })), ledger: Object.fromEntries([...previous, ...fresh].map((id) => [id, Date.now()])), titles: [] };
  };
  const rpgFriends = loadTsModule('../lib/rpg-friends.ts');
  const { GET, POST, DELETE } = loadTsModule('../app/api/rpg/friends/route.ts', {
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/bounded-request': { readBoundedRequestText: async (request, limit) => {
      const text = await request.text();
      return new TextEncoder().encode(text).byteLength > limit ? null : text;
    } },
    '@/lib/verified-email': { hasVerifiedEmail: (claims) => claims.email_verified === true },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-achievements': { unlockEligibleMetricAchievements },
    '@/lib/rpg-friends': rpgFriends,
  });
  const request = (method, uid, payload) => new Request('https://airy.test/api/rpg/friends', {
    method,
    headers: { authorization: `Bearer ${uid}`, origin: 'https://airy.test', 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

  const inviteResponse = await POST(request('POST', 'owner', { action: 'invite' }));
  const invite = await inviteResponse.json();
  assert.equal(inviteResponse.status, 200);
  assert.match(invite.code, /^[A-F0-9]{18}$/);
  assert.equal(invite.expiresAt > Date.now(), true);

  const acceptResponse = await POST(request('POST', 'guest', { action: 'accept', code: invite.code.toLowerCase() }));
  const accepted = await acceptResponse.json();
  assert.equal(acceptResponse.status, 200);
  assert.equal(accepted.alreadyConnected, false);
  assert.equal(accepted.ownFriendCount, 1);
  assert.equal(accepted.ownAwards[0].id, 'friends-1');
  assert.equal(services.db.documents.get('data/users/owner/profile').friendCount, 1);
  assert.equal(services.db.documents.get('data/users/guest/profile').friendCount, 1);

  const retryResponse = await POST(request('POST', 'guest', { action: 'accept', code: invite.code }));
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json()).alreadyConnected, true);
  assert.equal(services.db.documents.get('data/users/owner/profile').friendCount, 1);
  assert.equal(services.db.documents.get('data/users/guest/profile').friendCount, 1);

  const listResponse = await GET(request('GET', 'owner'));
  assert.equal(listResponse.status, 200, await listResponse.clone().text());
  assert.deepEqual((await listResponse.json()).friends.map(({ uid, name }) => ({ uid, name })), [{ uid: 'guest', name: 'Guest' }]);

  const removeResponse = await DELETE(request('DELETE', 'owner', { friendUid: 'guest' }));
  assert.equal(removeResponse.status, 200);
  assert.deepEqual(await removeResponse.json(), { removed: true });
  assert.equal(services.db.documents.get('data/users/guest/profile/friends/owner').status, 'removed');
  assert.equal(services.db.documents.get('data/users/owner/profile').friendCount, 1);
});

test('friends API rejects cross-origin mutation and unverified accounts before writes', async () => {
  const services = fakeServices();
  const rpgFriends = loadTsModule('../lib/rpg-friends.ts');
  let verified = false;
  const route = loadTsModule('../app/api/rpg/friends/route.ts', {
    '@/lib/firebase-admin': { getFirebaseAdmin: () => services },
    '@/lib/bounded-request': { readBoundedRequestText: async (request) => request.text() },
    '@/lib/verified-email': { hasVerifiedEmail: () => verified },
    '@/lib/server-rate-limit': { consumeServerRateLimit: async () => ({ allowed: true, retryAfter: 0 }) },
    '@/lib/rpg-achievements': { unlockEligibleMetricAchievements: () => ({ fresh: [], ledger: {}, titles: [] }) },
    '@/lib/rpg-friends': rpgFriends,
  });
  const crossOrigin = await route.POST(new Request('https://airy.test/api/rpg/friends', {
    method: 'POST', headers: { authorization: 'Bearer guest', origin: 'https://attacker.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'invite' }),
  }));
  assert.equal(crossOrigin.status, 403);

  const unverified = await route.POST(new Request('https://airy.test/api/rpg/friends', {
    method: 'POST', headers: { authorization: 'Bearer guest', origin: 'https://airy.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'invite' }),
  }));
  assert.equal(unverified.status, 403);
  assert.equal((await unverified.json()).error, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(services.db.documents.size, 0);
});
