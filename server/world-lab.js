import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir,rm,writeFile } from 'node:fs/promises';
import { resolve,relative } from 'node:path';

const wait=ms=>new Promise(done=>setTimeout(done,ms));
const inside=(root,target)=>{const r=relative(root,target);return r===''||(!r.startsWith('..')&&!r.includes(':'));};

async function freePort(){return new Promise((resolvePort,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const {port}=probe.address();probe.close(error=>error?reject(error):resolvePort(port));});});}

export function createWorldLab({dataDir,projectDir=resolve('.'),embedOrigin='http://127.0.0.1:3000',clock=Date.now,visuals=null,spawnProcess=spawn,fetcher=fetch,portFactory=freePort}={}){
  const root=resolve(dataDir,'studio-lab'),project=resolve(projectDir);let current=null;
  const state=()=>current?{state:current.exited?'failed':'running',kind:'current_source_review',url:current.url,startedAt:current.startedAt,dataDir:current.dataDir,visualRevision:current.visualRevision||null,processExit:current.exited||null,description:current.exited?'The disposable World Lab stopped before it could be reviewed.':'A disposable copy of the current source map. It does not contain production player data, credentials or release authority.'}:{state:'stopped',kind:'current_source_review',url:null,visualRevision:null,description:'Start a fresh disposable map to review the current source alongside Studio direction.'};
  async function syncVisualRelease(){
    if(!current||!visuals)return {...state(),refreshed:false};
    const pack=visuals.read(),revision=pack.hash||null;
    if(revision===current.visualRevision)return {...state(),refreshed:false};
    await writeFile(resolve(current.dataDir,'visual-art.json'),JSON.stringify(pack));
    current.visualRevision=revision;
    return {...state(),refreshed:true};
  }
  async function stop({removeData=false}={}){
    const lab=current;if(!lab)return state();current=null;
    if(!lab.process.killed){lab.process.kill('SIGTERM');const exited=await Promise.race([new Promise(done=>lab.process.once('exit',()=>done(true))),wait(5000).then(()=>false)]);if(!exited)lab.process.kill('SIGKILL');}
    if(removeData&&inside(root,lab.dataDir))await rm(lab.dataDir,{recursive:true,force:true});
    return state();
  }
  async function start(){
    if(current)return state();await mkdir(root,{recursive:true});const port=await portFactory(),id=`review-${clock()}-${Math.random().toString(16).slice(2,10)}`,labData=resolve(root,id),url=`http://127.0.0.1:${port}`;
    if(!inside(root,labData))throw new Error('Invalid World Lab path');await mkdir(labData,{recursive:true});
    const visualFile=resolve(labData,'visual-art.json');
    if(visuals)await writeFile(visualFile,JSON.stringify(visuals.read()));
    const child=spawnProcess(process.execPath,['server/index.js'],{cwd:project,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:labData,BACKUP_DIR:resolve(labData,'backups'),PUBLIC_ORIGIN:url,STUDIO_EMBED_ORIGIN:embedOrigin,LW_ART_FILE:visuals?visualFile:''},stdio:['ignore','ignore','ignore'],windowsHide:true});
    current={process:child,url,startedAt:clock(),dataDir:labData,visualRevision:visuals?.read().hash||null,exited:null};
    child.once('exit',(code,signal)=>{if(current?.process===child)current.exited={code,signal};});
    for(let attempt=0;attempt<50;attempt++){try{const response=await fetcher(`${url}/healthz`,{signal:AbortSignal.timeout(1000)});if(response.ok)return state();}catch{/* The disposable Realm is still starting. */}await wait(100);}
    await stop({removeData:true});throw new Error('World Lab did not become healthy');
  }
  async function reset(){await stop({removeData:true});return start();}
  return {state,start,stop,reset,refresh:syncVisualRelease,close:()=>stop({removeData:false})};
}
