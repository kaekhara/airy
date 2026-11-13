import { levelForXp } from '@/lib/rpg-engine';
import { hasEmbeddedImageEvidence } from '@/lib/image-evidence';
import catalog from '@/public/achievement-catalog.js';

type Proof = Record<string, unknown>;
type Profile = Record<string, unknown>;
const hasProofEvidence = (proof: Proof) => Boolean(proof.link || hasEmbeddedImageEvidence(proof.imgs));
type BranchConfig = { leaves: Record<string, number> };
const achievementsForProfile = (profile: Profile) => (catalog as unknown as { forProfile: (value: Profile) => typeof catalog }).forProfile(profile);

/** The journal only needs recent per-day branch detail; lifetime totals remain separate. */
export const RPG_DAILY_BRANCH_WINDOW_DAYS = 400;

const BASE: Record<string, BranchConfig> = {
  cyber: { leaves: { 'cyber-net': 1, 'cyber-crypto': 2, 'cyber-web': 3, 'cyber-ctf': 4 } },
  db: { leaves: { 'db-sql': 1, 'db-trig': 2, 'db-roles': 3, 'db-tx': 4 } },
  py: { leaves: { 'py-base': 1, 'py-auto': 2, 'py-api': 3, 'py-test': 4 } },
  ios: { leaves: { 'ios-ui': 1, 'ios-pix': 2, 'ios-anim': 3, 'ios-fb': 4 } },
  art: { leaves: { 'art-bl': 1, 'art-2d': 2, 'art-pres': 3 } },
  lang: { leaves: { 'lang-ko': 1, 'lang-en': 2 } },
};

function dateDiff(later: string, earlier: string) {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000);
}

function branchForSkill(skillId: string, customBranches: Array<{ id?: unknown }>, customLeaves: Array<{ id?: unknown; branch?: unknown }>, hidden: Set<string>) {
  if (hidden.has(skillId)) return '';
  if (BASE[skillId] || customBranches.some((branch) => branch.id === skillId)) return skillId;
  for (const [branchId, branch] of Object.entries(BASE)) if (branch.leaves[skillId]) return branchId;
  const custom = customLeaves.find((leaf) => leaf.id === skillId);
  return custom && typeof custom.branch === 'string' ? custom.branch : '';
}

