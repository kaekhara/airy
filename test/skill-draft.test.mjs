import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';

const engine = loadTsModule('../lib/rpg-engine.ts');
const drafts = loadTsModule('../lib/skill-draft.ts', { '@/lib/rpg-engine': engine });
const branches = [
  { id: 'cyber', name: 'Кибербезопасность', skillNames: ['Сети', 'Криптография'] },
  { id: 'py', name: 'Python', skillNames: ['Основы'] },
];
const skill = (name, extra = {}) => ({ name, description: `Изучи ${name} на практическом примере.`, difficulty: 2, prerequisites: [], quest: `Сделай практическую работу по теме ${name}.`, success: `Покажи завершённый пример по теме ${name}.`, xp: 25, minutes: 30, materials: ['редактор'], kind: 'normal', req: 1, ...extra });

test('AI skill draft is normalized and tied to a real existing branch', () => {
  const result = drafts.sanitizeSkillDraft({ place: 'cyber', branch: 'ignored', skills: [skill('Пакетный анализ'), skill('Фильтрация трафика'), skill('Поиск аномалий')] }, branches);
  assert.equal(result.place, 'cyber');
  assert.equal(result.branch, 'Кибербезопасность');
  assert.equal(result.skills.length, 3);
  assert.equal(result.skills[0].req, 1);
});

test('AI skill draft drops existing and duplicate skills and ignores forward prerequisites', () => {
  const result = drafts.sanitizeSkillDraft({ place: 'py', branch: '', skills: [
    skill('Основы'),
    skill('Проект A', { prerequisites: ['Проект B'] }),
    skill('Проект B'),
    skill('Проект A'),
    skill('Проект C', { prerequisites: ['Проект B', 'Несуществующий узел'] }),
  ] }, branches);
  assert.deepEqual(result.skills.map((item) => item.name), ['Проект A', 'Проект B', 'Проект C']);
  assert.deepEqual(result.skills[0].prerequisites, []);
  assert.deepEqual(result.skills[2].prerequisites, ['проект b']);
});

test('AI skill draft rejects incomplete plans and refuses to create a duplicate branch', () => {
  assert.throws(() => drafts.sanitizeSkillDraft({ place: null, branch: 'Python', skills: [skill('A'), skill('B'), skill('C')] }, branches), /AI_BAD_RESPONSE/);
  assert.throws(() => drafts.sanitizeSkillDraft({ place: null, branch: 'Новая ветка', skills: [skill('A'), skill('B'), skill('C', { success: '' })] }, branches), /AI_BAD_RESPONSE/);
});

test('AI context prioritizes matching branches and caps their node list', () => {
  const many = [
    { id: 'unrelated', name: 'Рисование', skillNames: ['Цвет', 'Форма'] },
    { id: 'db', name: 'Базы данных', skillNames: Array.from({ length: 40 }, (_, i) => `SQL ${i}`) },
    { id: 'py', name: 'Python', skillNames: ['Основы'] },
  ];
  const selected = drafts.selectRelevantSkillBranches('SQL запросы', many, [], [], 2);
  assert.equal(selected.length, 3, 'all available branches fit under the selected cap');
  assert.equal(selected[0].id, 'db');
  assert.ok(selected[0].skillNames.length <= 12);
  assert.ok(selected.some((branch) => branch.id === 'py'));
});

test('AI context always retains configured starter branches and respects activity', () => {
  const selected = drafts.selectRelevantSkillBranches('новая тема', [
    { id: 'custom', name: 'Своя тема', skillNames: ['Вводная'] },
    { id: 'base', name: 'Базовая ветка', skillNames: ['Основы'] },
  ], [{ id: 'custom', level: 5, xp: 900 }], ['base'], 6);
  assert.equal(selected[0].id, 'base');
  assert.equal(selected[1].id, 'custom');
});

test('AI progress context includes XP on locked nodes and respects real level thresholds', () => {
  const context = drafts.formatSkillProgressContext([
    { id: 'cyber', name: 'Кибербезопасность', skillNames: ['CTF', 'Сети'], skillIds: { CTF: 'cyber-ctf', Сети: 'cyber-net' } },
  ], { cyber: 100 }, { 'cyber-ctf': 80, 'cyber-net': 0 });
  assert.match(context, /Кибербезопасность: уровень 3, 100 XP/);
  assert.match(context, /CTF \(ур\. 3, 80 XP\)/, 'started but locked nodes must retain their progress in AI context');
  assert.match(context, /Сети \(ещё не начат\)/);
});
