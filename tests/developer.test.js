import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
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
import { snapshotProject } from '../server/developer-sandbox.js';

const planningWorkspace=args=>args[args.indexOf('-C')+1].endsWith('planning');

test('an owner can continue a held stage as fresh untrusted data without changing history or settings',async()=>harness(async({dev,enable,store})=>{
 await enable();const saved={...dev.status().config};const first=await dev.enqueue({...task,requestKey:'held-stage-resume-fixture'});const held={checks:{passed:true,discipline:{passed:true}},promotion:{state:'rejected',reason:'Preparation timed out'},release:{state:'not_requested'},liveRelease:false};
 store.db.prepare("UPDATE developer_runs SET state='succeeded',report=? WHERE id=?").run(JSON.stringify(held),first.id);store.db.prepare("UPDATE jobs SET state='failed',error='Fixture stage rejected' WHERE id=?").run(first.id);
 await assert.rejects(()=>dev.enqueue({...task,requestKey:'held-autonomous-fixture',resumeFrom:first.id},'autonomous'),/Only an owner/);
 const next=await dev.resumeRun({id:first.id});assert.notEqual(next.id,first.id);assert.deepEqual(dev.status().config,saved);assert.equal((await dev.report(first.id)).state,'succeeded');
 // No candidate manifest exists in this fixture, so Resume starts a fresh
 // objective; a real retained copy still passes the normal hash/plan checks.
 assert.equal((await dev.report(next.id)).state,'queued');dev.stopRun(next.id);store.db.prepare('UPDATE developer_runs SET report=? WHERE id=?').run(JSON.stringify({...held,release:{state:'published'},liveRelease:true}),first.id);await assert.rejects(()=>dev.resumeRun({id:first.id}),/stopped or unsuccessful/);
}));

test('composer stop pauses scheduling and resume starts a fresh run without changing model or limits',async()=>harness(async({dev,enable})=>{
 await enable();const original={...dev.status().config};const first=await dev.enqueue({...task,requestKey:'composer-stop-fixture'});dev.stopRun(first.id);assert.equal(dev.status().config.enabled,false);assert.equal((await dev.report(first.id)).state,'cancelled');await dev.tick();assert.equal(dev.status().active,null);
 const next=await dev.resumeRun({id:first.id,text:'Keep the previous constraints.'});assert.notEqual(next.id,first.id);assert.deepEqual(dev.status().config,original);assert.equal((await dev.report(first.id)).state,'cancelled');assert.equal((await dev.report(next.id)).state,'queued');await assert.rejects(()=>dev.resumeRun({id:next.id}),/stopped or unsuccessful/);
}));

test('questions return a public answer with no implementation, source changes or promotion',async()=>{
 let calls=0;await harness(async({dev,enable})=>{await enable();const run=await dev.enqueue({...task,requestKey:'question-readonly-fixture'},'owner_question');await dev.tick();const result=await dev.report(run.id);assert.equal(result.state,'succeeded');assert.equal(result.report.kind,'conversation');assert.equal(result.report.summary,'The Warden telegraphs its next action.');assert.equal(result.report.liveRelease,false);assert.equal(result.changes.length,0);assert.equal(calls,1);},{executor:async(binary,args,options)=>{if(args[0]==='exec'){calls++;options.onLine(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'The Warden telegraphs its next action.'}}));}return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};}});
});

test('resuming a stopped question preserves the read-only question lane',async()=>harness(async({dev,enable})=>{
 await enable();const first=await dev.enqueue({...task,requestKey:'question-resume-fixture'},'owner_question');dev.stopRun(first.id);const next=await dev.resumeRun({id:first.id,text:'Please explain the evidence too.'});assert.equal((await dev.report(next.id)).origin,'owner_question');assert.equal(dev.status().config.enabled,false);await dev.tick();const result=await dev.report(next.id);assert.equal(result.state,'succeeded');assert.equal(result.report.kind,'conversation');assert.equal(result.report.liveRelease,false);assert.deepEqual(result.report.changedFiles,[]);
},{executor:async(binary,args,options)=>{if(args[0]==='exec')options.onLine(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'The retained evidence confirms the cue.'}}));return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};}}));

