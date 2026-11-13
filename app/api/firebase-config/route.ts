import { getServerFeatures } from '@/lib/server-readiness';

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    return Response.json({ configured: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  // Expose readiness booleans only. Never return credential material or an
  // error detail that could reveal why a private server configuration failed.
  const serverFeatures = getServerFeatures(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.GEMINI_API_KEY,
    config.projectId,
  );

  return Response.json({ ...config, serverFeatures }, { headers: { 'Cache-Control': 'no-store' } });
}
