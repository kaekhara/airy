
(function(){
'use strict';

/* ---------- helpers ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const uiLocaleTag=()=>({ru:'ru-RU',en:'en-US',kk:'kk-KZ'})[window.AiryUiLocale?.getLocale?.()]||'ru-RU';
const SYSTEM_REDUCED=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
let REDUCED=SYSTEM_REDUCED;
const dayKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const dayT=k=>{const p=k.split('-').map(Number);return new Date(p[0],p[1]-1,p[2],12).getTime();};
const dayDiff=(a,b)=>Math.round((dayT(a)-dayT(b))/864e5);
const addDays=(k,n)=>{const p=k.split('-').map(Number);return dayKey(new Date(p[0],p[1]-1,p[2]+n,12).getTime());};
const num=n=>new Intl.NumberFormat(uiLocaleTag()).format(n);
const countLabel=(count,ruForms,enForms,kkForm)=>{const locale=window.AiryUiLocale?.getLocale?.()||'ru',n=Math.abs(Number(count)||0);if(locale==='en')return `${num(count)} ${n===1?enForms[0]:enForms[1]}`;if(locale==='kk')return `${num(count)} ${kkForm}`;const whole=Math.floor(n)%100,last=whole%10,index=whole>=11&&whole<=14?2:last===1?0:last>=2&&last<=4?1:2;return `${num(count)} ${ruForms[index]}`;};

/* ---------- skill tree data ---------- */
const BASE=[
  {id:'cyber',name:'Кибербезопасность',c:'#5ad7ff',leaves:[
    {id:'cyber-net',name:'Сети',req:1},{id:'cyber-crypto',name:'Криптография',req:2},{id:'cyber-web',name:'Веб-уязвимости',req:3},{id:'cyber-ctf',name:'CTF и практика',req:4}]},
  {id:'db',name:'Базы данных',c:'#ffb347',leaves:[
    {id:'db-sql',name:'SQL-запросы',req:1},{id:'db-trig',name:'Триггеры и функции',req:2},{id:'db-roles',name:'Роли и безопасность',req:3},{id:'db-tx',name:'Транзакции и репликация',req:4}]},
  {id:'py',name:'Python',c:'#7be08a',leaves:[
    {id:'py-base',name:'Основы',req:1},{id:'py-auto',name:'Скрипты и автоматизация',req:2},{id:'py-api',name:'FastAPI',req:3},{id:'py-test',name:'Тесты и чистый код',req:4}]},
  {id:'ios',name:'SwiftUI и iOS',c:'#ff8f7a',leaves:[
    {id:'ios-ui',name:'Экраны SwiftUI',req:1},{id:'ios-pix',name:'UI точно по макету',req:2},{id:'ios-anim',name:'Анимации',req:3},{id:'ios-fb',name:'Firebase и данные',req:4}]},
  {id:'art',name:'Дизайн и 3D',c:'#ff7eb6',leaves:[
    {id:'art-bl',name:'Blender',req:1},{id:'art-2d',name:'2D-анимация',req:2},{id:'art-pres',name:'Презентации',req:3}]},
  {id:'lang',name:'Языки',c:'#b79bff',leaves:[
    {id:'lang-ko',name:'Корейский',req:1},{id:'lang-en',name:'Английский для IT',req:2}]}
];
const HUES=['#6fe3ff','#ffd36e','#9be7a0','#ff9fb2','#c3a8ff','#ffb98a'];
let TREE=[],SK={};
let homeRecommendationSkillId='';
let homeActivityRange=7;
function buildTree(){
  const prof=store.profile||{};
  ACH=window.AiryAchievementCatalog.forProfile(prof);
  const hidden=new Set(prof.hiddenSkills||[]),edits=prof.skillEdits||{};
  TREE=BASE.filter(b=>!hidden.has(b.id)).map(b=>({id:b.id,name:(edits[b.id]&&edits[b.id].name)||b.name,c:b.c,leaves:b.leaves.filter(l=>!hidden.has(l.id)).map(l=>({id:l.id,name:(edits[l.id]&&edits[l.id].name)||l.name,req:l.req,branch:b.id}))}));
  (prof.customBranches||[]).filter(b=>!hidden.has(b.id)).forEach(b=>TREE.push({id:b.id,name:(edits[b.id]&&edits[b.id].name)||b.name,c:b.c||'#6fe3ff',leaves:[],custom:true}));
  (prof.customLeaves||[]).filter(l=>!hidden.has(l.id)).forEach(l=>{const b=TREE.find(x=>x.id===l.branch);if(b)b.leaves.push({id:l.id,name:(edits[l.id]&&edits[l.id].name)||l.name,req:Math.max(1,Math.min(4,+l.req||1)),branch:b.id,custom:true,description:String(l.description||''),difficulty:Math.max(1,Math.min(5,+l.difficulty||1)),prerequisites:Array.isArray(l.prerequisites)?l.prerequisites.filter(id=>typeof id==='string'):[],success:String(l.success||''),xp:Math.max(5,Math.min(100,+l.xp||15)),minutes:Math.max(15,Math.min(600,+l.minutes||30)),materials:Array.isArray(l.materials)?l.materials.filter(x=>typeof x==='string').slice(0,5):[],kind:['normal','important','challenge','boss'].includes(l.kind)?l.kind:'normal',quest:String(l.quest||'')});});
  SK={};
  TREE.forEach(b=>{SK[b.id]={id:b.id,name:b.name,c:b.c,branch:b.id,isBranch:true,req:0,difficulty:1};
    b.leaves.forEach(l=>{SK[l.id]={id:l.id,name:l.name,c:b.c,branch:b.id,isBranch:false,req:l.req,difficulty:l.difficulty||l.req||1};});});
}

/* ---------- levels ---------- */
function lv(xp){const v=ACH.levelForXp(xp,25,10);return{L:v.level,lo:v.low,hi:v.high,xp:v.xp,frac:v.fraction};}
function tlv(xp){const v=ACH.levelForXp(xp,60);return{L:v.level,lo:v.low,hi:v.high,xp:v.xp,frac:v.fraction};}
const RANKS=[[16,'Легенда'],[12,'Мастер'],[8,'Специалист'],[5,'Практик'],[3,'Ученик'],[1,'Новичок']];
const rankOf=L=>(RANKS.find(r=>L>=r[0])||RANKS[RANKS.length-1])[1];
function xpBase(o){return ACH.practiceXp(o);}

/* ---------- achievements ---------- */
let ACH=window.AiryAchievementCatalog;
function allAchievementDefinitions(){
  const byId=new Map(ACH.map(award=>[award.id,award])),ledger=(store.profile&&store.profile.achievementUnlocks)||{};
  Object.entries(ledger).forEach(([id,entry])=>{const saved=entry&&entry.achievement;if(!byId.has(id)&&saved&&saved.id===id&&typeof saved.n==='string'&&typeof saved.d==='string')byId.set(id,{...saved,rarity:entry.rarity||'Common',reward:entry.reward||{type:'cosmetic',title:'Награда'}});});
  return Array.from(byId.values());
}
function achievementValue(award,stats){
  if(award.metric.startsWith('branchLevel:'))return stats.bl[award.metric.slice('branchLevel:'.length)]?.L||0;
  return Number(stats[award.metric])||0;
}
function achievementReached(award,stats){return achievementValue(award,stats)>=award.target;}

/* ---------- stats ---------- */
function hasEmbeddedPracticeImage(images){return Array.isArray(images)&&images.some(image=>image&&typeof image.d==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image.d));}
function computeStats(proofs,profile=store.profile||{}){
  ACH=window.AiryAchievementCatalog.forProfile(profile);
  const summary=store.mode==='db'&&store.summary&&store.summary.version===7?store.summary:null;
  const knownProofs=new Set(store.proofs.flatMap(p=>[p.id,p.eventId].filter(Boolean)));
  const s={count:summary?Math.max(0,Number(summary.count)||0):proofs.length,total:summary?Math.max(0,Number(summary.total)||0):0,minutes:summary?Math.max(0,Number(summary.minutes)||0):0,byDay:new Map(),xpBy:summary&&summary.skillXp?Object.assign({},summary.skillXp):{},bxp:summary&&summary.branchXp?Object.assign({},summary.branchXp):{},bl:{},sl:{},unlocked:new Set(),lastBy:{},proofCount:summary?Math.max(0,Number(summary.proofCount)||0):0,night:!!(summary&&Number(summary.nightCount)>0),morning:!!(summary&&Number(summary.morningCount)>0),nightCount:summary?Number(summary.nightCount)||0:0,morningCount:summary?Number(summary.morningCount)||0:0,weekendCount:summary?Number(summary.weekendCount)||0:0};
  TREE.forEach(b=>{s.bxp[b.id]=s.bxp[b.id]||0;});
  if(summary){Object.entries(summary.dayCounts||{}).forEach(([day,count])=>{if(/^\d{4}-\d{2}-\d{2}$/.test(day))s.byDay.set(day,{n:Math.max(0,Number(count)||0),xp:Math.max(0,Number(summary.dayXp?.[day])||0)});});}
  proofs.forEach(p=>{
    const x=+p.xp||0,day=typeof p.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.day)?p.day:dayKey(Number(p.ts)||Date.now());
    const extra=summary&&!knownProofs.has(p.id)&&!knownProofs.has(p.eventId);
    if(!summary||extra){if(summary){s.total+=x;s.minutes+=+p.min||0;s.count++;}else{s.total+=x;s.minutes+=+p.min||0;}s.xpBy[p.skill]=(s.xpBy[p.skill]||0)+x;const sk=SK[p.skill];if(sk){const branchXp=p.branchXp==null?x:Math.max(0,Number(p.branchXp)||0);s.bxp[sk.branch]=(s.bxp[sk.branch]||0)+branchXp;}}
    const d=s.byDay.get(day)||{n:0,xp:0};if(!summary||extra){d.n++;d.xp+=x;}s.byDay.set(day,d);
    if(!s.lastBy[p.skill]||p.ts>s.lastBy[p.skill])s.lastBy[p.skill]=p.ts;
    if(!summary||extra){if(p.link||hasEmbeddedPracticeImage(p.imgs))s.proofCount++;if(p.h>=23){s.night=true;s.nightCount++;}if(p.h<8){s.morning=true;s.morningCount++;}const offset=Math.max(-720,Math.min(840,Number(p.utcOffsetMinutes)||0)),localDate=typeof p.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.day)?new Date(p.day+'T12:00:00.000Z'):new Date((Number(p.ts)||0)+offset*60000),weekday=localDate.getUTCDay();if(weekday===0||weekday===6)s.weekendCount++;}
  });
  if(summary){
    const today=dayKey(Date.now()),yesterday=addDays(today,-1),last=typeof summary.lastDay==='string'?summary.lastDay:'';
    s.streak=(last===today||last===yesterday)?Math.max(0,Number(summary.currentStreak)||0):0;
    s.best=Math.max(0,Number(summary.best)||0);s.lastDay=last||null;
    const extras=proofs.some(p=>!knownProofs.has(p.id)&&!knownProofs.has(p.eventId));
    if(extras){const days=Array.from(s.byDay.keys()).sort();let run=0,previous=null;days.forEach(day=>{run=previous&&dayDiff(day,previous)===1?run+1:1;s.best=Math.max(s.best,run);previous=day;});const anchor=s.byDay.has(today)?today:(s.byDay.has(yesterday)?yesterday:null);s.streak=0;if(anchor){s.streak=1;let day=anchor;while(s.byDay.has(addDays(day,-1))){s.streak++;day=addDays(day,-1);}}if(days.length)s.lastDay=days[days.length-1];}
    s.questsCompleted=Math.max(0,Number(summary.questsCompleted)||0);
  }
  s.used=Object.keys(s.xpBy).filter(k=>SK[k]).length;
  s.activeDays=s.byDay.size;
  if(!summary)s.questsCompleted=new Set(proofs.filter(p=>p.quest).map(p=>p.quest)).size;
  s.shareCount=Math.max(0,Number(profile.shareCount)||0);
  s.maxB=0;s.touched=0;
  TREE.forEach(b=>{s.bl[b.id]=lv(s.bxp[b.id]||0);if(s.bl[b.id].L>s.maxB)s.maxB=s.bl[b.id].L;if((s.bxp[b.id]||0)>0)s.touched++;
    b.leaves.forEach(l=>{s.sl[l.id]=lv(s.xpBy[l.id]||0);const prereqs=Array.isArray(l.prerequisites)?l.prerequisites:[];if(s.bl[b.id].L>=l.req&&prereqs.every(id=>(s.xpBy[id]||0)>0))s.unlocked.add(l.id);});});
  s.advUnlocked=0;TREE.forEach(b=>b.leaves.forEach(l=>{if(l.req>1&&s.unlocked.has(l.id))s.advUnlocked++;}));
  s.tl=tlv(s.total);
  if(!summary){const days=Array.from(s.byDay.keys()).sort();let best=0,run=0,prev=null;days.forEach(k=>{run=(prev&&dayDiff(k,prev)===1)?run+1:1;if(run>best)best=run;prev=k;});s.best=best;const today=dayKey(Date.now()),yest=addDays(today,-1);let cur=0,anchor=s.byDay.has(today)?today:(s.byDay.has(yest)?yest:null);if(anchor){cur=1;let k=anchor;while(s.byDay.has(addDays(k,-1))){cur++;k=addDays(k,-1);}}s.streak=cur;s.lastDay=days.length?days[days.length-1]:null;}
  s.ach=ACH.filter(a=>achievementReached(a,s)).map(a=>a.id);
  return s;
}

