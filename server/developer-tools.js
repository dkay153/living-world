import {mkdir,readdir,lstat,readFile,writeFile,rename,open,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sealSource,digest} from './release-artifacts.js';
import {buildDependencyRuntime,prepareProductionDependencies} from './dependency-releases.js';
import {createDockerRuntime} from './release-runtime.js';
import {runProcess} from './codex-process.js';
import {developmentPackages,packageSpec,packageName} from './development-packages.js';
import {openStore} from './store.js';
import {validatePng} from './developer-preflight.js';
import {validateJourney} from '../scripts/play-game.js';

export function validateToolRequest(input){
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','tests','add','remove','argv','artifacts','service','operation','journey'].includes(k)))throw Error('Unknown tool fields');
  if(input.journey!==undefined){if(input.action!=='preview')throw Error('Journeys require the candidate preview');validateJourney(input.journey);}
  if(input.action==='host'){
    if(Object.keys(input).length!==3||!['docker','realm'].includes(input.service)||!['inspect','repair'].includes(input.operation))throw Error('Choose a typed Docker or realm inspection/repair');return input;
  }
  if(input.service!==undefined||input.operation!==undefined)throw Error('Host fields require the host action');
  if(!['prepare','test','contracts','build','packages','dependencies','command','preview'].includes(input.action))throw Error('Unknown development tool');
  if(input.action==='command'){
    if(!Array.isArray(input.argv)||!['node','npm','/bin/sh'].includes(input.argv[0])||input.argv.length>32||input.argv.some(s=>typeof s!=='string'||s.length>12000||s.includes('\0'))||input.add||input.remove||input.tests)throw Error('Choose a contained node/npm/sh argument vector');
    if(input.artifacts!==undefined&&(!Array.isArray(input.artifacts)||input.artifacts.length>3||input.artifacts.some(p=>typeof p!=='string'||!/^\.scratch\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.png$/.test(p))))throw Error('Export at most three scratch PNGs');return input;
  }
  if(input.argv!==undefined||input.artifacts!==undefined)throw Error('Commands and artifacts require the command action');
  if(['packages','dependencies'].includes(input.action)){if(!Array.isArray(input.add||[])||!Array.isArray(input.remove||[])||(input.add||[]).some(p=>!packageSpec(p))||(input.remove||[]).some(p=>!packageName(p))||input.tests!==undefined)throw Error('Use exact registry tool versions and plain removal names');return input;}
  if(input.add!==undefined||input.remove!==undefined)throw Error('Package operations require the packages action');
  if(input.action==='test'){
    if(!Array.isArray(input.tests)||!input.tests.length||input.tests.length>32||input.tests.some(p=>typeof p!=='string'||!/^tests\/[a-zA-Z0-9-]+\.test\.js$/.test(p)))throw Error('Choose 1-32 top-level test files');
  }else if(input.tests!==undefined)throw Error('Tests only apply to the test action');
  return input;
}

