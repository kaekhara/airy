import { createHash, randomUUID } from 'node:crypto';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import { isSkillUnlocked } from '@/lib/rpg-engine';
import { isSkillProfileGraphValid } from '@/lib/rpg-skills';
import { isQuestDueAtValid, recurringQuestSpecs } from '@/lib/rpg-quests';
import { archiveCompletedQuests } from '@/lib/quest-history';
import { readBoundedRequestText } from '@/lib/bounded-request';

export const runtime = 'nodejs';

const BASE = {
  cyber: { name: 'Кибербезопасность', leaves: { 'cyber-net': 1, 'cyber-crypto': 2, 'cyber-web': 3, 'cyber-ctf': 4 } },
  db: { name: 'Базы данных', leaves: { 'db-sql': 1, 'db-trig': 2, 'db-roles': 3, 'db-tx': 4 } },
  py: { name: 'Python', leaves: { 'py-base': 1, 'py-auto': 2, 'py-api': 3, 'py-test': 4 } },
  ios: { name: 'SwiftUI и iOS', leaves: { 'ios-ui': 1, 'ios-pix': 2, 'ios-anim': 3, 'ios-fb': 4 } },
  art: { name: 'Дизайн и 3D', leaves: { 'art-bl': 1, 'art-2d': 2, 'art-pres': 3 } },
  lang: { name: 'Языки', leaves: { 'lang-ko': 1, 'lang-en': 2 } },
} as const;

type TaskInput = { skill?: unknown; title?: unknown; requiredMinutes?: unknown; requiresEvidence?: unknown; dueAt?: unknown };
type Profile = Record<string, unknown>;

function responseError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function skillsFor(profile: Profile) {
  if (!isSkillProfileGraphValid(profile)) throw new Error('SKILL_GRAPH_INVALID');
  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  const branches = Array.isArray(profile.customBranches) ? profile.customBranches as Array<{ id?: unknown }> : [];
  const leaves = Array.isArray(profile.customLeaves) ? profile.customLeaves as Array<{ id?: unknown; branch?: unknown; req?: unknown; prerequisites?: unknown }> : [];
  const result = new Map<string, { branchId: string; branch: boolean; requiredLevel: number; prerequisites: string[] }>();
  for (const id of Object.keys(BASE)) if (!hidden.has(id)) result.set(id, { branchId: id, branch: true, requiredLevel: 1, prerequisites: [] });
  for (const [branchId, data] of Object.entries(BASE)) {
    if (hidden.has(branchId)) continue;
    for (const [id, requiredLevel] of Object.entries(data.leaves)) if (!hidden.has(id)) result.set(id, { branchId, branch: false, requiredLevel, prerequisites: [] });
  }
  for (const item of branches) if (typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id) && !hidden.has(item.id)) result.set(item.id, { branchId: item.id, branch: true, requiredLevel: 1, prerequisites: [] });
  for (const item of leaves) {
    if (typeof item.id !== 'string' || typeof item.branch !== 'string' || hidden.has(item.id) || hidden.has(item.branch)) continue;
    result.set(item.id, { branchId: item.branch, branch: false, requiredLevel: Math.max(1, Math.min(4, Number(item.req) || 1)), prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.filter((id): id is string => typeof id === 'string') : [] });
  }
  return result;
}

