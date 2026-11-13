import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pluralForm } = require('../public/russian-plural.js');

test('Russian task nouns use the correct forms for zero, one, few, and many', () => {
  const forms = ['задача', 'задачи', 'задач'];
  for (const [count, expected] of [[0, 'задач'], [1, 'задача'], [2, 'задачи'], [4, 'задачи'], [5, 'задач'], [11, 'задач'], [14, 'задач'], [21, 'задача'], [22, 'задачи'], [25, 'задач']]) {
    assert.equal(pluralForm(count, forms), expected, `count ${count}`);
  }
});

test('personal quest adjective and noun agree across calendar counts', () => {
  const forms = ['личный квест', 'личных квеста', 'личных квестов'];
  assert.equal(pluralForm(1, forms), 'личный квест');
  assert.equal(pluralForm(3, forms), 'личных квеста');
  assert.equal(pluralForm(7, forms), 'личных квестов');
});
