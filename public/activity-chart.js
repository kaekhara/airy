(function attachWeeklyActivity(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryWeeklyActivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWeeklyActivity() {
  const pad = (value) => String(value).padStart(2, '0');
  const localKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  function build(now = Date.now(), dayCounts = {}, proofs = [], locale = 'ru', range = 7) {
    const current = new Date(now);
    if (!Number.isFinite(current.getTime())) throw new Error('INVALID_DATE');
    const today = localKey(current);
    const counts = dayCounts && typeof dayCounts === 'object' && !Array.isArray(dayCounts) ? dayCounts : {};
    const rows = Array.isArray(proofs) ? proofs : [];
    const hasSummary = Object.keys(counts).length > 0;
    const localCounts = new Map();
    if (!hasSummary) {
      rows.forEach((proof) => {
        let day = typeof proof?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day) ? proof.day : '';
        if (!day && Number.isFinite(Number(proof?.ts))) day = localKey(new Date(Number(proof.ts)));
        if (day) localCounts.set(day, (localCounts.get(day) || 0) + 1);
      });
    }

    const formatter = new Intl.DateTimeFormat(['ru', 'en', 'kk'].includes(locale) ? locale : 'ru', { day: 'numeric', month: 'short' });
    const weekdayFormatter = new Intl.DateTimeFormat(['ru', 'en', 'kk'].includes(locale) ? locale : 'ru', { weekday: 'short' });
    const days = [];
    const span = range === 30 ? 30 : 7;
    for (let offset = span - 1; offset >= 0; offset -= 1) {
      const date = new Date(current.getFullYear(), current.getMonth(), current.getDate() - offset, 12);
      const key = localKey(date);
      const rawCount = hasSummary ? counts[key] : localCounts.get(key);
      const count = Math.max(0, Math.min(100_000, Math.floor(Number(rawCount) || 0)));
      days.push({ key, day: date.getDate(), count, dateLabel: formatter.format(date), dayLabel: span === 7 ? weekdayFormatter.format(date).replace(/[.,]$/, '') : String(date.getDate()), today: key === today });
    }
    const max = Math.max(1, ...days.map((day) => day.count));
    days.forEach((day) => { day.height = day.count ? Math.max(10, Math.round(day.count / max * 100)) : 4; });
    return { days, total: days.reduce((sum, day) => sum + day.count, 0), max };
  }

  return Object.freeze({ build });
});
