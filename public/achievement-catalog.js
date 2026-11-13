(function attachAchievementCatalog(root, factory) {
  const catalog = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
  if (root) root.AiryAchievementCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAchievementCatalog() {
  const rarityFor = (index, total) => {
    const ratio = index / total;
    if (ratio >= 0.95) return 'Mythic';
    if (ratio >= 0.8) return 'Legendary';
    if (ratio >= 0.6) return 'Epic';
    if (ratio >= 0.4) return 'Rare';
    if (ratio >= 0.2) return 'Uncommon';
    return 'Common';
  };
  const levelForXp = (xp, step, maxLevel = Infinity) => {
    const safeXp = Math.max(0, Number(xp) || 0);
    const level = Math.min(maxLevel, Math.floor(Math.sqrt(safeXp / step)) + 1);
    const low = step * (level - 1) * (level - 1);
    const high = step * level * level;
    return { level, low, high, xp: safeXp, fraction: level >= maxLevel ? 1 : Math.max(0, Math.min(1, (safeXp - low) / (high - low))) };
  };
  const pluralIndex = (value) => {
    const count = Math.abs(Math.trunc(Number(value) || 0));
    const lastTwo = count % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 2;
    const last = count % 10;
    return last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2;
  };
  const formatCount = (value, forms) => {
    const count = Math.max(0, Math.trunc(Number(value) || 0));
    const choices = Array.isArray(forms) ? forms : [String(forms || ''), String(forms || ''), String(forms || '')];
    return `${count} ${choices[pluralIndex(count)]}`.trim();
  };
  const practiceXp = ({ min = 0, link = false, imgs = 0, len = 0, difficulty = 1, questBonus = 0, streakBonus = 0 } = {}) => {
    const difficultyLevel = Math.max(1, Math.min(5, Math.round(Number(difficulty) || 1)));
    const multiplier = [0, 1, 1.1, 1.2, 1.35, 1.5][difficultyLevel];
    const base = 10 + Math.round(Math.min(Math.max(Number(min) || 0, 0), 180) / 6) + (link ? 5 : 0) + (imgs ? 5 : 0) + (len >= 60 ? 3 : 0);
    return Math.round(base * multiplier) + Math.max(0, Math.min(10, Math.round(Number(questBonus) || 0))) + Math.max(0, Math.min(10, Math.round(Number(streakBonus) || 0)));
  };
  const practiceEditXp = (awardedXp, fallbackXp) => {
    const saved = Number(awardedXp);
    return awardedXp !== null && awardedXp !== undefined && Number.isFinite(saved) && saved >= 0
      ? Math.round(saved)
      : Math.max(0, Math.round(Number(fallbackXp) || 0));
  };
  const rows = [];
  const addTrack = (category, prefix, glyph, title, metric, targets, unit, unitForms, secretFrom = Infinity) => {
    targets.forEach((target, index) => rows.push({
      id: `${prefix}-${target}`,
      category,
      g: glyph,
      n: `${title} ${target}`,
      d: `Достигни показателя: ${formatCount(target, unitForms)}`,
      metric,
      target,
      unit,
      unitForms,
      secret: index >= secretFrom,
      rarity: rarityFor(index + 1, targets.length),
      reward: { type: 'cosmetic', title: `Титул «${title} ${target}»` },
    }));
  };

  addTrack('Начало пути', 'entries', '✎', 'Шаг', 'count', [1, 3, 5, 10, 20, 30, 50, 75, 100, 150], 'записей', ['запись','записи','записей']);
  addTrack('Постоянство', 'streak', '✿', 'Серия', 'best', [3, 5, 7, 10, 14, 21, 30, 60, 100, 365], 'дней', ['день','дня','дней']);
  addTrack('Мастерство', 'xp', '✦', 'Опыт', 'total', [50, 100, 250, 500, 750, 1000, 1500, 2500, 5000, 10000, 25000, 50000], 'XP', ['XP','XP','XP']);
  addTrack('Легенда', 'legend-xp', '♛', 'Легендарный опыт', 'total', [100000, 250000, 500000], 'XP', ['XP','XP','XP']);
  addTrack('Испытания', 'minutes', '◷', 'Практика', 'minutes', [30, 60, 120, 300, 600, 1200, 2400, 5000, 10000, 20000], 'минут', ['минута','минуты','минут']);
  addTrack('Исследователь', 'skills', '⌘', 'Разнообразие', 'used', [2, 3, 4, 5, 6, 8, 10, 12], 'навыков', ['навык','навыка','навыков']);
  addTrack('Исследователь', 'branches', '⌘', 'Открытые ветки', 'touched', [1, 2, 3, 4, 5, 6], 'веток', ['ветка','ветки','веток']);
  addTrack('Исследователь', 'advanced', '⌘', 'Продвинутые узлы', 'advUnlocked', [1, 2, 3, 4, 5], 'узлов', ['узел','узла','узлов']);
  addTrack('Коллекционер', 'proofs', '◈', 'Подтверждения', 'proofCount', [1, 2, 3, 5, 8, 13, 21, 34], 'практик', ['практика','практики','практик']);
  addTrack('Испытания', 'quests', '⚑', 'Квесты', 'questsCompleted', [1, 2, 3, 5, 8, 13, 21, 34, 55, 89], 'заданий', ['задание','задания','заданий']);
  addTrack('Секретные', 'mornings', '☼', 'Ранний старт', 'morningCount', [1, 3, 5], 'утренних практик', ['утренняя практика','утренние практики','утренних практик'], 2);
  addTrack('Секретные', 'nights', '☾', 'Ночной ритм', 'nightCount', [1, 3, 5], 'поздних практик', ['поздняя практика','поздние практики','поздних практик'], 2);
  addTrack('Постоянство', 'active-days', '✿', 'Активные дни', 'activeDays', [7, 14, 30, 60, 100, 180, 365], 'дней', ['день','дня','дней']);
  addTrack('Коллекционер', 'weekends', '◇', 'Практика выходного дня', 'weekendCount', [1, 3, 5], 'практик', ['практика','практики','практик'], 2);
  addTrack('Социальные', 'shares', '↗', 'Поделился путём', 'shareCount', [1, 3, 10], 'раз', ['раз','раза','раз']);
  rows.slice(-3).forEach((award) => { award.d = 'Поделись прогрессом через системное меню или скопируй ссылку.'; });
  addTrack('Социальные', 'friends', '♧', 'Новый союзник', 'friendCount', [1, 3, 10], 'друзей', ['друг','друга','друзей']);
  rows.slice(-3).forEach((award) => { award.d = 'Установи взаимную связь по коду приглашения.'; });

  const branchIds = ['cyber', 'db', 'py', 'ios', 'art', 'lang'];
  branchIds.forEach((branchId) => {
    [3, 5, 8, 10].forEach((target) => rows.push({
      id: `branch-${branchId}-level-${target}`,
      category: 'Специализация',
      g: '⬡',
      n: `Специалист: ${branchId.toUpperCase()} ${target}`,
      d: `Подними уровень направления ${branchId.toUpperCase()} до ${target}`,
      metric: `branchLevel:${branchId}`,
      target,
      unit: 'уровень',
      unitForms: ['уровень','уровня','уровней'],
      secret: false,
      rarity: rarityFor([3, 5, 8, 10].indexOf(target) + 1, 4),
      reward: { type: 'cosmetic', title: `Значок направления ${branchId.toUpperCase()}` },
    }));
  });

  const uniqueIds = new Set(rows.map((award) => award.id));
  if (rows.length < 100 || uniqueIds.size !== rows.length) throw new Error('Achievement catalog must contain at least 100 unique IDs');
  const catalog = rows.map((award) => Object.freeze({ ...award }));
  Object.defineProperties(catalog, {
    levelForXp: { value: levelForXp },
    practiceXp: { value: practiceXp },
    practiceEditXp: { value: practiceEditXp },
    formatCount: { value: formatCount },
    visibleAchievements: { value: (unlockedIds) => {
      const unlocked = unlockedIds instanceof Set ? unlockedIds : new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
      return catalog.filter((award) => !award.secret || unlocked.has(award.id));
    } },
    forProfile: { value: (profile = {}) => {
      const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills : []);
      const edits = profile.skillEdits && typeof profile.skillEdits === 'object' && !Array.isArray(profile.skillEdits) ? profile.skillEdits : {};
      const branches = Array.isArray(profile.customBranches) ? profile.customBranches : [];
      const dynamic = [];
      for (const branch of branches) {
        if (!branch || typeof branch.id !== 'string' || !/^[\w-]{1,100}$/.test(branch.id) || hidden.has(branch.id)) continue;
        const name = String(edits[branch.id]?.name || branch.name || 'Своё направление').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Своё направление';
        for (const target of [3, 5, 8, 10]) dynamic.push({
          id: `custom-branch-${branch.id}-level-${target}`,
          category: 'Специализация',
          g: '⬡',
          n: `${name}: уровень ${target}`,
          d: `Развивай направление «${name}» до уровня ${target}`,
          metric: `branchLevel:${branch.id}`,
          target,
          unit: 'уровень',
          unitForms: ['уровень', 'уровня', 'уровней'],
          secret: false,
          rarity: rarityFor([3, 5, 8, 10].indexOf(target) + 1, 4),
          reward: { type: 'cosmetic', title: `Мастерство: ${name} · уровень ${target}` },
        });
      }
      const derived = [...catalog, ...dynamic].map((award) => Object.freeze({ ...award }));
      Object.defineProperty(derived, 'visibleAchievements', { value: (unlockedIds) => {
        const unlocked = unlockedIds instanceof Set ? unlockedIds : new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
        return derived.filter((award) => !award.secret || unlocked.has(award.id));
      } });
      for (const helper of ['levelForXp', 'practiceXp', 'practiceEditXp', 'formatCount']) {
        Object.defineProperty(derived, helper, { value: catalog[helper] });
      }
      return Object.freeze(derived);
    } },
  });
  return Object.freeze(catalog);
});
