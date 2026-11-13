import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { dailyStreakBonus, isSkillUnlocked, practiceXp, questEligibility } from '@/lib/rpg-engine';
import { isSkillProfileGraphValid } from '@/lib/rpg-skills';
import { addProofToRpgSummary, achievementMetricsFromSummary, buildRpgSummary, createRpgSummaryBuilder, unlockEligibleAchievementsFromMetrics } from '@/lib/rpg-achievements';
import { appendQuestCompletion } from '@/lib/quest-history';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import { isFirestorePermissionDenied } from '@/lib/firestore-errors';
import { isCanonicalRecurringQuest } from '@/lib/rpg-quests';
import { readBoundedRequestText } from '@/lib/bounded-request';
import { countEmbeddedImageEvidence, isSupportedImageDataUrl } from '@/lib/image-evidence';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 900_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const BASE_BRANCHES: Record<string, { leaves: Record<string, number> }> = {
  cyber: { leaves: { 'cyber-net': 1, 'cyber-crypto': 2, 'cyber-web': 3, 'cyber-ctf': 4 } },
  db: { leaves: { 'db-sql': 1, 'db-trig': 2, 'db-roles': 3, 'db-tx': 4 } },
  py: { leaves: { 'py-base': 1, 'py-auto': 2, 'py-api': 3, 'py-test': 4 } },
  ios: { leaves: { 'ios-ui': 1, 'ios-pix': 2, 'ios-anim': 3, 'ios-fb': 4 } },
  art: { leaves: { 'art-bl': 1, 'art-2d': 2, 'art-pres': 3 } },
  lang: { leaves: { 'lang-ko': 1, 'lang-en': 2 } },
};

type PracticeBody = {
  eventId?: unknown;
  skill?: unknown;
  text?: unknown;
  min?: unknown;
  link?: unknown;
  imgs?: unknown;
  questId?: unknown;
  utcOffsetMinutes?: unknown;
};

function safeImages(value: unknown) {
  if (!Array.isArray(value) || value.length > 8) return null;
  const images: Array<{ id?: string; d?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const image = item as { id?: unknown; d?: unknown };
    if (typeof image.id === 'string' && /^[\w-]{1,180}$/.test(image.id)) images.push({ id: image.id });
    else if (isSupportedImageDataUrl(image.d)) {
      images.push({ d: image.d });
    }
    else return null;
  }
  return images;
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function readLegacyProofHistory(query: Query, profile: Record<string, unknown>) {
  const builder = createRpgSummaryBuilder(profile);
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let pageQuery = query.orderBy('ts', 'asc').limit(1_000);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    for (const snapshot of page.docs) builder.add(snapshot.data() as Record<string, unknown>);
    if (page.docs.length < 1_000) return builder.finish();
    cursor = page.docs[page.docs.length - 1];
  }
}

