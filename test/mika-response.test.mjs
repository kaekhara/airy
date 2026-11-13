import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const persona = loadTsModule('../lib/mika-persona.ts');
const response = loadTsModule('../lib/mika-response.ts', { '@/lib/mika-persona': persona });

test('Mika response validator enforces the chat contract and reply limit', () => {
  assert.equal(response.normalizeMikaResponse(null), null);
  assert.equal(response.normalizeMikaResponse({ reply: 'x'.repeat(801), expression: 'cool', theme: 'NONE' }), null);
  assert.equal(response.normalizeMikaResponse({ reply: 'Привет', expression: 'unknown', theme: 'NONE' }), null);
  assert.equal(response.normalizeMikaResponse({ reply: 'Привет', expression: 'cool', theme: 'dawn' }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(response.normalizeMikaResponse({ reply: '  Привет  ', expression: 'cool', theme: 'NONE' }))), {
    reply: 'Привет', expression: 'cool', theme: 'NONE',
  });
});

test('Mika expression follows the tone of the generated reply', () => {
  assert.equal(response.normalizeMikaResponse({ reply: 'Ура, поздравляю! Ты отлично справился.', expression: 'idle', theme: 'NONE' }).expression, 'happy');
  assert.equal(response.normalizeMikaResponse({ reply: 'Хм, думаю, стоит проверить условие.', expression: 'shy', theme: 'NONE' }).expression, 'think');
});

test('idle is reserved for neutral service replies and cannot repeat consecutively', () => {
  assert.equal(response.normalizeMikaResponse({ reply: 'Сохранено.', expression: 'idle', theme: 'NONE' }).expression, 'idle');
  assert.equal(response.normalizeMikaResponse({ reply: 'Ты отлично справился!', expression: 'idle', theme: 'NONE' }).expression, 'happy');
  assert.equal(response.normalizeMikaResponse({ reply: 'Сохранено.', expression: 'idle', theme: 'NONE' }, ['idle']).expression, 'cool');
});
