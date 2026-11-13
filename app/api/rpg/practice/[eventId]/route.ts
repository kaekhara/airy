import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import { isSkillUnlocked, practiceEditXp, practiceXp, questEditEligibility } from '@/lib/rpg-engine';
import { isSkillProfileGraphValid } from '@/lib/rpg-skills';
import { achievementMetricsFromSummary, buildRpgSummary, mutateRpgSummary, rebuildRpgSummaryAfterMutation, removeProofFromRpgSummary, unlockEligibleAchievementsFromMetrics } from '@/lib/rpg-achievements';
import { readBoundedRequestText } from '@/lib/bounded-request';
import { hasEmbeddedImageEvidence } from '@/lib/image-evidence';
import type { Query } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

const BASE_BRANCHES: Record<string, { leaves: Record<string, number> }> = {
  cyber: { leaves: { 'cyber-net': 1, 'cyber-crypto': 2, 'cyber-web': 3, 'cyber-ctf': 4 } },
  db: { leaves: { 'db-sql': 1, 'db-trig': 2, 'db-roles': 3, 'db-tx': 4 } },
  py: { leaves: { 'py-base': 1, 'py-auto': 2, 'py-api': 3, 'py-test': 4 } },
  ios: { leaves: { 'ios-ui': 1, 'ios-pix': 2, 'ios-anim': 3, 'ios-fb': 4 } },
  art: { leaves: { 'art-bl': 1, 'art-2d': 2, 'art-pres': 3 } },
  lang: { leaves: { 'lang-ko': 1, 'lang-en': 2 } },
};

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function authorize(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return { response: jsonError('ORIGIN_REQUIRED', 403) };
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return { response: jsonError('CROSS_ORIGIN_REQUEST', 403) };
  } catch { return { response: jsonError('INVALID_ORIGIN', 403) }; }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { response: jsonError('AUTH_REQUIRED', 401) };
  let services;
  try { services = getFirebaseAdmin(); } catch {
    return { response: jsonError('SERVER_CONFIG_INVALID', 503) };
  }
  if (!services) return { response: jsonError('SERVER_NOT_CONFIGURED', 503) };
  let user;
  try { user = await services.auth.verifyIdToken(token, true); }
  catch { return { response: jsonError('INVALID_AUTH', 401) }; }
  const now = Date.now();
  let rateLimit;
  try { rateLimit = await consumeServerRateLimit(services.db, user.uid, 'practice-mutation', now, 30); }
  catch { return { response: jsonError('RATE_LIMIT_UNAVAILABLE', 503) }; }
  if (!rateLimit.allowed) return { response: Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter), 'Cache-Control': 'no-store' } }) };
  return { services, user };
}

function skillDefinition(profile: Record<string, unknown>, skillId: string) {
  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  if (hidden.has(skillId)) return null;
  const customBranches = Array.isArray(profile.customBranches) ? profile.customBranches as Array<{ id?: unknown }> : [];
  const customLeaves = Array.isArray(profile.customLeaves) ? profile.customLeaves as Array<{ id?: unknown; branch?: unknown; req?: unknown; difficulty?: unknown; prerequisites?: unknown }> : [];
  const branch = customBranches.find((item) => item.id === skillId);
  if (branch) return { branchId: skillId, isBranch: true, requiredLevel: 1, difficulty: 1, prerequisites: [] as string[] };
  const leaf = customLeaves.find((item) => item.id === skillId);
  if (leaf && typeof leaf.branch === 'string') return {
    branchId: leaf.branch, isBranch: false, requiredLevel: Math.max(1, Math.min(4, Number(leaf.req) || 1)),
    difficulty: Math.max(1, Math.min(5, Number(leaf.difficulty) || 1)),
    prerequisites: Array.isArray(leaf.prerequisites) ? leaf.prerequisites.filter((id): id is string => typeof id === 'string') : [],
  };
  for (const [branchId, config] of Object.entries(BASE_BRANCHES)) {
    if (branchId === skillId) return { branchId, isBranch: true, requiredLevel: 1, difficulty: 1, prerequisites: [] as string[] };
    if (config.leaves[skillId]) return { branchId, isBranch: false, requiredLevel: config.leaves[skillId], difficulty: config.leaves[skillId], prerequisites: [] as string[] };
  }
  return null;
}

