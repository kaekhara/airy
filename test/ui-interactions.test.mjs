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
