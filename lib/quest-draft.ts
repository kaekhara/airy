type AvailableSkill = { id: string };

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

export function sanitizeQuestDraft(value: unknown, available: AvailableSkill[], expectedCount = Math.min(3, available.length)) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI_BAD_RESPONSE');
  const tasks = (value as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) throw new Error('AI_BAD_RESPONSE');

  const allowed = new Set(available.map((skill) => skill.id));
  const usedSkills = new Set<string>();
  const usedTitles = new Set<string>();
  const safeTasks = tasks.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as { skill?: unknown; title?: unknown; requiredMinutes?: unknown };
    const skill = typeof item.skill === 'string' ? item.skill : '';
    const title = clean(item.title, 120);
    const normalizedTitle = title.toLocaleLowerCase();
    if (!allowed.has(skill) || usedSkills.has(skill) || title.length < 8 || usedTitles.has(normalizedTitle)) return [];
    usedSkills.add(skill);
    usedTitles.add(normalizedTitle);
    return [{ skill, title, requiredMinutes: Math.max(20, Math.min(40, Math.round(Number(item.requiredMinutes) || 25))) }];
  }).slice(0, 3);

  if (safeTasks.length !== expectedCount) throw new Error('AI_BAD_RESPONSE');
  return { tasks: safeTasks };
}