export function achievementMetrics(proofs: Proof[], profile: Profile = {}) {
  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  const customBranches = (Array.isArray(profile.customBranches) ? profile.customBranches as Array<{ id?: unknown }> : []).filter((branch) => !hidden.has(String(branch.id || '')));
  const customLeaves = (Array.isArray(profile.customLeaves) ? profile.customLeaves as Array<{ id?: unknown; branch?: unknown; req?: unknown; prerequisites?: unknown }> : []).filter((leaf) => !hidden.has(String(leaf.id || '')) && !hidden.has(String(leaf.branch || '')));
  const activeBase = Object.fromEntries(Object.entries(BASE).filter(([id]) => !hidden.has(id)));
  const branchXp: Record<string, number> = {};
  const skillXp: Record<string, number> = {};
  const days = new Set<string>();
  const questIds = new Set<string>();
  let total = 0;
  let minutes = 0;
  let proofCount = 0;
  let nightCount = 0;
  let morningCount = 0;
  let weekendCount = 0;

  for (const proof of proofs) {
    const skillId = typeof proof.skill === 'string' ? proof.skill : '';
    const xp = Math.max(0, Number(proof.xp) || 0);
    total += xp;
    minutes += Math.max(0, Number(proof.min) || 0);
    skillXp[skillId] = (skillXp[skillId] || 0) + xp;
    const branchId = branchForSkill(skillId, customBranches, customLeaves, hidden);
    if (branchId) branchXp[branchId] = (branchXp[branchId] || 0) + (proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0));
    if (typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day)) days.add(proof.day);
    if (hasProofEvidence(proof)) proofCount += 1;
    if (Number(proof.h) >= 23) nightCount += 1;
    if (Number(proof.h) < 8) morningCount += 1;
    const offset = Math.max(-720, Math.min(840, Number(proof.utcOffsetMinutes) || 0));
    const localDate = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day)
      ? new Date(`${proof.day}T12:00:00.000Z`)
      : new Date((Number(proof.ts) || 0) + offset * 60_000);
    const weekDay = localDate.getUTCDay();
    if (weekDay === 0 || weekDay === 6) weekendCount += 1;
    if (typeof proof.quest === 'string' && proof.quest) questIds.add(proof.quest);
  }

  const allBranches = new Set([...Object.keys(activeBase), ...customBranches.map((branch) => String(branch.id || '')).filter(Boolean)]);
  const allSkills = new Set(allBranches);
  const leaves: Array<{ id: string; branch: string; req: number; prerequisites: string[] }> = [];
  for (const [branchId, branch] of Object.entries(activeBase)) {
    for (const [skillId, req] of Object.entries(branch.leaves)) {
      if (hidden.has(skillId)) continue;
      allSkills.add(skillId);
      leaves.push({ id: skillId, branch: branchId, req, prerequisites: [] });
    }
  }
  for (const leaf of customLeaves) {
    const id = String(leaf.id || '');
    const branch = String(leaf.branch || '');
    if (!id || !allBranches.has(branch)) continue;
    allSkills.add(id);
    leaves.push({
      id,
      branch,
      req: Math.max(1, Math.min(4, Number(leaf.req) || 1)),
      prerequisites: Array.isArray(leaf.prerequisites) ? leaf.prerequisites.filter((value): value is string => typeof value === 'string') : [],
    });
  }

  const branchLevels: Record<string, number> = {};
  let maxBranchLevel = 0;
  let touched = 0;
  for (const branchId of allBranches) {
    const level = levelForXp(branchXp[branchId] || 0, 25, 10).level;
    branchLevels[branchId] = level;
    maxBranchLevel = Math.max(maxBranchLevel, level);
    if ((branchXp[branchId] || 0) > 0) touched += 1;
  }

  const isUnlocked = (leaf: { id: string; branch: string; req: number; prerequisites: string[] }) =>
    (branchLevels[leaf.branch] || 1) >= leaf.req && leaf.prerequisites.every((id) => (skillXp[id] || 0) > 0);
  const unlockedAdvanced = leaves.filter((leaf) => leaf.req > 1 && isUnlocked(leaf)).length;
  const used = Array.from(allSkills).filter((id) => (skillXp[id] || 0) > 0).length;
  const sortedDays = Array.from(days).sort();
  let best = 0;
  let run = 0;
  for (let index = 0; index < sortedDays.length; index += 1) {
    run = index > 0 && dateDiff(sortedDays[index], sortedDays[index - 1]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  return {
    count: proofs.length,
    total,
    minutes,
    proofCount,
    nightCount,
    morningCount,
    weekendCount,
    activeDays: days.size,
    questsCompleted: questIds.size,
    shareCount: Math.max(0, Number(profile.shareCount) || 0),
    friendCount: Math.max(0, Number(profile.friendCount) || 0),
    used,
    touched,
    maxB: maxBranchLevel,
    advUnlocked: unlockedAdvanced,
    best,
    branchLevels,
  };
}

export type RpgSummary = {
  version: 7;
  count: number;
  total: number;
  minutes: number;
  proofCount: number;
  nightCount: number;
  morningCount: number;
  weekendCount: number;
  activeDays: number;
  questsCompleted: number;
  best: number;
  currentStreak: number;
  lastDay: string;
  skillXp: Record<string, number>;
  branchXp: Record<string, number>;
  dayCounts: Record<string, number>;
  dayXp: Record<string, number>;
  dayMinutes: Record<string, number>;
  dayBranchXp: Record<string, Record<string, number>>;
};

function dayDistance(later: string, earlier: string) {
  return dateDiff(later, earlier);
}

function pruneDailyBranchBreakdown(summary: RpgSummary, referenceDay = summary.lastDay) {
  if (!referenceDay) return;
  for (const day of new Set([...Object.keys(summary.dayCounts), ...Object.keys(summary.dayXp), ...Object.keys(summary.dayMinutes), ...Object.keys(summary.dayBranchXp)])) {
    const age = dayDistance(referenceDay, day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || age < 0 || age >= RPG_DAILY_BRANCH_WINDOW_DAYS) {
      delete summary.dayCounts[day];
      delete summary.dayXp[day];
      delete summary.dayMinutes[day];
      delete summary.dayBranchXp[day];
    }
  }
}

/** Stream proof records into a summary without retaining the full proof history in memory. */
export function createRpgSummaryBuilder(profile: Profile = {}) {
  const summary: RpgSummary = {
    version: 7, count: 0, total: 0, minutes: 0, proofCount: 0, nightCount: 0, morningCount: 0,
    weekendCount: 0, activeDays: 0, questsCompleted: 0, best: 0, currentStreak: 0, lastDay: '', skillXp: {}, branchXp: {},
    dayCounts: {}, dayXp: {}, dayMinutes: {}, dayBranchXp: {},
  };
  const days = new Set<string>();
  const quests = new Set<string>();
  const customBranches = (Array.isArray(profile.customBranches) ? profile.customBranches : []) as Array<{ id?: unknown }>;
  const customLeaves = (Array.isArray(profile.customLeaves) ? profile.customLeaves : []) as Array<{ id?: unknown; branch?: unknown }>;
  let finalized = false;
  let latestObservedDay = '';

  function add(proof: Proof) {
    if (finalized) throw new Error('SUMMARY_BUILDER_FINALIZED');
    const skillId = typeof proof.skill === 'string' ? proof.skill : '';
    const xp = Math.max(0, Number(proof.xp) || 0);
    summary.count += 1;
    summary.total += xp;
    summary.minutes += Math.max(0, Number(proof.min) || 0);
    summary.skillXp[skillId] = (summary.skillXp[skillId] || 0) + xp;
    const branchId = branchForSkill(skillId, customBranches, customLeaves, new Set());
    if (branchId) summary.branchXp[branchId] = (summary.branchXp[branchId] || 0) + (proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0));
    const offset = Math.max(-720, Math.min(840, Number(proof.utcOffsetMinutes) || 0));
    const localDate = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day)
      ? new Date(`${proof.day}T12:00:00.000Z`)
      : new Date((Number(proof.ts) || 0) + offset * 60_000);
    const day = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day) ? proof.day : localDate.toISOString().slice(0, 10);
    if (day) {
      days.add(day); summary.dayCounts[day] = (summary.dayCounts[day] || 0) + 1; summary.dayXp[day] = (summary.dayXp[day] || 0) + xp;
      summary.dayMinutes[day] = (summary.dayMinutes[day] || 0) + Math.max(0, Number(proof.min) || 0);
      if (branchId) { const branchAmount = proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0); summary.dayBranchXp[day] ||= {}; summary.dayBranchXp[day][branchId] = (summary.dayBranchXp[day][branchId] || 0) + branchAmount; }
      if (day > latestObservedDay) latestObservedDay = day;
      pruneDailyBranchBreakdown(summary, latestObservedDay);
    }
    if (hasProofEvidence(proof)) summary.proofCount += 1;
    if (Number(proof.h) >= 23) summary.nightCount += 1;
    if (Number(proof.h) < 8) summary.morningCount += 1;
    const weekday = localDate.getUTCDay();
    if (weekday === 0 || weekday === 6) summary.weekendCount += 1;
    if (typeof proof.quest === 'string' && proof.quest) quests.add(proof.quest);
  }

  function finish() {
    if (!finalized) {
      finalized = true;
      const orderedDays = Array.from(days).sort();
      summary.activeDays = orderedDays.length;
      summary.questsCompleted = quests.size;
      summary.lastDay = orderedDays.at(-1) || '';
      let run = 0;
      for (let index = 0; index < orderedDays.length; index += 1) {
        run = index > 0 && dayDistance(orderedDays[index], orderedDays[index - 1]) === 1 ? run + 1 : 1;
        summary.best = Math.max(summary.best, run);
      }
      if (orderedDays.length) {
        let cursor = orderedDays[orderedDays.length - 1];
        while (days.has(cursor)) {
          summary.currentStreak += 1;
          const prior = new Date(`${cursor}T12:00:00.000Z`);
          prior.setUTCDate(prior.getUTCDate() - 1);
          cursor = prior.toISOString().slice(0, 10);
        }
      }
      pruneDailyBranchBreakdown(summary);
    }
    return summary;
  }

  return Object.freeze({ add, finish });
}

