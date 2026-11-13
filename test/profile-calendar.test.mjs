import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const calendar = require('../public/profile-calendar.js');

test('profile calendar covers 365 consecutive local dates and marks today', () => {
  const now = new Date(2026, 10, 12, 19, 30).getTime();
  const result = calendar.build({ byDay: new Map() }, now, 'ru');
  assert.equal(result.days.length, 365);
  assert.equal(new Set(result.days.map((day) => day.key)).size, 365);
  assert.equal(result.days.filter((day) => day.today).length, 1);
  assert.equal(result.days.at(-1).key, '2026-11-12');
  assert.equal(result.offset, (result.days[0].date.getDay() + 6) % 7);
});

test('profile calendar localizes descriptions, weekdays and summary', () => {
  const now = new Date(2026, 10, 12, 12).getTime();
  const stats = { streak: 3, byDay: new Map([['2026-11-12', { n: 2, xp: 24 }]]) };
  const russian = calendar.build(stats, now, 'ru');
  const english = calendar.build(stats, now, 'en');
  const kazakh = calendar.build(stats, now, 'kk');
  assert.match(russian.days.at(-1).description, /2 практики, 24 XP/);
  assert.match(english.days.at(-1).description, /2 practices, 24 XP/);
  assert.match(kazakh.days.at(-1).description, /2 жаттығу, 24 XP/);
  assert.match(russian.summary, /3 дня/);
  assert.match(english.summary, /streak 3 days/);
  assert.notDeepEqual(russian.weekdayMarks, english.weekdayMarks);
});

test('profile calendar reuses the rendered model until activity, streak or locale changes', () => {
  const now = new Date(2026, 10, 12, 12).getTime();
  const stats = { streak: 2, byDay: new Map([['2026-11-12', { n: 1, xp: 10 }]]) };
  const first = calendar.build(stats, now, 'ru');
  assert.equal(calendar.build(stats, now, 'ru'), first);
  assert.notEqual(calendar.build(stats, now, 'en'), first);
  stats.streak = 4;
  assert.notEqual(calendar.build(stats, now, 'ru'), first);
  stats.byDay.set('2026-11-11', { n: 3, xp: 30 });
  const changed = calendar.build(stats, now, 'ru');
  assert.notEqual(changed, first);
  assert.equal(changed.days.find((day) => day.key === '2026-11-11').level, 3);
});

test('profile calendar bounds malformed activity values and rejects invalid dates', () => {
  const now = new Date(2026, 10, 12, 12).getTime();
  const result = calendar.build({ streak: Infinity, byDay: new Map([['2026-11-12', { n: 9e9, xp: 9e12 }]]) }, now, 'ru');
  assert.equal(result.streak, 0);
  assert.equal(result.days.at(-1).count, 100_000);
  assert.equal(result.days.at(-1).xp, 100_000_000);
  assert.throws(() => calendar.build({}, Number.NaN, 'ru'), /INVALID_DATE/);
});
