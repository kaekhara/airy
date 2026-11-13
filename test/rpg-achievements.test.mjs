import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import catalog from '../public/achievement-catalog.js';
import { loadTsModule } from './load-ts.mjs';

const rpg = loadTsModule('../lib/rpg-engine.ts');
const imageEvidence = loadTsModule('../lib/image-evidence.ts');
const engine = loadTsModule('../lib/rpg-achievements.ts', {
  '@/lib/rpg-engine': rpg,
  '@/lib/image-evidence': imageEvidence,
  '@/public/achievement-catalog.js': catalog,
});

test('evidence metrics ignore unverified attachment IDs and accept embedded image payloads', () => {
  const summary = engine.buildRpgSummary([
    { id: 'legacy-id', skill: 'cyber-net', xp: 10, branchXp: 4, imgs: [{ id: 'looks-like-an-image' }], day: '2026-11-10', ts: 1, min: 10 },
    { id: 'embedded-image', skill: 'cyber-net', xp: 10, branchXp: 4, imgs: [{ d: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAP/b' }], day: '2026-11-10', ts: 2, min: 10 },
  ]);

  assert.equal(imageEvidence.hasEmbeddedImageEvidence([{ id: 'looks-like-an-image' }]), false);
  assert.equal(imageEvidence.countEmbeddedImageEvidence([{ id: 'looks-like-an-image' }]), 0);
  assert.equal(summary.proofCount, 1);
});

test('achievement metrics ignore archived skills for active-skill milestones', () => {
  const proofs = [
    { skill: 'cyber-net', xp: 40, branchXp: 16, day: '2026-11-09', ts: Date.parse('2026-11-09T08:00:00Z'), min: 30 },
    { skill: 'custom-hidden', xp: 80, branchXp: 0, day: '2026-11-10', ts: Date.parse('2026-11-10T08:00:00Z'), min: 30 },
  ];
  const metrics = engine.achievementMetrics(proofs, { hiddenSkills: ['custom-hidden'] });
  assert.equal(metrics.used, 1);
  assert.equal(metrics.touched, 1);
  assert.equal(metrics.total, 120);
  assert.equal(metrics.best, 2);
});

test('achievement unlocks are event driven and idempotent by achievement ID', () => {
  const proofs = [{ skill: 'cyber-net', xp: 50, branchXp: 20, day: '2026-11-10', ts: Date.parse('2026-11-10T08:00:00Z'), min: 30 }];
  const first = engine.unlockEligibleAchievements(proofs, {}, 1234);
  assert.ok(first.fresh.some((award) => award.id === 'entries-1'));
  assert.equal(first.ledger['entries-1'].at, 1234);
  const second = engine.unlockEligibleAchievements(proofs, { achievementUnlocks: first.ledger, unlockedTitles: first.titles }, 5678);
  assert.equal(second.fresh.some((award) => award.id === 'entries-1'), false);
  assert.equal(second.ledger['entries-1'].at, 1234);
  assert.equal(new Set(second.fresh.map((award) => award.id)).size, second.fresh.length);
  assert.equal(catalog.length >= 100, true);
});

test('friendship milestones use the server-owned distinct-friend metric', () => {
  assert.equal(engine.achievementMetrics([], { friendCount: 3 }).friendCount, 3);
  const first = engine.unlockEligibleMetricAchievements('friendCount', 3, { friendCount: 3 }, 777);
  assert.equal(first.fresh.filter((award) => award.id.startsWith('friends-')).map((award) => award.id).join(','), 'friends-1,friends-3');
  assert.equal(first.fresh.some((award) => award.id === 'friends-10'), false);
  const repeated = engine.unlockEligibleMetricAchievements('friendCount', 3, { friendCount: 3, achievementUnlocks: first.ledger }, 999);
  assert.equal(repeated.fresh.some((award) => award.id.startsWith('friends-')), false);
});

test('RPG summary backfill and incremental update match full-history metrics', () => {
  const history = [
    { skill: 'cyber-net', xp: 35, branchXp: 14, day: '2026-11-08', ts: Date.parse('2026-11-08T08:00:00Z'), min: 25, h: 8, utcOffsetMinutes: 0, link: '' },
    { skill: 'py-base', xp: 48, branchXp: 19, day: '2026-11-09', ts: Date.parse('2026-11-09T08:00:00Z'), min: 35, h: 8, utcOffsetMinutes: 0, quest: 'q1' },
  ];
  const profile = {};
  const summary = engine.buildRpgSummary(history, profile);
  const next = { skill: 'cyber-net', xp: 52, branchXp: 21, day: '2026-11-10', ts: Date.parse('2026-11-10T08:00:00Z'), min: 40, h: 8, utcOffsetMinutes: 0, imgs: [{ id: 'proof' }] };
  const updated = engine.addProofToRpgSummary(summary, next, profile);
  const actual = engine.achievementMetricsFromSummary(updated, profile);
  const expected = engine.achievementMetrics([...history, next], profile);
  for (const key of ['count', 'total', 'minutes', 'proofCount', 'nightCount', 'morningCount', 'weekendCount', 'activeDays', 'questsCompleted', 'used', 'touched', 'maxB', 'advUnlocked', 'best']) {
    assert.equal(actual[key], expected[key], key);
  }
  assert.equal(JSON.stringify(actual.branchLevels), JSON.stringify(expected.branchLevels));
  assert.equal(JSON.stringify(updated.skillXp), JSON.stringify({ 'cyber-net': 87, 'py-base': 48 }));
});

test('streaming RPG summary builder matches array rebuild across unordered proofs and profile branches', () => {
  const profile = {
    customBranches: [{ id: 'cb-security' }],
    customLeaves: [{ id: 'cb-threat-model', branch: 'cb-security', req: 2, prerequisites: [] }],
  };
  const proofs = [
    { skill: 'cb-threat-model', xp: 52, branchXp: 21, day: '2026-11-10', ts: Date.parse('2026-11-10T16:00:00Z'), min: 35, h: 23, utcOffsetMinutes: 360, quest: 'weekly-1', link: 'https://example.com' },
    { skill: 'cyber-net', xp: 31, branchXp: 12, day: '2026-11-08', ts: Date.parse('2026-11-08T08:00:00Z'), min: 20, h: 8, utcOffsetMinutes: 0 },
    { skill: 'cb-security', xp: 44, branchXp: 44, day: '2026-11-09', ts: Date.parse('2026-11-09T04:00:00Z'), min: 25, h: 4, utcOffsetMinutes: 360, quest: 'weekly-1', imgs: [{ d: 'data:image/png;base64,iVBORw0KGgo=' }] },
    { skill: 'py-base', xp: 17, branchXp: 7, day: '2026-11-10', ts: Date.parse('2026-11-10T10:00:00Z'), min: 12, h: 10, utcOffsetMinutes: 0, quest: 'daily-1' },
  ];
  const expected = engine.buildRpgSummary(proofs, profile);
  const builder = engine.createRpgSummaryBuilder(profile);
  for (const proof of [...proofs].reverse()) builder.add(proof);
  assert.deepEqual(builder.finish(), expected);
  assert.equal(builder.finish(), builder.finish(), 'finish is stable when called more than once');
  assert.throws(() => builder.add(proofs[0]), /SUMMARY_BUILDER_FINALIZED/);
});

test('editing or deleting a proof rebuilds XP, streak and branch totals from the remaining events', () => {
  const history = [
    { id: 'event-a', skill: 'cyber-net', xp: 30, branchXp: 12, day: '2026-11-08', ts: Date.parse('2026-11-08T08:00:00Z'), min: 20, h: 8, utcOffsetMinutes: 0 },
    { id: 'event-b', skill: 'cyber-net', xp: 45, branchXp: 18, day: '2026-11-09', ts: Date.parse('2026-11-09T08:00:00Z'), min: 30, h: 8, utcOffsetMinutes: 0, quest: 'q-1' },
    { id: 'event-c', skill: 'py-base', xp: 50, branchXp: 20, day: '2026-11-10', ts: Date.parse('2026-11-10T08:00:00Z'), min: 35, h: 8, utcOffsetMinutes: 0 },
  ];
  const edited = { ...history[1], skill: 'py-base', xp: 25, branchXp: 10, min: 15 };
  const editedSummary = engine.rebuildRpgSummaryAfterMutation(history, 'event-b', edited, {});
  const editedExpected = engine.achievementMetrics([history[0], edited, history[2]], {});
  const editedActual = engine.achievementMetricsFromSummary(editedSummary, {});
  for (const key of ['count', 'total', 'minutes', 'activeDays', 'questsCompleted', 'best', 'used']) assert.equal(editedActual[key], editedExpected[key], `edited ${key}`);
  assert.equal(JSON.stringify(editedSummary.branchXp), JSON.stringify({ cyber: 12, py: 30 }));

  const deletedSummary = engine.rebuildRpgSummaryAfterMutation(history, 'event-b', null, {});
  const deletedExpected = engine.achievementMetrics([history[0], history[2]], {});
  const deletedActual = engine.achievementMetricsFromSummary(deletedSummary, {});
  for (const key of ['count', 'total', 'minutes', 'activeDays', 'questsCompleted', 'best', 'used']) assert.equal(deletedActual[key], deletedExpected[key], `deleted ${key}`);
  assert.equal(JSON.stringify(deletedSummary.branchXp), JSON.stringify({ cyber: 12, py: 20 }));
});

test('version 7 summaries track lifetime totals and bounded daily analytics through edits and deletes', () => {
  const history = [
    { id: 'event-a', skill: 'cyber-net', xp: 25, branchXp: 10, day: '2026-11-07', ts: Date.parse('2026-11-07T08:00:00Z'), min: 15, h: 8, utcOffsetMinutes: 0, quest: 'q-a' },
    { id: 'event-b', skill: 'cyber-net', xp: 30, branchXp: 12, day: '2026-11-08', ts: Date.parse('2026-11-08T08:00:00Z'), min: 20, h: 8, utcOffsetMinutes: 0, quest: 'q-b' },
    { id: 'event-c', skill: 'py-base', xp: 35, branchXp: 14, day: '2026-11-08', ts: Date.parse('2026-11-08T12:00:00Z'), min: 25, h: 12, utcOffsetMinutes: 0, quest: 'q-b' },
    { id: 'event-d', skill: 'cyber-net', xp: 40, branchXp: 16, day: '2026-11-09', ts: Date.parse('2026-11-09T08:00:00Z'), min: 30, h: 8, utcOffsetMinutes: 0 },
  ];
  const initial = engine.buildRpgSummary(history);
  assert.equal(initial.version, 7);
  assert.equal(JSON.stringify(initial.dayCounts), JSON.stringify({ '2026-11-07': 1, '2026-11-08': 2, '2026-11-09': 1 }));
  assert.equal(JSON.stringify(initial.dayXp), JSON.stringify({ '2026-11-07': 25, '2026-11-08': 65, '2026-11-09': 40 }));
  assert.equal(JSON.stringify(initial.dayMinutes), JSON.stringify({ '2026-11-07': 15, '2026-11-08': 45, '2026-11-09': 30 }));
  assert.equal(JSON.stringify(initial.dayBranchXp), JSON.stringify({ '2026-11-07': { cyber: 10 }, '2026-11-08': { cyber: 12, py: 14 }, '2026-11-09': { cyber: 16 } }));
  assert.equal('questCounts' in initial, false);

  for (const [eventId, replacement, remaining] of [
    ['event-c', null, history.filter((proof) => proof.id !== 'event-c')],
    ['event-b', { ...history[1], skill: 'py-base', day: '2026-11-10', xp: 21, branchXp: 8, min: 15, quest: '' }, [history[0], history[2], history[3], { ...history[1], skill: 'py-base', day: '2026-11-10', xp: 21, branchXp: 8, min: 15, quest: '' }]],
    ['event-a', null, history.filter((proof) => proof.id !== 'event-a')],
  ]) {
    const removed = history.find((proof) => proof.id === eventId);
    const questStillCompleted = Boolean(removed.quest && history.some((proof) => proof.id !== eventId && proof.quest === removed.quest));
    const actual = engine.mutateRpgSummary(initial, removed, replacement, {}, { questStillCompleted });
    const expected = engine.buildRpgSummary(remaining, {});
    for (const key of ['count', 'total', 'minutes', 'proofCount', 'nightCount', 'morningCount', 'weekendCount', 'activeDays', 'questsCompleted', 'currentStreak', 'lastDay']) assert.equal(actual[key], expected[key], `${eventId} ${key}`);
    assert.ok(actual.best >= expected.best, `${eventId} best streak remains a lifetime record`);
    assert.equal(JSON.stringify(actual.dayCounts), JSON.stringify(expected.dayCounts), `${eventId} dayCounts`);
    assert.equal(JSON.stringify(actual.dayXp), JSON.stringify(expected.dayXp), `${eventId} dayXp`);
    assert.equal(JSON.stringify(actual.dayMinutes), JSON.stringify(expected.dayMinutes), `${eventId} dayMinutes`);
    assert.equal(JSON.stringify(actual.dayBranchXp), JSON.stringify(expected.dayBranchXp), `${eventId} dayBranchXp`);
    assert.equal(actual.questsCompleted, expected.questsCompleted, `${eventId} distinct quests`);
    assert.equal(JSON.stringify(actual.skillXp), JSON.stringify(expected.skillXp), `${eventId} skillXp`);
    assert.equal(JSON.stringify(actual.branchXp), JSON.stringify(expected.branchXp), `${eventId} branchXp`);
  }
});

test('all per-day analytics are bounded while lifetime totals and streak stay complete', () => {
  const history = Array.from({ length: 430 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index));
    const day = date.toISOString().slice(0, 10);
    return { id: `event-${index}`, skill: 'cyber-net', xp: 10, branchXp: 4, day, ts: date.getTime(), min: 5, h: 12, utcOffsetMinutes: 0 };
  });
  const summary = engine.buildRpgSummary(history);
  const earliest = history[0].day;
  assert.equal(Object.keys(summary.dayBranchXp).length, 400);
  assert.equal(Object.keys(summary.dayCounts).length, 400);
  assert.equal(Object.keys(summary.dayXp).length, 400);
  assert.equal(Object.keys(summary.dayMinutes).length, 400);
  assert.equal(summary.dayBranchXp[earliest], undefined);
  assert.equal(summary.dayCounts[earliest], undefined);
  assert.equal(summary.dayXp[earliest], undefined);
  assert.equal(summary.dayMinutes[earliest], undefined);
  assert.equal(summary.total, 4_300);
  assert.equal(summary.branchXp.cyber, 1_720);
  assert.equal(summary.activeDays, 430);
  assert.equal(summary.currentStreak, 430);
  assert.equal(summary.best, 430);
});

test('incremental summary keeps active days unique when adding and removing same-day proofs', () => {
  const day = '2026-11-10';
  const first = { id: 'event-first', skill: 'cyber-net', xp: 10, branchXp: 4, day, ts: Date.parse(`${day}T08:00:00Z`), min: 10, h: 8, utcOffsetMinutes: 0 };
  const second = { id: 'event-second', skill: 'py-base', xp: 12, branchXp: 5, day, ts: Date.parse(`${day}T12:00:00Z`), min: 15, h: 12, utcOffsetMinutes: 0 };
  const one = engine.buildRpgSummary([first]);
  const two = engine.addProofToRpgSummary(one, second);
  assert.equal(two.activeDays, 1);
  assert.equal(two.currentStreak, 1);
  assert.equal(two.dayCounts[day], 2);
  const afterDelete = engine.removeProofFromRpgSummary(two, second);
  assert.equal(afterDelete.activeDays, 1);
  assert.equal(afterDelete.currentStreak, 1);
  assert.equal(afterDelete.dayCounts[day], 1);
});

test('deleting the only proof on a date breaks the active streak at the gap', () => {
  const history = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((day, index) => ({
    id: `streak-${index}`, skill: 'cyber-net', xp: 10, day, ts: Date.parse(`${day}T08:00:00Z`), min: 10, h: 8, utcOffsetMinutes: 0,
  }));
  const summary = engine.buildRpgSummary(history);
  const shortened = engine.removeProofFromRpgSummary(summary, history[2]);
  assert.equal(shortened.lastDay, '2026-11-10');
  assert.equal(shortened.currentStreak, 1);
  assert.equal(shortened.best, 4, 'historical best remains a lifetime record');
});

test('browser accepts the current server summary version', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8')
    + readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const summaryVersion = engine.buildRpgSummary([]).version;
  assert.ok(html.includes(`result.summary.version!==${summaryVersion}`));
  assert.ok(html.includes(`store.summary.version===${summaryVersion}`));
});