export function buildRpgSummary(proofs: Proof[], profile: Profile = {}): RpgSummary {
  const builder = createRpgSummaryBuilder(profile);
  for (const proof of proofs) builder.add(proof);
  return builder.finish();
}

export function rebuildRpgSummaryAfterMutation(proofs: Proof[], eventId: string, replacement: Proof | null, profile: Profile = {}) {
  const remaining = proofs.filter((proof) => proof.id !== eventId);
  if (replacement) remaining.push({ ...replacement, id: eventId });
  return buildRpgSummary(remaining, profile);
}

export function addProofToRpgSummary(summaryValue: unknown, proof: Proof, profile: Profile = {}, options: { questAlreadyCompleted?: boolean } = {}): RpgSummary {
  const source = summaryValue && typeof summaryValue === 'object' ? summaryValue as Partial<RpgSummary> : {};
  const summary: RpgSummary = {
    version: 7,
    count: Math.max(0, Number(source.count) || 0), total: Math.max(0, Number(source.total) || 0), minutes: Math.max(0, Number(source.minutes) || 0),
    proofCount: Math.max(0, Number(source.proofCount) || 0), nightCount: Math.max(0, Number(source.nightCount) || 0),
    morningCount: Math.max(0, Number(source.morningCount) || 0), weekendCount: Math.max(0, Number(source.weekendCount) || 0),
    activeDays: Math.max(0, Number(source.activeDays) || 0), questsCompleted: Math.max(0, Number(source.questsCompleted) || 0),
    best: Math.max(0, Number(source.best) || 0), currentStreak: Math.max(0, Number(source.currentStreak) || 0),
    lastDay: typeof source.lastDay === 'string' ? source.lastDay : '',
    skillXp: source.skillXp && typeof source.skillXp === 'object' ? { ...source.skillXp } : {},
    branchXp: source.branchXp && typeof source.branchXp === 'object' ? { ...source.branchXp } : {},
    dayCounts: source.dayCounts && typeof source.dayCounts === 'object' ? { ...source.dayCounts } : {},
    dayXp: source.dayXp && typeof source.dayXp === 'object' ? { ...source.dayXp } : {},
    dayMinutes: source.dayMinutes && typeof source.dayMinutes === 'object' ? { ...source.dayMinutes } : {},
    dayBranchXp: source.dayBranchXp && typeof source.dayBranchXp === 'object' ? Object.fromEntries(Object.entries(source.dayBranchXp).map(([day, value]) => [day, value && typeof value === 'object' ? { ...value } : {}])) : {},
  };
  const skillId = typeof proof.skill === 'string' ? proof.skill : '';
  const xp = Math.max(0, Number(proof.xp) || 0);
  summary.count += 1;
  summary.total += xp;
  summary.minutes += Math.max(0, Number(proof.min) || 0);
  summary.skillXp[skillId] = (summary.skillXp[skillId] || 0) + xp;
  const customBranches = (Array.isArray(profile.customBranches) ? profile.customBranches : []) as Array<{ id?: unknown }>;
  const customLeaves = (Array.isArray(profile.customLeaves) ? profile.customLeaves : []) as Array<{ id?: unknown; branch?: unknown }>;
  const branchId = branchForSkill(skillId, customBranches, customLeaves, new Set());
  if (branchId) summary.branchXp[branchId] = (summary.branchXp[branchId] || 0) + (proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0));
  if (hasProofEvidence(proof)) summary.proofCount += 1;
  if (Number(proof.h) >= 23) summary.nightCount += 1;
  if (Number(proof.h) < 8) summary.morningCount += 1;
  const offset = Math.max(-720, Math.min(840, Number(proof.utcOffsetMinutes) || 0));
  const localDate = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day)
    ? new Date(`${proof.day}T12:00:00.000Z`)
    : new Date((Number(proof.ts) || 0) + offset * 60_000);
  const weekday = localDate.getUTCDay();
  if (weekday === 0 || weekday === 6) summary.weekendCount += 1;
  if (typeof proof.quest === 'string' && proof.quest && !options.questAlreadyCompleted) summary.questsCompleted += 1;
  const day = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day) ? proof.day : localDate.toISOString().slice(0, 10);
  const dayWasActive = Number(summary.dayCounts[day]) > 0;
  summary.dayCounts[day] = (summary.dayCounts[day] || 0) + 1;
  summary.dayXp[day] = (summary.dayXp[day] || 0) + xp;
  summary.dayMinutes[day] = (summary.dayMinutes[day] || 0) + Math.max(0, Number(proof.min) || 0);
  if (branchId) { const branchAmount = proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0); summary.dayBranchXp[day] ||= {}; summary.dayBranchXp[day][branchId] = (summary.dayBranchXp[day][branchId] || 0) + branchAmount; }
  if (!dayWasActive) summary.activeDays += 1;
  if (!summary.lastDay || day > summary.lastDay) {
    if (!summary.lastDay || dayDistance(day, summary.lastDay) === 1) summary.currentStreak += 1;
    else if (dayDistance(day, summary.lastDay) > 1) summary.currentStreak = 1;
    summary.best = Math.max(summary.best, summary.currentStreak);
    summary.lastDay = day;
  }
  pruneDailyBranchBreakdown(summary);
  return summary;
}

