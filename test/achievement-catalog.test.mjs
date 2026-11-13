import test from 'node:test';
import assert from 'node:assert/strict';
import achievements from '../public/achievement-catalog.js';
import { loadTsModule } from './load-ts.mjs';
const rpg = loadTsModule('../lib/rpg-engine.ts');
const engine = loadTsModule('../lib/rpg-achievements.ts', {
  '@/lib/rpg-engine': rpg,
  '@/public/achievement-catalog.js': achievements,
});

test('achievement catalog has 100+ unique, complete entries', () => {
  assert.ok(achievements.length >= 100);
  assert.equal(new Set(achievements.map((award) => award.id)).size, achievements.length);
  for (const award of achievements) {
    assert.ok(award.id && award.category && award.n && award.d && award.g);
    assert.ok(award.metric && award.target > 0 && award.unit);
    assert.ok(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'].includes(award.rarity));
    assert.equal(award.reward.type, 'cosmetic');
    assert.ok(award.reward.title);
  }
  for (const category of ['Начало пути', 'Постоянство', 'Мастерство', 'Исследователь', 'Легенда', 'Секретные', 'Социальные', 'Испытания', 'Специализация', 'Коллекционер']) {
    assert.ok(achievements.some((award) => award.category === category), `missing ${category}`);
  }
});

test('achievement rarity follows milestone difficulty within each progression track', () => {
  const find = (id) => achievements.find((award) => award.id === id);
  assert.equal(find('streak-3').rarity, 'Common');
  assert.equal(find('streak-30').rarity, 'Epic');
  assert.equal(find('streak-365').rarity, 'Mythic');
  assert.equal(find('active-days-365').rarity, 'Mythic');
  assert.equal(find('legend-xp-500000').rarity, 'Mythic');
  assert.equal(find('branch-cyber-level-3').rarity, 'Uncommon');
  assert.equal(find('branch-cyber-level-10').rarity, 'Mythic');
  assert.equal(new Set(achievements.map((award) => award.rarity)).size, 6);
});

test('custom active branches receive four unique specialization milestones and hidden branches do not', () => {
  const profile = {
    customBranches: [{ id: 'cb-design', name: 'Моушен-дизайн' }, { id: 'cb-hidden', name: 'Скрытое' }],
    hiddenSkills: ['cb-hidden'],
    skillEdits: { 'cb-design': { name: 'Анимация интерфейсов' } },
  };
  const dynamic = achievements.forProfile(profile);
  const custom = dynamic.filter((award) => award.metric === 'branchLevel:cb-design');
  assert.deepEqual(custom.map((award) => award.target), [3, 5, 8, 10]);
  assert.ok(custom.every((award) => award.category === 'Специализация' && award.n.includes('Анимация интерфейсов')));
  assert.equal(dynamic.some((award) => award.metric === 'branchLevel:cb-hidden'), false);
  assert.equal(new Set(dynamic.map((award) => award.id)).size, dynamic.length);
});

test('every achievement criterion maps to a live metric and reachable target', () => {
  const metrics = engine.achievementMetrics([]);
  for (const award of achievements) {
    if (award.metric.startsWith('branchLevel:')) {
      const branch = award.metric.slice('branchLevel:'.length);
      assert.ok(Object.hasOwn(metrics.branchLevels, branch), `unknown branch metric ${award.metric}`);
      assert.ok(award.target <= 10, `unreachable branch level ${award.id}`);
    } else {
      assert.ok(Object.hasOwn(metrics, award.metric), `unknown metric ${award.metric}`);
    }
    assert.ok(Number.isFinite(award.target) && award.target > 0, `invalid target ${award.id}`);
  }
});

test('secret achievements stay out of browse/search results until unlocked', () => {
  const secrets = achievements.filter((award) => award.secret);
  const visibleBeforeUnlock = achievements.visibleAchievements(new Set());
  assert.equal(visibleBeforeUnlock.some((award) => award.secret), false);
  const unlocked = new Set([secrets[0].id]);
  const visibleAfterUnlock = achievements.visibleAchievements(unlocked);
  assert.equal(visibleAfterUnlock.some((award) => award.id === secrets[0].id), true);
  assert.equal(visibleAfterUnlock.some((award) => award.id === secrets[1].id), false);
});

test('social achievements describe a share action rather than claiming a published post', () => {
  const social = achievements.filter((item) => item.category === 'Социальные' && item.metric === 'shareCount');
  assert.deepEqual(social.map((item) => item.target), [1, 3, 10]);
  assert.ok(social.every((item) => /системное меню|скопируй ссылку/i.test(item.d)));
  assert.ok(social.every((item) => !/публикац/i.test(item.d + item.unit)));
  const friends = achievements.filter((item) => item.metric === 'friendCount');
  assert.deepEqual(friends.map((item) => item.target), [1, 3, 10]);
  assert.ok(friends.every((item) => item.category === 'Социальные' && /взаимную связь по коду приглашения/i.test(item.d)));
});

test('XP and level formulas keep their boundaries and attribution', () => {
  assert.equal(achievements.practiceXp({ min: 30 }), 15);
  assert.equal(achievements.practiceXp({ min: 600, link: true, imgs: 1, len: 60 }), 53);
  assert.equal(achievements.practiceXp({ min: 30, difficulty: 5 }), 23);
  assert.equal(achievements.practiceXp({ min: 30, difficulty: 3, questBonus: 10, streakBonus: 4 }), 32);
  assert.equal(achievements.levelForXp(0, 25, 10).level, 1);
  assert.equal(achievements.levelForXp(25, 25, 10).level, 2);
  assert.equal(achievements.levelForXp(2025, 25, 10).level, 10);
  assert.equal(achievements.levelForXp(60, 60).level, 2);
  assert.equal(achievements.practiceEditXp(42, 500), 42);
  assert.equal(achievements.practiceEditXp(undefined, 37), 37);
});

test('achievement descriptions and progress counters use correct Russian plural forms', () => {
  const byId = (id) => achievements.find((award) => award.id === id);
  assert.equal(byId('entries-1').d, 'Достигни показателя: 1 запись');
  assert.equal(byId('entries-3').d, 'Достигни показателя: 3 записи');
  assert.equal(byId('entries-5').d, 'Достигни показателя: 5 записей');
  assert.equal(byId('streak-14').d, 'Достигни показателя: 14 дней');
  assert.equal(byId('branches-1').d, 'Достигни показателя: 1 ветка');
  assert.equal(byId('branches-3').d, 'Достигни показателя: 3 ветки');
  assert.equal(byId('advanced-5').d, 'Достигни показателя: 5 узлов');
  assert.equal(achievements.formatCount(1, byId('entries-1').unitForms), '1 запись');
  assert.equal(achievements.formatCount(2, byId('entries-1').unitForms), '2 записи');
  assert.equal(achievements.formatCount(5, byId('entries-1').unitForms), '5 записей');
  assert.equal(achievements.formatCount(21, byId('entries-1').unitForms), '21 запись');
  assert.equal(achievements.formatCount(22, byId('entries-1').unitForms), '22 записи');
});
