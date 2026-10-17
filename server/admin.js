import { readFile,mkdir,readdir,stat,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync,backup } from 'node:sqlite';
import { once } from 'node:events';
import { createOwnerAuth } from './owner-auth.js';
import { settings,createSecretStore } from './owner-settings.js';
import { DATA_TABLES,createRedactor,tablePage } from './admin-data.js';
import { SCHEMA_VERSION } from './migrations.js';
import { createDeveloper } from './developer.js';
import { createStudioChat } from './studio-chat.js';
import { createWorldLab } from './world-lab.js';
import { connectionCatalog,saveConnection } from './connection-registry.js';
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function body(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw fail('JSON body required',415);
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)throw fail('Request too large',413);}
  try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw fail('Invalid JSON');}
}
export function createAdmin({store,steward,dataDir,backupDir=resolve('backups'),publicOrigin=process.env.PUBLIC_ORIGIN||'http://127.0.0.1:3000',online=()=>0,clock=Date.now,fetcher=fetch,developer,quiesceLegacy}){
  const db=store.db,auth=createOwnerAuth(db,clock),control=settings(db),secrets=createSecretStore(db,dataDir),started=clock();
  const dev=developer||createDeveloper({store,dataDir,clock,quiesceLegacy});
  const studio=createStudioChat({store,developer:dev,clock});
  const lab=createWorldLab({dataDir,projectDir:resolve('.'),embedOrigin:publicOrigin+(process.env.LW_SITE_PREVIEW==='1'?' http://127.0.0.1:3105':''),clock,visuals:dev.visuals});
  const audit=(action,details={})=>db.prepare('INSERT INTO admin_audit(action,details) VALUES (?,?)').run(action,JSON.stringify(details));
  const root=new URL('../public/',import.meta.url),uiRoot=new URL('../ui/out/',import.meta.url),rate=new Map();let modelCheckRunning=false;
  const files={'/admin':['admin.html','text/html',uiRoot],'/admin/':['admin.html','text/html',uiRoot],'/admin-classic':['admin.html','text/html',root],'/admin-classic/':['admin.html','text/html',root],'/admin.js':['admin.js','text/javascript',root],'/admin.css':['admin.css','text/css',root]};
  async function backups(){await mkdir(backupDir,{recursive:true});const names=(await readdir(backupDir)).filter(n=>/^world-[a-zA-Z0-9T.-]+\.sqlite$/.test(n));return Promise.all(names.sort().reverse().map(async name=>({name,size:(await stat(resolve(backupDir,name))).size})));}
  function checkOrigin(req){
    const origin=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;
    let parsed;try{parsed=new URL(origin);}catch{throw fail('Invalid origin',403);}
    if(!process.env.PUBLIC_ORIGIN&&!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw fail('Untrusted admin host',403);
    if(req.headers.origin!==origin)throw fail('Same-origin request required',403);
  }
  function transact(action,details,operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();audit(action,details);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  async function handle(req,res){
    const url=new URL(req.url,'http://local.invalid'),path=url.pathname;
    if(files[path]){
      if(req.method!=='GET')send(res,405,{error:'Method not allowed'});
      else try{const [file,type,fileRoot]=files[path],data=await readFile(new URL(file,fileRoot));res.writeHead(200,{'Content-Type':type,'Referrer-Policy':'no-referrer'});res.end(data);}catch{send(res,500,{error:'Dashboard unavailable'});}
      return true;
    }
    if(!path.startsWith('/api/admin/'))return false;
    try{
      if(path==='/api/admin/login'&&req.method==='POST'){
        checkOrigin(req);const ip=req.socket.remoteAddress,count=rate.get(ip)||{at:clock(),tries:0};if(clock()-count.at>60000){count.at=clock();count.tries=0;}count.tries++;rate.set(ip,count);if(count.tries>20)throw fail('Too many login attempts',429);
        const login=auth.exchange((await body(req)).ticket);if(!login)throw fail('Login link expired or already used. Open a new local login.',401);
        res.setHeader('Set-Cookie',`lw_owner=${login.token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=43200${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
        send(res,200,{csrf:login.csrf});return true;
      }
      const session=auth.session(req.headers.cookie);if(!session)throw fail('Owner sign-in required',401);
      if(req.method!=='GET'){
        checkOrigin(req);if(req.headers['x-owner-csrf']!==session.csrf)throw fail('Invalid request token',403);
        if(req.method!=='POST')throw fail('Method not allowed',405);
      }
      if(path==='/api/admin/session'&&req.method==='GET'){send(res,200,{csrf:session.csrf,expiresAt:session.expires_at});return true;}
      if(path==='/api/admin/logout'&&req.method==='POST'){auth.revoke(session);audit('owner_logout');res.setHeader('Set-Cookie','lw_owner=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');send(res,200,{ok:true});return true;}
      if(path==='/api/admin/developer'&&req.method==='GET'){send(res,200,dev.status());return true;}
      if(path==='/api/admin/connections'&&req.method==='GET'){send(res,200,{connections:connectionCatalog({control,secrets})});return true;}
      if(path.startsWith('/api/admin/connections/')&&req.method==='POST'){const id=path.slice('/api/admin/connections/'.length);const result=saveConnection({control,secrets,id,input:await body(req),clock});audit('connection_configured',{id,secretSaved:result.secretConfigured,execution:'disabled'});send(res,200,result);return true;}
      if(path==='/api/admin/studio'&&req.method==='GET'){
        const labState=await lab.refresh();
        if(labState.refreshed)studio.recordSystem({body:'A verified visual release was loaded into the World Lab. The Lab can now refresh to show the new art data.',status:'completed',evidence:{source:'world_lab',action:'visual_refresh',presentation:{title:'World Lab visual release refreshed',intent:'Show only a host-validated visual artifact.',current:'The Lab has the latest immutable visual data release.',next:'Reload the Lab frame and inspect the change in play.',complete:'The frame is using the recorded visual revision.',refreshSandbox:true}}});
        send(res,200,studio.status());return true;
      }
      if(path==='/api/admin/studio/live'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        let closed=false;
        const emit=async()=>{if(closed)return;try{const labState=await lab.refresh();if(labState.refreshed)studio.recordSystem({body:'A verified visual release was loaded into the World Lab. The Lab can now refresh to show the new art data.',status:'completed',evidence:{source:'world_lab',action:'visual_refresh',presentation:{title:'World Lab visual release refreshed',intent:'Show only a host-validated visual artifact.',current:'The Lab has the latest immutable visual data release.',next:'Reload the Lab frame and inspect the change in play.',complete:'The frame is using the recorded visual revision.',refreshSandbox:true}}});res.write(`event: studio\ndata:${JSON.stringify({studio:studio.status(),lab:lab.state()})}\n\n`);}catch{/* The regular Studio request remains the fallback. */}};
        await emit();const timer=setInterval(emit,1000);req.once('close',()=>{closed=true;clearInterval(timer);});return true;
      }
      if(path==='/api/admin/studio/messages'&&req.method==='POST'){const input=await body(req);send(res,200,await studio.post(input));return true;}
      if(path==='/api/admin/studio/lab'&&req.method==='GET'){send(res,200,lab.state());return true;}
      if(path==='/api/admin/studio/lab'&&req.method==='POST'){const {action}=await body(req);if(!['start','stop','reset'].includes(action))throw fail('Choose start, stop or reset for the World Lab');const result=await lab[action]();const bodies={start:'A fresh Current-source World Lab is running. Walk the basin and record exact observations here.',reset:'The World Lab was reset to a fresh world. Earlier notes remain as evidence; repeat the journey before comparing outcomes.',stop:'The disposable World Lab was stopped. Production world state was not affected.'};studio.recordSystem({body:bodies[action],status:result.state==='running'?'working':'completed',evidence:{source:'world_lab',action,state:result.state,kind:result.kind}});audit('studio_lab_'+action,{state:result.state});send(res,200,result);return true;}
      if(path==='/api/admin/developer/report'&&req.method==='GET'){send(res,200,await dev.report(url.searchParams.get('id')));return true;}
      if(path.startsWith('/api/admin/developer/')&&req.method==='POST'){
        const input=await body(req),action=path.slice('/api/admin/developer/'.length);
        const actions={preview:()=>dev.previewRun(input),refresh:()=>dev.refresh(),poll:()=>dev.refresh(false),login:()=>dev.signIn(input.type),cancelLogin:()=>dev.cancelLogin(),disconnect:()=>dev.disconnect(),isolation:()=>dev.verifyIsolation(),settings:()=>dev.saveConfig(input),tasks:()=>dev.enqueue(input),cancel:()=>dev.cancel(input.id),stop:()=>dev.stopRun(input.id),resume:()=>dev.resumeRun(input),autonomy:()=>dev.saveAutonomy(input),wake:()=>dev.wake(),rollback:()=>dev.rollbackVisuals(),sourceRefresh:()=>dev.sourceRefresh(),sourceBootstrap:()=>dev.sourceBootstrap(),sourceRollback:()=>dev.sourceRollback(),operatorRollback:()=>dev.operatorRollback()};
        if(!actions[action])throw fail('Unknown developer action');
        try{send(res,200,await actions[action]());}catch(e){if(e.status)throw e;throw fail('Codex operation failed. Reconnect or check the installed CLI.',502);}return true;
      }
      if(path==='/api/admin/overview'&&req.method==='GET'){
        const counts=Object.fromEntries(DATA_TABLES.map(table=>[table,db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
        send(res,200,{version:'0.5.0',schemaVersion:SCHEMA_VERSION,uptimeSeconds:Math.floor((clock()-started)/1000),online:online(),counts,worker:steward.status(),paused:control.get('workerPaused',false),ai:{...control.ai(),credentialConfigured:secrets.configured(),runtimeReady:false,modelCallsEnabled:false},developerActivity:dev.activity(),backups:await backups(),recentAudit:db.prepare('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 8').all(),capabilities:{memory:true,modelInterpretation:false,codexDevelopment:true,autonomousDevelopment:true,automaticReleases:'visual-data'}});return true;
      }
      if(path==='/api/admin/data'&&req.method==='GET'){send(res,200,tablePage(db,url.searchParams.get('table')||'events',url.searchParams.get('page')||0,url.searchParams.get('q')||''));return true;}
      if(path==='/api/admin/documents'&&req.method==='GET'){
        const docs={};for(const name of ['CONSTITUTION','BASELINE','MEMORY'])docs[name]=await readFile(new URL(`../docs/${name}.md`,import.meta.url),'utf8');send(res,200,docs);return true;
      }
      if(path==='/api/admin/worker'&&req.method==='POST'){
        const input=await body(req);if(!['pause','resume','tick'].includes(input.action))throw fail('Unknown worker action');
        if(input.action==='tick'){if(control.get('workerPaused',false))throw fail('Resume the worker before running maintenance');steward.tick();audit('worker_tick');}
        else transact(`worker_${input.action}`,{},()=>control.set('workerPaused',input.action==='pause'));
        send(res,200,{ok:true,paused:control.get('workerPaused',false)});return true;
      }
      if(path==='/api/admin/jobs/retry'&&req.method==='POST'){
        const {id}=await body(req);const job=db.prepare('SELECT kind,state FROM jobs WHERE id=?').get(typeof id==='string'?id:'');
        if(!job||job.state!=='failed'||!['summarize_player','inspect_world'].includes(job.kind))throw fail('Only failed supported local jobs can be retried');
        transact('job_retry',{id},()=>db.prepare("UPDATE jobs SET state='queued',attempts=0,error=NULL,result=NULL,finished_at=NULL,available_at=? WHERE id=? AND state='failed'").run(clock(),id));send(res,200,{ok:true});return true;
      }
      if(path==='/api/admin/proposals'&&req.method==='POST'){
        const {id,status}=await body(req);if(!['proposed','accepted','dismissed'].includes(status))throw fail('Invalid proposal status');
        if(!db.prepare('SELECT 1 FROM improvements WHERE id=?').get(typeof id==='string'?id:''))throw fail('Unknown proposal');
        transact('proposal_status',{id,status},()=>db.prepare('UPDATE improvements SET status=? WHERE id=?').run(status,id));send(res,200,{ok:true});return true;
      }
      if(path==='/api/admin/ai'&&req.method==='POST'){
        const {model,dailyBudgetUsd,apiKey,modelCallsEnabled}=await body(req);
        if(modelCallsEnabled===true)throw fail('Model execution is not implemented in this release. Settings can be saved while execution remains disabled.');
        if(model!==null&&(typeof model!=='string'||!/^[-a-zA-Z0-9_.:]{1,120}$/.test(model)))throw fail('Enter an exact model ID or leave it empty');
        if(dailyBudgetUsd!==null&&(typeof dailyBudgetUsd!=='number'||!Number.isFinite(dailyBudgetUsd)||dailyBudgetUsd<0||dailyBudgetUsd>100000))throw fail('Enter a non-negative daily budget');
        if(apiKey!==undefined&&(typeof apiKey!=='string'||apiKey.length<16||apiKey.length>1024||/\s/.test(apiKey)))throw fail('Invalid API key format');
        const value={provider:'openai',model,dailyBudgetUsd,modelCallsEnabled:false};
        transact('ai_settings_saved',{model,dailyBudgetUsd,credentialChanged:!!apiKey},()=>{control.set('ai',value);if(apiKey)secrets.save(apiKey);control.set('aiVerification',null);});
        send(res,200,{...value,credentialConfigured:secrets.configured()});return true;
      }
      if(path==='/api/admin/ai/check'&&req.method==='POST'){
        await body(req);if(modelCheckRunning)throw fail('A credential check is already running',409);
        const last=control.get('lastModelCheck',0);if(clock()-last<10000)throw fail('Wait before checking again',429);
        const key=secrets.read();if(!key)throw fail('Save an API key first');
        modelCheckRunning=true;control.set('lastModelCheck',clock());
        try{
          const response=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(12000)});
          if(!response.ok)throw fail(`OpenAI credential check returned HTTP ${response.status}`,502);
          const payload=await response.json();if(!Array.isArray(payload.data))throw fail('OpenAI returned an unexpected catalog',502);
          const models=payload.data.map(m=>m.id).filter(id=>typeof id==='string').sort();
          const result={ok:true,modelAvailable:control.ai().model?models.includes(control.ai().model):null,models,checkedAt:clock()};control.set('aiVerification',result);audit('ai_credential_checked',{ok:true,modelAvailable:result.modelAvailable});send(res,200,result);
        }catch(e){audit('ai_credential_check_failed');if(e.status)throw e;throw fail('Could not reach OpenAI. Check connectivity and try again.',502);}finally{modelCheckRunning=false;}
        return true;
      }
      if(path==='/api/admin/ai'&&req.method==='GET'){send(res,200,{...control.ai(),credentialConfigured:secrets.configured(),verification:control.get('aiVerification'),runtimeReady:false});return true;}
      if(path==='/api/admin/backup'&&req.method==='POST'){
        await body(req);await mkdir(backupDir,{recursive:true});const name=`world-${new Date(clock()).toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}.sqlite`;
        await backup(db,resolve(backupDir,name));audit('backup_created',{name});send(res,200,{name});return true;
      }
      if(path.startsWith('/api/admin/backup/')&&req.method==='GET'){
        const name=path.slice('/api/admin/backup/'.length);if(!/^world-[a-zA-Z0-9T.-]+\.sqlite$/.test(name))throw fail('Invalid backup name');
        const file=resolve(backupDir,name);try{const data=await readFile(file);audit('backup_downloaded',{name});res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':`attachment; filename="${name}"`});res.end(data);}catch(e){if(e.code==='ENOENT')throw fail('Backup not found',404);throw e;}return true;
      }
      if(path==='/api/admin/export'&&req.method==='POST'){
        await body(req);const exportDir=resolve(dataDir,'exports');await mkdir(exportDir,{recursive:true});const file=resolve(exportDir,`${randomUUID()}.sqlite`);let snapshot;const streamAbort=new AbortController();
        const close=()=>streamAbort.abort();res.once('close',close);
        try{
          await backup(db,file);snapshot=new DatabaseSync(file,{readOnly:true});const redact=createRedactor(snapshot);
          audit('world_data_exported');res.writeHead(200,{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="living-world-data.ndjson"'});
          let count=0;exportRows: for(const table of DATA_TABLES)for(const row of snapshot.prepare(`SELECT * FROM ${table}`).iterate()){
            if(res.destroyed)break exportRows;const writable=res.write(JSON.stringify({table,row:redact(row)})+'\n');if(!writable)await once(res,'drain',{signal:streamAbort.signal});if(++count%200===0)await new Promise(resolve=>setImmediate(resolve));
          }res.end();
        }finally{res.removeListener('close',close);snapshot?.close();await unlink(file).catch(()=>{});}return true;
      }
      throw fail('Admin endpoint not found',404);
    }catch(e){if(res.headersSent){res.destroy();}else send(res,e.status||500,{error:e.status?e.message:'Admin operation failed'});return true;}
  }
  async function close(){await lab.close();await dev.close();}
  return {handle,developer:dev,studio,lab,close};
}

