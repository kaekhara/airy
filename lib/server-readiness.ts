type ServerFeatures = {
  rpg: boolean;
  rpgStatus: 'ready' | 'missing' | 'invalid';
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { rpg: false, rpgStatus: 'invalid', ai };
    const account = value as { project_id?: unknown; client_email?: unknown; private_key?: unknown };
    const expectedProjectId = typeof firebaseProjectId === 'string' ? firebaseProjectId.trim() : '';
    const validFields = typeof account.project_id === 'string' && account.project_id.length > 0
      && typeof account.client_email === 'string' && account.client_email.includes('@')
      && typeof account.private_key === 'string'
      && /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/.test(account.private_key);
    const matchesProject = !expectedProjectId || account.project_id === expectedProjectId;
    const ready = validFields && matchesProject;
    return { rpg: ready, rpgStatus: ready ? 'ready' : 'invalid', ai };
  } catch {
    return { rpg: false, rpgStatus: 'invalid', ai };
  }
}
