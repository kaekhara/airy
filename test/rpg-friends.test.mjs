import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';
const { friendshipId, hashFriendCode, normalizeFriendCode, safeFriendAvatar, safeFriendName } = loadTsModule('../lib/rpg-friends.ts');

test('invite codes normalize only the bounded uppercase hex format', () => {
  assert.equal(normalizeFriendCode(' a1b2c3d4e5f6071829 '), 'A1B2C3D4E5F6071829');
  assert.equal(normalizeFriendCode('A1B2-C3D4-E5F6-0718-29'), null);
  assert.equal(normalizeFriendCode('not-a-code'), null);
  assert.equal(normalizeFriendCode({}), null);
});

test('invite hashes and friendship keys are opaque and stable', () => {
  const code = normalizeFriendCode('A1B2C3D4E5F6071829');
  assert.equal(hashFriendCode(code).length, 64);
  assert.notEqual(hashFriendCode(code), code);
  assert.equal(friendshipId('user-a', 'user-b'), friendshipId('user-b', 'user-a'));
  assert.notEqual(friendshipId('user-a', 'user-b'), friendshipId('user-a', 'user-c'));
});

test('friend profile fields are bounded and avatars are allowlisted', () => {
  assert.equal(safeFriendName('  Alex\nSmith  '), 'AlexSmith');
  assert.equal(safeFriendName('x'.repeat(40)).length, 24);
  assert.equal(safeFriendName('  '), 'Участник');
  assert.equal(safeFriendAvatar('🌸'), '🌸');
  assert.equal(safeFriendAvatar('<img>'), '✦');
});
