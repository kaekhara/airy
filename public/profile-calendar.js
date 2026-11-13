(function attachProfileCalendar(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryProfileCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfileCalendar() {
  let cachedKey = '';
  let cachedValue = null;
  const pad = (value) => String(value).padStart(2, '0');
  const localKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const safeNumber = (value, maximum) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(maximum, Math.floor(number))) : 0;
  };
  const safeCount = (value) => safeNumber(value, 100_000);
  const safeXp = (value) => safeNumber(value, 100_000_000);

  function build(statsValue, now = Date.now(), localeValue = 'ru') {
    const stats = statsValue && typeof statsValue === 'object' ? statsValue : {};
    const date = new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error('INVALID_DATE');
    date.setHours(12, 0, 0, 0);
    const locale = ['ru', 'en', 'kk'].includes(localeValue) ? localeValue : 'ru';
    const today = localKey(date);
    const start = new Date(date);
    start.setDate(start.getDate() - 364);
    const byDay = stats.byDay instanceof Map ? stats.byDay : new Map();
    const days = [];
    let activeDays = 0;
    for (let index = 0; index < 365; index += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      const key = localKey(current);
      const data = byDay.get(key);
      const count = safeCount(data && data.n);
      const xp = safeXp(data && data.xp);
      if (count > 0) activeDays += 1;
      days.push({ date: current, key, count, xp, today: key === today, level: count === 0 ? 0 : count >= 5 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : 1 });
    }

    const streak = safeCount(stats.streak);
    const signature = `${locale}|${streak}|${days.map((day) => `${day.key}:${day.count}:${day.xp}`).join('|')}`;
    if (signature === cachedKey && cachedValue) return cachedValue;

    const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const plural = new Intl.PluralRules(locale);
    const months = [];
    let previousMonth = -1;
    const offset = (start.getDay() + 6) % 7;
    for (let index = 0; index < days.length; index += 1) {
      const day = days[index];
      const month = day.date.getMonth();
      const week = Math.floor((offset + index) / 7);
      if (month !== previousMonth) {
        const label = monthFormatter.format(day.date).replace(/[.]$/, '');
        if (!months.length || week - months[months.length - 1].week >= 3) months.push({ week, label });
        previousMonth = month;
      }
      const dateLabel = dateFormatter.format(day.date);
      if (locale === 'ru') {
        const form = plural.select(day.count) === 'one' ? 'практика' : plural.select(day.count) === 'few' ? 'практики' : 'практик';
        day.description = day.count ? `${dateLabel}: ${day.count} ${form}, ${day.xp} XP` : `${dateLabel}: без практики`;
      } else if (locale === 'kk') {
        day.description = day.count ? `${dateLabel}: ${day.count} жаттығу, ${day.xp} XP` : `${dateLabel}: жаттығу жоқ`;
      } else {
        day.description = day.count ? `${dateLabel}: ${day.count} ${day.count === 1 ? 'practice' : 'practices'}, ${day.xp} XP` : `${dateLabel}: no practice`;
      }
    }

    const summary = locale === 'ru'
      ? `Последние 365 дней · ${activeDays} ${plural.select(activeDays) === 'one' ? 'активный день' : plural.select(activeDays) === 'few' ? 'активных дня' : 'активных дней'} · серия ${streak} ${plural.select(streak) === 'one' ? 'день' : plural.select(streak) === 'few' ? 'дня' : 'дней'}`
      : locale === 'kk'
        ? `Соңғы 365 күн · ${activeDays} белсенді күн · серия ${streak} күн`
        : `Last 365 days · ${activeDays} active ${activeDays === 1 ? 'day' : 'days'} · streak ${streak} ${streak === 1 ? 'day' : 'days'}`;
    cachedKey = signature;
    const weekdayDate = new Date(2024, 0, 1, 12);
    const weekdays = Array.from({ length: 7 }, (_, index) => {
      weekdayDate.setDate(1 + index);
      return weekdayFormatter.format(weekdayDate).replace(/[.]$/, '');
    });
    const weekdayMarks = weekdays.map((label, index) => index % 2 === 0 ? label.slice(0, locale === 'en' ? 1 : 2) : '');
    cachedValue = { days, months, weekdays, weekdayMarks, offset, activeDays, streak, summary, signature };
    return cachedValue;
  }

  return Object.freeze({ build });
});