export function removeProofFromRpgSummary(summaryValue: unknown, proof: Proof, profile: Profile = {}, options: { questStillCompleted?: boolean } = {}): RpgSummary {
  const source = summaryValue && typeof summaryValue === 'object' ? summaryValue as Partial<RpgSummary> : {};
  const priorCurrentStreak = Math.max(0, Number(source.currentStreak) || 0);
  const priorLastDay = typeof source.lastDay === 'string' ? source.lastDay : '';
  const summary: RpgSummary = {
    version: 7, count: Math.max(0, Number(source.count) || 0), total: Math.max(0, Number(source.total) || 0), minutes: Math.max(0, Number(source.minutes) || 0),
    proofCount: Math.max(0, Number(source.proofCount) || 0), nightCount: Math.max(0, Number(source.nightCount) || 0), morningCount: Math.max(0, Number(source.morningCount) || 0),
    weekendCount: Math.max(0, Number(source.weekendCount) || 0), activeDays: Math.max(0, Number(source.activeDays) || 0), questsCompleted: Math.max(0, Number(source.questsCompleted) || 0),
    best: Math.max(0, Number(source.best) || 0), currentStreak: priorCurrentStreak, lastDay: priorLastDay,
    skillXp: source.skillXp && typeof source.skillXp === 'object' ? { ...source.skillXp } : {},
    branchXp: source.branchXp && typeof source.branchXp === 'object' ? { ...source.branchXp } : {},
    dayCounts: source.dayCounts && typeof source.dayCounts === 'object' ? { ...source.dayCounts } : {},
    dayXp: source.dayXp && typeof source.dayXp === 'object' ? { ...source.dayXp } : {},
    dayMinutes: source.dayMinutes && typeof source.dayMinutes === 'object' ? { ...source.dayMinutes } : {},
    dayBranchXp: source.dayBranchXp && typeof source.dayBranchXp === 'object' ? Object.fromEntries(Object.entries(source.dayBranchXp).map(([day, value]) => [day, value && typeof value === 'object' ? { ...value } : {}])) : {},
  };
  const skillId = typeof proof.skill === 'string' ? proof.skill : '';
  const xp = Math.max(0, Number(proof.xp) || 0);
  const clampSubtract = (value: number, amount: number) => Math.max(0, value - amount);
  summary.count = clampSubtract(summary.count, 1); summary.total = clampSubtract(summary.total, xp); summary.minutes = clampSubtract(summary.minutes, Math.max(0, Number(proof.min) || 0));
  summary.skillXp[skillId] = clampSubtract(Number(summary.skillXp[skillId]) || 0, xp); if (!summary.skillXp[skillId]) delete summary.skillXp[skillId];
  const customBranches = (Array.isArray(profile.customBranches) ? profile.customBranches : []) as Array<{ id?: unknown }>;
  const customLeaves = (Array.isArray(profile.customLeaves) ? profile.customLeaves : []) as Array<{ id?: unknown; branch?: unknown }>;
  const branchId = branchForSkill(skillId, customBranches, customLeaves, new Set());
  if (branchId) { const amount = proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0); summary.branchXp[branchId] = clampSubtract(Number(summary.branchXp[branchId]) || 0, amount); if (!summary.branchXp[branchId]) delete summary.branchXp[branchId]; }
  if (hasProofEvidence(proof)) summary.proofCount = clampSubtract(summary.proofCount, 1);
  if (Number(proof.h) >= 23) summary.nightCount = clampSubtract(summary.nightCount, 1);
  if (Number(proof.h) < 8) summary.morningCount = clampSubtract(summary.morningCount, 1);
  const offset = Math.max(-720, Math.min(840, Number(proof.utcOffsetMinutes) || 0));
  const localDate = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day) ? new Date(`${proof.day}T12:00:00.000Z`) : new Date((Number(proof.ts) || 0) + offset * 60_000);
  const weekday = localDate.getUTCDay(); if (weekday === 0 || weekday === 6) summary.weekendCount = clampSubtract(summary.weekendCount, 1);
  const day = typeof proof.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day) ? proof.day : localDate.toISOString().slice(0, 10);
  const dayCountBeforeRemoval = Math.max(0, Number(summary.dayCounts[day]) || 0);
  summary.dayCounts[day] = clampSubtract(dayCountBeforeRemoval, 1); if (!summary.dayCounts[day]) delete summary.dayCounts[day];
  summary.dayXp[day] = clampSubtract(Number(summary.dayXp[day]) || 0, xp); if (!summary.dayXp[day]) delete summary.dayXp[day];
  summary.dayMinutes[day] = clampSubtract(Number(summary.dayMinutes[day]) || 0, Math.max(0, Number(proof.min) || 0)); if (!summary.dayMinutes[day]) delete summary.dayMinutes[day];
  if (branchId && summary.dayBranchXp[day]) { const branchAmount = proof.branchXp == null ? xp : Math.max(0, Number(proof.branchXp) || 0); summary.dayBranchXp[day][branchId] = clampSubtract(Number(summary.dayBranchXp[day][branchId]) || 0, branchAmount); if (!summary.dayBranchXp[day][branchId]) delete summary.dayBranchXp[day][branchId]; if (!Object.keys(summary.dayBranchXp[day]).length) delete summary.dayBranchXp[day]; }
  const quest = typeof proof.quest === 'string' ? proof.quest : '';
  if (quest && !options.questStillCompleted) summary.questsCompleted = clampSubtract(summary.questsCompleted, 1);
  if (dayCountBeforeRemoval === 1) summary.activeDays = clampSubtract(summary.activeDays, 1);
  if (dayCountBeforeRemoval === 1 && day === priorLastDay) {
    const days = Object.keys(summary.dayCounts).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number(summary.dayCounts[key]) > 0).sort();
    summary.lastDay = days.at(-1) || '';
    if (summary.lastDay && dayDistance(priorLastDay, summary.lastDay) === 1) summary.currentStreak = clampSubtract(priorCurrentStreak, 1);
    else {
      summary.currentStreak = 0;
      let cursor = summary.lastDay;
      while (cursor && summary.dayCounts[cursor]) {
        summary.currentStreak += 1;
        const prior = new Date(`${cursor}T12:00:00.000Z`);
        prior.setUTCDate(prior.getUTCDate() - 1);
        cursor = prior.toISOString().slice(0, 10);
      }
    }
  } else if (dayCountBeforeRemoval === 1 && priorLastDay && dayDistance(priorLastDay, day) < priorCurrentStreak) {
    // The removed date breaks the active run; keep the number of consecutive
    // active dates after that gap, including streaks longer than the window.
    summary.currentStreak = dayDistance(priorLastDay, day);
  }
  pruneDailyBranchBreakdown(summary);
  return summary;
}

