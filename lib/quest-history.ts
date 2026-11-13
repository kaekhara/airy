import { createHash } from 'node:crypto';

type Quest = { id?: unknown; title?: unknown; skill?: unknown; period?: unknown; requiredMinutes?: unknown; requiresEvidence?: unknown };
type HistoryEntry = { id: string; title: string; skill: string; period: string; completedAt: number; eventId: string; xp: number; requiredMinutes?: number; requiresEvidence?: boolean };

export function appendQuestCompletion(historyValue: unknown, quest: Quest, eventId: string, completedAt = Date.now(), rewardXp = 10): HistoryEntry[] {
  const history: HistoryEntry[] = Array.isArray(historyValue) ? historyValue.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<HistoryEntry>;
    if (typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id) || typeof row.eventId !== 'string' || !/^[\w-]{8,100}$/.test(row.eventId) || typeof row.skill !== 'string' || !/^[\w-]{1,100}$/.test(row.skill) || typeof row.title !== 'string' || !['daily', 'weekly', 'boss', 'personal'].includes(String(row.period)) || !Number.isFinite(row.completedAt) || Number(row.completedAt) <= 0 || Number(row.completedAt) > 8_640_000_000_000_000) return [];
    const requiredMinutes = Number(row.requiredMinutes);
    const xp = row.xp === undefined ? 10 : Number(row.xp);
    return [{ id: row.id, eventId: row.eventId, skill: row.skill, title: row.title.slice(0, 120), period: row.period as HistoryEntry['period'], completedAt: Number(row.completedAt), xp: Math.max(0, Math.min(100, Math.round(Number.isFinite(xp) ? xp : 0))), ...(Number.isFinite(requiredMinutes) && requiredMinutes > 0 ? { requiredMinutes: Math.max(15, Math.min(600, Math.round(requiredMinutes))) } : {}), ...(row.requiresEvidence === true ? { requiresEvidence: true } : {}) }];
  }) : [];
  if (typeof quest.id !== 'string' || !/^[\w-]{1,100}$/.test(quest.id) || typeof quest.skill !== 'string' || !/^[\w-]{1,100}$/.test(quest.skill) || !/^[\w-]{8,100}$/.test(eventId)) return history.slice(-500);
  if (history.some((item) => item.id === quest.id || item.eventId === eventId)) return history.slice(-500);
  const title = typeof quest.title === 'string' ? quest.title.trim().slice(0, 120) : '';
  const period = typeof quest.period === 'string' && ['daily', 'weekly', 'boss', 'personal'].includes(quest.period) ? quest.period : 'personal';
  const timestamp = Number.isFinite(completedAt) && completedAt > 0 && completedAt <= 8_640_000_000_000_000 ? Math.min(completedAt, Date.now() + 60_000) : Date.now();
  const requiredMinutes = Number(quest.requiredMinutes);
  return [...history, { id: quest.id, title: title || 'Завершённый квест', skill: quest.skill, period, completedAt: timestamp, eventId, xp: Math.max(0, Math.min(100, Math.round(Number(rewardXp) || 0))), ...(Number.isFinite(requiredMinutes) && requiredMinutes > 0 ? { requiredMinutes: Math.max(15, Math.min(600, Math.round(requiredMinutes))) } : {}), ...(quest.requiresEvidence === true ? { requiresEvidence: true } : {}) }].slice(-500);
}

/** Move legacy completed board entries into the durable, bounded archive ledger. */
export function archiveCompletedQuests(historyValue: unknown, questsValue: unknown, now = Date.now()): HistoryEntry[] {
  let history = appendQuestCompletion(Array.isArray(historyValue) ? historyValue : [], {}, '', now, 0);
  if (!Array.isArray(questsValue)) return history;
  const completed = questsValue.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).done === true));
  completed.sort((left, right) => Number(left.completedAt || left.createdAt || 0) - Number(right.completedAt || right.createdAt || 0));
  for (const row of completed) {
    const id = typeof row.id === 'string' ? row.id : '';
    const skill = typeof row.skill === 'string' ? row.skill : '';
    const completedAt = Number(row.completedAt || row.createdAt || now);
    const eventId = `legacy-${createHash('sha256').update(id).digest('hex').slice(0, 40)}`;
    history = appendQuestCompletion(history, {
      id, skill, title: row.title, period: row.period,
      requiredMinutes: row.requiredMinutes, requiresEvidence: row.requiresEvidence,
    }, eventId, completedAt, ['daily', 'weekly', 'boss'].includes(String(row.period)) ? 10 : 0);
  }
  return history.slice(-500) as HistoryEntry[];
}
