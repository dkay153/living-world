import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

// Separate game origin. No owner/account routes, credential forwarding or proxy
// destination supplied by the candidate. Containers have no host networking.
export function createReleaseGateway({port=3200,getRuntime,commit,onFault,getArt=()=>null,embedOrigin=null}){
  if(embedOrigin&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(embedOrigin))throw Error('Preview embedding requires a fixed local origin');
  let held=true;const sockets=new Map(),origin=`http://127.0.0.1:${port}`;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'${embedOrigin?' '+embedOrigin:''}`);
    const path=new URL(req.url,origin).pathname;
    if(path.startsWith('/api/')||path.startsWith('/admin')||req.method!=='GET'){res.writeHead(404);return res.end();}
    const runtime=getRuntime();if(held||!runtime){res.writeHead(503);return res.end('The world is preserving progress during recovery.');}
    if(path==='/art.json'){const art=getArt();if(art){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(art));}}
    try{
      const response=await runtime.request('http',{path,method:'GET'});
      if(!Number.isInteger(response.status)||response.status<100||response.status>599||typeof response.body!=='string'||response.body.length>6*1024*1024)throw new Error('Invalid realm HTTP response');
      res.writeHead(response.status,{'Content-Type':String(response.contentType||'application/octet-stream').slice(0,100)});res.end(Buffer.from(response.body,'base64'));
    }catch{res.writeHead(503);res.end('World recovery in progress.');onFault(runtime);}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:1024});
  server.on('upgrade',(req,socket,head)=>{
    if(held||req.url!=='/world'||req.headers.origin!==origin)return socket.destroy();
    req.realmGuest=req.headers.cookie?.match(/(?:^|;\s*)lw_realm=([a-f0-9]{64})(?:;|$)/)?.[1]||req.headers.cookie?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1]||randomBytes(32).toString('hex');
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('headers',(headers,req)=>headers.push(`Set-Cookie: lw_realm=${req.realmGuest}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`));
  wss.on('connection',(socket,req)=>{
    const id=randomUUID(),runtime=getRuntime();sockets.set(id,{socket,runtime});
    void runtime.request('ws_open',{session:id,guest:req.realmGuest}).catch(()=>onFault(runtime));
    socket.on('message',raw=>{if(!held&&getRuntime()===runtime)void runtime.request('ws_send',{session:id,payload:raw.toString()}).catch(()=>onFault(runtime));});
    socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(id);void runtime.request('ws_close',{session:id}).catch(()=>{});});
  });
  async function event(runtime,message){
    // commit() is serialized by the lane and fsyncs a protected checkpoint before
    // exposing authoritative replies. A stale runtime cannot acknowledge state.
    if(getRuntime()!==runtime)return;
    try{await commit(runtime,message.checkpoint);if(held||getRuntime()!==runtime)return;
      const target=sockets.get(message.id);if(target?.runtime===runtime&&target.socket.readyState===1){if(message.value?.type==='closed')target.socket.close();else target.socket.send(JSON.stringify(message.value));}
    }catch{onFault(runtime);}
  }
  function hold(){held=true;for(const entry of sockets.values())entry.socket.close(1012,'World release or recovery; reconnect shortly');}
  return {origin,event,hold,release:()=>{held=false;},start:()=>new Promise((a,b)=>{server.once('error',b);server.listen(port,'127.0.0.1',a);}),close:async()=>{hold();for(const entry of sockets.values())entry.socket.terminate();wss.close();await new Promise(done=>server.close(done));}};
}