function validSkillGraph(profile: Record<string, unknown>) {
  return isSkillProfileGraphValid(profile);
}

async function mutate(request: Request, context: { params: Promise<{ eventId: string }> }, operation: 'PATCH' | 'DELETE') {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const { eventId } = await context.params;
  if (!/^[\w-]{8,180}$/.test(eventId)) return jsonError('INVALID_EVENT', 400);
  let patch: { skill?: unknown; text?: unknown; min?: unknown; link?: unknown } = {};
  if (operation === 'PATCH') {
    try {
      const raw = await readBoundedRequestText(request, 8_000);
      if (raw === null) return jsonError('REQUEST_TOO_LARGE', 413);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return jsonError('INVALID_BODY', 400);
      patch = parsed as typeof patch;
    } catch { return jsonError('INVALID_JSON', 400); }
  }

  const services = auth.services;
  const profileRef = services.db.doc(`data/users/${auth.user.uid}/profile`);
  const proofs = profileRef.collection('proofs');
  const summaryRef = profileRef.collection('system').doc('rpg-summary-v1');
  const eventRef = proofs.doc(eventId);
  try {
    const result = await services.db.runTransaction(async (transaction) => {
      const [profileSnapshot, eventSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(profileRef), transaction.get(eventRef), transaction.get(summaryRef),
      ]);
      if (!eventSnapshot.exists) {
        if (operation === 'DELETE') return { deleted: false, summary: summarySnapshot.exists ? summarySnapshot.data() : undefined };
        throw new Error('EVENT_NOT_FOUND');
      }
      const profile = (profileSnapshot.exists ? profileSnapshot.data() : {}) || {};
      const existing = eventSnapshot.data() || {};
      if (!validSkillGraph(profile)) throw new Error('SKILL_GRAPH_INVALID');
      const currentSummary = summarySnapshot.exists ? summarySnapshot.data() : undefined;
      const currentSummaryIsValid = currentSummary?.version === 7 && profile.rpgSummaryNeedsRebuild !== true;
      let allProofs: Array<Record<string, unknown>> = [];
      let baseSummary = currentSummary;
      const existingDay = typeof existing.day === 'string' ? existing.day : '';
      const dayOutsideWindow = !existingDay || !currentSummary?.dayCounts || !(existingDay in currentSummary.dayCounts);
      const needsFullHistory = !currentSummaryIsValid || dayOutsideWindow;
      if (needsFullHistory) {
        const allProofsSnapshot = await transaction.get((proofs as Query).orderBy('ts', 'asc'));
        allProofs = allProofsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
        baseSummary = buildRpgSummary(allProofs, profile);
      }
      const existingQuest = typeof existing.quest === 'string' ? existing.quest : '';
      let questStillCompleted = false;
      if (existingQuest && !needsFullHistory) {
        const questProofs = await transaction.get(proofs.where('quest', '==', existingQuest).limit(2));
        questStillCompleted = questProofs.docs.some((doc) => doc.id !== eventId);
      }
      let nextEntry: Record<string, unknown> | null = null;

      if (operation === 'PATCH') {
        const skill = typeof patch.skill === 'string' ? patch.skill : '';
        const text = typeof patch.text === 'string' ? patch.text.trim() : '';
        const minutes = Math.round(Number(patch.min));
        const link = typeof patch.link === 'string' ? patch.link.trim().slice(0, 2_048) : '';
        if (!skill || text.length < 3 || text.length > 600 || !Number.isFinite(minutes) || minutes < 5 || minutes > 600 || (link && !/^https?:\/\//i.test(link))) throw new Error('INVALID_PRACTICE');
        const skillInfo = skillDefinition(profile, skill);
        if (!skillInfo || (skillInfo.branchId !== skill && !skillDefinition(profile, skillInfo.branchId))) throw new Error('SKILL_LOCKED');
        const questId = typeof existing.quest === 'string' ? existing.quest : '';
        if (questId) {
          const currentQuest = Array.isArray(profile.quests)
            ? (profile.quests as Array<Record<string, unknown>>).find((item) => item.id === questId)
            : undefined;
          const history = Array.isArray(profile.questHistory) ? profile.questHistory as Array<Record<string, unknown>> : [];
          const completion = history.find((item) => item.id === questId || item.eventId === eventId);
          const source = currentQuest || completion;
          const savedRequirement = Number(source?.requiredMinutes);
          const requiredMinutes = Number.isFinite(savedRequirement) && savedRequirement > 0
            ? Math.max(0, Math.min(600, Math.round(savedRequirement)))
            : source?.period === 'personal'
              ? Math.max(15, Number(existing.min) || 15)
              : Math.max(0, Number(existing.min) || 0);
          const eligibility = questEditEligibility({
            questSkill: source && typeof source.skill === 'string' ? source.skill : existing.skill,
            skillId: skill,
            branchId: skillInfo.branchId,
            requiredMinutes,
            requiresEvidence: source?.requiresEvidence === true,
            minutes,
            hasEvidence: Boolean(link || hasEmbeddedImageEvidence(existing.imgs)),
          });
          if (eligibility !== 'ok') throw new Error(`QUEST_${eligibility.toUpperCase()}`);
        }
        const beforeSummary = needsFullHistory ? buildRpgSummary(allProofs.filter((proof) => proof.id !== eventId), profile) : removeProofFromRpgSummary(baseSummary, existing, profile, { questStillCompleted });
        if (!skillInfo.isBranch && !isSkillUnlocked({ branchXp: beforeSummary.branchXp[skillInfo.branchId] || 0, requiredBranchLevel: skillInfo.requiredLevel, prerequisites: skillInfo.prerequisites, skillXp: beforeSummary.skillXp })) throw new Error('SKILL_LOCKED');
        const images = Array.isArray(existing.imgs) ? existing.imgs : [];
        const bonus = Math.max(0, Math.min(10, Math.round(Number(existing.bonus) || 0)));
        const questBonus = typeof existing.quest === 'string' && existing.quest ? 10 : 0;
        const recalculatedXp = practiceXp({ minutes, hasLink: Boolean(link), imageCount: images.length, textLength: text.length, difficulty: skillInfo.difficulty, questBonus, streakBonus: bonus });
        const xp = practiceEditXp(existing.xp, recalculatedXp);
        nextEntry = { ...existing, skill, text, min: minutes, link, xp, branchXp: skillInfo.isBranch ? xp : Math.round(xp * 0.4) };
      }

      const summary = !needsFullHistory
        ? mutateRpgSummary(baseSummary, existing, nextEntry, profile, { questStillCompleted })
        : rebuildRpgSummaryAfterMutation(allProofs, eventId, nextEntry, profile);
      const transactionProfilePatch: Record<string, unknown> = { rpgRulesVersion: 1, rpgSummaryUpdatedAt: Date.now() };
      let earned: unknown[] = [];
      if (operation === 'PATCH') {
        const awards = unlockEligibleAchievementsFromMetrics(achievementMetricsFromSummary(summary, profile), profile, Date.now());
        earned = awards.fresh;
        if (awards.fresh.length) {
          transactionProfilePatch.achievementUnlocks = awards.ledger;
          transactionProfilePatch.unlockedTitles = awards.titles;
        }
        transaction.set(eventRef, nextEntry!, { merge: true });
      } else transaction.delete(eventRef);
      transaction.set(summaryRef, summary);
      transaction.set(profileRef, transactionProfilePatch, { merge: true });
      return { deleted: operation === 'DELETE', entry: nextEntry ? { id: eventId, ...nextEntry } : undefined, earned, summary };
    });
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const errors: Record<string, [number, string]> = {
      EVENT_NOT_FOUND: [404, 'EVENT_NOT_FOUND'], INVALID_PRACTICE: [400, 'INVALID_PRACTICE'], SKILL_LOCKED: [409, 'SKILL_LOCKED'], SKILL_GRAPH_INVALID: [409, 'SKILL_GRAPH_INVALID'],
      QUEST_SKILL: [409, 'QUEST_SKILL'], QUEST_MINUTES: [409, 'QUEST_MINUTES'], QUEST_EVIDENCE: [409, 'QUEST_EVIDENCE'],
    };
    const [status, errorCode] = errors[code] || [500, 'PRACTICE_MUTATION_FAILED'];
    if (status === 500) console.error('[rpg-practice-mutation] failed', { code: error instanceof Error ? error.name : 'UnknownError' });
    return jsonError(errorCode, status);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return mutate(request, context, 'PATCH');
}

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return mutate(request, context, 'DELETE');
}
