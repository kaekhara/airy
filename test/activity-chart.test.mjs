import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const chart = require('../public/activity-chart.js');

test('weekly chart returns seven local calendar days including today', () => {
  const now = new Date(2026, 10, 11, 19, 30).getTime();
  const result = chart.build(now, { '2026-11-05': 2, '2026-11-11': 3, '2026-11-12': 50 }, []);
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].key, '2026-11-05');
  assert.equal(result.days.at(-1).key, '2026-11-11');
  assert.equal(result.days.at(-1).today, true);
  assert.equal(result.days.at(-1).count, 3);
  assert.equal(result.total, 5);
});

test('weekly chart falls back to guest practice records and bounds corrupt values', () => {
  const now = new Date(2026, 10, 11, 12).getTime();
  const result = chart.build(now, {}, [
    { day: '2026-11-11' }, { day: '2026-11-11' }, { day: '2026-11-04' },
    { day: '2099-01-01' }, { day: 'not-a-date', ts: Number.NaN },
  ]);
  assert.equal(result.total, 2);
  assert.equal(result.days.at(-1).count, 2);
  assert.equal(result.days[0].count, 0);
});

test('weekly chart provides usable empty bars and localized weekday labels', () => {
  const result = chart.build(new Date(2026, 10, 11, 12).getTime(), {}, [], 'kk');
  assert.equal(result.total, 0);
  assert.ok(result.days.every((day) => day.height === 4));
  assert.ok(result.days.at(-1).dayLabel.length > 0);
});

test('monthly activity covers the last 30 local days and keeps practice totals bounded to that window', () => {
  const now = new Date(2026, 10, 11, 19, 30).getTime();
  const result = chart.build(now, { '2026-10-13': 4, '2026-10-14': 2, '2026-11-11': 3, '2026-11-12': 50 }, [] , 'ru', 30);
  assert.equal(result.days.length, 30);
  assert.equal(result.days[0].key, '2026-10-13');
  assert.equal(result.days.at(-1).key, '2026-11-11');
  assert.equal(result.days.at(-1).today, true);
  assert.equal(result.total, 9);
});

test('monthly activity falls back to local guest proofs and keeps a day label for the heatmap', () => {
  const now = new Date(2026, 10, 11, 12).getTime();
  const result = chart.build(now, {}, [{ day: '2026-11-01' }, { day: '2026-11-11' }, { day: '2026-11-11' }], 'en', 30);
  assert.equal(result.days.length, 30);
  assert.equal(result.total, 3);
  assert.equal(result.days[0].day, 13);
  assert.equal(result.days.at(-1).day, 11);
  assert.ok(result.days.at(-1).dateLabel.includes('Nov'));
});