export function mutateRpgSummary(summary: unknown, existingProof: Proof, replacement: Proof | null, profile: Profile = {}, options: { questStillCompleted?: boolean } = {}) {
  const without = removeProofFromRpgSummary(summary, existingProof, profile, options);
  return replacement ? addProofToRpgSummary(without, replacement, profile, { questAlreadyCompleted: options.questStillCompleted }) : without;
}

export function achievementMetricsFromSummary(summaryValue: unknown, profile: Profile = {}) {
  const summary = summaryValue && typeof summaryValue === 'object' ? summaryValue as Partial<RpgSummary> : {};
  const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills.filter((id): id is string => typeof id === 'string') : []);
  const customBranches = (Array.isArray(profile.customBranches) ? profile.customBranches as Array<{ id?: unknown }> : []).filter((branch) => !hidden.has(String(branch.id || '')));
  const customLeaves = (Array.isArray(profile.customLeaves) ? profile.customLeaves as Array<{ id?: unknown; branch?: unknown; req?: unknown; prerequisites?: unknown }> : []).filter((leaf) => !hidden.has(String(leaf.id || '')) && !hidden.has(String(leaf.branch || '')));
  const branchXp = summary.branchXp && typeof summary.branchXp === 'object' ? summary.branchXp as Record<string, number> : {};
  const skillXp = summary.skillXp && typeof summary.skillXp === 'object' ? summary.skillXp as Record<string, number> : {};
  const allBranches = new Set([...Object.keys(BASE).filter((id) => !hidden.has(id)), ...customBranches.map((branch) => String(branch.id || '')).filter(Boolean)]);
  const allSkills = new Set(allBranches);
  const leaves: Array<{ id: string; branch: string; req: number; prerequisites: string[] }> = [];
  for (const [branchId, branch] of Object.entries(BASE)) for (const [skillId, req] of Object.entries(branch.leaves)) {
    if (!hidden.has(skillId) && !hidden.has(branchId)) { allSkills.add(skillId); leaves.push({ id: skillId, branch: branchId, req, prerequisites: [] }); }
  }
  for (const leaf of customLeaves) {
    const id = String(leaf.id || ''), branch = String(leaf.branch || '');
    if (!id || !allBranches.has(branch)) continue;
    allSkills.add(id);
    leaves.push({ id, branch, req: Math.max(1, Math.min(4, Number(leaf.req) || 1)), prerequisites: Array.isArray(leaf.prerequisites) ? leaf.prerequisites.filter((value): value is string => typeof value === 'string') : [] });
  }
  const branchLevels: Record<string, number> = {};
  let maxB = 0, touched = 0;
  for (const id of allBranches) { const level = levelForXp(branchXp[id] || 0, 25, 10).level; branchLevels[id] = level; maxB = Math.max(maxB, level); if ((branchXp[id] || 0) > 0) touched += 1; }
  const unlocked = (leaf: { id: string; branch: string; req: number; prerequisites: string[] }) => (branchLevels[leaf.branch] || 1) >= leaf.req && leaf.prerequisites.every((id) => (skillXp[id] || 0) > 0);
  return {
    count: Math.max(0, Number(summary.count) || 0), total: Math.max(0, Number(summary.total) || 0), minutes: Math.max(0, Number(summary.minutes) || 0),
    proofCount: Math.max(0, Number(summary.proofCount) || 0), nightCount: Math.max(0, Number(summary.nightCount) || 0), morningCount: Math.max(0, Number(summary.morningCount) || 0),
    weekendCount: Math.max(0, Number(summary.weekendCount) || 0), activeDays: Math.max(0, Number(summary.activeDays) || 0),
    questsCompleted: Math.max(0, Number(summary.questsCompleted) || 0), shareCount: Math.max(0, Number(profile.shareCount) || 0),
    friendCount: Math.max(0, Number(profile.friendCount) || 0),
    used: Array.from(allSkills).filter((id) => (skillXp[id] || 0) > 0).length, touched, maxB,
    advUnlocked: leaves.filter((leaf) => leaf.req > 1 && unlocked(leaf)).length,
    best: Math.max(0, Number(summary.best) || 0), branchLevels,
  };
}

