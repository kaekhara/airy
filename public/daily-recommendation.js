(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AiryDailyRecommendation = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const clean = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;

  function buildDailyRecommendation(input = {}) {
    const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today || '') ? input.today : new Date().toISOString().slice(0, 10);
    const branches = Array.isArray(input.branches) ? input.branches : [];
    const skills = Array.isArray(input.skills) ? input.skills : [];
    const proofs = Array.isArray(input.proofs) ? input.proofs : [];
    const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
    const xpBy = input.skillXp && typeof input.skillXp === 'object' ? input.skillXp : {};
    const unlocked = new Set(Array.isArray(input.unlockedSkills) ? input.unlockedSkills : []);
    const language = input.language === 'en' || input.language === 'kk' ? input.language : 'ru';
    const copy = {
      ru: {
        recovery: 'Ты уже сделал шаг сегодня. Не выжимай из себя ещё один — отметь, что сработало, и дай знаниям улечься.',
        setup: 'Сначала выбери доступный навык в древе. Я подскажу следующий небольшой шаг, когда появится маршрут.',
        start: (skill, branch, index) => [`Начни с малого: ${skill} в направлении «${branch}». Одной короткой практики хватит, чтобы сдвинуться.`, `На сегодня я выбрала тебе ${skill} — это следующий доступный шаг в «${branch}». Не усложняй, ладно?`, `Попробуй сегодня ${skill} в «${branch}». Сначала закрепи основу, а там посмотрим.`][index],
        continue: (skill, branch, index) => [`Продолжи ${skill} в «${branch}»: вернись к последней практике и добавь один новый пример.`, `В «${branch}» у тебя уже есть опыт. Сегодня развей ${skill} ещё на один понятный шаг.`, `Мой совет на сегодня — ${skill}. Ты уже начинал его, так что попробуй усложнить только одну часть.`][index],
        return: (skill, branch, index) => [`После паузы не нужно наверстывать всё сразу. Вернись к ${skill} в «${branch}» на один спокойный шаг.`, `Давно не открывал «${branch}». Начни снова с ${skill} — коротко и без гонки за серией.`, `Давай вернёмся без рывка: ${skill} в «${branch}», один маленький результат за раз.`][index],
      },
      en: {
        recovery: 'You have already made progress today. No need to squeeze in more—note what worked and let it settle.',
        setup: 'Choose an available skill in the tree first. I’ll suggest a small next step once your path is set.',
        start: (skill, branch, index) => [`Start small with ${skill} in ${branch}. One short practice is enough to get moving.`, `I picked ${skill} in ${branch} for today. It’s your next available step, so keep it simple, okay?`, `Try ${skill} in ${branch} today. Get the basics steady first; we can build from there.`][index],
        continue: (skill, branch, index) => [`Continue ${skill} in ${branch}: revisit your last practice and add one new example.`, `You already have some experience in ${branch}. Take one clear next step with ${skill} today.`, `My pick for today is ${skill}. You’ve started it already, so make just one part a little harder.`][index],
        return: (skill, branch, index) => [`No need to catch up all at once. Ease back into ${skill} in ${branch} with one calm step.`, `It’s been a while since ${branch}. Start again with ${skill}—briefly, with no streak pressure.`, `Let’s return without a big push: ${skill} in ${branch}, one small result at a time.`][index],
      },
      kk: {
        recovery: 'Бүгін бір қадам жасап қойдың. Өзіңді қинама — не көмектескенін белгілеп, білімнің орнығуына уақыт бер.',
        setup: 'Алдымен ағаштан қолжетімді дағдыны таңда. Бағытың дайын болғанда, келесі шағын қадамды ұсынамын.',
        start: (skill, branch, index) => [`Кішкентай қадамнан баста: «${branch}» бағыты бойынша «${skill}». Қозғалу үшін бір қысқа жаттығу жеткілікті.`, `Бүгін саған «${branch}» ішіндегі «${skill}» дағдысын таңдадым. Бұл — келесі қадамың, асықпа.`, `Бүгін «${branch}» ішіндегі «${skill}» дағдысын байқап көр. Әуелі негізін бекітейік.`][index],
        continue: (skill, branch, index) => [`«${branch}» ішіндегі «${skill}» дағдысын жалғастыр: соңғы жаттығуды қайталап, бір жаңа мысал қос.`, `«${branch}» бағыты бойынша тәжірибең бар. Бүгін «${skill}» дағдысында бір нақты қадам жаса.`, `Бүгінгі ұсынысым — «${skill}». Бастап қойғансың, енді бір бөлігін ғана күрделендір.`][index],
        return: (skill, branch, index) => [`Үзілістен кейін бәрін бірден қуып жетудің қажеті жоқ. «${branch}» ішіндегі «${skill}» дағдысына жайлап орал.`, `«${branch}» бағытына біраз уақыт болмадың. «${skill}» дағдысынан қысқа қадаммен қайта баста.`, `Үлкен қарқынсыз оралайық: «${branch}» ішіндегі «${skill}», бір шағын нәтиже.`][index],
      },
    }[language];
    const hidden = new Set(Array.isArray(profile.hiddenSkills) ? profile.hiddenSkills : []);
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));
    const skillById = new Map(skills.map((skill) => [skill.id, skill]));
    const branchOf = (id) => skillById.get(id)?.branch || (branchById.has(id) ? id : '');
    const proofDay = (proof) => {
      if (typeof proof?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proof.day)) return proof.day;
      if (typeof proof?.ts === 'number' && Number.isFinite(proof.ts) && Math.abs(proof.ts) < 8.64e15) return new Date(proof.ts).toISOString().slice(0, 10);
      return '';
    };
    const lastDay = proofs.reduce((latest, proof) => {
      const day = proofDay(proof);
      return day > latest ? day : latest;
    }, '');
    const practicedToday = proofs.some((proof) => proofDay(proof) === today);

    if (practicedToday) {
      return {
        kind: 'recovery',
        skillId: '',
        text: copy.recovery,
      };
    }

    const pinned = Array.isArray(profile.pinnedBranches) ? profile.pinnedBranches : [];
    const favorites = Array.isArray(profile.favoriteSkills) ? profile.favoriteSkills : [];
    const recent = Array.isArray(profile.recentBranchIds) ? profile.recentBranchIds : [];
    const branchPriority = new Map();
    [...pinned, ...favorites.map(branchOf), ...recent].forEach((id, index) => {
      if (id && !branchPriority.has(id)) branchPriority.set(id, index);
    });
    const recentBySkill = new Map();
    proofs.forEach((proof) => {
      if (proof?.skill && typeof proof.ts === 'number') {
        recentBySkill.set(proof.skill, Math.max(recentBySkill.get(proof.skill) || 0, proof.ts));
      }
    });
    const candidates = skills.filter((skill) => {
      if (!skill || typeof skill.id !== 'string' || skill.isBranch || hidden.has(skill.id) || hidden.has(skill.branch)) return false;
      return unlocked.has(skill.id);
    });

    if (!candidates.length) {
      return {
        kind: 'setup',
        skillId: '',
        text: copy.setup,
      };
    }

    const priority = (skill) => {
      const pinnedRank = pinned.indexOf(skill.branch);
      const favoriteRank = favorites.indexOf(skill.id);
      const branchRank = branchPriority.has(skill.branch) ? branchPriority.get(skill.branch) : Number.MAX_SAFE_INTEGER;
      return [pinnedRank < 0 ? Number.MAX_SAFE_INTEGER : pinnedRank, favoriteRank < 0 ? Number.MAX_SAFE_INTEGER : favoriteRank, branchRank];
    };
    candidates.sort((left, right) => {
      const [leftPinned,leftFav,leftBranch] = priority(left);
      const [rightPinned,rightFav,rightBranch] = priority(right);
      const leftXp = Math.max(0, Number(xpBy[left.id]) || 0);
      const rightXp = Math.max(0, Number(xpBy[right.id]) || 0);
      const leftNew = leftXp === 0 ? 0 : 1;
      const rightNew = rightXp === 0 ? 0 : 1;
      const leftLast = recentBySkill.get(left.id) || 0;
      const rightLast = recentBySkill.get(right.id) || 0;
      return leftPinned-rightPinned || leftFav-rightFav || leftBranch-rightBranch || leftNew-rightNew || leftLast-rightLast || leftXp-rightXp || left.id.localeCompare(right.id);
    });

    const seed = Number(today.replaceAll('-', '')) || 0;
    const bestPriority = priority(candidates[0]);
    const firstGroup = candidates.filter((skill) => {
      const rank=priority(skill);
      return rank.every((value,index)=>value===bestPriority[index]) && (Number(xpBy[skill.id])||0)===(Number(xpBy[candidates[0].id])||0);
    });
    const chosen = firstGroup[seed % firstGroup.length] || candidates[0];
    const skillName = clean(chosen.name, 'выбранный навык');
    const branchName = clean(branchById.get(chosen.branch)?.name, 'это направление');
    const sinceLast = lastDay ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastDay}T12:00:00Z`)) / 86_400_000) : Infinity;
    const started = (Number(xpBy[chosen.id]) || 0) > 0;
    const kind = lastDay && sinceLast >= 7 ? 'return' : started ? 'continue' : 'start';
    return { kind, skillId: chosen.id, text: copy[kind](skillName, branchName, seed % 3) };
  }

  return { buildDailyRecommendation };
});