/* ---------- storage ---------- */
const LS_KEY='upskill-vn-v1';
const ONBOARDING_KEY='upskill-onboarding-v1';
const PROOF_PAGE_SIZE=1000,JOURNAL_PAGE_SIZE=60;
const store={mode:'local',profile:{},summary:null,summaryError:false,proofs:[],proofRecent:[],proofOlder:new Map(),historyCursor:null,historyComplete:true,historyLoading:false,historyError:false,historyListenerError:false,historyGeneration:0,historyUnsub:null,deferHistory:false,assets:null,downloads:null,sample:null,col:null,base:null,auth:null,accountUser:null,firebaseReady:false,unsubs:[]};
function lsLoad(){store.profile={};store.summary=null;store.summaryError=false;store.proofs=[];resetProofHistory();try{const r=JSON.parse(localStorage.getItem(LS_KEY)||'null');if(r){store.profile=r.profile||{};store.proofs=r.proofs||[];}}catch(e){}}
function resetProofHistory(){if(store.historyUnsub){try{store.historyUnsub();}catch{}store.unsubs=store.unsubs.filter(fn=>fn!==store.historyUnsub);store.historyUnsub=null;}store.proofRecent=[];store.proofOlder=new Map();store.historyCursor=null;store.historyComplete=true;store.historyLoading=false;store.historyError=false;store.historyListenerError=false;store.historyGeneration++;}
function mergedProofHistory(){const byId=new Map();store.proofOlder.forEach(p=>byId.set(p.id,p));store.proofRecent.forEach(p=>byId.set(p.id,p));return Array.from(byId.values()).sort((a,b)=>(Number(b.ts)||0)-(Number(a.ts)||0));}
function syncProofHistory(){store.proofs=mergedProofHistory();}
function loadOlderProofPages(query,cursor,generation,maxPages=1){
  if(!cursor||store.historyLoading||store.historyComplete)return Promise.resolve();
  store.historyLoading=true;store.historyError=false;
  const pageQuery=query.orderBy('ts','desc');
  return (async()=>{let next=cursor,pages=0;try{
    while(generation===store.historyGeneration&&pages<maxPages){
      const page=await pageQuery.startAfter(next).limit(PROOF_PAGE_SIZE).get();
      if(generation!==store.historyGeneration)return;
      if(!page.docs.length){store.historyComplete=true;break;}
      page.docs.forEach(doc=>store.proofOlder.set(doc.id,Object.assign({id:doc.id},doc.data())));
      next=page.docs[page.docs.length-1];store.historyCursor=next;pages++;
      if(page.docs.length<PROOF_PAGE_SIZE){store.historyComplete=true;syncProofHistory();onData();break;}
      if(pages%3===0){syncProofHistory();onData();}
    }
  }catch(error){store.historyError=true;console.warn('Older diary entries could not be loaded',error&&error.code||'unknown');}
  finally{if(generation===store.historyGeneration){store.historyLoading=false;syncProofHistory();onData();}}
  })();
}
function watchProofHistory(query,onError,onReady,restoreOlderPages=0){
  resetProofHistory();const generation=store.historyGeneration;let first=true;
  const unsubscribe=query.orderBy('ts','desc').limit(PROOF_PAGE_SIZE).onSnapshot(async snap=>{
    if(generation!==store.historyGeneration)return;
    const previous=store.proofRecent,next=snap.docs.map(doc=>Object.assign({id:doc.id},doc.data())),nextIds=new Set(next.map(p=>p.id));
    const dropped=previous.filter(p=>!nextIds.has(p.id));
    store.proofRecent=next;
    const initial=first;if(first){first=false;store.historyCursor=snap.docs[snap.docs.length-1]||null;store.historyComplete=snap.docs.length<PROOF_PAGE_SIZE;}
    // A capped live query evicts its oldest item when a new record is added.
    // Keep that item only if it still exists; this distinguishes eviction from deletion.
    if(dropped.length){await Promise.all(dropped.map(async p=>{try{const check=await query.firestore.doc(p.id).get();if(check.exists)store.proofOlder.set(p.id,p);else store.proofOlder.delete(p.id);}catch{store.proofOlder.set(p.id,p);}}));}
    syncProofHistory();onData();if(initial&&onReady)onReady();
    if(initial&&restoreOlderPages>0&&store.historyCursor&&!store.historyComplete)void loadOlderProofPages(query,store.historyCursor,generation,restoreOlderPages);
    else if(first===false&&!store.deferHistory&&!store.historyComplete&&!store.historyLoading)loadOlderProofPages(query,store.historyCursor,generation,Infinity);
  },error=>{store.historyError=true;store.historyListenerError=true;if(first){first=false;store.historyComplete=true;if(onReady)onReady(error);}onData();onError(error);});
  store.historyUnsub=unsubscribe;store.unsubs.push(unsubscribe);
}
function lsSave(){try{localStorage.setItem(LS_KEY,JSON.stringify({profile:store.profile,proofs:store.proofs}));}catch(e){toast('Память браузера заполнена. Скачай копию во вкладке «Награды».');}}
async function refreshRpgSummary(user=store.auth&&store.auth.currentUser){
  if(!user)return null;
  const ticket=rpgSummarySync.begin(user.uid);if(ticket===null)return null;
  try{
    const token=await user.getIdToken(),response=await fetch('/api/rpg/summary',{headers:{Authorization:'Bearer '+token},cache:'no-store'}),result=await response.json().catch(()=>({}));
    if(!response.ok||!result.summary||result.summary.version!==7)throw new Error(result.error||'SUMMARY_LOAD_FAILED');
    if(!rpgSummarySync.isCurrent(user.uid,ticket)||user.uid!==store.accountUser?.uid)return null;
    store.summary=result.summary;store.summaryError=false;onData();return store.summary;
  }catch(error){if(rpgSummarySync.isCurrent(user.uid,ticket)&&user.uid===store.accountUser?.uid){store.summaryError=true;onData();}console.warn('RPG summary unavailable; using loaded diary records',error&&error.message||'unknown');return null;}
}
const rpgSummarySync=window.AiryRpgSummarySync.createRpgSummarySync();
store.addProof=async function(entry){
  if(entry.eventId){const existing=store.proofs.find(p=>p.eventId===entry.eventId);if(existing){entry.id=existing.id;return{created:false,id:existing.id};}}
  if(store.mode==='db'){
    if(store.firebaseReady&&store.auth&&store.auth.currentUser){
      const token=await store.auth.currentUser.getIdToken();
      const response=await fetch('/api/rpg/practice',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({eventId:entry.eventId,skill:entry.skill,text:entry.text,min:entry.min,link:entry.link,imgs:entry.imgs||[],questId:entry.quest||'',utcOffsetMinutes:-new Date().getTimezoneOffset()})});
      const result=await response.json().catch(()=>({}));
      if(response.ok){Object.assign(entry,result.entry||{});const earnedAwards=result.created?applyServerAchievementAwards(result.earned):[];if(result.summary&&result.summary.version===7){rpgSummarySync.invalidate();store.summary=result.summary;store.summaryError=false;}else void refreshRpgSummary();if(!result.created&&entry.id&&!store.proofs.some(p=>p.id===entry.id)){store.proofRecent=[entry,...store.proofRecent.filter(p=>p.id!==entry.id)].slice(0,PROOF_PAGE_SIZE);store.proofOlder.delete(entry.id);syncProofHistory();onData();}return{created:!!result.created,id:entry.id,earnedAwards};}
      throw new Error(({SKILL_LOCKED:'Этот навык пока закрыт. Сначала выполни условия открытия.',SKILL_UNKNOWN:'Навык не найден. Обнови страницу и выбери его снова.',SKILL_GRAPH_INVALID:'В связях древа обнаружена ошибка. Исправь зависимости навыков и повтори.',QUEST_INVALID:'Этот квест уже выполнен или больше не активен.',QUEST_DONE:'Этот квест уже выполнен.',QUEST_EXPIRED:'Время этого квеста закончилось.',QUEST_SKILL:'Выбери навык, указанный в квесте.',QUEST_MINUTES:'Для этого квеста нужно больше времени практики.',QUEST_EVIDENCE:'Приложи ссылку или изображение к записи.',RATE_LIMITED:'Слишком много записей подряд. Сделай небольшую паузу.',FIRESTORE_PERMISSION_DENIED:'Firestore отклонил запись. Проверь, что сервисному аккаунту из FIREBASE_SERVICE_ACCOUNT_JSON выдана роль Cloud Datastore User (roles/datastore.user) в IAM Google Cloud, затем подожди применения роли.',SERVER_NOT_CONFIGURED:'Облачная запись практики пока не настроена на сервере. Данные не записаны.',SERVER_CONFIG_INVALID:'Сервер сохранения практики требует настройки Firebase Admin.',AUTH_REQUIRED:'Войди в аккаунт, чтобы сохранить практику.',INVALID_AUTH:'Сеанс истёк. Войди в аккаунт ещё раз.'})[result.error]||'Не удалось сохранить практику через сервер.');
    }
    throw new Error('Облачное сохранение недоступно. Войди в аккаунт и проверь подключение.');
  }
  entry.id=entry.eventId?'event_'+entry.eventId:'p'+entry.ts+Math.random().toString(36).slice(2,6);store.proofs=[entry].concat(store.proofs);lsSave();onData();return{created:true,id:entry.id};
};
store.delProof=async function(id){
  if(store.mode==='db'){
    if(store.firebaseReady&&store.auth&&store.auth.currentUser){
      const token=await store.auth.currentUser.getIdToken(),response=await fetch('/api/rpg/practice/'+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:'Bearer '+token}}),result=await response.json().catch(()=>({}));
      if(response.ok){store.proofRecent=store.proofRecent.filter(p=>p.id!==id);store.proofOlder.delete(id);syncProofHistory();if(result.summary&&result.summary.version===7){rpgSummarySync.invalidate();store.summary=result.summary;store.summaryError=false;}else void refreshRpgSummary();onData();return;}
      throw new Error(({EVENT_NOT_FOUND:'Запись уже удалена.',SERVER_NOT_CONFIGURED:'Сервер облачных изменений практики ещё не настроен.',SERVER_CONFIG_INVALID:'Сервер сохранения требует настройки Firebase Admin.',AUTH_REQUIRED:'Войди в аккаунт, чтобы изменить запись.',INVALID_AUTH:'Сеанс истёк. Войди в аккаунт ещё раз.'})[result.error]||'Не удалось удалить запись на сервере.');
    }else throw new Error('Облачное удаление недоступно. Войди в аккаунт и проверь подключение.');
    store.proofRecent=store.proofRecent.filter(p=>p.id!==id);store.proofOlder.delete(id);syncProofHistory();onData();
  }
  else{store.proofs=store.proofs.filter(p=>p.id!==id);lsSave();onData();}
};
store.updateProof=async function(id,patch){
  const next=Object.assign({},store.proofs.find(p=>p.id===id)||{},patch);delete next.id;
  if(store.mode==='db'){
    if(store.firebaseReady&&store.auth&&store.auth.currentUser){
      const token=await store.auth.currentUser.getIdToken(),response=await fetch('/api/rpg/practice/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({skill:next.skill,text:next.text,min:next.min,link:next.link})}),result=await response.json().catch(()=>({}));
      if(response.ok){Object.assign(next,result.entry||{});if(result.summary&&result.summary.version===7){rpgSummarySync.invalidate();store.summary=result.summary;store.summaryError=false;}else void refreshRpgSummary();}
      else throw new Error(({SKILL_LOCKED:'Этот навык закрыт или запись нарушает условия открытия.',SKILL_GRAPH_INVALID:'В зависимостях древа обнаружена ошибка. Исправь связи навыков и повтори.',QUEST_SKILL:'Квест закреплён за другим навыком — измени запись так, чтобы сохранить условие.',QUEST_MINUTES:'Нельзя сократить время ниже требования завершённого квеста.',QUEST_EVIDENCE:'Для этого квеста сохрани подтверждение ссылкой или изображением.',INVALID_PRACTICE:'Проверь описание, время и ссылку.',EVENT_NOT_FOUND:'Запись уже удалена.',SERVER_NOT_CONFIGURED:'Сервер облачных изменений практики ещё не настроен.',SERVER_CONFIG_INVALID:'Сервер сохранения требует настройки Firebase Admin.',AUTH_REQUIRED:'Войди в аккаунт, чтобы изменить запись.',INVALID_AUTH:'Сеанс истёк. Войди в аккаунт ещё раз.'})[result.error]||'Не удалось обновить запись на сервере.');
    }else throw new Error('Облачное редактирование недоступно. Войди в аккаунт и проверь подключение.');
    store.proofs=store.proofs.map(p=>p.id===id?Object.assign({id},next):p);store.proofRecent=store.proofRecent.map(p=>p.id===id?Object.assign({id},next):p);if(store.proofOlder.has(id))store.proofOlder.set(id,Object.assign({id},next));onData();
  }
  else{store.proofs=store.proofs.map(p=>p.id===id?Object.assign({id},next):p);lsSave();onData();}
};
store.saveProfile=async function(patch){
  const previous=store.profile||{},next=Object.assign({},previous,patch),treeFields=['customBranches','customLeaves','hiddenSkills','purgedSkills','skillEdits','pinnedBranches','recentBranchIds'];
  const treeChanged=treeFields.some(key=>JSON.stringify(previous[key]??(key==='skillEdits'?{}:[]))!==JSON.stringify(next[key]??(key==='skillEdits'?{}:[])));
  if(treeChanged&&!Object.hasOwn(patch,'treeArchive')){
    const oldTree={};treeFields.forEach(key=>oldTree[key]=previous[key]??(key==='skillEdits'?{}:[]));
    const treeArchive=(Array.isArray(previous.treeArchive)?previous.treeArchive:[]).concat([{id:'tree-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),createdAt:Date.now(),tree:oldTree}]).slice(-30);
    patch=Object.assign({},patch,{treeArchive});
  }
  const merged=Object.assign({},previous,patch);
  if(store.mode==='db'){
    const protectedFields=['achievementUnlocks','unlockedTitles','shareCount','friendCount','lastRpgEventAt','rpgRulesVersion','rpgSummaryUpdatedAt','rpgSummaryNeedsRebuild','questHistory','purgedQuestArchiveIds','quests'];
    if(Object.keys(patch).some(key=>protectedFields.includes(key)))throw new Error('Это поле профиля обновляется только сервером.');
    if(!store.base)throw new Error('Облачный профиль ещё не подключён.');
    await store.base.set(patch,{merge:true});
  }
  else{store.profile=merged;lsSave();onData();}
};
function cloudError(error){const code=error&&error.code||'';const message=({'auth/email-already-in-use':'Этот адрес уже зарегистрирован. Попробуй войти.','auth/invalid-email':'Проверь, правильно ли написан адрес электронной почты.','auth/weak-password':'Пароль должен содержать не менее 8 символов.','auth/invalid-credential':'Не получилось войти. Проверь адрес и пароль.','auth/user-not-found':'Аккаунт с таким адресом не найден.','auth/wrong-password':'Неверный адрес или пароль.','auth/missing-password':'Введи пароль.','auth/operation-not-allowed':'Вход по электронной почте пока не включён в Firebase Authentication.','auth/user-disabled':'Этот аккаунт временно отключён.','auth/too-many-requests':'Слишком много попыток. Подожди немного и попробуй снова.','auth/network-request-failed':'Нет соединения. Проверь интернет и попробуй снова.','auth/requires-recent-login':'Для этого действия войди в аккаунт ещё раз.','permission-denied':'Firebase отклонил доступ. Проверь опубликованные правила Firestore.','unavailable':'Облачная база временно недоступна.'})[code]||'Не удалось выполнить действие. Проверь данные и подключение.';return window.AiryUiLocale?.t(message)||message;}
function stopCloudListeners(){store.unsubs.forEach(fn=>{try{fn();}catch(e){}});store.unsubs=[];store.historyUnsub=null;}
function useCloudAccount(user){
  stopCloudListeners();rpgSummarySync.setScope(user?user.uid:'guest');store.accountUser=user||null;activateMikaScope(user?'user:'+user.uid:'guest');
  const label=$('#accountLabel');if(label)label.textContent=user?(user.displayName||user.email||'Аккаунт'):'Войти';
  if(!user){store.mode='local';store.deferHistory=false;store.base=null;store.col=null;lsLoad();onData();updateAccountDialog();return Promise.resolve();}
  store.profile={};store.summary=null;store.summaryError=false;store.proofs=[];
  store.mode='db';store.deferHistory=true;const db=firebase.firestore();store.base=db.doc('data/users/'+user.uid+'/profile');store.col=store.base.collection('proofs');
  updateAccountDialog();
  return new Promise(resolve=>{
    let loaded=0;const ready=()=>{if(++loaded===2){onData();resolve();}};let profileFirst=true,proofsFirst=true;
    store.unsubs.push(store.base.onSnapshot(snap=>{const previous=store.profile||{},next=snap.exists?Object.assign({},snap.data()):{},refreshSummary=!profileFirst&&rpgSummarySync.changed(previous,next);store.profile=next;if(!store.profile.name&&user.displayName){store.base.set({name:user.displayName},{merge:true}).catch(()=>{});}if(profileFirst){profileFirst=false;ready();}else onData();if(refreshSummary)void refreshRpgSummary(user);},err=>{if(profileFirst){profileFirst=false;ready();}$('#accountErrIn').textContent=cloudError(err);}));
    watchProofHistory(store.col,err=>$('#accountErrIn').textContent=cloudError(err),()=>{if(proofsFirst){proofsFirst=false;ready();}});
    void refreshRpgSummary(user);setTimeout(resolve,6000);
  });
}
async function initStore(){
  let db=null,user=null;
  try{
    if(typeof claude!=='undefined'&&claude&&claude.use){
      db=await claude.use('db');user=await claude.use('user');
      try{store.assets=await claude.use('assets');}catch(e){store.assets=null;}
      try{store.downloads=await claude.use('downloads');}catch(e){store.downloads=null;}
      try{store.sample=await claude.use('sample');}catch(e){store.sample=null;}
    }
  }catch(e){db=null;}
  let uid=null;if(db&&user){try{uid=await user.id();}catch(e){uid=null;}}
  if(db&&uid){store.mode='db';store.deferHistory=true;activateMikaScope('user:'+uid);store.base=db.doc('data/users/'+uid+'/profile');store.col=store.base.collection('proofs');await new Promise(resolve=>{let got=0;const one=()=>{if(++got===2)resolve();};let a=false,b=false;store.base.onSnapshot(s=>{store.profile=s.exists?Object.assign({},s.data()):{};if(!a){a=true;one();}else onData();},()=>{if(!a){a=true;one();}});watchProofHistory(store.col,()=>{},()=>{if(!b){b=true;one();}});setTimeout(resolve,6000);});return;}
  if(window.UPSKILL_FIREBASE_CONFIG&&window.firebase&&firebase.initializeApp&&firebase.auth&&firebase.firestore){
    try{if(!firebase.apps.length)firebase.initializeApp(window.UPSKILL_FIREBASE_CONFIG);store.auth=firebase.auth();store.firebaseReady=true;
      store.auth.languageCode='ru';
      try{await store.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(persistenceError){console.warn('Persistent sign-in is unavailable; trying session persistence',persistenceError);try{await store.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);}catch(sessionError){console.warn('Session persistence is unavailable; Firebase will use its current fallback',sessionError);}}
      await new Promise(resolve=>{let first=true;store.auth.onAuthStateChanged(async u=>{try{await useCloudAccount(u);}catch(e){console.error('Account data could not load',e);}if(first){first=false;resolve();}},()=>{if(first){first=false;resolve();}});setTimeout(resolve,6000);});
    }catch(error){console.error('Firebase is not configured correctly',error);store.firebaseReady=false;store.mode='local';activateMikaScope('guest');lsLoad();}
  }else{store.mode='local';activateMikaScope('guest');lsLoad();}
}
const PROFILE_AVATARS=['🌸','🌙','📚','🎧','🐈','✦'];
function profileAvatarGlyph(avatar,name){return PROFILE_AVATARS.includes(avatar)?avatar:(String(name||'U').trim().charAt(0).toLocaleUpperCase(uiLocaleTag())||'U');}
function updateAccountDialog(){
  const signed=!!store.accountUser;$('#accountSignedOut').hidden=signed;$('#accountSignedIn').hidden=!signed;
  const user=store.accountUser,name=signed?(store.profile.name||user.displayName||(user.email||'').split('@')[0]):'';
  $('#accountTitle').textContent=signed?'Ты в Airy':'Рада тебя видеть';
  $('#accountHelp').textContent=signed?'Твой прогресс в безопасности и синхронизируется.':'Войди, чтобы продолжить свой путь и синхронизировать прогресс.';
  $('#accountIdentity').textContent=signed?(user.email||'Вход выполнен'):'';
  $('#accountDisplayName').textContent=name||'Путешественник';$('#accountAvatar').textContent=profileAvatarGlyph(store.profile.avatar,name||'U');
  $('#accountStatus').textContent=signed?(user.emailVerified?'Почта подтверждена · синхронизация включена':'Синхронизация включена'):'Аккаунт подключён';
  $('#accountVerify').hidden=!signed||user.emailVerified;
  const configured=!!store.firebaseReady;
  ['accountLogin','accountSignup','accountReset','authLoginMode','authSignupMode'].forEach(id=>$('#'+id).disabled=!configured);
  if(!configured&&!signed){$('#accountHelp').textContent='Аккаунтный сервис пока недоступен. Прогресс сохранится в этом браузере.';}
  if(signed){$('#accountLabel').textContent=name||'Аккаунт';}
  $('#accountToggle').title=signed?'Аккаунт: '+name:'Войти или создать аккаунт';
}
let accountMode='login',accountReturnFocus=null;
function setAccountMode(mode){accountMode=mode==='signup'?'signup':'login';const signup=accountMode==='signup';$('#authLoginMode').classList.toggle('active',!signup);$('#authSignupMode').classList.toggle('active',signup);$('#authLoginMode').setAttribute('aria-selected',String(!signup));$('#authSignupMode').setAttribute('aria-selected',String(signup));$('#signupNameWrap').hidden=!signup;$('#passwordConfirmWrap').hidden=!signup;$('#accountLogin').hidden=signup;$('#accountSignup').hidden=!signup;$('#accountPassword').autocomplete=signup?'new-password':'current-password';$('#accountReset').hidden=signup;$('#accountTitle').textContent=signup?'Создадим твой профиль':'Рада тебя видеть';$('#accountHelp').textContent=signup?'Один аккаунт — и дневник будет с тобой на любом устройстве.':'Войди, чтобы продолжить свой путь и синхронизировать прогресс.';$('#accountErr').textContent='';}
const accountClose=()=>{$('#accountOverlay').hidden=true;$('#accountErr').textContent='';$('#accountErrIn').textContent='';if(accountReturnFocus&&accountReturnFocus.focus)accountReturnFocus.focus();};
$('#accountToggle').addEventListener('click',()=>{accountReturnFocus=document.activeElement;updateAccountDialog();setAccountMode('login');$('#accountOverlay').hidden=false;setTimeout(()=>$('#accountEmail').focus(),0);});
$('#accountClose').addEventListener('click',accountClose);$('#accountCloseTop').addEventListener('click',accountClose);$('#accountCloseIn').addEventListener('click',accountClose);
$('#accountOverlay').addEventListener('click',e=>{if(e.target.id==='accountOverlay')accountClose();});
document.addEventListener('keydown',e=>{if($('#accountOverlay').hidden)return;if(e.key==='Escape'){accountClose();return;}if(e.key==='Tab'){const focusables=$$('button:not([disabled]),input:not([disabled])',$('#accountOverlay')).filter(x=>!x.hidden&&x.offsetParent!==null);if(!focusables.length)return;const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
$('#authLoginMode').addEventListener('click',()=>setAccountMode('login'));$('#authSignupMode').addEventListener('click',()=>setAccountMode('signup'));
$('#passwordReveal').addEventListener('click',()=>{const input=$('#accountPassword'),show=input.type==='password';input.type=show?'text':'password';$('#passwordReveal').textContent=show?'Скрыть':'Показать';$('#passwordReveal').setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль');$('#passwordReveal').setAttribute('aria-pressed',String(show));});
async function accountAction(action){
  const email=$('#accountEmail').value.trim(),password=$('#accountPassword').value;
  const signup=action==='signup',name=$('#accountName').value.trim(),confirmPassword=$('#accountPasswordConfirm').value;
  const busyButton=signup?$('#accountSignup'):$('#accountLogin');$('#accountErr').textContent='';$('#accountErrIn').textContent='';if(!store.auth){updateAccountDialog();return;}
  if(!email||!/^\S+@\S+\.\S+$/.test(email)){ $('#accountErr').textContent='Введи корректный адрес электронной почты.';$('#accountEmail').focus();return; }
  if(action!=='reset'&&password.length<8){$('#accountErr').textContent='Пароль должен содержать не менее 8 символов.';$('#accountPassword').focus();return;}
  if(signup&&!name){$('#accountErr').textContent='Напиши, как к тебе обращаться.';$('#accountName').focus();return;}
  if(signup&&password!==confirmPassword){$('#accountErr').textContent='Пароли не совпадают. Проверь оба поля.';$('#accountPasswordConfirm').focus();return;}
  const actionButton=action==='reset'?$('#accountReset'):busyButton,oldText=actionButton?actionButton.innerHTML:'';if(actionButton){actionButton.disabled=true;actionButton.setAttribute('aria-busy','true');actionButton.textContent=signup?'Создаю профиль…':action==='reset'?'Отправляю письмо…':'Вхожу…';}
  ['accountReset','authLoginMode','authSignupMode'].forEach(id=>$('#'+id).disabled=true);
  try{
    if(signup){
      const credential=await store.auth.createUserWithEmailAndPassword(email,password),user=credential.user,nickname=name.slice(0,24);let profileWarning='';
      try{await user.updateProfile({displayName:nickname});}catch(profileError){profileWarning='Аккаунт создан, но имя не удалось обновить в Firebase Auth.';}
      try{await firebase.firestore().doc('data/users/'+user.uid+'/profile').set({name:nickname,createdAt:Date.now(),updatedAt:Date.now()},{merge:true});}
      catch(saveError){profileWarning='Аккаунт создан, но ник не удалось записать в Firestore: '+cloudError(saveError);}
      try{await user.sendEmailVerification();}catch(verifyError){console.warn('Verification email could not be sent',verifyError);}
      $('#accountPassword').value='';$('#accountPasswordConfirm').value='';accountClose();updateAccountDialog();if(profileWarning)$('#accountErrIn').textContent=profileWarning;toast('Аккаунт готов, '+nickname+'!');
    }else if(action==='login'){
      await store.auth.signInWithEmailAndPassword(email,password);$('#accountPassword').value='';accountClose();toast('С возвращением!');
    }else{
      await store.auth.sendPasswordResetEmail(email);toast('Ссылка для сброса пароля отправлена на '+email+'.');
    }
  }catch(error){$('#accountErr').textContent=cloudError(error);}
  finally{if(actionButton){actionButton.disabled=!store.firebaseReady;actionButton.removeAttribute('aria-busy');if(oldText)actionButton.innerHTML=oldText;}if(busyButton&&busyButton!==actionButton)busyButton.disabled=!store.firebaseReady;$('#accountReset').disabled=!store.firebaseReady;$('#authLoginMode').disabled=!store.firebaseReady;$('#authSignupMode').disabled=!store.firebaseReady;}
}
$('#accountLogin').addEventListener('click',()=>accountAction('login'));$('#accountSignup').addEventListener('click',()=>accountAction('signup'));$('#accountReset').addEventListener('click',()=>accountAction('reset'));
['accountEmail','accountPassword','accountName','accountPasswordConfirm'].forEach(id=>$('#'+id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();accountAction(accountMode==='signup'?'signup':'login');}}));
$('#accountVerify').addEventListener('click',async()=>{const user=store.auth&&store.auth.currentUser;if(!user)return;const b=$('#accountVerify');b.disabled=true;try{await user.sendEmailVerification();$('#accountStatus').textContent='Письмо отправлено · проверь входящие и папку «Спам»';toast('Письмо для подтверждения отправлено.');}catch(e){$('#accountErrIn').textContent=cloudError(e);}finally{b.disabled=false;}});
$('#accountLogout').addEventListener('click',async()=>{try{await store.auth.signOut();accountClose();toast('Ты вышел из аккаунта. Локальные данные остались на устройстве.');}catch(e){$('#accountErrIn').textContent=cloudError(e);}});
$('#accountImport').addEventListener('click',async()=>{
  const err=$('#accountErrIn');err.textContent='';if(!store.accountUser)return;
  let local;try{local=JSON.parse(localStorage.getItem(LS_KEY)||'null');}catch(e){local=null;}
  if(!local||(!(local.proofs||[]).length&&!Object.keys(local.profile||{}).length)){err.textContent='В этом браузере нет локальных данных для переноса.';return;}
  const accountHasProgress=Object.keys(store.profile||{}).some(key=>!['name','createdAt','updatedAt'].includes(key));
  if(store.proofs.length||accountHasProgress){err.textContent='В аккаунте уже есть прогресс. Чтобы избежать перезаписи, перенос доступен только в новый пустой аккаунт.';return;}
  if(!confirm('Перенести локальный профиль и '+(local.proofs||[]).length+' записей в аккаунт?'))return;
  try{
      const blocked=new Set(['achievementUnlocks','unlockedTitles','shareCount','friendCount','lastRpgEventAt','rpgRulesVersion','rpgSummaryUpdatedAt','rpgSummaryNeedsRebuild','questHistory','purgedQuestArchiveIds','quests']);
    const safeProfile=Object.fromEntries(Object.entries(local.profile||{}).filter(([key])=>!blocked.has(key)));
    if(Object.keys(safeProfile).length)await store.base.set(Object.assign({},safeProfile,{name:store.profile.name||safeProfile.name||''}),{merge:true});
    const legacyPersonal=(Array.isArray(local.profile?.quests)?local.profile.quests:[]).filter(q=>q&&q.period!=='daily'&&q.period!=='weekly'&&q.done!==true&&typeof q.skill==='string'&&typeof q.title==='string');
    if(legacyPersonal.length){await mutateQuests('sync',{offset:new Date().getTimezoneOffset()*-1});for(let index=0;index<legacyPersonal.length;index+=5)await mutateQuests('add',{quests:legacyPersonal.slice(index,index+5)});}
    const items=(local.proofs||[]).slice().sort((a,b)=>(Number(a.ts)||0)-(Number(b.ts)||0));let imported=0;
    for(let index=0;index<items.length;index++){
      const proof=items[index],legacyId=String(proof.id||proof.ts||index).replace(/[^\w-]/g,'-').slice(0,70),eventId=typeof proof.eventId==='string'&&/^[\w-]{8,100}$/.test(proof.eventId)?proof.eventId:'import-'+legacyId+'-'+index;
      const token=await store.auth.currentUser.getIdToken(),response=await fetch('/api/rpg/practice',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({eventId,skill:proof.skill,text:proof.text||proof.title||'Импортированная практика',min:Math.max(5,Math.min(600,Number(proof.min)||5)),link:proof.link||'',imgs:Array.isArray(proof.imgs)?proof.imgs:[],utcOffsetMinutes:Number.isFinite(Number(proof.utcOffsetMinutes))?Number(proof.utcOffsetMinutes):-new Date().getTimezoneOffset()})}),result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error((result.error||'IMPORT_FAILED')+` · перенесено записей: ${imported}`);imported++;
    }
    toast('Перенесено записей: '+imported+'. XP и награды пересчитаны сервером.');
  }
  catch(error){const message=error&&error.message||'';err.textContent=message.includes('SERVER_NOT_CONFIGURED')?'Импорт приостановлен: сначала настрой FIREBASE_SERVICE_ACCOUNT_JSON на сервере. '+message:message.includes(' · перенесено записей:')?'Перенос остановился с ошибкой. '+message:cloudError(error);}
});

/* ---------- UI state ---------- */
let S=null,activeTab='novel',jFilter='all',jSkillFilter='all',jDateFrom='',jDateTo='',jVisibleLimit=JOURNAL_PAGE_SIZE,journalCompareDays=7;
const ARCHIVE_PAGE_SIZE=40;
let skillArchiveLimit=ARCHIVE_PAGE_SIZE,questArchiveLimit=ARCHIVE_PAGE_SIZE;
let taskCalendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),taskCalendarSelected=dayKey(Date.now()),treeFavoritesOnly=false;
let launchMikaChat=()=>{};
function toast(msg,tone){const t=$('#toast'),text=String(msg||''),kind=tone||(/не удалось|не получилось|ошиб|нельзя|проверь|заполнена/i.test(text)?'error':/сохран|готов|добав|обнов|удал|отправлен|получен|практик|вышел/i.test(text)?'success':'info'),copy=t.querySelector('.toast-copy');t.dataset.tone=kind;t.querySelector('.toast-mark').textContent=kind==='error'?'!':kind==='success'?'✓':'✦';copy.querySelector('b').textContent=kind==='error'?'Проверь':kind==='success'?'Готово':'Обрати внимание';copy.querySelector('span').textContent=text;t.hidden=false;if(kind==='error')playUiSound('error');else if(kind==='success'){const value=text.toLocaleLowerCase();playUiSound(/квест|quest/.test(value)?'quest':/практик|progress logged/.test(value)?'practice':/достижен|награда|achievement|reward/.test(value)?'award':/уровень|level/.test(value)?'level':'success');}clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true;},4200);}
function saveState(state,label){const el=$('#saveState');if(!el)return;clearTimeout(saveState.timer);el.hidden=!state;el.dataset.state=state||'';el.textContent=label||'';if(state==='saved')saveState.timer=setTimeout(()=>{el.hidden=true;},2600);}
const MUSIC_TRACKS=['audio/sunlight-on-the-desk.mp3','audio/sunlight-on-the-desk-2.mp3'];
const MUSIC_FADE_SECONDS=5;
const music={context:null,master:null,players:[],active:0,enabled:false,ready:false,loading:false,transitioning:false,started:false,fadeTimer:null,stopTimer:null,volume:.24};
const sfx={context:null,enabled:false,volume:.28};
function playUiSound(kind='success'){
  if(!sfx.enabled||sfx.volume<=0)return;
  try{
    const AudioContextType=window.AudioContext||window.webkitAudioContext;if(!AudioContextType)return;
    if(!sfx.context)sfx.context=new AudioContextType({latencyHint:'interactive'});
    const context=sfx.context;if(context.state==='suspended')context.resume().catch(()=>{});
    const patterns={
      preview:{notes:[{hz:740,at:0,duration:.095,shape:'sine'},{hz:988,at:.06,duration:.12,shape:'sine'}],peak:.62},
      navigation:{notes:[{hz:587,at:0,duration:.075,shape:'triangle'},{hz:784,at:.045,duration:.09,shape:'sine'}],peak:.42},
      success:{notes:[{hz:659,at:0,duration:.13,shape:'sine'},{hz:831,at:.055,duration:.17,shape:'sine'},{hz:988,at:.12,duration:.2,shape:'sine'}],peak:.68},
      practice:{notes:[{hz:523,at:0,duration:.1,shape:'triangle',slide:466},{hz:698,at:.075,duration:.15,shape:'sine'}],peak:.64},
      quest:{notes:[{hz:392,at:0,duration:.1,shape:'triangle',slide:330},{hz:587,at:.075,duration:.14,shape:'triangle'},{hz:784,at:.14,duration:.18,shape:'sine'}],peak:.58},
      error:{notes:[{hz:392,at:0,duration:.13,shape:'triangle',slide:349},{hz:294,at:.09,duration:.18,shape:'triangle',slide:247}],peak:.4},
      level:{notes:[{hz:523,at:0,duration:.17,shape:'triangle'},{hz:659,at:.065,duration:.18,shape:'sine'},{hz:784,at:.13,duration:.2,shape:'sine'},{hz:1047,at:.205,duration:.3,shape:'sine'}],peak:.72},
      award:{notes:[{hz:784,at:0,duration:.17,shape:'sine'},{hz:988,at:.07,duration:.19,shape:'sine'},{hz:1175,at:.14,duration:.22,shape:'sine'},{hz:1568,at:.23,duration:.28,shape:'sine'}],peak:.62}
    };
    const pattern=patterns[kind]||patterns.success,now=context.currentTime,peak=Math.min(.2,sfx.volume*.32)*pattern.peak;
    pattern.notes.forEach(({hz,at,duration,shape='sine',slide},index)=>{
      const start=now+at,oscillator=context.createOscillator(),gain=context.createGain(),notePeak=peak*(index===0?1:.78);
      oscillator.type=shape;oscillator.frequency.setValueAtTime(hz,start);if(slide)oscillator.frequency.exponentialRampToValueAtTime(slide,start+duration*.72);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,notePeak),start+.014);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+duration+.02);
      // A quiet octave partial gives the short tones a bell-like edge without
      // adding samples or noticeably increasing CPU use.
      const overtone=context.createOscillator(),overtoneGain=context.createGain();overtone.type='sine';overtone.frequency.setValueAtTime(hz*2.01,start);
      overtoneGain.gain.setValueAtTime(.0001,start);overtoneGain.gain.exponentialRampToValueAtTime(Math.max(.0001,notePeak*.11),start+.018);overtoneGain.gain.exponentialRampToValueAtTime(.0001,start+duration*.72);
      overtone.connect(overtoneGain);overtoneGain.connect(context.destination);overtone.start(start);overtone.stop(start+duration*.72+.02);
    });
  }catch{/* Sound is optional; unsupported audio must never block an app action. */}
}
function updateMusicButton(loading=false){const b=$('#musicToggle');if(!b)return;b.disabled=loading;b.setAttribute('aria-busy',String(loading));b.setAttribute('aria-pressed',String(music.enabled));b.setAttribute('aria-label',loading?'Загружаю музыку…':music.enabled?'Выключить музыку':'Включить музыку');b.title=b.getAttribute('aria-label');b.classList.toggle('is-playing',music.enabled);}
function waitForAudio(audio,load=true){if(audio.readyState>=2)return Promise.resolve();return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);audio.removeEventListener('canplay',ready);audio.removeEventListener('error',failed);};const ready=()=>{clean();resolve();};const failed=()=>{clean();reject(new Error('Не удалось загрузить аудиофайл.'));};audio.addEventListener('canplay',ready,{once:true});audio.addEventListener('error',failed,{once:true});timer=setTimeout(()=>{clean();reject(new Error('Музыка загружается слишком долго. Проверь подключение и повтори.'));},30000);if(load)audio.load();});}
function ensureMusicTrack(player){if(player.audio.readyState>=2)return Promise.resolve();if(player.warmPromise)return player.warmPromise;player.audio.preload='auto';player.warmPromise=waitForAudio(player.audio,true).finally(()=>{if(player.audio.readyState<2)player.warmPromise=null;});return player.warmPromise;}
function warmMusicTrack(index){const player=music.players[index];if(player&&player.audio.readyState<2)ensureMusicTrack(player).catch(()=>{});}
function crossfadeMusic(fromIndex){if(!music.enabled||music.transitioning||!music.ready)return;const from=music.players[fromIndex],toIndex=(fromIndex+1)%music.players.length,to=music.players[toIndex];if(!from||!to)return;music.transitioning=true;ensureMusicTrack(to).then(()=>{to.audio.currentTime=0;return to.audio.play();}).then(()=>{if(!music.enabled){to.audio.pause();music.transitioning=false;return;}const now=music.context.currentTime,fade=MUSIC_FADE_SECONDS;from.gain.gain.cancelScheduledValues(now);from.gain.gain.setValueAtTime(from.gain.gain.value,now);from.gain.gain.linearRampToValueAtTime(0,now+fade);to.gain.gain.cancelScheduledValues(now);to.gain.gain.setValueAtTime(0,now);to.gain.gain.linearRampToValueAtTime(1,now+fade);clearTimeout(music.fadeTimer);music.fadeTimer=setTimeout(()=>{from.audio.pause();from.audio.currentTime=0;from.gain.gain.value=0;to.gain.gain.value=1;music.active=toIndex;music.transitioning=false;},fade*1000+80);}).catch(()=>{music.transitioning=false;});}
function createMusicGraph(){const AudioContextType=window.AudioContext||window.webkitAudioContext;if(!AudioContextType)throw new Error('Этот браузер не поддерживает фоновую музыку.');music.context=new AudioContextType({latencyHint:'playback'});music.master=music.context.createGain();music.master.gain.value=0;music.master.connect(music.context.destination);music.players=MUSIC_TRACKS.map((src,index)=>{const audio=new Audio(src),source=music.context.createMediaElementSource(audio),gain=music.context.createGain();audio.preload='none';gain.gain.value=0;source.connect(gain);gain.connect(music.master);audio.addEventListener('timeupdate',()=>{if(music.enabled&&music.ready&&music.active===index&&Number.isFinite(audio.duration)&&audio.duration-audio.currentTime<=90)warmMusicTrack((index+1)%music.players.length);if(music.enabled&&music.ready&&music.active===index&&!music.transitioning&&Number.isFinite(audio.duration)&&audio.duration-audio.currentTime<=MUSIC_FADE_SECONDS)crossfadeMusic(index);});audio.addEventListener('ended',()=>{if(music.enabled&&music.ready&&music.active===index&&!music.transitioning)crossfadeMusic(index);});return{audio,source,gain,warmPromise:null};});}
async function toggleMusic(){if(music.loading)return;if(music.enabled){music.enabled=false;const now=music.context.currentTime;music.master.gain.cancelScheduledValues(now);music.master.gain.setValueAtTime(music.master.gain.value,now);music.master.gain.linearRampToValueAtTime(0,now+.65);clearTimeout(music.stopTimer);music.stopTimer=setTimeout(()=>music.players.forEach(player=>player.audio.pause()),720);updateMusicButton();updateSettingsMusicButton();return;}clearTimeout(music.stopTimer);music.loading=true;updateMusicButton(true);try{if(!music.context)createMusicGraph();const resume=music.context.resume();if(!music.started){music.players[0].gain.gain.value=1;const firstPlay=music.players[0].audio.play();firstPlay.catch(()=>{});await waitForAudio(music.players[0].audio,false);await firstPlay;music.ready=true;music.started=true;music.active=0;}else if(music.players[music.active].audio.paused){await music.players[music.active].audio.play();}await resume;music.enabled=true;const now=music.context.currentTime;music.master.gain.cancelScheduledValues(now);music.master.gain.setValueAtTime(music.master.gain.value,now);music.master.gain.linearRampToValueAtTime(music.volume,now+1.2);updateMusicButton();updateSettingsMusicButton();}catch(error){music.enabled=false;music.loading=false;updateMusicButton();updateSettingsMusicButton();music.players.forEach(p=>{p.audio.pause();p.source.disconnect();p.gain.disconnect();});if(music.context)music.context.close().catch(()=>{});music.context=null;music.master=null;music.players=[];music.ready=false;music.started=false;toast(error instanceof Error?error.message:'Не удалось включить музыку. Попробуй ещё раз.');return;}music.loading=false;updateMusicButton();updateSettingsMusicButton();}
$('#musicToggle').addEventListener('click',toggleMusic);
function updateSettingsMusicButton(){const button=$('#settingsMusicToggle');if(!button)return;button.disabled=music.loading;button.setAttribute('aria-pressed',String(music.enabled));button.textContent=music.loading?'Подключаю…':music.enabled?'Выключить музыку':'Включить музыку';}
function updateServerRuntimeStatus(){const status=$('#serverRuntimeStatus');if(!status)return;const t=window.AiryUiLocale?.t||((value)=>value),features=window.UPSKILL_SERVER_FEATURES;if(!features){status.textContent=t('Не удалось проверить облачные функции. Проверь соединение и обнови страницу.');status.dataset.state='unknown';return;}const invalidHints={'invalid-json':'FIREBASE_SERVICE_ACCOUNT_JSON должен содержать полный корректный JSON.','missing-fields':'В JSON service account должны быть поля project_id, client_email и private_key.','invalid-email':'Поле client_email в service account должно содержать адрес сервисного аккаунта.','invalid-private-key':'Поле private_key должно содержать полный PEM-блок BEGIN PRIVATE KEY и END PRIVATE KEY.','project-mismatch':'project_id в service account должен совпадать с NEXT_PUBLIC_FIREBASE_PROJECT_ID.'};if(invalidHints[features.rpgStatus]){status.textContent='⚠ '+t(invalidHints[features.rpgStatus]);status.dataset.state='invalid';return;}const hints=[];if(features.rpgStatus==='missing'||!features.rpg)hints.push(t('Чтобы включить серверное сохранение RPG, добавь FIREBASE_SERVICE_ACCOUNT_JSON как secret в Vercel Production и выполни redeploy.'));if(!features.ai)hints.push(t('Чтобы включить ответы Мики, добавь GEMINI_API_KEY как secret в Vercel Production и выполни redeploy.'));status.textContent=hints.length?'⚠ '+hints.join(' '):'✓ '+t('Ключи Firebase Admin и AI найдены на сервере. Доступ к Firestore проверяется при серверной записи.');status.dataset.state=hints.length?'warning':'configured';}
function profilePreferences(){return Object.assign({reducedMotion:SYSTEM_REDUCED,musicVolume:24,effectsVolume:28,effectsEnabled:false,theme:document.body.dataset.themeMode||'night',uiLanguage:'ru',shareProgressWithMika:true,mikaLanguage:'auto',achievementNotifications:false},(store.profile&&store.profile.preferences)||{});}
function applyMotionPreference(value){REDUCED=value==='reduced';document.body.dataset.motion=REDUCED?'reduced':'full';if(REDUCED)petals.stop();else if(activeTab==='novel')petals.start();}
const persistPreference=AiryPreferenceWriter.createPreferenceWriter({getCurrent:profilePreferences,getScope:()=>store.mode+':'+(store.auth?.currentUser?.uid||store.accountUser?.uid||'guest'),save:preferences=>store.saveProfile({preferences}),onSaved:preferences=>{store.profile=Object.assign({},store.profile,{preferences});}});
async function changeThemePreference(value){const mode=value==='day'?'day':'night',previous=profilePreferences().theme==='day'?'day':'night',select=$('#themeSetting'),button=$('#themeToggle');if(select)select.disabled=true;if(button)button.disabled=true;try{await AiryPreferenceWriter.applyPreferenceChange({previous,value:mode,apply:next=>{applyStageTheme(next);if(select)select.value=next;},persist:next=>persistPreference('theme',next)});}catch{toast('Не удалось сохранить тему. Возвращено последнее сохранённое значение.','error');}finally{if(select)select.disabled=false;if(button)button.disabled=false;}}
$('#themeSetting').addEventListener('change',e=>changeThemePreference(e.target.value));
$('#uiLanguage').addEventListener('change',async e=>{const input=e.target,previous=AiryUiLocale.normalize(profilePreferences().uiLanguage),value=AiryUiLocale.normalize(input.value);AiryUiLocale.apply(value);renderAll();renderHud();updateServerRuntimeStatus();input.disabled=true;try{await persistPreference('uiLanguage',value);toast(value==='en'?'Interface language saved.':value==='kk'?'Интерфейс тілі сақталды.':'Язык интерфейса сохранён.');}catch{input.value=previous;AiryUiLocale.apply(previous);renderAll();renderHud();updateServerRuntimeStatus();toast(value==='en'?'Could not save the interface language.':value==='kk'?'Интерфейс тілін сақтау мүмкін болмады.':'Не удалось сохранить язык интерфейса.','error');}finally{input.disabled=false;}});
$('#motionSetting').addEventListener('change',async e=>{const input=e.target,previous=profilePreferences().reducedMotion?'reduced':'full',value=input.value;input.disabled=true;try{await AiryPreferenceWriter.applyPreferenceChange({previous,value,apply:next=>{input.value=next;applyMotionPreference(next);},persist:next=>persistPreference('reducedMotion',next==='reduced')});toast('Настройка анимаций сохранена.');}catch{toast('Не удалось сохранить настройку анимаций. Возвращено последнее сохранённое значение.','error');}finally{input.disabled=false;}});
$('#musicVolume').addEventListener('input',e=>{const value=Math.max(0,Math.min(100,Number(e.target.value)||0));music.volume=value/100*.24;$('#musicVolumeValue').value=value+'%';$('#musicVolumeValue').textContent=value+'%';if(music.context&&music.master){const now=music.context.currentTime;music.master.gain.cancelScheduledValues(now);music.master.gain.setTargetAtTime(music.enabled?music.volume:0,now,.08);}});
$('#musicVolume').addEventListener('change',async e=>{const input=e.target,previous=Math.max(0,Math.min(100,Number(profilePreferences().musicVolume)||0)),value=Math.max(0,Math.min(100,Number(input.value)||0)),apply=next=>{input.value=String(next);$('#musicVolumeValue').value=next+'%';$('#musicVolumeValue').textContent=next+'%';music.volume=next/100*.24;if(music.context&&music.master){const now=music.context.currentTime;music.master.gain.cancelScheduledValues(now);music.master.gain.setTargetAtTime(music.enabled?music.volume:0,now,.08);}};input.disabled=true;try{await AiryPreferenceWriter.applyPreferenceChange({previous,value,apply,persist:next=>persistPreference('musicVolume',next)});toast('Громкость сохранена.');}catch{toast('Не удалось сохранить громкость. Возвращено последнее сохранённое значение.','error');}finally{input.disabled=false;}});
$('#effectsEnabled').addEventListener('change',async e=>{const input=e.target,previous=profilePreferences().effectsEnabled===true,value=input.checked,oldEnabled=sfx.enabled;sfx.enabled=value;sfx.volume=Math.max(0,Math.min(100,Number($('#effectsVolume').value)||0))/100;if(value)playUiSound('preview');input.disabled=true;try{await persistPreference('effectsEnabled',value);$('#effectsVolume').disabled=!value;toast(value?'Звуковые эффекты включены.':'Звуковые эффекты выключены.','info');}catch{input.checked=previous;sfx.enabled=oldEnabled;$('#effectsVolume').disabled=!oldEnabled;toast('Не удалось сохранить настройку звуковых эффектов.','error');}finally{input.disabled=false;}});
$('#effectsVolume').addEventListener('input',e=>{const value=Math.max(0,Math.min(100,Number(e.target.value)||0));sfx.volume=value/100;$('#effectsVolumeValue').value=value+'%';$('#effectsVolumeValue').textContent=value+'%';});
$('#effectsVolume').addEventListener('change',async e=>{const input=e.target,previous=Math.max(0,Math.min(100,Number(profilePreferences().effectsVolume)||0)),value=Math.max(0,Math.min(100,Number(input.value)||0)),apply=next=>{input.value=String(next);$('#effectsVolumeValue').value=next+'%';$('#effectsVolumeValue').textContent=next+'%';sfx.volume=next/100;};input.disabled=true;try{await AiryPreferenceWriter.applyPreferenceChange({previous,value,apply,persist:next=>persistPreference('effectsVolume',next)});if(sfx.enabled)playUiSound('preview');}catch{toast('Не удалось сохранить громкость эффектов. Возвращено последнее сохранённое значение.','error');}finally{input.disabled=!sfx.enabled;}});
$('#settingsMusicToggle').addEventListener('click',toggleMusic);
function syncAchievementNotificationControl(){const input=$('#achievementNotifications'),status=$('#notificationSettingsStatus');if(!input||!status)return;const supported='Notification'in window,allowed=supported&&Notification.permission==='granted';input.disabled=!supported||(!allowed&&Notification.permission==='denied');input.checked=profilePreferences().achievementNotifications===true&&allowed;status.textContent=!supported?'Этот браузер не поддерживает системные уведомления.':Notification.permission==='denied'?'Уведомления запрещены в настройках браузера.':allowed?'Разрешение браузера включено. Уведомления приходят только пока сайт открыт.':'При включении браузер спросит разрешение.';}
$('#achievementNotifications').addEventListener('change',async e=>{const input=e.target,status=$('#notificationSettingsStatus'),previous=profilePreferences().achievementNotifications===true;input.disabled=true;try{if(input.checked){if(!('Notification'in window))throw new Error('Браузер не поддерживает уведомления.');const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;if(permission!=='granted')throw new Error(permission==='denied'?'Разреши уведомления для сайта в настройках браузера.':'Разрешение на уведомления не выдано.');}await persistPreference('achievementNotifications',input.checked);status.textContent=input.checked?'Системные уведомления о новых достижениях включены.':'Системные уведомления выключены.';toast(input.checked?'Уведомления о достижениях включены.':'Уведомления выключены.');}catch(error){input.checked=previous;status.textContent=error.message||'Не удалось сохранить настройку.';toast(status.textContent,'error');}finally{syncAchievementNotificationControl();}});
function notifyNewAchievements(after,before){if(!profilePreferences().achievementNotifications||!('Notification'in window)||Notification.permission!=='granted')return;const tr=window.AiryUiLocale?.t||((value)=>value),old=new Set(before.ach||[]),fresh=allAchievementDefinitions().filter(award=>(after.ach||[]).includes(award.id)&&!old.has(award.id));fresh.slice(0,3).forEach(award=>{try{new Notification(tr('Новое достижение · '+award.n),{body:tr(award.d),icon:'/icons/airy-192.png',tag:'airy-achievement-'+award.id});}catch{}});}
async function saveMikaSetting(key,value){const input=key==='shareProgressWithMika'?$('#mikaProgressContext'):$('#mikaLanguage'),status=$('#mikaSettingsStatus'),previous=profilePreferences()[key];input.disabled=true;status.textContent='Сохраняю…';try{await persistPreference(key,value);status.textContent='Настройка сохранена в профиле.';toast('Настройка Мики сохранена.');}catch{if(key==='shareProgressWithMika')input.checked=previous!==false;else input.value=['auto','ru','en','kk'].includes(previous)?previous:'auto';status.textContent='Не удалось синхронизировать настройку с аккаунтом.';toast('Настройка не сохранена.','error');}finally{input.disabled=false;}}
$('#mikaProgressContext').addEventListener('change',e=>saveMikaSetting('shareProgressWithMika',e.target.checked));
$('#mikaLanguage').addEventListener('change',e=>saveMikaSetting('mikaLanguage',e.target.value));
async function ensureCompleteProofHistory(onProgress){
  if(store.mode!=='db')return;
  while(!store.historyComplete){
    if(store.historyError)throw new Error('HISTORY_LOAD_FAILED');
    if(store.historyLoading){await new Promise(resolve=>{const timer=setInterval(()=>{if(!store.historyLoading||store.historyError||store.historyComplete){clearInterval(timer);resolve();}},80);});continue;}
    if(!store.col||!store.historyCursor)throw new Error('HISTORY_CURSOR_MISSING');
    await loadOlderProofPages(store.col,store.historyCursor,store.historyGeneration);
    if(typeof onProgress==='function')onProgress(store.proofs.length,store.historyComplete);
  }
  if(store.historyError)throw new Error('HISTORY_LOAD_FAILED');
}
async function downloadUserData(onProgress){
  await ensureCompleteProofHistory(onProgress);
  const user=store.auth&&store.auth.currentUser,limitations=[];let friends=[];
  if(user){
    if(user.emailVerified){
      const token=await user.getIdToken(),response=await fetch('/api/rpg/friends',{headers:{Authorization:'Bearer '+token},cache:'no-store'}),result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error('FRIENDS_EXPORT_FAILED');
      friends=Array.isArray(result.friends)?result.friends:[];
      if(result.truncated)limitations.push('Показаны первые 50 связей; на сервере список может быть длиннее.');
    }else limitations.push('Список друзей не включён: сначала подтверди адрес электронной почты.');
  }
  const payload=AiryUserDataExport.create({version:3,exportedAt:new Date().toISOString(),account:user?{uid:user.uid,email:user.email||''}:null,profile:store.profile,proofs:store.proofs,friends,mikaConversation:mikaHistory,limitations});
  const data=JSON.stringify(payload,null,2),filename='upskill-'+dayKey(Date.now())+'.json';
  if(store.downloads)await store.downloads.save({filename,data});
  else{const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return {proofs:store.proofs.length,friends:friends.length};
}
$('#settingsExport').addEventListener('click',async()=>{const button=$('#settingsExport'),status=$('#settingsDataStatus'),original=button.textContent;button.disabled=true;status.textContent=store.mode==='db'&&!store.historyComplete?'Подгружаю старые записи дневника…':'';try{const result=await downloadUserData(count=>{status.textContent='Загружено '+num(count)+' записей дневника…';});status.textContent='Экспортированы профиль, '+num(result.proofs)+' записей, '+num(result.friends)+' друзей и переписка Мики.';toast('Копия данных сохранена.');}catch(error){status.textContent=error&&error.message==='HISTORY_LOAD_FAILED'?'Не удалось загрузить весь дневник. Проверь соединение и повтори экспорт.':error&&error.message==='FRIENDS_EXPORT_FAILED'?'Не удалось загрузить список друзей для полного экспорта. Обнови экран «Друзья» и повтори.':'Не удалось подготовить файл. Проверь доступ к загрузкам.';}finally{button.disabled=false;button.textContent=original;}});
$('#openArchiveFromSettings').addEventListener('click',()=>{closeSettings();show('archive');});
function syncSecuritySettings(){const user=store.auth&&store.auth.currentUser,identity=$('#securityIdentity'),verify=$('#securityVerify'),reset=$('#securityPasswordReset');if(!identity||!verify||!reset)return;if(!user){identity.textContent='Войди в аккаунт, чтобы управлять почтой и паролем.';verify.hidden=true;reset.hidden=true;return;}identity.textContent=(user.email||'Аккаунт')+' · '+(user.emailVerified?'почта подтверждена':'почта не подтверждена');verify.hidden=!!user.emailVerified;reset.hidden=!user.email;}
function syncSettingsControls(){const prefs=profilePreferences(),motion=prefs.reducedMotion?'reduced':'full',volume=Math.max(0,Math.min(100,Number(prefs.musicVolume)||0)),effectsVolume=Math.max(0,Math.min(100,Number(prefs.effectsVolume)||0)),uiLanguage=AiryUiLocale.normalize(prefs.uiLanguage);$('#uiLanguage').value=uiLanguage;AiryUiLocale.apply(uiLanguage);$('#themeSetting').value=prefs.theme==='day'?'day':'night';if(document.body.dataset.themeMode!==$('#themeSetting').value)applyStageTheme($('#themeSetting').value,false);$('#motionSetting').value=motion;$('#effectsEnabled').checked=prefs.effectsEnabled===true;sfx.enabled=prefs.effectsEnabled===true;$('#effectsVolume').value=String(effectsVolume);$('#effectsVolumeValue').value=effectsVolume+'%';$('#effectsVolumeValue').textContent=effectsVolume+'%';$('#effectsVolume').disabled=!sfx.enabled;sfx.volume=effectsVolume/100;$('#musicVolume').value=String(volume);$('#musicVolumeValue').value=volume+'%';$('#musicVolumeValue').textContent=volume+'%';$('#mikaProgressContext').checked=prefs.shareProgressWithMika!==false;$('#mikaLanguage').value=['auto','ru','en','kk'].includes(prefs.mikaLanguage)?prefs.mikaLanguage:'auto';music.volume=volume/100*.24;applyMotionPreference(motion);updateSettingsMusicButton();syncAchievementNotificationControl();syncSecuritySettings();}
const previousRenderSettings=renderAll;
renderAll=function(){previousRenderSettings();syncSettingsControls();};
let achievementLedgerWrite=false;
async function recordAchievementUnlocks(after,before){
  if(achievementLedgerWrite)return;
  if(store.mode==='db')return; // Cloud awards are derived and written by authenticated server routes.
  const oldIds=new Set(before.ach),ledger=Object.assign({},(store.profile&&store.profile.achievementUnlocks)||{});
  const fresh=ACH.filter(award=>after.ach.includes(award.id)&&!oldIds.has(award.id)&&!ledger[award.id]);
  if(!fresh.length)return;
  fresh.forEach(award=>{ledger[award.id]={at:Date.now(),rarity:award.rarity,reward:award.reward,achievement:{id:award.id,n:award.n,d:award.d,category:award.category,g:award.g,metric:award.metric,target:award.target,unit:award.unit,unitForms:award.unitForms,secret:award.secret}};});
  const titles=Array.from(new Set([...(store.profile&&store.profile.unlockedTitles||[]),...fresh.map(award=>award.reward.title)]));
  achievementLedgerWrite=true;
  try{
    const patch={achievementUnlocks:ledger,unlockedTitles:titles};
    await store.saveProfile(patch);
    store.profile=Object.assign({},store.profile,patch);renderAwards();renderProfile();
  }finally{achievementLedgerWrite=false;}
}
let questBoardUpdating=false;
let questSyncMarker='';
async function mutateQuests(action,payload={}){
  if(store.mode==='db'){
    if(!store.auth?.currentUser)throw new Error('Войди в аккаунт, чтобы синхронизировать квесты.');
    const user=store.auth.currentUser,token=await user.getIdToken(),requestBody={action,...payload};let intent=null,intentKey='';
    if(action==='add'){
      const fingerprint=AiryQuestIdempotency.fingerprint({userId:user.uid,quests:payload.quests}),storageKey='airy:pending-quest-add:v1:'+encodeURIComponent(fingerprint);
      intentKey=storageKey;intent=AiryQuestIdempotency.getOrCreateIntent(practiceStorage(),intentKey,fingerprint,newEventId);requestBody.requestId=intent.requestId;
    }
    const response=await fetch('/api/rpg/quests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(requestBody)}),result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(({QUEST_LIMIT:'Доска заполнена. Убери или заверши несколько активных квестов.',QUEST_ARCHIVE_LIMIT:'Достигнут предел удалённых записей. Продолжай скрывать ненужные записи.',SKILL_LOCKED:'Этот навык пока закрыт.',SKILL_GRAPH_INVALID:'В зависимостях древа есть ошибка.',QUEST_NOT_FOUND:'Запись квеста не найдена.',QUESTS_INVALID:'Проверь данные квеста.',IDEMPOTENCY_CONFLICT:'Запрос на добавление квеста изменился. Повтори добавление.',RATE_LIMITED:'Слишком много изменений подряд. Подожди немного.',RATE_LIMIT_UNAVAILABLE:'Не удалось проверить частоту запросов. Проверь доступ сервера к Firestore и повтори попытку.',DATABASE_PERMISSION_DENIED:'Серверу не хватает прав на запись в Firestore. Для service account добавь роль Cloud Datastore User и дождись применения IAM.',DATABASE_UNAVAILABLE:'Firestore временно недоступен. Повтори попытку позже.',QUESTS_SAVE_FAILED:'Не удалось сохранить квесты на сервере. Повтори попытку; если ошибка повторится, проверь журнал функции /api/rpg/quests.',SERVER_NOT_CONFIGURED:'Сервер квестов ещё не настроен.',SERVER_CONFIG_INVALID:'Не удалось подключить сервер квестов.',AUTH_REQUIRED:'Войди в аккаунт, чтобы изменить квесты.',INVALID_AUTH:'Сеанс истёк. Войди в аккаунт снова.'})[result.error]||'Не удалось сохранить квесты.');
    if(intent)AiryQuestIdempotency.clearIntent(practiceStorage(),intentKey,intent.requestId,intent.fingerprint);
    store.profile=Object.assign({},store.profile||{},result.profilePatch||{},{quests:Array.isArray(result.quests)?result.quests:[]});
    return store.profile.quests;
  }
  const previous=Array.isArray(store.profile?.quests)?store.profile.quests:[];let quests=previous,patch={};
  if(action==='sync')return previous;
  if(action==='purge-archive'){
    const id=String(payload.id||'');if(!/^[\w-]{1,100}$/.test(id))throw new Error('Проверь данные квеста.');
    const history=Array.isArray(store.profile?.questHistory)?store.profile.questHistory:[];
    const exists=history.some(entry=>entry&&entry.id===id)||store.proofs.some(proof=>proof&&proof.quest===id)||previous.some(quest=>quest&&quest.id===id&&quest.done===true);
    if(!exists)throw new Error('Запись квеста не найдена.');
    const purged=new Set(Array.isArray(store.profile?.purgedQuestArchiveIds)?store.profile.purgedQuestArchiveIds:[]);purged.add(id);
    if(purged.size>5000)throw new Error('Достигнут предел удалённых записей. Продолжай скрывать ненужные записи.');
    patch={purgedQuestArchiveIds:Array.from(purged),questHistory:history.filter(entry=>entry?.id!==id),quests:previous.filter(quest=>quest?.id!==id)};
    await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);return store.profile.quests;
  }
  if(action==='add'){
    const additions=Array.isArray(payload.quests)?payload.quests:[];
    if(previous.filter(q=>!q.done).length+additions.length>80)throw new Error('Доска заполнена. Убери или заверши несколько активных квестов.');
    quests=previous.concat(additions.map((q,index)=>Object.assign({id:'q'+Date.now().toString(36)+index,period:'personal',createdAt:Date.now(),done:false},q)));
  }else if(action==='remove')quests=previous.filter(q=>q.id!==payload.id||q.period==='daily'||q.period==='weekly'||q.period==='boss'||q.done);
  else if(action==='reschedule'){
    const target=previous.find(q=>q.id===payload.id);
    if(!target||target.period!=='personal'||target.done)throw new Error('Личный активный квест не найден.');
    const dueAt=Number(payload.dueAt);if(!Number.isFinite(dueAt)||dueAt<Date.now()-86400000||dueAt>Date.now()+366*86400000)throw new Error('Выбери дату в пределах ближайшего года.');
    quests=previous.map(q=>q.id===payload.id?Object.assign({},q,{dueAt}):q);
  }
  else if(action==='remove-for-skills'){const ids=new Set(payload.skillIds||[]);quests=previous.filter(q=>!ids.has(q.skill)||q.done);patch=payload.profilePatch||{};const meta=Object.assign({},store.profile?.skillArchiveMeta||{});ids.forEach(id=>{if(!meta[id])meta[id]={archivedAt:Date.now()};});patch=Object.assign({},patch,{skillArchiveMeta:meta});}
  else if(action==='repeat'){
    const source=(store.profile?.questHistory||[]).find(q=>q.id===payload.sourceId);if(!source)throw new Error('Запись квеста не найдена.');
    if(previous.filter(q=>!q.done).length>=80)throw new Error('Доска заполнена. Убери или заверши несколько активных квестов.');
    quests=previous.concat([{id:'qr-'+Date.now().toString(36),skill:source.skill,title:source.title,period:'personal',requiredMinutes:15,createdAt:Date.now(),done:false,originalQuestId:source.id}]);
  }
  store.profile=Object.assign({},store.profile||{},patch,{quests});lsSave();return quests;
}
function ensureRecurringQuests(){
  if(questBoardUpdating||!store.profile||!TREE.length)return;
  if(store.mode==='db'){
    const user=store.auth?.currentUser;if(!user)return;
    const marker=user.uid+'|'+dayKey(Date.now());if(questSyncMarker===marker)return;questSyncMarker=marker;
    questBoardUpdating=true;
    window.AiryQuestSync.withRetry(()=>mutateQuests('sync',{offset:new Date().getTimezoneOffset()*-1}),{attempts:2,delayMs:900,shouldRetry:error=>error instanceof TypeError||error?.message==='Не удалось сохранить квесты.'}).then(()=>{questSyncMarker=marker;renderAll();}).catch(error=>{questSyncMarker='';toast(error?.message||'Не удалось обновить доску квестов. Проверь соединение.');}).finally(()=>{questBoardUpdating=false;});
    return;
  }
  const now=new Date(),today=dayKey(now.getTime()),dayStart=new Date(now);dayStart.setHours(0,0,0,0);
  const tomorrow=new Date(dayStart);tomorrow.setDate(tomorrow.getDate()+1);
  const weekStart=new Date(dayStart);weekStart.setDate(weekStart.getDate()-(weekStart.getDay()+6)%7);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+7);weekEnd.setMilliseconds(-1);
  const weekKey=dayKey(weekStart.getTime()),dailyId='daily-'+today,weeklyId='weekly-'+weekKey,bossId='boss-'+weekKey;
  const activeBranches=TREE.filter(branch=>!(store.profile.hiddenSkills||[]).includes(branch.id));
  if(!activeBranches.length)return;
  const dateSeed=Number(today.replaceAll('-',''))||0,weekSeed=Number(weekKey.replaceAll('-',''))||0;
  const dailyBranch=activeBranches[dateSeed%activeBranches.length],weeklyBranch=activeBranches[(weekSeed+2)%activeBranches.length],bossBranch=activeBranches[(weekSeed+4)%activeBranches.length];
  const quests=Array.isArray(store.profile.quests)?store.profile.quests:[];
  const needDaily=!quests.some(q=>q.id===dailyId),needWeekly=!quests.some(q=>q.id===weeklyId),needBoss=!quests.some(q=>q.id===bossId);
  if(!needDaily&&!needWeekly&&!needBoss)return;
  const currentWeekStart=weekStart.getTime(),retained=quests.filter(q=>{
    if(q.period==='daily')return q.done&&Number(q.createdAt||0)>=dayStart.getTime()-7*86_400_000;
    if(q.period==='weekly'||q.period==='boss')return q.done&&Number(q.createdAt||0)>=currentWeekStart-8*7*86_400_000;
    return true;
  });
  const add=[];
  if(needDaily)add.push({id:dailyId,period:'daily',skill:dailyBranch.id,title:`15 минут фокусной практики · ${dailyBranch.name}`,requiredMinutes:15,createdAt:now.getTime(),expiresAt:tomorrow.getTime(),done:false});
  if(needWeekly)add.push({id:weeklyId,period:'weekly',skill:weeklyBranch.id,title:`Подкрепи работу материалом · ${weeklyBranch.name}`,requiredMinutes:30,requiresEvidence:true,createdAt:now.getTime(),expiresAt:weekEnd.getTime(),done:false});
  if(needBoss)add.push({id:bossId,period:'boss',skill:bossBranch.id,title:`Boss Challenge · большая практика с подтверждением · ${bossBranch.name}`,requiredMinutes:60,requiresEvidence:true,createdAt:now.getTime(),expiresAt:weekEnd.getTime(),done:false});
  const next=retained.concat(add);if(next.length>80){if(add.length)toast('Доска квестов заполнена. Убери или заверши несколько заданий.');return;}const patch={quests:next};
  questBoardUpdating=true;
  store.saveProfile(patch).then(()=>{store.profile=Object.assign({},store.profile,patch);renderAll();}).catch(()=>{toast('Не удалось обновить доску квестов. Проверь сохранение профиля.');}).finally(()=>{questBoardUpdating=false;});
}
function onData(){renderAll();}
function renderAll(){
  buildTree();S=computeStats(store.proofs);
  ensureRecurringQuests();
  renderHud();renderDashboard();renderTree();renderJournal();renderAwards();renderProfile();
  if(activeTab==='archive'){renderSkillArchive();renderTreeArchive();renderAchievementArchive();renderQuestArchive();}
  applyMikaArt();
  if($('#ciOverlay').hidden)fillSkillSelect();
}
function renderHud(){
  const t=S.tl;
  $('#lvlNum').textContent=t.L;$('#lvl').style.setProperty('--p',Math.round(t.frac*100));
  $('#rank').textContent=rankOf(t.L);
  $('#xpFill').style.width=Math.round(t.frac*100)+'%';
  $('#xpText').textContent=num(S.total-t.lo)+' / '+num(t.hi-t.lo);
  $('#streakNum').textContent=S.streak;
  const streak=$('.streak'),days=Math.max(0,Number(S.streak)||0);
  const stages=[{at:30,tier:'legendary',name:'легендарное цветение'},{at:14,tier:'moonlit',name:'ночное цветение'},{at:7,tier:'radiant',name:'пышное цветение'},{at:3,tier:'bloom',name:'полное цветение'},{at:1,tier:'bud',name:'первый бутон'},{at:0,tier:'seed',name:'покой'}];
  const current=stages.find(stage=>days>=stage.at)||stages[stages.length-1],next=[...stages].reverse().find(stage=>stage.at>days);
  const locale=window.AiryUiLocale?.getLocale?.()||'ru';
  const dayWord=n=>n%10===1&&n%100!==11?'день':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'дня':'дней';
  const stageName=locale==='en'?({legendary:'legendary bloom',moonlit:'moonlit bloom',radiant:'radiant bloom',bloom:'full bloom',bud:'first bud',seed:'rest'}[current.tier]):locale==='kk'?({legendary:'аңызға айналған гүлдеу',moonlit:'айлы гүлдеу',radiant:'жарқыраған гүлдеу',bloom:'толық гүлдеу',bud:'алғашқы бүршік',seed:'тынығу'}[current.tier]):current.name;
  const nextStageName=locale==='en'?({legendary:'legendary bloom',moonlit:'moonlit bloom',radiant:'radiant bloom',bloom:'full bloom',bud:'first bud',seed:'rest'}[next?.tier]):locale==='kk'?({legendary:'аңызға айналған гүлдеу',moonlit:'айлы гүлдеу',radiant:'жарқыраған гүлдеу',bloom:'толық гүлдеу',bud:'алғашқы бүршік',seed:'тынығу'}[next?.tier]):next?.name;
  const description=locale==='en'?(next?`Streak: ${days} day${days===1?'':'s'} · ${next.at-days} more day${next.at-days===1?'':'s'} until ${nextStageName}`:`Streak: ${days} day${days===1?'':'s'} · highest sakura stage`):locale==='kk'?(next?`Қатарынан: ${days} күн · ${next.at-days} күннен кейін «${nextStageName}» кезеңі`:`Қатарынан: ${days} күн · сакураның ең жоғары кезеңі`):(next?`Серия ${days} ${dayWord(days)} · ещё ${next.at-days} ${dayWord(next.at-days)} до стадии «${nextStageName}»`:`Серия ${days} ${dayWord(days)} · высшая стадия сакуры`);
  streak.dataset.streakTier=current.tier;streak.title=description;streak.setAttribute('aria-label',description);
}
function animatePracticeProgress(before,after,entry){
  const xp=Math.max(0,(Number(after&&after.total)||0)-(Number(before&&before.total)||0));
  if(!xp)return;
  const leveled=!!(before&&after&&before.tl&&after.tl&&after.tl.L>before.tl.L),earned=after&&after.ach&&before&&before.ach?after.ach.filter(id=>!before.ach.includes(id)):[];
  if(leveled)playUiSound('level');else if(earned.length)playUiSound('award');else playUiSound('practice');
  if(REDUCED)return;
  const bar=$('.hud .bar'),xpText=$('#xpText'),lvl=$('#lvl');
  [bar,xpText].forEach(el=>{if(!el)return;el.classList.remove('xp-earned');void el.offsetWidth;el.classList.add('xp-earned');setTimeout(()=>el.classList.remove('xp-earned'),850);});
  if(leveled){
    const from=Math.max(0,Math.min(1,before.tl.frac)),to=Math.max(0,Math.min(1,after.tl.frac)),seq=(lvl._ringSeq||0)+1;lvl._ringSeq=seq;
    const draw=(start,a,b,duration,done)=>{const frame=now=>{if(lvl._ringSeq!==seq)return;const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,3);lvl.style.setProperty('--p',(a+(b-a)*ease)*100);if(p<1)requestAnimationFrame(frame);else if(done)done();};requestAnimationFrame(frame);};
    lvl.style.setProperty('--p',from*100);draw(performance.now(),from,1,500);
    setTimeout(()=>{if(lvl._ringSeq!==seq)return;lvl.style.setProperty('--p',0);draw(performance.now(),0,to,250);},530);
    lvl.classList.remove('level-earned');void lvl.offsetWidth;lvl.classList.add('level-earned');setTimeout(()=>lvl.classList.remove('level-earned'),900);
  }
  const branchId=SK[entry&&entry.skill]&&SK[entry.skill].branch;
  const branchCard=branchId?document.querySelector('.home-skill[data-branch-id="'+branchId+'"]'):null;
  if(branchCard){branchCard.classList.remove('practice-earned');void branchCard.offsetWidth;branchCard.classList.add('practice-earned');setTimeout(()=>branchCard.classList.remove('practice-earned'),900);}
  if(before&&after&&after.streak>before.streak){
    const streak=$('.streak'),icon=$('.streak .sakura-streak');
    streak.classList.remove('streak-bloom');icon.classList.remove('sakura-bloom');void streak.offsetWidth;
    streak.classList.add('streak-bloom');icon.classList.add('sakura-bloom');
    const vectors=[[-13,-17],[-5,-23],[6,-21],[14,-13]];
    vectors.forEach(([x,y],i)=>{const petal=document.createElement('i');petal.className='streak-petal';petal.setAttribute('aria-hidden','true');petal.style.setProperty('--dx',x+'px');petal.style.setProperty('--dy',y+'px');petal.style.setProperty('--delay',(i*45)+'ms');streak.appendChild(petal);setTimeout(()=>petal.remove(),1150+i*45);});
    setTimeout(()=>{streak.classList.remove('streak-bloom');icon.classList.remove('sakura-bloom');},1050);
  }
  earned.forEach((id,i)=>{const badge=document.querySelector('.badge[data-achievement="'+id+'"]');if(!badge)return;badge.style.setProperty('--earned-delay',Math.min(i,4)*90+'ms');badge.classList.remove('just-earned');void badge.offsetWidth;badge.classList.add('just-earned');setTimeout(()=>{badge.classList.remove('just-earned');badge.style.removeProperty('--earned-delay');},1100+i*90);});
}

