(function attachRussianPlural(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AiryRussianPlural = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRussianPlural() {
  function pluralForm(value, forms) {
    const count = Math.abs(Math.trunc(Number(value) || 0));
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
    if (last === 1) return forms[0];
    if (last >= 2 && last <= 4) return forms[1];
    return forms[2];
  }

  return Object.freeze({ pluralForm });
});
