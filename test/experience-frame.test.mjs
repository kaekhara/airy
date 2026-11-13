import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frame = await readFile(new URL('../app/experience-frame.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8');

test('Next shell only hides loading state after the embedded app finishes booting', () => {
  assert.match(app, /measure\(\);\s*document\.documentElement\.dataset\.airyAppReady='true';/);
  assert.match(frame, /documentElement\?\.dataset\.airyAppReady === "true"/);
  assert.match(frame, /setInterval\(checkReady, 100\)/);
  assert.doesNotMatch(frame, /onLoad=\{\(\) => \{\s*setLoaded\(true\)/);
});

test('embedded app load timeout keeps a reachable retry action', () => {
  assert.match(frame, /LOAD_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(frame, /Не удалось загрузить Upskill Airy/);
  assert.match(frame, /Попробовать ещё раз/);
  assert.match(frame, /setAttempt\(\(value\) => value \+ 1\)/);
});
