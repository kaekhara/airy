import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/achievement-catalog.js';
import { loadTsModule } from './load-ts.mjs';

const rpg = loadTsModule('../lib/rpg-engine.ts');

test('server XP formula matches the client catalog for difficulty and evidence', () => {
  const cases = [
    { minutes: 30, hasLink: false, imageCount: 0, textLength: 0, difficulty: 1 },
    { minutes: 60, hasLink: true, imageCount: 1, textLength: 100, difficulty: 4, questBonus: 10, streakBonus: 5 },
    { minutes: 600, hasLink: false, imageCount: 2, textLength: 60, difficulty: 5 },
  ];
  for (const input of cases) {
    assert.equal(
      rpg.practiceXp(input),
      catalog.practiceXp({ min: input.minutes, link: input.hasLink, imgs: input.imageCount, len: input.textLength, difficulty: input.difficulty, questBonus: input.questBonus, streakBonus: input.streakBonus }),
    );
  }
});

test('editing an existing practice never changes the XP already awarded', () => {
  assert.equal(rpg.practiceEditXp(42, 500), 42);
  assert.equal(rpg.practiceEditXp('42', 500), 42);
  assert.equal(rpg.practiceEditXp(undefined, 37), 37);
  assert.equal(rpg.practiceEditXp(-1, 37), 37);
});

test('streak XP is only awarded when practice advances the latest active date', () => {
  assert.equal(rpg.dailyStreakBonus('2026-11-12', '2026-11-12', 4), 0);
  assert.equal(rpg.dailyStreakBonus('2026-11-11', '2026-11-12', 4), 0);
  assert.equal(rpg.dailyStreakBonus('2026-11-13', '2026-11-12', 4), 5);
  assert.equal(rpg.dailyStreakBonus('2026-11-15', '2026-11-12', 4), 1);
  assert.equal(rpg.dailyStreakBonus('2026-11-13', '2026-11-12', 99), 10);
  assert.equal(rpg.dailyStreakBonus('not-a-date', '2026-11-12', 4), 0);
});

test('branch unlock checks require both level and every prerequisite', () => {
  const base = { branchXp: 100, requiredBranchLevel: 3, prerequisites: ['first-skill'], skillXp: { 'first-skill': 1 } };
  assert.equal(rpg.isSkillUnlocked(base), true);
  assert.equal(rpg.isSkillUnlocked({ ...base, branchXp: 99 }), false);
  assert.equal(rpg.isSkillUnlocked({ ...base, skillXp: {} }), false);
});

test('skill dependency graph rejects cycles, self-links, duplicate and unknown edges', () => {
  const ids = ['base', 'custom-a', 'custom-b'];
  assert.equal(rpg.isSkillGraphAcyclic([{ id: 'custom-a', prerequisites: ['base'] }, { id: 'custom-b', prerequisites: ['custom-a'] }], ids), true);
  assert.equal(rpg.isSkillGraphAcyclic([{ id: 'custom-a', prerequisites: ['custom-b'] }, { id: 'custom-b', prerequisites: ['custom-a'] }], ids), false);
  assert.equal(rpg.isSkillGraphAcyclic([{ id: 'custom-a', prerequisites: ['custom-a'] }], ids), false);
  assert.equal(rpg.isSkillGraphAcyclic([{ id: 'custom-a', prerequisites: ['missing'] }], ids), false);
  assert.equal(rpg.isSkillGraphAcyclic([{ id: 'custom-a', prerequisites: ['base', 'base'] }], ids), false);
});

test('daily, weekly and boss quests enforce skill, time, evidence, expiry and one-time completion', () => {
  const check = (patch = {}) => rpg.questEligibility({
    quest: { skill: 'cyber', requiredMinutes: 15, requiresEvidence: true, expiresAt: 2_000, done: false, ...patch },
    skillId: 'cyber-net', branchId: 'cyber', now: 1_000, minutes: 30, hasEvidence: true,
  });
  assert.equal(check(), 'ok');
  assert.equal(check({ done: true }), 'done');
  assert.equal(check({ done: false, completedInHistory: true }), 'done');
  assert.equal(check({ expiresAt: 999 }), 'expired');
  assert.equal(check({ skill: 'py' }), 'skill');
  assert.equal(check({ requiredMinutes: 45 }), 'minutes');
  assert.equal(check({ requiresEvidence: false }), 'ok');
  assert.equal(rpg.questEligibility({
    quest: { skill: 'cyber', requiresEvidence: true }, skillId: 'cyber-net', branchId: 'cyber', now: 1, minutes: 20, hasEvidence: false,
  }), 'evidence');
  assert.equal(rpg.questEligibility({
    quest: { skill: 'cyber', requiredMinutes: 60, requiresEvidence: true }, skillId: 'cyber-net', branchId: 'cyber', now: 1_000, minutes: 45, hasEvidence: true,
  }), 'minutes');
  assert.equal(rpg.questEligibility({
    quest: { skill: 'cyber', requiredMinutes: 60, requiresEvidence: true }, skillId: 'cyber-net', branchId: 'cyber', now: 1_000, minutes: 60, hasEvidence: false,
  }), 'evidence');
});

test('personal quest deadline applies through the selected calendar day and then requires rescheduling', () => {
  const dueAt = Date.UTC(2026, 10, 12, 12);
  const check = (now, patch = {}) => rpg.questEligibility({
    quest: { skill: 'cyber', requiredMinutes: 15, dueAt, done: false, ...patch },
    skillId: 'cyber-net', branchId: 'cyber', now, minutes: 30, hasEvidence: false,
  });
  assert.equal(check(dueAt), 'ok');
  assert.equal(check(dueAt + 12 * 60 * 60 * 1_000), 'ok');
  assert.equal(check(dueAt + 12 * 60 * 60 * 1_000 + 1), 'expired');
  assert.equal(check(dueAt + 2 * 86_400_000, { completedInHistory: true }), 'done');
});

test('editing a completed quest proof cannot bypass its skill, time, or evidence requirements', () => {
  const check = (patch = {}) => rpg.questEditEligibility({
    questSkill: 'cyber', skillId: 'cyber-net', branchId: 'cyber', requiredMinutes: 30,
    requiresEvidence: true, minutes: 30, hasEvidence: true, ...patch,
  });
  assert.equal(check(), 'ok');
  assert.equal(check({ skillId: 'py-base', branchId: 'py' }), 'skill');
  assert.equal(check({ minutes: 20 }), 'minutes');
  assert.equal(check({ hasEvidence: false }), 'evidence');
  assert.equal(rpg.questEditEligibility({ questSkill: 'cyber-net', skillId: 'cyber-net', branchId: 'cyber', requiredMinutes: 0, requiresEvidence: false, minutes: 5, hasEvidence: false }), 'ok');
});
