(function attachCosmeticInventory(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryCosmeticInventory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCosmeticInventory() {
  const RARITY_RANK = Object.freeze({ Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5 });

  function build(awards, achievementUnlocks, unlockedTitles) {
    const ledger = achievementUnlocks && typeof achievementUnlocks === 'object' && !Array.isArray(achievementUnlocks) ? achievementUnlocks : {};
    const titles = Array.isArray(unlockedTitles) ? [...new Set(unlockedTitles.filter((title) => typeof title === 'string' && title.trim()))] : [];
    const owned = new Set(titles), matchedTitles = new Set(), byTitle = new Map();

    for (const award of Array.isArray(awards) ? awards : []) {
      const title = award?.reward?.title;
      if (award?.reward?.type !== 'cosmetic' || typeof title !== 'string' || !owned.has(title)) continue;
      matchedTitles.add(title);
      const record = ledger[award.id];
      const timestamp = Number(record && record.at);
      const item = {
        id: award.id,
        title,
        name: typeof award.n === 'string' ? award.n : title,
        glyph: typeof award.g === 'string' ? award.g : '✦',
        rarity: Object.hasOwn(RARITY_RANK, award.rarity) ? award.rarity : 'Common',
        category: typeof award.category === 'string' ? award.category : 'Награда',
        at: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
      };
      const previous = byTitle.get(title);
      if (!previous || RARITY_RANK[item.rarity] > RARITY_RANK[previous.rarity]
        || (item.rarity === previous.rarity && item.at > previous.at)) byTitle.set(title, item);
    }

    titles.forEach((title, index) => {
      if (!matchedTitles.has(title)) byTitle.set(title, { id: `legacy-${index}`, title, name: title, glyph: '✦', rarity: 'Common', category: 'Награда', at: 0 });
    });

    return [...byTitle.values()].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.at - a.at || a.title.localeCompare(b.title, 'ru'));
  }

  return Object.freeze({ build });
});
