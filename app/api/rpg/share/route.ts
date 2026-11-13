import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import { achievementMetricsFromSummary, buildRpgSummary, unlockEligibleAchievementsFromMetrics } from '@/lib/rpg-achievements';
import { shareRewardEventId } from '@/lib/rpg-share';
import type { Query } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return Response.json({ error: 'ORIGIN_REQUIRED' }, { status: 403 });
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'CROSS_ORIGIN_REQUEST' }, { status: 403 });
  } catch { return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  let services;
  try { services = getFirebaseAdmin(); } catch { return Response.json({ error: 'SERVER_CONFIG_INVALID' }, { status: 503 }); }
  if (!services) return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  let user;
  try { user = await services.auth.verifyIdToken(token, true); }
  catch { return Response.json({ error: 'INVALID_AUTH' }, { status: 401 }); }

  const now = Date.now();
  let rateLimit;
  try { rateLimit = await consumeServerRateLimit(services.db, user.uid, 'share', now, 10); }
  catch { return Response.json({ error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!rateLimit.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter), 'Cache-Control': 'no-store' } });

  const profileRef = services.db.doc(`data/users/${user.uid}/profile`);
  const summaryRef = profileRef.collection('system').doc('rpg-summary-v1');
  // Never trust a client-generated id as evidence of a distinct share. A stable
  // server-derived key makes retries idempotent and limits rewards to once/day.
  const eventRef = profileRef.collection('system').doc(shareRewardEventId(now));
  const proofs = profileRef.collection('proofs');
  try {
    const result = await services.db.runTransaction(async (transaction) => {
      const [profileSnapshot, summarySnapshot, existingEvent] = await Promise.all([
        transaction.get(profileRef), transaction.get(summaryRef), transaction.get(eventRef),
      ]);
      const profile = (profileSnapshot.exists ? profileSnapshot.data() : {}) || {};
      if (existingEvent.exists) return { created: false, count: Math.max(0, Number(profile.shareCount) || 0), earned: [] };
      const hasCurrentSummary = summarySnapshot.exists && summarySnapshot.get('version') === 7 && profile.rpgSummaryNeedsRebuild !== true;
      const proofSnapshot = hasCurrentSummary ? null : await transaction.get((proofs as Query).orderBy('ts', 'asc'));
      const previousSummary = hasCurrentSummary
        ? summarySnapshot.data()
        : buildRpgSummary(proofSnapshot!.docs.map((doc) => doc.data() as Record<string, unknown>), profile);
      const count = Math.max(0, Number(profile.shareCount) || 0) + 1;
      const nextProfile = { ...profile, shareCount: count };
      const awards = unlockEligibleAchievementsFromMetrics(achievementMetricsFromSummary(previousSummary, nextProfile), nextProfile, now);
      transaction.create(eventRef, { eventId: eventRef.id, createdAt: now });
      transaction.set(profileRef, {
        shareCount: count,
        ...(awards.fresh.length ? { achievementUnlocks: awards.ledger, unlockedTitles: awards.titles } : {}),
      }, { merge: true });
      if (!hasCurrentSummary) transaction.set(summaryRef, previousSummary);
      return { created: true, count, earned: awards.fresh };
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[rpg-share] transaction failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'SHARE_SAVE_FAILED' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
