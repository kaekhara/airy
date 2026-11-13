/** One server-recognized share reward per account and UTC day. */
export function shareRewardEventId(now: number) {
  const date = new Date(now);
  if (!Number.isFinite(now) || !Number.isFinite(date.getTime())) throw new Error('INVALID_SHARE_TIME');
  return `share-${date.toISOString().slice(0, 10)}`;
}