test('custom branch specialization unlocks once and stores enough metadata for the achievement archive', () => {
  const profile = { customBranches: [{ id: 'cb-motion', name: 'Моушен-дизайн' }] };
  const metrics = engine.achievementMetricsFromSummary({
    version: 7, count: 1, total: 100, minutes: 30, proofCount: 0, nightCount: 0, morningCount: 0, weekendCount: 0,
    activeDays: 1, questsCompleted: 0, best: 1, currentStreak: 1, lastDay: '2026-11-10', skillXp: {}, branchXp: { 'cb-motion': 100 },
  }, profile);
  const unlocked = engine.unlockEligibleAchievementsFromMetrics(metrics, profile, 1234);
  const award = unlocked.fresh.find((item) => item.id === 'custom-branch-cb-motion-level-3');
  assert.ok(award);
  assert.ok(unlocked.titles.includes('Мастерство: Моушен-дизайн · уровень 3'));
  assert.equal(unlocked.ledger[award.id].achievement.n, 'Моушен-дизайн: уровень 3');
  assert.equal(unlocked.ledger[award.id].at, 1234);
  const repeated = engine.unlockEligibleAchievementsFromMetrics(metrics, { ...profile, achievementUnlocks: unlocked.ledger }, 2345);
  assert.equal(repeated.fresh.some((item) => item.id === award.id), false);
});
