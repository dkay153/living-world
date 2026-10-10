import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { openStore } from './store.js';
import { WIDTH, HEIGHT, objects, tile, destination } from './world.js';
import { createGame } from './game.js';
import { createSteward } from './steward.js';
import { personalJournal } from './memory.js';
import { createAdmin } from './admin.js';
import { SCHEMA_VERSION } from './migrations.js';
const host=process.env.HOST || '127.0.0.1', port=Number(process.env.PORT || 3000);
const dataDir=resolve(process.env.DATA_DIR || 'data');
const store=openStore(resolve(dataDir,'world.sqlite'));
const game=createGame(store);
const steward=createSteward(store);
const sessions=new Map(), peers=new Map();
const admin=createAdmin({store,steward,dataDir,backupDir:resolve(process.env.BACKUP_DIR||'backups'),online:()=>peers.size});
const publicFiles={'/':['index.html','text/html'], '/style.css':['style.css','text/css'], '/seed.js':['seed.js','text/javascript']};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if(await admin.handle(req,res))return;
  if(req.url==='/healthz') { res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:store.db.prepare('SELECT 1').get()!=null,version:'0.4.0',schemaVersion:SCHEMA_VERSION,memoryWorker:steward.status().paused?'paused':'enabled',modelCallsEnabled:false})); }
  const file=publicFiles[req.url];
  if(!file || req.method!=='GET'){res.writeHead(404);return res.end('Not found');}
  try { const data=await readFile(new URL('../public/'+file[0],import.meta.url)); res.writeHead(200,{'Content-Type':file[1]});res.end(data); }
  catch {res.writeHead(500);res.end('Unavailable');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:1024});
server.on('upgrade',(req,socket,head)=>{
  const expected=process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
  if(req.url!=='/world' || req.headers.origin!==expected) return socket.destroy();
  const cookie=req.headers.cookie?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const id=cookie || randomBytes(32).toString('hex');
  req.playerId=id; req.isNew=!cookie;
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
// The opaque cookie is the local guest identity; public account authentication is a later gate.
wss.on('headers',(headers,req)=>{ if(req.isNew) headers.push(`Set-Cookie: lw_session=${req.playerId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${process.env.COOKIE_SECURE==='1'?'; Secure':''}`); });
function send(ws,value){if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(value));}
function broadcast(){const players=[...peers.values()].map(p=>({id:p.id.slice(0,8),x:p.x,y:p.y}));const creatures=game.snapshot(); for(const [ws,p] of peers)send(ws,{type:'state',players,creatures,history:store.history(),journey:store.loadGame(p.id),discoveries:store.discoveries(p.id),journal:personalJournal(store,p.id)});}
wss.on('connection',(ws,req)=>{
  const id=req.playerId;
  if(sessions.has(id)) sessions.get(id).close(4000,'Opened in another tab');
  sessions.set(id,ws); const player=store.player(id); peers.set(ws,player);
  send(ws,{type:'welcome',id:id.slice(0,8),width:WIDTH,height:HEIGHT,tiles:Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>tile(x,y))),objects,discoveries:store.discoveries(id)});
  broadcast(); let last=0;
  ws.on('message',raw=>{
    if(sessions.get(id)!==ws)return;
    const now=Date.now(); if(now-last<140)return; last=now;
    try {
      const message=JSON.parse(raw.toString());
      if(!message||typeof message!=='object'||Array.isArray(message))return;
      if(message.type==='move'&&game.move(player,message.direction))broadcast();
      if(['interact','attack','heal','guard','retreat'].includes(message.type)) {
        const result=game.act(player,message);send(ws,{type:'notice',text:result.text,dialogue:result.dialogue});broadcast();
      }
    } catch(e) { if(e instanceof SyntaxError)send(ws,{type:'notice',text:'Invalid action.'});else console.error('action_failed',e.message); }
  });
  ws.on('error',e=>console.error('socket_error',e.message));
  ws.on('close',()=>{peers.delete(ws);if(sessions.get(id)===ws)sessions.delete(id);broadcast();});
});
server.listen(port,host,()=>console.log(`Living World running at http://${host}:${server.address().port}`));
const heartbeat=setInterval(()=>{if(peers.size)broadcast();},2000);
function runMemory(){try{steward.tick();}catch(e){console.error('memory_worker_failed',e.message);}}
runMemory();const memoryWorker=setInterval(runMemory,2000);
function runDeveloper(){admin.developer.tick().catch(()=>console.error('developer_worker_failed'));}
const developerWorker=setInterval(runDeveloper,2000);
async function stop(){clearInterval(heartbeat);clearInterval(memoryWorker);clearInterval(developerWorker);await admin.developer.close();for(const ws of peers.keys())ws.close(1001,'Server stopping');wss.close();server.close(()=>{store.db.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
