import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/firebase-config/route.ts', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../public/firebase-config.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');

test('Firebase config reports only server readiness booleans and keeps secrets out of the browser config', () => {
  assert.match(route, /getServerFeatures\(/);
  assert.match(route, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(route, /GEMINI_API_KEY/);
  assert.match(route, /Cache-Control':\s*'no-store'/);
  assert.match(loader, /const \{ serverFeatures, \.\.\.publicConfig \} = payload/);
  assert.match(loader, /window\.UPSKILL_SERVER_FEATURES\s*=\s*serverFeatures/);
  assert.doesNotMatch(loader, /FIREBASE_SERVICE_ACCOUNT_JSON|GEMINI_API_KEY/);
  assert.match(html, /id="serverRuntimeStatus"[^>]*role="status"/);
  assert.match(app, /updateServerRuntimeStatus\(\)/);
  assert.match(app, /invalidHints\[features\.rpgStatus\]/);
  assert.match(app, /features\.rpgStatus==='missing'\|\|!features\.rpg/);
  assert.match(app, /Чтобы включить серверное сохранение RPG, добавь FIREBASE_SERVICE_ACCOUNT_JSON как secret в Vercel Production и выполни redeploy\./);
  assert.match(app, /Чтобы включить ответы Мики, добавь GEMINI_API_KEY как secret в Vercel Production и выполни redeploy\./);
  assert.match(loader, /rpgStatus:\s*\['ready', 'missing', 'invalid-json', 'missing-fields', 'invalid-email', 'invalid-private-key', 'project-mismatch'\]\.includes\(serverFeatures\.rpgStatus\)/);
});

test('Firebase config loader preserves only the safe RPG readiness status for settings diagnostics', async () => {
  const source = readFileSync(new URL('../public/firebase-config.js', import.meta.url), 'utf8');
  const serverFeatures = { rpg: false, rpgStatus: 'project-mismatch', ai: true };
  const context = {
    window: {},
    fetch: async () => ({ ok: true, json: async () => ({ apiKey: 'public-web-key', projectId: 'upskillairy', serverFeatures }) }),
  };
  runInNewContext(source, context);
  const config = await context.window.UPSKILL_FIREBASE_CONFIG_PROMISE;
  assert.deepEqual({ ...context.window.UPSKILL_SERVER_FEATURES }, serverFeatures);
  assert.deepEqual({ ...config }, { apiKey: 'public-web-key', projectId: 'upskillairy' });
});

test('server readiness rejects malformed or mismatched Firebase Admin credentials without returning secret content', async () => {
  const { loadTsModule } = await import('./load-ts.mjs');
  const readiness = loadTsModule('../lib/server-readiness.ts');
  const readyJson = JSON.stringify({ project_id: 'upskillairy', client_email: 'server@upskillairy.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----' });
  assert.deepEqual({ ...readiness.getServerFeatures(readyJson, 'gemini-secret', 'upskillairy') }, { rpg: true, rpgStatus: 'ready', ai: true });
  assert.deepEqual({ ...readiness.getServerFeatures('', '', 'upskillairy') }, { rpg: false, rpgStatus: 'missing', ai: false });
  assert.deepEqual({ ...readiness.getServerFeatures('{broken', 'gemini-secret', 'upskillairy') }, { rpg: false, rpgStatus: 'invalid-json', ai: true });
  assert.deepEqual({ ...readiness.getServerFeatures('{}', 'gemini-secret', 'upskillairy') }, { rpg: false, rpgStatus: 'missing-fields', ai: true });
  assert.deepEqual({ ...readiness.getServerFeatures(JSON.stringify({ project_id: 'upskillairy', client_email: 'oops', private_key: 'private' }), 'gemini-secret', 'upskillairy') }, { rpg: false, rpgStatus: 'invalid-email', ai: true });
  assert.deepEqual({ ...readiness.getServerFeatures(JSON.stringify({ project_id: 'upskillairy', client_email: 'server@upskillairy.iam.gserviceaccount.com', private_key: 'not-a-pem' }), 'gemini-secret', 'upskillairy') }, { rpg: false, rpgStatus: 'invalid-private-key', ai: true });
  assert.deepEqual({ ...readiness.getServerFeatures(readyJson, 'gemini-secret', 'another-project') }, { rpg: false, rpgStatus: 'project-mismatch', ai: true });
  const result = readiness.getServerFeatures(readyJson, 'gemini-secret', 'another-project');
  assert.equal(JSON.stringify(result).includes('gemini-secret'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE KEY'), false);
});
