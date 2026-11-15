import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {}, Date, Object, Array, Number, String, RegExp };
vm.runInNewContext(await readFile(new URL('../public/user-data-export.js', import.meta.url), 'utf8'), context);
const create = context.window.AiryUserDataExport.create;

test('user data export keeps progress, friend connections, account identity and recent Mika history', () => {
  const proofs = [{ id: 'proof-1' }];
  const profile = { name: 'Акира', achievementUnlocks: { first: { at: 10 } } };
  const result = create({
    exportedAt: '2026-11-12T00:00:00.000Z',
    account: { uid: 'user-123', email: 'user@example.com', token: 'must-not-export' },
    profile,
    proofs,
    friends: [{ uid: 'friend-1', name: 'Друг', avatar: '🌸', since: 100 }],
    mikaConversation: Array.from({ length: 24 }, (_, index) => ({ text: String(index) })),
    limitations: ['Список обрезан.'],
  });

  assert.equal(result.version, 3);
  assert.equal(result.account.uid, 'user-123');
  assert.equal(result.account.email, 'user@example.com');
  assert.equal('token' in result.account, false);
  assert.equal(result.profile, profile);
  assert.equal(result.proofs, proofs);
  assert.deepEqual(JSON.parse(JSON.stringify(result.friends)), [{ uid: 'friend-1', name: 'Друг', avatar: '🌸', since: 100 }]);
  assert.equal(result.mikaConversation.length, 20);
  assert.equal(result.mikaConversation[0].text, '4');
  assert.deepEqual(JSON.parse(JSON.stringify(result.limitations)), ['Список обрезан.']);
});

test('guest export is valid and does not invent account or friend data', () => {
  const result = create({ profile: {}, proofs: [], mikaConversation: [] });
  assert.equal(result.account, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.friends)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.limitations)), []);
});

test('export filters malformed friend entries and bounds public friend fields', () => {
  const result = create({ friends: [
    null,
    { uid: '../other-user', name: 'Invalid' },
    { uid: 'friend-2', name: 'N'.repeat(80), avatar: 'A'.repeat(20), since: Infinity },
  ] });
  assert.equal(result.friends.length, 1);
  assert.equal(result.friends[0].name.length, 40);
  assert.equal(result.friends[0].avatar.length, 8);
  assert.equal(result.friends[0].since, null);
});

test('profile and settings export share the same full-export flow with a browser download fallback', async () => {
  const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="/user-data-export.js') < html.indexOf('src="/upskill-app.js'));
  assert.match(app, /fetch\('\/api\/rpg\/friends'/);
  assert.match(app, /AiryUserDataExport\.create\(/);
  assert.match(app, /if\(store\.downloads\)await store\.downloads\.save/);
  assert.match(app, /URL\.createObjectURL\(blob\)/);
  assert.match(app, /\$\('#pfExport'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#pfExport'\)\.hidden=false/);
  assert.doesNotMatch(app, /\$\('#pfExport'\)\.hidden=!store\.downloads/);
});
