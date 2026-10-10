import { fork } from 'node:child_process';
import { stopProcess } from './codex-process.js';
export function runOwnedProcess(binary,args,{onLine,signal,...options}) {
  return new Promise((accept,reject)=>{
    if(signal?.aborted){reject(new Error('Operation cancelled'));return;}
    const child=fork(new URL('./developer-runner.js',import.meta.url),[],{env:options.env,execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)reject(error);else accept(result);};
    const cancel=()=>{if(child.connected)child.send({type:'cancel'});};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(async()=>{await stopProcess(child);finish(new Error('Developer watchdog timeout'));},(options.timeoutMs||30000)+10000);timer.unref?.();
    child.on('message',message=>{if(message.type==='line')onLine?.(message.line);if(message.type==='result')finish(null,message.result);if(message.type==='failure')finish(new Error('Developer process failed'));});
    child.once('error',()=>finish(new Error('Developer watchdog unavailable')));child.once('exit',()=>{if(!settled)finish(new Error('Developer process interrupted'));});
    child.send({type:'run',binary,args,options});
  });
}
