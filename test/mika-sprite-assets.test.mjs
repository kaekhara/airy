import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8')
  + readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
const spriteMap = html.match(/const MIKA_SPRITES=\{([\s\S]*?)\n\};/);

test('every classic and new Mika expression maps to a checked-in image', () => {
  assert.ok(spriteMap, 'Mika sprite map exists');
  const paths = Array.from(spriteMap[1].matchAll(/:'([a-z0-9/-]+)'/g), (match) => match[1]);
  assert.equal(paths.length, 34, '17 expressions are mapped for each character version');
  for (const path of paths) {
    assert.ok(existsSync(new URL(`../public/images/mika/${path}.webp`, import.meta.url)), `missing sprite: ${path}`);
  }
});

test('portrait stays hidden until the saved Mika version is loaded', () => {
  const page = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  assert.match(page, /<img class="mika"[^>]*style="visibility:hidden;opacity:0"/);
  assert.match(html, /let curExpr='idle',spriteRequest=0,mikaProfileReady=false/);
  assert.match(html, /if\(request!==spriteRequest\|\|!mikaProfileReady\)return/);
  assert.match(html, /await initStore\(\);\s*mikaProfileReady=true;\s*renderAll\(\)/);
});

test('a pending emotion or version change hides the previous sprite until the requested image loads', () => {
  const setExpression = html.match(/function setExpr\(e\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(setExpression, /const image=getMikaSprite\(sprite\);/);
  assert.match(setExpression, /if\(!image\.complete\|\|!image\.naturalWidth\)m\.classList\.remove\('sprite-ready'\);/);
  assert.match(setExpression, /m\.classList\.add\('sprite-ready'\);m\.style\.visibility='visible';m\.style\.opacity='1';/);
});

test('new Mika source sprites share the portrait canvas dimensions and alpha channel', () => {
  const directory = new URL('../public/images/mika/versions/new/', import.meta.url);
  const names = ['aggressive','embarrassed','energetic','flirty','happy','modest','regular','sad-curled','sad-tear','shy','shy-close','sleepy','surprised'];
  const dimensions = new Set();
  for (const name of names) {
    const bytes = readFileSync(new URL(`${name}.webp`, directory));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${name} is a WebP RIFF asset`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${name} has a WebP signature`);
    // VP8X stores the alpha flag in bit 4 of its feature flags byte.
    const extendedHeader = bytes.indexOf(Buffer.from('VP8X'));
    assert.ok(extendedHeader >= 0, `${name} uses an extended WebP header`);
    assert.ok((bytes[extendedHeader + 8] & 0x10) !== 0, `${name} preserves transparency`);
    dimensions.add(`${bytes.readUIntLE(extendedHeader + 12, 3) + 1}x${bytes.readUIntLE(extendedHeader + 15, 3) + 1}`);
  }
  assert.deepEqual(Array.from(dimensions), ['1024x1536']);
});
