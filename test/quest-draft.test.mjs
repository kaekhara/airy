import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const { sanitizeQuestDraft } = loadTsModule('../lib/quest-draft.ts');
const available = [{ id: 'py-base' }, { id: 'cyber-net' }, { id: 'db-sql' }];
const task = (skill, title, requiredMinutes = 25) => ({ skill, title, requiredMinutes });

test('AI quest draft returns the requested number of distinct allowed skills', () => {
  const result = sanitizeQuestDraft({ tasks: [
    task('py-base', 'Проведи маленький эксперимент', 20),
    task('cyber-net', 'Проверь заголовки ответа', 31),
    task('db-sql', 'Составь запрос выборки', 40),
  ] }, available);
  assert.equal(result.tasks.length, 3);
  assert.deepEqual(result.tasks.map((item) => item.skill), ['py-base', 'cyber-net', 'db-sql']);
  assert.deepEqual(result.tasks.map((item) => item.requiredMinutes), [20, 31, 40]);
});

test('AI quest draft normalizes text and clamps duration', () => {
  const result = sanitizeQuestDraft({ tasks: [
    task('py-base', '  Проведи\n маленький эксперимент\u0000  ', 900),
  ] }, available, 1);
  assert.equal(result.tasks[0].skill, 'py-base');
  assert.equal(result.tasks[0].title, 'Проведи маленький эксперимент');
  assert.equal(result.tasks[0].requiredMinutes, 40);
});

test('AI quest draft rejects missing, duplicated, unavailable, or insufficient tasks', () => {
  assert.throws(() => sanitizeQuestDraft({}, available), /AI_BAD_RESPONSE/);
  assert.throws(() => sanitizeQuestDraft({ tasks: [task('py-base', 'Уникальное задание'), task('py-base', 'Другое задание'), task('db-sql', 'Третье задание')] }, available), /AI_BAD_RESPONSE/);
  assert.throws(() => sanitizeQuestDraft({ tasks: [task('unknown', 'Достаточно длинный текст')] }, available, 1), /AI_BAD_RESPONSE/);
  assert.throws(() => sanitizeQuestDraft({ tasks: [task('py-base', 'Одинаковое название'), task('cyber-net', ' одинаковое   название '), task('db-sql', 'Третье задание')] }, available), /AI_BAD_RESPONSE/);
  assert.throws(() => sanitizeQuestDraft({ tasks: [task('py-base', 'Слишком коротко')] }, available), /AI_BAD_RESPONSE/);
});

test('AI quest draft adapts to a smaller unlocked skill set', () => {
  const oneSkill = [{ id: 'py-base' }];
  const result = sanitizeQuestDraft({ tasks: [task('py-base', 'Практическое задание')] }, oneSkill);
  assert.equal(result.tasks.length, 1);
});
