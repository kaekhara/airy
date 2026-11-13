import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const persona = loadTsModule('../lib/mika-persona.ts');

test('Mika has an explicit excited state and maps it from the reply tone', () => {
  assert.ok(persona.EXPRESSIONS.includes('excited'));
  assert.equal(persona.inferMikaExpression('Не могу усидеть, давай скорее начнём!'), 'excited');
  assert.equal(persona.inferMikaExpression('Я правда рада за тебя, ты отлично справился.'), 'happy');
  assert.equal(persona.inferMikaExpression('Хм, давай разберём это спокойно.'), 'think');
  assert.equal(persona.inferMikaExpression('Обычный ответ без яркой эмоции.'), null);
});
