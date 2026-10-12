import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldLab } from '../server/world-lab.js';

test('the current-source World Lab uses fresh data and never exposes a production database',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lw-world-lab-'));let options;
  try{
    const lab=createWorldLab({dataDir:join(root,'data'),projectDir:process.cwd(),clock:()=>1000,portFactory:async()=>43210,fetcher:async()=>({ok:true}),spawnProcess:(binary,args,input)=>{options=input;const child=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('exit',0));return true;};return child;}});
    const running=await lab.start();assert.equal(running.state,'running');assert.equal(running.url,'http://127.0.0.1:43210');assert.match(options.env.DATA_DIR,/studio-lab/);assert.notEqual(options.env.DATA_DIR,join(root,'data'));
    const stopped=await lab.stop({removeData:true});assert.equal(stopped.state,'stopped');
  }finally{await rm(root,{recursive:true,force:true});}
});