function cleanQuests(value: unknown) {
  if (!Array.isArray(value)) return [];
  if (value.length > 500) throw new Error('QUESTS_INVALID');
  return value.flatMap((item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' ? [item as Record<string, unknown>] : []);
}

function taskRecords(input: unknown, profile: Profile, summary: Record<string, unknown>, now: number) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) throw new Error('QUESTS_INVALID');
  const skills = skillsFor(profile), branchXp = summary.branchXp && typeof summary.branchXp === 'object' ? summary.branchXp as Record<string, number> : {};
  const skillXp = summary.skillXp && typeof summary.skillXp === 'object' ? summary.skillXp as Record<string, number> : {};
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('QUESTS_INVALID');
    const item = raw as TaskInput, skill = typeof item.skill === 'string' ? item.skill : '', title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : '';
    const definition = skills.get(skill);
    if (!definition || title.length < 3) throw new Error('QUESTS_INVALID');
    if (!definition.branch && !isSkillUnlocked({ branchXp: Number(branchXp[definition.branchId]) || 0, requiredBranchLevel: definition.requiredLevel, prerequisites: definition.prerequisites, skillXp })) throw new Error('SKILL_LOCKED');
    const requiredMinutes = Math.max(15, Math.min(600, Math.round(Number(item.requiredMinutes) || 15)));
    const dueAt = item.dueAt === undefined || item.dueAt === null || item.dueAt === '' ? undefined : Number(item.dueAt);
    if (dueAt !== undefined && !isQuestDueAtValid(dueAt, now)) throw new Error('QUESTS_INVALID');
    return { id: `q-${randomUUID()}`, period: 'personal', skill, title, requiredMinutes, requiresEvidence: item.requiresEvidence === true, createdAt: now, ...(dueAt === undefined ? {} : { dueAt }), done: false };
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return responseError('ORIGIN_REQUIRED', 403);
  try { if (new URL(origin).origin !== new URL(request.url).origin) return responseError('CROSS_ORIGIN_REQUEST', 403); }
  catch { return responseError('INVALID_ORIGIN', 403); }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return responseError('AUTH_REQUIRED', 401);
  let services;
  try { services = getFirebaseAdmin(); } catch { return responseError('SERVER_CONFIG_INVALID', 503); }
  if (!services) return responseError('SERVER_NOT_CONFIGURED', 503);
  let user;
  try { user = await services.auth.verifyIdToken(token, true); }
  catch { return responseError('INVALID_AUTH', 401); }
  try {
    const rate = await consumeServerRateLimit(services.db, user.uid, 'quests', Date.now(), 40);
    if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter), 'Cache-Control': 'no-store' } });
  } catch { return responseError('RATE_LIMIT_UNAVAILABLE', 503); }

  let body: { action?: unknown; offset?: unknown; quests?: unknown; requestId?: unknown; id?: unknown; dueAt?: unknown; skillIds?: unknown; profilePatch?: unknown; sourceId?: unknown };
  try {
    const raw = await readBoundedRequestText(request, 24_000);
    if (raw === null) return responseError('REQUEST_TOO_LARGE', 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return responseError('INVALID_BODY', 400);
    body = parsed as typeof body;
  } catch { return responseError('INVALID_JSON', 400); }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!['sync', 'add', 'reschedule', 'remove', 'remove-for-skills', 'repeat', 'purge-archive'].includes(action)) return responseError('ACTION_INVALID', 400);
  const requestId = action === 'add' && typeof body.requestId === 'string' && /^[\w-]{8,100}$/.test(body.requestId) ? body.requestId : '';
  if (action === 'add' && !requestId) return responseError('REQUEST_ID_REQUIRED', 400);
  const requestFingerprint = action === 'add' ? createHash('sha256').update(JSON.stringify(body.quests ?? null)).digest('hex') : '';
  const now = Date.now(), offset = Math.round(Number(body.offset));
  if (action === 'sync' && (!Number.isFinite(offset) || offset < -720 || offset > 840)) return responseError('OFFSET_INVALID', 400);
  const profileRef = services.db.doc(`data/users/${user.uid}/profile`);
  const summaryRef = profileRef.collection('system').doc('rpg-summary-v1');
  const idempotencyRef = action === 'add' ? profileRef.collection('system').doc(`quests-add-${requestId}`) : null;
  try {
    const result = await services.db.runTransaction(async (transaction) => {
      const [profileSnapshot, summarySnapshot, idempotencySnapshot] = await Promise.all([
        transaction.get(profileRef), transaction.get(summaryRef),
        idempotencyRef ? transaction.get(idempotencyRef) : Promise.resolve(null),
      ]);
      const profile = (profileSnapshot.exists ? profileSnapshot.data() : {}) || {};
      const previous = cleanQuests(profile.quests);
      let next = previous;
      const profilePatch: Record<string, unknown> = {};

      if (idempotencySnapshot?.exists) {
        if (idempotencySnapshot.get('fingerprint') !== requestFingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        return { quests: previous, profilePatch: {}, replayed: true };
      }

      if (action === 'sync') {
        const specs = recurringQuestSpecs(profile, now, offset);
        const byId = new Map(previous.map((quest) => [quest.id, quest]));
        const questHistory = archiveCompletedQuests(profile.questHistory, previous, now);
        const completedIds = new Set(questHistory.map((quest) => quest.id));
        const retainedPersonal = previous.filter((quest) => quest.period === 'personal' && quest.done !== true);
        const current = specs.map((spec) => {
          const old = byId.get(spec.id);
          const archivedCompletion = questHistory.find((quest) => quest.id === spec.id);
          return old?.done === true || completedIds.has(spec.id)
            ? { ...spec, createdAt: Number(old?.createdAt) || spec.createdAt, done: true, completedAt: Number(old?.completedAt) || archivedCompletion?.completedAt || spec.createdAt }
            : spec;
        });
        next = retainedPersonal.concat(current);
        profilePatch.questHistory = questHistory;
        if (next.filter((quest) => quest.done !== true).length > 80) throw new Error('QUEST_LIMIT');
      } else if (action === 'add') {
        const existing = previous.filter((quest) => quest.done !== true).length;
        if (existing + (Array.isArray(body.quests) ? body.quests.length : 99) > 80) throw new Error('QUEST_LIMIT');
        const summaryVersion = summarySnapshot.exists ? Number(summarySnapshot.get('version')) : 0;
        const summary = [2, 3, 4, 5, 6, 7].includes(summaryVersion) ? summarySnapshot.data() || {} : {};
        next = previous.concat(taskRecords(body.quests, profile, summary, now));
      } else if (action === 'reschedule') {
        if (typeof body.id !== 'string' || !/^[\w-]{1,160}$/.test(body.id)) throw new Error('QUESTS_INVALID');
        const dueAt = Number(body.dueAt);
        if (!isQuestDueAtValid(dueAt, now)) throw new Error('QUESTS_INVALID');
        const target = previous.find((quest) => quest.id === body.id);
        if (!target || target.period !== 'personal' || target.done === true) throw new Error('QUEST_NOT_FOUND');
        next = previous.map((quest) => quest.id === body.id ? { ...quest, dueAt } : quest);
      } else if (action === 'remove') {
        if (typeof body.id !== 'string' || !/^[\w-]{1,160}$/.test(body.id)) throw new Error('QUESTS_INVALID');
        next = previous.filter((quest) => quest.id !== body.id || quest.period === 'daily' || quest.period === 'weekly' || quest.period === 'boss' || quest.done === true);
      } else if (action === 'remove-for-skills') {
        if (!Array.isArray(body.skillIds) || body.skillIds.length > 100 || body.skillIds.some((id) => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))) throw new Error('QUESTS_INVALID');
        const removed = new Set(body.skillIds as string[]);
        next = previous.filter((quest) => !removed.has(String(quest.skill)) || quest.done === true);
        const skillArchiveMeta = profile.skillArchiveMeta && typeof profile.skillArchiveMeta === 'object' && !Array.isArray(profile.skillArchiveMeta)
          ? { ...(profile.skillArchiveMeta as Record<string, unknown>) }
          : {};
        for (const id of removed) if (!Object.hasOwn(skillArchiveMeta, id)) skillArchiveMeta[id] = { archivedAt: now };
        profilePatch.skillArchiveMeta = skillArchiveMeta;
        if (body.profilePatch && typeof body.profilePatch === 'object' && !Array.isArray(body.profilePatch)) {
          const patch = body.profilePatch as Record<string, unknown>;
          if (Array.isArray(patch.hiddenSkills) && patch.hiddenSkills.length <= 3_000 && patch.hiddenSkills.every((id) => typeof id === 'string' && /^[\w-]{1,100}$/.test(id))) profilePatch.hiddenSkills = patch.hiddenSkills;
        }
      } else if (action === 'purge-archive') {
        if (typeof body.id !== 'string' || !/^[\w-]{1,100}$/.test(body.id)) throw new Error('QUESTS_INVALID');
        const purged = Array.isArray(profile.purgedQuestArchiveIds) ? profile.purgedQuestArchiveIds.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,100}$/.test(id)) : [];
        const history = Array.isArray(profile.questHistory) ? profile.questHistory : [];
        const archivedQuest = previous.find((quest) => quest.id === body.id && quest.done === true);
        if (!purged.includes(body.id) && !history.some((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === body.id) && !archivedQuest) throw new Error('QUEST_NOT_FOUND');
        if (!purged.includes(body.id)) purged.push(body.id);
        if (purged.length > 5_000) throw new Error('QUEST_ARCHIVE_LIMIT');
        profilePatch.purgedQuestArchiveIds = purged;
        profilePatch.questHistory = history.filter((entry) => !entry || typeof entry !== 'object' || (entry as Record<string, unknown>).id !== body.id);
        next = previous.filter((quest) => quest.id !== body.id);
      } else {
        if (typeof body.sourceId !== 'string' || !/^[\w-]{1,160}$/.test(body.sourceId)) throw new Error('QUESTS_INVALID');
        const source = Array.isArray(profile.questHistory) ? (profile.questHistory as Array<Record<string, unknown>>).find((entry) => entry.id === body.sourceId) : undefined;
        if (!source || typeof source.skill !== 'string' || typeof source.title !== 'string') throw new Error('QUEST_NOT_FOUND');
        if (previous.filter((quest) => quest.done !== true).length >= 80) throw new Error('QUEST_LIMIT');
        const summaryVersion = summarySnapshot.exists ? Number(summarySnapshot.get('version')) : 0;
        const summary = [2, 3, 4, 5, 6, 7].includes(summaryVersion) ? summarySnapshot.data() || {} : {};
        next = previous.concat(taskRecords([{ skill: source.skill, title: source.title, requiredMinutes: source.requiredMinutes, requiresEvidence: source.requiresEvidence === true }], profile, summary, now));
      }
      const changed = JSON.stringify(previous) !== JSON.stringify(next) || Object.keys(profilePatch).some((key) => JSON.stringify(profile[key]) !== JSON.stringify(profilePatch[key]));
      if (changed) transaction.set(profileRef, { ...profilePatch, quests: next }, { merge: true });
      if (idempotencyRef) transaction.create(idempotencyRef, {
        fingerprint: requestFingerprint,
        questIds: next.slice(previous.length).map((quest) => quest.id),
        createdAt: now,
      });
      return { quests: next, profilePatch, replayed: false };
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [number, string]> = {
      QUESTS_INVALID: [400, 'QUESTS_INVALID'], QUEST_LIMIT: [409, 'QUEST_LIMIT'], QUEST_ARCHIVE_LIMIT: [409, 'QUEST_ARCHIVE_LIMIT'], SKILL_LOCKED: [409, 'SKILL_LOCKED'],
      SKILL_GRAPH_INVALID: [409, 'SKILL_GRAPH_INVALID'], QUEST_NOT_FOUND: [404, 'QUEST_NOT_FOUND'],
      IDEMPOTENCY_CONFLICT: [409, 'IDEMPOTENCY_CONFLICT'],
    };
    const [status, errorCode] = known[code] || [500, 'QUESTS_SAVE_FAILED'];
    if (status === 500) console.error('[rpg-quests] mutation failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return responseError(errorCode, status);
  }
}