function promotedBranches(branchId,profile=store.profile){
  const previous=Array.isArray(profile?.recentBranchIds)?profile.recentBranchIds:[];
  return [branchId,...previous.filter(id=>id!==branchId)].slice(0,12);
}
function dashboardBranches(){
  const saved=Array.isArray(store.profile?.recentBranchIds)?store.profile.recentBranchIds:[];
  const pinned=(Array.isArray(store.profile?.pinnedBranches)?store.profile.pinnedBranches:[]).filter(id=>TREE.some(b=>b.id===id));
  const favorites=(Array.isArray(store.profile?.favoriteSkills)?store.profile.favoriteSkills:[]).filter(id=>TREE.some(b=>b.id===id));
  const proofIds=store.proofs.slice().sort((a,b)=>Number(b.ts)-Number(a.ts)).map(p=>SK[p.skill]?.branch).filter(Boolean);
  const seen=new Set(),ids=[];
  [...saved,...proofIds].forEach(id=>{if(!seen.has(id)){seen.add(id);ids.push(id);}});
  const priority=new Map(ids.map((id,index)=>[id,index])),byId=new Map(TREE.map(b=>[b.id,b]));
  const rest=TREE.filter(b=>!pinned.includes(b.id)&&!favorites.includes(b.id)).sort((a,b)=>(priority.get(a.id)??Infinity)-(priority.get(b.id)??Infinity));
  return [...pinned.map(id=>byId.get(id)).filter(Boolean),...favorites.map(id=>byId.get(id)).filter(Boolean),...rest].slice(0,4);
}
function renderDashboard(){
  if(!S)return;
  const tr=window.AiryUiLocale?.t||((text)=>text);
  const name=(store.profile&&store.profile.name)||(store.accountUser&&store.accountUser.displayName)||'';
  $('#homeName').textContent=name||'путешественник';
  const today=dayKey(Date.now());
  const recommendation=window.AiryDailyRecommendation.buildDailyRecommendation({today,branches:TREE.map(branch=>({...branch,name:tr(branch.name)})),skills:Object.values(SK).map(skill=>({...skill,name:tr(skill.name)})),proofs:store.proofs,profile:store.profile,skillXp:S.xpBy,unlockedSkills:Array.from(S.unlocked),language:window.AiryUiLocale?.getLocale?.()||'ru'});
  homeRecommendationSkillId=recommendation.skillId;
  $('#homeDailyPhrase').textContent=recommendation.text;
  const tl=S.tl;$('#homeLevel').textContent=tl.L;$('#homeRank').textContent=rankOf(tl.L);$('#homePoints').textContent=num(S.total);$('#homeXp').textContent=num(S.total);
  $('#homeXpFill').style.width=Math.round(tl.frac*100)+'%';$('#homeXpNext').textContent=num(S.total-tl.lo)+' / '+num(tl.hi-tl.lo)+' опыта до следующего уровня';
  const weekStart=addDays(today,-6),monthStart=today.slice(0,7)+'-01',countRange=(start,counts)=>Object.entries(counts||{}).reduce((total,[day,count])=>total+(day>=start&&day<=today?(Number(count)||0):0),0),proofDay=proof=>typeof proof.day==='string'?proof.day:dayKey(Number(proof.ts)||Date.now()),weekCount=store.summary?countRange(weekStart,store.summary.dayCounts):store.proofs.filter(proof=>{const day=proofDay(proof);return day>=weekStart&&day<=today;}).length,monthCount=store.summary?countRange(monthStart,store.summary.dayCounts):store.proofs.filter(proof=>{const day=proofDay(proof);return day>=monthStart&&day<=today;}).length,summaryPending=store.mode==='db'&&!store.summary&&!store.summaryError,insightHint=store.summaryError?'Сводка сервера недоступна: показаны данные из загруженных записей.':summaryPending?'Загружается полная сводка; пока показаны данные из загруженных записей.':'';
  [$('#homeWeekInsight'),$('#homeMonthInsight')].forEach(insight=>{insight.setAttribute('aria-busy',String(summaryPending));insight.title=insightHint;});
  $('#homeWeekInsight b').textContent=num(weekCount);$('#homeMonthInsight b').textContent=num(monthCount);
  renderWeeklyActivity(today);
  $('#homeAverageMinutes').textContent=S.count?Math.round(S.minutes/S.count)+' мин':'—';
  $('#homeAverageMinutes').title=S.count?'Средняя длительность одной практики за всё время':'Появится после первой практики';
  $('#homeActiveSkills').textContent=num(S.used);
  const unlockedAchievements=new Set([...(S.ach||[]),...Object.keys((store.profile&&store.profile.achievementUnlocks)||{})]);$('#homeAchievements').textContent=num(unlockedAchievements.size);
  renderSeasonChallenges(today);
  const icons=['✥','◉','⌘','✿','⌁','✧'];
  const branches=dashboardBranches(),skills=$('#homeSkills'),previousOrder=Array.from(skills.querySelectorAll('[data-branch-id]'),card=>card.dataset.branchId).join('|'),nextOrder=branches.map(b=>b.id).join('|');
  const pinned=new Set(store.profile?.pinnedBranches||[]);
  skills.innerHTML=branches.length?branches.map((b,i)=>{const lvx=S.bl[b.id]||{L:1,frac:0},iconIndex=TREE.findIndex(x=>x.id===b.id);const pct=Math.round(lvx.frac*100);return '<article class="home-skill" data-branch-id="'+esc(b.id)+'" style="--skill-color:'+esc(b.c)+';--slot:'+i+'"><div class="home-skill-top"><span class="home-skill-icon" aria-hidden="true">'+icons[iconIndex%icons.length]+'</span><b title="'+esc(tr(b.name))+'">'+esc(tr(b.name))+'</b><button class="skill-pin'+(pinned.has(b.id)?' is-pinned':'')+'" type="button" data-pin="'+esc(b.id)+'" aria-pressed="'+pinned.has(b.id)+'" aria-label="'+tr(pinned.has(b.id)?'Открепить':'Закрепить')+' '+esc(tr(b.name))+'" title="'+tr(pinned.has(b.id)?'Открепить навык':'Закрепить навык')+'">'+(pinned.has(b.id)?'★':'☆')+'</button></div><small>'+tr('Уровень')+' '+num(lvx.L)+'</small><div class="home-skill-track"><i style="width:'+pct+'%"></i></div><div class="home-skill-foot"><span>'+num(S.bxp[b.id]||0)+' XP · '+pct+'%</span></div><div class="home-skill-actions"><button type="button" data-skill-history="'+esc(b.id)+'">'+tr('История')+'</button><button type="button" data-skill-practice="'+esc(b.id)+'">'+tr('＋ Практика')+'</button></div></article>';}).join(''):'<div class="home-empty">'+tr('Добавь первую ветку навыков в древе.')+'</div>';
  if(previousOrder&&previousOrder!==nextOrder&&!REDUCED){skills.classList.add('is-shifting');clearTimeout(skills.shiftTimer);skills.shiftTimer=setTimeout(()=>skills.classList.remove('is-shifting'),620);}
  const recent=store.proofs.slice().sort((a,b)=>b.ts-a.ts).slice(0,3);
  $('#homeActivity').innerHTML=recent.length?recent.map(p=>'<article class="home-activity-row"><span class="home-activity-icon" aria-hidden="true">✓</span><div class="home-activity-copy"><b>'+esc((SK[p.skill]&&SK[p.skill].name)||'Практика')+'</b><small>'+esc(String(p.text||'Отмечен прогресс').slice(0,100))+'</small></div><span class="home-activity-xp">+'+num(p.xp||0)+' XP</span><time class="home-activity-time">'+esc(p.day||'')+'</time></article>').join(''):'<div class="home-empty">Твои первые шаги появятся здесь. Запиши практику и копи опыт — я замечу, конечно.</div>';
}
function renderWeeklyActivity(today){
  const locale=window.AiryUiLocale?.getLocale?.()||'ru',counts=store.summary?.dayCounts||{},chart=window.AiryWeeklyActivity.build(Date.now(),counts,store.proofs,locale,homeActivityRange),label=window.AiryUiLocale?.t||((value)=>value),month=homeActivityRange===30;
  $('#homeActivityRangeLabel').textContent=label(month?'ПОСЛЕДНИЕ 30 ДНЕЙ':'ПОСЛЕДНИЕ 7 ДНЕЙ',locale);
  $('#homeWeeklyBars').classList.toggle('is-month',month);
  $$('[data-activity-range]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.activityRange)===homeActivityRange)));
  $('#homeWeeklyBars').setAttribute('aria-label',label(month?'Практики по дням за последний месяц':'Практики по дням за последнюю неделю',locale));
  $('#homeWeeklyTotal').textContent=num(chart.total);
  $('#homeWeeklyTotal').setAttribute('aria-label',`${num(chart.total)} ${label('практик',locale)}`);
  $('#homeWeeklyBars').innerHTML=chart.days.map(day=>month?'<div class="home-week-day'+(day.today?' is-today':'')+'" data-count="'+day.count+'" style="--activity-level:'+Math.round(day.count?Math.max(12,day.count/chart.max*100):0)+'%" role="listitem" aria-label="'+esc(`${day.dateLabel}: ${num(day.count)} ${label('практик',locale)}`)+'" title="'+esc(`${day.dateLabel}: ${num(day.count)} ${label('практик',locale)}`)+'"><span aria-hidden="true">'+day.day+'</span></div>':'<div class="home-week-day'+(day.today?' is-today':'')+'" data-count="'+day.count+'" role="listitem" aria-label="'+esc(`${day.dateLabel}: ${num(day.count)} ${label('практик',locale)}`)+'" title="'+esc(`${day.dateLabel}: ${num(day.count)} ${label('практик',locale)}`)+'"><span class="home-week-track" aria-hidden="true"><i class="home-week-fill" style="--bar-height:'+day.height+'%"></i></span><span class="home-week-label" aria-hidden="true">'+esc(label(day.dayLabel,locale))+'</span></div>').join('');
  const status=store.summaryError?'Показаны доступные записи на этом устройстве.':store.mode==='db'&&!store.summary?'Загружаю полную сводку активности…':chart.total?`${num(chart.total)} ${label('практик',locale)} ${label(month?'за последние 30 дней':'за последние 7 дней',locale)}.`:'Запиши первую практику — график покажет твой ритм.';
  $('#homeWeeklyNote').textContent=label(status,locale);
}
$$('[data-activity-range]').forEach(button=>button.addEventListener('click',()=>{homeActivityRange=Number(button.dataset.activityRange)===30?30:7;renderWeeklyActivity(new Date());}));
function renderSeasonChallenges(){
  const branchBySkill=Object.fromEntries(Object.entries(SK).map(([id,skill])=>[id,skill.branch]));
  const data=window.AirySeasonChallenges.build(Date.now(),store.proofs,store.summary,branchBySkill),note=$('#seasonChallengesNote');
  const locale=window.AiryUiLocale?.getLocale?.()||'ru',tr=window.AiryUiLocale?.t||((text)=>text),daysLeft=data.season.daysLeft,endDate=new Date(data.season.end+'T12:00:00').toLocaleDateString(uiLocaleTag(),{day:'numeric',month:'long'}),seasonName=tr(data.season.name,locale);
  note.textContent=locale==='en'?`${seasonName} · through ${endDate} · ${daysLeft?`${daysLeft} days left`:'last day'}. No daily requirements.`:locale==='kk'?`${seasonName} · аяқталуы: ${endDate} · ${daysLeft?`${daysLeft} күн қалды`:'соңғы күн'}. Күн сайын қатысу міндетті емес.`:`${seasonName} · до ${endDate} · ${daysLeft?`осталось ${daysLeft} ${AiryRussianPlural.pluralForm(daysLeft,['день','дня','дней'])}`:'последний день'}. Никаких ежедневных требований.`;
  $('#seasonChallengeList').innerHTML=data.challenges.map(challenge=>'<article class="season-challenge'+(challenge.done?' is-done':'')+'"><div class="season-challenge-top"><span class="season-challenge-icon" aria-hidden="true">'+(challenge.done?'✓':'✦')+'</span><span class="season-challenge-state">'+tr(challenge.done?'Выполнено':'Испытание сезона',locale)+'</span></div><h3>'+esc(tr(challenge.title,locale))+'</h3><p>'+esc(tr(challenge.description,locale))+'</p><div class="season-challenge-progress" role="progressbar" aria-label="'+esc(tr(challenge.title,locale))+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+challenge.progress+'"><i style="width:'+challenge.progress+'%"></i></div><div class="season-challenge-foot"><span>'+num(challenge.value)+' / '+num(challenge.target)+' '+esc(tr(challenge.unit,locale))+'</span><b>'+challenge.progress+'%</b></div></article>').join('');
}
/* ---------- tabs ---------- */
function show(tab,silent){
  if(!$('#view-'+tab))tab='novel';
  const previousTab=activeTab;
  activeTab=tab;
  $$('.view').forEach(v=>{v.hidden=(v.id!=='view-'+tab);});
  if(!silent&&tab!==previousTab){const view=$('#view-'+tab);view.classList.remove('is-entering');void view.offsetWidth;view.classList.add('is-entering');playUiSound('navigation');}
  $$('#nav button, #sideNav button').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  syncNavIndicator(tab);
  if(!silent){try{history.replaceState(null,'','#'+tab);}catch(e){}}
  if(tab==='tree')scheduleDrawEdges();
  if(tab==='archive'){renderSkillArchive();renderTreeArchive();renderAchievementArchive();renderQuestArchive();}
  if(tab==='novel'){measure();petals.start();if(welcomeStart){const start=welcomeStart;welcomeStart=null;start();}}else petals.stop();
  if(!silent)window.scrollTo(0,0);
}
const mobileTabs=$('#nav');let scrubPointer=null,navPointerClick=false;
function syncNavIndicator(tab){
  const indicator=$('#navIndicator'),button=$('button[data-tab="'+tab+'"]',mobileTabs);
  if(indicator&&!button)indicator.classList.remove('is-ready');
  if(indicator&&button&&mobileTabs.offsetWidth){
    const navRect=mobileTabs.getBoundingClientRect(),buttonRect=button.getBoundingClientRect();
    mobileTabs.style.setProperty('--nav-x',(buttonRect.left-navRect.left-mobileTabs.clientLeft)+'px');
    mobileTabs.style.setProperty('--nav-y',(buttonRect.top-navRect.top-mobileTabs.clientTop)+'px');
    mobileTabs.style.setProperty('--nav-w',buttonRect.width+'px');
    mobileTabs.style.setProperty('--nav-h',buttonRect.height+'px');
    indicator.classList.add('is-ready');
  }
  const rail=$('#sideNav'),railIndicator=$('#railIndicator'),railButton=rail&&$('button[data-tab="'+tab+'"]',rail);
  if(railIndicator&&!railButton)railIndicator.classList.remove('is-ready');
  if(railIndicator&&railButton&&railButton.getClientRects().length){
    const railRect=rail.getBoundingClientRect(),railButtonRect=railButton.getBoundingClientRect();
    rail.style.setProperty('--rail-x',(railButtonRect.left-railRect.left-rail.clientLeft)+'px');
    rail.style.setProperty('--rail-y',(railButtonRect.top-railRect.top-rail.clientTop)+'px');
    rail.style.setProperty('--rail-w',railButtonRect.width+'px');
    rail.style.setProperty('--rail-h',railButtonRect.height+'px');
    railIndicator.classList.add('is-ready');
  }
}
function scrubTarget(e){const hit=document.elementFromPoint(e.clientX,e.clientY);const button=hit&&hit.closest('button[data-tab]');return button&&mobileTabs.contains(button)?button:null;}
function scrubPreview(button){mobileTabs.classList.toggle('is-scrubbing',!!button);$$('button[data-tab]',mobileTabs).forEach(b=>b.toggleAttribute('data-scrub-preview',b===button));syncNavIndicator(button?button.dataset.tab:activeTab);}
mobileTabs.addEventListener('pointerdown',e=>{if(scrubPointer!==null||e.button!==0||!e.target.closest('button[data-tab]'))return;e.preventDefault();scrubPointer=e.pointerId;try{mobileTabs.setPointerCapture(e.pointerId);}catch(_){}scrubPreview(scrubTarget(e));});
mobileTabs.addEventListener('pointermove',e=>{if(e.pointerId===scrubPointer)scrubPreview(scrubTarget(e));});
mobileTabs.addEventListener('pointerup',e=>{if(e.pointerId!==scrubPointer)return;const target=scrubTarget(e);scrubPointer=null;mobileTabs.classList.remove('is-scrubbing');$$('button[data-tab]',mobileTabs).forEach(b=>b.removeAttribute('data-scrub-preview'));navPointerClick=true;setTimeout(()=>{navPointerClick=false;},0);if(target)show(target.dataset.tab);else syncNavIndicator(activeTab);});
mobileTabs.addEventListener('pointercancel',e=>{if(e.pointerId===scrubPointer){scrubPointer=null;scrubPreview(null);navPointerClick=false;}});
mobileTabs.addEventListener('lostpointercapture',e=>{if(e.pointerId===scrubPointer){scrubPointer=null;scrubPreview(null);}});
mobileTabs.addEventListener('click',e=>{if(navPointerClick){navPointerClick=false;return;}const b=e.target.closest('button[data-tab]');if(b)show(b.dataset.tab);});
$('#sideNav').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b)show(b.dataset.tab);});
$('#railAccount').addEventListener('click',()=>$('#accountToggle').click());
$('#homeTalk').addEventListener('click',()=>{launchMikaChat();requestAnimationFrame(()=>{const target=$('#stage');target?.scrollIntoView({behavior:REDUCED?'auto':'smooth',block:'center',inline:'nearest'});requestAnimationFrame(measure);});});
$('#homePractice').addEventListener('click',()=>openCheckin(homeRecommendationSkillId||undefined));
$('#homeSkills').addEventListener('click',async e=>{
  const practice=e.target.closest('[data-skill-practice]'),history=e.target.closest('[data-skill-history]'),pin=e.target.closest('[data-pin]');
  if(practice){e.stopPropagation();openCheckin(practice.dataset.skillPractice);return;}
  if(history){e.stopPropagation();openSkillHistory(history.dataset.skillHistory);return;}
  if(pin){e.stopPropagation();const id=pin.dataset.pin,current=Array.isArray(store.profile?.pinnedBranches)?store.profile.pinnedBranches:[],next=current.includes(id)?current.filter(x=>x!==id):[...current,id];if(next.length>4){toast('Можно закрепить до четырёх навыков.');return;}saveState('saving','Сохраняю…');try{await store.saveProfile({pinnedBranches:next});store.profile=Object.assign({},store.profile,{pinnedBranches:next});renderAll();saveState('saved','Сохранено');}catch(err){saveState('error','Не сохранено');toast('Не удалось изменить закреплённые навыки.');}}
});
document.addEventListener('click',e=>{const b=e.target instanceof Element?e.target.closest('button[data-tab]'):null;if(b&&!b.closest('#nav')&&!b.closest('#sideNav'))show(b.dataset.tab);});
let welcomeStart=null;
function finishWelcome(tab){
  try{localStorage.setItem(ONBOARDING_KEY,'done');}catch(e){}
  $('#welcomeOverlay').hidden=true;
  show(tab);
  if(tab==='novel')$('#homeTitle').focus({preventScroll:true});
}
$('#welcomeStart').addEventListener('click',()=>finishWelcome('novel'));
$('#welcomeTree').addEventListener('click',()=>finishWelcome('tree'));
document.addEventListener('keydown',e=>{
  const dialog=$('#welcomeOverlay .welcome-sheet');
  if($('#welcomeOverlay').hidden)return;
  if(e.key==='Escape'){e.preventDefault();finishWelcome('novel');return;}
  if(e.key==='Tab'){
    const buttons=[$('#welcomeStart'),$('#welcomeTree')],first=buttons[0],last=buttons[1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  if(dialog&&!dialog.contains(document.activeElement))$('#welcomeStart').focus();
});
document.addEventListener('click',e=>{const button=e.target instanceof Element?e.target.closest('button:not(:disabled)'):null;if(!button||REDUCED)return;button.classList.remove('tap-pop');void button.offsetWidth;button.classList.add('tap-pop');},true);
document.addEventListener('animationend',e=>{if(e.target instanceof HTMLButtonElement&&e.animationName==='button-tap')e.target.classList.remove('tap-pop');},true);

/* ---------- Mika dialogue engine ---------- */
const scene={queue:[],cur:null,typing:false,timer:null,full:'',waiting:false,instant:false};
const fmt=t=>String(t).replace(/\{name\}/g,(store.profile&&store.profile.name)||'друг').replace(/\(ась\)/g,'').replace(/\(а\)/g,'');
const EXPRS=['idle','happy','proud','surprised','think','sleepy','cool','crazy','excited','mischievous','tease','angry','sad','worried','shy','embarrassed','tender'];
const MIKA_SPRITES={
  old:{idle:'smile',happy:'joy',proud:'support',surprised:'shock',think:'sad',sleepy:'sad',cool:'smile',crazy:'crazy',excited:'joy',mischievous:'mischievous',tease:'tease',angry:'tsundere',sad:'sad',worried:'sad',shy:'tease',embarrassed:'tease',tender:'support'},
  new:{idle:'versions/new/regular',happy:'versions/new/happy',proud:'versions/new/energetic',surprised:'versions/new/surprised',think:'versions/new/modest',sleepy:'versions/new/sleepy',cool:'versions/new/regular',crazy:'versions/new/energetic',excited:'versions/new/energetic',mischievous:'versions/new/flirty',tease:'versions/new/flirty',angry:'versions/new/aggressive',sad:'versions/new/sad-curled',worried:'versions/new/sad-tear',shy:'versions/new/shy',embarrassed:'versions/new/embarrassed',tender:'versions/new/shy-close'}
};
const EXPR_SCALE={idle:1,happy:1,proud:1,surprised:1,think:1,sleepy:1,cool:1,crazy:1,excited:1,mischievous:1,tease:1,angry:1,sad:1,worried:1,shy:1,embarrassed:1,tender:1};
const mikaPreloaded=new Map();
let curExpr='idle',spriteRequest=0,mikaProfileReady=false;
function currentMikaVersion(){return store.profile&&store.profile.mikaVersion==='old'?'old':'new';}
function spriteUrl(sprite){return 'images/mika/'+sprite+'.webp?v=20261112q85';}
function getMikaSprite(sprite){if(!mikaPreloaded.has(sprite)){const image=new Image();image.src=spriteUrl(sprite);mikaPreloaded.set(sprite,image);}return mikaPreloaded.get(sprite);}
function setExpr(e){
  curExpr=EXPRS.includes(e)?e:'think';
  const m=$('#mika'),holder=$('.char'),stage=$('#stage');
  holder?.setAttribute('data-expression',curExpr);
  if(!m||!stage)return;
  const request=++spriteRequest,version=currentMikaVersion(),sprite=(MIKA_SPRITES[version]&&MIKA_SPRITES[version][curExpr])||MIKA_SPRITES.new.idle;
  m.setAttribute('data-expr',curExpr);
  m.style.setProperty('--expr-scale',String(EXPR_SCALE[curExpr]||1));m.style.setProperty('--expr-shift','0px');m.style.setProperty('--expr-tilt',curExpr==='cool'?'-1deg':'0deg');
  const image=getMikaSprite(sprite);
  // Never leave the previous emotion/version on screen while a new sprite is
  // still loading: that makes the dialogue and portrait visibly disagree on
  // slower connections. Cached sprites stay seamless because they commit at once.
  if(!image.complete||!image.naturalWidth)m.classList.remove('sprite-ready');
  const commit=(loadedImage,usedFallback=false)=>{
    if(request!==spriteRequest||!mikaProfileReady)return;
    if(!loadedImage.naturalWidth){m.classList.remove('sprite-ready');m.style.opacity='0';return;}
    m.src=loadedImage.src;
    stage.dataset.spriteVersion=version;
    if(usedFallback)m.dataset.spriteFallback='true';else delete m.dataset.spriteFallback;
    m.classList.add('sprite-ready');m.style.visibility='visible';m.style.opacity='1';
  };
  const fallback=()=>{
    if(request!==spriteRequest||!mikaProfileReady)return;
    const fallbackName=MIKA_SPRITES[version]?.idle||MIKA_SPRITES.new.idle;
    if(fallbackName===sprite){commit(image);return;}
    const fallbackImage=getMikaSprite(fallbackName),useFallback=()=>commit(fallbackImage,true);
    if(fallbackImage.complete)useFallback();else{fallbackImage.addEventListener('load',useFallback,{once:true});fallbackImage.addEventListener('error',useFallback,{once:true});}
  };
  if(image.complete){if(image.naturalWidth)commit(image);else fallback();}
  else{image.addEventListener('load',()=>commit(image),{once:true});image.addEventListener('error',fallback,{once:true});}
}
function inferMikaExpression(text){const value=String(text||'').toLocaleLowerCase(uiLocaleTag());if(/злюсь|разозли|сердит|хватит!|прекрати|бесишь|как ты смеешь/.test(value))return'angry';if(/снова ты за своё|опять ты со своими|ну конечно,? ты|закатываю глаза|не задирай нос|подкол|поддразн/.test(value))return'tease';if(/я же говорила|видишь,? я|как я и сказала|так и знала|горжусь|не зря я в тебя верила/.test(value))return'proud';if(/ничего себе|неожидан|правда\?|серьёзно\?|вот это поворот|вот это да/.test(value))return'surprised';if(/смуща|краснею|не смотри так|д-дурак|засмуща/.test(value))return'embarrassed';if(/груст|печал|хочется плакать|слёз|слез/.test(value))return'sad';if(/тревож|волнуюсь|боюсь|страшно|переживаю/.test(value))return'worried';if(/нежно|побереги себя|я рядом|береги себя|ты устал|тебе тяжело/.test(value))return'tender';if(/застесня|стесня|робко/.test(value))return'shy';if(/секрет|между нами|шалост|заговор/.test(value))return'mischievous';if(/я устала|сама устала|хочу спать|сонн|зеваю|зевнула/.test(value))return'sleepy';if(/не могу усидеть|вперёд!|вперед!|урааа|азарт|так захватывающе|хочу скорее начать/.test(value))return'excited';if(/ура|поздравля|молодец|круто|отлично|здорово|получилось|рада за тебя/.test(value))return'happy';if(/безум|невероятно|гениальн|!!!/.test(value))return'crazy';if(/хм|думаю|кажется|возможно|не уверен|разбер|интересно/.test(value))return'think';if(/ладно|спокойно|пожалуй|ну что ж/.test(value))return'cool';return null;}
function measure(){
  requestAnimationFrame(()=>{const st=$('#stage');if(!st)return;
    st.style.setProperty('--ui-h',$('#ui').offsetHeight+'px');st.style.setProperty('--stage-h',st.offsetHeight+'px');});
}
function play(lines){scene.queue=lines.slice();next();}
function next(){
  clearUi();scene.waiting=false;
  if(!scene.queue.length){showMenu();return;}
  const l=scene.queue.shift();scene.cur=l;setExpr(l.expr);
  if(l.fx)fx(l.fx[0],l.fx[1]);
  typeLine(fmt(l.text));
}
function clearUi(){$('#choices').innerHTML='';$('#choices').hidden=true;$('#ask').hidden=true;$('#more').hidden=true;}
function typeLine(text){
  stopTyping();scene.full=text;$('#srLine').textContent=text;
  $('#dialog').classList.toggle('is-empty',!String(text).trim());
  const el=$('#line');
  if(REDUCED||scene.instant){scene.instant=false;el.textContent=text;typed();return;}
  let i=0;scene.typing=true;el.textContent='';
  scene.timer=setInterval(()=>{i+=2;el.textContent=text.slice(0,i);if(i>=text.length)finishTyping();},22);
}
function stopTyping(){clearInterval(scene.timer);scene.typing=false;}
function finishTyping(){stopTyping();$('#line').textContent=scene.full;typed();}
function typed(){
  const l=scene.cur||{};
  if(l.choices){showChoices(l.choices);return;}
  if(l.ask){const a=$('#ask');$('#askIn').placeholder=l.ask.placeholder||'';$('#askIn').maxLength=l.ask.max||24;$('#askIn').value=l.ask.prefill||'';$('#newChat').hidden=!(l.ask.chat&&mikaHistory.length);a.hidden=false;if(l.menu)showMenu();else measure();setTimeout(()=>{if(activeTab==='novel'&&!matchMedia('(pointer: coarse)').matches)$('#askIn').focus({preventScroll:true});},30);return;}
  if(scene.queue.length){scene.waiting=true;$('#more').hidden=false;}else{showMenu();}
}
function advance(){if(scene.typing){finishTyping();return;}if(scene.waiting)next();}
function showChoices(list){
  const box=$('#choices');box.innerHTML='';
  list.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='choice'+(c.primary?' primary':'');b.textContent=c.label;
    b.addEventListener('click',ev=>{ev.stopPropagation();box.innerHTML='';box.hidden=true;c.run();});box.appendChild(b);});
  box.hidden=!list.length;measure();
}
function showMenu(){
  showChoices([
    {label:'Отметить прогресс',primary:true,run:()=>openCheckin()},
    {label:'Квесты',run:()=>openQuests()},
    {label:'Мой прогресс',run:()=>play([mikaChatPrompt('Как у меня идёт прогресс?')])},
    {label:'Что изучить дальше?',run:()=>play([mikaChatPrompt('Что мне лучше изучить дальше с учётом моего прогресса?')])},
    {label:mikaHistory.length?'Продолжить разговор':'Просто поболтать',run:talkChat}
  ]);
}
$('#dialog').addEventListener('click',advance);
$('#ask').addEventListener('submit',e=>{
  e.preventDefault();const a=scene.cur&&scene.cur.ask;const v=$('#askIn').value.trim().slice(0,a&&a.max||24);
  $('#ask').hidden=true;$('#askIn').value='';
  Promise.resolve(a&&a.done?a.done(v):null).catch(()=>{}).then(()=>next());
});
$('#newChat').addEventListener('click',()=>{mikaHistory.length=0;saveMikaHistory();play([mikaChatPrompt('',true)]);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeAll();return;}
  if((e.key==='Enter'||e.key===' ')&&activeTab==='novel'&&!anyOverlay()){
    const t=document.activeElement&&document.activeElement.tagName;
    if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(t||''))return;
    e.preventDefault();advance();
  }
});
let fxTimer=null;
function fx(title,sub,kind){
  const b=$('#fx');b.dataset.kind=kind|| (String(title).toLocaleLowerCase('en').includes('level')?'level':'award');$('#fxT').textContent=title;$('#fxS').textContent=sub||'';b.hidden=false;b.classList.remove('go');void b.offsetWidth;b.classList.add('go');
  clearTimeout(fxTimer);fxTimer=setTimeout(()=>{b.hidden=true;},2700);
}

