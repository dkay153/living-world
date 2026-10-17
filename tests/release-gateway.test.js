import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createReleaseGateway } from '../server/release-gateway.js';

async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(done=>server.close(done));return port;}
test('game origin excludes owner APIs and persists before acknowledging a world update',async()=>{
  const calls=[];let commitResolve,commits=0,art=null;
  const runtime={request:async(type,input)=>{calls.push({type,...input});return type==='http'?{status:200,contentType:'text/plain',body:Buffer.from('game').toString('base64')}:{opened:true};}};
  const gateway=createReleaseGateway({port:await freePort(),getRuntime:()=>runtime,getArt:()=>art,commit:async()=>{commits++;await new Promise(done=>commitResolve=done);},onFault:()=>assert.fail('Unexpected gateway fault')});
  let socket;
  try{
    await gateway.start();assert.equal((await fetch(gateway.origin+'/')).status,503);gateway.release();
    assert.equal((await fetch(gateway.origin+'/api/admin/session')).status,404);assert.equal((await fetch(gateway.origin+'/admin')).status,404);assert.equal(calls.length,0);
    const game=await fetch(gateway.origin+'/',{headers:{Cookie:'lw_owner=must-not-forward',Authorization:'Bearer private'}});assert.equal(await game.text(),'game');assert.deepEqual(calls[0],{type:'http',path:'/',method:'GET'});
    art={hash:'validated-data-revision'};assert.deepEqual(await(await fetch(gateway.origin+'/art.json')).json(),art);assert.equal(calls.length,1);
    const guest='c'.repeat(64);socket=new WebSocket(gateway.origin.replace('http','ws')+'/world',{origin:gateway.origin,headers:{Cookie:'lw_session='+guest+'; lw_owner=must-not-forward'}});await once(socket,'open');
    for(let i=0;i<30&&!calls.some(call=>call.type==='ws_open');i++)await new Promise(done=>setTimeout(done,10));
    const opened=calls.find(call=>call.type==='ws_open');assert.equal(opened.guest,guest);assert.ok(!JSON.stringify(calls).includes('must-not-forward'));
    let acknowledged=false;socket.on('message',()=>acknowledged=true);
    const pending=gateway.event(runtime,{id:opened.session,value:{type:'state',journey:{quest:'complete'}},checkpoint:'fixture-checkpoint'});
    await new Promise(done=>setTimeout(done,20));assert.equal(commits,1);assert.equal(acknowledged,false);commitResolve();await pending;await once(socket,'message');assert.equal(acknowledged,true);
    gateway.hold();assert.equal((await fetch(gateway.origin+'/')).status,503);
  }finally{socket?.terminate();await gateway.close();}
});
