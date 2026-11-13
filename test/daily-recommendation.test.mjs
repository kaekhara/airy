import test from 'node:test';
import assert from 'node:assert/strict';
import daily from '../public/daily-recommendation.js';

const branches = [
  { id: 'code', name: 'Программирование' },
  { id: 'design', name: 'Дизайн' },
];
const skills = [
  { id: 'js', name: 'JavaScript', branch: 'code' },
  { id: 'css', name: 'CSS', branch: 'design' },
  { id: 'locked', name: 'Закрытый навык', branch: 'code' },
];
const base = {
  today: '2026-11-10', branches, skills, proofs: [], profile: {},
  skillXp: {}, unlockedSkills: ['js', 'css'],
};

test('recommends an available skill deterministically and in the selected locale', () => {
  const first = daily.buildDailyRecommendation(base);
  assert.equal(first.kind, 'start');
  assert.ok(['js', 'css'].includes(first.skillId));
  assert.equal(daily.buildDailyRecommendation(base).skillId, first.skillId);
  assert.match(daily.buildDailyRecommendation({ ...base, language: 'en' }).text, /Start small|picked|Try today/i);
  assert.match(daily.buildDailyRecommendation({ ...base, language: 'kk' }).text, /Баста|таңдадым|байқап көр/i);
});

test('favors a pinned branch and a favorite skill over unrelated new skills', () => {
  const result = daily.buildDailyRecommendation({
    ...base,
    profile: { pinnedBranches: ['design'], favoriteSkills: ['js'] },
    skillXp: { js: 40, css: 0 },
  });
  assert.equal(result.skillId, 'css');
});

test('does not recommend another practice after the user has practiced today', () => {
  const result = daily.buildDailyRecommendation({
    ...base,
    proofs: [{ skill: 'js', day: '2026-11-10', ts: Date.parse('2026-11-10T09:00:00Z') }],
  });
  assert.equal(result.kind, 'recovery');
  assert.equal(result.skillId, '');
});

test('recommends returning after a week away from the path', () => {
  const result = daily.buildDailyRecommendation({
    ...base,
    today: '2026-11-10',
    proofs: [{ skill: 'js', day: '2026-11-01', ts: Date.parse('2026-11-01T09:00:00Z') }],
    skillXp: { js: 20 },
    unlockedSkills: ['js'],
  });
  assert.equal(result.kind, 'return');
  assert.equal(result.skillId, 'js');
});

test('excludes locked and hidden skills', () => {
  const result = daily.buildDailyRecommendation({
    ...base,
    unlockedSkills: [],
    profile: { hiddenSkills: ['js', 'css'] },
  });
  assert.equal(result.kind, 'setup');
  assert.equal(result.skillId, '');
});

test('handles invalid proof timestamps without throwing', () => {
  assert.doesNotThrow(() => daily.buildDailyRecommendation({
    ...base, proofs: [{ skill: 'js', ts: Infinity }, { skill: 'css', ts: NaN }],
  }));
});
