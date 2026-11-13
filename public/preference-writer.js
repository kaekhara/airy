(function attachPreferenceWriter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryPreferenceWriter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPreferenceWriterApi() {
  function createPreferenceWriter({ getCurrent, getScope = () => 'default', save, onSaved }) {
    let queue = Promise.resolve();
    return function persist(key, value) {
      const scope = getScope();
      const operation = queue.then(async () => {
        if (getScope() !== scope) throw new Error('PREFERENCE_SCOPE_CHANGED');
        const next = Object.assign({}, getCurrent(), { [key]: value });
        await save(next);
        if (getScope() !== scope) throw new Error('PREFERENCE_SCOPE_CHANGED');
        onSaved(next);
        return next;
      });
      queue = operation.catch(() => undefined);
      return operation;
    };
  }

  async function applyPreferenceChange({ previous, value, apply, persist }) {
    apply(value);
    try {
      await persist(value);
      return value;
    } catch (error) {
      apply(previous);
      throw error;
    }
  }

  return Object.freeze({ createPreferenceWriter, applyPreferenceChange });
});
