import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map((match) => [match[1], match[2] ?? match[3] ?? match[4] ?? '']));
}

test('every static button is bound to a direct handler, delegated action, or handled form', async () => {
  const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const tags = [...html.matchAll(/<\/?(?:form|button)\b[^>]*>/gi)].map((match) => ({ tag: match[0], index: match.index }));
  const stack = [];
  const buttons = [];

  for (const item of tags) {
    const tagName = item.tag.match(/^<\/?(form|button)/i)?.[1].toLowerCase();
    if (item.tag.startsWith('</')) {
      if (tagName === 'form') stack.pop();
      continue;
    }
    const attrs = attributes(item.tag);
    if (tagName === 'form') { stack.push(attrs.id || ''); continue; }
    buttons.push({ attrs, formId: stack.at(-1) || '' });
  }

  const unmatched = [];
  for (const { attrs, formId } of buttons) {
    const id = attrs.id;
    const dataKeys = Object.keys(attrs).filter((name) => name.startsWith('data-'));
    if (attrs.type === 'submit') {
      if (!formId || !app.includes(`$('#${formId}').addEventListener('submit'`)) unmatched.push(attrs);
      continue;
    }
    if (id && (app.includes(`$('#${id}')`) || app.includes(`document.getElementById('${id}')`) || app.includes(`document.getElementById("${id}")`))) continue;
    if (dataKeys.some((key) => key === 'data-tab' || app.includes(key))) continue;
    unmatched.push(attrs);
  }

  assert.equal(unmatched.length, 0, `Buttons without a discoverable handler: ${JSON.stringify(unmatched)}`);
  assert.ok(buttons.length >= 70, 'The check should cover the current static button inventory.');
});

test('archive entry stays in settings and its arrow hover respects reduced motion', async () => {
  const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const button = html.match(/<button[^>]*id="openArchiveFromSettings"[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
  assert.ok(button.includes('archive-open-arrow'), 'the settings archive action has a dedicated animated arrow');
  assert.match(html, /#openArchiveFromSettings:hover \.archive-open-arrow/);
  assert.match(html, /#openArchiveFromSettings:focus-visible \.archive-open-arrow/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?button:not\(:disabled\)\{transition:none!important\}/);
  assert.match(html, /id="openArchiveFromSettings"/);
  assert.doesNotMatch(html, /<(?:button|a)[^>]+(?:data-tab="archive"|href="#archive")/);
});

test('profile name is canonical in the app before optional Firebase Auth sync', async () => {
  const app = await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function saveProfileName(');
  const end = app.indexOf("$('#pfSave').addEventListener", start);
  const handler = app.slice(start, end);
  assert.ok(start >= 0 && end > start, 'profile name save handler is present');
  assert.ok(handler.indexOf('await store.saveProfile({name:value,updatedAt})') < handler.indexOf('await user.updateProfile({displayName:value})'), 'persist the app profile before syncing Firebase Auth');
  assert.match(handler, /Ник сохранён в профиле, но имя аккаунта не синхронизировалось/);
});
