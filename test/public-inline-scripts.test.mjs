import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public page inline scripts parse as JavaScript', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="preconnect" href="https:\/\/www\.gstatic\.com" crossorigin>/, 'warm the Firebase CDN connection before its deferred SDK scripts are requested');
  assert.match(html, /<link rel="dns-prefetch" href="https:\/\/www\.gstatic\.com">/, 'retain a DNS prefetch fallback for the Firebase CDN');
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes, source]) => !/\bsrc\s*=/.test(attributes) && source.trim());
  for (let index = 0; index < inlineScripts.length; index += 1) {
    const source = inlineScripts[index][2];
    assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} should parse`);
  }

  assert.match(html, /<script\s+defer\s+src="\/upskill-app\.js"><\/script>/, 'the application script must load after its helper modules without blocking HTML parsing');
  assert.match(html, /<script\s+defer\s+src="\/rpg-summary-sync\.js"><\/script>[\s\S]*?<script\s+defer\s+src="\/upskill-app\.js">/, 'summary sync helper must load before the app');
  assert.match(html, /<script defer src="\/skill-node-limit\.js"><\/script>[\s\S]*?<script defer src="\/upskill-app\.js">/, 'tree size guard must load before the app');
  const externalScripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"[^>]*><\/script>/gi)];
  assert.ok(externalScripts.length >= 17, 'all runtime modules should be included in the inventory');
  externalScripts.forEach(([, attributes, source], index) => {
    assert.match(attributes, /\bdefer\b/, `${source} (script ${index + 1}) must not block HTML parsing`);
    assert.doesNotMatch(attributes, /\basync\b/, `${source} must preserve deterministic dependency order`);
  });
  assert.ok(externalScripts.findIndex(([, , source]) => source.includes('firebase-app-compat')) < externalScripts.findIndex(([, , source]) => source.includes('firebase-auth-compat')));
  assert.ok(externalScripts.findIndex(([, , source]) => source.includes('firebase-auth-compat')) < externalScripts.findIndex(([, , source]) => source.includes('firebase-firestore-compat')));
  assert.ok(externalScripts.findIndex(([, , source]) => source.includes('firebase-firestore-compat')) < externalScripts.findIndex(([, , source]) => source === '/firebase-config.js'));
  assert.ok(externalScripts.findIndex(([, , source]) => source === '/rpg-summary-sync.js') < externalScripts.findIndex(([, , source]) => source === '/upskill-app.js'));
  const applicationScript = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.ok(applicationScript.trim(), 'the extracted application script must not be empty');
  assert.doesNotThrow(() => new Function(applicationScript), 'the extracted application script should parse');
});

test('manual and AI-generated tree additions use the bounded node guard', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const limit = readFileSync(new URL('../public/skill-node-limit.js', import.meta.url), 'utf8');
  assert.match(limit, /const MAX_CUSTOM_SKILL_NODES = 2_000/);
  assert.match(app, /AirySkillNodeLimit\.canAdd\(p,branchAdditions,leaves\.length\)/);
  assert.match(app, /AirySkillNodeLimit\.canAdd\(p,addsBranch\?1:0,addsBranch\?0:1\)/);
});

test('settings distinguish configured server credentials from verified Firestore writes', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  assert.match(app, /Ключи Firebase Admin и AI найдены на сервере\. Доступ к Firestore проверяется при серверной записи\./);
  assert.doesNotMatch(app, /Сервер RPG и AI настроены\. Личные данные и ключи остаются на сервере\./);
  assert.match(html, /#serverRuntimeStatus\[data-state="configured"\]/);
});

test('every static button has a visible or programmatic accessible name', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  assert.ok(buttons.length > 40, 'the full page button inventory should be checked');
  buttons.forEach(([, attributes, content], index) => {
    const visibleName = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.ok(visibleName || /\baria-label\s*=|\btitle\s*=/.test(attributes), `static button ${index + 1} needs visible text or aria-label/title`);
  });
});

test('every ID-based static button is connected to application logic', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)]
    .map(([, attributes]) => attributes.match(/\bid="([^"]+)"/)?.[1])
    .filter(Boolean);
  assert.ok(buttons.length > 50, 'the button inventory should cover all application screens');
  const unreferenced = buttons.filter((id) => !app.includes(`#${id}`)
    && !app.includes(`getElementById("${id}")`)
    && !app.includes(`getElementById('${id}')`));
  assert.deepEqual(unreferenced, [], 'each ID-based button should be wired or read by the application');
});

