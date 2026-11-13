import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel uploads exclude local env files and common Firebase Admin key JSON names', async () => {
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  for (const pattern of [
    '.env*', '**/.env*',
    '*service-account*.json', '**/*service-account*.json',
    '*serviceAccount*.json', '**/*serviceAccount*.json',
    '*firebase-admin*.json', '**/*firebase-admin*.json',
    '*adminsdk*.json', '**/*adminsdk*.json',
  ]) {
    assert.ok(ignore.split(/\r?\n/).includes(pattern), `Missing deployment exclusion: ${pattern}`);
  }
});
