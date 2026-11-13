import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const serverRoutes = [
  'app/api/rpg/practice/route.ts',
  'app/api/rpg/practice/[eventId]/route.ts',
  'app/api/rpg/summary/route.ts',
  'app/api/rpg/share/route.ts',
  'app/api/rpg/friends/route.ts',
  'app/api/rpg/quests/route.ts',
].map((path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')).join('\n');

test('Firestore profile rules isolate account data and keep reward records server-managed', () => {
  assert.match(rules, /match \/data\/users\/\{userId\}\/profile/);
  assert.match(rules, /request\.auth != null && request\.auth\.uid == userId/);
  assert.match(rules, /allow read: if ownsProfile\(\)/);
  assert.match(rules, /allow create: if ownsProfile\(\)[\s\S]*?!request\.resource\.data\.keys\(\)\.hasAny\(serverManagedFields\(\)\)/);
  assert.match(rules, /allow update: if ownsProfile\(\)[\s\S]*?!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(serverManagedFields\(\)\)/);
  assert.match(rules, /allow delete: if false/);

  const managedFields = rules.match(/function serverManagedFields\(\)\s*\{\s*return \[([\s\S]*?)\];/);
  assert.ok(managedFields, 'server-maintained profile fields must be explicitly listed');
  const protectedKeys = [...managedFields[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((match) => match[1]);
  assert.equal(new Set(protectedKeys).size, protectedKeys.length, 'protected profile keys must be unique');
  for (const key of ['achievementUnlocks', 'unlockedTitles', 'shareCount', 'friendCount', 'lastRpgEventAt', 'rpgRulesVersion', 'rpgSummaryUpdatedAt', 'rpgSummaryNeedsRebuild', 'questHistory', 'quests']) {
    assert.ok(protectedKeys.includes(key), `${key} must not be client-editable`);
    assert.ok(serverRoutes.includes(key), `${key} should correspond to a server-owned RPG write`);
  }

  assert.doesNotMatch(rules, /match \/\{document=\*\*\}/, 'there must be no recursive allow rule that bypasses the profile boundary');
});

test('practice history is owner-readable and only server routes can write it', () => {
  assert.match(rules, /match \/proofs\/\{proofId\}\s*\{\s*allow read: if request\.auth != null && request\.auth\.uid == userId;\s*\/\/ Practice records are written and rewarded only by authenticated server routes\.\s*allow write: if false;/);
});

test('Firebase CLI targets the existing project and deploys the reviewed Firestore rules file', () => {
  const firebaseConfig = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  const projectConfig = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
  assert.equal(firebaseConfig.firestore.rules, 'firestore.rules');
  assert.equal(projectConfig.projects.default, 'upskillairy');
});
