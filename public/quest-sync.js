(function attachQuestSync(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryQuestSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createQuestSync() {
  async function withRetry(operation, options = {}) {
    const attempts = Math.max(1, Math.min(3, Math.floor(Number(options.attempts) || 2)));
    const delayMs = Math.max(0, Math.min(5_000, Math.floor(Number(options.delayMs) || 800)));
    const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => true;
    const wait = typeof options.wait === 'function' ? options.wait : (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    for (let attempt = 1; ; attempt++) {
      try { return await operation(attempt); }
      catch (error) {
        if (attempt >= attempts || !shouldRetry(error, attempt)) throw error;
        await wait(delayMs * attempt);
      }
    }
  }

  return Object.freeze({ withRetry });
});
