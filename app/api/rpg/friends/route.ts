import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { readBoundedRequestText } from '@/lib/bounded-request';
import { hasVerifiedEmail } from '@/lib/verified-email';
import { consumeServerRateLimit } from '@/lib/server-rate-limit';
import { unlockEligibleMetricAchievements } from '@/lib/rpg-achievements';
import { friendshipId, hashFriendCode, normalizeFriendCode, safeFriendAvatar, safeFriendName } from '@/lib/rpg-friends';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function identify(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { error: 'AUTH_REQUIRED' as const, status: 401 as const };
  let services;
  try { services = getFirebaseAdmin(); }
  catch { return { error: 'SERVER_CONFIG_INVALID' as const, status: 503 as const }; }
  if (!services) return { error: 'SERVER_NOT_CONFIGURED' as const, status: 503 as const };
  try {
    const user = await services.auth.verifyIdToken(token, true);
    if (!hasVerifiedEmail(user)) return { error: 'EMAIL_VERIFICATION_REQUIRED' as const, status: 403 as const };
    return { services, user };
  } catch { return { error: 'INVALID_AUTH' as const, status: 401 as const }; }
}

async function limited(services: NonNullable<ReturnType<typeof getFirebaseAdmin>>, uid: string, bucket: string, limit: number) {
  try {
    const result = await consumeServerRateLimit(services.db, uid, bucket, Date.now(), limit);
    return result.allowed ? null : Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { ...noStore, 'Retry-After': String(result.retryAfter) } });
  } catch { return Response.json({ error: 'RATE_LIMIT_UNAVAILABLE' }, { status: 503, headers: noStore }); }
}

