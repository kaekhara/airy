// Firebase web keys are public identifiers. The server only returns the
// NEXT_PUBLIC_FIREBASE_* allowlist; private credentials are never exposed here.
window.UPSKILL_FIREBASE_CONFIG_PROMISE = fetch('/api/firebase-config', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .catch(() => null);