// A model requests structured capabilities, never a host shell command. All
// candidate builds, tests and browser execution stay inside the pinned image.
export function createDeveloperTools({candidate,directory,dataDir,projectDir=resolve('.'),signal,perform,hostRepair,preview,runId,onProgress=()=>{}}){
  const requests=resolve(candidate,'.scratch/tool-requests'),responses=resolve(candidate,'.scratch/tool-results');
  let closed=false,pending=null,timer=null,packages=null;
  const seen=new Set();
  async function plain(path){const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==resolve(path))throw Error('Tool directory must be plain');}
  async function execute(input,requestName){
    if(input.action==='preview'){
      if(!preview)throw Error('Candidate preview unavailable');const state=await preview.request({candidate,runId,signal});
      const observed=await preview.observe(input.journey||{},signal),name=requestName.replace('.json','-preview.png');
      await plain(responses);await writeFile(resolve(responses,name),observed.bytes,{flag:'wx'});
      return {passed:true,...state,sourceHash:observed.sourceHash,observedAt:observed.observedAt,text:observed.text,artifacts:['.scratch/tool-results/'+name],boundary:'Private candidate world; no publication or player history access'};
    }
    if(input.action==='host'){if(!hostRepair)throw Error('Host repair capability unavailable');return hostRepair.request(input);}
    const config=JSON.parse(await readFile(resolve(dataDir,'source-lane/config.json'),'utf8'));
    if(input.action==='packages'){packages??=developmentPackages({image:config.image,signal});return packages.change(input);}
    if(input.action==='dependencies')return prepareProductionDependencies({candidate,projectDir,config,...input,signal});
    if(packages?.volume&&!packages.ready)throw Error('Repair the failed development tool profile before executing checks');
    const artifact=await sealSource({candidate,output:directory,runId:'developer-tool',baselineHash:null,policyHash:config.toolsHash});
    const dependenciesHash=digest(Buffer.concat([await readFile(resolve(artifact.source,'package.json')),await readFile(resolve(artifact.source,'package-lock.json'))]));
    const selected=dependenciesHash===config.dependenciesHash?config:await buildDependencyRuntime({source:artifact.source,projectDir,directory:resolve(dataDir,'source-lane/dependency-images'),config,signal});
    const runtime=createDockerRuntime({...selected,toolVolume:packages?.volume,developmentWorkspace:!!packages?.volume||['command','test','contracts'].includes(input.action)});if(!(await runtime.verify()).ready)throw Error('Pinned development tools unavailable; repair Docker/runtime before proceeding');
    const seed=resolve(directory,'seed');await mkdir(seed,{recursive:true});const db=openStore(resolve(seed,'world.sqlite'));db.db.close();
    let session;
    try{
      session=await runtime.launch({source:artifact.source,world:seed,mode:'serve',signal});
      let args;
      if(input.action==='test')args=['node','--test','--test-concurrency=1',...input.tests];
      else if(input.action==='command')args=input.argv;
      else if(input.action==='contracts')args=['node','scripts/validate-contracts.js'];
      else args=['node','-e','console.log(JSON.stringify({node:process.version,next:require("next/package.json").version,playwright:require("playwright-core/package.json").version,npm:require("/usr/local/lib/node_modules/npm/package.json").version,browser:process.env.PLAYWRIGHT_BROWSERS_PATH,build:true}))'];
      let workdir='/work/realm';
      if(packages?.volume||['command','test','contracts'].includes(input.action)){
        const bootstrap=`const fs=require('node:fs/promises'),path=require('node:path');(async()=>{const dir='/dev-work/tool-check';await fs.cp('/work/realm',dir,{recursive:true,filter:p=>!p.includes('/node_modules')});async function writable(p){await fs.chmod(p,0o755);for(const e of await fs.readdir(p,{withFileTypes:true})){const f=p+'/'+e.name;if(e.isDirectory())await writable(f);else if(!e.isSymbolicLink())await fs.chmod(f,0o644);}}await writable(dir);await fs.mkdir(dir+'/.scratch',{recursive:true});await fs.mkdir(dir+'/node_modules');for(const root of [require('node:fs').existsSync('/opt/lw-app-deps/node_modules')?'/opt/lw-app-deps/node_modules':'/opt/lw-deps/node_modules','/devtools/node_modules']){let names=[];try{names=await fs.readdir(root);}catch(e){if(e.code!=='ENOENT')throw e;}for(const name of names){if(name==='.bin'){await fs.mkdir(dir+'/node_modules/.bin',{recursive:true});for(const bin of await fs.readdir(root+'/.bin')){const to=dir+'/node_modules/.bin/'+bin;await fs.rm(to,{force:true});await fs.symlink(root+'/.bin/'+bin,to);}continue;}if(name.startsWith('.'))continue;if(name==='ws'){await fs.cp(root+'/ws',dir+'/node_modules/ws',{recursive:true,dereference:true});continue;}if(name.startsWith('@')){await fs.mkdir(dir+'/node_modules/'+name,{recursive:true});for(const child of await fs.readdir(root+'/'+name)){const to=dir+'/node_modules/'+name+'/'+child;await fs.rm(to,{recursive:true,force:true});await fs.symlink(root+'/'+name+'/'+child,to);}}else{const to=dir+'/node_modules/'+name;await fs.rm(to,{recursive:true,force:true});await fs.symlink(root+'/'+name,to);}}}})().catch(e=>{console.log(e.message);process.exitCode=1;});`;
        const prepared=await runProcess('docker',['exec','--user','10002:10002',session.name,'node','-e',bootstrap],{timeoutMs:30000,maxBytes:4000,signal});if(prepared.code!==0)throw Error('Private tool workspace failed: '+prepared.stdout);workdir='/dev-work/tool-check';if(input.action==='build')args=['node','node_modules/next/dist/bin/next','build','ui','--webpack'];
      }
      const result=await runProcess('docker',['exec','--user','10002:10002','--workdir',workdir,'--env','HOME=/tmp/observer','--env','PLAYWRIGHT_BROWSERS_PATH=/opt/lw-browsers',session.name,...args],{timeoutMs:180000,maxBytes:64000,signal});
      const captures=[];let artifactError=null;
      if(input.artifacts?.length){try{
        const exporter="const fs=require('node:fs'),path=require('node:path'),out=[];for(const file of JSON.parse(process.argv[1])){const actual=path.resolve(file);if(!actual.startsWith(process.cwd()+'/')||fs.realpathSync(actual)!==actual)throw Error('Artifact escaped worker');const s=fs.lstatSync(actual);if(!s.isFile()||s.nlink!==1||s.size>4194304)throw Error('Invalid image artifact');out.push(fs.readFileSync(actual).toString('base64'));}console.log(JSON.stringify(out));";
        const images=await runProcess('docker',['exec','--user','10002:10002','--workdir',workdir,session.name,'node','-e',exporter,JSON.stringify(input.artifacts)],{timeoutMs:10000,maxBytes:18*1024*1024,signal});if(images.code!==0||images.overflow)throw Error('Cannot export requested images');
        for(const [index,encoded] of JSON.parse(images.stdout).entries()){const bytes=Buffer.from(encoded,'base64');validatePng(bytes);await plain(responses);const name=requestName.replace('.json','-'+index+'.png');await writeFile(resolve(responses,name),bytes,{flag:'wx'});captures.push('.scratch/tool-results/'+name);}
      }catch(error){artifactError=String(error.message);}}
      return {sourceHash:artifact.manifest.sourceHash,developmentProfile:packages?.profile||[],artifacts:captures,artifactError,passed:!artifactError&&result.code===0&&!result.timedOut&&!result.cancelled&&!result.overflow,...result,boundary:'Disposable development checks of captured input; no owner account, live history, host execution or publication authority'};
    }finally{await session?.stop();}
  }
  async function poll(){
    await plain(resolve(candidate,'.scratch'));await plain(requests);await plain(responses);
    for(const name of (await readdir(requests)).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)&&!seen.has(name)).slice(0,32)){
      if(closed||signal?.aborted)break;
      if(!/^[a-f0-9-]{36}\.json$/.test(name)||seen.has(name))continue;
      seen.add(name);let result;
      try{
        const path=resolve(requests,name),info=await lstat(path,{bigint:true});if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1n||info.size>8192n)throw Error('Invalid tool request file');
        const file=await open(path,'r');let bytes;
        try{const opened=await file.stat({bigint:true});if(opened.ino!==info.ino||opened.dev!==info.dev||opened.nlink!==1n)throw Error('Tool request changed before read');bytes=await file.readFile();const after=await file.stat({bigint:true});if(bytes.length>8192||opened.size!==after.size||opened.mtimeNs!==after.mtimeNs)throw Error('Tool request changed during read');}finally{await file.close();}
        let decoded;try{decoded=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Malformed tool request JSON');}
        const input=validateToolRequest(decoded);
        onProgress('Running requested '+input.action+' in the contained development tools');
        result=await (perform||execute)(input,name);
      }catch(error){result={passed:false,error:String(error.message).slice(0,1000)};}
      await plain(responses);const temp=resolve(responses,name+'.tmp');await writeFile(temp,JSON.stringify(result),{flag:'wx'});await rename(temp,resolve(responses,name));
    }
  }
  return {
    check:input=>execute(validateToolRequest(input),'trusted-check.json'),
    async flush(){await pending;if(closed)return;if(!pending)pending=poll().finally(()=>{pending=null;});await pending;},
    async start(){await mkdir(requests,{recursive:true});await mkdir(responses,{recursive:true});timer=setInterval(()=>{if(!pending&&!closed)pending=poll().catch(error=>onProgress('Development tools stopped: '+error.message)).finally(()=>{pending=null;});},250);},
    async close(){closed=true;clearInterval(timer);await pending;await packages?.close();}
  };
}
