export type PracticeInput = {
  minutes: number;
  hasLink: boolean;
  imageCount: number;
  textLength: number;
  difficulty?: number;
  questBonus?: number;
  streakBonus?: number;
};

export function practiceXp(input: PracticeInput): number {
  const minutes = Math.max(0, Math.min(180, Math.round(Number(input.minutes) || 0)));
  const imageCount = Math.max(0, Math.round(Number(input.imageCount) || 0));
  const difficulty = Math.max(1, Math.min(5, Math.round(Number(input.difficulty) || 1)));
  const multiplier = [0, 1, 1.1, 1.2, 1.35, 1.5][difficulty];
  const base = 10 + Math.round(minutes / 6)
    + (input.hasLink ? 5 : 0)
    + (imageCount > 0 ? 5 : 0)
    + (input.textLength >= 60 ? 3 : 0);
  return Math.round(base * multiplier)
    + Math.max(0, Math.min(10, Math.round(input.questBonus || 0)))
    + Math.max(0, Math.min(10, Math.round(input.streakBonus || 0)));
}

/** Recurring quests award a completion bonus; personal quests do not. */
export function questCompletionBonus(period: unknown): number {
  return period === 'daily' || period === 'weekly' || period === 'boss' ? 10 : 0;
}

/** Award streak XP only when a proof advances the latest active calendar day. */
export function dailyStreakBonus(day: unknown, lastDay: unknown, currentStreak: unknown): number {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
  const dayTime = Date.parse(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(dayTime)) return 0;
  if (typeof lastDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return 1;
  const lastTime = Date.parse(`${lastDay}T12:00:00.000Z`);
  if (!Number.isFinite(lastTime) || dayTime <= lastTime) return 0;
  const distance = Math.round((dayTime - lastTime) / 86_400_000);
  return distance === 1 ? Math.min(10, Math.max(0, Math.round(Number(currentStreak) || 0) + 1)) : 1;
}

/** XP is granted when a practice event is first saved. Later edits may correct its
 * description, duration, evidence, or skill, but must never mint extra XP. */
export function practiceEditXp(awardedXp: unknown, fallbackXp: number): number {
  const saved = Number(awardedXp);
  return awardedXp !== null && awardedXp !== undefined && Number.isFinite(saved) && saved >= 0
    ? Math.round(saved)
    : Math.max(0, Math.round(Number(fallbackXp) || 0));
}

export function levelForXp(xpValue: number, step: number, maxLevel = Number.POSITIVE_INFINITY) {
  const xp = Math.max(0, Number(xpValue) || 0);
  const safeStep = Math.max(1, Number(step) || 1);
  const level = Math.min(maxLevel, Math.floor(Math.sqrt(xp / safeStep)) + 1);
  const low = safeStep * (level - 1) ** 2;
  const high = safeStep * level ** 2;
  return {
    level,
    low,
    high,
    xp,
    fraction: level >= maxLevel ? 1 : Math.max(0, Math.min(1, (xp - low) / (high - low))),
  };
}

export function isSkillUnlocked(input: {
  branchXp: number;
  requiredBranchLevel: number;
  prerequisites: string[];
  skillXp: Record<string, number>;
}) {
  if (levelForXp(input.branchXp, 25, 10).level < input.requiredBranchLevel) return false;
  return input.prerequisites.every((id) => (input.skillXp[id] || 0) > 0);
}

export function isSkillGraphAcyclic(nodes: Array<{ id?: unknown; prerequisites?: unknown }>, skillIds: unknown[]): boolean {
  if (nodes.length > 2_000 || skillIds.length > 3_000) return false;
  const ids: string[] = [];
  for (const id of skillIds) {
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) return false;
    ids.push(id);
  }
  const graph = new Map<string, string[]>();
  ids.forEach((id) => graph.set(id, []));
  if (graph.size !== ids.length) return false;
  for (const node of nodes) {
    if (typeof node.id !== 'string' || !graph.has(node.id)) return false;
    const prerequisites = node.prerequisites === undefined ? [] : node.prerequisites;
    if (!Array.isArray(prerequisites) || prerequisites.length > 50 || prerequisites.some((id) => typeof id !== 'string' || !graph.has(id))) return false;
    graph.set(node.id, prerequisites as string[]);
  }

  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [id, prerequisites] of graph) {
    const unique = new Set(prerequisites);
    if (unique.size !== prerequisites.length) return false;
    for (const prerequisite of prerequisites) {
      if (prerequisite === id) return false;
      dependents.get(prerequisite)!.push(id);
      indegree.set(id, indegree.get(id)! + 1);
    }
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    visited += 1;
    for (const dependent of dependents.get(id)!) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  return visited === ids.length;
}

export type QuestEligibilityInput = {
  quest: {
    skill?: unknown;
    done?: unknown;
    expiresAt?: unknown;
    dueAt?: unknown;
    requiredMinutes?: unknown;
    requiresEvidence?: unknown;
    completedInHistory?: unknown;
  };
  skillId: string;
  branchId: string;
  now: number;
  minutes: number;
  hasEvidence: boolean;
};

export function questEligibility(input: QuestEligibilityInput): 'ok' | 'done' | 'expired' | 'skill' | 'minutes' | 'evidence' {
  const quest = input.quest;
  if (quest.done === true || quest.completedInHistory === true) return 'done';
  const expiresAt = typeof quest.expiresAt === 'number' && Number.isFinite(quest.expiresAt) ? quest.expiresAt : Number.POSITIVE_INFINITY;
  // Personal deadlines are stored at local noon for date-input compatibility;
  // honor the selected calendar day through its end instead of expiring at noon.
  const dueAt = typeof quest.dueAt === 'number' && Number.isFinite(quest.dueAt)
    ? quest.dueAt + 12 * 60 * 60 * 1_000
    : Number.POSITIVE_INFINITY;
  if (input.now > Math.min(expiresAt, dueAt)) return 'expired';
  if (quest.skill !== input.skillId && quest.skill !== input.branchId) return 'skill';
  const requiredMinutes = Math.max(0, Math.min(600, Math.round(Number(quest.requiredMinutes) || 0)));
  if (input.minutes < requiredMinutes) return 'minutes';
  if (quest.requiresEvidence === true && !input.hasEvidence) return 'evidence';
  return 'ok';
}

export type QuestEditEligibilityInput = {
  questSkill: unknown;
  skillId: string;
  branchId: string;
  requiredMinutes: unknown;
  requiresEvidence: unknown;
  minutes: number;
  hasEvidence: boolean;
};

/** Keep an edited practice entry within the conditions of its completed quest. */
export function questEditEligibility(input: QuestEditEligibilityInput): 'ok' | 'skill' | 'minutes' | 'evidence' {
  if (input.questSkill !== input.skillId && input.questSkill !== input.branchId) return 'skill';
  const requiredMinutes = Math.max(0, Math.min(600, Math.round(Number(input.requiredMinutes) || 0)));
  if (input.minutes < requiredMinutes) return 'minutes';
  if (input.requiresEvidence === true && !input.hasEvidence) return 'evidence';
  return 'ok';
}
