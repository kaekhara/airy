import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/upskill-app.js', import.meta.url), 'utf8');
const friendStart = app.indexOf("$('#friendAcceptForm').addEventListener");
const friendRoute = app.slice(friendStart, app.indexOf("$('#friendsReload')", friendStart));
const shareStart = app.indexOf("$('#shareProgress').addEventListener");
const shareRoute = app.slice(shareStart, app.indexOf('function renderAchievementArchive', shareStart));

test('server-earned friend and share achievements update the client ledger and present the reward', () => {
  assert.match(app, /function applyServerAchievementAwards\(awards\)/);
  assert.match(app, /if\(!definition\)return;[\s\S]*?ledger\[award\.id\]/);
  assert.match(app, /function presentServerAchievementAwards\(awards,\{showCelebration=true\}=\{\}\)/);
  assert.match(app, /badge\.classList\.add\('just-earned'\)/);
  assert.match(app, /fx\(awards\.length===1\?'ДОСТИЖЕНИЕ ОТКРЫТО'/);
  assert.match(friendRoute, /applyFriendAchievementResult\(result\)/);
  assert.match(friendRoute, /presentServerAchievementAwards\(fresh\)/);
  assert.match(shareRoute, /applyServerAchievementAwards\(result\.earned\)/);
  assert.match(shareRoute, /presentServerAchievementAwards\(freshAwards\|\|\[\]\)/);
});

test('practice route achievements update the local ledger from the server response and drive Mika dialogue', () => {
  const proofStart = app.indexOf('store.addProof=async function(entry)');
  const proofRoute = app.slice(proofStart, app.indexOf('store.delProof=async function(id)', proofStart));
  const checkinStart = app.indexOf("$('#ciForm').addEventListener('submit'");
  const checkin = app.slice(checkinStart, app.indexOf("$('#ciEditCancel')", checkinStart));
  const dialogue = app.slice(app.indexOf('function afterLines('), app.indexOf('/* ---------- AI tree + quests ---------- */'));
  assert.match(proofRoute, /result\.created\?applyServerAchievementAwards\(result\.earned\):\[\]/);
  assert.match(proofRoute, /earnedAwards\};/);
  assert.match(checkin, /afterLines\(entry,before,after,store\.mode==='db'\?savedEvent\.earnedAwards:null\)/);
  assert.match(dialogue, /if\(Array\.isArray\(serverAwards\)\)serverAwards\.forEach\(award=>lines\.push/);
  assert.match(checkin, /presentServerAchievementAwards\(savedEvent\.earnedAwards,\{showCelebration:false\}\)/);
});

test('social award application rejects malformed, unknown, and already-earned IDs', () => {
  assert.ok(app.includes("typeof award.id!=='string'"));
  assert.ok(app.includes("!/^[-a-zA-Z0-9_:]{1,100}$/.test(award.id)||ledger[award.id]"));
  assert.ok(app.includes('const definitions=new Map(allAchievementDefinitions().map(award=>[award.id,award]))'));
  assert.ok(app.includes('if(fresh.length)store.profile=Object.assign'));
});
