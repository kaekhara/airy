(function attachPracticeIdempotency(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryPracticeIdempotency = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPracticeIdempotency() {
  function fingerprint({ userId, skill, text, minutes, link, questId, files }) {
    const fileHints = Array.isArray(files) ? files.map((file) => [file.name || '', file.size || 0, file.lastModified || 0, file.type || '']) : [];
    return JSON.stringify([userId || 'local', skill, text, minutes, link, questId || '', fileHints]);
  }

  function getOrCreateIntent(storage, key, requestFingerprint, createId) {
    try {
      const pending = JSON.parse(storage.getItem(key) || 'null');
      if (pending && pending.fingerprint === requestFingerprint && typeof pending.eventId === 'string' && /^[\w-]{8,100}$/.test(pending.eventId)) {
        return { eventId: pending.eventId, fingerprint: requestFingerprint, recovered: true };
      }
    } catch { /* Storage may be unavailable; retain the in-memory idempotency path. */ }
    const eventId = createId();
    try { storage.setItem(key, JSON.stringify({ eventId, fingerprint: requestFingerprint, createdAt: Date.now() })); } catch { /* Private browsing may disable session storage. */ }
    return { eventId, fingerprint: requestFingerprint, recovered: false };
  }

  function clearIntent(storage, key, eventId, requestFingerprint) {
    try {
      const pending = JSON.parse(storage.getItem(key) || 'null');
      if (pending && pending.eventId === eventId && pending.fingerprint === requestFingerprint) storage.removeItem(key);
    } catch { /* A stale intent is harmless and will be replaced by the next request. */ }
  }

  return Object.freeze({ fingerprint, getOrCreateIntent, clearIntent });
});
