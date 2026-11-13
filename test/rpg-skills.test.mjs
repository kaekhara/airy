import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './load-ts.mjs';
import skillNodeLimit from '../public/skill-node-limit.js';

const engine = loadTsModule('../lib/rpg-engine.ts');
const skills = loadTsModule('../lib/rpg-skills.ts', { '@/lib/rpg-engine': engine });

test('profile skill graph has a shared server-side size bound', () => {
  const atLimit = { customBranches: Array.from({ length: skills.MAX_CUSTOM_SKILL_NODES }, (_, index) => ({ id: `custom-${index}` })) };
  const overLimit = { customBranches: [...atLimit.customBranches, { id: 'custom-over-limit' }] };
  assert.equal(skills.isSkillProfileGraphValid(atLimit), true);
  assert.equal(skills.isSkillProfileGraphValid(overLimit), false);
  assert.equal(skills.isSkillProfileGraphValid({ customLeaves: {} }), false);
  assert.equal(skills.isSkillProfileGraphValid({ customBranches: [null] }), false);
  assert.throws(() => skills.unlockedQuestSkills(overLimit, {}), /SKILL_GRAPH_INVALID/);
});

test('client blocks manual and generated additions at the same custom-tree limit as the server', () => {
  assert.equal(skillNodeLimit.MAX_CUSTOM_SKILL_NODES, skills.MAX_CUSTOM_SKILL_NODES);
  const atLimit = { customBranches: Array.from({ length: skills.MAX_CUSTOM_SKILL_NODES - 1 }, (_, index) => ({ id: `branch-${index}` })), customLeaves: [{ id: 'last-leaf' }] };
  assert.equal(skillNodeLimit.canAdd(atLimit), true);
  assert.equal(skillNodeLimit.canAdd(atLimit, 1, 0), false);
  assert.equal(skillNodeLimit.canAdd(atLimit, 0, 1), false);
  assert.equal(skillNodeLimit.canAdd({ customBranches: 'invalid', customLeaves: [] }, 1, 1), true);
  assert.equal(skillNodeLimit.canAdd({}, -1, 0), false);
});

test('quest recommendations include active branches and only unlocked base skills', () => {
  const result = skills.unlockedQuestSkills({}, { branchXp: { cyber: 0 }, skillXp: { 'cyber-net': 1 } });
  const ids = new Set(result.map((item) => item.id));
  assert.equal(ids.has('cyber'), true);
  assert.equal(ids.has('cyber-net'), true);
  assert.equal(ids.has('cyber-crypto'), false);
  assert.equal(ids.has('py'), true);
});

test('hidden skills and branches are excluded from AI quest options', () => {
  const result = skills.unlockedQuestSkills({ hiddenSkills: ['cyber', 'py-base'] }, { branchXp: { cyber: 10_000, py: 0 }, skillXp: {} });
  const ids = new Set(result.map((item) => item.id));
  assert.equal(ids.has('cyber'), false);
  assert.equal(ids.has('cyber-net'), false);
  assert.equal(ids.has('py-base'), false);
  assert.equal(ids.has('py'), true);
});

test('custom quest skills follow branch levels and prerequisites', () => {
  const profile = {
    customBranches: [{ id: 'custom-design', name: 'Дизайн' }],
    customLeaves: [
      { id: 'design-basics', name: 'Композиция', branch: 'custom-design', req: 1, prerequisites: [] },
      { id: 'design-grid', name: 'Сетка', branch: 'custom-design', req: 2, prerequisites: ['design-basics'] },
    ],
  };
  const locked = skills.unlockedQuestSkills(profile, { branchXp: { 'custom-design': 0 }, skillXp: {} });
  assert.equal(locked.some((item) => item.id === 'design-basics'), true);
  assert.equal(locked.some((item) => item.id === 'design-grid'), false);
  const unlocked = skills.unlockedQuestSkills(profile, { branchXp: { 'custom-design': 25 }, skillXp: { 'design-basics': 2 } });
  assert.equal(unlocked.some((item) => item.id === 'design-grid'), true);
});

test('invalid custom prerequisite graphs are rejected before AI recommendations', () => {
  const profile = {
    customBranches: [{ id: 'custom-a', name: 'A' }],
    customLeaves: [
      { id: 'leaf-a', name: 'A', branch: 'custom-a', prerequisites: ['leaf-b'] },
      { id: 'leaf-b', name: 'B', branch: 'custom-a', prerequisites: ['leaf-a'] },
    ],
  };
  assert.throws(() => skills.unlockedQuestSkills(profile, {}), /SKILL_GRAPH_INVALID/);
});

test('orphaned custom skills are rejected instead of silently disappearing from the tree', () => {
  const profile = {
    customBranches: [{ id: 'custom-design', name: 'Дизайн' }],
    customLeaves: [
      { id: 'design-basics', name: 'Композиция', branch: 'custom-design', prerequisites: [] },
      { id: 'orphan-skill', name: 'Осиротевший навык', branch: 'deleted-branch', prerequisites: [] },
    ],
  };
  assert.equal(skills.isSkillProfileGraphValid(profile), false);
  assert.throws(() => skills.unlockedQuestSkills(profile, {}), /SKILL_GRAPH_INVALID/);
});

test('custom skills may belong to built-in branches', () => {
  const profile = { customLeaves: [{ id: 'cyber-linux', name: 'Linux', branch: 'cyber', prerequisites: [] }] };
  assert.equal(skills.isSkillProfileGraphValid(profile), true);
  assert.equal(skills.unlockedQuestSkills(profile, {}).some((skill) => skill.id === 'cyber-linux'), true);
});
