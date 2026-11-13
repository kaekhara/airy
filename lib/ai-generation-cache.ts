import { createHash } from 'node:crypto';

type SkillBranchContext = { id: string; name: string; skillNames: string[] };
type QuestSkillContext = { id: string; name: string; branch: string; branchName: string; level: number; xp: number };

/** A per-user fingerprint for a skill plan, including the current tree context. */
export function createSkillDraftCacheKey(input: {
  uid: string;
  objective: string;
  language: string;
  branches: SkillBranchContext[];
  progress: string;
}) {
  const canonical = JSON.stringify({
    version: 1,
    uid: input.uid,
    objective: input.objective.trim().toLocaleLowerCase(),
    language: input.language,
    branches: input.branches,
    progress: input.progress,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** A per-user quest draft fingerprint; changing unlocked skills or progress invalidates it. */
export function createQuestDraftCacheKey(input: {
  uid: string;
  objective: string;
  language: string;
  includeProgress: boolean;
  skills: QuestSkillContext[];
}) {
  const canonical = JSON.stringify({
    version: 1,
    uid: input.uid,
    objective: input.objective.trim().toLocaleLowerCase(),
    language: input.language,
    includeProgress: input.includeProgress,
    skills: input.skills,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function readSkillDraftCache(entry: unknown, key: string, now: number): unknown | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const cache = entry as { key?: unknown; expiresAtMs?: unknown; draft?: unknown };
  if (cache.key !== key || typeof cache.expiresAtMs !== 'number' || cache.expiresAtMs <= now) return null;
  return cache.draft ?? null;
}
