import { mkdir,cp,writeFile,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createSourceReleases } from './source-releases.js';
import { createDockerRuntime } from './release-runtime.js';
import { openStore } from './store.js';
import { inspectHistory } from './release-history.js';
import { atomicJson } from './release-artifacts.js';

// Only the trusted enrollment CLI invokes this. The drill has synthetic data,
// a temporary game port and no authority over the real world's source config.
export async function proveRuntime({projectDir,directory,image,toolsHash,dependenciesHash}){
  const dataDir=resolve(directory,'data'),configRoot=resolve(dataDir,'source-lane');await mkdir(configRoot,{recursive:true});
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(done=>probe.close(done));
  const config={version:1,image,toolsHash,dependenciesHash,port,automaticSource:true};await atomicJson(resolve(configRoot,'config.json'),config);
  const store=openStore(resolve(dataDir,'world.sqlite'));try{store.player('synthetic-only');store.event('synthetic-only','discovery','historic-enrollment-anchor');}finally{store.db.close();}
  const real=createDockerRuntime({image,toolsHash,dependenciesHash,seccomp:resolve(projectDir,'runtime/seccomp_profile.json')}),sessions=[];
  const runtime={verify:real.verify,launch:async options=>{const session=await real.launch(options);sessions.push(session);return session;}};
  const makeLane=()=>createSourceReleases({dataDir,projectDir,runtime,enrollmentDrill:true,quiesceLegacy:async()=>{}});
  let lane=makeLane(),socket,receipt;
  const delay=ms=>new Promise(done=>setTimeout(done,ms));
  async function until(check,label){for(let i=0;i<3600;i++){if(check())return;await delay(100);}throw new Error(label);}
  try{
    await lane.start();if(!(await lane.bootstrap()).ready)throw new Error('Contained baseline cutover drill failed');
    const initial=lane.status().active,candidate=resolve(directory,'candidate');await cp(lane.baseline().source,candidate,{recursive:true});await writeFile(resolve(candidate,'public/release-drill.txt'),'Synthetic source release drill');
    const staged=await lane.stage({candidate,runId:'enrollment-drill',baselineHash:initial,changes:[{path:'public/release-drill.txt',kind:'added'}],checks:{passed:true,discipline:{passed:true}}});
    if(staged.state!=='staged'||(await lane.deploy(staged)).state!=='published')throw new Error('Contained publication drill failed');
    const origin=lane.status().gameUrl,guest='d'.repeat(64);let state=null,version=0;
    socket=new WebSocket(origin.replace('http','ws')+'/world',{origin,headers:{Cookie:'lw_realm='+guest}});socket.on('error',()=>{});socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='state'){state=message;version++;}});
    await until(()=>!!state,'Enrollment connection failed');
    for(const message of [{type:'move',direction:'up'},{type:'move',direction:'up'},{type:'interact'}]){await delay(180);const before=version;socket.send(JSON.stringify(message));await until(()=>version>before,'Enrollment action acknowledgment failed');}
    if(!state.discoveries.includes('well'))throw new Error('Enrollment discovery was not acknowledged');
    const checkpoint=inspectHistory(resolve(configRoot,'history/world.sqlite'));if(!checkpoint.rows.events.some(row=>row.player===guest&&row.subject==='well'))throw new Error('Acknowledgment preceded durable checkpoint');
    // Kill the actual published container. Its fault, not a model assertion,
    // must trigger automatic rollback to previous source with the new history.
    await sessions.at(-1).stop();await until(()=>lane.status().lastReceipt?.state==='rolled_back'&&lane.status().ready||lane.status().lastReceipt?.state==='recovery_blocked','Automatic rollback timed out');
    if(lane.status().active!==initial||!lane.status().ready)throw new Error('Automatic rollback did not recover baseline');
    await lane.close();lane=makeLane();if(!(await lane.start()).ready)throw new Error('Restart did not recover the source/world pair');
    const retained=inspectHistory(resolve(configRoot,'history/world.sqlite'));if(!retained.rows.events.some(row=>row.player===guest&&row.subject==='well'))throw new Error('Rollback or restart lost acknowledged history');
    receipt={version:1,verified:true,at:new Date().toISOString(),image,toolsHash,dependenciesHash,historyPreserved:true,checks:['Actual confined baseline and candidate builds','Separate-UID browser and saved-world journeys','Exact-source publication','Acknowledgment after host checkpoint','Actual container fault triggers rollback','Latest history survives rollback and host restart','Confirmed confined runtime teardown'],baseline:initial,checkpointHash:retained.hash};
  }finally{socket?.terminate();await lane.close();}
  await atomicJson(resolve(directory,'acceptance.json'),receipt);return receipt;
}