export function unlockEligibleAchievementsFromMetrics(metrics: ReturnType<typeof achievementMetrics> | ReturnType<typeof achievementMetricsFromSummary>, profile: Profile = {}, unlockedAt = Date.now()) {
  const ledger = profile.achievementUnlocks && typeof profile.achievementUnlocks === 'object'
    ? { ...(profile.achievementUnlocks as Record<string, unknown>) }
    : {};
  const titles = new Set(Array.isArray(profile.unlockedTitles) ? profile.unlockedTitles.filter((title): title is string => typeof title === 'string') : []);
  const fresh: Array<{ id: string; n: string; rarity: string; reward: { type: string; title: string } }> = [];

  for (const award of achievementsForProfile(profile)) {
    const metric = award.metric.startsWith('branchLevel:')
      ? metrics.branchLevels[award.metric.slice('branchLevel:'.length)] || 0
      : Number(metrics[award.metric as keyof typeof metrics]) || 0;
    if (metric < award.target || ledger[award.id]) continue;
    ledger[award.id] = { at: unlockedAt, rarity: award.rarity, reward: award.reward, achievement: { id: award.id, n: award.n, d: award.d, category: award.category, g: award.g, metric: award.metric, target: award.target, unit: award.unit, unitForms: award.unitForms, secret: award.secret } };
    titles.add(award.reward.title);
    fresh.push({ id: award.id, n: award.n, rarity: award.rarity, reward: award.reward });
  }
  return { ledger, titles: Array.from(titles), fresh };
}

