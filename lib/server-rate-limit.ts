import type { Firestore } from 'firebase-admin/firestore';

export async function consumeServerRateLimit(
  db: Firestore,
  userId: string,
  bucket: string,
  now: number,
  limit: number,
  windowMs = 60_000,
) {
  if (!/^[\w-]{1,80}$/.test(bucket) || !/^[\w-]{1,160}$/.test(userId)) {
    throw new Error('INVALID_RATE_LIMIT_KEY');
  }
  const ref = db.doc(`data/users/${userId}/system/rate-${bucket}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const value = snapshot.exists ? snapshot.data() || {} : {};
    const previousStart = Number(value.start) || now;
    const previousCount = now - previousStart >= windowMs ? 0 : Math.max(0, Number(value.count) || 0);
    if (previousCount >= limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((previousStart + windowMs - now) / 1_000)) };
    }
    transaction.set(ref, { start: previousCount ? previousStart : now, count: previousCount + 1, updatedAt: now });
    return { allowed: true, retryAfter: 0 };
  });
}