export async function GET(request: Request) {
  const identity = await identify(request);
  if ('error' in identity) return Response.json({ error: identity.error }, { status: identity.status, headers: noStore });
  const { services, user } = identity;
  const blocked = await limited(services, user.uid, 'friends-read', 60);
  if (blocked) return blocked;
  try {
    const rows = await services.db.doc(`data/users/${user.uid}/profile`).collection('friends')
      .where('status', '==', 'active').limit(50).get();
    // A single-field query works without a separately provisioned composite index.
    const activeRows = rows.docs.filter((row) => /^[\w-]{1,160}$/.test(row.id))
      .sort((a, b) => (Number(b.get('since')) || 0) - (Number(a.get('since')) || 0));
    const friendIds = activeRows.map((row) => row.id);
    const profiles = await Promise.all(friendIds.map((uid) => services.db.doc(`data/users/${uid}/profile`).get()));
    const friends = friendIds.map((uid, index) => {
      const profile = profiles[index].exists ? profiles[index].data() || {} : {};
      return { uid, name: safeFriendName(profile.name), avatar: safeFriendAvatar(profile.avatar), since: Number(activeRows[index].get('since')) || 0 };
    });
    return Response.json({ friends, truncated: rows.size === 50 }, { headers: noStore });
  } catch (error) {
    console.error('[rpg-friends] list failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'FRIENDS_LOAD_FAILED' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'SAME_ORIGIN_REQUIRED' }, { status: 403, headers: noStore });
  const identity = await identify(request);
  if ('error' in identity) return Response.json({ error: identity.error }, { status: identity.status, headers: noStore });
  const { services, user } = identity;
  const text = await readBoundedRequestText(request, 2_048);
  if (text === null) return Response.json({ error: 'BODY_TOO_LARGE' }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(text || '{}'); }
  catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers: noStore }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'INVALID_BODY' }, { status: 400, headers: noStore });
  const input = body as Record<string, unknown>;

  if (input.action === 'invite') {
    const blocked = await limited(services, user.uid, 'friends-invite', 5);
    if (blocked) return blocked;
    const code = randomBytes(9).toString('hex').toUpperCase();
    const now = Date.now();
    try {
      await services.db.doc(`data/system/friend-invites/${hashFriendCode(code)}`).create({
        ownerUid: user.uid, createdAt: now, expiresAt: now + INVITE_TTL_MS, usedAt: null,
      });
      return Response.json({ code, expiresAt: now + INVITE_TTL_MS }, { headers: noStore });
    } catch (error) {
      console.error('[rpg-friends] invite creation failed', { name: error instanceof Error ? error.name : 'UnknownError' });
      return Response.json({ error: 'INVITE_CREATE_FAILED' }, { status: 500, headers: noStore });
    }
  }

  if (input.action !== 'accept') return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400, headers: noStore });
  const code = normalizeFriendCode(input.code);
  if (!code) return Response.json({ error: 'INVALID_INVITE_CODE' }, { status: 400, headers: noStore });
  const blocked = await limited(services, user.uid, 'friends-accept', 10);
  if (blocked) return blocked;

  const db = services.db;
  const inviteRef = db.doc(`data/system/friend-invites/${hashFriendCode(code)}`);
  const ownProfileRef = db.doc(`data/users/${user.uid}/profile`);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists) return { error: 'INVITE_NOT_FOUND' as const };
      const invite = inviteSnapshot.data() || {};
      const ownerUid = typeof invite.ownerUid === 'string' ? invite.ownerUid : '';
      if (!/^[\w-]{1,160}$/.test(ownerUid) || ownerUid === user.uid) return { error: 'INVALID_INVITE' as const };

      const peerProfileRef = db.doc(`data/users/${ownerUid}/profile`);
      const ownFriendRef = ownProfileRef.collection('friends').doc(ownerUid);
      const peerFriendRef = peerProfileRef.collection('friends').doc(user.uid);
      const pairRef = db.doc(`data/system/friendships/${friendshipId(user.uid, ownerUid)}`);
      const [ownProfileSnapshot, peerProfileSnapshot, ownFriendSnapshot, peerFriendSnapshot, pairSnapshot] = await Promise.all([
        transaction.get(ownProfileRef), transaction.get(peerProfileRef), transaction.get(ownFriendRef), transaction.get(peerFriendRef),
        transaction.get(pairRef),
      ]);
      if (!ownProfileSnapshot.exists || !peerProfileSnapshot.exists) return { error: 'PROFILE_NOT_FOUND' as const };
      const pair = pairSnapshot.exists ? pairSnapshot.data() || {} : {};
      if (pair.status === 'active' || (ownFriendSnapshot.get('status') === 'active' && peerFriendSnapshot.get('status') === 'active')) {
        return { alreadyConnected: true as const, ownFriendCount: Math.max(0, Number(ownProfileSnapshot.get('friendCount')) || 0), ownAwards: [] as unknown[] };
      }
      if (Number(invite.expiresAt) <= Date.now()) return { error: 'INVITE_EXPIRED' as const };
      if (invite.usedAt) return { error: 'INVITE_ALREADY_USED' as const };

      const ownProfile = ownProfileSnapshot.data() || {};
      const peerProfile = peerProfileSnapshot.data() || {};
      const previouslyConnected = pair.everConnected === true;
      const ownFriendCount = Math.max(0, Number(ownProfile.friendCount) || 0) + (previouslyConnected ? 0 : 1);
      const peerFriendCount = Math.max(0, Number(peerProfile.friendCount) || 0) + (previouslyConnected ? 0 : 1);
      const nextOwnProfile = { ...ownProfile, friendCount: ownFriendCount };
      const nextPeerProfile = { ...peerProfile, friendCount: peerFriendCount };
      const now = Date.now();
      const ownAwards = unlockEligibleMetricAchievements('friendCount', ownFriendCount, nextOwnProfile, now);
      const peerAwards = unlockEligibleMetricAchievements('friendCount', peerFriendCount, nextPeerProfile, now);
      const since = Number(pair.since) || now;
      const awardPatch = (awards: typeof ownAwards) => awards.fresh.length
        ? { achievementUnlocks: awards.ledger, unlockedTitles: awards.titles }
        : {};

      transaction.set(ownFriendRef, { status: 'active', since, updatedAt: now }, { merge: true });
      transaction.set(peerFriendRef, { status: 'active', since, updatedAt: now }, { merge: true });
      transaction.set(pairRef, { uids: [user.uid, ownerUid].sort(), status: 'active', everConnected: true, since, updatedAt: now }, { merge: true });
      transaction.set(inviteRef, { usedAt: now, usedBy: user.uid }, { merge: true });
      transaction.set(ownProfileRef, { friendCount: ownFriendCount, ...awardPatch(ownAwards) }, { merge: true });
      transaction.set(peerProfileRef, { friendCount: peerFriendCount, ...awardPatch(peerAwards) }, { merge: true });
      return { alreadyConnected: false as const, ownFriendCount, ownAwards: ownAwards.fresh, peerAwards: peerAwards.fresh };
    });
    if ('error' in result) {
      const status = result.error === 'INVITE_NOT_FOUND' || result.error === 'INVITE_EXPIRED' || result.error === 'INVITE_ALREADY_USED' ? 404 : result.error === 'PROFILE_NOT_FOUND' ? 409 : 400;
      return Response.json({ error: result.error }, { status, headers: noStore });
    }
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error('[rpg-friends] accept failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'FRIEND_CONNECT_FAILED' }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'SAME_ORIGIN_REQUIRED' }, { status: 403, headers: noStore });
  const identity = await identify(request);
  if ('error' in identity) return Response.json({ error: identity.error }, { status: identity.status, headers: noStore });
  const { services, user } = identity;
  const blocked = await limited(services, user.uid, 'friends-remove', 10);
  if (blocked) return blocked;
  const text = await readBoundedRequestText(request, 2_048);
  if (text === null) return Response.json({ error: 'BODY_TOO_LARGE' }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(text || '{}'); }
  catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers: noStore }); }
  const friendUid = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).friendUid : null;
  if (typeof friendUid !== 'string' || !/^[\w-]{1,160}$/.test(friendUid) || friendUid === user.uid) return Response.json({ error: 'INVALID_FRIEND' }, { status: 400, headers: noStore });

  const ownProfileRef = services.db.doc(`data/users/${user.uid}/profile`);
  const peerProfileRef = services.db.doc(`data/users/${friendUid}/profile`);
  const ownFriendRef = ownProfileRef.collection('friends').doc(friendUid);
  const peerFriendRef = peerProfileRef.collection('friends').doc(user.uid);
  const pairRef = services.db.doc(`data/system/friendships/${friendshipId(user.uid, friendUid)}`);
  try {
    const removed = await services.db.runTransaction(async (transaction) => {
      const [ownFriend, peerFriend, pair] = await Promise.all([transaction.get(ownFriendRef), transaction.get(peerFriendRef), transaction.get(pairRef)]);
      if (!ownFriend.exists || ownFriend.get('status') !== 'active') return false;
      const now = Date.now();
      transaction.set(ownFriendRef, { status: 'removed', removedAt: now, updatedAt: now }, { merge: true });
      if (peerFriend.exists) transaction.set(peerFriendRef, { status: 'removed', removedAt: now, updatedAt: now }, { merge: true });
      if (pair.exists) transaction.set(pairRef, { status: 'removed', updatedAt: now }, { merge: true });
      return true;
    });
    return Response.json({ removed }, { headers: noStore });
  } catch (error) {
    console.error('[rpg-friends] remove failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'FRIEND_REMOVE_FAILED' }, { status: 500, headers: noStore });
  }
}
