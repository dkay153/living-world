import { runProcess } from './codex-process.js';
import {runCodexHarness} from './codex-harness.js';
const abort=new AbortController();let started=false;
// IPC disappears when the game server dies. The watchdog kills its owned CLI tree.
process.once('disconnect',()=>abort.abort());
process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
const deliver=message=>new Promise(accept=>{
  if(!process.connected){accept();return;}
  process.send(message,()=>accept());
});
process.on('message',async message=>{
  if(message.type==='cancel'){abort.abort();return;}
  if(message.type!=='run'||started)return;started=true;
  try{
    const run=message.args[0]==='exec'?runCodexHarness:runProcess;
    const result=await run(message.binary,message.args,{...message.options,signal:abort.signal,onLine:line=>{if(process.connected)process.send({type:'line',line});}});
    await deliver({type:'result',result});
  }catch{await deliver({type:'failure'});}
  finally{if(process.connected)process.disconnect();}
});
