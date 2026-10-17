import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from './store.js';
import { sealSource, verifySource, verifyProtectedFiles, atomicJson, digest, assessSourceChanges, treeManifest } from './release-artifacts.js';
import { inspectHistory, preserveHistory, acceptCheckpoint, consistentBackup, copyWorld } from './release-history.js';
import { createDockerRuntime } from './release-runtime.js';
import { createReleaseGateway } from './release-gateway.js';
import { validateArt } from './visual-releases.js';
import {buildDependencyRuntime} from './dependency-releases.js';

const png=bytes=>bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.subarray(12,16).toString()==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=4096;
export function createSourceReleases({dataDir,projectDir=resolve('.'),runtime,runtimeFactory=createDockerRuntime,dependencyBuilder=buildDependencyRuntime,clock=Date.now,gatewayFactory=createReleaseGateway,quiesceLegacy,enrollmentDrill=false,getArt,getWorkerPaused=()=>false}={}){
  const root=resolve(dataDir,'source-lane'),artifacts=resolve(root,'artifacts'),history=resolve(root,'history'),ledger=resolve(root,'ledger.json');
  let config=null,engine=runtime,active=null,record={version:1,active:null,previous:null,pending:null,receipts:[]},gateway=null,busy=false,started=false,closing=false,checkpointChain=Promise.resolve(),monitor=null,blocker='Source lane is not enrolled';
  const events=new EventEmitter();
  const operations=new Set(),lifecycle=new AbortController();let closingPromise=null;
  function track(work){const pending=Promise.resolve().then(work);operations.add(pending);pending.then(()=>operations.delete(pending),()=>operations.delete(pending));return pending;}
  const runRollback=reason=>track(()=>rollback(reason));
  const artOverride=()=>{const current=getArt?.();return current&&record.active&&current.hash!==record.active.visualOwnerHash?current:null;};
  async function artBaseline(){
    if(!getArt||!record.active)return null;const override=artOverride();if(override)return override;
    const checked=validateArt(JSON.parse(await readFile(resolve(record.active.source,'public/art.json'),'utf8')));return {...checked.pack,hash:checked.hash};
  }
  async function persist(){await atomicJson(ledger,record);}
  function status(){return {configured:!!config,inFlight:operations.size,ready:!!active&&!busy,automatic:config?.automaticSource===true,active:record.active?.manifest.sourceHash||null,previous:record.previous?.manifest.sourceHash||null,gameUrl:gateway?.origin||null,blocker,phase:record.pending?.phase||'idle',lastReceipt:record.receipts.at(-1)||null,limits:'Game-source lane only. Host/account/release policy and schema-breaking migrations cannot self-promote.'};}
  async function commit(session,encoded,{startup=false}={}){
    checkpointChain=checkpointChain.then(async()=>{
      if(active!==session&&!startup)throw new Error('Stale runtime checkpoint');
      const before=inspectHistory(resolve(history,'world.sqlite'));
      return acceptCheckpoint({directory:history,encoded,before,startup});
    });
    // A failed guard must not poison future recovery's serialized commits.
    const result=checkpointChain;checkpointChain=result.catch(()=>{});return result;
  }
  function attach(session){session.events.on('event',message=>void gateway.event(session,message));session.events.on('fault',()=>{if(active===session&&!busy&&!closing)void runRollback('Runtime fault').catch(()=>{});});}
  async function startArtifact(artifact,{signal,mode='serve',world=history}={}){
    signal=signal?AbortSignal.any([signal,lifecycle.signal]):lifecycle.signal;
    if(signal.aborted)throw new Error('Source runtime is closing');
    await verifySource(artifact);
    let selected=engine;
    if(artifact.runtime){
      const r=artifact.runtime,hash=digest(Buffer.concat([await readFile(resolve(artifact.source,'package.json')),await readFile(resolve(artifact.source,'package-lock.json'))]));
      if(r.parentImage!==config.image||r.parentToolsHash!==config.toolsHash||r.dependenciesHash!==hash)throw Error('Dependency runtime does not match sealed source or trusted parent');
      selected=runtimeFactory({...r,seccomp:resolve(projectDir,'runtime/seccomp_profile.json')});
      if(!(await selected.verify()).ready)throw Error('Dependency runtime image is unavailable');
    }
    const session=await selected.launch({source:artifact.source,world,mode,signal});
    try{
      const receipt=session.receipt;
      if(receipt.sourceHash!==artifact.manifest.sourceHash||!receipt.checks?.uiBuild||!receipt.checks.networkBlocked||!receipt.checks.separateUid)throw new Error('Runtime attestation does not match artifact');
      if(artifact.buildHash&&receipt.buildHash!==artifact.buildHash)throw new Error('Runtime build differs from staged build');
      await session.request('maintenance',{paused:getWorkerPaused()===true});
      return session;
    }catch(error){await session.stop();throw error;}
  }
  async function load(){
    await mkdir(root,{recursive:true});
    try{config=JSON.parse(await readFile(resolve(root,'config.json'),'utf8'));}catch{config=null;return false;}
    if(config.version!==1||!Number.isInteger(config.port)||config.port<1024||config.port>65535||config.automaticSource!==true&&config.automaticSource!==false)throw new Error('Invalid source lane configuration');
    // The runtime image is pinned by enrollment; candidates cannot alter it.
    const tools=await treeManifest(resolve(projectDir,'runtime'));
    if(config.toolsHash!==tools.sourceHash)throw new Error('Protected runtime tools changed; rebuild and enroll the image');
    const dependenciesHash=digest(Buffer.concat([await readFile(resolve(projectDir,'package.json')),await readFile(resolve(projectDir,'package-lock.json'))]));
    if(config.dependenciesHash!==dependenciesHash)throw new Error('Pinned runtime dependencies changed; rebuild and enroll the image');
    const proof=config.acceptance;
    if(!enrollmentDrill&&(!proof?.verified||proof.image!==config.image||proof.toolsHash!==config.toolsHash||proof.dependenciesHash!==dependenciesHash||proof.historyPreserved!==true))throw new Error('A real contained deployment, fault rollback and restart drill is required before enrollment');
    engine??=runtimeFactory({image:config.image,toolsHash:config.toolsHash,dependenciesHash,seccomp:resolve(projectDir,'runtime/seccomp_profile.json')});
    const available=await engine.verify();if(!available.ready){blocker=available.reason;return false;}
    try{record=JSON.parse(await readFile(ledger,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    return true;
  }
  async function start(){
    if(started||closing)return status();started=true;
    try{
      if(!await load())return status();
      if(!record.active){blocker='Import a paused world and bootstrap the trusted baseline before source releases';return status();}
      if(record.pending?.phase==='rolling_back'&&record.previous){record.active=record.previous;record.previous=null;await persist();}
      inspectHistory(resolve(history,'world.sqlite'));
      gateway=gatewayFactory({port:config.port,getRuntime:()=>active,commit,getArt:artOverride,onFault:session=>{if(active===session&&!busy&&!closing)void runRollback('Gateway or history verification fault').catch(()=>{});}});
      await gateway.start();busy=true;
      try{
        active=await startArtifact(record.active);await commit(active,active.receipt.checkpoint,{startup:true});attach(active);
        // An interrupted deploy never resumes a candidate receipt. The durable
        // active pointer and last acknowledged checkpoint are the recovery pair.
        if(record.pending){record.receipts.push({state:'interrupted_recovered',at:clock(),sourceHash:record.active.manifest.sourceHash});record.pending=null;await persist();}
        blocker=null;if(!closing)gateway.release();
      }catch(error){blocker=String(error.message);await active?.stop().catch(()=>{});active=null;}
      finally{busy=false;}
      monitor=setInterval(()=>{if(active&&!busy&&!closing){const session=active;void session.request('maintenance',{paused:getWorkerPaused()===true}).then(()=>session.request('http',{path:'/healthz',method:'GET'})).then(response=>{if(response.status!==200)throw new Error();}).catch(()=>{if(active===session)void runRollback('Health observation failed').catch(()=>{});});}},5000);monitor.unref?.();
    }catch(error){blocker=String(error.message).slice(0,300);}
    return status();
  }
  async function stage({candidate,runId,baselineHash,changes,checks,signal,artOverlay}){
    if(closing)return {state:'blocked',reason:'Source runtime is closing'};
    if(!config||!engine||(await engine.verify()).ready!==true)return {state:'blocked',reason:blocker||'No verified source runtime'};
    if(!checks?.passed||!checks?.discipline?.passed)return {state:'blocked',reason:'Candidate checks and state-impact discipline must pass'};
    const sourcePolicy=assessSourceChanges(changes,{dependencies:true});if(!sourcePolicy.passed)return {state:'blocked',reason:'Protected control-plane changes require a separate host lane',forbidden:sourcePolicy.forbidden};
    const currentArt=getArt?.();
    if(artOverlay)artOverlay=validateArt(artOverlay).pack;
    const artifact=await sealSource({candidate,output:artifacts,runId,baselineHash,policyHash:config.toolsHash,artOverlay});
    artifact.visualOwnerHash=currentArt?.hash||null;
    if(record.active)verifyProtectedFiles(record.active.manifest,artifact.manifest,{dependencies:true});
    const capturedDependencies=digest(Buffer.concat([await readFile(resolve(artifact.source,'package.json')),await readFile(resolve(artifact.source,'package-lock.json'))]));
    if(capturedDependencies!==config.dependenciesHash){
      if(record.active?.runtime?.dependenciesHash===capturedDependencies)artifact.runtime=structuredClone(record.active.runtime);
      else artifact.runtime=await dependencyBuilder({source:artifact.source,projectDir,directory:resolve(root,'dependency-images'),config,signal});
    }
    const fixture=resolve(root,'fixtures',randomUUID());await mkdir(fixture,{recursive:true});const store=openStore(resolve(fixture,'world.sqlite'));
    try{
      const veteran='1'.repeat(64),encounter='2'.repeat(64);
      store.player(veteran);store.saveGame(veteran,{hp:30,maxHp:30,quest:'complete',victories:2,deaths:1,inventory:{dewleaf:0,shard:0},inventoryTracked:true});
      const event=store.event(veteran,'quest_completed','first-echo',{fixture:true});store.awardItem(veteran,'tempered_blade',null,'legacy_import');store.learn('npc','keeper',veteran,'delivered_first_echo',true,event);
      store.player(encounter);store.saveGame(encounter,{hp:17,maxHp:30,quest:'active',victories:0,deaths:0,inventory:{dewleaf:1,shard:0},battle:{id:'moss-1',name:'Mossling',hp:7,maxHp:12,damage:3,turn:2}});
    }finally{store.db.close();}
    const before=inspectHistory(resolve(fixture,'world.sqlite'));let session;
    try{
      session=await startArtifact(artifact,{mode:'stage',world:fixture,signal});
      if(!session.receipt.checks.candidateTests)throw new Error('Candidate tests were not run inside staging');
      const observed=await session.request('observe');if(observed.version!==1||observed.passed!==true||!Array.isArray(observed.checks)||observed.checks.length<6)throw new Error('Independent browser journey failed');
      for(const name of ['desktop.png','mobile.png']){
        const encoded=observed.captures?.[name];if(typeof encoded!=='string'||encoded.length>4*1024*1024)throw new Error('Capture missing or oversized');const bytes=Buffer.from(encoded,'base64');if(!png(bytes))throw new Error('Invalid browser capture');await writeFile(resolve(artifact.directory,name),bytes,{flag:'wx'});
      }
      const final=await session.request('checkpoint');const retained=resolve(fixture,'observed');await acceptCheckpoint({directory:retained,encoded:final.checkpoint,before});
      artifact.buildHash=session.receipt.buildHash;
      await session.stop();
      const receipt={version:1,state:'staged',at:clock(),runId,sourceHash:artifact.manifest.sourceHash,baselineHash,toolsHash:config.toolsHash,image:session.image,buildHash:artifact.buildHash,visualOwnerHash:artifact.visualOwnerHash,checks:observed.checks,historyPreserved:true,runtime:{nodeVersion:session.receipt.nodeVersion,checks:session.receipt.checks,containerStopped:true},captures:['desktop.png','mobile.png']};
      await verifySource(artifact);await writeFile(resolve(artifact.directory,'stage.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
      artifact.receipt=receipt;return {state:'staged',artifact,receipt};
    }catch(error){const result={state:'rejected',reason:String(error.message).slice(0,300),diagnostic:String(error.diagnostic||'').slice(-6000),sourceHash:artifact.manifest.sourceHash};await writeFile(resolve(artifact.directory,'rejection.json'),JSON.stringify(result));return result;}
    finally{try{await session?.stop();}catch(error){await writeFile(resolve(artifact.directory,'cleanup-failure.json'),JSON.stringify({reason:String(error.message).slice(0,300),diagnostic:String(error.diagnostic||'').slice(-6000)}));throw error;}}
  }
  async function deploy(staged,{signal}={}){
    if(!active||busy||closing||!config?.automaticSource)return {state:'blocked',reason:'Source lane is not active or automatic source publication is disabled'};
    const artifact=staged?.artifact;if(staged?.state!=='staged'||!artifact)return {state:'blocked',reason:'An independently staged artifact is required'};
    const receipt=JSON.parse(await readFile(resolve(artifact.directory,'stage.json'),'utf8'));
    if(receipt.sourceHash!==artifact.manifest.sourceHash||receipt.buildHash!==artifact.buildHash||receipt.toolsHash!==config.toolsHash||receipt.image!==(artifact.runtime?.image||config.image)||receipt.visualOwnerHash!==artifact.visualOwnerHash||!receipt.historyPreserved)return {state:'blocked',reason:'Staging receipt mismatch'};
    if(receipt.baselineHash!==record.active.manifest.sourceHash)return {state:'blocked',reason:'Active source baseline changed; stage against the current release'};
    if((getArt?.()?.hash||null)!==artifact.visualOwnerHash)return {state:'blocked',reason:'Active visual baseline changed; stage again'};
    busy=true;gateway.hold();let next=null,previous=active;const oldRecord=structuredClone(record);
    try{
      if(signal?.aborted)throw new Error('Source release cancelled');
      await checkpointChain;const final=await previous.request('checkpoint');await commit(previous,final.checkpoint);
      const backupDir=resolve(root,'backups');await mkdir(backupDir,{recursive:true});const saved=await consistentBackup(resolve(history,'world.sqlite'),resolve(backupDir,`before-${randomUUID()}.sqlite`));
      // Persist intent before launching any code against a copied world.
      record.pending={phase:'deploying',sourceHash:artifact.manifest.sourceHash,backup:saved,at:clock()};await persist();
      next=await startArtifact(artifact,{signal});
      await commit(next,next.receipt.checkpoint,{startup:true});
      for(let i=0;i<3;i++){const health=await next.request('http',{path:'/healthz',method:'GET'});if(health.status!==200||JSON.parse(Buffer.from(health.body,'base64').toString()).ok!==true)throw new Error('Candidate readiness failed');}
      if(signal?.aborted)throw new Error('Source release cancelled');
      record.previous=record.active;record.active=artifact;record.pending=null;record.receipts.push({state:'published',kind:'game_source',at:clock(),sourceHash:artifact.manifest.sourceHash,backup:saved.sha256});await persist();
      active=next;attach(next);next=null;await previous.stop().catch(()=>{blocker='Old isolated runtime cleanup needs attention';});if(!closing)gateway.release();try{events.emit('release',record.receipts.at(-1));}catch{}return record.receipts.at(-1);
    }catch(error){
      await next?.stop().catch(()=>{});record=oldRecord;record.pending=null;record.receipts.push({state:'deployment_rejected',at:clock(),reason:String(error.message).slice(0,300)});await persist();
      // The old runtime was held, never given away or pointed at candidate data.
      active=previous;blocker=null;if(!closing)gateway.release();return record.receipts.at(-1);
    }finally{busy=false;}
  }
  async function rollback(reason='Owner requested source rollback'){
    if(busy||closing)return {state:'blocked',reason:'Source lane is busy'};
    busy=true;gateway?.hold();const broken=active;active=null;
    try{
      await checkpointChain;await broken?.stop();
      const target=record.previous||record.active,hasPrevious=!!record.previous;
      if(!target)throw new Error('No verified source is available; latest acknowledged world retained');
      await verifySource(target);record.pending={phase:'rolling_back',at:clock()};await persist();
      const restored=await startArtifact(target);
      try{await commit(restored,restored.receipt.checkpoint,{startup:true});}catch(error){await restored.stop();throw error;}
      record.active=target;record.previous=null;record.pending=null;record.receipts.push({state:hasPrevious?'rolled_back':'restarted',at:clock(),reason,sourceHash:record.active.manifest.sourceHash,history:'Latest acknowledged checkpoint; no old backup restored'});await persist();
      active=restored;attach(restored);blocker=null;if(!closing)gateway.release();events.emit('release',record.receipts.at(-1));return record.receipts.at(-1);
    }catch(error){blocker=String(error.message).slice(0,300);record.receipts.push({state:'recovery_blocked',at:clock(),reason:blocker});await persist();return record.receipts.at(-1);}
    finally{busy=false;}
  }
  async function close(){
    if(closingPromise)return closingPromise;closing=true;clearInterval(monitor);gateway?.hold();lifecycle.abort();
    closingPromise=(async()=>{while(operations.size)await Promise.allSettled([...operations]);gateway?.hold();await checkpointChain;await active?.stop();active=null;await gateway?.close();})();return closingPromise;
  }
  function observations(){
    if(!record.active)return null;
    const db=new DatabaseSync(resolve(history,'world.sqlite'),{readOnly:true});
    try{return {scope:'Protected game checkpoints; aggregate facts only',counts:Object.fromEntries(['players','events','item_instances','memories'].map(table=>[table,db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])),eventCounts:db.prepare('SELECT kind,COUNT(*) AS count FROM events GROUP BY kind').all()};}finally{db.close();}
  }
  async function refresh(){if(!active&&!busy&&!closing)try{await load();}catch(error){blocker=String(error.message).slice(0,300);}return status();}
  async function bootstrap(){
    if(busy||record.active||closing)return {state:'blocked',reason:'Source lane already owns a world or is busy'};
    if(!quiesceLegacy)return {state:'blocked',reason:'The trusted legacy world must be quiesced by its owning server'};
    busy=true;
    try{
    if(!await load())return {state:'blocked',reason:blocker};
    const visible=getArt?.(),artOverlay=visible?Object.fromEntries(Object.entries(visible).filter(([key])=>!['hash','releaseId'].includes(key))):null;
    const staged=await stage({candidate:projectDir,runId:'trusted-baseline',baselineHash:null,changes:[],checks:{passed:true,discipline:{passed:true}},artOverlay});
    if(staged.state!=='staged')return staged;
    await quiesceLegacy();
    const backupDir=resolve(root,'backups');await mkdir(backupDir,{recursive:true});const source=resolve(dataDir,'world.sqlite');
    const backup=await consistentBackup(source,resolve(backupDir,`control-before-cutover-${randomUUID()}.sqlite`));
    await mkdir(history,{recursive:true});await copyWorld(source,resolve(history,'world.sqlite'));
    record.active=staged.artifact;record.receipts.push({state:'baseline_imported',at:clock(),sourceHash:staged.artifact.manifest.sourceHash,backup:backup.sha256});await persist();
    started=false;await start();return status();
    }finally{busy=false;}
  }
  return {start:()=>track(start),status,refresh,observations,artBaseline,stage:input=>track(()=>stage(input)),deploy:(...args)=>track(()=>deploy(...args)),rollback:runRollback,bootstrap:()=>track(bootstrap),close,events,baseline:()=>record.active?{source:record.active.source,hash:record.active.manifest.sourceHash}:null};
}
