import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModule } from './load-ts.mjs';

const routes = [
  '../app/api/mika-chat/route.ts',
  '../app/api/rpg/quests/generate/route.ts',
  '../app/api/rpg/skills/generate/route.ts',
];

test('Gemini Flash-Lite requests omit deprecated sampling parameters', () => {
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:temperature|topP|topK)\s*:/, route);
  }
});

test('all AI routes share documented Flash-Lite models in low-cost-first order', () => {
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), 'utf8');
    assert.match(source, /GEMINI_FLASH_LITE_MODELS/ , route);
    assert.match(source, /shouldRetryGeminiModel\(upstream\.status, index, models\.length\)/, route);
  }
  const models = readFileSync(new URL('../lib/gemini-models.ts', import.meta.url), 'utf8');
  assert.match(models, /\['gemini-3\.5-flash-lite', 'gemini-3\.1-flash-lite'\]/);
});

test('Gemini fallback retries model not found, quota and upstream errors but not credential or request errors', async () => {
  const { shouldRetryGeminiModel } = loadTsModule('../lib/gemini-models.ts');
  for (const status of [404, 429, 500, 503]) assert.equal(shouldRetryGeminiModel(status, 0, 2), true);
  for (const status of [400, 401, 403]) assert.equal(shouldRetryGeminiModel(status, 0, 2), false);
  for (const status of [404, 429, 503]) assert.equal(shouldRetryGeminiModel(status, 1, 2), false);
});