/* ---------- dialogue content ---------- */
/* Chat replies come from the model; this section contains no scripted character dialogue. */
const MIKA_HISTORY_KEY='upskill-mika-chat-v1';
let mikaHistoryScope='unresolved';
function scopedMikaHistoryKey(scope){return MIKA_HISTORY_KEY+':'+(scope==='guest'?'guest':scope.replace(/[^a-zA-Z0-9:_-]/g,'_'));}
function loadMikaHistory(scope){try{let stored=localStorage.getItem(scopedMikaHistoryKey(scope));if(stored===null&&scope==='guest'){const legacy=localStorage.getItem(MIKA_HISTORY_KEY);if(legacy!==null){stored=legacy;try{localStorage.setItem(scopedMikaHistoryKey(scope),legacy);}catch{}}}const rows=JSON.parse(stored||'[]');if(!Array.isArray(rows))return[];return rows.slice(-20).flatMap(item=>item&&['user','model'].includes(item.role)&&typeof item.text==='string'&&item.text.trim()?[{role:item.role,text:item.text.trim().slice(0,1200),...(EXPRS.includes(item.expression)?{expression:item.expression}:{})}]:[]);}catch{return[];}}
function saveMikaHistory(){if(mikaHistoryScope==='unresolved')return;try{localStorage.setItem(scopedMikaHistoryKey(mikaHistoryScope),JSON.stringify(mikaHistory.slice(-20)));}catch{}}
const mikaHistory=[];
function activateMikaScope(scope){const next=scope||'guest';if(next===mikaHistoryScope)return;const hadScope=mikaHistoryScope!=='unresolved';mikaHistoryScope=next;mikaHistory.splice(0,mikaHistory.length,...loadMikaHistory(next));if(hadScope){clearInterval(scene.timer);scene.timer=null;scene.queue=[];scene.cur=null;scene.waiting=false;scene.typing=false;$('#line').textContent='';$('#srLine').textContent='';$('#dialog').classList.add('is-empty');clearUi();if(activeTab==='novel')showMenu();}}
function mikaContext(){
  const top=TREE.slice().sort((a,b)=>(S.bxp[b.id]||0)-(S.bxp[a.id]||0))[0];
  const hour=new Date().getHours(),dayPart=hour<5||hour>=23?'поздняя ночь':hour<11?'утро':hour<17?'день':'вечер';
  return {name:(store.profile&&store.profile.name)||'',localTime:new Date().toLocaleTimeString(uiLocaleTag(),{hour:'2-digit',minute:'2-digit'}),dayPart,mood:curExpr,background:document.body.dataset.themeMode||'night',diaryEntries:S.count,streakDays:S.streak,practiceHours:Math.round(S.minutes/60*10)/10,focusSkill:top&&S.bxp[top.id]>0?top.name:''};
}
function detectThemeIntent(text){
  const value=String(text||'').toLocaleLowerCase(uiLocaleTag());
  if(/\bне\s+(?:надо\s+)?(?:включай|переключай|меняй|меня|делай|ставь)\b/.test(value))return'';
  const command=/(?:включи|переключи|поменяй|смени|сделай|поставь|установи|хочу|давай|можно)/.test(value);
  if(!command)return'';
  if(/(?:дневн\w*|\bдень\b|\bсветл\w*|\bсолнц\w*)/.test(value))return'day';
  if(/(?:ночн\w*|\bночь\b|\bтемн\w*)/.test(value))return'night';
  return'';
}
function mikaChatPrompt(prefill='',menu=false){
  return {expr:'idle',text:'',menu,ask:{chat:true,max:300,placeholder:'Сообщение Мике…',prefill,done:async question=>{
    if(!question)return;
    if(mikaHistoryScope==='unresolved')activateMikaScope('guest');
    const requestScope=mikaHistoryScope;
    const requestedTheme=detectThemeIntent(question);
    const userMessage={role:'user',text:question};mikaHistory.push(userMessage);
    saveMikaHistory();
    $('#line').textContent='Мика думает…';$('#dialog').classList.remove('is-empty');setExpr('think');
    try{
      if(location.protocol==='file:')throw new Error('Открой сайт через сервер, чтобы Мика могла ответить.');
      const preferences=profilePreferences(),shareProgress=preferences.shareProgressWithMika!==false,requestBody={history:mikaHistory.slice(-8),language:['auto','ru','en','kk'].includes(preferences.mikaLanguage)?preferences.mikaLanguage:'auto',shareProgressWithMika:shareProgress};if(shareProgress)requestBody.context=mikaContext();
      const headers={'Content-Type':'application/json'},user=store.auth&&store.auth.currentUser;if(user)headers.Authorization='Bearer '+await user.getIdToken();
      const response=await fetch('/api/mika-chat',{method:'POST',headers,body:JSON.stringify(requestBody)});
      const data=await response.json().catch(()=>({}));
      if(requestScope!==mikaHistoryScope)return;
      if(!response.ok){
        const messages={
          EMAIL_VERIFICATION_REQUIRED:'Подтверди почту по ссылке из письма, чтобы пользоваться ИИ. Если письма нет, открой настройки аккаунта и отправь его ещё раз.',
          AI_NOT_CONFIGURED:'ИИ пока не подключён. Попробуй позже.',
          RATE_LIMITED:'Слишком много сообщений за минуту. Сделай паузу и продолжим.',
          AI_PROVIDER_BUSY:'Сейчас слишком много запросов. Попробуй ещё раз немного позже.',
          AI_KEY_ERROR:'Не удалось подключиться к модели. Попробуй позже.',
          AI_MODEL_ERROR:'Модель сейчас не отвечает. Попробуй позже.',
          AI_TIMEOUT:'Ответ задержался и связь прервалась. Попробуй ещё раз.',
          AI_BAD_RESPONSE:'Не удалось разобрать ответ. Попробуй ещё раз.',
          AI_UPSTREAM_ERROR:'Сервис ответов временно недоступен. Попробуй позже.',
          AI_UNAVAILABLE:'Не получается связаться с сервисом ответов. Проверь подключение.'
        };
        throw new Error(messages[data.error]||'Не удалось получить ответ. Попробуй ещё раз.');
      }
      let reply=typeof data.reply==='string'?data.reply.trim():'';if(!reply)throw new Error('Получен пустой ответ. Попробуй ещё раз.');
      const themeMarker=reply.match(/\[THEME:\s*(DAY|NIGHT)\s*\]/i);
      const returnedTheme=String(data.theme||'').toLowerCase();
      const nextTheme=requestedTheme||(themeMarker?themeMarker[1].toLowerCase():['day','night'].includes(returnedTheme)?returnedTheme:'');
      reply=reply.replace(/\s*\[THEME:\s*(?:DAY|NIGHT)\s*\]\s*/ig,' ').trim();
      if(nextTheme)applyStageTheme(nextTheme);
      const toneExpr=inferMikaExpression(reply);
      let replyExpr=EXPRS.includes(data.expression)?data.expression:(toneExpr||'cool');
      if(replyExpr==='idle'&&toneExpr)replyExpr=toneExpr;
      setExpr(replyExpr);
      mikaHistory.push({role:'model',text:reply,expression:replyExpr});
      saveMikaHistory();
      scene.queue.unshift({expr:replyExpr,text:reply,ask:mikaChatPrompt().ask});
    }catch(err){
      if(requestScope!==mikaHistoryScope)return;
      const messageIndex=mikaHistory.indexOf(userMessage);if(messageIndex!==-1)mikaHistory.splice(messageIndex,1);
      saveMikaHistory();
      toast(err instanceof Error?err.message:'Не удалось получить ответ. Попробуй ещё раз.');
      scene.queue.unshift(mikaChatPrompt(question));
    }
  }}};
}
function talkChat(){const last=mikaHistory[mikaHistory.length-1];if(last&&last.role==='model')play([{expr:EXPRS.includes(last.expression)?last.expression:'cool',text:last.text,ask:mikaChatPrompt().ask}]);else play([mikaChatPrompt(last&&last.role==='user'?last.text:'')]);}

