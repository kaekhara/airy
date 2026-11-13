import { isSkillGraphAcyclic, isSkillUnlocked, levelForXp } from '@/lib/rpg-engine';

export const BASE_SKILLS = {
  cyber: { name: 'Кибербезопасность', leaves: { 'cyber-net': ['Сети', 1], 'cyber-crypto': ['Криптография', 2], 'cyber-web': ['Веб-уязвимости', 3], 'cyber-ctf': ['CTF и практика', 4] } },
  db: { name: 'Базы данных', leaves: { 'db-sql': ['SQL-запросы', 1], 'db-trig': ['Триггеры и функции', 2], 'db-roles': ['Роли и безопасность', 3], 'db-tx': ['Транзакции и репликация', 4] } },
  py: { name: 'Python', leaves: { 'py-base': ['Основы', 1], 'py-auto': ['Скрипты и автоматизация', 2], 'py-api': ['FastAPI', 3], 'py-test': ['Тесты и чистый код', 4] } },
  ios: { name: 'SwiftUI и iOS', leaves: { 'ios-ui': ['Экраны SwiftUI', 1], 'ios-pix': ['UI точно по макету', 2], 'ios-anim': ['Анимации', 3], 'ios-fb': ['Firebase и данные', 4] } },
  art: { name: 'Дизайн и 3D', leaves: { 'art-bl': ['Blender', 1], 'art-2d': ['2D-анимация', 2], 'art-pres': ['Презентации', 3] } },
  lang: { name: 'Языки', leaves: { 'lang-ko': ['Корейский', 1], 'lang-en': ['Английский для IT', 2] } },
} as const;

type Row = { id: string; name: string; branch: string; level: number; xp: number; isBranch: boolean };
type Profile = Record<string, unknown>;
type Summary = Record<string, unknown>;

// Keep profile-controlled graph work bounded before copying arrays into the
// graph validator. Firestore profiles are user-editable, so every server path
// that interprets the tree should apply this same limit.
export const MAX_CUSTOM_SKILL_NODES = 2_000;

export function isSkillProfileGraphValid(profile: Profile): boolean {
  const rawBranches = profile.customBranches;
  const rawLeaves = profile.customLeaves;
  if (rawBranches !== undefined && !Array.isArray(rawBranches)) return false;
  if (rawLeaves !== undefined && !Array.isArray(rawLeaves)) return false;
  const branches = (Array.isArray(rawBranches) ? rawBranches : []) as Array<{ id?: unknown }>;
  const leaves = (Array.isArray(rawLeaves) ? rawLeaves : []) as Array<{ id?: unknown; branch?: unknown; prerequisites?: unknown }>;
  if (branches.some((branch) => !branch || typeof branch !== 'object' || Array.isArray(branch))
    || leaves.some((leaf) => !leaf || typeof leaf !== 'object' || Array.isArray(leaf))) return false;
  if (branches.length + leaves.length > MAX_CUSTOM_SKILL_NODES) return false;

  // A custom leaf must belong to a branch that is actually part of this
  // profile. The DAG validator below only knows IDs, so without this check an
  // orphaned leaf could pass graph validation and then disappear from every
  // tree/recommendation view that resolves leaves through their parent.
  const branchIds = new Set<string>([
    ...Object.keys(BASE_SKILLS),
    ...branches.flatMap((branch) => typeof branch.id === 'string' ? [branch.id] : []),
  ]);
  if (leaves.some((leaf) => typeof leaf.branch !== 'string' || !branchIds.has(leaf.branch))) return false;

  const ids: unknown[] = [
    ...Object.keys(BASE_SKILLS),
    ...Object.values(BASE_SKILLS).flatMap((branch) => Object.keys(branch.leaves)),
    ...branches.map((branch) => branch.id),
    ...leaves.map((leaf) => leaf.id),
  ];
  return isSkillGraphAcyclic(leaves.map((leaf) => ({ id: leaf.id, prerequisites: leaf.prerequisites })), ids);
}

export function unlockedQuestSkills(profile: Profile, summary: Summary): Row[] {
  if (!isSkillProfileGraphValid(profile)) throw new Error('SKILL_GRAPH_INVALID');
  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  const customBranches = Array.isArray(profile.customBranches) ? profile.customBranches as Array<{ id?: unknown; name?: unknown }> : [];
  const customLeaves = Array.isArray(profile.customLeaves) ? profile.customLeaves as Array<{ id?: unknown; name?: unknown; branch?: unknown; req?: unknown; prerequisites?: unknown }> : [];
  const branchXp = summary.branchXp && typeof summary.branchXp === 'object' ? summary.branchXp as Record<string, number> : {};
  const skillXp = summary.skillXp && typeof summary.skillXp === 'object' ? summary.skillXp as Record<string, number> : {};
  const branchNames = new Map<string, string>(Object.entries(BASE_SKILLS).map(([id, row]) => [id, row.name]));
  const branchIds = [...branchNames.keys(), ...customBranches.flatMap((row) => typeof row.id === 'string' && !hidden.has(row.id) ? [row.id] : [])];
  const leaves: Array<{ id: string; branch: string; name: string; req: number; prerequisites: string[] }> = [];
  const allIds: string[] = [...branchIds];

  for (const [branchId, branch] of Object.entries(BASE_SKILLS)) {
    if (hidden.has(branchId)) continue;
    for (const [id, [name, req]] of Object.entries(branch.leaves)) {
      allIds.push(id);
      if (!hidden.has(id)) leaves.push({ id, branch: branchId, name, req, prerequisites: [] });
    }
  }
  for (const branch of customBranches) {
    if (typeof branch.id !== 'string' || !/^[\w-]{1,100}$/.test(branch.id) || hidden.has(branch.id)) continue;
    branchNames.set(branch.id, typeof branch.name === 'string' ? branch.name.slice(0, 80) : 'Новая ветка');
  }
  for (const leaf of customLeaves) if (typeof leaf.id === 'string') allIds.push(leaf.id);
  if (!isSkillGraphAcyclic(customLeaves.map((leaf) => ({ id: leaf.id, prerequisites: leaf.prerequisites })), allIds)) throw new Error('SKILL_GRAPH_INVALID');
  for (const leaf of customLeaves) {
    if (typeof leaf.id !== 'string' || typeof leaf.branch !== 'string' || !branchNames.has(leaf.branch) || hidden.has(leaf.id) || hidden.has(leaf.branch)) continue;
    leaves.push({ id: leaf.id, branch: leaf.branch, name: typeof leaf.name === 'string' ? leaf.name.slice(0, 100) : 'Новый навык', req: Math.max(1, Math.min(4, Number(leaf.req) || 1)), prerequisites: Array.isArray(leaf.prerequisites) ? leaf.prerequisites.filter((id): id is string => typeof id === 'string') : [] });
  }

  const rows: Row[] = [];
  for (const [id, name] of branchNames) if (!hidden.has(id)) rows.push({ id, name, branch: id, level: levelForXp(Number(branchXp[id]) || 0, 25, 10).level, xp: Math.max(0, Number(branchXp[id]) || 0), isBranch: true });
  for (const leaf of leaves) {
    const unlocked = isSkillUnlocked({ branchXp: Number(branchXp[leaf.branch]) || 0, requiredBranchLevel: leaf.req, prerequisites: leaf.prerequisites, skillXp });
    if (unlocked) rows.push({ id: leaf.id, name: leaf.name, branch: leaf.branch, level: levelForXp(Number(skillXp[leaf.id]) || 0, 20, 10).level, xp: Math.max(0, Number(skillXp[leaf.id]) || 0), isBranch: false });
  }
  return rows;
}