test('practice editor restores its edit action label after a failed save', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.match(app, /finally\{ciBusy=false;btn\.disabled=false;btn\.textContent=ciEditing\?'Сохранить изменения':'Записать в дневник';\}/);
});

test('a duplicate practice retry restores the existing server record without awarding it again', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.match(app, /if\(!result\.created&&entry\.id&&!store\.proofs\.some\(p=>p\.id===entry\.id\)\)\{store\.proofRecent=\[entry,\.\.\.store\.proofRecent\.filter\(p=>p\.id!==entry\.id\)\]\.slice\(0,PROOF_PAGE_SIZE\);store\.proofOlder\.delete\(entry\.id\);syncProofHistory\(\);onData\(\);\}/, 'the existing record should appear immediately while the summary refreshes from the server');
  assert.match(app, /if\(savedEvent&&savedEvent\.created===false\).*?Уже сохранено.*?return;/, 'the duplicate response must exit before achievement and XP celebrations run');
});

test('settings is a standalone view and archive is opened only from settings', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const settingsStart = html.indexOf('<section class="view settings-page gutter" id="view-settings"');
  assert.notEqual(settingsStart, -1, 'settings must be part of the page view system');
  assert.ok(settingsStart < html.indexOf('</main>'), 'settings must render inside the main content area');
  assert.doesNotMatch(html.slice(settingsStart, html.indexOf('</main>', settingsStart)), /aria-modal="true"/, 'settings must not be a modal dialog');

  const bottomNav = html.match(/<nav class="nav gutter"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(bottomNav, /data-tab="novel"/);
  assert.match(bottomNav, /data-tab="journal"/);
  assert.doesNotMatch(bottomNav, /data-tab="archive"/, 'archive stays off the bottom tab bar');
  const sideNav = html.match(/<nav class="rail-links" id="sideNav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.doesNotMatch(sideNav, /data-tab="archive"/, 'archive stays out of the desktop rail');
  assert.doesNotMatch(html, /data-tab="archive"/, 'archive has no shortcut outside settings');
  assert.match(html, /id="openArchiveFromSettings"[^>]*>Открыть архив и историю/);
  assert.match(readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8'), /\$\('#openArchiveFromSettings'\)\.addEventListener\('click',[\s\S]*?show\('archive'\)/, 'settings opens the archive view');
  assert.match(html, /button:not\(:disabled\):hover\{translate:0 -1px;filter:brightness\(1\.055\);box-shadow:/, 'enabled buttons lift and brighten on hover');
  assert.match(html, /button:not\(:disabled\):active\{translate:0 0;scale:\.98\}/, 'buttons show a pressed state');
  assert.match(html, /prefers-reduced-motion:reduce\)[\s\S]*?button:not\(:disabled\):hover,button:not\(:disabled\):active\{translate:none!important;scale:none!important\}/, 'button motion respects reduced-motion preferences');
});

test('achievement catalog renders in small pages and keeps loading/search paging consistent', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.match(app, /const AWARD_PAGE_SIZE=36;\s*let awardsVisibleLimit=AWARD_PAGE_SIZE;/);
  assert.match(app, /matches\.slice\(0,awardsVisibleLimit\)/);
  assert.match(app, /Math\.min\(AWARD_PAGE_SIZE,matches\.length-rendered\.length\)/);
  assert.match(app, /awardsVisibleLimit=AWARD_PAGE_SIZE;renderAwards\(\)/, 'search and category changes should reset paging');
  assert.match(app, /awardsVisibleLimit\+=AWARD_PAGE_SIZE;renderAwards\(\)/, 'load more should reveal the next page');
  assert.match(app, /const definitions=allAchievementDefinitions\(\);[\s\S]*?renderNextAwards\(S,got,definitions\)/, 'one up-to-date definition list should serve the whole render pass');
  assert.match(app, /map\(a=>\(\{award:a,progress:awardProgress\(a,s,definitions\)\}\)\)/, 'next-award progress should reuse the shared definition list');
  assert.match(app, /progress=awardProgress\(a,S,definitions\)/, 'card progress should use its already-resolved definition');
});

test('global account level progress stays uncapped while skill levels may have their own cap', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.match(app, /function tlv\(xp\)\{const v=ACH\.levelForXp\(xp,60\);/);
  assert.match(app, /homeXpNext'\)\.textContent=num\(S\.total-tl\.lo\)\+' \/ '\+num\(tl\.hi-tl\.lo\)\+' опыта до следующего уровня'/);
  assert.doesNotMatch(app, /tl\.L>=10\?'Максимальный уровень достигнут'/, 'the uncapped global RPG level must not be shown as maxed at level 10');
});

test('light theme keeps the selected glass tab icon and label high contrast', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  assert.match(html, /body\[data-theme-mode="day"\] \.node\.locked\{opacity:\.92;background:#ece8ef;[^}]*color:#514a58\}/, 'locked skill nodes should remain visually distinct without fading their labels in the light theme');
  assert.match(html, /body\[data-theme-mode="day"\] \.nav-in button\[aria-current="page"\]\{color:#38213e!important\}/);
  assert.match(html, /body\[data-theme-mode="day"\] \.nav-in button\[aria-current="page"\] svg\{stroke:currentColor;filter:none\}/);
});

test('very narrow phone header keeps actions inside the viewport', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const compactHeader = html.split('\n')
    .filter((line) => line.includes('@media(max-width:360px)') && line.includes('.top-actions'))
    .join(' ');
  assert.match(compactHeader, /\.top-actions\{gap:3px\}/);
  assert.match(compactHeader, /\.settings-toggle,\.music-toggle,\.account-toggle\{width:32px/);
  assert.match(compactHeader, /\.streak span\{display:none\}/);
});

test('AI skill planning offers a safe separate-goal branch without replacing existing branches', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const source = html + app;
  const route = readFileSync(new URL('../app/api/rpg/skills/generate/route.ts', import.meta.url), 'utf8');
  assert.match(source, /Создать отдельную ветку цели, сохранив остальные/);
  assert.match(source, /const bid=!separate&&d\.place\?d\.place:\('cb-'\+uid\)/);
  assert.match(source, /customBranches:cb,customLeaves:\(p\.customLeaves\|\|\[\]\)\.concat\(leaves\)/);
  assert.match(route, /formatSkillProgressContext\(relevantBranches,\s*branchXp,\s*skillXp\)/);
  assert.match(route, /const progressRows\s*=\s*shareProgress\s*\?\s*branches\.map/);
  assert.match(route, /selectRelevantSkillBranches\(objective,\s*branches,\s*progressRows/);
});

test('custom specialization achievements remain visible after a branch is archived', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const source = html + app;
  const catalog = readFileSync(new URL('../public/achievement-catalog.js', import.meta.url), 'utf8');
  assert.match(catalog, /forProfile:\s*\{\s*value:/);
  assert.match(catalog, /custom-branch-\$\{branch\.id\}-level-\$\{target\}/);
  assert.match(source, /function allAchievementDefinitions\(\)[\s\S]*?saved=entry&&entry\.achievement/);
  assert.match(source, /allAchievementDefinitions\(\)\.filter\(award=>earned\.has\(award\.id\)\)/);
});

test('cloud history stays paginated and skill-tree edge redraws are frame-coalesced', () => {
  const html = readFileSync(new URL('../public/upskill.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  const source = html + app;
  assert.match(source, /if\(db&&uid\)\{store\.mode='db';store\.deferHistory=true;/, 'the connected database adapter must defer old proof pages');
  assert.match(source, /if\(!user\)\{store\.mode='local';store\.deferHistory=false;/, 'local history must remain immediately available');
  assert.match(source, /if\(first===false&&!store\.deferHistory&&!store\.historyComplete&&!store\.historyLoading\)loadOlderProofPages\(query,store\.historyCursor,generation,Infinity\)/, 'history backfill should only run when explicitly enabled');
  assert.match(source, /function scheduleDrawEdges\(\)\{\s*edgeDrawGeneration\+\+;\s*if\(edgeBatchFrame\)\{cancelAnimationFrame\(edgeBatchFrame\);edgeBatchFrame=0;\}\s*if\(edgeDrawFrame\)return;\s*edgeDrawFrame=requestAnimationFrame\(\(\)=>\{edgeDrawFrame=0;drawEdges\(edgeDrawGeneration\);\}\);\s*\}/, 'repeated layout changes should share one edge redraw per frame and cancel stale batches');
  assert.match(source, /let budget=96;const fragment=document\.createDocumentFragment\(\)/, 'large edge sets should be rendered in bounded batches');
  assert.match(source, /treeGroupObserver=new IntersectionObserver\(entries=>[\s\S]*?root:treeViewport,rootMargin:'160px 0px',threshold:0/, 'only branches near the visible tree viewport should trigger edge work');
  assert.match(source, /groups=treeGroupObserver\?allGroups\.filter\(group=>group\.dataset\.viewportVisible==='true'\):allGroups/, 'edge layout should skip offscreen branches when IntersectionObserver is available');
  assert.match(source, /root\.dataset\.largeTree=String\(nodeCount>80\)/, 'large trees should be marked before interaction animations are painted');
  assert.match(html, /\.tree\[data-large-tree="true"\] \.node\{animation:none\}/, 'large trees should not animate thousands of node cards at once');
  assert.match(source, /activeBranchRect=branch\.hidden\?rr:branch\.getBoundingClientRect\(\)/, 'filtered leaves should connect to the visible root instead of an invisible branch');
  assert.match(source, /if\(generation!==edgeDrawGeneration\|\|!svg\.isConnected\)return/, 'a stale edge batch must stop after the tree is redrawn or filtered');
  assert.match(source, /edgeBatchFrame=requestAnimationFrame\(\(\)=>\{edgeBatchFrame=0;drawBatch\(\);\}\)/, 'remaining edge work should continue on later animation frames');
  assert.match(source, /new ResizeObserver\(\(\)=>\{clampTreeCamera\(\);scheduleDrawEdges\(\);\}\)/, 'tree viewport resize should clamp the camera and use the frame-coalesced redraw');
  assert.match(html, /id="treeViewport"[\s\S]*?id="treeCamera"[\s\S]*?id="tree"/, 'the skill map should have a bounded viewport and a transformable camera');
  for (const control of ['treeZoomOut', 'treeZoomIn', 'treeZoomReset', 'treePanToggle']) {
    assert.match(html, new RegExp('id="' + control + '"'), control + ' should be available to operate the map');
  }
  assert.match(source, /function setTreeZoom\(scale,anchorX,anchorY\)[\s\S]*?Math\.max\(\.65,Math\.min\(2\.2,scale\)\)/, 'zoom should stay within readable bounds and use the selected focal point');
  assert.match(source, /treeViewport\.addEventListener\('keydown'/, 'the map should support keyboard navigation');
  assert.match(source, /treeViewport\.addEventListener\('pointermove'/, 'the pan mode should track pointer movement');
  assert.match(source, /\(a\.right-R\.left\)\/scale/, 'edge geometry should account for camera zoom');
  assert.match(source, /body\[data-motion="reduced"\] \.tree-camera\{transition:none\}/, 'the user animation preference should disable camera motion');
  assert.match(html, /body\[data-motion="reduced"\] \*,body\[data-motion="reduced"\] \*::before,body\[data-motion="reduced"\] \*::after\{animation:none!important;transition:none!important;scroll-behavior:auto!important\}/, 'the user animation preference should disable transitions and animations throughout every screen');
  assert.match(html, /\.tree-viewport\{[^}]*touch-action:pan-y/, 'vertical page scrolling should remain available by default on touch screens');
});

test('journal retry reconnects a failed live listener and restores previously loaded history pages', () => {
  const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
  assert.match(app, /function watchProofHistory\(query,onError,onReady,restoreOlderPages=0\)/);
  assert.match(app, /error=>\{store\.historyError=true;store\.historyListenerError=true;/, 'snapshot failures should be distinguished from older-page failures');
  assert.match(app, /if\(initial&&restoreOlderPages>0&&store\.historyCursor&&!store\.historyComplete\)void loadOlderProofPages\(query,store\.historyCursor,generation,restoreOlderPages\)/, 'reconnection should fetch the pages the user had already loaded');
  assert.match(app, /const restorePages=Math\.ceil\(store\.proofOlder\.size\/PROOF_PAGE_SIZE\);store\.historyError=false;if\(store\.historyListenerError\|\|!store\.historyCursor\)watchProofHistory\(store\.col,err=>\$\('#accountErrIn'\)\.textContent=cloudError\(err\),onData,restorePages\);else loadOlderProofPages\(store\.col,store\.historyCursor,store\.historyGeneration,1\)/, 'retry should reconnect a dead live query and only page backward for page-load errors');
});
