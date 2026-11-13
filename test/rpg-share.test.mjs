import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './load-ts.mjs';

const share = loadTsModule('../lib/rpg-share.ts');

test('share reward identity is stable within a UTC day and changes at UTC midnight', () => {
  const beforeMidnight = Date.parse('2026-11-10T23:59:59.000Z');
  const stillSameDay = Date.parse('2026-11-10T23:59:59.999Z');
  const afterMidnight = Date.parse('2026-11-11T00:00:00.000Z');
  assert.equal(share.shareRewardEventId(beforeMidnight), share.shareRewardEventId(stillSameDay));
  assert.notEqual(share.shareRewardEventId(beforeMidnight), share.shareRewardEventId(afterMidnight));
});

test('share reward identity rejects invalid timestamps', () => {
  assert.throws(() => share.shareRewardEventId(Number.NaN), /INVALID_SHARE_TIME/);
});

test('share endpoint uses a server-derived daily key instead of caller event ids', () => {
  const route = readFileSync(new URL('../app/api/rpg/share/route.ts', import.meta.url), 'utf8');
  assert.match(route, /doc\(shareRewardEventId\(now\)\)/);
  assert.doesNotMatch(route, /body\.eventId/);
});
