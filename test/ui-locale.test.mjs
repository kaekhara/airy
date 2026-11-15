import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const locale = require('../public/ui-locale.js');

test('UI locale supports Russian, English, and Kazakh with Russian as fallback', () => {
  assert.deepEqual(new Set(locale.supported), new Set(['ru', 'en', 'kk']));
  assert.equal(locale.t('Главная', 'ru'), 'Главная');
  assert.equal(locale.t('Главная', 'en'), 'Home');
  assert.equal(locale.t('Главная', 'kk'), 'Басты бет');
  assert.equal(locale.normalize('unsupported'), 'ru');
});

test('applying locale inside the embedded app notifies the parent without a missing global reference', async () => {
  const source = await readFile(new URL('../public/ui-locale.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const messages = [];
  const document = {
    nodeType: 9,
    documentElement: { lang: '' },
    body: null,
    createTreeWalker: () => ({ nextNode: () => false }),
  };
  const context = {
    document,
    NodeFilter: { SHOW_TEXT: 4 },
    window: {
      location: { origin: 'https://airy-upskill.vercel.app' },
      parent: { postMessage: (...args) => messages.push(args) },
    },
  };
  runInNewContext(source, context);

  assert.equal(context.AiryUiLocale.apply('kk', document), 'kk');
  assert.equal(document.documentElement.lang, 'kk');
  assert.equal(JSON.stringify(messages), JSON.stringify([[{ type: 'airy:locale', locale: 'kk' }, 'https://airy-upskill.vercel.app']]));
  assert.match(html, /ui-locale\.js\?airy_asset_v=20261116-locale-fix/);
});

test('unknown or user-authored text is preserved verbatim', () => {
  const custom = 'Мой личный навык — изучить редкую тему';
  assert.equal(locale.t(custom, 'en'), custom);
  assert.equal(locale.t(custom, 'kk'), custom);
  assert.equal(locale.t('Мой текст с кавычками «как есть».', 'kk'), 'Мой текст с кавычками «как есть».');
});

test('runtime status messages translate while preserving interpolated values', () => {
  assert.equal(locale.t('Аккаунт готов, Alex!', 'en'), 'Account ready, Alex!');
  assert.equal(locale.t('Перенесено записей: 12. XP и награды пересчитаны сервером.', 'kk'), 'Көшірілген жазба саны: 12. XP пен марапаттарды сервер қайта есептеді.');
  assert.equal(locale.t('Можно приложить не больше 4 изображений.', 'en'), 'You can attach no more than 4 images.');
  assert.equal(locale.t('Ник сохранён. Мика будет обращаться к тебе по имени «Sam».', 'kk'), 'Атың сақталды. Мика саған «Sam» деп сөйлейді.');
  assert.equal(locale.t('Кибербезопасность', 'en'), 'Cybersecurity');
  assert.equal(locale.t('Базы данных', 'kk'), 'Дерекқорлар');
  assert.equal(locale.t('Добавлено в ветку «Python»: 3 под-навыка. Квесты ждут в разделе «Квесты».', 'en'), 'Added to Python: 3 subskills. Quests are waiting in the Quests section.');
  assert.equal(locale.t('Навык «SwiftUI» добавлен в древо.', 'kk'), '«SwiftUI» дағдысы ағашқа қосылды.');
  assert.equal(locale.t('Письмо для подтверждения отправлено.', 'en'), 'Verification email sent.');
  assert.equal(locale.t('Облачная база временно недоступна. Попробуй позже.', 'kk'), 'Бұлттық дерекқор уақытша қолжетімсіз. Кейін қайтала.');
  const readiness = 'Ключи Firebase Admin и AI найдены на сервере. Доступ к Firestore проверяется при серверной записи.';
  assert.match(locale.t(readiness, 'en'), /Firestore access is checked when a server save runs/);
  assert.match(locale.t(readiness, 'kk'), /Firestore қолжетімділігі серверге сақтау кезінде тексеріледі/);
  const permissionHint = 'Firestore отклонил запись. Проверь, что сервисному аккаунту из FIREBASE_SERVICE_ACCOUNT_JSON выдана роль Cloud Datastore User (roles/datastore.user) в IAM Google Cloud, затем подожди применения роли.';
  assert.match(locale.t(permissionHint, 'en'), /Cloud Datastore User.*roles\/datastore\.user.*Google Cloud IAM/);
  assert.match(locale.t(permissionHint, 'kk'), /Cloud Datastore User.*roles\/datastore\.user/);
  assert.match(locale.t('Чтобы включить серверное сохранение RPG, добавь FIREBASE_SERVICE_ACCOUNT_JSON как secret в Vercel Production и выполни redeploy.', 'en'), /FIREBASE_SERVICE_ACCOUNT_JSON.*Vercel Production.*redeploy/);
  const kazakhSetupHint = locale.t('Чтобы включить ответы Мики, добавь GEMINI_API_KEY как secret в Vercel Production и выполни redeploy.', 'kk');
  assert.match(kazakhSetupHint, /GEMINI_API_KEY/);
  assert.match(kazakhSetupHint, /Vercel Production/);
  assert.match(kazakhSetupHint, /redeploy/);
});

test('static UI phrases translate across formatting whitespace without changing the spacing', () => {
  assert.equal(locale.t('\n  Главная  \n', 'en'), '\n  Home  \n');
  assert.equal(locale.t('твой спутник в обучении', 'kk'), 'оқудағы серігің');
});

test('dynamic action labels and feedback stay localized in all supported interface languages', () => {
  const cases = [
    ['Сохраняю…', 'Saving…', 'Сақталуда…'],
    ['Не удалось сохранить язык интерфейса.', 'Could not save the interface language.', 'Интерфейс тілін сақтау мүмкін болмады.'],
    ['Приложи ссылку или изображение к записи.', 'Attach a link or image to the entry.', 'Жазбаға сілтеме немесе сурет тірке.'],
    ['Дата начала должна быть раньше даты окончания.', 'The start date must be before the end date.', 'Басталу күні аяқталу күнінен бұрын болуы керек.'],
    ['На этот день задач нет. Выбери дату со значком или открой «Квесты».', 'No tasks for this day. Choose a date with a marker or open Quests.', 'Бұл күнге тапсырма жоқ. Белгісі бар күнді таңда немесе «Квесттер» бөлімін аш.'],
  ];
  for (const [source, english, kazakh] of cases) {
    assert.equal(locale.t(source, 'ru'), source);
    assert.equal(locale.t(source, 'en'), english);
    assert.equal(locale.t(source, 'kk'), kazakh);
  }
});

test('achievement catalog labels and nested rewards translate as a complete unit', () => {
  const catalog = require('../public/achievement-catalog.js');
  assert.ok(catalog.length >= 100);
  for (const award of catalog) {
    for (const value of [award.n, award.d, award.category, award.rarity, award.reward.title]) {
      assert.notEqual(locale.t(value, 'kk'), value, `Kazakh achievement label is missing: ${value}`);
      if (!['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'].includes(value)) {
        assert.notEqual(locale.t(value, 'en'), value, `English achievement label is missing: ${value}`);
      }
    }
  }
  assert.equal(locale.t('Титул «Серия 3»', 'en'), 'Title “Streak 3”');
  assert.equal(locale.t('Новое достижение · Шаг 1', 'kk'), 'Жаңа жетістік · Қадам 1');
  assert.equal(locale.t('Достигни показателя: 10 веток', 'en'), 'Reach: 10 branches.');
  assert.equal(locale.t('Подними уровень направления CYBER до 3', 'kk'), 'Киберқауіпсіздік бағытын 3-деңгейге көтер');
});

test('dashboard and streak copy stay localized when rendered from changing progress values', () => {
  const cases = [
    ['Уровень 4', 'Level 4', '4-деңгей'],
    ['Серия 0 дней · ещё 1 день до стадии «первый бутон»', 'Streak: 0 days · 1 more day until “first bud”', 'Қатарынан: 0 күн · «алғашқы бүршік» кезеңіне дейін тағы 1 күн'],
    ['Проведи 12 практик в удобном тебе темпе.', 'Complete 12 practice sessions at your own pace.', '12 жаттығуды өз қарқыныңмен орында.'],
    ['Попробуй 3 разных направления.', 'Try 3 different branches.', '3 түрлі бағытты байқап көр.'],
    ['Набери 600 XP за сезон.', 'Earn 600 XP this season.', 'Маусым ішінде 600 XP жина.'],
    ['0 / 12 практик', '0 / 12 practices', '0 / 12 жаттығу'],
  ];
  for (const [source, english, kazakh] of cases) {
    assert.equal(locale.t(source, 'en'), english, `English dashboard copy is missing: ${source}`);
    assert.equal(locale.t(source, 'kk'), kazakh, `Kazakh dashboard copy is missing: ${source}`);
  }
  for (const source of ['История', '＋ Практика', 'Испытание сезона', 'Ритм без спешки', 'Широкий маршрут', 'Сезонный рывок', 'Сообщение Мике…']) {
    assert.notEqual(locale.t(source, 'en'), source, `English label is missing: ${source}`);
    assert.notEqual(locale.t(source, 'kk'), source, `Kazakh label is missing: ${source}`);
  }
});

test('buttons allow long translated labels to wrap instead of overflowing their containers', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8');
  assert.match(html, /\.btn\{[^}]*min-width:0/);
  assert.match(html, /\.btn\{[^}]*max-width:100%/);
  assert.match(html, /\.btn\{[^}]*white-space:normal/);
  assert.match(html, /\.btn\{[^}]*overflow-wrap:anywhere/);
});

test('all Russian static page labels, placeholders, and accessibility names are translated', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = (await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const cyrillic = /[А-Яа-яЁёҚқҒғҮүҰұӨөҺһІі]/u;
  const text = [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim()).filter((value) => value.length > 1 && cyrillic.test(value));
  const attributes = [...html.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)].map((match) => match[1]).filter((value) => cyrillic.test(value));
  const unchangedKazakhWords = new Set(['Мика', 'Музыка', 'Профиль', 'Қазақша', 'Аккаунт', 'Сакура', '0 мин', 'Минут']);
  for (const value of [...new Set([...text, ...attributes])]) {
    assert.notEqual(locale.t(value, 'en'), value, `English static label is missing: ${value}`);
    if (!unchangedKazakhWords.has(value)) assert.notEqual(locale.t(value, 'kk'), value, `Kazakh static label is missing: ${value}`);
  }
});

