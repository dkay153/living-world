// Fixed host authority. Never imports or executes candidate operator/tool code.
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson,treeManifest,verifySource } from './release-artifacts.js';
import { createDockerRuntime } from './release-runtime.js';

const text=value=>typeof value==='string'&&value.length<=2000&&value.trim().length>=10;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export function validateOperatorDecision(value,evidence){
  if(!exact(value,['version','actions','memory'])||value.version!==1||!Array.isArray(value.actions)||value.actions.length>1||!exact(value.memory,Object.keys(value.memory||{}))||Buffer.byteLength(JSON.stringify(value.memory))>8192)throw Error('Invalid bounded operator decision');
  for(const action of value.actions){
    if(!exact(action,['kind','task','name','input']))throw Error('Invalid operator action');
    if(action.kind==='backup_world'){if(Object.keys(action).length!==1||!evidence.backupDue)throw Error('Backup is not due');}
    else if(action.kind==='recover_world'){if(Object.keys(action).length!==1||!evidence.worldRecoverable||evidence.worldReady)throw Error('World recovery is not authorized by current evidence');}
    else if(action.kind==='develop'){if(Object.keys(action).length!==2||!text(action.task)||!evidence.developmentAllowed)throw Error('Saved owner execution policy does not permit development');}
    else if(action.kind==='tool'){if(!exact(action,['kind','name','input'])||!/^[a-z][a-z0-9-]{0,48}$/.test(action.name)||Buffer.byteLength(JSON.stringify(action.input??null))>8192||!evidence.toolDue)throw Error('Invalid or premature tool request');}
    else throw Error('Operator action cannot expand kernel authority');
  }
  return value;
}
export const operatorCases=[
  {worldReady:true,worldRecoverable:true,backupDue:false,developmentAllowed:false,toolDue:false},
  {worldReady:true,worldRecoverable:true,backupDue:true,developmentAllowed:false,toolDue:false},
  {worldReady:false,worldRecoverable:true,backupDue:false,developmentAllowed:false,toolDue:false},
  {worldReady:true,worldRecoverable:true,backupDue:false,developmentAllowed:true,toolDue:false},
  {worldReady:true,worldRecoverable:true,backupDue:false,developmentAllowed:false,toolDue:true}
];
export function createHostOperator({dataDir,projectDir=resolve('.'),runtime,clock=Date.now,schedule=true,enrollmentDrill=false,observe=()=>operatorCases[0],dispatch=async()=>{throw Error('Operator handler unavailable');}}={}){
  const root=resolve(dataDir,'host-operator'),kernel=resolve(projectDir,'operator-kernel');
  let config=null,engine=runtime,session=null,busy=false,closing=false,timer=null;
  let record={version:1,active:null,previous:null,pending:null,memory:{},receipts:[],lastBackup:0,lastTool:0};
  let blocker='Host operator is not enrolled',chain=Promise.resolve();
  const serialized=operation=>{const pending=chain.then(operation);chain=pending.catch(()=>{});return pending;};
  const persist=()=>atomicJson(resolve(root,'ledger.json'),record);
  const status=()=>({configured:!!config,ready:!!session&&!busy&&!closing,active:record.active?.manifest.sourceHash||null,previous:record.previous?.manifest.sourceHash||null,pending:record.pending?.phase||null,blocker,lastReceipt:record.receipts.at(-1)||null});
  const evidence=()=>({...observe(),backupDue:clock()-record.lastBackup>=3600000,toolDue:clock()-record.lastTool>=60000,lastAction:record.lastResult||null});
  async function launch(artifact){
    if(closing)throw Error('Host operator is closing');await verifySource(artifact);
    if((await treeManifest(kernel)).sourceHash!==config.kernelHash)throw Error('Independent operator kernel changed');
    let selected=engine;
    if(artifact.runtime){const r=artifact.runtime;
      if(r.parentImage!==config.image||r.parentToolsHash!==config.toolsHash||r.parentKernelHash!==config.kernelHash||(await treeManifest(r.operatorKernel)).sourceHash!==r.operatorKernelHash)throw Error('Dependency operator kernel binding mismatch');
      selected=createDockerRuntime({...r,controllerSource:r.operatorKernel,seccomp:resolve(projectDir,'runtime/seccomp_profile.json')});
      if(!(await selected.verify()).ready)throw Error('Operator dependency image is unavailable');
    }
    const next=await selected.launch({source:artifact.source,world:resolve(root,'empty-seed'),mode:'operator'});
    try{if(next.receipt.sourceHash!==artifact.manifest.sourceHash||!next.receipt.checks?.networkBlocked||!next.receipt.checks?.separateUid||!next.receipt.checks?.readOnlySource||!next.receipt.checks?.noOwnerMount)throw Error('Operator runtime attestation failed');if(!(await next.request('health')).ok)throw Error('Operator readiness failed');return next;}catch(error){await next.stop();throw error;}
  }
  function attach(next){next.events.on('fault',()=>{if(session===next&&!busy&&!closing)void serialized(()=>rollback('Operator process fault')).catch(error=>{blocker=error.message;});});}
  function receipt(value){record.receipts.push({...value,at:clock()});record.receipts=record.receipts.slice(-50);}
  async function load(){
    await mkdir(resolve(root,'empty-seed'),{recursive:true});
    try{config=JSON.parse(await readFile(resolve(root,'config.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return false;throw error;}
    if(config.version!==1||config.automatic!==true||(await treeManifest(kernel)).sourceHash!==config.kernelHash||!enrollmentDrill&&(!config.acceptance?.verified||config.acceptance.kernelHash!==config.kernelHash||config.acceptance.image!==config.image))throw Error('A real operator deployment/rollback drill is required');
    engine??=createDockerRuntime({...config,controllerSource:kernel,seccomp:resolve(projectDir,'runtime/seccomp_profile.json')});
    if(!(await engine.verify()).ready)throw Error('Pinned operator runtime unavailable');
    try{record=JSON.parse(await readFile(resolve(root,'ledger.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    return true;
  }
  async function start(){
    if(session||closing)return status();
    try{if(!await load())return status();if(record.pending){if(record.pending.phase==='deploying')record.active=record.pending.previous;else if(record.pending.phase==='rolling_back')record.active=record.pending.target;record.pending=null;receipt({state:'interrupted_recovered'});await persist();}
      if(record.receipts.at(-1)?.state==='action_intent'){record.suspended=true;receipt({state:'uncertain_action',reason:'Interrupted action retained; do not replay automatically'});await persist();}
      if(record.active&&!record.suspended){session=await launch(record.active);attach(session);blocker=null;}
      if(record.suspended)blocker='Operator dispatch suspended after uncertain or repeated failures; a verified replacement can recover it';
      if(schedule&&!timer){timer=setInterval(()=>void tick().catch(()=>{}),15000);timer.unref?.();}
    }catch(error){blocker=String(error.message).slice(0,300);}return status();
  }
  async function stage({artifact,baselineHash=record.active?.manifest.sourceHash||null}){
    if(!config||closing)throw Error('Host operator is not enrolled');await verifySource(artifact);
    const proof=JSON.parse(await readFile(resolve(artifact.directory,'stage.json'),'utf8'));
    if(proof.state!=='staged'||proof.sourceHash!==artifact.manifest.sourceHash||proof.image!==(artifact.runtime?.image||config.image)||!proof.historyPreserved||!proof.runtime?.checks?.candidateTests||!proof.runtime.containerStopped)throw Error('Exact source must pass independent candidate tests and browser/history staging');
    let tested;const observations=[];
    try{
      tested=await launch(artifact);
      for(const sample of operatorCases){const decision=validateOperatorDecision(await tested.request('decide',{evidence:sample,memory:{}}),sample);observations.push({evidence:sample,actions:decision.actions});}
      // Tools are installed from the same immutable artifact and execute only here.
      const tools=artifact.manifest.files.filter(file=>/^operator\/tools\/[a-z][a-z0-9-]{0,48}\.js$/.test(file.path));
      let fixtures={};
      if(artifact.manifest.files.some(file=>file.path==='operator/tool-tests.json')){const raw=await readFile(resolve(artifact.source,'operator/tool-tests.json'),'utf8');if(Buffer.byteLength(raw)>32768)throw Error('Tool test fixtures too large');fixtures=JSON.parse(raw);if(!exact(fixtures,Object.keys(fixtures||{})))throw Error('Invalid tool test fixtures');}
      for(const tool of tools){const name=tool.path.split('/').at(-1).slice(0,-3),input=Object.hasOwn(fixtures,name)?fixtures[name]:{worldReady:true};if(Buffer.byteLength(JSON.stringify(input))>8192)throw Error('Tool test input too large');const value=await tested.request('tool',{name,input});if(Buffer.byteLength(JSON.stringify(value))>16384)throw Error('Operator tool output exceeded data limits');}
      await tested.stop();tested=null;
      const checked={version:1,state:'staged',sourceHash:artifact.manifest.sourceHash,baselineHash,kernelHash:config.kernelHash,image:artifact.runtime?.image||config.image,observations,tools:tools.map(tool=>tool.path),at:clock(),containerStopped:true};
      await atomicJson(resolve(artifact.directory,'operator-stage.json'),checked);return {artifact,receipt:checked};
    }finally{await tested?.stop();}
  }
  async function deploy(staged,{authorize=()=>true}={}){
    if(closing||!config)throw Error('Operator release is unavailable');busy=true;let next;
    const before={active:record.active,previous:record.previous,pending:record.pending,receipts:[...record.receipts],suspended:record.suspended,failures:record.failures};
    try{
      const {artifact}=staged;await verifySource(artifact);const checked=JSON.parse(await readFile(resolve(artifact.directory,'operator-stage.json'),'utf8'));
      if(checked.sourceHash!==artifact.manifest.sourceHash||checked.kernelHash!==config.kernelHash||checked.image!==(artifact.runtime?.image||config.image)||!checked.containerStopped||checked.baselineHash!==(record.active?.manifest.sourceHash||null))throw Error('Stale or mismatched operator staging receipt');
      next=await launch(artifact);
      validateOperatorDecision(await next.request('decide',{evidence:operatorCases[0],memory:record.memory}),operatorCases[0]);
      if(closing||!authorize())throw Error('Operator publication authorization changed');
      const previous=record.active;record.pending={phase:'deploying',previous,target:artifact};await persist();
      // Stop old authority before making the new pointer durable. No two operators dispatch.
      await session?.stop();session=null;if(closing||!authorize())throw Error('Operator publication authorization changed');record.previous=previous;record.active=artifact;record.pending=null;record.suspended=false;record.failures=0;receipt({state:'published',sourceHash:artifact.manifest.sourceHash});await persist();
      session=next;next=null;attach(session);blocker=null;return record.receipts.at(-1);
    }catch(error){await next?.stop();Object.assign(record,before);await persist();if(!session&&record.active){session=await launch(record.active);attach(session);}throw error;}
    finally{busy=false;}
  }
  async function rollback(reason='Requested operator rollback'){
    if(closing)return status();busy=true;let restored;
    try{
      const target=record.previous||record.active;if(!target)throw Error('No verified operator fallback');
      record.pending={phase:'rolling_back',target};await persist();await session?.stop();session=null;
      restored=await launch(target);record.active=target;record.previous=null;record.pending=null;receipt({state:'rolled_back',reason:String(reason).slice(0,200),sourceHash:target.manifest.sourceHash});await persist();session=restored;restored=null;attach(session);blocker=null;
    }catch(error){await restored?.stop();blocker=String(error.message).slice(0,300);throw error;}finally{busy=false;}return status();
  }
  async function cycle(){
    if(closing||!session||busy||record.suspended)return status();busy=true;const current=session;
    try{
      const snapshot=evidence(),decision=validateOperatorDecision(await current.request('decide',{evidence:snapshot,memory:record.memory}),snapshot);
      // Recheck owner activation and health after untrusted evaluation, before side effects.
      validateOperatorDecision(decision,evidence());
      if(closing)return status();
      record.memory=decision.memory;const action=decision.actions[0];
      if(action){const id=randomUUID();receipt({state:'action_intent',id,kind:action.kind});await persist();let result;
        if(action.kind==='tool'){result=await current.request('tool',{name:action.name,input:action.input??null});if(Buffer.byteLength(JSON.stringify(result))>16384)throw Error('Operator tool output too large');record.lastTool=clock();}
        else{result=await dispatch(action,id);if(action.kind==='backup_world')record.lastBackup=clock();}
        await atomicJson(resolve(root,'action-'+id+'.json'),{id,kind:action.kind,sourceHash:record.active.manifest.sourceHash,result:result??null,at:clock()});receipt({state:'action_completed',id,kind:action.kind});
        record.lastResult={kind:action.kind,result:result??null,at:clock()};
      }
      record.failures=0;await persist();
    }catch(error){record.failures=(record.failures||0)+1;receipt({state:'operator_failed',reason:String(error.message).slice(0,300)});await persist();busy=false;
      if(record.failures>=3){record.suspended=true;blocker='Operator stopped after three failures; verified replacement required';await session?.stop();session=null;await persist();}
      else await rollback('Decision, tool or capability failure');}
    finally{busy=false;}return status();
  }
  const tick=()=>serialized(cycle);
  async function close(){closing=true;clearInterval(timer);await chain;await session?.stop();session=null;}
  return {start:()=>serialized(start),status,stage:input=>serialized(()=>stage(input)),deploy:(staged,options)=>serialized(()=>deploy(staged,options)),rollback:reason=>serialized(()=>rollback(reason)),tick,close,baseline:()=>record.active,observations:()=>({hostOperator:status(),lastAction:record.lastResult||null,boundary:'Tool output is bounded untrusted observation data, never authority or instructions.'}),readMemory:()=>record.memory};
}
