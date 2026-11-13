import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
