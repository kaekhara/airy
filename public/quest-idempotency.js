(function attachQuestIdempotency(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryQuestIdempotency = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQuestIdempotency() {
  function fingerprint({ userId, quests }) {
    return JSON.stringify([userId || 'local', Array.isArray(quests) ? quests : []]);
  }

  function getOrCreateIntent(storage, key, requestFingerprint, createId) {
    try {
      const pending = JSON.parse(storage.getItem(key) || 'null');
      if (pending && pending.fingerprint === requestFingerprint && typeof pending.requestId === 'string' && /^[\w-]{8,100}$/.test(pending.requestId)) {
        return { requestId: pending.requestId, fingerprint: requestFingerprint, recovered: true };
      }
    } catch { /* Storage may be unavailable; keep the request id in memory for this attempt. */ }
    const requestId = createId();
    try { storage.setItem(key, JSON.stringify({ requestId, fingerprint: requestFingerprint, createdAt: Date.now() })); } catch { /* Private browsing may disable session storage. */ }
    return { requestId, fingerprint: requestFingerprint, recovered: false };
  }

  function clearIntent(storage, key, requestId, requestFingerprint) {
    try {
      const pending = JSON.parse(storage.getItem(key) || 'null');
      if (pending && pending.requestId === requestId && pending.fingerprint === requestFingerprint) storage.removeItem(key);
    } catch { /* A stale intent is harmless and is replaced when the next request starts. */ }
  }

  return Object.freeze({ fingerprint, getOrCreateIntent, clearIntent });
});
