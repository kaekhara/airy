import test from 'node:test';
import assert from 'node:assert/strict';
import achievements from '../public/achievement-catalog.js';
import inventory from '../public/cosmetic-inventory.js';

test('inventory only returns persisted titles and excludes locked rewards', () => {
  const award = achievements.find((item) => item.reward.type === 'cosmetic');
  assert.deepEqual(inventory.build([award], {}, []), []);
  assert.equal(inventory.build([award], {}, [award.reward.title])[0].title, award.reward.title);
});

test('repeated title rewards collapse to one item with the rarest owned variant', () => {
  const title = 'Титул «Ночной мастер»';
  const awards = [
    { id: 'common', n: 'Ранний этап', g: '✦', category: 'Тест', rarity: 'Common', reward: { type: 'cosmetic', title } },
    { id: 'epic', n: 'Высший этап', g: '✧', category: 'Тест', rarity: 'Epic', reward: { type: 'cosmetic', title } },
  ];
  const result = inventory.build(awards, { common: { at: 100 }, epic: { at: 200 } }, [title]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'epic');
  assert.equal(result[0].at, 200);
});

test('legacy titles remain visible and duplicated profile values are collapsed', () => {
  const result = inventory.build([], {}, ['Legacy', 'Legacy']);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'legacy-0');
  assert.equal(result[0].rarity, 'Common');
});