/** Apply a single monotonic server-owned event metric without scanning unrelated history. */
export function unlockEligibleMetricAchievements(metricName: string, metricValue: number, profile: Profile = {}, unlockedAt = Date.now()) {
  const ledger = profile.achievementUnlocks && typeof profile.achievementUnlocks === 'object'
    ? { ...(profile.achievementUnlocks as Record<string, unknown>) }
    : {};
  const titles = new Set(Array.isArray(profile.unlockedTitles) ? profile.unlockedTitles.filter((title): title is string => typeof title === 'string') : []);
  const fresh: Array<{ id: string; n: string; rarity: string; reward: { type: string; title: string } }> = [];
  for (const award of achievementsForProfile(profile)) {
    if (award.metric !== metricName || metricValue < award.target || ledger[award.id]) continue;
    ledger[award.id] = { at: unlockedAt, rarity: award.rarity, reward: award.reward, achievement: { id: award.id, n: award.n, d: award.d, category: award.category, g: award.g, metric: award.metric, target: award.target, unit: award.unit, unitForms: award.unitForms, secret: award.secret } };
    titles.add(award.reward.title);
    fresh.push({ id: award.id, n: award.n, rarity: award.rarity, reward: award.reward });
  }
  return { ledger, titles: Array.from(titles), fresh };
}

export function unlockEligibleAchievements(proofs: Proof[], profile: Profile = {}, unlockedAt = Date.now()) {
  return unlockEligibleAchievementsFromMetrics(achievementMetrics(proofs, profile), profile, unlockedAt);
}
