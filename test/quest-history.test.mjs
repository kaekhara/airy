import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { appendQuestCompletion, archiveCompletedQuests } = loadTsModule('../lib/quest-history.ts');

test('quest completion history stores a sanitized, bounded record', () => {
  const rows = appendQuestCompletion([], { id: 'quest-1', skill: 'python', period: 'daily', title: '  Повтори тему  ' }, 'event-12345678', 1_000);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{
    id: 'quest-1', skill: 'python', period: 'daily', title: 'Повтори тему', completedAt: 1_000, eventId: 'event-12345678', xp: 10,
  }]);
});

test('quest completion history is idempotent by quest id and event id', () => {
  const first = appendQuestCompletion([], { id: 'quest-1', skill: 'python' }, 'event-12345678', 1_000);
  assert.equal(appendQuestCompletion(first, { id: 'quest-1', skill: 'python' }, 'event-abcdefgh', 2_000).length, 1);
  assert.equal(appendQuestCompletion(first, { id: 'quest-2', skill: 'python' }, 'event-12345678', 2_000).length, 1);
});

test('boss challenge completion is retained as a distinct archive period', () => {
  const rows = appendQuestCompletion([], { id: 'boss-week-1', skill: 'cyber', period: 'boss', title: 'Boss Challenge' }, 'event-boss1234', 5_000, 10);
  assert.equal(rows[0].period, 'boss');
  assert.equal(rows[0].xp, 10);
});

test('quest archive preserves repeat requirements and clamps untrusted metadata', () => {
  const completed = appendQuestCompletion([], {
    id: 'quest-req-1', skill: 'python', period: 'personal', title: 'Practice',
    requiredMinutes: 45, requiresEvidence: true,
  }, 'event-req-12345', 5_000, 14);
  assert.equal(completed[0].requiredMinutes, 45);
  assert.equal(completed[0].requiresEvidence, true);
  assert.equal(completed[0].xp, 14);

  const withOldRecord = appendQuestCompletion([{
    id: 'old-quest', eventId: 'event-old-123456', skill: 'python', title: 'Old',
    period: 'personal', completedAt: 4_000,
  }], { id: 'quest-req-2', skill: 'python', requiredMinutes: 9999, requiresEvidence: false }, 'event-req-67890', 6_000);
  assert.equal(withOldRecord[0].xp, 10, 'legacy records retain their historical default reward');
  assert.equal(withOldRecord[1].requiredMinutes, 600);
  assert.equal(Object.hasOwn(withOldRecord[1], 'requiresEvidence'), false);
});

test('quest history rejects malformed entries and keeps only the newest 500', () => {
  const oldRows = Array.from({ length: 501 }, (_, index) => ({
    id: `quest-${index}`, eventId: `event-${String(index).padStart(8, '0')}`, skill: 'python',
    title: `Quest ${index}`, period: 'weekly', completedAt: index + 1, xp: 999,
  }));
  const rows = appendQuestCompletion([...oldRows, { id: 'bad', eventId: 'oops' }], { id: 'quest-new', skill: 'python' }, 'event-new1234', 2_000);
  assert.equal(rows.length, 500);
  assert.equal(rows.at(-1).id, 'quest-new');
  assert.equal(rows[0].id, 'quest-2');
  assert.equal(rows.every((row) => row.xp <= 100), true);
  assert.equal(rows.at(-1).xp, 10);
});

test('invalid new completion data cannot create a history record', () => {
  assert.equal(appendQuestCompletion([], { id: '../quest', skill: 'python' }, 'event-12345678').length, 0);
  assert.equal(appendQuestCompletion([], { id: 'quest-1', skill: 'python' }, 'short').length, 0);
});

test('legacy completed quests migrate idempotently into the bounded archive history', () => {
  const quests = [
    { id: 'legacy-personal-01', skill: 'py-base', title: 'Старый личный квест', period: 'personal', done: true, completedAt: 2_000, requiredMinutes: 25 },
    { id: 'legacy-boss-01', skill: 'cyber', title: 'Старое испытание', period: 'boss', done: true, completedAt: 3_000 },
    { id: 'still-active-01', skill: 'py-base', title: 'Активный квест', period: 'personal', done: false },
  ];
  const first = archiveCompletedQuests([], quests, 4_000);
  assert.deepEqual(JSON.parse(JSON.stringify(first.map((item) => [item.id, item.period, item.xp]))), [
    ['legacy-personal-01', 'personal', 0], ['legacy-boss-01', 'boss', 10],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(archiveCompletedQuests(first, quests, 5_000))), JSON.parse(JSON.stringify(first)));
  assert.equal(archiveCompletedQuests(first, quests, 5_000).length, 2);
});
