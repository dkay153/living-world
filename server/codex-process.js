import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export const codexBinary=()=>process.env.LIVING_WORLD_CODEX_BIN||(process.platform==='win32'?'codex.exe':'codex');
export function classifyCodexError(value){
  const text=String(value).toLowerCase();
  if(/unexpected argument|invalid value|no prompt|requires.*argument|cannot.*image|failed to.*image/.test(text))return 'cli_input';
  if(/401|unauthorized|authentication|expired.*token|refresh.*token|sign in|not logged/.test(text))return 'account_auth';
  if(/429|rate limit|usage limit|quota/.test(text))return 'account_limit';
  if(/model.*not.*(available|supported|found)|unsupported.*model/.test(text))return 'model_unavailable';
  if(/unrecognized.*(field|key)|invalid.*config|parse.*config|permission profile/.test(text))return 'configuration';
  if(/sandbox|access is denied|permission denied/.test(text))return 'isolation';
  if(/stream disconnected|connection|network|timed out|request failed/.test(text))return 'provider_connection';
  return null;
}
export function codexEnvironment(home,temp=resolve(home,'tmp')) {
  // Never forward provider credentials, Node injection, or the owner's Codex settings.
  const names=['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','ProgramFiles','ProgramFiles(x86)','SystemDrive','LANG'];
  const env=Object.fromEntries(names.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  // Avoid Node's metadata traversal through denied parent directories in MXC.
  return {...env,CODEX_HOME:home,TEMP:temp,TMP:temp,NODE_OPTIONS:'--preserve-symlinks --preserve-symlinks-main'};
}
export function stopProcess(child) {
  if(!child?.pid||child.exitCode!==null)return Promise.resolve();
  if(process.platform!=='win32'){child.kill('SIGKILL');return Promise.resolve();}
  return new Promise(resolveStop=>{
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    let done=false;const finish=code=>{if(done)return;done=true;clearTimeout(timer);if(code!==0&&child.exitCode===null)child.kill('SIGKILL');resolveStop();};
    const timer=setTimeout(()=>{killer.kill();finish(1);},3000);
    killer.once('error',()=>finish(1));killer.once('exit',finish);
  });
}
export async function prepareCodexHome(home) {
  await mkdir(resolve(home,'tmp'),{recursive:true});
  // This is the project's own home. Never modify the desktop app's account/configuration.
  const config=`project_root_markers = ["AGENTS.md"]\nforced_login_method = "chatgpt"\nmodel_provider = "openai"\napproval_policy = "never"\ndefault_permissions = "living-world"\ncli_auth_credentials_store = "file"\n[windows]\nsandbox = "mxc"\n[permissions.living-world]\nextends = ":workspace"\n[permissions.living-world.filesystem]\n":root" = "deny"\n":minimal" = "read"\n${JSON.stringify(process.execPath)} = "read"\n[permissions.living-world.filesystem.":workspace_roots"]\n"." = "write"\n[permissions.living-world.network]\nenabled = false\n`;
  await writeFile(resolve(home,'config.toml'),config,{mode:0o600});
}

export function runProcess(binary,args,{cwd,env,timeoutMs=30000,signal,maxBytes=2*1024*1024,onLine,input='',spawnProcess=spawn}={}) {
  return new Promise((resolveRun,reject)=>{
    if(signal?.aborted){reject(new Error('Operation cancelled'));return;}
    const child=spawnProcess(binary,args,{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    let stdout='',line='',bytes=0,timedOut=false,cancelled=false,overflow=false,diagnostic=null;const decoder=new StringDecoder('utf8');
    const emit=value=>{try{onLine?.(value);}catch{overflow=true;void stopProcess(child);}};
    const stop=()=>{cancelled=true;void stopProcess(child);};signal?.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>{timedOut=true;void stopProcess(child);},timeoutMs);timer.unref?.();
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){overflow=true;void stopProcess(child);return;}const decoded=decoder.write(chunk);stdout+=decoded;if(onLine){line+=decoded;let i;while((i=line.indexOf('\n'))>=0){emit(line.slice(0,i));line=line.slice(i+1);}}});
    // Raw CLI logs may contain account material. Do not expose or persist them.
    child.stderr.on('data',chunk=>{diagnostic=classifyCodexError(chunk.toString('utf8'))||diagnostic;});
    child.once('error',()=>{cleanup();reject(new Error('Codex executable unavailable'));});
    child.once('close',code=>{cleanup();const end=decoder.end();stdout+=end;line+=end;if(line&&onLine)emit(line);resolveRun({code,stdout,timedOut,cancelled,overflow,diagnostic});});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

export function createRpc({home,cwd,binary=codexBinary(),spawnProcess=spawn,onNotification=()=>{}}) {
  let child=null,ready=null,sequence=0,buffer='',pending=new Map(),generation=0;
  function rejectAll(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex connection closed'));}pending.clear();}
  function send(value){if(!child?.stdin.writable)throw new Error('Codex connection unavailable');child.stdin.write(JSON.stringify(value)+'\n');}
  function raw(method,params={},timeout=15000){return new Promise((accept,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Codex request timed out'));},timeout);pending.set(id,{accept,reject,timer});try{send({id,method,params});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
  async function start(){
    if(ready)return ready;
    const current=++generation;
    ready=(async()=>{
      await prepareCodexHome(home);buffer='';
      child=spawnProcess(binary,['app-server','--strict-config','--listen','stdio://'],{cwd,env:codexEnvironment(home),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      const processChild=child;
      const decoder=new StringDecoder('utf8');child.stdin.on('error',()=>rejectAll());
      child.stderr.on('data',()=>{});
      child.stdout.on('data',chunk=>{
        if(current!==generation)return;buffer+=decoder.write(chunk);if(buffer.length>2*1024*1024){void close();return;}
        let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let value;try{value=JSON.parse(line);}catch{continue;}
          if(value.id!==undefined&&pending.has(value.id)){const p=pending.get(value.id);pending.delete(value.id);clearTimeout(p.timer);if(value.error)p.reject(new Error('Codex rejected '+methodLabel(value.error.code)));else p.accept(value.result);}
          else if(value.id!==undefined&&value.method){send({id:value.id,error:{code:-32601,message:'Host method unavailable'}});}
          else if(value.method)onNotification(value.method,value.params||{});
        }
      });
      const closed=()=>{if(processChild===child){rejectAll();child=null;ready=null;}};
      child.once('error',closed);child.once('close',closed);
      await raw('initialize',{clientInfo:{name:'living_world_observatory',title:'Living World Observatory',version:'0.4.0'},capabilities:{experimentalApi:false}});send({method:'initialized',params:{}});
    })().catch(async e=>{if(current===generation)await close();throw e;});return ready;
  }
  const methodLabel=code=>`request (${Number.isInteger(code)?code:'unknown'})`;
  async function request(method,params={}){await start();return raw(method,params);}
  async function close(){generation++;const old=child;child=null;ready=null;rejectAll();await stopProcess(old);}
  return {request,close};
}
