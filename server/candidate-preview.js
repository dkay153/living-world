import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {sealSource,digest} from './release-artifacts.js';
import {createDockerRuntime} from './release-runtime.js';
import {buildDependencyRuntime} from './dependency-releases.js';
import {createReleaseGateway} from './release-gateway.js';
import {openStore} from './store.js';
import {runProcess} from './codex-process.js';
import {validateJourney} from '../scripts/play-game.js';
import {validatePng} from './developer-preflight.js';

// A local view of sealed candidate source. It never mounts canonical history
// or account data, and it has no promotion/rollback authority.
export function createCandidatePreview({dataDir,projectDir,embedOrigin='http://127.0.0.1:3105',runtimeFactory=createDockerRuntime,gatewayFactory=createReleaseGateway,portFactory=async()=>new Promise((done,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):done(p));});})}){
  let current=null,view={state:'stopped',url:null},chain=Promise.resolve(),closed=false,timer=null;
  const status=()=>({...view});
  async function update({candidate,runId,signal}){
    if(closed||signal?.aborted)throw Error('Candidate preview stopped');
    const directory=resolve(dataDir,'development-previews',randomUUID());
    await mkdir(directory,{recursive:true});
    const config=JSON.parse(await readFile(resolve(dataDir,'source-lane/config.json'),'utf8'));
    const artifact=await sealSource({candidate,output:directory,runId,baselineHash:null,policyHash:config.toolsHash});
    if(current?.sourceHash===artifact.manifest.sourceHash)return status();
    view={...view,state:'building',pendingSourceHash:artifact.manifest.sourceHash,runId,error:null};
    let session,gateway;
    try{
      const dependenciesHash=digest(Buffer.concat([await readFile(resolve(artifact.source,'package.json')),await readFile(resolve(artifact.source,'package-lock.json'))]));
      let selected=dependenciesHash===config.dependenciesHash?config:null;
      if(!selected){
        // Retained work may precede a trusted tooling update. Reuse an exact
        // host-recorded image; never reinterpret old package scripts as edits.
        let ledger;try{ledger=JSON.parse(await readFile(resolve(dataDir,'source-lane/ledger.json'),'utf8'));}catch{}
        selected=[ledger?.active,ledger?.previous].map(a=>a?.runtime).find(r=>r?.dependenciesHash===dependenciesHash)||null;
      }
      selected??=await buildDependencyRuntime({source:artifact.source,projectDir,directory:resolve(dataDir,'source-lane/dependency-images'),config,signal});
      const runtime=runtimeFactory(selected);if(!(await runtime.verify()).ready)throw Error('Candidate preview requires verified containment');
      const seed=resolve(directory,'seed');await mkdir(seed,{recursive:true});const store=openStore(resolve(seed,'world.sqlite'));store.db.close();
      session=await runtime.launch({source:artifact.source,world:seed,mode:'serve',signal});
      if(closed||signal?.aborted)throw Error('Candidate preview stopped');
      gateway=gatewayFactory({port:await portFactory(),embedOrigin,getRuntime:()=>session,commit:async()=>{},onFault:()=>{if(current?.session===session)view={...view,state:'failed',error:'Candidate preview runtime stopped'};}});
      session.events.on('event',message=>void gateway.event(session,message));
      await gateway.start();gateway.release();
      const previous=current;
      current={session,gateway,sourceHash:artifact.manifest.sourceHash};
      view={state:'running',url:gateway.origin,runId,sourceHash:current.sourceHash,updatedAt:Date.now(),kind:'candidate_preview',description:'Agent candidate · Private disposable history · Not published'};
      if(previous){await previous.gateway.close();await previous.session.stop();}
      return status();
    }catch(error){if(gateway&&current?.gateway!==gateway)await gateway.close().catch(()=>{});if(session&&current?.session!==session)await session.stop();view={...view,state:current?'running':'failed',error:String(error.message).slice(0,400)};throw error;}
  }
  function request(input){const result=chain.then(()=>update(input));chain=result.catch(()=>{});return result;}
  return {status,request,
    async observe(input={},signal){
      const journey=validateJourney(input),session=current?.session;if(!session?.name)throw Error('No running candidate preview');
      const script=`const{createRequire}=require('node:module'),r=createRequire('/opt/lw-deps/package.json');(async()=>{const{chromium}=r('playwright-core'),j=JSON.parse(process.argv[1]);let b;try{b=await chromium.launch({headless:true,chromiumSandbox:true});const p=await b.newPage({viewport:{width:j.width,height:j.height}});await p.context().addCookies([{name:'lw_session',value:'${digest(Buffer.from('private-preview-'+dataDir))}',url:'http://127.0.0.1:3000'}]);await p.goto('http://127.0.0.1:3000'+j.route,{waitUntil:'networkidle'});const g=j.route==='/'?p.frameLocator('iframe'):p;await g.locator('#connection').filter({hasText:'WORLD ONLINE'}).waitFor({timeout:15000});for(const s of j.steps){const l=s.selector?g.locator(s.selector):g.locator('#world');if(s.action==='press')await l.press(s.value);if(s.action==='click')await l.click({timeout:5000});if(s.action==='visible')await l.waitFor({state:'visible',timeout:5000});if(s.action==='text')await l.filter({hasText:s.value}).waitFor({timeout:5000});if(s.action==='wait')await p.waitForTimeout(s.value);if(s.action==='reload')await p.reload({waitUntil:'networkidle'});}console.log(JSON.stringify({png:(await p.screenshot()).toString('base64'),text:(await g.locator('body').innerText()).slice(0,10000)}));}finally{await b?.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});`;
      const result=await runProcess('docker',['exec','--user','10002:10002','--env','HOME=/tmp/observer','--env','PLAYWRIGHT_BROWSERS_PATH=/opt/lw-browsers',session.name,'node','-e',script,JSON.stringify(journey)],{timeoutMs:45000,maxBytes:6*1024*1024,signal});
      if(result.code!==0||result.timedOut||result.overflow||result.cancelled)throw Error('Candidate observation failed: '+result.stdout.slice(-600));
      if(current?.session!==session)throw Error('Candidate changed during observation');
      const output=JSON.parse(result.stdout),bytes=Buffer.from(output.png,'base64');validatePng(bytes);
      view={...view,observedAt:Date.now()};return {bytes,text:output.text,sourceHash:current.sourceHash,observedAt:view.observedAt};
    },
    schedule(input){clearTimeout(timer);if(closed)return;timer=setTimeout(()=>{void request(input).catch(()=>{});},12000);timer.unref?.();},
    async close(){closed=true;clearTimeout(timer);await chain;if(current){await current.gateway.close();await current.session.stop();current=null;}view={state:'stopped',url:null};}
  };
}
