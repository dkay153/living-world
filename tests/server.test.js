import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
test('real server validates origin, persists identity, and shares player positions',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'lw-server-'));
  let child;const sockets=[];
  async function launch(){child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});const [chunk]=await once(child.stdout,'data');return chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];}
  async function stop(){const done=once(child,'exit');child.kill();await done;}
  async function connect(base,cookie){const ws=new WebSocket(base.replace('http','ws')+'/world',{origin:base,headers:cookie?{Cookie:cookie}:{}});sockets.push(ws);const messages=[];let identity;ws.on('upgrade',r=>identity=r.headers['set-cookie']?.[0].split(';')[0]);ws.on('message',raw=>messages.push(JSON.parse(raw)));await once(ws,'open');await wait(()=>messages.some(m=>m.type==='welcome'));return {ws,messages,cookie:identity||cookie};}
  async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timed out');}
  try{
    let base=await launch();assert.ok(base);assert.equal((await (await fetch(base+'/healthz')).json()).ok,true);const shell=await fetch(base+'/?studio=1');assert.equal(shell.status,200);assert.match(await shell.text(),/legacy-world/);const embedded=await fetch(base+'/legacy/?studio=1');assert.equal(embedded.status,200);assert.match(await embedded.text(),/id="world"/);
    const blocked=new WebSocket(base.replace('http','ws')+'/world',{origin:'http://untrusted.invalid'});blocked.on('error',()=>{});await new Promise(r=>blocked.on('close',r));
    const a=await connect(base),b=await connect(base);await wait(()=>a.messages.some(m=>m.type==='state'&&m.players.length===2));
    const welcome=a.messages.find(m=>m.type==='welcome');
    a.ws.send(JSON.stringify({type:'move',direction:'teleport',x:23,y:5}));
    // TCP ordering makes pong a server-side processing barrier; client-side
    // sleep alone can queue both messages together on a busy Windows host.
    const processed=once(a.ws,'pong');a.ws.ping();await processed;await new Promise(r=>setTimeout(r,150));
    a.ws.send(JSON.stringify({type:'move',direction:'up'}));await wait(()=>a.messages.some(m=>m.type==='state'&&m.players.find(p=>p.id===welcome.id)?.y===11));
    await new Promise(r=>setTimeout(r,150));a.ws.send(JSON.stringify({type:'move',direction:'left'}));await wait(()=>a.messages.some(m=>m.type==='state'&&m.players.find(p=>p.id===welcome.id)?.x===8));
    await new Promise(r=>setTimeout(r,150));a.ws.send(JSON.stringify({type:'interact'}));await wait(()=>a.messages.some(m=>m.type==='state'&&m.discoveries.includes('well')));
    await wait(()=>b.messages.some(m=>m.type==='state'&&m.journal));assert.ok(a.messages.some(m=>m.type==='state'&&m.journal.entries.some(e=>e.subject==='well')));assert.ok(!b.messages.some(m=>m.type==='state'&&m.journal.entries.some(e=>e.subject==='well')));
    assert.ok(!JSON.stringify(b.messages).includes(a.cookie.split('=')[1]));
    a.ws.close();b.ws.close();await stop();base=await launch();const restored=await connect(base,a.cookie);const rewelcome=restored.messages.find(m=>m.type==='welcome');assert.equal(rewelcome.id,welcome.id);assert.deepEqual(rewelcome.discoveries,['well']);await wait(()=>restored.messages.some(m=>m.type==='state'&&m.players[0].y===11));
  }finally{for(const ws of sockets)ws.terminate();if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
