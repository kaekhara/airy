import { levelForXp } from '@/lib/rpg-engine';
import { unlockedQuestSkills } from '@/lib/rpg-skills';

type Row = Record<string, unknown>;

function safeText(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function finiteCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

/**
 * Summary streaks are historical runs ending on `lastDay`. They are not
 * necessarily still active today. The summary stores the practice's local
 * date but not the current device's timezone, so allow the full legal civil
 * timezone range when deciding whether that run is recent.
 */
export function activeStreakDays(summary: Row, now = Date.now()) {
  const lastDay = typeof summary.lastDay === 'string' ? summary.lastDay : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay) || !Number.isFinite(now)) return 0;
  const today = new Date(now).toISOString().slice(0, 10);
  const last = Date.parse(`${lastDay}T12:00:00.000Z`);
  const current = Date.parse(`${today}T12:00:00.000Z`);
  if (!Number.isFinite(last) || !Number.isFinite(current)) return 0;
  const distance = Math.round((current - last) / 86_400_000);
  // A local date can differ from UTC by one day; include yesterday in every
  // legal timezone while ensuring a multi-day absence is reported as zero.
  return distance >= -1 && distance <= 2 ? finiteCount(summary.currentStreak) : 0;
}

/** Builds prompt context from server-owned progress and a small local-only allowlist. */
export function buildMikaContextText(input: {
  profile: unknown;
  summary: unknown;
  clientContext: unknown;
  includeProgress: boolean;
  allowClientProgress?: boolean;
  now?: number;
}) {
  const context: Record<string, string | number> = {};
  const client = input.clientContext && typeof input.clientContext === 'object' && !Array.isArray(input.clientContext)
    ? input.clientContext as Row
    : {};

  if (input.includeProgress) {
    const profile = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile)
      ? input.profile as Row
      : {};
    const summary = input.summary && typeof input.summary === 'object' && !Array.isArray(input.summary)
      ? input.summary as Row
      : {};
    const preferences = profile.preferences && typeof profile.preferences === 'object' && !Array.isArray(profile.preferences)
      ? profile.preferences as Row
      : {};
    if (preferences.shareProgressWithMika !== false && summary.version === 7 && profile.rpgSummaryNeedsRebuild !== true) {
      const name = safeText(profile.name, 24);
      const totalXp = finiteCount(summary.total);
      const profileContext: Record<string, string | number> = {
        practices: finiteCount(summary.count),
        totalXp,
        level: levelForXp(totalXp, 60).level,
        streakDays: activeStreakDays(summary, input.now),
      };
      if (name) profileContext.name = name;

      try {
        const available = unlockedQuestSkills(profile, summary);
        const skillXp = summary.skillXp && typeof summary.skillXp === 'object' && !Array.isArray(summary.skillXp)
          ? summary.skillXp as Row
          : {};
        const openSkills = available.filter((skill) => !skill.isBranch);
        const focus = openSkills
          .filter((skill) => !skill.isBranch && finiteCount(skillXp[skill.id]) > 0)
          .sort((left, right) => finiteCount(skillXp[right.id]) - finiteCount(skillXp[left.id]))[0];
        if (focus) profileContext.focusSkill = safeText(focus.name, 80);

        // Give Mika a concrete next step and active task. These are derived
        // only from server-owned progress and currently unlocked skills.
        const next = openSkills
          .filter((skill) => skill.id !== focus?.id)
          .sort((left, right) => finiteCount(skillXp[left.id]) - finiteCount(skillXp[right.id])
            || left.level - right.level || left.name.localeCompare(right.name))[0];
        if (next) {
          profileContext.nextSkill = safeText(next.name, 80);
          profileContext.nextSkillBranch = safeText(available.find((skill) => skill.id === next.branch)?.name, 80);
          profileContext.nextSkillLevel = Math.max(1, Math.min(99, finiteCount(next.level)));
        }

        const questRows = Array.isArray(profile.quests) ? profile.quests.slice(-80) : [];
        const activeQuest = questRows.find((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
          const quest = value as Row;
          return quest.done !== true && typeof quest.skill === 'string'
            && openSkills.some((skill) => skill.id === quest.skill)
            && typeof quest.title === 'string' && quest.title.trim().length > 0;
        }) as Row | undefined;
        if (activeQuest) {
          profileContext.activeQuest = safeText(activeQuest.title, 120);
          const activeSkill = openSkills.find((skill) => skill.id === activeQuest.skill);
          if (activeSkill) profileContext.activeQuestSkill = safeText(activeSkill.name, 80);
        }
      } catch {
        // A malformed optional custom graph must not prevent Mika from answering.
      }
      Object.assign(context, profileContext);
    }

    if (input.allowClientProgress) {
      const practices = finiteCount(client.diaryEntries);
      const streakDays = finiteCount(client.streakDays);
      const practiceHours = Number(client.practiceHours);
      if (practices <= 1_000_000) context.practices = practices;
      if (streakDays <= 36_500) context.streakDays = streakDays;
      if (Number.isFinite(practiceHours) && practiceHours >= 0 && practiceHours <= 100_000) context.practiceHours = Math.round(practiceHours * 10) / 10;
      const focusSkill = safeText(client.focusSkill, 80);
      if (focusSkill) context.focusSkill = focusSkill;
      const guestName = safeText(client.name, 24);
      if (guestName) context.name = guestName;
    }

    const localTime = safeText(client.localTime, 5);
    if (/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(localTime)) context.localTime = localTime;
    if (['поздняя ночь', 'утро', 'день', 'вечер'].includes(String(client.dayPart))) context.dayPart = String(client.dayPart);
    if (client.background === 'day' || client.background === 'night') context.background = client.background;
    if (typeof client.mood === 'string' && /^[a-z]{2,16}$/.test(client.mood)) context.mood = client.mood;
  }

  return Object.keys(context).length ? JSON.stringify(context) : '';
}