function summaryBranchFingerprint(profile: Record<string, unknown>) {
  return JSON.stringify([profile.customBranches || [], profile.customLeaves || []]);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return Response.json({ error: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'CROSS_ORIGIN_REQUEST' }, { status: 403 });
  } catch {
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let services;
  try { services = getFirebaseAdmin(); } catch (error) {
    console.error('[rpg-practice] Firebase Admin configuration is invalid', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'SERVER_CONFIG_INVALID' }, { status: 503 });
  }
  if (!services) return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  let user;
  try {
    user = await services.auth.verifyIdToken(token, true);
  } catch {
    return Response.json({ error: 'INVALID_AUTH' }, { status: 401 });
  }
  const now = Date.now();
  let rateLimit;
  try { rateLimit = await consumeServerRateLimit(services.db, user.uid, 'practice', now, RATE_LIMIT, RATE_WINDOW_MS); }
  catch (error) {
    console.error('[rpg-practice] rate limit storage failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: isFirestorePermissionDenied(error) ? 'FIRESTORE_PERMISSION_DENIED' : 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!rateLimit.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter), 'Cache-Control': 'no-store' } });

  let raw: string | null;
  try { raw = await readBoundedRequestText(request, MAX_BODY_BYTES); } catch { return Response.json({ error: 'INVALID_BODY' }, { status: 400 }); }
  if (raw === null) return Response.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  let body: PracticeBody;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    body = parsed as PracticeBody;
  } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const skillId = typeof body.skill === 'string' ? body.skill : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const minutes = Math.round(Number(body.min));
  const link = typeof body.link === 'string' ? body.link.trim().slice(0, 2_048) : '';
  const imgs = safeImages(body.imgs);
  const evidenceImageCount = countEmbeddedImageEvidence(imgs);
  const offset = Math.round(Number(body.utcOffsetMinutes));
  const questId = typeof body.questId === 'string' ? body.questId : '';
  if (!/^[\w-]{8,100}$/.test(eventId) || !/^[\w-]{1,100}$/.test(skillId)) return Response.json({ error: 'INVALID_EVENT' }, { status: 400 });
  if (text.length < 3 || text.length > 600 || !Number.isFinite(minutes) || minutes < 5 || minutes > 600 || !imgs || !Number.isFinite(offset) || offset < -720 || offset > 840) return Response.json({ error: 'INVALID_PRACTICE' }, { status: 400 });
  if (link && !/^https?:\/\//i.test(link)) return Response.json({ error: 'INVALID_LINK' }, { status: 400 });

  try {
    const profileRef = services.db.doc(`data/users/${user.uid}/profile`);
    const proofs = profileRef.collection('proofs');
    const summaryRef = profileRef.collection('system').doc('rpg-summary-v1');
    const eventRef = proofs.doc(`event_${eventId}`);
    const eventCheck = await eventRef.get();
    if (eventCheck.exists) return Response.json({ created: false, entry: { id: eventCheck.id, ...eventCheck.data() } }, { headers: { 'Cache-Control': 'no-store' } });
    const [summaryCheck, profileCheck] = await Promise.all([summaryRef.get(), profileRef.get()]);
    const forceRebuild = profileCheck.get('rpgSummaryNeedsRebuild') === true;
    const hasCurrentSummary = summaryCheck.exists && summaryCheck.get('version') === 7 && !forceRebuild;
    const legacyProfile = profileCheck.exists ? profileCheck.data() || {} : {};
    const legacyBranchFingerprint = summaryBranchFingerprint(legacyProfile);
    const legacySummary = hasCurrentSummary ? null : await readLegacyProofHistory(proofs, legacyProfile);
    const response = await services.db.runTransaction(async (transaction) => {
      const [profileSnapshot, existing, summarySnapshot, completedQuestProof] = await Promise.all([
        transaction.get(profileRef), transaction.get(eventRef), transaction.get(summaryRef),
        questId ? transaction.get(proofs.where('quest', '==', questId).limit(1)) : Promise.resolve(null),
      ]);
      if (existing.exists) return { created: false, entry: { id: existing.id, ...existing.data() } };

      const profile = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
      const summaryData = summarySnapshot.exists ? summarySnapshot.data() : undefined;
      let summary = summaryData && summaryData.version === 7 && profile.rpgSummaryNeedsRebuild !== true
        ? summaryData
        : legacySummary || buildRpgSummary([], profile);
      if (!isSkillProfileGraphValid(profile)) throw new Error('SKILL_GRAPH_INVALID');
      const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills : []);
      if (hidden.has(skillId)) throw new Error('SKILL_LOCKED');
      const customBranches = Array.isArray(profile.customBranches) ? profile.customBranches : [];
      const customLeaves = Array.isArray(profile.customLeaves) ? profile.customLeaves : [];
      const customBranch = customBranches.find((branch: { id?: unknown }) => branch.id === skillId);
      const customLeaf = customLeaves.find((leaf: { id?: unknown }) => leaf.id === skillId);
      const baseBranch = BASE_BRANCHES[skillId];
      let branchId = customLeaf?.branch as string | undefined;
      let requiredLevel = Number(customLeaf?.req) || 1;
      const difficulty = Math.max(1, Math.min(5, Math.round(Number(customLeaf?.difficulty) || requiredLevel)));
      const prerequisites = Array.isArray(customLeaf?.prerequisites) ? customLeaf.prerequisites.filter((id: unknown) => typeof id === 'string') as string[] : [];
      const isBranch = Boolean(baseBranch || customBranch);
      if (!isBranch && !customLeaf) {
        for (const [id, branch] of Object.entries(BASE_BRANCHES)) if (branch.leaves[skillId]) { branchId = id; requiredLevel = branch.leaves[skillId]; break; }
      }
      if (!isBranch && !branchId) throw new Error('SKILL_UNKNOWN');
      if (!isBranch && (hidden.has(branchId!) || !(BASE_BRANCHES[branchId!] || customBranches.some((branch: { id?: unknown }) => branch.id === branchId)))) throw new Error('SKILL_LOCKED');

      const now = Date.now();
      const localDate = new Date(now + offset * 60_000);
      const day = dayKey(localDate);
      // A changed timezone or deliberately backdated local day may fall behind
      // the summary cursor. Rebuild once so old active-day membership stays exact.
      if ((!summaryData || summaryData.version !== 7 || profile.rpgSummaryNeedsRebuild === true)
        && legacyBranchFingerprint !== summaryBranchFingerprint(profile)) {
        const historySnapshot = await transaction.get((proofs as Query).orderBy('ts', 'asc'));
        const historyBuilder = createRpgSummaryBuilder(profile);
        for (const doc of historySnapshot.docs) historyBuilder.add(doc.data() as Record<string, unknown>);
        summary = historyBuilder.finish();
      } else if (day < (typeof summary.lastDay === 'string' ? summary.lastDay : '')) {
        const historySnapshot = await transaction.get((proofs as Query).orderBy('ts', 'asc'));
        const historyBuilder = createRpgSummaryBuilder(profile);
        for (const doc of historySnapshot.docs) historyBuilder.add(doc.data() as Record<string, unknown>);
        summary = historyBuilder.finish();
      }
      const skillXp = summary.skillXp && typeof summary.skillXp === 'object' ? summary.skillXp as Record<string, number> : {};
      const branchXp = summary.branchXp && typeof summary.branchXp === 'object' ? summary.branchXp as Record<string, number> : {};
      if (!isBranch && !isSkillUnlocked({ branchXp: branchXp[branchId!] || 0, requiredBranchLevel: requiredLevel, prerequisites, skillXp })) throw new Error('SKILL_LOCKED');

      let questBonus = 0;
      let quests = Array.isArray(profile.quests) ? profile.quests : [];
      if (questId) {
        const quest = quests.find((item: { id?: unknown }) => item.id === questId);
        if (!quest) throw new Error('QUEST_INVALID');
        const questRules = quest.period === 'daily' || quest.period === 'weekly' || quest.period === 'boss'
          ? quest
          : { ...quest, requiredMinutes: Math.max(15, Math.round(Number(quest.requiredMinutes) || 15)) };
        const eligibility = questEligibility({ quest: { ...questRules, completedInHistory: Boolean(completedQuestProof && !completedQuestProof.empty) }, skillId, branchId: branchId || skillId, now, minutes, hasEvidence: Boolean(link || evidenceImageCount) });
        if (eligibility !== 'ok') throw new Error(`QUEST_${eligibility.toUpperCase()}`);
        if (quest.period === 'daily' || quest.period === 'weekly' || quest.period === 'boss') {
          if (!isCanonicalRecurringQuest(quest, profile, now, offset)) throw new Error('QUEST_INVALID');
          questBonus = 10;
        }
        quests = quests.map((item: { id?: unknown }) => item.id === questId ? { ...item, done: true, completedAt: now } : item);
      }
      const lastDay = typeof summary.lastDay === 'string' ? summary.lastDay : '';
      const streakBonus = dailyStreakBonus(day, lastDay, summary.currentStreak);
      const xp = practiceXp({ minutes, hasLink: Boolean(link), imageCount: evidenceImageCount, textLength: text.length, difficulty, questBonus, streakBonus });
      const entry = {
        eventId, ts: now, day, h: localDate.getUTCHours(), utcOffsetMinutes: offset,
        skill: skillId, text, min: minutes, link, imgs,
        ...(questId ? { quest: questId } : {}),
        bonus: streakBonus, xp, branchXp: isBranch ? xp : Math.round(xp * 0.4),
      };
      const nextSummary = addProofToRpgSummary(summary, entry, profile, {
        questAlreadyCompleted: Boolean(completedQuestProof && !completedQuestProof.empty),
      });
      const awards = unlockEligibleAchievementsFromMetrics(achievementMetricsFromSummary(nextSummary, profile), profile, now);
      transaction.create(eventRef, entry);
      transaction.set(summaryRef, nextSummary);
      const profileUpdate: Record<string, unknown> = { lastRpgEventAt: now, rpgRulesVersion: 1, rpgSummaryNeedsRebuild: false };
      if (awards.fresh.length) {
        profileUpdate.achievementUnlocks = awards.ledger;
        profileUpdate.unlockedTitles = awards.titles;
      }
      if (questId) {
        profileUpdate.quests = quests;
        const quest = (Array.isArray(profile.quests) ? profile.quests : []).find((item: { id?: unknown }) => item.id === questId);
        profileUpdate.questHistory = appendQuestCompletion(profile.questHistory, quest || {}, eventId, now, questBonus);
      }
      transaction.set(profileRef, profileUpdate, { merge: true });
      return { created: true, entry: { id: eventRef.id, ...entry }, earned: awards.fresh, summary: nextSummary };
    });
    return Response.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [number, string]> = {
      SKILL_LOCKED: [409, 'SKILL_LOCKED'], SKILL_UNKNOWN: [400, 'SKILL_UNKNOWN'], QUEST_INVALID: [409, 'QUEST_INVALID'],
      QUEST_DONE: [409, 'QUEST_DONE'], QUEST_EXPIRED: [409, 'QUEST_EXPIRED'], QUEST_SKILL: [409, 'QUEST_SKILL'],
      QUEST_MINUTES: [409, 'QUEST_MINUTES'], QUEST_EVIDENCE: [409, 'QUEST_EVIDENCE'],
      SKILL_GRAPH_INVALID: [409, 'SKILL_GRAPH_INVALID'],
    };
    const [status, errorCode] = isFirestorePermissionDenied(error) ? [503, 'FIRESTORE_PERMISSION_DENIED'] : known[code] || [500, 'PRACTICE_SAVE_FAILED'];
    if (status === 500) console.error('[rpg-practice] transaction failed', { code: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: errorCode }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