/* ---------- check-in ---------- */
let ciImgs=[],ciBusy=false,ciEditing=null;
const anyOverlay=()=>!$('#ciOverlay').hidden||!$('#skOverlay').hidden||!$('#lbOverlay').hidden;
function closeAll(){
  if(!$('#ciOverlay').hidden&&!ciBusy)closeCheckin();
  $('#skOverlay').hidden=true;$('#lbOverlay').hidden=true;
}
function fillSkillSelect(sel){
  const el=$('#ciSkill');const cur=sel||el.value;el.innerHTML='';
  TREE.forEach(b=>{const g=document.createElement('optgroup');g.label=b.name;
    g.appendChild(new Option(b.name+' (общее)',b.id));
    b.leaves.forEach(l=>{const un=S.unlocked.has(l.id);const o=new Option(l.name+(un?'':' (закрыто)'),l.id);o.disabled=!un;g.appendChild(o);});
    el.appendChild(g);});
  const ok=cur&&SK[cur]&&(SK[cur].isBranch||S.unlocked.has(cur));
  el.value=ok?cur:TREE[0].id;
}
let ciQuest=null,ciEventId=null,ciSubmissionAttempted=false;
function newEventId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'evt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);}
const PENDING_PRACTICE_KEY='airy:pending-practice:v1';
const unavailablePracticeStorage={getItem(){return null;},setItem(){},removeItem(){}};
function practiceStorage(){try{return sessionStorage;}catch{return unavailablePracticeStorage;}}
function practiceFingerprint(form){return AiryPracticeIdempotency.fingerprint({userId:store.accountUser&&store.accountUser.uid||store.auth&&store.auth.currentUser&&store.auth.currentUser.uid||'local',skill:form.skill,text:form.text,minutes:form.min,link:form.link,questId:ciQuest&&ciQuest.id||'',files:ciImgs.map(item=>item.file||{})});}
function practiceEventIdFor(form){
  const fingerprint=practiceFingerprint(form);
  if(ciEventId)return{eventId:ciEventId,fingerprint};
  const intent=AiryPracticeIdempotency.getOrCreateIntent(practiceStorage(),PENDING_PRACTICE_KEY,fingerprint,newEventId);
  ciEventId=intent.eventId;
  return{eventId:ciEventId,fingerprint};
}
function clearPendingPractice(eventId,fingerprint){AiryPracticeIdempotency.clearIntent(practiceStorage(),PENDING_PRACTICE_KEY,eventId,fingerprint);}
let ciCatalogReturnFocus=null;
function renderPracticeCatalog(query=''){
  const list=$('#ciCatalogList'),q=String(query).trim().toLocaleLowerCase('ru');
  const choices=[];
  TREE.forEach(branch=>{
    choices.push({id:branch.id,name:branch.name,branch:branch.name,kind:'Ветка навыка',color:branch.c});
    branch.leaves.forEach(leaf=>{if(S.unlocked.has(leaf.id))choices.push({id:leaf.id,name:leaf.name,branch:branch.name,kind:'Навык',color:branch.c});});
  });
  const filtered=choices.filter(item=>!q||`${item.name} ${item.branch} ${item.kind}`.toLocaleLowerCase('ru').includes(q));
  list.innerHTML=filtered.length?filtered.map(item=>'<button type="button" class="practice-catalog-item" data-catalog-skill="'+esc(item.id)+'" style="--catalog-color:'+esc(item.color)+'"><span class="practice-catalog-mark" aria-hidden="true">✦</span><span><b>'+esc(item.name)+'</b><small>'+esc(item.kind)+' · '+esc(item.branch)+'</small></span><span class="practice-catalog-arrow" aria-hidden="true">↗</span></button>').join(''):'<p class="practice-catalog-empty">Ничего не найдено. Попробуй другое название.</p>';
}
function showPracticeCatalog(){
  $('#ciFields').hidden=true;$('#ciCatalog').hidden=false;$('#ciTitle').textContent='Выбери, что практиковал';$('#ciCatalogSearch').value='';renderPracticeCatalog();
  setTimeout(()=>$('#ciCatalogSearch').focus(),20);
}
function selectCatalogSkill(id){
  if(!SK[id]||(!SK[id].isBranch&&!S.unlocked.has(id)))return;
  $('#ciSkill').value=id;$('#ciSelectedName').textContent=SK[id].name;$('#ciCatalog').hidden=true;$('#ciFields').hidden=false;
  $('#ciTitle').textContent=ciEditing?'Изменить запись':ciQuest?'Квест':'Запись дня';updateReward();setTimeout(()=>$('#ciText').focus(),20);
}
function openCheckin(pre,quest,editing){
  if(!S)return;
  ciQuest=quest||null;ciEditing=editing||null;
  ciEventId=null;ciSubmissionAttempted=false;
  fillSkillSelect((editing&&editing.skill)||pre||(store.proofs[0]&&store.proofs[0].skill)||'cyber');
  $('#ciSelectedName').textContent=SK[$('#ciSkill').value]?.name||'Навык';
  $('#ciTitle').textContent=ciEditing?'Изменить запись':ciQuest?'Квест':'Запись дня';
  $('#ciText').value=ciEditing?ciEditing.text:ciQuest?('Квест «'+ciQuest.title+'»: '):'';$('#ciMin').value=ciEditing?ciEditing.min:Math.max(30,Number(ciQuest&&ciQuest.requiredMinutes)||30);$('#ciLink').value=ciEditing?ciEditing.link||'':'';$('#ciFile').value='';ciImgs=[];renderPrev();$('#ciErr').textContent='';
  $('#ciFile').hidden=!!ciEditing;document.querySelector('label[for="ciFile"]').hidden=!!ciEditing;$('#ciEditNote').hidden=!ciEditing;
  setChips();updateReward();$('#ciSubmit').disabled=false;$('#ciSubmit').textContent=ciEditing?'Сохранить изменения':'Записать в дневник';
  $('#ciOverlay').hidden=false;
  if(!pre&&!quest&&!editing)showPracticeCatalog();else{$('#ciCatalog').hidden=true;$('#ciFields').hidden=false;$('#ciTitle').textContent=ciEditing?'Изменить запись':ciQuest?'Квест':'Запись дня';setTimeout(()=>$('#ciText').focus(),30);}
}
$('#ciCatalogSearch').addEventListener('input',e=>renderPracticeCatalog(e.target.value));
$('#ciCatalogSearch').addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault();});
$('#ciCatalogList').addEventListener('click',e=>{const item=e.target.closest('[data-catalog-skill]');if(item)selectCatalogSkill(item.dataset.catalogSkill);});
$('#ciChangeSkill').addEventListener('click',showPracticeCatalog);
function closeCheckin(){$('#ciOverlay').hidden=true;ciImgs.forEach(i=>URL.revokeObjectURL(i.url));ciImgs=[];ciEditing=null;ciQuest=null;ciEventId=null;ciSubmissionAttempted=false;$('#ciFile').hidden=false;document.querySelector('label[for="ciFile"]').hidden=false;$('#ciEditNote').hidden=true;}
function setChips(){
  const box=$('#ciChips');box.innerHTML='';const cur=+$('#ciMin').value;
  [15,30,45,60,90,120].forEach(m=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=m+' мин';b.setAttribute('aria-pressed',cur===m?'true':'false');
    b.addEventListener('click',()=>{$('#ciMin').value=m;setChips();updateReward();});box.appendChild(b);});
}
function readForm(){
  return{skill:$('#ciSkill').value,text:$('#ciText').value.trim(),min:Math.round(+$('#ciMin').value)||0,link:$('#ciLink').value.trim(),imgs:ciEditing?(ciEditing.imgs||[]).length:ciImgs.length};
}
function updateReward(){
  const f=readForm(),selected=SK[f.skill],difficulty=selected?selected.difficulty||1:1;const base=xpBase({min:Math.max(0,Math.min(f.min,600)),link:!!f.link,imgs:f.imgs,len:f.text.length,difficulty});
  const first=!ciEditing&&!S.byDay.has(dayKey(Date.now()));
  const qb=ciQuest&&['daily','weekly','boss'].includes(ciQuest.period)?10:0;
  const parts=['сложность '+difficulty+'/5 × '+({1:'1,00',2:'1,10',3:'1,20',4:'1,35',5:'1,50'}[difficulty]),'база '+(10+Math.round(Math.min(Math.max(f.min,0),180)/6))];
  if(f.link)parts.push('ссылка +5');if(f.imgs)parts.push('фото +5');if(f.text.length>=60)parts.push('подробный текст +3');
  if(qb)parts.push('квест +10');
  const retainedBonus=ciEditing?(Number(ciEditing.bonus)||0):0,retainedQuest=ciEditing&&ciEditing.quest?10:0;
  if(retainedBonus)parts.push('сохранённый бонус за серию +'+retainedBonus);
  if(retainedQuest)parts.push('бонус выполненного квеста +10');
  let streakBonus=0;
  if(first){const today=dayKey(Date.now()),preview={ts:Date.now(),day:today,skill:f.skill,xp:0,min:0};streakBonus=Math.min(computeStats([preview].concat(store.proofs)).streak,10);if(streakBonus)parts.push('серия +'+streakBonus);}
  const earned=base+qb+retainedBonus+retainedQuest+streakBonus,branch=selected&&TREE.find(item=>item.id===selected.branch);
  if(ciEditing){const fixed=ACH.practiceEditXp(ciEditing.xp,earned),branchShare=selected&&selected.isBranch?fixed:Math.round(fixed*.4);$('#ciXpNote').textContent='Выданный XP сохраняется. Исправления не меняют сумму награды; при смене навыка опыт перейдёт в выбранный навык.';$('#ciReward').textContent='Уже начислено: '+fixed+' XP · '+(selected&&selected.isBranch?'ветка +'+fixed+' XP':'навык +'+fixed+' XP, ветка +'+branchShare+' XP');return;}
  if(selected&&branch){const branchShare=selected.isBranch?earned:Math.round(earned*.4);$('#ciXpNote').textContent=selected.isBranch?'Запись в ветку «'+branch.name+'»: вся награда идёт в её прогресс.':'Навык «'+selected.name+'» получит '+earned+' XP, ветка «'+branch.name+'» — '+branchShare+' XP. Общая награда не уменьшается.';}
  else $('#ciXpNote').textContent='Опыт начисляется в выбранный навык и его ветку.';
  $('#ciReward').textContent=(ciEditing?'После правки: ':'Награда: ')+earned+' XP · '+(selected&&selected.isBranch?'ветка +'+earned+' XP':'навык +'+earned+' XP, ветка +'+Math.round(earned*.4)+' XP')+'  ('+parts.join(', ')+')';
}
function renderPrev(){
  const box=$('#ciPrev');box.innerHTML='';
  ciImgs.forEach((im,i)=>{const d=document.createElement('div');const img=document.createElement('img');img.src=im.url;img.alt='Вложение '+(i+1);
    const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','Убрать вложение');
    x.addEventListener('click',()=>{URL.revokeObjectURL(im.url);ciImgs.splice(i,1);renderPrev();updateReward();});
    d.appendChild(img);d.appendChild(x);box.appendChild(d);});
}
function loadImage(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i);};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('Не удалось открыть изображение'));};i.src=u;});}
async function shrink(file,max,q){
  const img=await loadImage(file);const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(1,Math.round(img.naturalWidth*k)),h=Math.max(1,Math.round(img.naturalHeight*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Не удалось сжать изображение')),'image/jpeg',q));
}
function blobToData(b){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Не удалось прочитать файл'));r.readAsDataURL(b);});}
const maxImgs=()=>3;
$('#ciFile').addEventListener('change',async e=>{
  const files=Array.from(e.target.files||[]);e.target.value='';
  for(const f of files){
    if(ciImgs.length>=maxImgs()){$('#ciErr').textContent='Можно приложить не больше '+maxImgs()+' изображений.';break;}
    if(!/^image\//.test(f.type)){$('#ciErr').textContent='Нужен файл-изображение.';continue;}
    try{const blob=await shrink(f,560,.6);ciImgs.push({blob:blob,file:f,url:URL.createObjectURL(blob)});$('#ciErr').textContent='';}
    catch(err){$('#ciErr').textContent=err.message;}
  }
  renderPrev();updateReward();
});
['ciSkill','ciText','ciMin','ciLink'].forEach(id=>$('#'+id).addEventListener('input',()=>{if(ciSubmissionAttempted&&!ciBusy){ciEventId=null;ciSubmissionAttempted=false;}if(id==='ciMin')setChips();updateReward();}));
$('#ciCancel').addEventListener('click',()=>{if(!ciBusy)closeCheckin();});
$('#ciOverlay').addEventListener('click',e=>{if(e.target.id==='ciOverlay'&&!ciBusy)closeCheckin();});
$('#ciForm').addEventListener('submit',async e=>{
  e.preventDefault();if(ciBusy)return;
  const f=readForm(),err=$('#ciErr');
  if(!SK[f.skill]){err.textContent='Выбери навык.';return;}
  if(f.text.length<3){err.textContent='Опиши коротко, что сделано.';$('#ciText').focus();return;}
  if(f.min<5||f.min>600){err.textContent='Время должно быть от 5 до 600 минут.';$('#ciMin').focus();return;}
  if(ciQuest&&Math.max(15,Number(ciQuest.requiredMinutes)||15)>f.min){err.textContent='Для этого квеста нужно не меньше '+Math.max(15,Number(ciQuest.requiredMinutes)||15)+' минут практики.';$('#ciMin').focus();return;}
  if(ciQuest&&ciQuest.requiresEvidence&&!f.link&&!f.imgs){err.textContent='Для этого квеста приложи ссылку или изображение.';$('#ciLink').focus();return;}
  if(f.link&&!/^https?:\/\/\S+\.\S+/i.test(f.link)){err.textContent='Ссылка должна начинаться с http:// или https://';$('#ciLink').focus();return;}
  err.textContent='';ciBusy=true;const btn=$('#ciSubmit');btn.disabled=true;btn.textContent='Сохраняю…';
  try{
    if(ciEditing){
      const original=ciEditing,imgs=original.imgs||[],recalculated=xpBase({min:f.min,link:!!f.link,imgs:imgs.length,len:f.text.length,difficulty:SK[f.skill].difficulty})+(Number(original.bonus)||0)+(original.quest?10:0),xp=ACH.practiceEditXp(original.xp,recalculated),legacyBranchXp=original.branchXp==null&&original.skill===f.skill,patch={skill:f.skill,text:f.text,min:f.min,link:f.link,xp,branchXp:legacyBranchXp||SK[f.skill].isBranch?xp:Math.round(xp*.4)};
      saveState('saving','Сохраняю…');await store.updateProof(original.id,patch);
      const order={recentBranchIds:promotedBranches(SK[f.skill].branch)};
      try{await store.saveProfile(order);store.profile=Object.assign({},store.profile,order);}catch(orderErr){console.warn('Skill order could not sync',orderErr);}
      renderAll();closeCheckin();saveState('saved','Сохранено');toast('Запись обновлена. Уже начисленный опыт сохранён.');return;
    }
    const imgs=[];
    for(const im of ciImgs)imgs.push({d:await blobToData(im.blob)});
    const now=Date.now();
    const practiceIntent=practiceEventIdFor(f);ciSubmissionAttempted=true;
    ciEventId=practiceIntent.eventId;
    const entry={eventId:ciEventId,ts:now,day:dayKey(now),h:new Date(now).getHours(),skill:f.skill,text:f.text,min:f.min,link:f.link,imgs:imgs,xp:0,bonus:0};
    entry.xp=xpBase({min:f.min,link:!!f.link,imgs:imgs.length,len:f.text.length,difficulty:SK[f.skill].difficulty});
    const quest=ciQuest;
    if(quest){if(['daily','weekly','boss'].includes(quest.period))entry.xp+=10;entry.quest=quest.id;}
    const before=S;
    if(!S.byDay.has(entry.day)){const st=computeStats([entry].concat(store.proofs)).streak;entry.bonus=Math.min(st,10);entry.xp+=entry.bonus;}
    entry.branchXp=SK[f.skill].isBranch?entry.xp:Math.round(entry.xp*.4);
    const after=computeStats([entry].concat(store.proofs));
    saveState('saving','Сохраняю…');const savedEvent=await store.addProof(entry);
    if(savedEvent&&savedEvent.created===false){clearPendingPractice(entry.eventId,practiceIntent.fingerprint);closeCheckin();renderAll();saveState('saved','Уже сохранено');toast('Эта практика уже была сохранена. Повторные XP не начислены.');return;}
    clearPendingPractice(entry.eventId,practiceIntent.fingerprint);
    try{await recordAchievementUnlocks(after,before);}catch(awardError){console.warn('Achievement history could not sync',awardError);}
    if(store.mode==='db'&&!store.proofs.some(p=>p.id===entry.id))store.proofs=[entry].concat(store.proofs);
    const finalStats=computeStats(store.proofs),milestone=window.AiryRpgMilestones.pick(before,finalStats,ACH,Object.fromEntries(TREE.flatMap(branch=>[[branch.id,branch.name],...branch.leaves.map(leaf=>[leaf.id,leaf.name])])));
    if(milestone)fx(milestone.icon,milestone.message,milestone.kind);
    if(store.mode==='db'&&savedEvent.earnedAwards.length)presentServerAchievementAwards(savedEvent.earnedAwards,{showCelebration:false});
    else if(store.mode!=='db')try{notifyNewAchievements(finalStats,before);}catch(notificationError){console.warn('Achievement notification could not be shown',notificationError);}
    const orderPatch={recentBranchIds:promotedBranches(SK[f.skill].branch)};
    store.profile=Object.assign({},store.profile,orderPatch);renderAll();
    try{await store.saveProfile(orderPatch);saveState('saved','Сохранено');}catch(orderError){console.warn('Skill order could not sync',orderError);saveState('error','Практика сохранена · порядок не сохранён');}
    if(quest&&store.mode!=='db'){
      const doneAt=Date.now(),quests=((store.profile&&store.profile.quests)||[]).map(q=>q.id===quest.id?Object.assign({},q,{done:true,completedAt:doneAt}):q),history=Array.isArray(store.profile&&store.profile.questHistory)?store.profile.questHistory.slice():[];
      if(!history.some(item=>item&&item.id===quest.id||item&&item.eventId===entry.eventId))history.push({id:quest.id,eventId:entry.eventId,skill:quest.skill,title:String(quest.title||'Завершённый квест').slice(0,120),period:['daily','weekly','boss','personal'].includes(quest.period)?quest.period:'personal',completedAt:doneAt,xp:['daily','weekly','boss'].includes(quest.period)?10:0,...(Number(quest.requiredMinutes)>0?{requiredMinutes:Math.max(15,Math.min(600,Math.round(Number(quest.requiredMinutes))))}:{}),...(quest.requiresEvidence===true?{requiresEvidence:true}:{})});
      const patch={quests,questHistory:history.slice(-500)};try{await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);}catch(e4){console.warn('Completed quest history could not be saved',e4);}
    }
    closeCheckin();
    const lines=afterLines(entry,before,after,store.mode==='db'?savedEvent.earnedAwards:null);
    if(quest)lines.splice(1,0,{expr:'proud',text:['daily','weekly','boss'].includes(quest.period)?'Квест «'+quest.title+'» выполнен. Бонус +10 XP.':'Квест «'+quest.title+'» выполнен — прогресс сохранён.'});
    show('novel');animatePracticeProgress(before,after,entry);play(lines);
  }catch(e3){saveState('error','Не сохранено');err.textContent=('Не удалось сохранить: '+((e3&&e3.message)||'ошибка')).slice(0,180);}
  finally{ciBusy=false;btn.disabled=false;btn.textContent=ciEditing?'Сохранить изменения':'Записать в дневник';}
});
function afterLines(en,b,a,serverAwards=null){
  const sk=SK[en.skill];
  const lines=[{expr:'happy',text:'Записано: «'+sk.name+'», '+en.min+' мин. Получено '+en.xp+' XP'+(en.bonus?' (из них '+en.bonus+' за серию)':'')+'.'}];
  TREE.forEach(br=>{
    if(a.bl[br.id]&&b.bl[br.id]&&a.bl[br.id].L>b.bl[br.id].L)lines.push({expr:'proud',text:'Ветка «'+br.name+'» поднялась до уровня '+a.bl[br.id].L+'.',fx:['LEVEL UP',br.name+' · '+(window.AiryUiLocale?.t?.('Уровень',locale)||'Уровень')+' '+a.bl[br.id].L]});
    br.leaves.forEach(l=>{
      if(a.sl[l.id]&&b.sl[l.id]&&a.sl[l.id].L>b.sl[l.id].L)lines.push({expr:'happy',text:'Навык «'+l.name+'» теперь на уровне '+a.sl[l.id].L+'.'});
      if(a.unlocked.has(l.id)&&!b.unlocked.has(l.id))lines.push({expr:'surprised',text:'В древе открылся новый навык: «'+l.name+'».'});
    });
  });
  if(a.tl.L>b.tl.L)lines.push({expr:'proud',text:'Общий уровень вырос до '+a.tl.L+'. Теперь твоё звание «'+rankOf(a.tl.L)+'».',fx:['LEVEL '+a.tl.L,rankOf(a.tl.L)]});
  if(Array.isArray(serverAwards))serverAwards.forEach(award=>lines.push({expr:'proud',text:'Новое достижение «'+award.n+'» открыто.',fx:[award.g||'🏆',award.n]}));
  else ACH.forEach(x=>{if(a.ach.indexOf(x.id)>=0&&b.ach.indexOf(x.id)<0)lines.push({expr:'proud',text:'Новая награда «'+x.n+'»: '+x.d.toLowerCase()+'.',fx:[x.g,x.n]});});
  if(a.streak>b.streak&&a.streak>=2)lines.push({expr:'happy',text:'Серия: '+a.streak+' дн. подряд.'});
  return lines;
}

/* ---------- AI tree + quests ---------- */
let aiDraft=null,aiBusy=false;
$('#aiGen').addEventListener('click',async()=>{
  if(aiBusy||store.mode!=='db'||!store.auth?.currentUser)return;
  const goal=$('#aiGoal').value.trim(),note=$('#aiNote');
  if(goal.length<2){note.textContent='Напиши название навыка.';return;}
  aiBusy=true;aiDraft=null;$('#aiPrev').innerHTML='';$('#aiGen').disabled=true;note.textContent='Мика разбирает навык…';
  try{
    const user=store.auth.currentUser,token=await user.getIdToken(),preferences=profilePreferences(),language=['auto','ru','en','kk'].includes(preferences.mikaLanguage)?preferences.mikaLanguage:'auto';
    const response=await fetch('/api/rpg/skills/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({objective:goal,language})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(({OBJECTIVE_REQUIRED:'Опиши навык чуть подробнее.',RATE_LIMITED:'Мика недавно составляла план. Попробуй через минуту.',SERVER_NOT_CONFIGURED:'Генератор навыков пока не настроен на сервере.',AI_NOT_CONFIGURED:'ИИ пока не подключён на сервере.',AI_PROVIDER_BUSY:'Сервис ИИ сейчас занят. Попробуй позже.',AI_TIMEOUT:'Мика слишком долго составляла план. Попробуй ещё раз.',NO_AVAILABLE_SKILLS:'Сначала открой направление в древе.',SKILL_GRAPH_INVALID:'В зависимостях древа есть ошибка.',INVALID_AUTH:'Сеанс истёк. Войди снова.',EMAIL_VERIFICATION_REQUIRED:'Подтверди почту по ссылке из письма, чтобы пользоваться ИИ.',AI_BAD_RESPONSE:'Мика не смогла составить корректный план. Попробуй уточнить навык.'})[result.error]||'Не удалось получить план от Мики. Попробуй позже.');
    const place=result&&typeof result.place==='string'&&TREE.some(b=>b.id===result.place)?result.place:null;
    const name=place?TREE.find(b=>b.id===place).name:(result&&typeof result.branch==='string'?result.branch.trim().slice(0,40):'');
    const known=new Set();TREE.forEach(b=>{known.add(b.name.toLowerCase());b.leaves.forEach(l=>known.add(l.name.toLowerCase()));});
    const sk=(result&&Array.isArray(result.skills)?result.skills:[]).filter(s=>s&&typeof s.name==='string'&&s.name.trim()&&!known.has(s.name.trim().toLowerCase())).slice(0,5).map((s,i)=>({name:s.name.trim().slice(0,40),req:i===0?1:Math.max(1,Math.min(4,Math.round(+s.req)||2)),description:typeof s.description==='string'?s.description.trim().slice(0,180):'',difficulty:Math.max(1,Math.min(5,Math.round(+s.difficulty)||Math.min(5,i+1))),prerequisiteNames:Array.isArray(s.prerequisites)?s.prerequisites.filter(x=>typeof x==='string').map(x=>x.trim().toLocaleLowerCase(language==='ru'?'ru':undefined)).slice(0,5):[],quest:typeof s.quest==='string'?s.quest.trim().slice(0,180):'',success:typeof s.success==='string'?s.success.trim().slice(0,180):'',xp:Math.max(5,Math.min(100,Math.round(+s.xp)||15+i*5)),minutes:Math.max(15,Math.min(600,Math.round(+s.minutes)||30)),materials:Array.isArray(s.materials)?s.materials.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,80)).filter(Boolean).slice(0,3):[],kind:['normal','important','challenge','boss'].includes(s.kind)?s.kind:'normal'}));
    if(!name||sk.length<2)throw {code:'invalid_json'};
    if(!place&&known.has(name.toLowerCase())){note.textContent='Такая ветка уже есть. Уточни название навыка и попробуй снова.';return;}
    aiDraft={place:place,branch:name,goal,skills:sk};
    note.textContent='';
    const box=$('#aiPrev');box.className='ai-prev';
    const h=document.createElement('h4');h.textContent=(place?'Ветка «'+name+'» (уже есть)':'Новая ветка «'+name+'»');box.appendChild(h);
    const ol=document.createElement('ol');
    sk.forEach(s=>{const li=document.createElement('li'),summary=document.createElement('span');summary.textContent=s.name+' · сложность '+s.difficulty+'/5 · '+s.minutes+' мин · '+s.xp+' XP';li.appendChild(summary);if(s.description){const desc=document.createElement('small');desc.textContent=s.description;li.appendChild(desc);}if(s.quest){const sm=document.createElement('small');sm.textContent='Практика: '+s.quest;li.appendChild(sm);}if(s.success){const criterion=document.createElement('small');criterion.textContent='Готово, когда: '+s.success;li.appendChild(criterion);}ol.appendChild(li);});
    box.appendChild(ol);
    const placement=document.createElement('label');placement.className='ai-plan-placement';placement.textContent='Куда добавить план?';
    const choice=document.createElement('select');choice.id='aiPlanPlacement';choice.setAttribute('aria-label','Куда добавить план навыков');
    const suggested=document.createElement('option');suggested.value='suggested';suggested.textContent='В предложенную ветку'+(place?' «'+name+'»':'');
    const separateOption=document.createElement('option');separateOption.value='separate';separateOption.textContent='Создать отдельную ветку цели, сохранив остальные';
    choice.append(suggested,separateOption);
    placement.appendChild(choice);box.appendChild(placement);
    const row=document.createElement('div');row.className='actions';row.style.justifyContent='flex-start';
    const ok=document.createElement('button');ok.type='button';ok.className='btn primary';ok.textContent='Добавить в древо';
    ok.addEventListener('click',addDraft);row.appendChild(ok);box.appendChild(row);
  }catch(e){note.textContent=e instanceof Error?e.message:'Не удалось получить план от Мики. Попробуй позже.';}
  finally{aiBusy=false;$('#aiGen').disabled=false;}
});
async function addDraft(){
  const d=aiDraft;if(!d)return;
  const p=store.profile||{},uid=Date.now().toString(36);
  const separate=$('#aiPlanPlacement')?.value==='separate';
  const visibleBranches=TREE;
  let branchName=d.branch;
  if(separate){
    const base=(d.goal||d.branch).trim().replace(/\s+/g,' ').slice(0,40)||d.branch;
    const occupied=new Set(visibleBranches.map(branch=>branch.name.toLocaleLowerCase('ru')));
    branchName=base;
    if(occupied.has(branchName.toLocaleLowerCase('ru'))){let suffix=2;while(occupied.has((base.slice(0,Math.max(2,37-String(suffix).length))+' '+suffix).toLocaleLowerCase('ru')))suffix++;branchName=base.slice(0,Math.max(2,37-String(suffix).length))+' '+suffix;}
  }
  const bid=!separate&&d.place?d.place:('cb-'+uid);
  const cbOld=p.customBranches||[];
  const cb=bid&&cbOld.some(branch=>branch.id===bid)?cbOld:cbOld.concat([{id:bid,name:branchName,c:HUES[cbOld.length%HUES.length]}]);
  const curL=!separate&&d.place&&S.bl[bid]?S.bl[bid].L:1;
  const ids=d.skills.map((s,i)=>'cl-'+uid+'-'+i),knownByName=new Map();TREE.forEach(branch=>{knownByName.set(branch.name.toLocaleLowerCase('ru'),branch.id);branch.leaves.forEach(leaf=>knownByName.set(leaf.name.toLocaleLowerCase('ru'),leaf.id));});
  const leaves=d.skills.map((s,i)=>({id:ids[i],name:s.name,branch:bid,req:s.req,description:s.description,difficulty:s.difficulty,prerequisites:s.prerequisiteNames.map(name=>{const generatedIndex=d.skills.findIndex(candidate=>candidate.name.toLocaleLowerCase('ru')===name);if(generatedIndex>=0&&generatedIndex<i)return ids[generatedIndex];const existing=knownByName.get(name);return existing&&S.unlocked.has(existing)?existing:null;}).filter(Boolean),success:s.success,xp:s.xp,minutes:s.minutes,materials:s.materials,kind:s.kind,quest:s.quest}));
  const qs=d.skills.map((s,i)=>s.quest?{id:'q'+uid+i,skill:s.req<=curL&&leaves[i].prerequisites.every(id=>S.unlocked.has(id))?leaves[i].id:bid,title:s.quest,requiredMinutes:Math.max(15,s.minutes||15),done:false}:null).filter(Boolean);
  const branchAdditions=cb.length-cbOld.length;
  if(!window.AirySkillNodeLimit.canAdd(p,branchAdditions,leaves.length)){
    $('#aiNote').textContent='В древе достигнут предел в 2 000 пользовательских элементов. Удали ненужные ветки или навыки через архив и попробуй снова.';
    return;
  }
  try{
    const patch={customBranches:cb,customLeaves:(p.customLeaves||[]).concat(leaves),recentBranchIds:promotedBranches(bid,p)};
    saveState('saving','Сохраняю…');await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);
    if(qs.length){try{await mutateQuests('add',{quests:qs});}catch(questError){toast('Навыки сохранены, но квесты не добавились: '+questError.message,'error');}}
    renderAll();saveState('saved','Сохранено');
    aiDraft=null;$('#aiPrev').innerHTML='';$('#aiGoal').value='';
    show('novel');
    toast('Добавлено в ветку «'+branchName+'»: '+d.skills.length+' под-навыка. Квесты ждут в разделе «Квесты».');
  }catch(e){$('#aiNote').textContent='Не удалось сохранить навык.';}
}
function openQuests(msg){
  const qs=((store.profile&&store.profile.quests)||[]),open=qs.filter(q=>!q.done&&SK[q.skill]),done=qs.filter(q=>q.done).length;
  const canGenerate=store.mode==='db'&&!!store.auth?.currentUser;
  let tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const defaultDue=dayKey(tomorrow.getTime());
  let h='<h2 id="skTitle">Квесты</h2><p class="sub">Ежедневные и недельные задания обновляются по календарю. Для личного задания можно назначить срок.</p><div class="quest-board-summary"><span>Выполнено <b>'+done+'</b></span><span>Активно <b>'+open.length+'</b></span></div>';
  if(!open.length)h+='<div class="empty" style="margin-top:12px"><b>Активных квестов нет</b>'+(canGenerate?'Мика подберёт задания под доступные навыки.':store.mode==='db'?'Войди в аккаунт, чтобы попросить Мику подобрать задания.':'Квесты появятся после входа в аккаунт.')+'</div>';
  open.slice().sort((a,b)=>({daily:0,weekly:1,boss:2}[a.period]??3)-({daily:0,weekly:1,boss:2}[b.period]??3)).forEach(q=>{
    const sk=SK[q.skill],period=q.period==='daily'?'Сегодня':q.period==='weekly'?'На этой неделе':q.period==='boss'?'Босс · на этой неделе':'Личный квест';
    const requirements=[`от ${Math.max(15,Number(q.requiredMinutes)||15)} мин`,q.requiresEvidence?'с ссылкой или фото':''].filter(Boolean).join(' · ');
    const dateValue=Number(q.dueAt)?dayKey(q.dueAt):'',overdue=q.period==='personal'&&Number(q.dueAt)>0&&Date.now()>Number(q.dueAt)+12*60*60*1000;
    const dueLabel=overdue?'Срок прошёл · выбери новую дату':'Срок';
    h+='<div class="quest'+(overdue?' is-overdue':'')+'" style="--c:'+esc(sk.c)+'"><div class="q-t"><span class="quest-period">'+period+'</span>'+esc(q.title)+'<small>'+esc(sk.name)+(requirements?' · '+esc(requirements):'')+'</small>'+(q.period==='personal'?'<label class="quest-due-label">'+dueLabel+' <input type="date" data-qdue="'+esc(q.id)+'" min="'+dayKey(Date.now())+'" max="'+dayKey(Date.now()+366*86400000)+'" value="'+esc(dateValue)+'" aria-label="Срок квеста '+esc(q.title)+'"></label>':'')+'</div><button type="button" class="btn small primary" data-qgo="'+esc(q.id)+'"'+(overdue?' disabled title="Сначала выбери новую дату срока"':'')+'>'+(overdue?'Перенеси срок':'Выполнить')+'</button>'+(q.period==='personal'?'<button type="button" class="btn small" data-qrm="'+esc(q.id)+'" aria-label="Убрать личный квест">Убрать</button>':'')+'</div>';
  });
  if(canGenerate)h+='<label class="quest-default-due">Срок для новых заданий от Мики<input type="date" id="questDefaultDue" min="'+dayKey(Date.now())+'" max="'+dayKey(Date.now()+366*86400000)+'" value="'+defaultDue+'"></label>';
  h+='<p class="err" id="qErr" role="alert">'+esc(msg||'')+'</p><div class="actions"><button type="button" class="btn" id="qClose">Закрыть</button>'+(canGenerate?'<button type="button" class="btn primary" id="qGen">Новые квесты от Мики</button>':'')+'</div>';
  $('#skSheet').innerHTML=h;$('#skOverlay').hidden=false;
}
$('#skSheet').addEventListener('click',async e=>{
  const go=e.target.closest('[data-qgo]'),rm=e.target.closest('[data-qrm]');
  if(go){const q=((store.profile.quests)||[]).find(x=>x.id===go.dataset.qgo);if(q){$('#skOverlay').hidden=true;show('novel');openCheckin(q.skill,q);}return;}
  if(rm){rm.disabled=true;try{await mutateQuests('remove',{id:rm.dataset.qrm});openQuests();}catch(e2){openQuests(e2.message);}return;}
  if(e.target.id==='qClose'){$('#skOverlay').hidden=true;return;}
  if(e.target.id==='qGen'&&store.mode==='db'&&store.auth?.currentUser){
    const btn=e.target;btn.disabled=true;btn.textContent='Мика думает…';
    const open=((store.profile.quests)||[]).filter(q=>!q.done&&SK[q.skill]);
    if(open.length>=8){openQuests('Сначала выполни или убери несколько старых квестов.');return;}
    try{
      const user=store.auth.currentUser,token=await user.getIdToken(),preferences=profilePreferences(),language=preferences.mikaLanguage==='auto'?'ru':preferences.mikaLanguage;
      const response=await fetch('/api/rpg/quests/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({language})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(({RATE_LIMITED:'Мика уже подбирала задания недавно. Попробуй через минуту.',SERVER_NOT_CONFIGURED:'Генератор квестов пока не настроен на сервере.',AI_NOT_CONFIGURED:'ИИ-квесты пока не настроены на сервере.',AI_PROVIDER_BUSY:'Сервис ИИ сейчас занят. Попробуй чуть позже.',AI_TIMEOUT:'Мика слишком долго подбирала задания. Попробуй ещё раз.',NO_AVAILABLE_SKILLS:'Сначала открой хотя бы один навык в древе.',SKILL_GRAPH_INVALID:'В зависимостях древа есть ошибка.',INVALID_AUTH:'Сеанс истёк. Войди снова.',EMAIL_VERIFICATION_REQUIRED:'Подтверди почту по ссылке из письма, чтобы пользоваться ИИ.'})[result.error]||'Не удалось получить квесты от Мики. Попробуй позже.');
      const add=Array.isArray(result.tasks)?result.tasks.filter(x=>x&&typeof x.skill==='string'&&typeof x.title==='string'&&SK[x.skill]&&(SK[x.skill].isBranch||S.unlocked.has(x.skill))).slice(0,Math.max(0,8-open.length)).map(x=>({skill:x.skill,title:x.title.trim().slice(0,120),requiredMinutes:Math.max(20,Math.min(40,Number(x.requiredMinutes)||25))})):[];
      if(!add.length)throw new Error('Мика не смогла подобрать подходящие задания. Попробуй ещё раз.');
      const dueInput=$('#questDefaultDue'),dueDate=dueInput?.value;
      if(!dueDate)throw new Error('Выбери срок для новых заданий.');
      const [dueYear,dueMonth,dueDay]=dueDate.split('-').map(Number),dueAt=new Date(dueYear,dueMonth-1,dueDay,12,0,0,0).getTime();
      await mutateQuests('add',{quests:add.map(task=>Object.assign({},task,{dueAt}))});
      openQuests();
    }catch(err){openQuests(err.message||'Не удалось получить квесты от Мики. Попробуй позже.');}
  }
});
$('#skSheet').addEventListener('change',async e=>{
  const input=e.target.closest('[data-qdue]');if(!input)return;
  if(!input.value){openQuests();return;}
  const [year,month,day]=input.value.split('-').map(Number),dueAt=new Date(year,month-1,day,12,0,0,0).getTime();input.disabled=true;
  try{await mutateQuests('reschedule',{id:input.dataset.qdue,dueAt});renderAll();openQuests('Срок сохранён.');}
  catch(error){openQuests(error.message||'Не удалось изменить срок.');}
});

/* ---------- skill sheet ---------- */
function openSheet(id){
  const sk=SK[id];if(!sk)return;
  const info=sk.isBranch?S.bl[id]:S.sl[id];const un=sk.isBranch||S.unlocked.has(id),favorite=Array.isArray(store.profile?.favoriteSkills)&&store.profile.favoriteSkills.includes(id);
  const recent=store.proofs.filter(p=>p.skill===id||(sk.isBranch&&SK[p.skill]&&SK[p.skill].branch===id)).slice(0,4);
  let h='<h2 id="skTitle" style="color:'+esc(sk.c)+'">'+esc(sk.name)+'</h2>';
  if(un){
    h+='<p class="sub"><span class="kr">Уровень</span> '+info.L+(info.L>=10?' (максимум)':' · '+num(info.xp-info.lo)+' / '+num(info.hi-info.lo)+' XP до следующего')+'</p>';
    h+='<div class="bar" style="margin:12px 0"><i style="width:'+Math.round(info.frac*100)+'%;background:'+esc(sk.c)+'"></i></div>';
    if(!sk.isBranch&&sk.custom){h+='<div class="skill-spec"><p><b>Цель:</b> '+esc(sk.description||'Освоить навык на практике.')+'</p><p><b>Сложность:</b> '+sk.difficulty+'/5 · <b>Время:</b> около '+sk.minutes+' мин · <b>Награда:</b> '+sk.xp+' XP · <b>Тип:</b> '+esc(({normal:'Навык',important:'Ключевой узел',challenge:'Испытание',boss:'Boss Challenge'})[sk.kind]||'Навык')+'</p>'+(sk.success?'<p><b>Критерий готовности:</b> '+esc(sk.success)+'</p>':'')+(sk.quest?'<p><b>Практика:</b> '+esc(sk.quest)+'</p>':'')+(sk.materials.length?'<p><b>Материалы:</b> '+sk.materials.map(esc).join(' · ')+'</p>':'')+(sk.prerequisites.length?'<p><b>Предварительно:</b> '+sk.prerequisites.map(id=>esc(SK[id]?.name||id)).join(' · ')+'</p>':'')+'</div>';}
    h+=recent.length?'<label>Последние записи</label>'+recent.map(p=>'<p class="note" style="margin:6px 0">'+esc(new Date(p.ts).toLocaleDateString(uiLocaleTag(),{day:'numeric',month:'short'}))+': '+esc(p.text.length>90?p.text.slice(0,90)+'…':p.text)+'</p>').join(''):'<p class="note">Записей по этому навыку пока нет.</p>';
  }else{
    const br=SK[sk.branch];
    const prereqs=Array.isArray(sk.prerequisites)?sk.prerequisites.filter(id=>(S.xpBy[id]||0)<=0):[];
    h+='<p class="sub">Закрыто. Откроется, когда ветка «'+esc(br.name)+'» достигнет уровня '+sk.req+' (сейчас '+S.bl[sk.branch].L+').'+(prereqs.length?' Ещё нужно завершить: '+prereqs.map(id=>esc(SK[id]?.name||id)).join(', ')+'.':'')+'</p>';
  }
  h+='<div class="actions" style="margin-top:16px"><button type="button" class="btn" id="skFavorite" aria-pressed="'+favorite+'">'+(favorite?'★ Убрать из избранного':'☆ В избранное')+'</button><button type="button" class="btn" id="skClose">Закрыть</button><button type="button" class="btn" id="skHistory">Весь дневник по навыку</button><button type="button" class="btn" id="skEdit">Переименовать</button><button type="button" class="btn danger" id="skDelete">Удалить из древа</button>'+(un?'<button type="button" class="btn primary" id="skGo">＋ Записать практику</button>':'')+'</div>';
  $('#skSheet').innerHTML=h;$('#skOverlay').hidden=false;
  $('#skFavorite').addEventListener('click',async event=>{const button=event.currentTarget,current=Array.isArray(store.profile?.favoriteSkills)?store.profile.favoriteSkills:[],next=current.includes(id)?current.filter(item=>item!==id):current.concat(id);button.disabled=true;try{await store.saveProfile({favoriteSkills:next});store.profile=Object.assign({},store.profile,{favoriteSkills:next});renderAll();const isNowFavorite=next.includes(id);button.textContent=isNowFavorite?'★ Убрать из избранного':'☆ В избранное';button.setAttribute('aria-pressed',String(isNowFavorite));toast(isNowFavorite?'Навык добавлен в избранное.':'Навык убран из избранного.');}catch{toast('Не удалось сохранить избранные навыки.','error');}finally{button.disabled=false;}});
  $('#skClose').addEventListener('click',()=>{$('#skOverlay').hidden=true;});
  $('#skEdit').addEventListener('click',()=>editSkill(id));
  $('#skDelete').addEventListener('click',()=>removeSkill(id));
  $('#skHistory').addEventListener('click',()=>{$('#skOverlay').hidden=true;openSkillHistory(id);});
  const go=$('#skGo');if(go)go.addEventListener('click',()=>{$('#skOverlay').hidden=true;openCheckin(id);});
}
function openSkillHistory(id){
  const sk=SK[id];if(!sk)return;
  jFilter=sk.isBranch?id:sk.branch;jSkillFilter=sk.isBranch?'all':id;jDateFrom='';jDateTo='';
  show('journal');renderJournal();
}
function editSkill(id){
  const sk=SK[id];if(!sk)return;
  $('#skSheet').innerHTML='<h2>Изменить навык</h2><p class="sub">История и опыт сохранятся под новым названием.</p><label for="skillNameEdit">Название</label><input id="skillNameEdit" type="text" maxlength="40" value="'+esc(sk.name)+'"><p class="err" id="skillEditErr" role="alert"></p><div class="actions"><button type="button" class="btn" id="skillEditCancel">Отмена</button><button type="button" class="btn primary" id="skillEditSave">Сохранить</button></div>';
  $('#skillNameEdit').focus();
  $('#skillEditCancel').addEventListener('click',()=>openSheet(id));
  $('#skillEditSave').addEventListener('click',async()=>{
    const name=$('#skillNameEdit').value.trim(),err=$('#skillEditErr');
    if(name.length<2){err.textContent='Название должно быть не короче 2 символов.';return;}
    const allNames=TREE.flatMap(b=>[{id:b.id,name:b.name},...b.leaves.map(l=>({id:l.id,name:l.name}))]);
    if(allNames.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase())){err.textContent='Такое название уже используется.';return;}
    const edits=Object.assign({},(store.profile||{}).skillEdits||{}, {[id]:{name}});
    try{const patch={skillEdits:edits,recentBranchIds:promotedBranches(sk.branch)};saveState('saving','Сохраняю…');await store.saveProfile(patch);saveState('saved','Сохранено');store.profile=Object.assign({},store.profile,patch);renderAll();$('#skOverlay').hidden=true;show('novel');toast('Название навыка обновлено.');}
    catch(e){err.textContent='Не удалось сохранить изменения.';}
  });
}
async function removeSkill(id){
  const sk=SK[id];if(!sk)return;
  const ids=sk.isBranch?[id,...(TREE.find(b=>b.id===id)?.leaves||[]).map(l=>l.id)]:[id];
  const message=sk.isBranch?'Удалить ветку «'+sk.name+'» и все её навыки из древа? Существующие записи останутся в дневнике.':'Удалить «'+sk.name+'» из древа? Существующие записи останутся в дневнике.';
  if(!window.confirm(message))return;
  const p=store.profile||{},hidden=[...new Set([...(p.hiddenSkills||[]),...ids])];
  try{await mutateQuests('remove-for-skills',{skillIds:ids,profilePatch:{hiddenSkills:hidden}});$('#skOverlay').hidden=true;renderAll();toast('Навык удалён из древа. Записи сохранены в дневнике.');}
  catch(e){toast('Не удалось удалить навык. Попробуй ещё раз.');}
}
$('#skOverlay').addEventListener('click',e=>{if(e.target.id==='skOverlay')$('#skOverlay').hidden=true;});
$('#lbOverlay').addEventListener('click',()=>{$('#lbOverlay').hidden=true;});

/* ---------- tree view ---------- */
function nodeEl(sk,info,locked,isBranch){
  const tr=window.AiryUiLocale?.t||((text)=>text);
  const b=document.createElement('button');b.type='button';const isFavorite=Array.isArray(store.profile?.favoriteSkills)&&store.profile.favoriteSkills.includes(sk.id);b.className='node '+(isBranch?'branch':'leaf')+(locked?' locked':'')+(isFavorite?' is-favorite':'');b.dataset.id=sk.id;
  const name=tr(sk.name),lockedLabel=tr('закрыто'),levelLabel=tr('Уровень'),xpTxt=locked?tr('нужен уровень ветки')+' '+num(sk.req):(num(info.xp)+' XP');
  b.innerHTML='<span class="n-top"><span class="n-name">'+esc(name)+'</span><span class="n-lvl">'+(locked?lockedLabel:levelLabel+' '+info.L)+'</span></span><span class="n-bar"><i style="width:'+(locked?0:Math.round(info.frac*100))+'%"></i></span><span class="n-xp">'+esc(xpTxt)+'</span>';
  b.setAttribute('aria-label',name+(locked?', '+lockedLabel:', '+levelLabel+' '+info.L)+(isFavorite?', '+tr('в избранном'):''));
  return b;
}
function updateTreeFilter(){
  const query=$('#treeSearch').value.trim().toLocaleLowerCase(uiLocaleTag());
  const groups=$$('.grp',$('#tree')),favorites=new Set(Array.isArray(store.profile?.favoriteSkills)?store.profile.favoriteSkills:[]);let count=0,favoriteCount=0;
  groups.forEach(g=>{
    const branch=g.querySelector('.node.branch'),leaves=$$('.node.leaf',g);
    const branchFav=favorites.has(branch.dataset.id),branchMatch=!!query&&branch.textContent.toLocaleLowerCase(uiLocaleTag()).includes(query);
    let leafMatches=0;
    leaves.forEach(leaf=>{
      const matches=(!treeFavoritesOnly||favorites.has(leaf.dataset.id))&&(!query||branchMatch||leaf.textContent.toLocaleLowerCase(uiLocaleTag()).includes(query));
      leaf.hidden=!matches;if(matches){leafMatches++;if(favorites.has(leaf.dataset.id))favoriteCount++;}
    });
    branch.hidden=(treeFavoritesOnly&&!branchFav)&&(!leafMatches||!!query&&!branchMatch);
    const branchVisible=!branch.hidden&&(!query||branchMatch||leafMatches>0);
    if(branchVisible&&branchFav)favoriteCount++;
    g.hidden=!branchVisible&&!leafMatches;
    count+=Number(branchVisible)+leafMatches;
  });
  $('#tree').hidden=(!!query||treeFavoritesOnly)&&!count;
  $('#treeSearchClear').hidden=!query;
  const toggle=$('#treeFavoritesToggle');toggle.setAttribute('aria-pressed',String(treeFavoritesOnly));toggle.textContent=(treeFavoritesOnly?'★':'☆')+' Избранное';toggle.classList.toggle('is-active',treeFavoritesOnly);
  const tr=window.AiryUiLocale?.t||((text)=>text);
  $('#treeSearchStatus').textContent=treeFavoritesOnly?(count?tr(`Избранных навыков: ${favoriteCount}`):tr('Добавь навыки в избранное через их карточку')):query?(count?tr(`Найдено навыков: ${count}`):tr('Совпадений нет')):tr(`Навыков в древе: ${count}`);
  $('#treeEmpty').hidden=count>0;
  scheduleDrawEdges();
}
$('#treeFavoritesToggle').addEventListener('click',()=>{treeFavoritesOnly=!treeFavoritesOnly;updateTreeFilter();});
$('#treeSearch').addEventListener('input',updateTreeFilter);
$('#treeSearch').addEventListener('keydown',e=>{if(e.key==='Escape'&&e.currentTarget.value){e.preventDefault();e.currentTarget.value='';updateTreeFilter();}});
$('#treeSearchClear').addEventListener('click',()=>{$('#treeSearch').value='';updateTreeFilter();$('#treeSearch').focus();});
const treeCamera={scale:1};
let treeGroupObserver=null;
function applyTreeCamera(){
  $('#treeCamera').style.zoom=String(treeCamera.scale);
  $('#treeZoomLabel').textContent=Math.round(treeCamera.scale*100)+'%';
  scheduleDrawEdges();
}
function setTreeZoom(scale){
  treeCamera.scale=Math.max(.65,Math.min(2.2,scale));applyTreeCamera();
}
$('#treeZoomOut').addEventListener('click',()=>setTreeZoom(treeCamera.scale-.15));
$('#treeZoomIn').addEventListener('click',()=>setTreeZoom(treeCamera.scale+.15));
$('#treeZoomReset').addEventListener('click',()=>{treeCamera.scale=1;applyTreeCamera();});
function renderTree(){
  const root=$('#tree');root.innerHTML='';
  if(treeGroupObserver){treeGroupObserver.disconnect();treeGroupObserver=null;}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','edges');svg.id='edges';svg.setAttribute('aria-hidden','true');root.appendChild(svg);
  const rn=document.createElement('div');rn.className='root-node';rn.id='rootNode';rn.innerHTML='<b>'+S.tl.L+'</b><span class="kr">Уровень</span>';root.appendChild(rn);
  const gs=document.createElement('div');gs.className='groups';
  TREE.forEach(br=>{
    const g=document.createElement('div');g.className='grp';g.style.setProperty('--c',br.c);g.dataset.b=br.id;
    g.appendChild(nodeEl(SK[br.id],S.bl[br.id],false,true));
    const lv2=document.createElement('div');lv2.className='leaves';
    br.leaves.forEach(l=>lv2.appendChild(nodeEl(SK[l.id],S.sl[l.id],!S.unlocked.has(l.id),false)));
    if(!br.leaves.length){const hint=document.createElement('span');hint.className='n-xp';hint.textContent='Добавь навык ниже';lv2.appendChild(hint);}
    g.appendChild(lv2);gs.appendChild(g);
  });
  root.appendChild(gs);
  const nodeCount=TREE.reduce((total,branch)=>total+1+branch.leaves.length,0);
  root.dataset.largeTree=String(nodeCount>80);
  const treeViewport=$('#treeViewport');
  if(window.IntersectionObserver){
    treeGroupObserver=new IntersectionObserver(entries=>{
      let changed=false;
      entries.forEach(entry=>{
        const next=entry.isIntersecting?'true':'false';
        if(entry.target.dataset.viewportVisible!==next){entry.target.dataset.viewportVisible=next;changed=true;}
      });
      if(changed)scheduleDrawEdges();
    },{root:treeViewport,rootMargin:'160px 0px',threshold:0});
    $$('.grp',gs).forEach(group=>{group.dataset.viewportVisible='false';treeGroupObserver.observe(group);});
  }
  applyTreeCamera();
  const sel=$('#newParent');const cur=sel.value;sel.innerHTML='';
  TREE.forEach(b=>sel.appendChild(new Option(b.name,b.id)));sel.appendChild(new Option('Новая ветка',' new'));
  if(cur&&Array.from(sel.options).some(o=>o.value===cur))sel.value=cur;
  const canUseAiTree=store.mode==='db'&&!!store.auth?.currentUser;$('#aiPanel').hidden=!canUseAiTree;$('#manualPanel').hidden=false;
  updateTreeFilter();
}
let edgeDrawFrame=0,edgeBatchFrame=0,edgeDrawGeneration=0;
function scheduleDrawEdges(){
  edgeDrawGeneration++;
  if(edgeBatchFrame){cancelAnimationFrame(edgeBatchFrame);edgeBatchFrame=0;}
  if(edgeDrawFrame)return;
  edgeDrawFrame=requestAnimationFrame(()=>{edgeDrawFrame=0;drawEdges(edgeDrawGeneration);});
}
function drawEdges(generation=edgeDrawGeneration){
  const root=$('#tree'),svg=$('#edges');if(!root||!svg||root.hidden||$('#view-tree').hidden)return;
  const rn=$('#rootNode');if(!rn)return;
  const R=root.getBoundingClientRect(),scale=treeCamera.scale||1,width=root.offsetWidth,height=root.offsetHeight,rr=rn.getBoundingClientRect();
  const allGroups=$$('.grp',root),groups=treeGroupObserver?allGroups.filter(group=>group.dataset.viewportVisible==='true'):allGroups;let groupIndex=0,activeLeaves=null,leafIndex=0,activeBranchRect=null,activeColor='#fff';
  svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.replaceChildren();
  function path(target,a,b,color,dash){
    const x1=(a.right-R.left)/scale,y1=(a.top+a.height/2-R.top)/scale,x2=(b.left-R.left)/scale,y2=(b.top+b.height/2-R.top)/scale,dx=(x2-x1)/2;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d','M'+x1+' '+y1+'C'+(x1+dx)+' '+y1+','+(x2-dx)+' '+y2+','+x2+' '+y2);
    p.setAttribute('stroke',color);p.setAttribute('opacity',dash?'.3':'.75');p.style.setProperty('--edge-opacity',dash?'.3':'.75');if(dash)p.setAttribute('stroke-dasharray','4 5');target.appendChild(p);
  }
  function drawBatch(){
    if(generation!==edgeDrawGeneration||!svg.isConnected)return;
    let budget=96;const fragment=document.createDocumentFragment();
    while(budget>0){
      if(!activeLeaves){
        if(groupIndex>=groups.length)break;
        const group=groups[groupIndex++];if(group.hidden)continue;
        const branch=group.querySelector('.node.branch');if(!branch)continue;
        activeColor=getComputedStyle(group).getPropertyValue('--c').trim()||'#fff';activeBranchRect=branch.hidden?rr:branch.getBoundingClientRect();
        if(!branch.hidden){path(fragment,rr,activeBranchRect,activeColor,false);budget--;}
        activeLeaves=group.querySelectorAll('.node.leaf');leafIndex=0;
        if(!activeLeaves.length)activeLeaves=null;
        continue;
      }
      if(leafIndex>=activeLeaves.length){activeLeaves=null;continue;}
      const leaf=activeLeaves[leafIndex++];budget--;
      if(!leaf.hidden)path(fragment,activeBranchRect,leaf.getBoundingClientRect(),activeColor,leaf.classList.contains('locked'));
    }
    svg.appendChild(fragment);
    if(groupIndex<groups.length||activeLeaves){edgeBatchFrame=requestAnimationFrame(()=>{edgeBatchFrame=0;drawBatch();});}
  }
  drawBatch();
}
if(window.ResizeObserver){const treeObserver=new ResizeObserver(()=>scheduleDrawEdges());treeObserver.observe($('#view-tree'));treeObserver.observe($('#treeViewport'));treeObserver.observe($('#tree'));}
window.addEventListener('resize',()=>{scheduleDrawEdges();measure();syncNavIndicator(activeTab);});
$('#tree').addEventListener('click',e=>{const n=e.target.closest('.node');if(n)openSheet(n.dataset.id);});
$('#newAdd').addEventListener('click',async()=>{
  const name=$('#newName').value.trim(),par=$('#newParent').value,err=$('#newErr');
  if(name.length<2){err.textContent='Название должно быть не короче 2 символов.';return;}
  if(TREE.some(b=>b.name.toLowerCase()===name.toLowerCase()||b.leaves.some(l=>l.name.toLowerCase()===name.toLowerCase()))){err.textContent='Такой навык уже есть.';return;}
  err.textContent='';const uid='c'+Date.now().toString(36);
  const p=store.profile||{};
  const addsBranch=$('#newParent').value===' new';
  if(!window.AirySkillNodeLimit.canAdd(p,addsBranch?1:0,addsBranch?0:1)){
    err.textContent='В древе достигнут предел в 2 000 пользовательских элементов. Удали ненужные ветки или навыки через архив и попробуй снова.';return;
  }
  try{
    let patch;if(par===' new'){const branchId='cb-'+uid,cb=(p.customBranches||[]).concat([{id:branchId,name:name,c:HUES[(p.customBranches||[]).length%HUES.length]}]);patch={customBranches:cb,recentBranchIds:promotedBranches(branchId,p)};}
    else{const cl=(p.customLeaves||[]).concat([{id:'cl-'+uid,name:name,branch:par}]);patch={customLeaves:cl,recentBranchIds:promotedBranches(par,p)};}
    saveState('saving','Сохраняю…');await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);renderAll();saveState('saved','Сохранено');$('#newName').value='';show('novel');toast('Навык «'+name+'» добавлен в древо.');
  }catch(e){err.textContent='Не удалось сохранить навык.';}
});

