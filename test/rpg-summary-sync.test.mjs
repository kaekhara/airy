import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/rpg-summary-sync.js', import.meta.url), 'utf8');
function syncHarness() {
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AiryRpgSummarySync.createRpgSummarySync();
}

test('RPG summary revision changes only for server-owned progress markers', () => {
  const sync = syncHarness();
  const before = { name: 'Alex', theme: 'night', lastRpgEventAt: 10, rpgSummaryUpdatedAt: 20 };
  assert.equal(sync.changed(before, { ...before, name: 'Sam' }), false);
  assert.equal(sync.changed(before, { ...before, theme: 'day' }), false);
  assert.equal(sync.changed(before, { ...before, lastRpgEventAt: 11 }), true);
  assert.equal(sync.changed(before, { ...before, rpgSummaryUpdatedAt: 21 }), true);
  assert.equal(sync.changed(before, { ...before, rpgSummaryNeedsRebuild: true }), true);
});

test('summary request tickets reject stale responses and signed-out account scopes', () => {
  const sync = syncHarness();
  sync.setScope('user-a');
  const oldRequest = sync.begin('user-a');
  const freshRequest = sync.begin('user-a');
  assert.equal(sync.isCurrent('user-a', oldRequest), false);
  assert.equal(sync.isCurrent('user-a', freshRequest), true);
  sync.setScope('user-b');
  assert.equal(sync.isCurrent('user-a', freshRequest), false);
  assert.equal(sync.begin('user-a'), null);
  const currentRequest = sync.begin('user-b');
  sync.invalidate();
  assert.equal(sync.isCurrent('user-b', currentRequest), false);
  const mutationRace = sync.begin('user-b');
  sync.setScope('guest');
  assert.equal(sync.isCurrent('user-b', mutationRace), false);
});
