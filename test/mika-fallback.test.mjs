import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const persona = loadTsModule('../lib/mika-persona.ts');
const fallback = loadTsModule('../lib/mika-fallback.ts', { '@/lib/mika-persona': persona });

test('offline Mika reply preserves the exact chat contract and is transparent in Russian', () => {
  const result = fallback.createMikaFallbackReply('ru', 'Помоги мне');
  assert.equal(result.theme, 'NONE');
  assert.deepEqual(Object.keys(result).sort(), ['expression', 'reply', 'theme']);
  assert.ok(persona.EXPRESSIONS.includes(result.expression));
  assert.match(result.reply, /генератор ответов временно недоступен/);
});

test('offline Mika reply honors explicit English and Kazakh preferences', () => {
  assert.match(fallback.createMikaFallbackReply('en', 'Привет').reply, /temporarily unavailable/);
  assert.match(fallback.createMikaFallbackReply('kk', 'Hello').reply, /қолжетімсіз/);
});
