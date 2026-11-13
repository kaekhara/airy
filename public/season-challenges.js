(function attachSeasonChallenges(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AirySeasonChallenges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSeasonChallenges() {
  const pad = (value) => String(value).padStart(2, '0');
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const SEASONS = ['Зима', 'Весна', 'Лето', 'Осень'];

  function currentSeason(now = Date.now()) {
    const date = new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error('INVALID_DATE');
    const quarter = Math.floor(date.getMonth() / 3);
    const start = new Date(date.getFullYear(), quarter * 3, 1);
    const end = new Date(date.getFullYear(), quarter * 3 + 3, 1);
    const lastDay = new Date(end.getTime() - 86_400_000);
    return {
      id: `${date.getFullYear()}-Q${quarter + 1}`,
      name: `${SEASONS[quarter]} ${date.getFullYear()}`,
      start: dateKey(start),
      end: dateKey(lastDay),
      daysLeft: Math.max(0, Math.ceil((end.getTime() - date.getTime()) / 86_400_000)),
    };
  }

  function build(now, proofs = [], summary = null, branchBySkill = {}) {
    const season = currentSeason(now), totals = { practices: 0, xp: 0, branches: new Set() };
    if (summary && [5, 6, 7].includes(summary.version) && summary.dayCounts && summary.dayXp) {
      for (const [day, count] of Object.entries(summary.dayCounts)) {
        if (day < season.start || day > season.end) continue;
        totals.practices += Math.max(0, Number(count) || 0);
        totals.xp += Math.max(0, Number(summary.dayXp[day]) || 0);
        const branchXp = summary.dayBranchXp && summary.dayBranchXp[day];
        if (branchXp && typeof branchXp === 'object') {
          Object.entries(branchXp).forEach(([id, xp]) => { if (Number(xp) > 0) totals.branches.add(id); });
        }
      }
    } else {
      for (const proof of Array.isArray(proofs) ? proofs : []) {
        const day = typeof proof.day === 'string' ? proof.day : dateKey(new Date(Number(proof.ts) || 0));
        if (day < season.start || day > season.end) continue;
        totals.practices += 1;
        totals.xp += Math.max(0, Number(proof.xp) || 0);
        const branch = typeof proof.branch === 'string' ? proof.branch : typeof proof.skill === 'string' ? branchBySkill[proof.skill] || '' : '';
        if (branch) totals.branches.add(branch);
      }
    }
    const metrics = { practices: totals.practices, xp: totals.xp, branches: totals.branches.size };
    const challenges = [
      { id: 'practices', title: 'Ритм без спешки', description: 'Проведи 12 практик в удобном тебе темпе.', value: metrics.practices, target: 12, unit: 'практик' },
      { id: 'branches', title: 'Широкий маршрут', description: 'Попробуй 3 разных направления.', value: metrics.branches, target: 3, unit: 'направления' },
      { id: 'xp', title: 'Сезонный рывок', description: 'Набери 600 XP за сезон.', value: metrics.xp, target: 600, unit: 'XP' },
    ].map((item) => ({ ...item, progress: Math.max(0, Math.min(100, Math.round(item.value / item.target * 100))), done: item.value >= item.target }));
    return { season, metrics, challenges };
  }

  return Object.freeze({ currentSeason, build });
});
