import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/archive-pagination.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');

function loadPagination() {
  const window = {};
  vm.runInNewContext(source, { window, Object, Array, Number, Math });
  return window.AiryArchivePagination;
}

test('archive pagination bounds visible rows and reports the exact remainder', () => {
  const rows = Array.from({ length: 105 }, (_, index) => index);
  const result = loadPagination().page(rows, 40);
  assert.equal(result.visible.length, 40);
  assert.equal(result.visible[0], 0);
  assert.equal(result.visible.at(-1), 39);
  assert.equal(result.total, 105);
  assert.equal(result.remaining, 65);
});

test('archive pagination handles malformed input and unsafe page sizes', () => {
  const page = loadPagination().page;
  assert.deepEqual(JSON.parse(JSON.stringify(page(null, 40))), { visible: [], total: 0, remaining: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(page([1, 2, 3], -20))), { visible: [1], total: 3, remaining: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(page([1, 2], Number.NaN))), { visible: [1], total: 2, remaining: 1 });
});

test('large skill and quest archives render one page and expose working load-more handlers', () => {
  assert.match(app, /AiryArchivePagination\.page\(filtered,skillArchiveLimit\)/);
  assert.match(app, /AiryArchivePagination\.page\(rows,questArchiveLimit\)/);
  assert.match(app, /data-more-skill-archive/);
  assert.match(app, /data-more-quest-archive/);
  assert.match(app, /skillArchiveLimit\+=ARCHIVE_PAGE_SIZE/);
  assert.match(app, /questArchiveLimit\+=ARCHIVE_PAGE_SIZE/);
  assert.match(html, /<script defer src="\/archive-pagination\.js(?:\?[^\"]*)?"><\/script>/);
});
