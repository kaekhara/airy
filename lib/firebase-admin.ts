import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: ReturnType<typeof initializeApp> | null = null;

export function getFirebaseAdmin() {
  if (adminApp) return { auth: getAuth(adminApp), db: getFirestore(adminApp) };

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON');
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing required service account fields');
  }

  adminApp = getApps().find((app) => app.name === 'airy-rpg-admin')
    || initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
      }),
      projectId: serviceAccount.project_id,
    }, 'airy-rpg-admin');

  return { auth: getAuth(adminApp), db: getFirestore(adminApp) };
}
