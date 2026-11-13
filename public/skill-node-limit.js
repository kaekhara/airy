(function attachSkillNodeLimit(root, factory) {
  const limits = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = limits;
  if (root) root.AirySkillNodeLimit = limits;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSkillNodeLimit() {
  const MAX_CUSTOM_SKILL_NODES = 2_000;
  const length = (value) => Array.isArray(value) ? value.length : 0;

  function canAdd(profile = {}, branches = 0, leaves = 0) {
    const additions = Number(branches) + Number(leaves);
    if (!Number.isSafeInteger(additions) || additions < 0) return false;
    return length(profile.customBranches) + length(profile.customLeaves) + additions <= MAX_CUSTOM_SKILL_NODES;
  }

  return Object.freeze({ MAX_CUSTOM_SKILL_NODES, canAdd });
});
