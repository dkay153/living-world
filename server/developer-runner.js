import { runProcess } from './codex-process.js';
const abort=new AbortController();let started=false;
// IPC disappears when the game server dies. The watchdog kills its owned CLI tree.
process.once('disconnect',()=>abort.abort());
process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
process.on('message',async message=>{
  if(message.type==='cancel'){abort.abort();return;}
  if(message.type!=='run'||started)return;started=true;
  try{
    const result=await runProcess(message.binary,message.args,{...message.options,signal:abort.signal,onLine:line=>{if(process.connected)process.send({type:'line',line});}});
    if(process.connected)process.send({type:'result',result});
  }catch{if(process.connected)process.send({type:'failure'});}
  finally{process.disconnect?.();}
});
