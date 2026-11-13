import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { achievementMetricsFromSummary, createRpgSummaryBuilder, unlockEligibleAchievementsFromMetrics, type RpgSummary } from '@/lib/rpg-achievements';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

async function rebuildRpgSummaryFromProofHistory(query: Query, profile: Record<string, unknown>) {
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

function rebuildFingerprint(profile: Record<string, unknown>) {
  return JSON.stringify([
    profile.customBranches, profile.customLeaves, profile.hiddenSkills, profile.skillEdits,
    profile.achievementUnlocks, profile.unlockedTitles, profile.shareCount, profile.friendCount,
    profile.rpgSummaryNeedsRebuild,
  ]);
}

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  let services;
  try { services = getFirebaseAdmin(); }
  catch { return Response.json({ error: 'SERVER_CONFIG_INVALID' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!services) return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  let user;
  try { user = await services.auth.verifyIdToken(token, true); }
  catch { return Response.json({ error: 'INVALID_AUTH' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }

  const now = Date.now();
  let rateLimit;
  try { rateLimit = await consumeServerRateLimit(services.db, user.uid, 'rpg-summary', now, 60); }
  catch { return Response.json({ error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  if (!rateLimit.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter), 'Cache-Control': 'no-store' } });

  const profileRef = services.db.doc(`data/users/${user.uid}/profile`);
  const summaryRef = profileRef.collection('system').doc('rpg-summary-v1');
  try {
    const [profileSnapshot, summarySnapshot] = await Promise.all([profileRef.get(), summaryRef.get()]);
    const profile = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
    const saved = summarySnapshot.exists ? summarySnapshot.data() : undefined;
    const needsRebuild = saved?.version !== 7 || profile.rpgSummaryNeedsRebuild === true;
    let rebuilt: RpgSummary | null = null;
    let rebuiltForProfile = '';
    if (needsRebuild) {
      rebuilt = await rebuildRpgSummaryFromProofHistory(profileRef.collection('proofs') as Query, profile);
      rebuiltForProfile = rebuildFingerprint(profile);
    }
    let result: RpgSummary | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const committed = await services.db.runTransaction(async (transaction) => {
        const [latestProfile, latestSummary] = await Promise.all([transaction.get(profileRef), transaction.get(summaryRef)]);
        const latestProfileData = latestProfile.exists ? latestProfile.data() || {} : {};
        const latestSummaryData = latestSummary.exists ? latestSummary.data() : undefined;
        const latestNeedsRebuild = latestSummaryData?.version !== 7 || latestProfileData.rpgSummaryNeedsRebuild === true;
        // The profile or summary can become stale between the initial read and
        // transaction. Fetch its proof history outside the transaction and retry.
        if (latestNeedsRebuild && (!rebuilt || rebuiltForProfile !== rebuildFingerprint(latestProfileData))) return { retry: true as const };
        const summary = latestNeedsRebuild ? rebuilt : latestSummaryData;
        if (!summary) return { retry: true as const };

        const awards = unlockEligibleAchievementsFromMetrics(
          achievementMetricsFromSummary(summary, latestProfileData), latestProfileData, now,
        );
        if (latestNeedsRebuild) transaction.set(summaryRef, summary);
        if (latestNeedsRebuild || awards.fresh.length) {
          transaction.set(profileRef, {
            ...(latestNeedsRebuild ? { rpgSummaryNeedsRebuild: false } : {}),
            ...(awards.fresh.length ? { achievementUnlocks: awards.ledger, unlockedTitles: awards.titles } : {}),
          }, { merge: true });
        }
        return { summary, retry: false as const };
      });
      if (!committed.retry) { result = committed.summary as RpgSummary; break; }
      const [latestProfile, latestSummary] = await Promise.all([profileRef.get(), summaryRef.get()]);
      const latestProfileData = latestProfile.exists ? latestProfile.data() || {} : {};
      const latestSummaryData = latestSummary.exists ? latestSummary.data() : undefined;
      if (latestSummaryData?.version === 7 && latestProfileData.rpgSummaryNeedsRebuild !== true) {
        rebuilt = null;
        continue;
      }
      rebuilt = await rebuildRpgSummaryFromProofHistory(profileRef.collection('proofs') as Query, latestProfileData);
      rebuiltForProfile = rebuildFingerprint(latestProfileData);
    }
    if (!result) throw new Error('SUMMARY_REBUILD_UNAVAILABLE');
    return Response.json({ summary: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[rpg-summary] load failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'SUMMARY_LOAD_FAILED' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