/* ---------- journal ---------- */
function renderTaskCalendar(){
  const grid=$('#taskCalendarGrid'),agenda=$('#taskCalendarAgenda');if(!grid||!agenda)return;
  const locale=window.AiryUiLocale?.getLocale?.()||'ru',tr=window.AiryUiLocale?.t||((text)=>text),taskCount=count=>countLabel(count,['задача','задачи','задач'],['task','tasks'],'тапсырма');
  const quests=Array.isArray(store.profile?.quests)?store.profile.quests:[],keyFor=q=>{
    const due=Number(q.dueAt);if(q.period==='personal')return Number.isFinite(due)&&due>0?dayKey(due):'';
    const expiry=Number(q.expiresAt);return Number.isFinite(expiry)&&expiry>0?dayKey(expiry-(q.period==='daily'?1:0)):'';
  };
  const dated=quests.map(q=>({q,key:keyFor(q)})).filter(row=>row.key),monthStart=new Date(taskCalendarMonth.getFullYear(),taskCalendarMonth.getMonth(),1),monthEnd=new Date(taskCalendarMonth.getFullYear(),taskCalendarMonth.getMonth()+1,0),offset=(monthStart.getDay()+6)%7,start=new Date(monthStart);start.setDate(1-offset);
  $('#taskCalendarMonth').textContent=taskCalendarMonth.toLocaleDateString(uiLocaleTag(),{month:'long',year:'numeric'});
  const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];let html=weekdays.map(day=>'<span class="task-calendar-weekday" role="columnheader">'+tr(day,locale)+'</span>').join('');
  const today=dayKey(Date.now());
  for(let index=0;index<42;index++){
    const date=new Date(start);date.setDate(start.getDate()+index);const key=dayKey(date.getTime()),items=dated.filter(row=>row.key===key),outside=date.getMonth()!==taskCalendarMonth.getMonth();
    html+='<button type="button" role="gridcell" class="task-calendar-day'+(outside?' outside':'')+(key===today?' today':'')+(key===taskCalendarSelected?' selected':'')+(items.length?' has-tasks':'')+'" data-task-day="'+key+'" aria-label="'+esc(date.toLocaleDateString(uiLocaleTag(),{day:'numeric',month:'long',year:'numeric'})+(items.length?`, ${taskCount(items.length)}`:''))+'" aria-pressed="'+(key===taskCalendarSelected)+'"><span>'+date.getDate()+'</span>'+(items.length?'<i>'+Math.min(items.length,9)+(items.length>9?'+':'')+'</i>':'')+'</button>';
  }
  grid.innerHTML=html;
  const selected=dated.filter(row=>row.key===taskCalendarSelected),unscheduled=quests.filter(q=>q.period==='personal'&&!q.done&&!keyFor(q));
  const title=taskCalendarSelected===today?'Сегодня':new Date(taskCalendarSelected+'T12:00:00').toLocaleDateString(uiLocaleTag(),{weekday:'long',day:'numeric',month:'long'});
  const itemHtml=selected.length?selected.map(({q})=>{const skill=SK[q.skill]||{name:'Навык',c:'#a98acb'},done=q.done===true,period=q.period==='daily'?'Ежедневный':q.period==='weekly'?'Недельный':q.period==='boss'?'Испытание':'Личный';return '<article class="task-agenda-row'+(done?' done':'')+'" style="--c:'+esc(skill.c)+'"><span class="task-agenda-mark" aria-hidden="true">'+(done?'✓':'✦')+'</span><div><b>'+esc(tr(q.title,locale))+'</b><small>'+esc(tr(skill.name,locale))+' · '+tr(period,locale)+(done?' · '+tr('выполнено',locale):'')+'</small></div></article>';}).join(''):'<p class="task-calendar-empty">'+tr('На этот день задач нет. Выбери дату со значком или открой «Квесты».',locale)+'</p>';
  const unscheduledText=locale==='en'?`No due date: ${taskCount(unscheduled.length)} personal quests · set a date in Quests.`:locale==='kk'?`Мерзімі жоқ: ${taskCount(unscheduled.length)} жеке квест · күнді «Квесттер» бөлімінде белгіле.`:`Без срока: ${taskCount(unscheduled.length)} личный квест · назначь дату в разделе «Квесты».`;
  agenda.innerHTML='<div class="task-agenda-title"><b>'+esc(tr(title,locale))+'</b><span>'+taskCount(selected.length)+'</span></div>'+itemHtml+(unscheduled.length?'<p class="task-calendar-unscheduled">'+unscheduledText+'</p>':'');
}
function renderJournal(){
  const wordForCount=(count,one,few,many,enOne,enMany,kk)=>{const locale=window.AiryUiLocale?.getLocale?.()||'ru';if(locale==='en')return Math.abs(Number(count))===1?(enOne||one):(enMany||many);if(locale==='kk')return kk||many;const n=Math.abs(Number(count)||0)%100,last=n%10,index=n>=11&&n<=14?2:last===1?0:last>=2&&last<=4?1:2;return [one,few,many][index];};
  const hrs=Math.round(S.minutes/6)/10;
  $('#stats').innerHTML=[['Записей',num(S.count)],['Часов практики',new Intl.NumberFormat(uiLocaleTag(),{maximumFractionDigits:1}).format(hrs)],['Опыта всего',num(S.total)],['Рекорд серии',S.best+' дн.']].map(x=>'<div class="stat"><b>'+esc(x[1])+'</b><span>'+esc(x[0])+'</span></div>').join('');
  const today=new Date();today.setHours(12,0,0,0);const todayKey=dayKey(today.getTime()),weekStart=new Date(today);weekStart.setDate(today.getDate()-(today.getDay()+6)%7);const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
  renderTaskCalendar();
  const fromKey=dayKey(weekStart.getTime()),toKey=dayKey(weekEnd.getTime());
  const summary=store.mode==='db'&&store.summary?.version===7?store.summary:null;
  const weekItems=store.proofs.filter(p=>{const date=p.day||dayKey(p.ts);return date>=fromKey&&date<=todayKey;});
  const weekByDay=new Map();let weekMinutes=0,weekXp=0,weekCount=0;
  if(summary){Object.entries(summary.dayCounts||{}).forEach(([key,count])=>{if(key>=fromKey&&key<=todayKey){const n=Math.max(0,Number(count)||0),xp=Math.max(0,Number(summary.dayXp?.[key])||0);weekByDay.set(key,{n,xp});weekCount+=n;weekXp+=xp;weekMinutes+=Math.max(0,Number(summary.dayMinutes?.[key])||0);}});}
  else weekItems.forEach(p=>{const key=p.day||dayKey(p.ts),d=weekByDay.get(key)||{n:0,xp:0};d.n++;d.xp+=+p.xp||0;weekByDay.set(key,d);weekMinutes+=+p.min||0;weekXp+=+p.xp||0;weekCount++;});
  const dateLabel=d=>d.toLocaleDateString(uiLocaleTag(),{day:'numeric',month:'short'}).replace(/\./g,'');
  const weekRange=dateLabel(weekStart)+' — '+dateLabel(weekEnd);
  $('#journalSubtitle').textContent=S.count?`${num(S.count)} ${wordForCount(S.count,'запись','записи','записей','entry','entries','жазба')} · ${new Intl.NumberFormat(uiLocaleTag(),{maximumFractionDigits:1}).format(hrs)} ${({ru:'ч практики за всё время',en:'h of practice in total',kk:'сағаттық жаттығу'})[window.AiryUiLocale?.getLocale?.()||'ru']}`:'Маленькие шаги, которые уже стали частью твоего пути.';
  $('#journalWeekTitle').textContent=weekCount?'Неделя · '+weekRange:'Твои шаги складываются в результат';
  $('#journalWeekNote').textContent=weekCount?`${num(weekByDay.size)} ${wordForCount(weekByDay.size,'день активности','дня активности','дней активности','active day','active days','белсенді күн')} · ${num(weekCount)} ${wordForCount(weekCount,'практика','практики','практик','practice','practices','жаттығу')} на этой неделе`:'Отметь занятие, и здесь появится твой недельный ритм.';
  $('#journalWeekStats').innerHTML=[['Практики',num(weekCount)],['Минуты',num(weekMinutes)],['Опыт',`+${num(weekXp)} XP`]].map(x=>'<div class="journal-week-stat"><b>'+esc(x[1])+'</b><span>'+esc(x[0])+'</span></div>').join('');
  const compareDays=[7,30,90].includes(Number(journalCompareDays))?Number(journalCompareDays):7,compareStart=addDays(todayKey,1-compareDays),previousStart=addDays(todayKey,1-compareDays*2),previousEnd=addDays(todayKey,-compareDays);
  $('#journalCompareDays').value=String(compareDays);
  const period= (start,end)=>{if(summary){let count=0,minutes=0;Object.entries(summary.dayCounts||{}).forEach(([key,n])=>{if(key>=start&&key<=end){count+=Math.max(0,Number(n)||0);minutes+=Math.max(0,Number(summary.dayMinutes?.[key])||0);}});return{count,minutes};}const rows=store.proofs.filter(p=>{const key=p.day||dayKey(p.ts);return key>=start&&key<=end;});return{count:rows.length,minutes:rows.reduce((sum,p)=>sum+(Number(p.min)||0),0)};};
  const currentPeriod=period(compareStart,todayKey),previousPeriod=period(previousStart,previousEnd);
  const changeLabel=(current,previous)=>previous?`${current>=previous?'↑':'↓'} ${Math.round(Math.abs(current-previous)/previous*100)}% к прошлым ${compareDays} дням`:current?'Первые данные для сравнения':'Пока без активности';
  const avgSession=currentPeriod.count?Math.round(currentPeriod.minutes/currentPeriod.count):0;
  $('#journalPeriodStats').innerHTML=[['Практики за '+compareDays+' дней',num(currentPeriod.count),changeLabel(currentPeriod.count,previousPeriod.count)],['Время за '+compareDays+' дней',num(currentPeriod.minutes)+' мин',changeLabel(currentPeriod.minutes,previousPeriod.minutes)],['Средняя сессия',avgSession?num(avgSession)+' мин':'—',currentPeriod.count?'среднее за '+compareDays+' дней':'Появится после практики']].map(x=>'<article class="journal-period-stat"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></article>').join('');
  const monthStart=addDays(todayKey,-29),branchXp=new Map(TREE.map(b=>[b.id,0]));
  if(summary){Object.entries(summary.dayBranchXp||{}).forEach(([key,branches])=>{if(key>=monthStart&&key<=todayKey)Object.entries(branches||{}).forEach(([branch,xp])=>branchXp.set(branch,(branchXp.get(branch)||0)+(Number(xp)||0)));});}
  else store.proofs.forEach(p=>{const key=p.day||dayKey(p.ts),branch=SK[p.skill]?.branch;if(key>=monthStart&&key<=todayKey&&branch)branchXp.set(branch,(branchXp.get(branch)||0)+(Number(p.xp)||0));});
  const maxBranchXp=Math.max(1,...branchXp.values());
  $('#journalBranchStats').innerHTML='<div class="journal-branch-head"><b>Направления · 30 дней</b><small>Распределение полученного XP</small></div>'+TREE.map(branch=>{const xp=branchXp.get(branch.id)||0;return '<div class="journal-branch-row" title="'+esc(branch.name+': '+num(xp)+' XP за 30 дней')+'"><span>'+esc(branch.name)+'</span><i><b style="width:'+Math.round(xp/maxBranchXp*100)+'%;--branch-color:'+esc(branch.c)+'"></b></i><strong>'+num(xp)+'</strong></div>';}).join('');
  const maxDaily=Math.max(1,...Array.from(weekByDay.values(),d=>d.n));
  $('#journalWeekChart').innerHTML=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const key=dayKey(d.getTime()),value=weekByDay.get(key)||{n:0,xp:0},future=d.getTime()>today.getTime(),height=value.n?Math.max(15,Math.round(value.n/maxDaily*100)):4,label=d.toLocaleDateString(uiLocaleTag(),{weekday:'short'}).replace(/\./g,'');return '<div class="journal-week-day'+(value.n?' active':'')+(future?' future':'')+'" title="'+esc(`${label}: ${value.n} практик, ${value.xp} XP`)+'"><span class="journal-week-day-count">'+(value.n?num(value.n):'')+'</span><div class="journal-week-track"><i style="height:'+height+'%"></i></div><b>'+esc(label)+'</b></div>';}).join('');
  // heatmap
  const dow=(today.getDay()+6)%7,cols=15;
  const start=new Date(today);start.setDate(today.getDate()-dow-7*(cols-1));
  let cells='';
  for(let c=0;c<cols;c++)for(let r=0;r<7;r++){
    const d=new Date(start);d.setDate(start.getDate()+c*7+r);const k=dayKey(d.getTime());const v=S.byDay.get(k);
    const fut=d.getTime()>today.getTime();
    const l=!v?0:v.xp>=70?4:v.xp>=40?3:v.xp>=20?2:1;
    cells+='<i class="l'+l+(fut?' fut':'')+'" title="'+esc(k+': '+(v?v.n+' зап., '+v.xp+' XP':'нет записей'))+'"></i>';
  }
  $('#heat').innerHTML=cells;
  const skillSelect=$('#journalSkill'),skills=Object.values(SK).filter(skill=>!skill.isBranch).sort((a,b)=>a.name.localeCompare(b.name,uiLocaleTag()));
  if(jSkillFilter!=='all'&&!SK[jSkillFilter])jSkillFilter='all';
  skillSelect.innerHTML='<option value="all">Все навыки</option>'+skills.map(skill=>'<option value="'+esc(skill.id)+'">'+esc(skill.name)+'</option>').join('');
  skillSelect.value=jSkillFilter;$('#journalFrom').value=jDateFrom;$('#journalTo').value=jDateTo;
  // filters
  const fl=$('#filters');fl.innerHTML='';
  [{id:'all',name:'Все'}].concat(TREE.map(b=>({id:b.id,name:b.name}))).forEach(f=>{
    const b=document.createElement('button');b.type='button';b.className='chip'+(jFilter===f.id?' on':'');b.textContent=f.name;b.setAttribute('aria-pressed',jFilter===f.id?'true':'false');
    b.addEventListener('click',()=>{jFilter=f.id;jVisibleLimit=JOURNAL_PAGE_SIZE;renderJournal();});fl.appendChild(b);});
  // list
  const list=$('#journalList');
  const invalidRange=!!(jDateFrom&&jDateTo&&jDateFrom>jDateTo);
  const items=invalidRange?[]:store.proofs.filter(p=>{
    const skill=SK[p.skill],date=p.day||dayKey(p.ts);
    return (jFilter==='all'||(skill&&skill.branch===jFilter))&&(jSkillFilter==='all'||p.skill===jSkillFilter)&&(!jDateFrom||date>=jDateFrom)&&(!jDateTo||date<=jDateTo);
  }).slice().sort((a,b)=>b.ts-a.ts);
  const visibleItems=items.slice(0,jVisibleLimit);
  const filterStatus=invalidRange?'Начало периода позже его конца. Исправь даты.':store.proofs.length?`Показано ${num(Math.min(items.length,jVisibleLimit))} из ${num(items.length)} записей`:'';
  $('#journalFilterStatus').textContent=filterStatus;
  const historyStatus=$('#journalHistoryStatus');
  historyStatus.hidden=!(store.mode==='db'&&(!store.historyComplete||store.historyError));
  historyStatus.textContent=store.historyError?'Не удалось загрузить более старые записи. Проверь соединение и повтори загрузку.':store.historyLoading?`Загружаю старые записи… Уже загружено ${num(store.proofs.length)}.`:`Загружено ${num(store.proofs.length)} записей. Нажми «Показать старые записи», чтобы продолжить.`;
  $('#journalHistoryRetry').hidden=!(store.mode==='db'&&store.historyError);
  const hasLoadedMore=items.length>jVisibleLimit,hasCloudMore=store.mode==='db'&&!store.historyComplete;
  $('#journalMore').hidden=!hasLoadedMore&&!hasCloudMore;
  $('#journalMore').disabled=store.historyLoading;
  $('#journalMore').textContent=hasLoadedMore?`Показать ещё ${num(Math.min(JOURNAL_PAGE_SIZE,items.length-jVisibleLimit))} записей`:store.historyLoading?'Загружаю…':'Показать старые записи';
  const activeFilters=(jFilter!=='all'?1:0)+(jSkillFilter!=='all'?1:0)+(jDateFrom?1:0)+(jDateTo?1:0);
  $('#journalActiveFilterCount').textContent=activeFilters?`${activeFilters} ${wordForCount(activeFilters,'фильтр','фильтра','фильтров','filter','filters','сүзгі')}`:'Все записи';
  $('#journalFilterDrawer').classList.toggle('has-filters',activeFilters>0);
  if(!items.length){
    if(!store.proofs.length&&store.mode==='db'&&!store.historyComplete){list.innerHTML='<div class="empty">Загружаю твой дневник…</div>';return;}
    const unfiltered=!store.proofs.length&&!jDateFrom&&!jDateTo&&jSkillFilter==='all'&&jFilter==='all';
    const title=invalidRange?'Проверь даты':unfiltered?'Дневник пуст':'Совпадений нет';
    const body=invalidRange?'Дата начала должна быть раньше даты окончания.':unfiltered?'Открой вкладку «Главная» и нажми «Отметить прогресс». Записи с ссылками и фото дают больше опыта.':'Измени фильтр навыка или периода, чтобы увидеть другие записи.';
    list.innerHTML=unfiltered?'<div class="journal-empty"><span class="journal-empty-mark" aria-hidden="true">✿</span><div><span class="journal-kicker">ПЕРВЫЙ ЛИСТ</span><b>'+esc(title)+'</b><p>Запиши первую практику — короткая заметка тоже считается. История и прогресс начнут собираться здесь.</p><button type="button" class="btn primary" data-journal-add>Отметить практику <span aria-hidden="true">↗</span></button></div></div>':'<div class="empty"><b>'+esc(title)+'</b>'+esc(body)+'</div>';return;
  }
  const today2=dayKey(Date.now()),yest=addDays(today2,-1),dayCounts=new Map();items.forEach(p=>{const k=p.day||dayKey(p.ts);dayCounts.set(k,(dayCounts.get(k)||0)+1);});let html='',lastDay='';
  visibleItems.forEach(p=>{
    const entryDay=p.day||dayKey(p.ts);
    if(entryDay!==lastDay){lastDay=entryDay;const t=entryDay===today2?'Сегодня':entryDay===yest?'Вчера':new Date(p.ts).toLocaleDateString(uiLocaleTag(),{weekday:'short',day:'numeric',month:'long'});html+='<div class="day-h"><span>'+esc(t)+'</span><b>'+num(dayCounts.get(entryDay)||0)+' '+wordForCount(dayCounts.get(entryDay)||0,'шаг','шага','шагов','step','steps','қадам')+'</b></div>';}
    const sk=SK[p.skill]||{name:'Другой навык',c:'#a9a1cf'};
    let link='';if(p.link){let host=p.link;try{host=new URL(p.link).hostname;}catch(e){}link='<a class="e-link" href="'+esc(p.link)+'" target="_blank" rel="noopener noreferrer">'+esc(host)+' ↗</a>';}
    const imgs=(p.imgs&&p.imgs.length)?'<div class="e-imgs">'+p.imgs.map(i=>{const src=i.id?'/_blob/'+i.id:i.d;return '<button type="button" data-src="'+esc(src)+'" aria-label="Открыть фото"><img src="'+esc(src)+'" alt="" loading="lazy"></button>';}).join('')+'</div>':'';
    html+='<article class="entry" style="--c:'+esc(sk.c)+'" data-id="'+esc(p.id)+'"><div class="e-head"><span class="e-skill">'+esc(sk.name)+'</span><span>'+esc(new Date(p.ts).toLocaleTimeString(uiLocaleTag(),{hour:'2-digit',minute:'2-digit'}))+'</span><span>'+esc(p.min)+' мин</span><span class="e-xp">+'+esc(p.xp)+' XP</span></div><p>'+esc(p.text)+'</p>'+link+imgs+'<div class="e-act"><button type="button" class="btn small" data-edit="'+esc(p.id)+'">Изменить</button><button type="button" class="btn small danger" data-del="'+esc(p.id)+'">Удалить</button></div></article>';
  });
  list.innerHTML=html;
}
$('#journalMore').addEventListener('click',()=>{const invalidRange=!!(jDateFrom&&jDateTo&&jDateFrom>jDateTo),matches=invalidRange?[]:store.proofs.filter(p=>{const skill=SK[p.skill],date=p.day||dayKey(p.ts);return(jFilter==='all'||(skill&&skill.branch===jFilter))&&(jSkillFilter==='all'||p.skill===jSkillFilter)&&(!jDateFrom||date>=jDateFrom)&&(!jDateTo||date<=jDateTo);});if(matches.length>jVisibleLimit){jVisibleLimit+=JOURNAL_PAGE_SIZE;renderJournal();return;}if(store.mode==='db'&&store.historyCursor&&!store.historyComplete){void loadOlderProofPages(store.col,store.historyCursor,store.historyGeneration,1);renderJournal();}});
$('#journalHistoryRetry').addEventListener('click',()=>{const restorePages=Math.ceil(store.proofOlder.size/PROOF_PAGE_SIZE);store.historyError=false;if(store.historyListenerError||!store.historyCursor)watchProofHistory(store.col,err=>$('#accountErrIn').textContent=cloudError(err),onData,restorePages);else loadOlderProofPages(store.col,store.historyCursor,store.historyGeneration,1);renderJournal();});
$('#journalSkill').addEventListener('change',e=>{jSkillFilter=e.target.value;jVisibleLimit=JOURNAL_PAGE_SIZE;renderJournal();});
$('#journalCompareDays').addEventListener('change',e=>{journalCompareDays=[7,30,90].includes(Number(e.target.value))?Number(e.target.value):7;renderJournal();});
$('#journalFrom').addEventListener('change',e=>{jDateFrom=e.target.value;jVisibleLimit=JOURNAL_PAGE_SIZE;renderJournal();});
$('#journalTo').addEventListener('change',e=>{jDateTo=e.target.value;jVisibleLimit=JOURNAL_PAGE_SIZE;renderJournal();});
$('#journalAddPractice').addEventListener('click',()=>openCheckin());
$('#taskCalendarPrev').addEventListener('click',()=>{taskCalendarMonth=new Date(taskCalendarMonth.getFullYear(),taskCalendarMonth.getMonth()-1,1);renderTaskCalendar();});
$('#taskCalendarNext').addEventListener('click',()=>{taskCalendarMonth=new Date(taskCalendarMonth.getFullYear(),taskCalendarMonth.getMonth()+1,1);renderTaskCalendar();});
$('#taskCalendarGrid').addEventListener('click',e=>{const day=e.target.closest('[data-task-day]');if(!day)return;taskCalendarSelected=day.dataset.taskDay;const [year,month]=taskCalendarSelected.split('-').map(Number);taskCalendarMonth=new Date(year,month-1,1);renderTaskCalendar();});
$('#journalReset').addEventListener('click',()=>{jFilter='all';jSkillFilter='all';jDateFrom='';jDateTo='';jVisibleLimit=JOURNAL_PAGE_SIZE;$('#journalFilterDrawer').open=false;renderJournal();});
$('#journalList').addEventListener('click',async e=>{
  if(e.target.closest('[data-journal-add]')){openCheckin();return;}
  const im=e.target.closest('.e-imgs button');
  if(im){$('#lbImg').src=im.dataset.src;$('#lbOverlay').hidden=false;return;}
  const edit=e.target.closest('[data-edit]');if(edit){const p=store.proofs.find(x=>x.id===edit.dataset.edit);if(p)openCheckin(p.skill,null,p);return;}
  const del=e.target.closest('[data-del]');
  if(del){const act=del.parentElement;act.innerHTML='<span>Удалить запись?</span><button type="button" class="btn small danger" data-yes="'+esc(del.dataset.del)+'">Да</button><button type="button" class="btn small" data-no="1">Нет</button>';return;}
  const no=e.target.closest('[data-no]');if(no){renderJournal();return;}
  const yes=e.target.closest('[data-yes]');
  if(yes){
    const id=yes.dataset.yes;const p=store.proofs.find(x=>x.id===id);
    try{
      saveState('saving','Удаляю…');
      await store.delProof(id);
      if(p&&p.imgs&&store.assets){p.imgs.forEach(i=>{if(i.id){store.assets.delete(i.id).catch(()=>{});}});}
      saveState('saved','Сохранено');toast('Запись удалена. XP, серия и прогресс пересчитаны.');
    }catch(err){saveState('error','Не сохранено');toast('Не удалось удалить запись. Проверь соединение и повтори.');}
  }
});

