import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const locale = require('../public/ui-locale.js');

test('UI locale supports Russian, English, and Kazakh with Russian as fallback', () => {
  assert.deepEqual(new Set(locale.supported), new Set(['ru', 'en', 'kk']));
  assert.equal(locale.t('Главная', 'ru'), 'Главная');
  assert.equal(locale.t('Главная', 'en'), 'Home');
  assert.equal(locale.t('Главная', 'kk'), 'Басты бет');
  assert.equal(locale.normalize('unsupported'), 'ru');
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
