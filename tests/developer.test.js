import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.js';
import { createDeveloper } from '../server/developer.js';
import { createQueue } from '../server/jobs.js';
import { settings } from '../server/owner-settings.js';
import { safeLogin,createCodexConnection } from '../server/codex-connection.js';
import { codexEnvironment } from '../server/codex-process.js';
import { migrate,SCHEMA_VERSION } from '../server/migrations.js';

const planningWorkspace=args=>args[args.indexOf('-C')+1].endsWith('planning');
async function writePlan(directory,{groups=['presentation','encounter'],files=['public/new-visual.txt'],goal='Improve encounter readability'}={}){
  await writeFile(join(directory,'change-plan.json'),JSON.stringify({goal,affectedFiles:files,invariants:['Turn-based encounter remains'],removals:[],validation:['offline tests']}));
  await writeFile(join(directory,'state-impact.json'),JSON.stringify({goal,affectedStateGroups:groups,affectedFiles:files,invariants:['Turn-based encounter remains'],validation:['offline tests'],recovery:['Discard candidate']}));
  await writeFile(join(directory,'evolution-review.json'),JSON.stringify({mode:'autonomous',problem:'A focused quality opportunity was identified',evidence:['Trusted World Lab evidence will be checked before release'],baseline:{signals:[{name:'World Lab baseline',status:'available',detail:'A deterministic journey capture is the comparison point'}]},hypothesis:'One focused change can improve the identified surface without harming protected journeys.',scope:{primaryVariable:goal,cohort:'Players using the affected surface',reversibility:'reversible'},guardrails:['Preserve protected identity','Retain a prior visual version'],observation:{successSignals:['World Lab remains healthy'],stopSignals:['World Lab regression'],window:'Next World Lab capture'},noChangeCase:'Retain the current version when evidence does not support this change'}));
}

