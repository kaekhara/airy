// Firebase web keys are public identifiers. The server returns the
// NEXT_PUBLIC_FIREBASE_* allowlist plus safe readiness booleans; credentials
// are never exposed here.
const firebaseConfigController = new AbortController();
const firebaseConfigTimeout = setTimeout(() => firebaseConfigController.abort(), 3500);
window.UPSKILL_FIREBASE_CONFIG_PROMISE = fetch('/api/firebase-config', { cache: 'no-store', signal: firebaseConfigController.signal })
  .then(async response => {
    if (!response.ok) return null;
    const payload = await response.json();
    const { serverFeatures, ...publicConfig } = payload;
    window.UPSKILL_SERVER_FEATURES = serverFeatures && typeof serverFeatures === 'object'
      ? {
        rpg: serverFeatures.rpg === true,
        rpgStatus: ['ready', 'missing', 'invalid-json', 'missing-fields', 'invalid-email', 'invalid-private-key', 'project-mismatch'].includes(serverFeatures.rpgStatus) ? serverFeatures.rpgStatus : 'missing',
        ai: serverFeatures.ai === true,
      }
      : null;
    return publicConfig;
  })
  .catch(() => null)
  .finally(() => clearTimeout(firebaseConfigTimeout));
