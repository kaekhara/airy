import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
const page = (await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8'))
  + (await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8'));

test('only versioned Mika assets receive immutable long-term caching', () => {
  assert.match(config, /source:\s*['"]\/images\/mika\/:path\*['"]/);
  assert.match(config, /type:\s*['"]query['"]/);
  assert.match(config, /key:\s*['"]v['"]/);
  assert.match(config, /value:\s*['"]public, max-age=31536000, immutable['"]/);
  assert.match(page, /function spriteUrl\(sprite\).*?\?v=\d{8}[a-z]/);
});

test('the app shell and its main interaction bundle cannot be served from a stale browser cache', () => {
  for (const asset of ['/upskill.html', '/upskill-app.js']) {
    assert.ok(config.includes(`source: '${asset}'`), `${asset} has an explicit cache rule`);
  }
  assert.equal((config.match(/value:\s*['"]no-store, max-age=0, must-revalidate['"]/g) || []).length, 2);
});
