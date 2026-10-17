import {resolve,sep} from 'node:path';
import {runProcess} from './codex-process.js';

export function disposableMounts(mounts,dataDir){
  const input=mounts.find(m=>m.Destination==='/input'),seed=mounts.find(m=>m.Destination==='/seed');
  const within=(path,root)=>typeof path==='string'&&resolve(path).startsWith(resolve(root)+sep);
  return !!input&&!!seed&&input.RW===false&&seed.RW===false&&
    (within(input.Source,resolve(dataDir,'development-tools'))&&within(seed.Source,resolve(dataDir,'development-tools'))||
     within(input.Source,resolve(dataDir,'source-lane/artifacts'))&&within(seed.Source,resolve(dataDir,'source-lane/fixtures')));
}
// No candidate-supplied container IDs or paths. Only idle disposable mounts
// owned by this data root qualify; canonical world mounts never do.
export function createSandboxReaper({dataDir,idle,runner=runProcess}){
  return async()=>{
    if(!idle())throw Error('Sandbox cleanup requires no model jobs or source operations');
    const listed=await runner('docker',['ps','--all','--filter','name=lw-realm-','--format','{{.Names}}'],{timeoutMs:10000,maxBytes:8192});
    if(listed.code!==0||listed.timedOut||listed.overflow)throw Error('Sandbox inventory unavailable');
    const removed=[];
    for(const name of listed.stdout.trim().split('\n').filter(Boolean).slice(0,32)){
      if(!/^lw-realm-[a-f0-9-]{36}$/.test(name)||!idle())continue;
      const detail=await runner('docker',['inspect',name,'--format','{{json .Mounts}}'],{timeoutMs:10000,maxBytes:8192});if(detail.code!==0)continue;
      let mounts;try{mounts=JSON.parse(detail.stdout);}catch{continue;}
      if(!Array.isArray(mounts)||!disposableMounts(mounts,dataDir)||!idle())continue;
      await runner('docker',['rm','--force',name],{timeoutMs:15000,maxBytes:4096});
      const deadline=Date.now()+30000;let absent=false;
      while(Date.now()<deadline){const checked=await runner('docker',['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'],{timeoutMs:10000,maxBytes:4096});if(checked.code===0&&!checked.timedOut&&!checked.stdout.trim()){absent=true;break;}await new Promise(done=>setTimeout(done,1000));}
      if(!absent)throw Error('Disposable realm teardown unconfirmed');removed.push(name);
    }
    return {passed:true,removed,boundary:'Only idle disposable tool/stage worlds; canonical saves and active jobs excluded'};
  };
}
