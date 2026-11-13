import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPreferenceWriter, applyPreferenceChange } = require('../public/preference-writer.js');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('rapid preference changes are serialized and each save includes earlier changes', async () => {
  let current = { theme: 'night', musicVolume: 24 };
  const firstSave = deferred(), saves = [];
  const persist = createPreferenceWriter({
    getCurrent: () => current,
    save: async (preferences) => {
      saves.push(preferences);
      if (saves.length === 1) await firstSave.promise;
    },
    onSaved: (preferences) => { current = { ...current, ...preferences }; },
  });

  const themeSave = persist('theme', 'day');
  const volumeSave = persist('musicVolume', 40);
  await Promise.resolve();
  assert.equal(saves.length, 1);
  firstSave.resolve();
  await Promise.all([themeSave, volumeSave]);

  assert.deepEqual(saves, [
    { theme: 'day', musicVolume: 24 },
    { theme: 'day', musicVolume: 40 },
  ]);
  assert.deepEqual(current, { theme: 'day', musicVolume: 40 });
});

test('a failed preference save does not poison later saves', async () => {
  let current = { theme: 'night' }, attempts = 0;
  const persist = createPreferenceWriter({
    getCurrent: () => current,
    save: async (preferences) => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      assert.deepEqual(preferences, { theme: 'night', musicVolume: 40 });
    },
    onSaved: (preferences) => { current = { ...current, ...preferences }; },
  });

  await assert.rejects(persist('theme', 'day'), /offline/);
  await persist('musicVolume', 40);
  assert.deepEqual(current, { theme: 'night', musicVolume: 40 });
});

test('a queued preference from a previous account is not written into the new account', async () => {
  let scope = 'user-a';
  const gate = deferred(), saved = [];
  const persist = createPreferenceWriter({
    getCurrent: () => ({}),
    getScope: () => scope,
    save: async (preferences) => { saved.push(preferences); await gate.promise; },
    onSaved: () => {},
  });

  const pending = persist('theme', 'day');
  await Promise.resolve();
  assert.equal(saved.length, 1);
  scope = 'user-b';
  gate.resolve();
  await assert.rejects(pending, /PREFERENCE_SCOPE_CHANGED/);
  assert.equal(saved.length, 1);
});

test('a failed preference update restores the previously applied UI and device value', async () => {
  let applied = 'night';
  await assert.rejects(applyPreferenceChange({
    previous: 'night',
    value: 'day',
    apply: (value) => { applied = value; },
    persist: async () => { throw new Error('offline'); },
  }), /offline/);
  assert.equal(applied, 'night');
});

test('a successful preference update keeps the applied value', async () => {
  let applied = 24;
  const result = await applyPreferenceChange({
    previous: 24,
    value: 68,
    apply: (value) => { applied = value; },
    persist: async (value) => assert.equal(value, 68),
  });
  assert.equal(result, 68);
  assert.equal(applied, 68);
});