/* ---------- awards + profile ---------- */
function awardProgress(awardOrId,s,definitions=allAchievementDefinitions()){
  const award=typeof awardOrId==='string'?definitions.find(item=>item.id===awardOrId):awardOrId;if(!award)return{value:0,target:1,unit:'шаг',ratio:0};
  const value=achievementValue(award,s),target=award.target;return{value,target,unit:award.unit,ratio:target?Math.max(0,Math.min(1,value/target)):1};
}
const AWARD_PAGE_SIZE=36;
let awardsVisibleLimit=AWARD_PAGE_SIZE;
function renderNextAwards(s,got,definitions){
  const locale=window.AiryUiLocale?.getLocale?.()||'ru',tr=window.AiryUiLocale?.t||((text)=>text);
  const goals=definitions.filter(a=>!got.has(a.id)&&!a.secret).map(a=>({award:a,progress:awardProgress(a,s,definitions)})).sort((a,b)=>b.progress.ratio-a.progress.ratio).slice(0,3);
  const root=$('#nextAwards');
  if(!goals.length){root.innerHTML='<p class="next-awards-empty">Все награды собраны. Твоя коллекция полностью расцвела.</p>';return;}
  root.innerHTML='<div class="next-award-list">'+goals.map(({award,progress})=>{
    const pct=Math.round(progress.ratio*100),remaining=Math.max(0,progress.target-progress.value);
    const progressText=tr(progress.target===1?(progress.value?'Готово':'Нужно выполнить'):`${ACH.formatCount(progress.value,award.unitForms)} / ${ACH.formatCount(progress.target,award.unitForms)}`,locale);
    const remainingText=tr(progress.target===1?(progress.value?'Почти у цели':'Следующая цель'):`Ещё ${num(remaining)}`,locale);
    return '<article class="next-award rarity-'+esc(award.rarity.toLowerCase())+'"><div class="next-award-top"><span class="next-award-glyph" aria-hidden="true">'+esc(award.g)+'</span><div class="next-award-copy"><b>'+esc(tr(award.n,locale))+'</b><span>'+esc(tr(award.d,locale))+'</span><small>'+esc(tr(award.rarity,locale))+' · '+esc(tr(award.reward.title,locale))+'</small></div></div><div class="next-award-progress" role="progressbar" aria-label="'+esc(tr('Прогресс: '+award.n,locale))+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><i style="width:'+pct+'%"></i></div><div class="next-award-foot"><span>'+esc(progressText)+'</span><span>'+esc(remainingText)+'</span></div></article>';
  }).join('')+'</div>';
}
function renderAwards(){
  const locale=window.AiryUiLocale?.getLocale?.()||'ru',tr=window.AiryUiLocale?.t||((text)=>text);
  const ledger=(store.profile&&store.profile.achievementUnlocks)||{},got=new Set([...S.ach,...Object.keys(ledger)]);
  const definitions=allAchievementDefinitions();
  $('#achCount').textContent=tr(`Получено ${got.size} из ${definitions.length}`,locale);
  renderNextAwards(S,got,definitions);
  const visibleAwards=definitions.filter(award=>!award.secret||got.has(award.id));
  const category=$('#achievementCategory'),previousCategory=category.value||'all',categories=Array.from(new Set(visibleAwards.map(award=>award.category))).sort((a,b)=>a.localeCompare(b,uiLocaleTag())),selected=previousCategory==='all'||categories.includes(previousCategory)?previousCategory:'all',optionValues=['all',...categories];
  if(optionValues.length!==category.options.length||optionValues.some((value,index)=>category.options[index]?.value!==value))category.replaceChildren(new Option(tr('Все категории',locale),'all'),...categories.map(name=>new Option(tr(name,locale),name)));
  else for(const option of category.options)option.textContent=option.value==='all'?tr('Все категории',locale):tr(option.value,locale);
  const query=$('#achievementSearch').value.trim().toLocaleLowerCase(uiLocaleTag()),matches=visibleAwards.filter(award=>(selected==='all'||award.category===selected)&&(!query||[award.n,award.d,award.category,award.rarity,award.reward.title].map(value=>tr(value,locale)).join(' ').toLocaleLowerCase(uiLocaleTag()).includes(query))),rendered=matches.slice(0,awardsVisibleLimit);
  category.value=selected;
  $('#achievementFilterStatus').textContent=query||selected!=='all'||matches.length>rendered.length?tr(`Показано ${rendered.length} из ${matches.length}`,locale):'';
  $('#badges').innerHTML=matches.length?rendered.map(a=>{const earned=got.has(a.id),progress=awardProgress(a,S,definitions),pct=earned?100:Math.round(progress.ratio*100),date=ledger[a.id]&&ledger[a.id].at?new Date(ledger[a.id].at).toLocaleDateString(uiLocaleTag()):tr('Ранее получено',locale);return '<div class="badge '+(earned?'on':'')+' rarity-'+esc(a.rarity.toLowerCase())+'" data-achievement="'+esc(a.id)+'"><div class="gl" aria-hidden="true">'+esc(a.g)+'</div><b>'+esc(tr(a.n,locale))+'</b><span>'+esc(tr(a.d,locale))+'</span><small>'+esc(tr(a.rarity,locale))+(earned?' · '+esc(date):' · '+pct+'%')+'</small><div class="badge-progress" role="progressbar" aria-label="'+esc(tr('Прогресс: '+a.n,locale))+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><i style="width:'+pct+'%"></i></div><em>'+esc(tr(a.reward.title,locale))+'</em></div>';}).join('')+(matches.length>rendered.length?'<button type="button" class="btn small achievements-load-more" id="achievementsLoadMore">'+esc(tr(`Показать ещё ${Math.min(AWARD_PAGE_SIZE,matches.length-rendered.length)} · осталось ${matches.length-rendered.length}`,locale))+'</button>':''):'<p class="achievement-empty">'+esc(tr('Награды не найдены. Измени поиск или выбери другую категорию.',locale))+'</p>';
}
$('#achievementSearch').addEventListener('input',()=>{awardsVisibleLimit=AWARD_PAGE_SIZE;renderAwards();});
$('#achievementCategory').addEventListener('change',()=>{awardsVisibleLimit=AWARD_PAGE_SIZE;renderAwards();});
$('#badges').addEventListener('click',event=>{if(!event.target.closest('#achievementsLoadMore'))return;awardsVisibleLimit+=AWARD_PAGE_SIZE;renderAwards();$('#achievementsLoadMore')?.focus();});
function renderCosmeticInventory(){
  const profile=store.profile||{},items=window.AiryCosmeticInventory.build(allAchievementDefinitions(),profile.achievementUnlocks,profile.unlockedTitles);
  const query=$('#cosmeticInventorySearch').value.trim().toLocaleLowerCase(uiLocaleTag()),rarity=$('#cosmeticInventoryRarity').value,active=profile.activeTitle||'',matches=items.filter(item=>(rarity==='all'||item.rarity===rarity)&&(!query||(item.title+' '+item.name+' '+item.category+' '+item.rarity).toLocaleLowerCase(uiLocaleTag()).includes(query)));
  $('#cosmeticInventoryCount').textContent=String(items.length);
  $('#cosmeticInventoryCount').setAttribute('aria-label',`${items.length} предметов в коллекции`);
  $('#cosmeticInventory').innerHTML=matches.length?matches.map(item=>'<article class="cosmetic-item rarity-'+esc(item.rarity.toLowerCase())+'"><span class="cosmetic-item-glyph" aria-hidden="true">'+esc(item.glyph)+'</span><div class="cosmetic-item-copy"><b>'+esc(item.title)+'</b><span>'+esc(item.name)+'</span><small>'+esc(item.rarity)+(item.at?' · '+esc(new Date(item.at).toLocaleDateString(uiLocaleTag())):'')+'</small></div><button type="button" class="btn small cosmetic-equip" data-equip-title="'+esc(item.title)+'" aria-pressed="'+String(active===item.title)+'">'+(active===item.title?'Выбран':'Надеть')+'</button></article>').join(''):'<p class="achievement-empty">'+(items.length?'По этим фильтрам награды не найдены.':'Пока пусто. Выполняй практику и открывай достижения, чтобы собирать титулы и значки.')+'</p>';
  $('#cosmeticInventoryStatus').textContent=items.length?`Собрано ${items.length} косметических наград. Они не меняют расчёт опыта.`:'';
}
$('#cosmeticInventorySearch').addEventListener('input',renderCosmeticInventory);
$('#cosmeticInventoryRarity').addEventListener('change',renderCosmeticInventory);
$('#cosmeticInventory').addEventListener('click',event=>{const button=event.target.closest('[data-equip-title]');if(!button)return;const select=$('#profileTitleSelect');select.value=button.dataset.equipTitle;select.dispatchEvent(new Event('change',{bubbles:true}));});
let friendsState={uid:'',items:[],loading:false,request:0};
function renderFriends(){
  const user=store.auth&&store.auth.currentUser,status=$('#friendsStatus'),list=$('#friendsList'),canUse=!!(user&&user.emailVerified);
  $('#friendInviteCreate').disabled=!canUse||friendsState.loading;$('#friendsReload').disabled=!canUse||friendsState.loading;$('#friendAcceptButton').disabled=!canUse||friendsState.loading;
  if(!user){status.textContent='Войди в подтверждённый аккаунт, чтобы добавлять друзей.';list.innerHTML='';return;}
  if(!user.emailVerified){status.textContent='Подтверди почту в настройках аккаунта, чтобы включить список друзей.';list.innerHTML='';return;}
  if(friendsState.loading){status.textContent='Загружаю список друзей…';return;}
  if(friendsState.uid!==user.uid){status.textContent='Нажми «Обновить список», чтобы загрузить друзей.';list.innerHTML='';return;}
  status.textContent=friendsState.items.length?`Взаимных связей: ${friendsState.items.length}${friendsState.truncated?' · показаны первые 50':''}.`:'Пока здесь пусто. Создай код и отправь его другу.';
  list.innerHTML=friendsState.items.map(friend=>'<article class="friend-row"><span class="friend-avatar" aria-hidden="true">'+esc(friend.avatar)+'</span><div class="friend-copy"><b>'+esc(friend.name)+'</b><small>Вместе с '+esc(friend.since?new Date(friend.since).toLocaleDateString(uiLocaleTag()):'недавнего времени')+'</small></div><button type="button" class="btn small danger" data-remove-friend="'+esc(friend.uid)+'" aria-label="Удалить из друзей: '+esc(friend.name)+'">Убрать</button></article>').join('');
}
async function loadFriends(force=false){
  const user=store.auth&&store.auth.currentUser;
  if(!user||!user.emailVerified){renderFriends();return;}
  if(friendsState.loading)return;
  if(!force&&friendsState.uid===user.uid){renderFriends();return;}
  const request=++friendsState.request;friendsState.loading=true;renderFriends();
  try{const token=await user.getIdToken(),response=await fetch('/api/rpg/friends',{headers:{Authorization:'Bearer '+token},cache:'no-store'}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'FRIENDS_LOAD_FAILED');if(request!==friendsState.request)return;friendsState={uid:user.uid,items:Array.isArray(result.friends)?result.friends:[],truncated:!!result.truncated,loading:false,request};}
  catch(error){if(request!==friendsState.request)return;friendsState={uid:'',items:[],loading:false,request};$('#friendsStatus').textContent=error.message==='EMAIL_VERIFICATION_REQUIRED'?'Подтверди почту в настройках аккаунта.':'Не удалось загрузить друзей. Проверь соединение и попробуй ещё раз.';$('#friendsList').innerHTML='';}
  renderFriends();
}
function friendErrorMessage(code){return ({EMAIL_VERIFICATION_REQUIRED:'Подтверди почту, чтобы добавлять друзей.',INVITE_NOT_FOUND:'Код не найден. Проверь его и попробуй ещё раз.',INVITE_EXPIRED:'Срок действия кода истёк. Попроси создать новый.',INVITE_ALREADY_USED:'Этот код уже использовали. Попроси друга создать новый.',INVALID_INVITE:'Нельзя добавить самого себя.',PROFILE_NOT_FOUND:'Профиль одной из сторон ещё не готов. Выйдите и войдите снова.',RATE_LIMITED:'Слишком много попыток. Подожди минуту.',SERVER_NOT_CONFIGURED:'Облачный сервер пока не настроен.'})[code]||'Не удалось выполнить действие. Попробуй ещё раз.';}
async function postFriendAction(payload){const user=store.auth&&store.auth.currentUser;if(!user||!user.emailVerified)throw new Error('EMAIL_VERIFICATION_REQUIRED');const token=await user.getIdToken(),response=await fetch('/api/rpg/friends',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'FRIEND_CONNECT_FAILED');return result;}
function applyFriendAchievementResult(result){
  store.profile=Object.assign({},store.profile||{},{friendCount:Math.max(0,Number(result.ownFriendCount)||0)});
  return applyServerAchievementAwards(result.ownAwards);
}
function applyServerAchievementAwards(awards){
  const profile=store.profile||{},ledger={...(profile.achievementUnlocks||{})},titles=new Set(Array.isArray(profile.unlockedTitles)?profile.unlockedTitles:[]),fresh=[];
  const definitions=new Map(allAchievementDefinitions().map(award=>[award.id,award]));
  (Array.isArray(awards)?awards:[]).forEach(award=>{
    if(!award||typeof award.id!=='string'||!/^[-a-zA-Z0-9_:]{1,100}$/.test(award.id)||ledger[award.id])return;
    const definition=definitions.get(award.id);if(!definition)return;
    const reward=definition.reward||award.reward||{type:'cosmetic',title:'Награда'};
    ledger[award.id]={at:Date.now(),rarity:definition.rarity||award.rarity||'Common',reward,achievement:{id:definition.id,n:definition.n,d:definition.d,category:definition.category,g:definition.g,metric:definition.metric,target:definition.target,unit:definition.unit,unitForms:definition.unitForms,secret:definition.secret}};
    if(reward.title)titles.add(reward.title);fresh.push(definition);
  });
  if(fresh.length)store.profile=Object.assign({},profile,{achievementUnlocks:ledger,unlockedTitles:Array.from(titles)});
  return fresh;
}
function presentServerAchievementAwards(awards,{showCelebration=true}={}){
  if(!awards.length)return;
  awards.forEach((award,index)=>{const badge=document.querySelector('.badge[data-achievement="'+award.id+'"]');if(!badge)return;badge.style.setProperty('--earned-delay',Math.min(index,4)*90+'ms');badge.classList.remove('just-earned');void badge.offsetWidth;badge.classList.add('just-earned');setTimeout(()=>{badge.classList.remove('just-earned');badge.style.removeProperty('--earned-delay');},1100+index*90);});
  const first=awards[0];if(showCelebration){playUiSound('award');fx(awards.length===1?'ДОСТИЖЕНИЕ ОТКРЫТО':`ДОСТИЖЕНИЙ: ${awards.length}`,first.n,'award');}
  if(profilePreferences().achievementNotifications&&('Notification'in window)&&Notification.permission==='granted'){const tr=window.AiryUiLocale?.t||((value)=>value);awards.slice(0,3).forEach(award=>{try{new Notification(tr('Новое достижение · '+award.n),{body:tr(award.d),icon:'/icons/airy-192.png',tag:'airy-achievement-'+award.id});}catch{}});}
}
$('#friendInviteCreate').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;$('#friendsStatus').textContent='Создаю одноразовый код…';try{const result=await postFriendAction({action:'invite'});$('#friendInviteCodeOut').value=result.code;$('#friendInviteResult').hidden=false;$('#friendsStatus').textContent='Код действует 7 дней и сработает один раз.';}catch(error){$('#friendsStatus').textContent=friendErrorMessage(error.message);}finally{button.disabled=false;}});
$('#friendInviteCopy').addEventListener('click',async()=>{const input=$('#friendInviteCodeOut');try{await navigator.clipboard.writeText(input.value);$('#friendsStatus').textContent='Код скопирован. Отправь его другу.';}catch{input.focus();input.select();try{document.execCommand('copy');$('#friendsStatus').textContent='Код скопирован. Отправь его другу.';}catch{$('#friendsStatus').textContent='Выдели код и скопируй его вручную.';}}});
$('#friendAcceptForm').addEventListener('submit',async event=>{event.preventDefault();const button=$('#friendAcceptButton'),code=$('#friendCodeInput').value;button.disabled=true;$('#friendsStatus').textContent='Проверяю приглашение…';try{const result=await postFriendAction({action:'accept',code}),fresh=applyFriendAchievementResult(result);$('#friendCodeInput').value='';$('#friendInviteResult').hidden=true;await loadFriends(true);renderAll();presentServerAchievementAwards(fresh);$('#friendsStatus').textContent=result.alreadyConnected?'Вы уже добавлены друг у друга.':'Готово, вы теперь друзья.';if(fresh.length)toast(`Открыто достижение «${fresh[0].n}».`);}catch(error){$('#friendsStatus').textContent=friendErrorMessage(error.message);}finally{button.disabled=false;}});
$('#friendsReload').addEventListener('click',()=>loadFriends(true));
$('#friendsList').addEventListener('click',async event=>{const button=event.target.closest('[data-remove-friend]');if(!button)return;const name=friendsState.items.find(friend=>friend.uid===button.dataset.removeFriend)?.name||'этого друга';if(!window.confirm(`Убрать ${name} из списка друзей? Заработанные достижения сохранятся.`))return;button.disabled=true;$('#friendsStatus').textContent='Обновляю связь…';try{const user=store.auth.currentUser,token=await user.getIdToken(),response=await fetch('/api/rpg/friends',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({friendUid:button.dataset.removeFriend})}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'FRIEND_REMOVE_FAILED');await loadFriends(true);$('#friendsStatus').textContent=result.removed?'Связь удалена. История достижений сохранена.':'Эта связь уже удалена.';}catch{$('#friendsStatus').textContent='Не удалось удалить друга. Проверь соединение и попробуй ещё раз.';}finally{renderFriends();}});

