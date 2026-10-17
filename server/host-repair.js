import {mkdir,readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runProcess} from './codex-process.js';
import {atomicJson} from './release-artifacts.js';

// Fixed capability implementations. Candidate text never becomes a host
// executable, path, argument, environment setting or download location.
export function createHostRepair({directory,sources,beforeRepair=async()=>{},runner=runProcess,clock=Date.now,platform=process.platform,programFiles=process.env.ProgramFiles||'C:/Program Files'}){
  let chain=Promise.resolve();
  const docker=platform==='win32'?resolve(programFiles,'Docker/Docker/resources/bin/docker.exe'):'docker';
  async function inspect(service){
    if(service==='realm')return sources.status();
    const result=await runner(docker,['info','--format','{{.ServerVersion}}'],{timeoutMs:10000,maxBytes:4096});
    return {ready:result.code===0&&!result.timedOut&&!result.overflow,version:result.code===0?result.stdout.trim().slice(0,80):null};
  }
  async function perform({service,operation}){
    if(!['docker','realm'].includes(service)||!['inspect','repair'].includes(operation))throw Error('Unknown typed host repair');
    const before=await inspect(service);if(operation==='inspect'||before.ready)return {passed:true,service,changed:false,status:before};
    await mkdir(directory,{recursive:true});const file=resolve(directory,service+'.json');let ledger={attempts:[]};
    try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    ledger.attempts=ledger.attempts.filter(at=>clock()-at<3600000);
    if(ledger.attempts.length>=3||ledger.attempts.some(at=>clock()-at<60000))throw Error('Host repair backoff active; retained failure requires diagnosis');
    ledger.attempts.push(clock());ledger.pending=true;await atomicJson(file,ledger);
    try{
      await beforeRepair(service);
      if(service==='realm'){
        const refreshed=await sources.refresh();
        if(!refreshed.ready&&refreshed.configured)await sources.rollback('Typed host repair of unavailable realm; preserve latest checkpoint');
      }else{
        if(platform!=='win32')throw Error('Docker daemon startup is not configured for this host');
        const desktop=resolve(programFiles,'Docker/Docker/Docker Desktop.exe');await access(desktop);
        // The sole GUI target is fixed; no user/candidate text enters this code.
        const desktopStatus=await runner(docker,['desktop','status'],{timeoutMs:10000,maxBytes:2000});
        const result=desktopStatus.code===0&&/running/i.test(desktopStatus.stdout)
          ?await runner(docker,['desktop','restart','--detach'],{timeoutMs:15000,maxBytes:2000})
          :await runner('powershell.exe',['-NoProfile','-Command',"Start-Process -FilePath (Join-Path $env:ProgramFiles 'Docker\\Docker\\Docker Desktop.exe') -WindowStyle Hidden"],{timeoutMs:15000,maxBytes:2000});
        if(result.code!==0)throw Error('Docker Desktop startup failed');
        for(let i=0;i<60;i++){if((await inspect(service)).ready)break;await new Promise(done=>setTimeout(done,1000));}
      }
      const after=await inspect(service);if(!after.ready)throw Error('Host repair did not establish readiness');
      ledger.pending=false;ledger.result={passed:true,service,changed:true,status:after};await atomicJson(file,ledger);return ledger.result;
    }catch(error){ledger.pending=false;ledger.result={passed:false,service,error:String(error.message).slice(0,300)};await atomicJson(file,ledger);throw error;}
  }
  return {request(input){const result=chain.then(()=>perform(input));chain=result.catch(()=>{});return result;}};
}
