import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { runProcess,stopProcess } from './codex-process.js';

export const runtimeArguments=({name,image,source,world,mode='serve',seccomp=resolve('runtime/seccomp_profile.json'),controllerSource,toolVolume,developmentWorkspace})=>[
  'run','--rm','--interactive','--name',name,'--network','none','--read-only',
  '--cap-drop','ALL','--cap-add','SETUID','--cap-add','SETGID','--cap-add','CHOWN',
  '--security-opt','no-new-privileges','--security-opt',`seccomp=${seccomp}`,'--pids-limit','256','--memory','4g','--cpus','2',
  '--tmpfs','/work:rw,nosuid,nodev,size=1g,mode=0755','--tmpfs','/tmp:rw,nosuid,nodev,size=512m,mode=1777',
  ...(developmentWorkspace?['--tmpfs','/dev-work:rw,nosuid,nodev,size=1g,mode=1777']:[]),
  '--shm-size','256m','--mount',`type=bind,source=${resolve(source)},target=/input,readonly`,
  '--mount',`type=bind,source=${resolve(world)},target=/seed,readonly`,
  ...(toolVolume?['--mount',`type=volume,source=${toolVolume},target=/devtools,readonly`]:[]),
  ...(controllerSource?['--mount',`type=bind,source=${resolve(controllerSource)},target=/kernel,readonly`]:[]),
  '--env','NODE_ENV=production',image,'node',controllerSource?'/kernel/controller.mjs':'/opt/lw-tools/controller.mjs',mode
];

