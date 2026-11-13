import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const cache = loadTsModule('../lib/ai-generation-cache.ts');
const base = {
  uid: 'user-a', objective: 'Learn Python', language: 'en', progress: 'Python: level 2',
  branches: [{ id: 'python', name: 'Python', skillNames: ['Basics'] }],
};

test('skill draft cache fingerprint is stable and scoped to user, goal, language, and tree', () => {
  const key = cache.createSkillDraftCacheKey(base);
  assert.equal(key, cache.createSkillDraftCacheKey({ ...base, objective: '  LEARN PYTHON  ' }));
  assert.notEqual(key, cache.createSkillDraftCacheKey({ ...base, uid: 'user-b' }));
  assert.notEqual(key, cache.createSkillDraftCacheKey({ ...base, objective: 'Learn JavaScript' }));
  assert.notEqual(key, cache.createSkillDraftCacheKey({ ...base, language: 'ru' }));
  assert.notEqual(key, cache.createSkillDraftCacheKey({ ...base, progress: 'Python: level 3' }));
  assert.notEqual(key, cache.createSkillDraftCacheKey({ ...base, branches: [{ ...base.branches[0], skillNames: ['Basics', 'Async'] }] }));
});

test('skill draft cache rejects mismatched, malformed, and expired entries', () => {
  const draft = { place: 'python', skills: [] };
  const entry = { key: 'fingerprint', draft, expiresAtMs: 200 };
  assert.deepEqual(cache.readSkillDraftCache(entry, 'fingerprint', 199), draft);
  assert.equal(cache.readSkillDraftCache(entry, 'other', 199), null);
  assert.equal(cache.readSkillDraftCache(entry, 'fingerprint', 200), null);
  assert.equal(cache.readSkillDraftCache({ ...entry, expiresAtMs: 'later' }, 'fingerprint', 1), null);
  assert.equal(cache.readSkillDraftCache(null, 'fingerprint', 1), null);
});

test('quest draft cache fingerprint is scoped to the account, goal, language, and unlocked progress', () => {
  const input = {
    uid: 'user-a', objective: 'Practice Python', language: 'ru', includeProgress: true,
    skills: [{ id: 'python-basics', name: 'Основы Python', branch: 'python', branchName: 'Python', level: 2, xp: 140 }],
  };
  const key = cache.createQuestDraftCacheKey(input);
  assert.equal(key, cache.createQuestDraftCacheKey({ ...input, objective: '  PRACTICE PYTHON  ' }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({ ...input, uid: 'user-b' }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({ ...input, objective: 'Practice SQL' }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({ ...input, language: 'kk' }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({ ...input, includeProgress: false }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({
    ...input, skills: [{ ...input.skills[0], level: 3 }],
  }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({
    ...input, skills: [{ ...input.skills[0], xp: 160 }],
  }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({
    ...input, skills: [...input.skills, { id: 'python-async', name: 'Асинхронность', branch: 'python', branchName: 'Python', level: 1, xp: 0 }],
  }));
  assert.notEqual(key, cache.createQuestDraftCacheKey({
    ...input, skills: [{ ...input.skills[0], branchName: 'Разработка на Python' }],
  }));
});
