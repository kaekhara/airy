type ServerFeatures = {
  rpg: boolean;
  rpgStatus: 'ready' | 'missing' | 'invalid-json' | 'missing-fields' | 'invalid-email' | 'invalid-private-key' | 'project-mismatch';
  ai: boolean;
};

/** Return only safe readiness metadata. Never include credential fields or parse errors. */
export function getServerFeatures(serviceAccountJson: unknown, geminiApiKey: unknown, firebaseProjectId: unknown): ServerFeatures {
  const ai = typeof geminiApiKey === 'string' && geminiApiKey.trim().length > 0;
  if (typeof serviceAccountJson !== 'string' || serviceAccountJson.trim().length === 0) {
    return { rpg: false, rpgStatus: 'missing', ai };
  }

  try {
    const value: unknown = JSON.parse(serviceAccountJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { rpg: false, rpgStatus: 'missing-fields', ai };
    const account = value as { project_id?: unknown; client_email?: unknown; private_key?: unknown };
    const expectedProjectId = typeof firebaseProjectId === 'string' ? firebaseProjectId.trim() : '';
    if (typeof account.project_id !== 'string' || !account.project_id.trim()
      || typeof account.client_email !== 'string' || !account.client_email.trim()
      || typeof account.private_key !== 'string' || !account.private_key.trim()) {
      return { rpg: false, rpgStatus: 'missing-fields', ai };
    }
    if (!account.client_email.includes('@')) return { rpg: false, rpgStatus: 'invalid-email', ai };
    if (!/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/.test(account.private_key)) {
      return { rpg: false, rpgStatus: 'invalid-private-key', ai };
    }
    if (expectedProjectId && account.project_id !== expectedProjectId) return { rpg: false, rpgStatus: 'project-mismatch', ai };
    return { rpg: true, rpgStatus: 'ready', ai };
  } catch {
    return { rpg: false, rpgStatus: 'invalid-json', ai };
  }
}