test('the archive opens only from settings and is absent from both navigation bars, profile, and home', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = (await readFile(new URL('../public/upskill.html', import.meta.url), 'utf8'))
    + (await readFile(new URL('../public/upskill-app.js', import.meta.url), 'utf8'));
  const mobileNav = html.match(/<nav[^>]*class="nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.doesNotMatch(mobileNav, /data-tab="archive"|>\s*Архив\s*</);
  const desktopNav = html.match(/<nav[^>]*id="sideNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.doesNotMatch(desktopNav, /data-tab="archive"|>\s*Архив\s*</);
  const home = html.match(/<section[^>]*id="view-novel"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(home, /data-tab="archive"|>\s*Архив\s*</);
  const profileStart = html.indexOf('id="view-ach"');
  const profileEnd = html.indexOf('id="view-archive"', profileStart);
  const profile = profileStart >= 0 && profileEnd > profileStart ? html.slice(profileStart, profileEnd) : '';
  assert.doesNotMatch(profile, /data-tab="archive"|Открыть архив и историю/);
  const settingsData = html.match(/<section class="settings-section" aria-labelledby="dataSettingsTitle">([\s\S]*?)<\/section>/)?.[1] || '';
  assert.match(settingsData, /id="openArchiveFromSettings"[^>]*>Открыть архив и историю/);
  assert.match(html, /\$\('#openArchiveFromSettings'\)\.addEventListener\('click',[\s\S]*?show\('archive'\)/);
  assert.doesNotMatch(html, /data-tab="archive"/);
  assert.doesNotMatch(html, /\.profile-archive-link/);
  assert.match(html, /id="uiLanguage"/);
  assert.match(html, /persistPreference\('uiLanguage',value\)/);
  assert.match(html, /AiryUiLocale\.apply\(uiLanguage\)/);
});