export function createDockerRuntime({image,toolsHash,dependenciesHash,seccomp=resolve('runtime/seccomp_profile.json'),controllerSource,toolVolume,developmentWorkspace=false,binary='docker',runner=runProcess,spawnProcess=spawn}={}){
  if(toolVolume&&!/^lw-devtools-[a-f0-9-]{36}$/.test(toolVolume))throw Error('Invalid private development tool volume');
  let pinned=null;
  async function verify(){
    if(!/^sha256:[a-f0-9]{64}$/.test(image||''))return {ready:false,reason:'Configure the exact locally built runtime image SHA-256; tags cannot authorize releases'};
    try{
      const result=await runner(binary,['image','inspect',image,'--format','{{.Id}} {{.Os}} {{index .Config.Labels "io.living-world.tools-hash"}} {{index .Config.Labels "io.living-world.dependencies-hash"}}'],{timeoutMs:10000,maxBytes:4096});
      if(!/^[a-f0-9]{64}$/.test(toolsHash||'')||!/^[a-f0-9]{64}$/.test(dependenciesHash||'')||result.code!==0||result.stdout.trim()!==image+' linux '+toolsHash+' '+dependenciesHash)throw new Error();
      pinned=image;return {ready:true,kind:'docker_linux',image,reason:'Pinned Linux runtime is available; every launch enforces network and mount confinement'};
    }catch{return {ready:false,reason:'Docker Linux runtime is unavailable or the pinned image is missing'};}
  }
  async function launch({source,world,mode='serve',signal}){
    if(signal?.aborted)throw new Error('Contained runtime cancelled before launch');
    if(!pinned||!(await verify()).ready)throw new Error('Verified runtime required');
    const name='lw-realm-'+randomUUID(),events=new EventEmitter(),pending=new Map();let buffer='',closed=false,sequence=0,stopping=null,removed=false;
    if([source,world,...(controllerSource?[controllerSource]:[])].some(path=>path.includes(',')))throw new Error('Mount paths cannot contain commas');
    const child=spawnProcess(binary,runtimeArguments({name,image:pinned,source,world,mode,seccomp,controllerSource,toolVolume,developmentWorkspace}),{windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false});
    let readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
    // Stage preparation includes a separately bounded 120s build AND 120s test
    // run, then freezing/copying source and checking service health. The host
    // must allow those fixed budgets to finish; this does not extend either
    // check, retry execution, or change any account/model limit.
    const preparationMs=mode==='stage'?300000:180000;
    const timeout=setTimeout(()=>readyReject(new Error('Contained runtime preparation timed out')),preparationMs);
    const rejectAll=error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();readyReject(error);};
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString();if(Buffer.byteLength(buffer)>70*1024*1024){rejectAll(new Error('Runtime protocol limit'));stopSafely();return;}
      let at;while((at=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let message;
        try{message=JSON.parse(line);}catch{rejectAll(new Error('Invalid runtime protocol'));stopSafely();return;}
        if(message.type==='ready'){clearTimeout(timeout);readyResolve(message);}
        else if(message.type==='fatal'){const error=new Error(String(message.error||'Runtime failed').slice(0,300));error.diagnostic=String(message.diagnostic||'').slice(-6000);rejectAll(error);events.emit('fault',message);}
        else if(message.type==='result'&&pending.has(message.id)){const entry=pending.get(message.id);pending.delete(message.id);clearTimeout(entry.timer);if(message.error){const error=new Error(String(message.error).slice(0,300));error.diagnostic=String(message.diagnostic||'').slice(-6000);entry.reject(error);}else entry.resolve(message.value);}
        else if(message.type==='event')events.emit('event',message);
      }
    });
    child.stdin.on('error',()=>{});
    child.once('error',()=>{clearTimeout(timeout);rejectAll(new Error('Container process unavailable'));});
    child.once('exit',()=>{closed=true;clearTimeout(timeout);rejectAll(new Error('Contained runtime exited'));events.emit('fault',{error:'Contained runtime exited'});});
    function request(type,input={}){
      if(closed)return Promise.reject(new Error('Runtime stopped'));const id=++sequence;
      return new Promise((resolveRequest,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Runtime request timed out'));},120000);pending.set(id,{resolve:resolveRequest,reject,timer});child.stdin.write(JSON.stringify({id,type,...input})+'\n');});
    }
    async function stop(){
      if(removed&&closed)return;if(stopping)return stopping;
      stopping=(async()=>{
        signal?.removeEventListener('abort',onAbort);
        // Confirm the owned container is absent independently of CLI exit lag.
        await runner(binary,['rm','--force',name],{timeoutMs:15000,maxBytes:4096}).catch(()=>{});
        const observations=[],deadline=Date.now()+30000;let failures=0;
        while(Date.now()<deadline){
          const checked=await runner(binary,['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'],{timeoutMs:15000,maxBytes:4096});
          observations.push({code:checked.code,timedOut:!!checked.timedOut,overflow:!!checked.overflow,diagnostic:checked.diagnostic||null,names:checked.stdout.trim().slice(0,256)});
          if(checked.code===0&&!checked.timedOut&&!checked.overflow&&!checked.stdout.trim()){removed=true;break;}
          // Auto-remove may retain a name while teardown finishes. An actual
          // API failure stays fail-closed; healthy teardown gets bounded time.
          if(checked.code!==0||checked.timedOut||checked.overflow){if(++failures>=3)break;}else failures=0;
          await new Promise(done=>setTimeout(done,1000));
        }
        if(!removed){const error=new Error('Cannot confirm container shutdown');error.diagnostic=JSON.stringify(observations.slice(-8));throw error;}child.stdin.end();
        // Only terminate our CLI client after Docker confirms its realm is gone.
        if(!closed)await stopProcess(child);
        if(!closed)await new Promise(done=>{const timer=setTimeout(done,3000);child.once('exit',()=>{clearTimeout(timer);done();});});
        if(!closed)throw new Error('Container removed but CLI cleanup is unconfirmed');
      })();
      try{return await stopping;}catch(error){stopping=null;throw error;}
    }
    function stopSafely(){void stop().catch(error=>{rejectAll(error);events.emit('fault',{error:error.message});});}
    const onAbort=stopSafely;signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)onAbort();
    try{const receipt=await ready;return {request,stop,events,receipt,name,image:pinned};}catch(error){await stop();throw error;}
  }
  return {verify,launch};
}