async function harness(fn,{executor}={}) {
  const dir=await mkdtemp(join(tmpdir(),'lw-developer-')),dataDir=join(dir,'data'),store=openStore(join(dataDir,'world.sqlite'));let now=1791628800000;
  const calls=[],link={status:async()=>({available:true,connected:true,account:{type:'chatgpt',email:'fixture@example.invalid'}}),catalog:async()=>[{id:'owner-selected-codex',name:'Fixture model'}],limits:async()=>null,startLogin:async()=>{},cancelLogin:async()=>{},logout:async()=>{},close:async()=>{}};
  const dev=createDeveloper({store,dataDir,clock:()=>now,connection:link,probe:async()=>({ok:true,platform:process.platform}),executor:executor||(async(binary,args,options)=>{
  calls.push({binary,args,options});if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args))await writePlan(candidate);else{await writeFile(join(candidate,'public','new-visual.txt'),'proposed visual improvement');await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Candidate visual',hypothesis:'Clearer feedback may help',expectedOutcome:'Readable feedback',validation:'Offline tests',nextStep:'Observe'}));options.onLine(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Improved the candidate.'}}));}}
    return {code:0,stdout:'Fixture test result',timedOut:false,cancelled:false,overflow:false};
  })});
  const enable=async overrides=>{await dev.verifyIsolation();await dev.saveConfig({enabled:true,model:'owner-selected-codex',dailyRuns:2,dailyMinutes:4,maxMinutes:2,...overrides});};
  try{await fn({dir,dataDir,store,dev,enable,calls,advance:ms=>now+=ms});}finally{await dev.close();store.db.close();await rm(dir,{recursive:true,force:true});}
}
const task={requestKey:'test-request-key-0001',task:'Improve encounter readability while preserving turn-based commands.'};
test('developer requires an owner model, watchdog and isolation; provider API settings stay disabled',async()=>harness(async({dev,enable,store})=>{
  assert.equal(dev.status().config.enabled,false);assert.equal(settings(store.db).ai().modelCallsEnabled,false);
  await assert.rejects(()=>dev.enqueue(task),/configure/);
  await assert.rejects(()=>dev.saveConfig({enabled:true,model:'made-up-model',dailyRuns:2,dailyMinutes:4,maxMinutes:2}),/returned by this account/);
  await assert.rejects(()=>dev.saveConfig({enabled:true,model:'owner-selected-codex',maxMinutes:0}),/watchdog/);
  await enable();assert.equal(dev.status().config.model,'owner-selected-codex');assert.equal(settings(store.db).ai().modelCallsEnabled,false);
}));
test('account job records changes and checks without altering the live source or copying state',async()=>harness(async({dev,enable,store,calls,dataDir})=>{
  const live=await readFile('public/style.css');await enable();const first=await dev.enqueue(task),duplicate=await dev.enqueue(task);assert.equal(first.id,duplicate.id);
  await assert.rejects(()=>dev.enqueue({...task,task:'A different task with the same receipt'}),/another task/);
  await dev.tick();const report=await dev.report(first.id);assert.equal(report.state,'succeeded');assert.equal(report.report.checks.passed,true);assert.equal(report.report.liveRelease,false);assert.ok(report.changes.some(c=>c.path==='public/new-visual.txt'));assert.deepEqual(await readFile('public/style.css'),live);
  const root=report.report.candidate;await assert.rejects(()=>readFile(join(root,'data/world.sqlite')),/ENOENT/);await assert.rejects(()=>readFile(join(root,'.env')),/ENOENT/);
  assert.equal(calls.length,4);assert.equal(calls.filter(c=>c.args[0]==='exec').length,2);assert.ok(calls.find(c=>c.args[0]==='exec').args.includes('owner-selected-codex'));assert.equal(calls[0].options.env.CODEX_HOME,join(dataDir,'codex-home'));assert.equal(calls[0].options.env.OPENAI_API_KEY,undefined);assert.equal(calls[0].options.env.CODEX_API_KEY,undefined);assert.deepEqual(report.report.impact.affectedStateGroups,['presentation','encounter']);
  assert.equal(store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get(first.id).attempts,1);assert.equal(dev.status().usage.reservedMinutes,2);
  assert.ok(store.db.prepare("SELECT 1 FROM admin_audit WHERE action='developer_candidate_completed'").get());
}));
test('local task quotas do not block a second queued repair',async()=>harness(async({dev,enable})=>{
  await enable({dailyRuns:1,dailyMinutes:2});await dev.enqueue(task);await dev.enqueue({...task,requestKey:'test-request-key-0002'});await dev.tick();assert.equal(dev.status().usage.runs,1);
}));
test('interrupted developer leases are terminal, pause execution and require an explicit new attempt',async()=>harness(async({dev,enable,store,advance})=>{
  await enable();const {id}=await dev.enqueue(task),q=createQueue(store.db,()=>1791628800000),claim=q.claim(['codex_development'],45000);assert.equal(claim.id,id);
  store.db.prepare("UPDATE developer_runs SET state='running',started_at=1791628800000 WHERE id=?").run(id);advance(45001);
  const status=dev.status();assert.equal(status.runs[0].state,'interrupted');assert.equal(status.config.enabled,false);assert.equal(store.db.prepare('SELECT state FROM jobs WHERE id=?').get(id).state,'failed');assert.equal(q.finish(claim,{}),false);
}));
test('cancelling a queued task consumes no account attempt and pausing aborts a running attempt',async()=>{
  let began,started=new Promise(r=>began=r);
  await harness(async({dev,enable,store})=>{
    await enable();const queued=await dev.enqueue(task);dev.cancel(queued.id);assert.equal(store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get(queued.id).attempts,0);
    const next=await dev.enqueue({...task,requestKey:'test-request-key-0002'});const running=dev.tick();await started;
    await dev.saveConfig({...dev.status().config,enabled:false});await running;assert.equal((await dev.report(next.id)).state,'cancelled');assert.equal(dev.status().config.enabled,false);
  },{executor:async(binary,args,options)=>{began();await new Promise(accept=>options.signal.addEventListener('abort',accept,{once:true}));return {code:1,stdout:'',cancelled:true};}});
});
test('failure keeps artifacts and never automatically retries account inference',async()=>harness(async({dev,enable,store})=>{
  await enable();const {id}=await dev.enqueue(task);await dev.tick();assert.equal((await dev.report(id)).state,'failed');await dev.tick();assert.equal(store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get(id).attempts,1);
},{executor:async()=>({code:1,stdout:'',timedOut:false})}));
test('lease renewal requires the current token and cannot resurrect an expired worker',async()=>harness(async({store,advance})=>{
  let now=1000;const q=createQueue(store.db,()=>now);q.enqueue('custom',{},'renew-test');const job=q.claim(['custom'],100);now=1099;assert.equal(q.renew(job,100),true);now=1199;assert.equal(q.renew(job,100),false);assert.equal(q.renew({...job,token:'stale'},100),false);
}));
test('sign-in links must use the supported OpenAI authority; only sanitized account data is returned',async()=>{
  assert.throws(()=>safeLogin({type:'chatgpt',authUrl:'javascript:alert(1)'}),/Unexpected/);assert.throws(()=>safeLogin({type:'chatgpt',authUrl:'https://auth.openai.com.evil.invalid/'}),/Unexpected/);
  let callback;const sent=[];const link=createCodexConnection({home:resolve('work/unused-fixture'),cwd:resolve('.'),rpcFactory:options=>{callback=options.onNotification;return {request:async(method,params)=>{sent.push({method,params});if(method==='account/read')return {account:{type:'chatgpt',email:'fixture',planType:'pro',accessToken:'must-not-return'}};if(method==='account/login/start')return {type:'chatgptDeviceCode',loginId:'fixture-id',verificationUrl:'https://auth.openai.com/codex/device',userCode:'ABCD-1234',token:'must-not-return'};return {};},close:async()=>{}};}});
  try{assert.ok(!JSON.stringify(await link.status()).includes('must-not-return'));await assert.rejects(()=>link.startLogin('apiKey'),/browser or headless/);const login=await link.startLogin('chatgptDeviceCode');assert.equal(login.userCode,'ABCD-1234');callback('account/login/completed',{loginId:'fixture-id',success:true});assert.equal((await link.status()).login,null);assert.ok(!sent.some(r=>r.method==='turn/start'));}finally{await link.close();}
});
test('developer migration rollback preserves schema 4 and old history',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-developer-migration-')),db=new DatabaseSync(join(dir,'world.sqlite'));
  try{migrate(db);db.exec("INSERT INTO players VALUES('historic',9,12);DROP TABLE agent_messages;DROP TABLE developer_lessons;DROP TABLE visual_releases;DROP TABLE developer_runs;PRAGMA user_version=4;CREATE TABLE developer_runs(id TEXT);");assert.throws(()=>migrate(db),/already exists/);assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);assert.equal(db.prepare('SELECT x FROM players').get().x,9);db.exec('DROP TABLE developer_runs');migrate(db);assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);}finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('self-directed work carries outcomes and publishes only validated art data without a local daily quota',async()=>harness(async({dev,enable,store,advance})=>{
  await enable();dev.saveAutonomy({enabled:true,intervalMinutes:30,automaticVisuals:true});
  const original=settings(store.db).ai(),live=await readFile('public/art.json');
  await dev.tick();const status=dev.status();assert.equal(status.runs.length,1);assert.equal(status.runs[0].origin,'autonomous');assert.ok(status.visuals.active);
  const report=await dev.report(status.runs[0].id);assert.equal(report.report.liveRelease,true);assert.equal(report.report.release.state,'published');assert.equal(status.autonomy.lessons[0].outcome,'visual_published');
  assert.deepEqual(settings(store.db).ai(),original);assert.deepEqual(await readFile('public/art.json'),live);await dev.tick();assert.equal(dev.status().runs.length,1);
  advance(30*60000);await dev.tick();assert.equal(dev.status().runs.length,2);const latest=store.db.prepare("SELECT context FROM developer_runs ORDER BY created_at DESC LIMIT 1").get();assert.ok(JSON.parse(latest.context).outcomes.length);
  advance(30*60000);await dev.tick();assert.equal(dev.status().runs.length,3);dev.rollbackVisuals();assert.equal(dev.status().autonomy.config.automaticVisuals,false);
},{executor:async(binary,args,options)=>{
  if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args))await writePlan(candidate,{groups:['presentation'],files:['public/art.json'],goal:'Improve terrain coherence'});else{const pack=JSON.parse(await readFile(join(candidate,'public/art.json'),'utf8'));pack.name='Original dusk visual experiment';pack.palette.grass='#597047';await writeFile(join(candidate,'public/art.json'),JSON.stringify(pack));await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Dusk palette',hypothesis:'Terrain may become more coherent',expectedOutcome:'Readable original terrain',validation:'Compare scenes; artistic claim unverified',nextStep:'Observe feedback'}));}}
  return {code:0,stdout:'Checks passed',timedOut:false,cancelled:false,overflow:false};
}}));
test('self-directed work receives bounded Ask and Plan context as data',async()=>harness(async({dev,enable,store})=>{
  store.db.prepare("INSERT INTO agent_messages(id,speaker,kind,body,status,evidence,created_at) VALUES ('ask','owner','direction','Is the current command bar readable at game scale?','stored',?,1)").run(JSON.stringify({source:'owner',interaction:'ask',treatedAs:'data'}));
  store.db.prepare("INSERT INTO agent_messages(id,speaker,kind,body,status,evidence,created_at) VALUES ('plan','owner','direction','Preserve command-driven encounters while improving readability.','stored',?,2)").run(JSON.stringify({source:'owner',interaction:'plan',treatedAs:'data'}));
  await enable();dev.saveAutonomy({enabled:true,intervalMinutes:30,automaticVisuals:false});await dev.tick();
  const context=JSON.parse(store.db.prepare("SELECT context FROM developer_runs WHERE origin='autonomous' LIMIT 1").get().context);
  assert.deepEqual(context.ownerStudioGuidance.map(entry=>entry.mode),['ask','plan']);
  assert.match(context.guidanceBoundary,/untrusted planning data/);
}));
test('failed candidate checks never publish art and record an empirical failure rather than a model success claim',async()=>harness(async({dev,enable})=>{
  await enable();dev.saveAutonomy({enabled:true,intervalMinutes:30,automaticVisuals:true});await dev.tick();assert.equal(dev.status().visuals.active,null);assert.equal(dev.status().autonomy.lessons[0].outcome,'checks_failed');
},{executor:async(binary,args,options)=>{
  if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args)){await writePlan(candidate,{groups:['presentation'],files:['public/art.json'],goal:'Proposed art'});return {code:0,stdout:''};}const pack=JSON.parse(await readFile(join(candidate,'public/art.json'),'utf8'));pack.name='Proposed palette';await writeFile(join(candidate,'public/art.json'),JSON.stringify(pack));await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Proposed art',hypothesis:'Claim',expectedOutcome:'Claim',validation:'Claim',nextStep:'Claim'}));return {code:0,stdout:''};}
  return args[0]==='sandbox'?{code:1,stdout:'Regression observed'}:{code:0,stdout:'Prompt prepared'};
}}));
test('a candidate that changes a stateful surface without declaring it is incomplete and cannot publish',async()=>harness(async({dev,enable})=>{
  await enable();dev.saveAutonomy({enabled:true,intervalMinutes:30,automaticVisuals:true});await dev.tick();const run=dev.status().runs[0],report=await dev.report(run.id);
  assert.equal(report.report.checks.passed,true);assert.equal(report.report.checks.discipline.passed,false);assert.deepEqual(report.report.checks.discipline.missingStateGroups,['presentation']);assert.equal(report.report.release.state,'not_requested');assert.equal(dev.status().visuals.active,null);assert.equal(dev.status().autonomy.lessons[0].outcome,'candidate_incomplete');
},{executor:async(binary,args,options)=>{
  if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args)){await writePlan(candidate,{groups:['encounter'],files:['public/art.json'],goal:'Visual change'});}else{const pack=JSON.parse(await readFile(join(candidate,'public/art.json'),'utf8'));pack.name='Undeclared visual change';await writeFile(join(candidate,'public/art.json'),JSON.stringify(pack));await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Undeclared art',hypothesis:'Claim',expectedOutcome:'Claim',validation:'Claim',nextStep:'Claim'}));}}
  return {code:0,stdout:'Checks passed',timedOut:false,cancelled:false,overflow:false};
}}));
test('a planning workspace cannot alter source before its impact declaration is approved',async()=>harness(async({dev,enable})=>{
  await enable();const {id}=await dev.enqueue(task);await dev.tick();const report=await dev.report(id);
  assert.equal(report.state,'failed');assert.match(report.error,/Planning altered source/);
},{executor:async(binary,args)=>{
  if(args[0]==='exec'){const directory=args[args.indexOf('-C')+1];await writePlan(directory);await writeFile(join(directory,'server','game.js'),'unexpected planning edit');}
  return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};
}}));