test('question output cannot promote source changes even if the model claims success',async()=>harness(async({dev,enable})=>{await enable();const run=await dev.enqueue({...task,requestKey:'question-mutation-fixture'},'owner_question');await dev.tick();const result=await dev.report(run.id);assert.equal(result.state,'failed');assert.match(result.error,/altered source/);assert.notEqual(result.report.release.state,'published');},{executor:async(binary,args,options)=>{if(args[0]==='exec'){await writeFile(join(args[args.indexOf('-C')+1],'public/unasked.txt'),'not authorized by a question');options.onLine(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'Success!'}}));}return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};}}));

test('owner recovery uses a fresh plan and sandbox seed, without replaying prior execution or expanding scheduling authority',async()=>{
  let implementations=0;
  await harness(async({dev,enable,store})=>{
    await enable();const first=await dev.enqueue({...task,requestKey:'fixture-recovery-01'});await dev.tick();assert.equal((await dev.report(first.id)).state,'failed');
    await assert.rejects(()=>dev.enqueue({...task,requestKey:'fixture-recovery-auto',resumeFrom:first.id},'autonomous'),/Only an owner/);
    const second=await dev.enqueue({...task,requestKey:'fixture-recovery-02',resumeFrom:first.id});await dev.tick();const result=await dev.report(second.id);assert.equal(result.state,'succeeded');assert.equal(implementations,2);assert.ok(result.changes.some(c=>c.path==='public/recovered.txt'));
    assert.equal(JSON.parse(store.db.prepare('SELECT context FROM developer_runs WHERE id=?').get(second.id).context).recovery.runId,first.id);
    await assert.rejects(()=>dev.enqueue({...task,requestKey:'fixture-recovery-success',resumeFrom:second.id}),/terminal unsuccessful/);
  },{executor:async(binary,args,options)=>{
    if(args[0]==='exec'){
      const candidate=args[args.indexOf('-C')+1];
      if(planningWorkspace(args)){const preview=await readFile(join(candidate,'.scratch/recovery-preview/changes.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(preview)assert.ok(JSON.parse(preview).some(c=>c.path==='public/recovered.txt'&&c.after==='retained source data'));await writePlan(candidate,{files:['public/recovered.txt']});}
      else if(++implementations===1){await writeFile(join(candidate,'public/recovered.txt'),'retained source data');throw Error('Synthetic stopped attempt');}
      else{assert.equal(await readFile(join(candidate,'public/recovered.txt'),'utf8'),'retained source data');assert.equal(JSON.parse(await readFile(join(candidate,'.scratch/recovery-record.json'),'utf8')).priorChecksReusable,false);const recoveryRecord=JSON.parse(await readFile(join(candidate,'.scratch/recovery-record.json'),'utf8'));await writeFile(join(candidate,'.scratch/recovery-acceptance.json'),JSON.stringify({runId:recoveryRecord.runId,accepted:true}));await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Recovered candidate',hypothesis:'fixture',expectedOutcome:'fixture',validation:'fixture',nextStep:'fixture'}));}
    }
    return {code:0,stdout:'fixture checks',timedOut:false,cancelled:false,overflow:false};
  }});
});
async function writePlan(directory,{groups=['presentation','encounter'],files=['public/new-visual.txt'],goal='Improve encounter readability'}={}){
  await writeFile(join(directory,'change-plan.json'),JSON.stringify({goal,affectedFiles:files,invariants:['Turn-based encounter remains'],removals:[],validation:['offline tests']}));
  await writeFile(join(directory,'state-impact.json'),JSON.stringify({goal,affectedStateGroups:groups,affectedFiles:files,invariants:['Turn-based encounter remains'],validation:['offline tests'],recovery:['Discard candidate']}));
  await writeFile(join(directory,'evolution-review.json'),JSON.stringify({mode:'autonomous',problem:'A focused quality opportunity was identified',evidence:['Trusted World Lab evidence will be checked before release'],baseline:{signals:[{name:'World Lab baseline',status:'available',detail:'A deterministic journey capture is the comparison point'}]},hypothesis:'One focused change can improve the identified surface without harming protected journeys.',scope:{primaryVariable:goal,cohort:'Players using the affected surface',reversibility:'reversible'},guardrails:['Preserve protected identity','Retain a prior visual version'],observation:{successSignals:['World Lab remains healthy'],stopSignals:['World Lab regression'],window:'Next World Lab capture'},noChangeCase:'Retain the current version when evidence does not support this change'}));
}

async function harness(fn,{executor,labBaseline=false,sourceReleases,operatorReleases,sandboxCleanup}={}) {
  const dir=await mkdtemp(join(tmpdir(),'lw-developer-')),dataDir=join(dir,'data'),store=openStore(join(dataDir,'world.sqlite'));let now=1791628800000;
  let projectDir=resolve('.');
  if(labBaseline){
    projectDir=join(dir,'fixture-project');
    await snapshotProject(resolve('.'),projectDir,join(dir,'fixture-baseline'));
    const lab=join(projectDir,'outputs','world-lab','micro');await mkdir(lab,{recursive:true});
    await writeFile(join(lab,'report.json'),JSON.stringify({version:2,fixture:'micro',capturedAt:'2026-10-10T00:00:00Z',checks:{passed:true},metrics:{fixture:true},nextAutonomousQuestion:'Synthetic unit-test baseline; not player evidence'}));
  }
  const calls=[],link={status:async()=>({available:true,connected:true,account:{type:'chatgpt',email:'fixture@example.invalid'}}),catalog:async()=>[{id:'owner-selected-codex',name:'Fixture model'}],limits:async()=>null,startLogin:async()=>{},cancelLogin:async()=>{},logout:async()=>{},close:async()=>{}};
  const dev=createDeveloper({store,dataDir,projectDir,sourceReleases,operatorReleases,sandboxCleanup,clock:()=>now,connection:link,probe:async()=>({ok:true,platform:process.platform}),executor:executor||(async(binary,args,options)=>{
  calls.push({binary,args,options});if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];options.onLine(JSON.stringify({type:'item.completed',item:{id:'fixture-tool',type:'command_execution',command:'rg private-argument',exit_code:0,aggregated_output:'private-output'}}));if(planningWorkspace(args))await writePlan(candidate);else{await writeFile(join(candidate,'public','new-visual.txt'),'proposed visual improvement');await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Candidate visual',hypothesis:'Clearer feedback may help',expectedOutcome:'Readable feedback',validation:'Offline tests',nextStep:'Observe'}));options.onLine(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Improved the candidate.'}}));}}
    return {code:0,stdout:'Fixture test result',timedOut:false,cancelled:false,overflow:false};
  })});
  const enable=async overrides=>{await dev.verifyIsolation();await dev.saveConfig({enabled:true,model:'owner-selected-codex',dailyRuns:2,dailyMinutes:4,maxMinutes:2,...overrides});};
  try{await fn({dir,dataDir,store,dev,enable,calls,advance:ms=>now+=ms});}finally{await dev.close();store.db.close();await rm(dir,{recursive:true,force:true});}
}
const task={requestKey:'test-request-key-0001',task:'Improve encounter readability while preserving turn-based commands.'};
test('autonomous candidate pipeline installs operator-only changes without redeploying the realm',async()=>{
  const calls=[];const artifact={manifest:{sourceHash:'tested-operator'}};
  const sourceReleases={start:async()=>{},status:()=>({ready:true,configured:true,automatic:true}),baseline:()=>({source:resolve('.'),hash:'game-baseline'}),artBaseline:async()=>null,observations:()=>null,stage:async()=>{calls.push('source-stage');return {state:'staged',artifact};},deploy:async()=>{throw Error('Operator-only changes must not redeploy player world');},close:async()=>{}};
  const operatorReleases={start:async()=>{},status:()=>({ready:false,configured:true}),baseline:()=>null,stage:async input=>{assert.equal(input.artifact,artifact);calls.push('operator-stage');return input;},deploy:async(input,{authorize})=>{assert.equal(authorize(),true);calls.push('operator-deploy');return {state:'published',sourceHash:'tested-operator'};},close:async()=>{}};
  await harness(async({dev,enable,store})=>{await enable();const saved=JSON.stringify(dev.status().config);const {id}=await dev.enqueue(task);await dev.tick();const report=await dev.report(id);assert.equal(report.state,'succeeded');assert.equal(report.report.release.kind,'host_operator');assert.deepEqual(calls,['source-stage','operator-stage','operator-deploy']);assert.equal(JSON.stringify(dev.status().config),saved);assert.equal(store.db.prepare('SELECT outcome FROM developer_lessons WHERE run_id=?').get(id).outcome,'operator_published');},{sourceReleases,operatorReleases,executor:async(binary,args,options)=>{
    if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args))await writePlan(candidate,{groups:['studio.candidate','operations.release'],files:['operator/index.js'],goal:'Improve installed operator diagnostics'});else{await writeFile(join(candidate,'operator/index.js'),'// verified candidate fixture, never execute on host');await writeFile(join(candidate,'development-result.json'),JSON.stringify({title:'Operator improvement',hypothesis:'Improve diagnostics',expectedOutcome:'Inspectable tool outcomes',validation:'Independent staging',nextStep:'Observe operator'}));}}
    return {code:0,stdout:'Fixture only',timedOut:false,cancelled:false,overflow:false};
  }});
});
test('developer requires an owner model, explicit time policy and isolation; provider API settings stay disabled',async()=>harness(async({dev,enable,store})=>{
  assert.equal(dev.status().config.enabled,false);assert.equal(settings(store.db).ai().modelCallsEnabled,false);
  await assert.rejects(()=>dev.enqueue(task),/configure/);
  await assert.rejects(()=>dev.saveConfig({enabled:true,model:'made-up-model',dailyRuns:2,dailyMinutes:4,maxMinutes:2}),/returned by this account/);
  await assert.rejects(()=>dev.saveConfig({enabled:true,model:'owner-selected-codex',maxMinutes:0}),/watchdog/);
  await enable();assert.equal(dev.status().config.model,'owner-selected-codex');assert.equal(settings(store.db).ai().modelCallsEnabled,false);
}));
test('explicit unlimited attempts preserve isolation and omit planning, execution and check timers',async()=>harness(async({dev,enable,store,calls})=>{
  await enable({maxMinutes:null});
  assert.equal(dev.status().config.maxMinutes,null);
  const {id}=await dev.enqueue(task);await dev.tick();
  assert.equal((await dev.report(id)).state,'succeeded');
  assert.equal(store.db.prepare('SELECT max_minutes FROM developer_runs WHERE id=?').get(id).max_minutes,0);
  assert.ok(calls.filter(call=>call.args[0]==='exec'||call.args[0]==='sandbox').every(call=>call.options.timeoutMs===null));
  assert.equal(calls.filter(call=>call.args[0]==='debug').length,0);
}));
test('adding a finite limit blocks a previously queued unlimited attempt',async()=>harness(async({dev,enable,calls})=>{
  await enable({maxMinutes:null});const {id}=await dev.enqueue(task);
  await dev.saveConfig({...dev.status().config,maxMinutes:2});await dev.tick();
  assert.equal((await dev.report(id)).state,'failed');assert.equal(calls.length,0);
}));
test('account job records changes and checks without altering the live source or copying state',async()=>harness(async({dev,enable,store,calls,dataDir})=>{
  const live=await readFile('public/style.css');await enable();const first=await dev.enqueue(task),duplicate=await dev.enqueue(task);assert.equal(first.id,duplicate.id);
  await assert.rejects(()=>dev.enqueue({...task,task:'A different task with the same receipt'}),/another task/);
  await dev.tick();const report=await dev.report(first.id);assert.equal(report.state,'succeeded');assert.equal(report.report.checks.passed,true);assert.equal(report.report.liveRelease,false);assert.ok(report.changes.some(c=>c.path==='public/new-visual.txt'));assert.deepEqual(await readFile('public/style.css'),live);
  const root=report.report.candidate;await assert.rejects(()=>readFile(join(root,'data/world.sqlite')),/ENOENT/);await assert.rejects(()=>readFile(join(root,'.env')),/ENOENT/);
  assert.deepEqual(await readFile(join(root,'ui/components/observatory.tsx')),await readFile('ui/components/observatory.tsx'));
  await assert.rejects(()=>readFile(join(root,'ui/.next/BUILD_ID')),/ENOENT/);
  await assert.rejects(()=>readFile(join(root,'ui/out/index.html')),/ENOENT/);
  assert.equal(calls.length,3);assert.equal(calls.filter(c=>c.args[0]==='exec').length,2);assert.ok(calls.find(c=>c.args[0]==='exec').args.includes('owner-selected-codex'));assert.equal(calls[0].options.env.CODEX_HOME,join(dataDir,'codex-home'));assert.equal(calls[0].options.env.OPENAI_API_KEY,undefined);assert.equal(calls[0].options.env.CODEX_API_KEY,undefined);assert.deepEqual(report.report.impact.affectedStateGroups,['presentation','encounter']);
  assert.equal(store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get(first.id).attempts,1);assert.equal(dev.status().usage.reservedMinutes,2);
  assert.ok(store.db.prepare("SELECT 1 FROM admin_audit WHERE action='developer_candidate_completed'").get());
  const context=JSON.parse(store.db.prepare('SELECT context FROM developer_runs WHERE id=?').get(first.id).context);
  assert.equal(context.routing.model,'owner-selected-codex');assert.equal(context.execution.tools.length,2);
  assert.equal(context.execution.tools[0].stage,'planning');assert.equal(context.execution.tools[1].stage,'implementation');
  assert.ok(!JSON.stringify(context.execution).includes('private-argument'));assert.ok(!JSON.stringify(context.execution).includes('private-output'));
}));
test('local task quotas do not block a second queued repair',async()=>harness(async({dev,enable})=>{
  await enable({dailyRuns:1,dailyMinutes:2});await dev.enqueue(task);await dev.enqueue({...task,requestKey:'test-request-key-0002'});await dev.tick();assert.equal(dev.status().usage.runs,1);
}));
test('evidence counts actual outcomes and repeated failures do not advertise ready',async()=>harness(async({dev,store,enable})=>{
  assert.deepEqual(dev.status().evidence,{attempts:0,completed:0,published:0});
  await enable();
  for(let i=0;i<3;i++){
    const {id}=await dev.enqueue({...task,requestKey:`fixture-failure-request-${i}`});
    store.db.prepare("UPDATE developer_runs SET state='failed' WHERE id=?").run(id);
    store.db.prepare("UPDATE jobs SET state='failed' WHERE id=?").run(id);
    store.db.prepare('INSERT INTO developer_lessons VALUES (?,?,?,?,?)').run(id,'execution_failed','Fixture failure','{}',i+1);
  }
  const status=dev.status();assert.equal(status.autonomy.circuitOpen,true);assert.equal(status.activity.state,'blocked');assert.equal(status.activity.active,false);
  assert.match(status.activity.current,/No autonomous cycle is running/);
  assert.deepEqual(status.evidence,{attempts:3,completed:0,published:0});
}));
test('interrupted leases stay terminal without rewriting owner activation; recovery is a fresh attempt',async()=>harness(async({dev,enable,store,advance})=>{
  await enable();const {id}=await dev.enqueue(task),q=createQueue(store.db,()=>1791628800000),claim=q.claim(['codex_development'],45000);assert.equal(claim.id,id);
  store.db.prepare("UPDATE developer_runs SET state='running',started_at=1791628800000 WHERE id=?").run(id);advance(45001);
  const status=dev.status();assert.equal(status.runs[0].state,'interrupted');assert.equal(status.config.enabled,true);assert.equal(store.db.prepare('SELECT state FROM jobs WHERE id=?').get(id).state,'failed');assert.equal(q.finish(claim,{}),false);
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
},{labBaseline:true,executor:async(binary,args,options)=>{
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
test('UI changes require presentation impact and remain unreleased source proposals',async()=>harness(async({dev,enable})=>{
  await enable();const {id}=await dev.enqueue(task);await dev.tick();const result=await dev.report(id);
  assert.ok(result.changes.some(change=>change.path==='ui/app/globals.css'));
  assert.deepEqual(result.report.checks.discipline.missingStateGroups,['presentation']);
  assert.equal(result.report.evaluation.state,'incomplete');assert.equal(result.report.liveRelease,false);
},{executor:async(binary,args)=>{
  if(args[0]==='exec'){
    const directory=args[args.indexOf('-C')+1];
    if(planningWorkspace(args))await writePlan(directory,{groups:['encounter'],files:['ui/app/globals.css']});
    else await writeFile(join(directory,'ui/app/globals.css'),'/* fixture UI change */');
  }
  return {code:0,stdout:'Fixture checks passed',timedOut:false,cancelled:false,overflow:false};
}}));

test('protected edits stay blocked in outcome memory even when candidate tests pass',async()=>harness(async({dev,enable})=>{
  await enable();const {id}=await dev.enqueue(task);await dev.tick();const result=await dev.report(id);
  assert.equal(result.report.checks.passed,true);assert.equal(result.report.evaluation.state,'blocked');
  assert.equal(result.report.liveRelease,false);assert.match(result.progress,/blocked/);
  const lesson=dev.status().autonomy.lessons[0];assert.equal(lesson.outcome,'candidate_blocked');assert.match(lesson.finding,/protected boundary/);
  assert.equal(dev.status().visuals.active,null);
},{executor:async(binary,args)=>{
  if(args[0]==='exec'){
    const directory=args[args.indexOf('-C')+1];
    if(planningWorkspace(args))await writePlan(directory,{groups:['presentation'],files:['docs/CONSTITUTION.md']});
    else await writeFile(join(directory,'docs/CONSTITUTION.md'),'Untrusted attempt to replace protected identity');
  }
  return {code:0,stdout:'Fixture checks passed',timedOut:false,cancelled:false,overflow:false};
}}));

test('a planning workspace cannot alter source before its impact declaration is approved',async()=>harness(async({dev,enable})=>{
  await enable();const {id}=await dev.enqueue(task);await dev.tick();const report=await dev.report(id);
  assert.equal(report.state,'failed');assert.match(report.error,/Planning altered source/);
},{executor:async(binary,args)=>{
  if(args[0]==='exec'){const directory=args[args.indexOf('-C')+1];await writePlan(directory);await writeFile(join(directory,'server','game.js'),'unexpected planning edit');}
  return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};
}}));


test('Stop, Ask, then Resume keeps the suspended game task and question context',async()=>harness(async({dev,enable,store})=>{
  await enable();const saved={...dev.status().config};const game=await dev.enqueue({...task,requestKey:'stop-ask-resume-game'});dev.stopRun(game.id);
  assert.equal(dev.status().resumeTarget.id,game.id);
  const question=await dev.enqueue({requestKey:'stop-ask-resume-question',task:'Explain the earlier task.'},'owner_question');await dev.tick();
  assert.equal((await dev.report(question.id)).state,'succeeded');assert.equal(dev.status().config.enabled,false);assert.equal(dev.status().resumeTarget.id,game.id);
  const next=await dev.resumeRun({id:dev.status().resumeTarget.id,text:'Continue after that explanation.'});assert.deepEqual(dev.status().config,saved);
  const context=JSON.parse((await dev.report(next.id)).context);assert.equal(context.continuation.previousRun,game.id);assert.equal(context.continuation.conversation[0].id,question.id);assert.equal(dev.status().resumeTarget,null);
},{executor:async(binary,args,options)=>{if(args[0]==='exec')options.onLine(JSON.stringify({type:'item.completed',item:{id:'answer',type:'agent_message',text:'The earlier task remains retained.'}}));return {code:0,stdout:'',timedOut:false,cancelled:false,overflow:false};}}));

test('automatic recovery starts a new checked attempt after backoff without replaying the failed job or settings',async()=>harness(async({dev,enable,store,advance})=>{
 await enable();dev.saveAutonomy({enabled:true,intervalMinutes:30,automaticVisuals:false});const saved=JSON.stringify(store.db.prepare('SELECT * FROM owner_settings ORDER BY key').all());
 const first=await dev.enqueue({...task,requestKey:'automatic-repair-fixture'});store.db.prepare("UPDATE developer_runs SET state='failed',error='Contained readiness failure',finished_at=created_at WHERE id=?").run(first.id);store.db.prepare("UPDATE jobs SET state='failed',error='Fixture failure' WHERE id=?").run(first.id);
 // Ordinary cadence is due, so suppress that independent selection while the
 // recovery-specific backoff is checked. A recovery is allowed through it.
 for(let n=0;n<3;n++)dev.status();advance(5*60000);await dev.tick();
 const rows=store.db.prepare('SELECT id,state,context FROM developer_runs ORDER BY created_at DESC,rowid DESC').all();assert.equal(rows.length,2);assert.notEqual(rows[0].id,first.id);const context=JSON.parse(rows[0].context);assert.equal(context.automaticRecovery.previousRun,first.id);assert.equal(context.automaticRecovery.attempt,1);assert.equal(rows[1].state,'failed');assert.equal(store.db.prepare('SELECT state FROM jobs WHERE id=?').get(first.id).state,'failed');assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM owner_settings ORDER BY key').all()),saved);
}));

test('a protected retained patch becomes data for manual reconstruction, never imported authority',async()=>{
 let attempts=0;
 await harness(async({dev,enable})=>{await enable();const first=await dev.enqueue({...task,requestKey:'protected-recovery-data'});await dev.tick();assert.equal((await dev.report(first.id)).state,'failed');const next=await dev.resumeRun({id:first.id});await dev.tick();const report=await dev.report(next.id);assert.equal(report.state,'succeeded');assert.ok(!report.changes.some(c=>c.path==='AGENTS.md'));assert.equal(report.report.liveRelease,false);},{executor:async(binary,args)=>{
  if(args[0]==='exec'){const candidate=args[args.indexOf('-C')+1];if(planningWorkspace(args))await writePlan(candidate,{files:['public/reconstructed.txt']});else if(++attempts===1){await writeFile(join(candidate,'AGENTS.md'),'unsafe retained instructions');throw Error('Retained invalid attempt');}else{const record=JSON.parse(await readFile(join(candidate,'.scratch/recovery-record.json'),'utf8'));assert.equal(record.mode,'manual_rebase');assert.deepEqual(record.files,[]);assert.ok((await readFile(join(candidate,'AGENTS.md'),'utf8')).includes('Living World development'));assert.ok(JSON.parse(await readFile(join(candidate,'.scratch/retained-changes.json'),'utf8')).some(c=>c.path==='AGENTS.md'));await writeFile(join(candidate,'.scratch/recovery-acceptance.json'),JSON.stringify({runId:record.runId,accepted:true}));await writeFile(join(candidate,'public/reconstructed.txt'),'Allowed reconstruction');}}
  return {code:0,stdout:'Fixture checks',timedOut:false,cancelled:false,overflow:false};
 }});
});


test('idle cleanup serializes ticks and shutdown waits without duplicating account work',async()=>{
 let entered,release,calls=0;const begun=new Promise(done=>entered=done);
 await harness(async({dev,enable})=>{await enable();const first=dev.tick();await begun;await dev.tick();assert.equal(calls,1);let closed=false;const closing=dev.close().then(()=>closed=true);await new Promise(done=>setImmediate(done));assert.equal(closed,false);release();await first;await closing;assert.equal(closed,true);},{sandboxCleanup:async()=>{calls++;entered();return new Promise(done=>release=()=>done({removed:[]}));}});
});
