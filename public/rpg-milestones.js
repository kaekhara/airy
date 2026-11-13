(function attachRpgMilestones(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryRpgMilestones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRpgMilestones() {
  function levelChanges(before = {}, after = {}, names = {}) {
    const changes = [];
    const globalBefore = Number(before.tl && before.tl.L) || 1;
    const globalAfter = Number(after.tl && after.tl.L) || 1;
    if (globalAfter > globalBefore) changes.push({ kind: 'level', icon: String(globalAfter), message: `Уровень аккаунта повышен: ${globalBefore} → ${globalAfter}` });

    for (const [id, value] of Object.entries(after.bl || {})) {
      const previous = Number(before.bl && before.bl[id] && before.bl[id].L) || 1;
      const current = Number(value && value.L) || 1;
      if (current > previous) changes.push({ kind: 'level', icon: String(current), message: `Новое мастерство направления ${names[id] || id.toUpperCase()}: ${previous} → ${current}` });
    }
    for (const [id, value] of Object.entries(after.sl || {})) {
      const previous = Number(before.sl && before.sl[id] && before.sl[id].L) || 1;
      const current = Number(value && value.L) || 1;
      if (current > previous) changes.push({ kind: 'level', icon: String(current), message: `Навык «${names[id] || id}» вырос до уровня ${current}` });
    }
    return changes;
  }

  function pick(before, after, catalog, names) {
    const previousAwards = new Set(Array.isArray(before && before.ach) ? before.ach : []);
    const fresh = (Array.isArray(catalog) ? catalog : []).filter((award) =>
      Array.isArray(after && after.ach) && after.ach.includes(award.id) && !previousAwards.has(award.id));
    if (fresh.length) {
      const award = fresh[0];
      const more = fresh.length > 1 ? ` · и ещё ${fresh.length - 1}` : '';
      return { kind: 'award', icon: award.g || '✦', message: `${award.n}${more}` };
    }
    return levelChanges(before, after, names)[0] || null;
  }

  return Object.freeze({ pick });
});
