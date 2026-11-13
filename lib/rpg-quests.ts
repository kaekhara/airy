type QuestProfile = {
  hiddenSkills?: unknown;
  customBranches?: unknown;
  skillEdits?: unknown;
};

export type RecurringQuest = {
  id: string;
  period: 'daily' | 'weekly' | 'boss';
  skill: string;
  title: string;
  requiredMinutes: number;
  requiresEvidence?: boolean;
  createdAt: number;
  expiresAt: number;
  done?: boolean;
  completedAt?: number;
};

const BASE_BRANCHES = [
  ['cyber', 'Кибербезопасность'], ['db', 'Базы данных'], ['py', 'Python'],
  ['ios', 'SwiftUI и iOS'], ['art', 'Дизайн и 3D'], ['lang', 'Языки'],
] as const;

export function isQuestDueAtValid(dueAt: unknown, now: number) {
  const value = Number(dueAt);
  // Date inputs are stored at local noon; allow the largest civil-time UTC offset.
  return Number.isFinite(now) && Number.isFinite(value) && value >= now - 86_400_000 && value <= now + 366 * 86_400_000 + 14 * 3_600_000;
}

function key(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function localMidnightUtc(localDate: Date, offset: number) {
  return Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate()) - offset * 60_000;
}

export function recurringQuestSpecs(profile: QuestProfile, now: number, offset: number): RecurringQuest[] {
  if (!Number.isFinite(now) || !Number.isInteger(offset) || offset < -720 || offset > 840) return [];
  const localNow = new Date(now + offset * 60_000);
  const today = key(localNow);
  const tomorrow = new Date(localNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStart = localMidnightUtc(tomorrow, offset);
  const weekStart = new Date(localNow);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const weekKey = key(weekStart);
  const nextWeek = new Date(weekStart);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekUtc = localMidnightUtc(nextWeek, offset);

  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  const edits = profile.skillEdits && typeof profile.skillEdits === 'object' && !Array.isArray(profile.skillEdits)
    ? profile.skillEdits as Record<string, { name?: unknown }> : {};
  const branches: Array<{ id: string; name: string }> = BASE_BRANCHES
    .filter(([id]) => !hidden.has(id))
    .map(([id, name]) => ({ id, name: typeof edits[id]?.name === 'string' ? edits[id].name as string : name }));
  if (Array.isArray(profile.customBranches)) {
    for (const branch of profile.customBranches) {
      if (!branch || typeof branch !== 'object') continue;
      const row = branch as { id?: unknown; name?: unknown };
      if (typeof row.id !== 'string' || hidden.has(row.id)) continue;
      const edited = edits[row.id]?.name;
      branches.push({ id: row.id, name: typeof edited === 'string' ? edited : typeof row.name === 'string' ? row.name.slice(0, 40) : 'Новая ветка' });
    }
  }
  if (!branches.length) return [];
  const dateSeed = Number(today.replaceAll('-', '')) || 0;
  const weekSeed = Number(weekKey.replaceAll('-', '')) || 0;
  const dailyBranch = branches[dateSeed % branches.length];
  const weeklyBranch = branches[(weekSeed + 2) % branches.length];
  const bossBranch = branches[(weekSeed + 4) % branches.length];
  return [
    { id: `daily-${today}`, period: 'daily', skill: dailyBranch.id, title: `15 минут фокусной практики · ${dailyBranch.name}`, requiredMinutes: 15, createdAt: now, expiresAt: tomorrowStart },
    { id: `weekly-${weekKey}`, period: 'weekly', skill: weeklyBranch.id, title: `Подкрепи работу материалом · ${weeklyBranch.name}`, requiredMinutes: 30, requiresEvidence: true, createdAt: now, expiresAt: nextWeekUtc - 1 },
    { id: `boss-${weekKey}`, period: 'boss', skill: bossBranch.id, title: `Boss Challenge · большая практика с подтверждением · ${bossBranch.name}`, requiredMinutes: 60, requiresEvidence: true, createdAt: now, expiresAt: nextWeekUtc - 1 },
  ];
}

export function isCanonicalRecurringQuest(quest: Record<string, unknown>, profile: QuestProfile, now: number, offset: number) {
  const expected = recurringQuestSpecs(profile, now, offset).find((item) => item.id === quest.id);
  if (!expected || quest.period !== expected.period || quest.skill !== expected.skill || quest.title !== expected.title
    || Number(quest.requiredMinutes) !== expected.requiredMinutes || Boolean(quest.requiresEvidence) !== Boolean(expected.requiresEvidence)
    || Number(quest.expiresAt) !== expected.expiresAt) return false;
  const createdAt = Number(quest.createdAt);
  const earliest = expected.period === 'daily'
    ? Math.floor((now + offset * 60_000) / 86_400_000) * 86_400_000 - offset * 60_000
    : (() => {
      const date = new Date(now + offset * 60_000);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - offset * 60_000;
    })();
  return Number.isFinite(createdAt) && createdAt >= earliest && createdAt <= now;
}
