import test from 'node:test';
import assert from 'node:assert/strict';
import milestones from '../public/rpg-milestones.js';

const catalog = [
  { id: 'first-practice', n: 'Первый шаг', g: '✎' },
  { id: 'streak', n: 'Ритм', g: '✿' },
];

test('new achievements take priority and are combined into a single celebration', () => {
  const event = milestones.pick({ ach: [], tl: { L: 1 } }, { ach: ['first-practice', 'streak'], tl: { L: 2 } }, catalog);
  assert.deepEqual(event, { kind: 'award', icon: '✎', message: 'Первый шаг · и ещё 1' });
});

test('account and branch level-ups are celebrated when no achievement unlocked', () => {
  const event = milestones.pick(
    { ach: [], tl: { L: 1 }, bl: { cyber: { L: 1 } } },
    { ach: [], tl: { L: 1 }, bl: { cyber: { L: 2 } } },
    catalog,
    { cyber: 'Кибербезопасность' },
  );
  assert.deepEqual(event, { kind: 'level', icon: '2', message: 'Новое мастерство направления Кибербезопасность: 1 → 2' });
});

test('no celebration is emitted without a newly earned milestone', () => {
  const stats = { ach: ['first-practice'], tl: { L: 1 }, bl: { cyber: { L: 1 } }, sl: { 'cyber-net': { L: 1 } } };
  assert.equal(milestones.pick(stats, stats, catalog), null);
});
