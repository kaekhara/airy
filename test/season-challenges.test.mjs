import test from 'node:test';
import assert from 'node:assert/strict';
import seasonChallenges from '../public/season-challenges.js';

test('season windows use calendar quarters and expose a stable season id', () => {
  const winter = seasonChallenges.currentSeason(new Date(2026, 0, 10, 12).getTime());
  assert.deepEqual({ id: winter.id, name: winter.name, start: winter.start, end: winter.end }, {
    id: '2026-Q1', name: 'Зима 2026', start: '2026-01-01', end: '2026-03-31',
  });
  const spring = seasonChallenges.currentSeason(new Date(2026, 3, 1, 12).getTime());
  assert.equal(spring.name, 'Весна 2026');
  assert.equal(spring.start, '2026-04-01');
});

test('season challenges use real proof totals without requiring daily activity', () => {
  const now = new Date(2026, 1, 20, 12).getTime();
  const proofs = [
    ...Array.from({ length: 12 }, (_, index) => ({ day: `2026-02-${String(index + 1).padStart(2, '0')}`, skill: index % 2 ? 'py-base' : 'cyber-net', xp: 50 })),
    { day: '2025-12-31', skill: 'db-sql', xp: 10_000 },
  ];
  const result = seasonChallenges.build(now, proofs, null, { 'py-base': 'py', 'cyber-net': 'cyber', 'db-sql': 'db' });
  assert.deepEqual(result.metrics, { practices: 12, xp: 600, branches: 2 });
  assert.deepEqual(result.challenges.map(({ done }) => done), [true, false, true]);
});

test('season summary metrics include branches and ignore dates outside this season', () => {
  const now = new Date(2026, 6, 12, 12).getTime();
  const summary = {
    version: 5,
    dayCounts: { '2026-07-01': 4, '2026-09-30': 8, '2026-10-01': 100 },
    dayXp: { '2026-07-01': 100, '2026-09-30': 500, '2026-10-01': 99_999 },
    dayBranchXp: { '2026-07-01': { py: 100, cyber: 1 }, '2026-09-30': { db: 1 }, '2026-10-01': { art: 1 } },
  };
  const result = seasonChallenges.build(now, [], summary);
  assert.deepEqual(result.metrics, { practices: 12, xp: 600, branches: 3 });
  assert.equal(result.season.end, '2026-09-30');
});

test('season summary accepts current RPG summary version 7', () => {
  const now = new Date(2026, 10, 11, 12).getTime();
  const summary = {
    version: 7,
    dayCounts: { '2026-10-01': 40, '2026-11-10': 2, '2026-07-01': 100 },
    dayXp: { '2026-10-01': 800, '2026-11-10': 30, '2026-07-01': 9_999 },
    dayBranchXp: { '2026-10-01': { py: 5 }, '2026-11-10': { cyber: 2 }, '2026-07-01': { db: 1 } },
  };
  const result = seasonChallenges.build(now, [{ day: '2026-11-11', skill: 'ios-ui', xp: 10 }], summary);
  assert.deepEqual(result.metrics, { practices: 42, xp: 830, branches: 2 });
  assert.equal(result.season.id, '2026-Q4');
});
