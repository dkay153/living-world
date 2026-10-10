import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createQueue } from './jobs.js';
import { settings } from './owner-settings.js';
import { createCodexConnection } from './codex-connection.js';
import { codexBinary,prepareCodexHome,codexEnvironment,runProcess } from './codex-process.js';
import { runOwnedProcess } from './owned-process.js';
import { snapshotProject,inspectChanges,checkSandbox } from './developer-sandbox.js';

const defaults={enabled:false,model:null,dailyRuns:null,dailyMinutes:null,maxMinutes:null};
const bad=message=>Object.assign(new Error(message),{status:400});
const dayStart=now=>Math.floor(now/86400000)*86400000;
export function createDeveloper({store,dataDir,projectDir=resolve('.'),clock=Date.now,connection,executor=runOwnedProcess,probe=checkSandbox,binary=codexBinary()}) {
  const db=store.db,control=settings(db),queue=createQueue(db,clock),home=resolve(dataDir,'codex-home'),runsDir=resolve(dataDir,'developer-runs');
  const link=connection||createCodexConnection({home,cwd:home});
  let active=null,checking=false,sandbox=null,closing=false,statusCache=null,catalogCache=[],limitsCache=null,connectedAt=0;
  const audit=(action,details={})=>db.prepare('INSERT INTO admin_audit(action,details) VALUES (?,?)').run(action,JSON.stringify(details));
  const config=()=>({...defaults,...control.get('developer',{})});
  function transaction(operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function usage(){return db.prepare('SELECT COUNT(*) AS runs,COALESCE(SUM(max_minutes),0) AS reservedMinutes FROM developer_runs WHERE started_at>=?').get(dayStart(clock()));}
  async function refresh(metadata=true){
    try{statusCache=await link.status();connectedAt=clock();if(statusCache.connected){if(metadata||!catalogCache.length){catalogCache=await link.catalog();try{limitsCache=await link.limits();}catch{limitsCache=null;}}}else{catalogCache=[];limitsCache=null;}}
    catch{statusCache={available:false,connected:false,account:null,error:'Codex is unavailable. Check the CLI installation or reconnect.'};catalogCache=[];limitsCache=null;}
    return status();
  }
  function recover(){
    const lost=db.prepare("SELECT d.id FROM developer_runs d JOIN jobs j ON j.id=d.id WHERE d.state='running' AND (j.state<>'running' OR j.lease_until<=?)").all(clock());
    if(lost.length)transaction(()=>{for(const row of lost){db.prepare("UPDATE jobs SET state='failed',error='Interrupted developer attempt; no automatic retry',lease_token=NULL,lease_until=NULL,finished_at=? WHERE id=?").run(clock(),row.id);db.prepare("UPDATE developer_runs SET state='interrupted',progress='Interrupted',error='Outcome uncertain. Inspect the copy before explicitly starting another task.',finished_at=? WHERE id=?").run(clock(),row.id);}control.set('developer',{...config(),enabled:false});audit('developer_recovery',{ids:lost.map(r=>r.id)});});
  }
  function status(){recover();return {config:config(),connection:statusCache||{available:null,connected:false,account:null},models:catalogCache,limits:limitsCache,sandbox,checking,usage:usage(),day:'UTC',active:active?.job?.id||null,runs:db.prepare('SELECT id,task,model,max_minutes,state,created_at,started_at,finished_at,progress,error FROM developer_runs ORDER BY created_at DESC,rowid DESC LIMIT 30').all(),automaticReleases:false};}
  async function signIn(type){if(active)throw bad('Stop the current developer task before changing accounts');const login=await link.startLogin(type);audit('codex_sign_in_started',{type});statusCache={...(statusCache||{}),login};return login;}
  async function cancelLogin(){await link.cancelLogin();audit('codex_sign_in_cancelled');return refresh();}
  async function disconnect(){await saveConfig({...config(),enabled:false});await link.logout();audit('codex_disconnected');return refresh();}
  async function verifyIsolation(){
    if(checking)throw bad('An isolation check is already running');if(active)throw bad('Wait for the current task before checking isolation');checking=true;sandbox=null;
    try{await prepareCodexHome(home);const canary=resolve(home,'isolation-canary.txt');await writeFile(canary,randomUUID(),{mode:0o600});const candidate=resolve(runsDir,'isolation-check');await mkdir(resolve(candidate,'.scratch'),{recursive:true});sandbox=await probe({home,candidate,protectedPaths:[resolve(dataDir,'world.sqlite'),canary],binary});audit('developer_isolation_verified',{ok:true,platform:sandbox.platform});return sandbox;}
    catch{audit('developer_isolation_failed');throw bad('Isolation check failed. Developer execution stays blocked.');}finally{checking=false;}
  }
  async function saveConfig(input){
    const {enabled,model,dailyRuns,dailyMinutes,maxMinutes}=input;
    if(typeof enabled!=='boolean')throw bad('Choose whether developer execution is enabled');
    if(model!==null&&(typeof model!=='string'||!/^[-a-zA-Z0-9_.:]{1,120}$/.test(model)))throw bad('Select an exact Codex model');
    for(const [name,value,max] of [['dailyRuns',dailyRuns,100],['dailyMinutes',dailyMinutes,600],['maxMinutes',maxMinutes,60]])if(value!==null&&(!Number.isInteger(value)||value<1||value>max))throw bad(`Invalid ${name} limit`);
    if(enabled){
      await refresh();if(!statusCache.connected)throw bad('Connect a ChatGPT Codex account first');
      if(!catalogCache.some(m=>m.id===model))throw bad('Select a model returned by this account');
      if(!dailyRuns||!dailyMinutes||!maxMinutes||maxMinutes>dailyMinutes)throw bad('Set a daily run limit, daily time allowance and per-task time limit');
      if(!sandbox?.ok)throw bad('Verify isolation before enabling developer tasks');
    }
    if(active)active.abort.abort();
    transaction(()=>{control.set('developer',{enabled,model,dailyRuns,dailyMinutes,maxMinutes});audit('developer_settings_saved',{enabled,model,dailyRuns,dailyMinutes,maxMinutes});});return status();
  }
  async function enqueue(input){
    if(typeof input.requestKey!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.requestKey))throw bad('A unique task request is required');
    if(typeof input.task!=='string'||input.task.trim().length<10||input.task.length>6000)throw bad('Describe a task in 10–6000 characters');
    const existing=db.prepare('SELECT id,task FROM developer_runs WHERE request_key=?').get(input.requestKey);if(existing){if(existing.task!==input.task.trim())throw bad('This request key already belongs to another task');return {id:existing.id};}
    let c=config();if(!c.enabled||!sandbox?.ok)throw bad('Connect, configure and verify the developer before starting tasks');
    await refresh();if(!statusCache.connected)throw bad('Reconnect the ChatGPT Codex account');
    c=config();if(!c.enabled)throw bad('Developer execution is paused');
    return transaction(()=>{
      const daily=db.prepare('SELECT COUNT(*) AS runs,COALESCE(SUM(max_minutes),0) AS minutes FROM developer_runs WHERE created_at>=?').get(dayStart(clock()));
      if(daily.runs>=c.dailyRuns||daily.minutes+c.maxMinutes>c.dailyMinutes)throw bad('The local daily task allowance is exhausted');
      const id=queue.enqueue('codex_development',{task:input.task.trim(),model:c.model},'codex:'+input.requestKey,1);
      db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at) VALUES (?,?,?,?,?,'queued',?)").run(id,input.requestKey,input.task.trim(),c.model,c.maxMinutes,clock());audit('developer_task_queued',{id,model:c.model});return {id};
    });
  }
  function cancel(id){
    const row=db.prepare('SELECT state FROM developer_runs WHERE id=?').get(id);if(!row||!['queued','running'].includes(row.state))throw bad('Task is no longer cancellable');
    if(active?.job.id===id)active.abort.abort();
    transaction(()=>{db.prepare("UPDATE developer_runs SET state='cancelled',progress='Cancelled',finished_at=? WHERE id=?").run(clock(),id);db.prepare("UPDATE jobs SET state='failed',error='Owner cancelled',lease_token=NULL,lease_until=NULL,finished_at=? WHERE id=?").run(clock(),id);audit('developer_task_cancelled',{id});});return {ok:true};
  }
  async function report(id){
    const row=db.prepare('SELECT * FROM developer_runs WHERE id=?').get(id);if(!row)throw bad('Unknown developer task');
    let changes=[];if(row.report){try{changes=JSON.parse(await readFile(resolve(runsDir,id,'changes.json'),'utf8'));}catch{ /* incomplete attempt has no captured changes */ }}
    return {...row,report:row.report?JSON.parse(row.report):null,changes};
  }
  function progress(job,text){db.prepare("UPDATE developer_runs SET progress=? WHERE id=? AND state='running' AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND lease_token=? AND lease_until>?)").run(text,job.id,job.id,job.token,clock());}
  async function execute(job,abort){
    const run=db.prepare('SELECT * FROM developer_runs WHERE id=?').get(job.id),folder=resolve(runsDir,job.id),candidate=resolve(folder,'candidate'),baseline=resolve(folder,'baseline');
    let manifest=null,summary='',eventCount=0,changes=[],checks=null;
    try{
      progress(job,'Copying project source');manifest=await snapshotProject(projectDir,candidate,baseline);await writeFile(resolve(folder,'manifest.json'),JSON.stringify(manifest));
      if(abort.signal.aborted)throw new Error('Task cancelled');
      progress(job,'Checking this copy’s isolation');await probe({home,candidate,protectedPaths:[resolve(dataDir,'world.sqlite'),resolve(home,'config.toml')],binary});
      const prompt=`You are the Living World developer. Read AGENTS.md and docs/CONSTITUTION.md, docs/BASELINE.md, docs/MEMORY.md. Work independently on the owner's task below. This is an isolated source copy with no live state or credentials. Improve code, systems, visuals or architecture within the constitution. Do not expand authority, connect providers, launch services, change owner budgets, or release anything. Network tools are disabled. Installed dependencies are available; do not install packages. Run relevant tests. Describe actual changes, validation and limitations in your final response. A separate host will capture changes and test results. Owner task:\n${run.task}`;
      progress(job,'Codex is developing in the isolated copy');
      const result=await executor(binary,['exec','--strict-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--json','--color','never','-C',candidate,'-m',run.model,'-c','web_search="disabled"','-'],{cwd:candidate,env:codexEnvironment(home,resolve(candidate,'.scratch')),timeoutMs:run.max_minutes*60000,signal:abort.signal,input:prompt,onLine:line=>{
        let e;try{e=JSON.parse(line);}catch{return;}eventCount++;
        if(e.type==='item.completed'&&e.item?.type==='agent_message')summary=String(e.item.text||'').slice(0,16000);
        if(e.type==='item.started')progress(job,'Codex working · '+eventCount+' activity events');
      }});
      if(result.cancelled||abort.signal.aborted)throw new Error('Task cancelled');if(result.timedOut)throw new Error('Per-task time limit reached');if(result.overflow)throw new Error('CLI output limit reached');if(result.code!==0)throw new Error('Codex execution failed. Reconnect or inspect account availability.');
      progress(job,'Capturing proposed changes');changes=await inspectChanges(candidate,baseline,manifest);await writeFile(resolve(folder,'changes.json'),JSON.stringify(changes));
      progress(job,'Testing the copy independently');
      const offline=['combat','game','jobs','memory','world','developer'].map(name=>`tests/${name}.test.js`);
      const tested=await executor(binary,['sandbox','-C',candidate,'-P','living-world','--',process.execPath,'--test',...offline],{cwd:candidate,env:codexEnvironment(home,resolve(candidate,'.scratch')),timeoutMs:120000,signal:abort.signal});
      checks={command:'node --test '+offline.join(' '),scope:'Offline gameplay, persistence, jobs and developer fixtures',limitations:'HTTP/admin/WebSocket integration tests require service-isolated staging. These are the candidate’s tests, not an independent constitutional release validator.',passed:tested.code===0&&!tested.timedOut&&!tested.cancelled&&!tested.overflow,output:tested.stdout.slice(-24000),timedOut:tested.timedOut};
      const evidence={summary,sourceHash:manifest.sourceHash,changedFiles:changes.map(c=>({path:c.path,kind:c.kind,binary:!!c.binary})),protectedFilesChanged:changes.filter(c=>['AGENTS.md','docs/CONSTITUTION.md'].includes(c.path)).map(c=>c.path),checks,eventCount,candidate,liveRelease:false};
      if(abort.signal.aborted)throw new Error('Task cancelled');
      transaction(()=>{if(!queue.finish(job,{report:evidence,changedFiles:changes.length}))throw new Error('Developer lease lost');db.prepare("UPDATE developer_runs SET state='succeeded',progress='Candidate ready · live game unchanged',report=?,finished_at=? WHERE id=? AND state='running'").run(JSON.stringify(evidence),clock(),job.id);audit('developer_candidate_completed',{id:job.id,changedFiles:changes.length,testsPassed:checks.passed});});
    }catch(e){
      if(manifest){try{changes=await inspectChanges(candidate,baseline,manifest);await writeFile(resolve(folder,'changes.json'),JSON.stringify(changes));}catch{}}
      const error=String(e.message).slice(0,300),evidence={summary,sourceHash:manifest?.sourceHash||null,changedFiles:changes.map(c=>({path:c.path,kind:c.kind})),checks,candidate,liveRelease:false};
      transaction(()=>{const row=db.prepare('SELECT state FROM developer_runs WHERE id=?').get(job.id);if(row?.state!=='running')return;const fresh=db.prepare('SELECT lease_token,lease_until FROM jobs WHERE id=?').get(job.id);if(fresh?.lease_token!==job.token||fresh.lease_until<=clock())return;queue.fail(job,error);db.prepare("UPDATE developer_runs SET state=?,progress=?,report=?,error=?,finished_at=? WHERE id=?").run(abort.signal.aborted?'cancelled':'failed',abort.signal.aborted?'Stopped':'Attempt failed',JSON.stringify(evidence),error,clock(),job.id);audit('developer_attempt_stopped',{id:job.id,state:abort.signal.aborted?'cancelled':'failed'});});
    }
  }
  async function tick(){
    if(closing||active||checking)return;recover();const c=config();if(!c.enabled)return;
    // Never resume executable authority without a fresh, local isolation verification.
    if(!sandbox?.ok)return;
    active={job:null,abort:new AbortController()};
    try{
      if(clock()-connectedAt>30000)await refresh(false);if(!statusCache?.connected||active.abort.signal.aborted||!config().enabled)return;
      const used=usage();if(used.runs>=c.dailyRuns||used.reservedMinutes+c.maxMinutes>c.dailyMinutes)return;
      const job=queue.claim(['codex_development'],45000);if(!job)return;active.job=job;
      const row=db.prepare('SELECT model,max_minutes FROM developer_runs WHERE id=?').get(job.id);
      if(!row||row.model!==c.model||row.max_minutes>c.maxMinutes){queue.fail(job,'Owner configuration changed; start a new task');db.prepare("UPDATE developer_runs SET state='failed',progress='Configuration changed',error='Start a new task with the current settings',finished_at=? WHERE id=?").run(clock(),job.id);return;}
      db.prepare("UPDATE developer_runs SET state='running',started_at=?,progress='Starting' WHERE id=? AND state='queued'").run(clock(),job.id);
      const heartbeat=setInterval(()=>{if(!queue.renew(job,45000))active?.abort.abort();},5000);
      try{await execute(job,active.abort);}finally{clearInterval(heartbeat);}
    }finally{active=null;}
  }
  async function close(){closing=true;active?.abort.abort();await link.close();while(active)await new Promise(accept=>setTimeout(accept,25));}
  return {status,refresh,signIn,cancelLogin,disconnect,verifyIsolation,saveConfig,enqueue,cancel,report,tick,close};
}
