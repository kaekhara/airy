import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const quests = loadTsModule('../lib/rpg-quests.ts');

test('recurring quests are deterministic for local day and week boundaries', () => {
  const profile = { hiddenSkills: ['db'], customBranches: [{ id: 'cb-a', name: 'Музыка' }] };
  const first = quests.recurringQuestSpecs(profile, Date.parse('2026-11-10T20:30:00Z'), 360);
  const second = quests.recurringQuestSpecs(profile, Date.parse('2026-11-10T21:30:00Z'), 360);
  assert.equal(first[0].id, 'daily-2026-11-11');
  assert.equal(first[0].id, second[0].id);
  assert.equal(first[0].skill, 'cb-a');
  assert.equal(first[1].id, 'weekly-2026-11-09');
  assert.equal(first[2].id, first[1].id.replace('weekly-', 'boss-'));
  assert.equal(first[2].period, 'boss');
  assert.equal(first[2].requiredMinutes, 60);
  assert.equal(first[2].requiresEvidence, true);
  assert.notEqual(first[2].skill, 'db');
  assert.equal(first[0].expiresAt, Date.parse('2026-11-11T18:00:00Z'));
  assert.equal(first[1].expiresAt, Date.parse('2026-11-15T17:59:59.999Z'));
  assert.equal(first[2].expiresAt, first[1].expiresAt);
});

test('only unchanged, current server-generated recurring quests qualify for the quest bonus', () => {
  const profile = {};
  const now = Date.parse('2026-11-10T08:00:00Z');
  const [daily, weekly, boss] = quests.recurringQuestSpecs(profile, now, 0);
  assert.equal(quests.isCanonicalRecurringQuest(daily, profile, now + 60_000, 0), true);
  assert.equal(quests.isCanonicalRecurringQuest(weekly, profile, now + 60_000, 0), true);
  assert.equal(quests.isCanonicalRecurringQuest(boss, profile, now + 60_000, 0), true);
  assert.equal(quests.isCanonicalRecurringQuest({ ...daily, requiredMinutes: 1 }, profile, now + 60_000, 0), false);
  assert.equal(quests.isCanonicalRecurringQuest({ ...weekly, skill: 'forged' }, profile, now + 60_000, 0), false);
  assert.equal(quests.isCanonicalRecurringQuest({ ...boss, requiredMinutes: 15 }, profile, now + 60_000, 0), false);
  assert.equal(quests.isCanonicalRecurringQuest(daily, profile, now + 86_400_000, 0), false);
  assert.equal(quests.isCanonicalRecurringQuest(boss, profile, now + 8 * 86_400_000, 0), false);
});

test('personal quest due dates accept a small clock skew and reject invalid or distant dates', () => {
  const now = Date.parse('2026-11-10T08:00:00Z');
  assert.equal(quests.isQuestDueAtValid(now - 60_000, now), true);
  assert.equal(quests.isQuestDueAtValid(now + 366 * 86_400_000 + 14 * 3_600_000, now), true);
  assert.equal(quests.isQuestDueAtValid(now - 86_400_001, now), false);
  assert.equal(quests.isQuestDueAtValid(now + 366 * 86_400_000 + 14 * 3_600_000 + 1, now), false);
  assert.equal(quests.isQuestDueAtValid('not-a-date', now), false);
});
