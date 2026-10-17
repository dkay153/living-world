import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {proxyFailure} from '../server/launcher-proxy.js';

test('renderer disconnects before and after response headers do not terminate the launcher',async()=>{
 const server=http.createServer((req,res)=>{
   if(req.url==='/before')return proxyFailure(res);
   if(req.url==='/during'){res.writeHead(200);res.write('partial');setImmediate(()=>proxyFailure(res));return;}
   res.end('launcher still healthy');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
   const before=await fetch(base+'/before');assert.equal(before.status,502);assert.match(await before.text(),/Reload shortly/);
   await assert.rejects(async()=>{const during=await fetch(base+'/during');await during.text();});
   assert.equal(await(await fetch(base+'/health')).text(),'launcher still healthy');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
