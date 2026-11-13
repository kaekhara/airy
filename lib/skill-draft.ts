import { levelForXp } from '@/lib/rpg-engine';

type SkillBranch = { id: string; name: string; skillNames: string[]; skillIds?: Record<string, string> };

export function formatSkillProgressContext(
  branches: SkillBranch[],
  branchXp: Record<string, unknown>,
  skillXp: Record<string, unknown>,
) {
  const amount = (value: unknown) => Math.max(0, Math.min(1_000_000_000, Number(value) || 0));
  return branches.map((branch) => {
    const branchAmount = amount(branchXp[branch.id]);
    const branchLevel = levelForXp(branchAmount, 25, 10).level;
    const skills = branch.skillNames.map((name) => {
      const skillAmount = amount(skillXp[branch.skillIds?.[name] || '']);
      return skillAmount > 0
        ? `${name} (ур. ${levelForXp(skillAmount, 20, 10).level}, ${skillAmount} XP)`
        : `${name} (ещё не начат)`;
    });
    return `${branch.name}: уровень ${branchLevel}, ${branchAmount} XP; навыки: ${skills.join(', ')}`;
  }).join('; ');
}

export function selectRelevantSkillBranches(
  objective: string,
  branches: SkillBranch[],
  progress: Array<{ id: string; level: number; xp: number }> = [],
  alwaysIncludeIds: string[] = [],
  maxBranches = 30,
) {
  const tokens = (value: string) => value.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || [];
  const target = new Set(tokens(objective));
  const progressById = new Map(progress.map((row) => [row.id, row]));
  const always = new Set(alwaysIncludeIds);
  const score = (branch: SkillBranch) => {
    const nameTokens = tokens(branch.name);
    const skillTokens = branch.skillNames.slice(0, 60).flatMap(tokens);
    let value = nameTokens.reduce((sum, token) => sum + (target.has(token) ? 5 : 0), 0)
      + skillTokens.reduce((sum, token) => sum + (target.has(token) ? 1 : 0), 0);
    const activity = progressById.get(branch.id);
    if (activity) value += Math.min(3, Math.max(0, activity.level - 1) * 0.5 + Math.log2(1 + Math.max(0, activity.xp)) / 4);
    if (always.has(branch.id)) value += 1_000;
    return value;
  };
  const ordered = branches.map((branch, index) => ({ branch, index, score: score(branch) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(6, Math.min(40, Math.round(maxBranches) || 30)));
  return ordered.map(({ branch }) => {
    const relevant = branch.skillNames.map((name, index) => ({ name, index, score: tokens(name).reduce((sum, token) => sum + (target.has(token) ? 1 : 0), 0) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 12).sort((left, right) => left.index - right.index).map((row) => row.name);
    return { ...branch, skillNames: relevant };
  });
}

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

export function sanitizeSkillDraft(value: unknown, branches: SkillBranch[], additionalKnownNames: string[] = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI_BAD_RESPONSE');
  const candidate = value as { place?: unknown; branch?: unknown; skills?: unknown };
  const place = typeof candidate.place === 'string' && branches.some((branch) => branch.id === candidate.place) ? candidate.place : null;
  const branchName = place ? branches.find((branch) => branch.id === place)!.name : clean(candidate.branch, 40);
  if (branchName.length < 2 || (!place && branches.some((branch) => branch.name.toLocaleLowerCase() === branchName.toLocaleLowerCase()))) {
    throw new Error('AI_BAD_RESPONSE');
  }
  if (!Array.isArray(candidate.skills)) throw new Error('AI_BAD_RESPONSE');
  const allKnown = new Set([...branches.flatMap((branch) => [branch.name, ...branch.skillNames]), ...additionalKnownNames].map((name) => name.trim().toLocaleLowerCase()));
  const acceptedNames = new Set<string>();
  const skills = candidate.skills.slice(0, 5).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const name = clean(item.name, 40), normalized = name.toLocaleLowerCase();
    const description = clean(item.description, 180), quest = clean(item.quest, 180), success = clean(item.success, 180);
    if (name.length < 2 || description.length < 8 || quest.length < 8 || success.length < 8 || allKnown.has(normalized) || acceptedNames.has(normalized)) return [];
    const rawPrerequisites = Array.isArray(item.prerequisites) ? item.prerequisites : [];
    const prerequisites = Array.from(new Set(rawPrerequisites.flatMap((entry) => {
      const prerequisite = clean(entry, 60);
      return prerequisite && acceptedNames.has(prerequisite.toLocaleLowerCase()) ? [prerequisite.toLocaleLowerCase()] : [];
    }))).slice(0, 5);
    const kind = ['normal', 'important', 'challenge', 'boss'].includes(String(item.kind)) ? String(item.kind) : 'normal';
    const materials = Array.isArray(item.materials)
      ? item.materials.slice(0, 3).map((material) => clean(material, 80)).filter(Boolean)
      : [];
    acceptedNames.add(normalized);
    return [{
      name,
      description,
      difficulty: Math.max(1, Math.min(5, Math.round(Number(item.difficulty) || Math.min(5, index + 1)))),
      prerequisites,
      quest,
      success,
      xp: Math.max(5, Math.min(100, Math.round(Number(item.xp) || 15 + index * 5))),
      minutes: Math.max(15, Math.min(600, Math.round(Number(item.minutes) || 30))),
      materials,
      kind,
      req: index === 0 ? 1 : Math.max(1, Math.min(4, Math.round(Number(item.req) || Math.min(4, index + 1)))),
    }];
  });
  if (skills.length < 3) throw new Error('AI_BAD_RESPONSE');
  return { place, branch: branchName, skills };
}
