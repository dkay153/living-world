// This fixed entry runs as the game UID inside the contained runtime. It has no
// owner APIs, account broker, provider settings, jobs or release authority.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire('/opt/lw-deps/package.json');
const {WebSocketServer}=require('ws');
const {openStore}=await import('file:///work/realm/server/store.js');
const {createGame}=await import('file:///work/realm/server/game.js');
const world=await import('file:///work/realm/server/world.js');
const {personalJournal}=await import('file:///work/realm/server/memory.js');
const {createSteward}=await import('file:///work/realm/server/steward.js');
const store=openStore('/work/world/world.sqlite'),game=createGame(store),peers=new Map(),sessions=new Map();
const steward=createSteward(store);const maintenance=setInterval(()=>{try{if(JSON.parse(readFileSync('/work/control/memory-paused.json','utf8'))===false)steward.tick();}catch{}},2000);
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'");
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  const path=new URL(req.url,'http://realm').pathname;
  if(path.startsWith('/api/')||path==='/admin'||req.method!=='GET'){res.writeHead(404);return res.end();}
  if(path==='/healthz'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:store.db.prepare('SELECT 1').get()!=null,modelCallsEnabled:false}));}
  const legacy=path==='/legacy/'||['/seed.js','/style.css','/art.json'].includes(path);
  const root=legacy?'/work/realm/public':'/work/realm/ui/out';
  const target=resolve(root,'.'+(path==='/legacy/'||path==='/'?'/index.html':path));
  if(!target.startsWith(root+'/')){res.writeHead(404);return res.end();}
  try{const data=await readFile(target);const extension=target.slice(target.lastIndexOf('.'));res.setHeader('Content-Type',types[extension]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}
});
const wss=new WebSocketServer({noServer:true,maxPayload:1024});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/world'||req.headers.origin!=='http://127.0.0.1:3000')return socket.destroy();
  req.playerId=req.headers.cookie?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1]||randomBytes(32).toString('hex');
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
function broadcast(){
  const players=[...peers.values()].map(player=>({id:player.id.slice(0,8),x:player.x,y:player.y}));
  for(const [ws,p] of peers)if(ws.readyState===1)ws.send(JSON.stringify({type:'state',players,creatures:game.snapshot(),history:store.history(),journey:store.loadGame(p.id),discoveries:store.discoveries(p.id),journal:personalJournal(store,p.id)}));
}
wss.on('connection',(ws,req)=>{
  const id=req.playerId;sessions.get(id)?.close(4000,'Opened in another tab');sessions.set(id,ws);const player=store.player(id);peers.set(ws,player);
  ws.send(JSON.stringify({type:'welcome',id:id.slice(0,8),width:world.WIDTH,height:world.HEIGHT,tiles:Array.from({length:world.HEIGHT},(_,y)=>Array.from({length:world.WIDTH},(_,x)=>world.tile(x,y))),objects:world.objects,discoveries:store.discoveries(id)}));broadcast();
  let last=0;ws.on('message',raw=>{
    if(sessions.get(id)!==ws||Date.now()-last<140)return;last=Date.now();
    try{const message=JSON.parse(raw);if(!message||typeof message!=='object')return;
      if(message.type==='move'&&game.move(player,message.direction))broadcast();
      if(message.type!=='move'&&typeof message.type==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(message.type)){const result=game.act(player,message);ws.send(JSON.stringify({type:'notice',text:result.text,dialogue:result.dialogue}));broadcast();}
    }catch{ws.send(JSON.stringify({type:'notice',text:'Action rejected.'}));}
  });ws.on('error',()=>{});ws.on('close',()=>{peers.delete(ws);if(sessions.get(id)===ws)sessions.delete(id);broadcast();});
});
server.listen(3000,'127.0.0.1');
process.on('SIGTERM',()=>{clearInterval(maintenance);for(const ws of peers.keys())ws.terminate();wss.close();server.close(()=>{store.db.close();process.exit(0);});});