function renderProfile(){
  const profile=store.profile||{},user=store.accountUser,profileName=profile.name||(user&&user.displayName)||'';
  const inp=$('#pfName');if(document.activeElement!==inp)inp.value=profileName;
  const settingsName=$('#settingsProfileName');if(settingsName&&document.activeElement!==settingsName)settingsName.value=profileName;
  const shownName=profileName||(user&&user.email?(user.email.split('@')[0]):'Путешественник');
  const avatar=profileAvatarGlyph(profile.avatar,shownName);$('#profileDisplayName').textContent=shownName;$('#profileAvatar').textContent=avatar;$('#accountAvatar').textContent=avatar;
  $('#profileEmail').textContent=user?(user.email||'Аккаунт Airy'):'Войди, чтобы синхронизировать прогресс';
  $('#profileStorage').textContent=user?'Облачная синхронизация включена':store.mode==='db'?'Профиль подключён':'Сохранено на этом устройстве';
  $('#profileStorage').style.color=user?'var(--good)':'var(--muted)';
  $('#profileStatLevel').textContent=S?S.tl.L:1;$('#profileStatEntries').textContent=S?num(S.count):num(store.proofs.length);$('#profileStatStreak').textContent=S?S.streak:0;
  const titleSelect=$('#profileTitleSelect'),titles=profile.unlockedTitles||[],activeTitle=profile.activeTitle||'';titleSelect.innerHTML='<option value="">Без титула</option>'+titles.map(title=>'<option value="'+esc(title)+'">'+esc(title)+'</option>').join('');titleSelect.value=titles.includes(activeTitle)?activeTitle:'';
  renderCosmeticInventory();
  loadFriends();
  $$('#avatarPickerOptions [data-avatar]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.avatar===profile.avatar)));
  $$('#settingsAvatarOptions [data-avatar]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.avatar===profile.avatar)));
  renderProfileCalendar(S||computeStats(store.proofs));
  updateAccountDialog();
  $('#pfMode').textContent=store.mode==='db'
    ?'Прогресс, ник и записи привязаны к твоему аккаунту. После входа они появятся на других устройствах.'
    :'Сейчас данные хранятся в этом браузере. Войди или создай аккаунт, чтобы синхронизировать их между устройствами.';
  $('#pfExport').hidden=false;
  const selectedVersion=profile.mikaVersion==='old'?'old':'new';
  $$('#mikaVersionOptions [data-mika-version]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mikaVersion===selectedVersion)));
}
$('#profileTitleSelect').addEventListener('change',async e=>{const activeTitle=e.target.value||'';e.target.disabled=true;try{await store.saveProfile({activeTitle});store.profile=Object.assign({},store.profile,{activeTitle});renderCosmeticInventory();toast(activeTitle?'Титул профиля обновлён.':'Титул убран.');}catch(error){toast('Не удалось сохранить титул профиля.','error');renderProfile();}finally{e.target.disabled=false;}});
async function saveProfileAvatar(value){
  if(!PROFILE_AVATARS.includes(value))return;
  const previous=(store.profile||{}).avatar,groups=[$('#avatarPickerOptions'),$('#settingsAvatarOptions')].filter(Boolean),buttons=groups.flatMap(group=>Array.from(group.querySelectorAll('button'))),status=$('#view-settings').hidden?$('#avatarPickerStatus'):$('#settingsAvatarStatus');
  buttons.forEach(item=>item.disabled=true);status.textContent='Сохраняю значок…';
  try{await store.saveProfile({avatar:value});store.profile=Object.assign({},store.profile,{avatar:value});renderProfile();$('#avatarPickerStatus').textContent='Значок сохранён и синхронизирован с профилем.';$('#settingsAvatarStatus').textContent='Значок сохранён и синхронизирован с профилем.';toast('Значок профиля обновлён.');}
  catch{store.profile=Object.assign({},store.profile,{avatar:previous});renderProfile();$('#avatarPickerStatus').textContent='Не удалось сохранить значок. Проверь соединение и повтори.';$('#settingsAvatarStatus').textContent='Не удалось сохранить значок. Проверь соединение и повтори.';toast('Не удалось сохранить значок профиля.','error');}
  finally{buttons.forEach(item=>item.disabled=false);}
}
$('#avatarPickerOptions').addEventListener('click',e=>{const button=e.target.closest('[data-avatar]');if(button)saveProfileAvatar(button.dataset.avatar);});
$('#settingsAvatarOptions').addEventListener('click',e=>{const button=e.target.closest('[data-avatar]');if(button)saveProfileAvatar(button.dataset.avatar);});
$('#shareProgress').addEventListener('click',async e=>{
  const button=e.currentTarget;button.disabled=true;const previous=computeStats(store.proofs),text=`Мой путь в Upskill Airy: уровень ${S.tl.L}, ${S.total} XP, ${S.used} активных навыков и серия ${S.streak} дн. Развиваюсь шаг за шагом ✦`,url=location.origin+location.pathname;
  try{
    if(navigator.share)await navigator.share({title:'Мой прогресс в Upskill Airy',text,url});
    else if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(`${text}\n${url}`);
    else throw new Error('SHARE_UNAVAILABLE');
    if(store.mode==='db'){
      if(!store.auth||!store.auth.currentUser)throw new Error('Войди в аккаунт, чтобы сохранить событие.');
      const token=await store.auth.currentUser.getIdToken(),response=await fetch('/api/rpg/share',{method:'POST',headers:{Authorization:'Bearer '+token}}),result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error==='SERVER_NOT_CONFIGURED'?'Облачные награды пока не настроены на сервере. Ссылка уже подготовлена.':'Ссылка отправлена, но событие не удалось сохранить.');
      if(!result.created){renderAll();toast('Ссылка подготовлена. Засчёт за сегодня уже получен.');return;}
      store.profile=Object.assign({},store.profile||{},{shareCount:Math.max(0,Number(result.count)||0)});
      var freshAwards=applyServerAchievementAwards(result.earned);
    }else{
      const shareCount=(Number(store.profile.shareCount)||0)+1;await store.saveProfile({shareCount});store.profile=Object.assign({},store.profile,{shareCount});
      await recordAchievementUnlocks(computeStats(store.proofs),previous);
    }
    renderAll();if(store.mode==='db')presentServerAchievementAwards(freshAwards||[]);toast('Прогрессом поделился. Событие сохранено.');
  }catch(error){if(error&&error.name==='AbortError')return;toast(error&&error.message==='SHARE_UNAVAILABLE'?'В этом браузере нет функции поделиться.':'Не удалось поделиться прогрессом.','error');}
  finally{button.disabled=false;}
});
function renderSkillArchive(){
  const hiddenIds=new Set((store.profile&&store.profile.hiddenSkills)||[]),purgedIds=new Set((store.profile&&store.profile.purgedSkills)||[]),edits=(store.profile&&store.profile.skillEdits)||{},names={};
  BASE.forEach(branch=>{names[branch.id]=(edits[branch.id]&&edits[branch.id].name)||branch.name;branch.leaves.forEach(skill=>{names[skill.id]=(edits[skill.id]&&edits[skill.id].name)||skill.name;});});
  ((store.profile&&store.profile.customBranches)||[]).forEach(branch=>{names[branch.id]=(edits[branch.id]&&edits[branch.id].name)||branch.name;});
  ((store.profile&&store.profile.customLeaves)||[]).forEach(skill=>{names[skill.id]=(edits[skill.id]&&edits[skill.id].name)||skill.name;});
  const meta=(store.profile&&store.profile.skillArchiveMeta)||{},query=($('#skillArchiveSearch')?.value||'').trim().toLocaleLowerCase(uiLocaleTag()),from=$('#skillArchiveFrom')?.value||'',to=$('#skillArchiveTo')?.value||'',hidden=Array.from(hiddenIds).filter(id=>names[id]&&!purgedIds.has(id)),root=$('#skillArchive');
  const filtered=hidden.filter(id=>{const at=Number(meta[id]?.archivedAt||meta[id]),date=Number.isFinite(at)&&at>0?dayKey(at):'';return(!query||names[id].toLocaleLowerCase(uiLocaleTag()).includes(query))&&(!from||(date&&date>=from))&&(!to||(date&&date<=to));}).sort((a,b)=>(Number(meta[b]?.archivedAt||meta[b])||0)-(Number(meta[a]?.archivedAt||meta[a])||0)||names[a].localeCompare(names[b],uiLocaleTag()));
  const page=AiryArchivePagination.page(filtered,skillArchiveLimit);
  $('#archiveCount').textContent=String(filtered.length);
  root.innerHTML=filtered.length?page.visible.map(id=>{const at=Number(meta[id]?.archivedAt||meta[id]),date=Number.isFinite(at)&&at>0?new Date(at).toLocaleDateString(uiLocaleTag()):'Дата не записана';return '<div class="archive-skill-row"><span>'+esc(names[id])+'<small class="archive-skill-date">'+esc(date)+'</small></span><div class="archive-skill-actions"><button type="button" class="btn small" data-restore-skill="'+esc(id)+'">Восстановить</button><button type="button" class="btn small danger" data-delete-archived="'+esc(id)+'">Удалить навсегда</button></div></div>';}).join('')+(page.remaining?'<button type="button" class="btn small archive-load-more" data-more-skill-archive><span>Показать ещё записи</span> · '+num(page.remaining)+'</button>':''):hidden.length?'<p class="archive-empty">По этим фильтрам навыки не найдены.</p>':'<p class="archive-empty">Архив пуст. Удалённые навыки будут храниться здесь.</p>';
}
function renderTreeArchive(){
  const root=$('#treeArchive');if(!root)return;
  const query=($('#treeArchiveSearch')?.value||'').trim().toLocaleLowerCase(uiLocaleTag()),from=$('#treeArchiveFrom')?.value||'',to=$('#treeArchiveTo')?.value||'',allRows=(Array.isArray(store.profile&&store.profile.treeArchive)?store.profile.treeArchive:[]).filter(row=>row&&typeof row.id==='string'&&row.tree&&typeof row.tree==='object').slice().reverse(),rows=allRows.filter(row=>{const tree=row.tree||{},branches=Array.isArray(tree.customBranches)?tree.customBranches:[],leaves=Array.isArray(tree.customLeaves)?tree.customLeaves:[],names=[...branches,...leaves].map(item=>item&&typeof item.name==='string'?item.name:'').join(' '),haystack=('версия древа '+row.id+' '+names).toLocaleLowerCase(uiLocaleTag()),at=Number(row.createdAt),date=Number.isFinite(at)&&at>0&&at<=8640000000000000?dayKey(at):'';return(!query||haystack.includes(query))&&(!from||(date&&date>=from))&&(!to||(date&&date<=to));});
  $('#treeArchiveCount').textContent=String(rows.length);
  root.innerHTML=rows.length?rows.map(row=>{const tree=row.tree||{},branches=Array.isArray(tree.customBranches)?tree.customBranches.length:0,leaves=Array.isArray(tree.customLeaves)?tree.customLeaves.length:0,hidden=Array.isArray(tree.hiddenSkills)?tree.hiddenSkills.length:0,at=Number(row.createdAt),date=Number.isFinite(at)&&at>0&&at<=8640000000000000?new Date(at).toLocaleString(uiLocaleTag(),{dateStyle:'medium',timeStyle:'short'}):'Дата не записана';return '<article class="archive-tree-row"><span class="archive-achievement-glyph" aria-hidden="true">⌘</span><span class="archive-achievement-copy"><b>Версия древа</b><small>'+esc(date)+' · '+branches+' пользовательских ветвей · '+leaves+' навыков · '+hidden+' в архиве</small></span><span class="archive-tree-actions"><button class="btn small" type="button" data-restore-tree="'+esc(row.id)+'">Восстановить</button><button class="btn small danger" type="button" data-delete-tree-snapshot="'+esc(row.id)+'">Удалить</button></span></article>';}).join(''):allRows.length?'<p class="archive-empty">По этим фильтрам версии не найдены.</p>':'<p class="archive-empty">Снимки появятся, когда ты изменишь структуру древа.</p>';
}
['skillArchiveSearch','skillArchiveFrom','skillArchiveTo'].forEach(id=>$('#'+id).addEventListener(id.endsWith('Search')?'input':'change',()=>{skillArchiveLimit=ARCHIVE_PAGE_SIZE;renderSkillArchive();}));
['treeArchiveSearch','treeArchiveFrom','treeArchiveTo'].forEach(id=>$('#'+id).addEventListener(id.endsWith('Search')?'input':'change',renderTreeArchive));
function renderAchievementArchive(){
  const root=$('#achievementArchive');if(!root)return;
  const ledger=(store.profile&&store.profile.achievementUnlocks)||{},earned=new Set([...S.ach,...Object.keys(ledger)]),query=($('#achievementArchiveSearch').value||'').trim().toLocaleLowerCase(uiLocaleTag()),days=Number($('#achievementArchivePeriod').value)||0,cutoff=days?Date.now()-days*86400000:0;
  const rows=allAchievementDefinitions().filter(award=>earned.has(award.id)).map(award=>{const rawAt=Number(ledger[award.id]&&ledger[award.id].at);return{award,at:Number.isFinite(rawAt)&&rawAt>0&&rawAt<=8640000000000000?rawAt:0};}).filter(({award,at})=>{
    const searchable=[award.n,award.d,award.rarity,award.reward&&award.reward.title].join(' ').toLocaleLowerCase(uiLocaleTag());
    return(!query||searchable.includes(query))&&(!cutoff||(at&&at>=cutoff));
  }).sort((a,b)=>b.at-a.at||a.award.n.localeCompare(b.award.n,uiLocaleTag()));
  $('#achievementArchiveCount').textContent=String(rows.length);
  root.innerHTML=rows.length?rows.map(({award,at})=>'<article class="archive-achievement rarity-'+esc(award.rarity.toLowerCase())+'"><span class="archive-achievement-glyph" aria-hidden="true">'+esc(award.g)+'</span><span class="archive-achievement-copy"><b>'+esc(award.n)+'</b><small>'+esc(award.d)+'</small></span><span class="archive-achievement-meta"><b>'+esc(award.rarity)+'</b><small>'+esc(award.reward.title)+'</small><time'+(at?' datetime="'+new Date(at).toISOString()+'"':'')+'>'+(at?esc(new Date(at).toLocaleDateString(uiLocaleTag())):'Дата не записана')+'</time></span></article>').join(''):'<p class="archive-empty">'+(query||days?'Наград за выбранный период не найдено.':'Пока нет открытых достижений.')+'</p>';
}
$('#achievementArchiveSearch').addEventListener('input',renderAchievementArchive);
$('#achievementArchivePeriod').addEventListener('change',renderAchievementArchive);
function renderQuestArchive(){
  const root=$('#questArchive');if(!root)return;
  const profile=store.profile||{},history=Array.isArray(profile.questHistory)?profile.questHistory:[],legacyQuests=Array.isArray(profile.quests)?profile.quests:[],entries=new Map();
  history.forEach(item=>{const at=Number(item&&item.completedAt);if(!item||typeof item.id!=='string'||typeof item.skill!=='string'||!Number.isFinite(at)||at<=0||at>8640000000000000)return;entries.set(item.id,{id:item.id,title:typeof item.title==='string'?item.title:'Завершённый квест',skill:item.skill,period:item.period,completedAt:at,requiredMinutes:item.requiredMinutes,requiresEvidence:item.requiresEvidence===true});});
  store.proofs.forEach(proof=>{if(typeof proof.quest!=='string'||!proof.quest||entries.has(proof.quest))return;const quest=legacyQuests.find(item=>item&&item.id===proof.quest),at=Number(proof.ts);entries.set(proof.quest,{id:proof.quest,title:quest&&typeof quest.title==='string'?quest.title:'Завершённый квест',skill:typeof proof.skill==='string'?proof.skill:'',period:quest&&quest.period||'personal',completedAt:Number.isFinite(at)&&at>0&&at<=8640000000000000?at:0,requiredMinutes:quest&&quest.requiredMinutes,requiresEvidence:quest&&quest.requiresEvidence===true});});
  const hidden=new Set(Array.isArray(profile.hiddenQuestArchiveIds)?profile.hiddenQuestArchiveIds.filter(id=>typeof id==='string'):[]),purged=new Set(Array.isArray(profile.purgedQuestArchiveIds)?profile.purgedQuestArchiveIds.filter(id=>typeof id==='string'):[]),query=$('#questArchiveSearch').value.trim().toLocaleLowerCase(uiLocaleTag()),days=Number($('#questArchivePeriod').value)||0,cutoff=days?Date.now()-days*86400000:0;
  const rows=Array.from(entries.values()).filter(item=>{if(purged.has(item.id))return false;const skillName=SK[item.skill]?.name||item.skill,haystack=(item.title+' '+skillName).toLocaleLowerCase(uiLocaleTag());return(!query||haystack.includes(query))&&(!cutoff||(item.completedAt&&item.completedAt>=cutoff));}).sort((a,b)=>b.completedAt-a.completedAt||a.title.localeCompare(b.title,uiLocaleTag()));
  const page=AiryArchivePagination.page(rows,questArchiveLimit);
  const visible=rows.filter(item=>!hidden.has(item.id));$('#questArchiveCount').textContent=String(visible.length);
  root.innerHTML=rows.length?page.visible.map(item=>{const isHidden=hidden.has(item.id),skill=SK[item.skill]?.name||'Навык из истории',date=item.completedAt?new Date(item.completedAt).toLocaleDateString(uiLocaleTag()):'Дата не записана',requirements=[Number(item.requiredMinutes)>0?'от '+Math.max(15,Math.min(600,Number(item.requiredMinutes)))+' мин':'',item.requiresEvidence?'нужно подтверждение':''].filter(Boolean).join(' · ');return '<article class="archive-quest-row'+(isHidden?' is-hidden':'')+'"><span class="archive-achievement-glyph" aria-hidden="true">'+(isHidden?'◌':'✓')+'</span><span class="archive-achievement-copy"><b>'+esc(item.title)+'</b><small>'+esc(skill)+' · '+esc(({daily:'Ежедневный',weekly:'Недельный',boss:'Boss Challenge',personal:'Личный'})[item.period]||'Квест')+' · '+esc(date)+(requirements?' · '+esc(requirements):'')+'</small></span><span class="archive-quest-actions">'+(isHidden?'<button class="btn small" type="button" data-restore-quest-archive="'+esc(item.id)+'">Восстановить</button>':'<button class="btn small" type="button" data-repeat-quest="'+esc(item.id)+'"'+(SK[item.skill]?'':' disabled')+'>Повторить</button><button class="btn small" type="button" data-hide-quest-archive="'+esc(item.id)+'">Скрыть</button>')+'<button class="btn small danger" type="button" data-delete-quest-archive="'+esc(item.id)+'">Удалить навсегда</button></span></article>';}).join('')+(page.remaining?'<button type="button" class="btn small archive-load-more" data-more-quest-archive><span>Показать ещё записи</span> · '+num(page.remaining)+'</button>':''):(store.mode==='db'&&!store.historyComplete?'<p class="archive-empty">Загружаю историю заданий…</p>':'<p class="archive-empty">Завершённых квестов пока нет. Пройденные задания появятся здесь.</p>');
}
$('#questArchiveSearch').addEventListener('input',()=>{questArchiveLimit=ARCHIVE_PAGE_SIZE;renderQuestArchive();});
$('#questArchivePeriod').addEventListener('change',()=>{questArchiveLimit=ARCHIVE_PAGE_SIZE;renderQuestArchive();});
$('#questArchive').addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-more-quest-archive')){questArchiveLimit+=ARCHIVE_PAGE_SIZE;renderQuestArchive();return;}
  const purgeId=button.dataset.deleteQuestArchive;
  if(purgeId){if(!confirm('Удалить эту запись квеста из архива навсегда? Практика, XP и достижения останутся.'))return;button.disabled=true;try{await mutateQuests('purge-archive',{id:purgeId});renderQuestArchive();toast('Запись удалена из архива. Практика и опыт сохранены.');}catch(error){toast(error.message||'Не удалось удалить запись из архива.','error');}finally{button.disabled=false;}return;}
  const profile=store.profile||{},id=button.dataset.hideQuestArchive||button.dataset.restoreQuestArchive;
  if(id){const hidden=new Set(Array.isArray(profile.hiddenQuestArchiveIds)?profile.hiddenQuestArchiveIds:[]);if(button.dataset.hideQuestArchive){if(!confirm('Скрыть этот квест из архива? Запись практики и полученный опыт останутся.'))return;hidden.add(id);}else hidden.delete(id);const hiddenQuestArchiveIds=Array.from(hidden);button.disabled=true;try{await store.saveProfile({hiddenQuestArchiveIds});store.profile=Object.assign({},store.profile,{hiddenQuestArchiveIds});renderQuestArchive();}catch{toast('Не удалось обновить архив квестов.','error');}return;}
  const repeatId=button.dataset.repeatQuest;if(!repeatId)return;const entry=(Array.isArray(profile.questHistory)?profile.questHistory:[]).find(item=>item&&item.id===repeatId)||store.proofs.find(proof=>proof.quest===repeatId);if(!entry||!SK[entry.skill]){toast('Этот навык больше недоступен для квеста.','error');return;}
  button.disabled=true;try{await mutateQuests('repeat',{sourceId:repeatId});renderAll();toast('Квест возвращён в активные. XP начислится только после новой практики.');}catch(error){toast(error.message||'Не удалось вернуть квест.','error');}finally{button.disabled=false;}
});
let renderedProfileCalendarSignature='';
function renderProfileCalendar(stats){
  const locale=window.AiryUiLocale?.normalize(profilePreferences().uiLanguage)||'ru';
  const model=window.AiryProfileCalendar.build(stats,Date.now(),locale),scroll=$('#profileCalendarScroll');
  if(model.signature===renderedProfileCalendarSignature&&scroll.dataset.initialized==='true')return;
  const wasAtEnd=scroll.scrollWidth-scroll.clientWidth-scroll.scrollLeft<8,previousScroll=scroll.scrollLeft;
  const html=Array.from({length:model.offset},()=>'<span class="profile-calendar-empty" aria-hidden="true"></span>').join()+model.days.map(day=>'<div class="profile-calendar-day l'+day.level+(day.today?' today':'')+'" role="listitem" aria-label="'+esc(day.description)+'" title="'+esc(day.description)+'"></div>').join('');
  $('#profileCalendarMonths').innerHTML=model.months.map(item=>'<span style="grid-column:'+String(item.week+1)+'">'+esc(item.label)+'</span>').join('');
  $('#profileCalendar').innerHTML=html;
  $('#profileCalendarWeekdays').innerHTML=model.weekdayMarks.map(label=>'<span>'+esc(label)+'</span>').join('');
  if(wasAtEnd||!scroll.dataset.initialized)scroll.scrollLeft=scroll.scrollWidth;else scroll.scrollLeft=Math.min(previousScroll,scroll.scrollWidth-scroll.clientWidth);
  scroll.dataset.initialized='true';renderedProfileCalendarSignature=model.signature;
  $('#profileCalendarSummary').textContent=model.summary;
}
$('#skillArchive').addEventListener('click',async e=>{
  if(e.target.closest('[data-more-skill-archive]')){skillArchiveLimit+=ARCHIVE_PAGE_SIZE;renderSkillArchive();return;}
  const remove=e.target.closest('[data-delete-archived]');
  if(remove){
    const id=remove.dataset.deleteArchived,profile=store.profile||{},baseBranch=BASE.find(x=>x.id===id),baseLeaf=BASE.flatMap(x=>x.leaves).find(x=>x.id===id),customBranch=(profile.customBranches||[]).find(x=>x.id===id),customLeaf=(profile.customLeaves||[]).find(x=>x.id===id);
    const branch=baseBranch||customBranch,ids=[id];
    if(baseBranch)baseBranch.leaves.forEach(leaf=>ids.push(leaf.id));
    if(customBranch)(profile.customLeaves||[]).filter(leaf=>leaf.branch===id).forEach(leaf=>ids.push(leaf.id));
    const label=baseBranch?.name||customBranch?.name||baseLeaf?.name||customLeaf?.name||'навык';
    if(!window.confirm('Удалить «'+label+'» из архива навсегда? Записи в дневнике и уже полученный опыт сохранятся. Вернуть навык через архив будет нельзя.'))return;
    const hidden=new Set(profile.hiddenSkills||[]),purged=new Set(profile.purgedSkills||[]),edits=Object.assign({},profile.skillEdits||{}),quests=(profile.quests||[]).filter(q=>!ids.includes(q.skill));
    if(baseBranch||baseLeaf)ids.forEach(x=>{hidden.add(x);purged.add(x);});
    else ids.forEach(x=>{hidden.delete(x);delete edits[x];});
    const skillArchiveMeta=Object.assign({},profile.skillArchiveMeta||{});ids.forEach(x=>delete skillArchiveMeta[x]);
    const patch={purgedSkills:Array.from(purged),skillEdits:edits,skillArchiveMeta,
      customBranches:(profile.customBranches||[]).filter(x=>!ids.includes(x.id)),
      customLeaves:(profile.customLeaves||[]).filter(x=>!ids.includes(x.id)&&!ids.includes(x.branch)),
      pinnedBranches:(profile.pinnedBranches||[]).filter(x=>!ids.includes(x)),favoriteSkills:(profile.favoriteSkills||[]).filter(x=>!ids.includes(x)),
      recentBranchIds:(profile.recentBranchIds||[]).filter(x=>!ids.includes(x))};
    try{saveState('saving','Удаляю навык…');if(store.mode==='db')await mutateQuests('remove-for-skills',{skillIds:ids,profilePatch:{hiddenSkills:Array.from(hidden)}});else patch.hiddenSkills=Array.from(hidden);if(store.mode!=='db')patch.quests=quests;await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);renderAll();renderSkillArchive();saveState('saved','Сохранено');toast('Навык удалён из архива. Записи и опыт сохранены.');}
    catch(err){saveState('error','Не сохранено');toast('Не удалось удалить навык. Попробуй ещё раз.');}
    return;
  }
  const b=e.target.closest('[data-restore-skill]');if(!b)return;
  const id=b.dataset.restoreSkill,branch=BASE.find(x=>x.id===id)||((store.profile.customBranches||[]).find(x=>x.id===id));
  const ids=[id];if(branch){(branch.leaves||[]).forEach(l=>ids.push(l.id));(store.profile.customLeaves||[]).filter(l=>l.branch===id).forEach(l=>ids.push(l.id));}
  const hidden=(store.profile.hiddenSkills||[]).filter(x=>!ids.includes(x)),skillArchiveMeta=Object.assign({},store.profile.skillArchiveMeta||{});ids.forEach(x=>delete skillArchiveMeta[x]);
  try{saveState('saving','Сохраняю…');await store.saveProfile({hiddenSkills:hidden,skillArchiveMeta});store.profile=Object.assign({},store.profile,{hiddenSkills:hidden,skillArchiveMeta});renderAll();renderSkillArchive();saveState('saved','Сохранено');toast('Навык возвращён в древо.');}catch(err){saveState('error','Не сохранено');toast('Не удалось восстановить навык.');}
});
$('#treeArchive').addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const id=button.dataset.restoreTree||button.dataset.deleteTreeSnapshot;if(!id)return;
  const profile=store.profile||{},archive=Array.isArray(profile.treeArchive)?profile.treeArchive:[],row=archive.find(item=>item&&item.id===id);
  if(!row)return;
  if(button.dataset.deleteTreeSnapshot){if(!confirm('Удалить эту версию древа из архива? Текущая структура и дневник останутся без изменений.'))return;button.disabled=true;try{const treeArchive=archive.filter(item=>item&&item.id!==id);await store.saveProfile({treeArchive});store.profile=Object.assign({},store.profile,{treeArchive});renderTreeArchive();toast('Версия удалена из архива.');}catch{toast('Не удалось удалить версию древа.','error');}return;}
  const tree=row.tree;if(!tree||typeof tree!=='object'){toast('Эта версия древа повреждена.','error');return;}
  if(!confirm('Восстановить эту версию? Текущая структура сначала попадёт в архив, а дневник и заработанный XP не изменятся.'))return;
  const patch={};['customBranches','customLeaves','hiddenSkills','purgedSkills','pinnedBranches','recentBranchIds'].forEach(key=>{patch[key]=Array.isArray(tree[key])?tree[key]:[];});patch.skillEdits=tree.skillEdits&&typeof tree.skillEdits==='object'&&!Array.isArray(tree.skillEdits)?tree.skillEdits:{};
  button.disabled=true;try{await store.saveProfile(patch);store.profile=Object.assign({},store.profile,patch);renderAll();renderTreeArchive();renderSkillArchive();toast('Версия древа восстановлена. Дневник и XP сохранены.');}catch{toast('Не удалось восстановить версию.','error');}
});
let settingsReturnFocus=null,settingsReturnTab='novel';
function closeSettings(){if(activeTab!=='settings')return;show(settingsReturnTab);if(settingsReturnFocus&&settingsReturnFocus.focus)settingsReturnFocus.focus({preventScroll:true});}
$('#settingsToggle').addEventListener('click',()=>{settingsReturnFocus=document.activeElement;settingsReturnTab=activeTab==='settings'?'novel':activeTab;syncSecuritySettings();show('settings');$('#settingsTitle').focus({preventScroll:true});});
$('#settingsClose').addEventListener('click',closeSettings);$('#settingsDone').addEventListener('click',closeSettings);
$('#securityOpenAccount').addEventListener('click',()=>{closeSettings();$('#accountToggle').click();});
$('#securityVerify').addEventListener('click',async()=>{const user=store.auth&&store.auth.currentUser,button=$('#securityVerify'),status=$('#securitySettingsStatus');if(!user)return;button.disabled=true;status.textContent='Отправляю письмо…';try{await user.sendEmailVerification();status.textContent='Письмо отправлено на '+(user.email||'твою почту')+'. Проверь также папку «Спам».';toast('Письмо для подтверждения отправлено.');}catch(error){status.textContent=cloudError(error);toast('Не удалось отправить письмо.','error');}finally{button.disabled=false;}});
$('#securityPasswordReset').addEventListener('click',async()=>{const user=store.auth&&store.auth.currentUser,button=$('#securityPasswordReset'),status=$('#securitySettingsStatus');if(!user||!user.email)return;button.disabled=true;status.textContent='Отправляю ссылку…';try{await store.auth.sendPasswordResetEmail(user.email);status.textContent='Ссылка для сброса пароля отправлена на '+user.email+'.';toast('Письмо для сброса пароля отправлено.');}catch(error){status.textContent=cloudError(error);toast('Не удалось отправить письмо.','error');}finally{button.disabled=false;}});
document.addEventListener('keydown',e=>{if(activeTab==='settings'&&e.key==='Escape')closeSettings();});
$('#profileAccount').addEventListener('click',()=>{$('#accountToggle').click();});
async function saveProfileName(input,button,feedback){
  const value=input.value.trim().replace(/\s+/g,' ').slice(0,24);feedback.textContent='';
  if(!value){feedback.textContent='Введи ник длиной от 1 до 24 символов.';input.focus();return;}
  const original=button.textContent;button.disabled=true;button.textContent='Сохраняю…';
  try{
    const user=store.auth&&store.auth.currentUser,updatedAt=Date.now();
    // The Firestore profile is canonical for Airi. Save it before the optional
    // Firebase Auth display name so a failed profile write cannot leave the two
    // identities disagreeing after the UI reports an error.
    await store.saveProfile({name:value,updatedAt});
    store.profile=Object.assign({},store.profile,{name:value,updatedAt});
    renderProfile();
    if(user){
      try{await user.updateProfile({displayName:value});}
      catch{feedback.textContent='Ник сохранён в профиле, но имя аккаунта не синхронизировалось. Обнови страницу и попробуй ещё раз.';toast('Профиль сохранён; имя аккаунта пока не синхронизировано.','error');return;}
    }
    feedback.textContent='Ник сохранён. Мика будет обращаться к тебе по имени «'+value+'».';toast('Профиль обновлён.');
  }
  catch(error){feedback.textContent=cloudError(error);}
  finally{button.disabled=false;button.textContent=original;}
}
$('#pfSave').addEventListener('click',()=>saveProfileName($('#pfName'),$('#pfSave'),$('#pfFeedback')));
$('#settingsProfileSave').addEventListener('click',()=>saveProfileName($('#settingsProfileName'),$('#settingsProfileSave'),$('#settingsProfileStatus')));
$('#pfExport').addEventListener('click',async()=>{
  const button=$('#pfExport'),original=button.textContent;button.disabled=true;button.textContent='Готовлю копию…';
  try{const result=await downloadUserData();toast('Сохранены профиль, '+num(result.proofs)+' записей и '+num(result.friends)+' друзей.');}
  catch(e){toast(e&&e.message==='HISTORY_LOAD_FAILED'?'Не удалось загрузить весь дневник. Проверь соединение.':e&&e.message==='FRIENDS_EXPORT_FAILED'?'Не удалось загрузить список друзей. Повтори экспорт позже.':'Не удалось сохранить копию.','error');}
  finally{button.disabled=false;button.textContent=original;}
});

/* ---------- scenery ---------- */
const THEME_KEY='upskill-stage-theme-v1';
function applyStageTheme(theme,persist=true){
  const mode=theme==='day'?'day':'night',button=$('#themeToggle'),icon=$('#themeIcon'),label=$('#themeLabel');
  $('#stage').dataset.time=mode;document.body.dataset.themeMode=mode;
  const next=mode==='day'?'ночной':'дневной';
  button.setAttribute('aria-label','Переключить на '+next+' фон');button.title='Переключить на '+next+' фон';button.setAttribute('aria-pressed',String(mode==='day'));
  label.textContent=mode==='day'?'Ночь':'День';
  icon.innerHTML=mode==='day'?'<path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.6 8.6 0 1 0 20.2 15.2Z"/>':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
  if(persist)try{localStorage.setItem(THEME_KEY,mode);}catch{}
}
$('#themeToggle').addEventListener('click',()=>changeThemePreference(document.body.dataset.themeMode==='day'?'night':'day'));
function buildScenery(){
  let savedTheme='night';try{savedTheme=localStorage.getItem(THEME_KEY)||'night';}catch{}
  applyStageTheme(savedTheme,false);
  let seed=7;const r=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  let b='',w='',x=0;
  while(x<400){const wd=14+Math.floor(r()*22),ht=30+Math.floor(r()*70);b+='<rect x="'+x+'" y="'+(120-ht)+'" width="'+wd+'" height="'+ht+'"/>';
    for(let wy=120-ht+6;wy<114;wy+=9)for(let wx=x+4;wx<x+wd-4;wx+=7)if(r()>.62)w+='<rect x="'+wx+'" y="'+wy+'" width="3" height="4"/>';
    x+=wd+(r()>.7?4:0);}
  $('#skyline').innerHTML='<g class="bld">'+b+'</g><g class="win">'+w+'</g>';
  const sh=[];seed=11;
  for(let i=0;i<46;i++)sh.push(Math.floor(r()*980)+'px '+Math.floor(r()*330)+'px 0 0 rgba(255,255,255,'+(0.4+r()*0.6).toFixed(2)+')');
  $('#stars').style.boxShadow=sh.join(',');
}
const petals={cv:null,ctx:null,list:[],raf:0,run:false,
  start(){if(REDUCED||this.run)return;const cv=this.cv||(this.cv=$('#petals'));this.ctx=cv.getContext('2d');this.run=true;this.size();
    if(!this.list.length){for(let i=0;i<16;i++)this.list.push(this.make(true));}
    const loop=()=>{if(!this.run)return;this.step();this.raf=requestAnimationFrame(loop);};this.raf=requestAnimationFrame(loop);},
  stop(){this.run=false;cancelAnimationFrame(this.raf);},
  size(){const cv=this.cv;if(!cv)return;const k=Math.min(2,window.devicePixelRatio||1),r=cv.getBoundingClientRect();if(!r.width)return;cv.width=r.width*k;cv.height=r.height*k;this.k=k;this.w=r.width;this.h=r.height;},
  make(any){return{x:Math.random()*(this.w||400),y:any?Math.random()*(this.h||600):-10,s:3+Math.random()*4,v:.25+Math.random()*.5,sw:Math.random()*6,a:Math.random()*6,va:(Math.random()-.5)*.03};},
  step(){const c=this.ctx,k=this.k||1;if(!this.w)this.size();c.setTransform(k,0,0,k,0,0);c.clearRect(0,0,this.w,this.h);
    this.list.forEach((p,i)=>{p.y+=p.v;p.sw+=.02;p.x+=Math.sin(p.sw)*.5+.15;p.a+=p.va;
      if(p.y>this.h+10||p.x>this.w+10)this.list[i]=this.make(false);
      c.save();c.translate(p.x,p.y);c.rotate(p.a);c.fillStyle='rgba(255,196,220,.8)';c.beginPath();c.ellipse(0,0,p.s,p.s*.55,0,0,6.283);c.fill();c.restore();});}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)petals.stop();else if(activeTab==='novel')petals.start();});
if(window.ResizeObserver){new ResizeObserver(()=>{petals.size();measure();}).observe($('#stage'));}

/* ---------- expression sprites and profile version selector ---------- */
const MIKA_SPRITE_DEFAULT=$('#mika').outerHTML;
function applyMikaArt(){
  const holder=$('.char');if(!holder)return;
  let cv=holder.querySelector('#mika');
  if(!cv){holder.innerHTML=MIKA_SPRITE_DEFAULT;cv=holder.querySelector('#mika');}
  if(cv)setExpr(curExpr);
}
$('#mikaVersionOptions').addEventListener('click',async e=>{
  const button=e.target instanceof Element?e.target.closest('[data-mika-version]'):null;
  if(!button)return;
  const version=button.dataset.mikaVersion;
  if(version!=='old'&&version!=='new')return;
  if(version===currentMikaVersion())return;
  try{await store.saveProfile({mikaVersion:version});store.profile=Object.assign({},store.profile,{mikaVersion:version});applyMikaArt();renderProfile();toast(window.AiryUiLocale?.t?.(version==='old'?'Стандартная версия Мики выбрана.':'Новая версия Мики выбрана.')||(version==='old'?'Стандартная версия Мики выбрана.':'Новая версия Мики выбрана.'));}
  catch(error){toast('Не удалось сохранить версию Мики. Попробуй ещё раз.');}
});

/* ---------- start ---------- */
(async function boot(){
  buildScenery();
  buildTree();S=computeStats([]);renderHud();
  setExpr('idle');$('#line').textContent='';$('#dialog').classList.add('is-empty');
  try{window.UPSKILL_FIREBASE_CONFIG=await window.UPSKILL_FIREBASE_CONFIG_PROMISE;}catch(e){window.UPSKILL_FIREBASE_CONFIG=null;}
  updateServerRuntimeStatus();
  await initStore();
  mikaProfileReady=true;
  renderAll();
  updateServerRuntimeStatus();
  const tab=(location.hash||'').replace('#','');
  show(['novel','tree','journal','ach','archive'].indexOf(tab)>=0?tab:'novel',true);
  scene.instant=true;
  const last=mikaHistory[mikaHistory.length-1];
  const startMika=()=>{if(last&&last.role==='model')talkChat();else play([mikaChatPrompt(last&&last.role==='user'?last.text:'',!mikaHistory.length)]);};
  launchMikaChat=startMika;
  let hasProgress=store.proofs.length>0||mikaHistory.length>0;
  ['quests','customBranches','customLeaves','skillEdits','hiddenSkills','purgedSkills','customPortrait'].forEach(key=>{if(store.profile&&store.profile[key]&&(!Array.isArray(store.profile[key])||store.profile[key].length))hasProgress=true;});
  let welcomeDone=false;try{welcomeDone=localStorage.getItem(ONBOARDING_KEY)==='done';}catch(e){welcomeDone=true;}
  if(!welcomeDone&&!hasProgress){
    $('#welcomeOverlay').hidden=false;
    $('#welcomeStart').focus({preventScroll:true});
  }else if(hasProgress&&!welcomeDone){try{localStorage.setItem(ONBOARDING_KEY,'done');}catch(e){}}
  measure();
  document.documentElement.dataset.airyAppReady='true';
})();
})();
