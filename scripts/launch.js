// Trusted checkout convenience launcher. Never use this to execute saved candidates.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir,open as openFile,readFile,unlink } from 'node:fs/promises';
import { existsSync,unlinkSync } from 'node:fs';
import { runProcess,stopProcess } from '../server/codex-process.js';
import {createServiceSupervisor} from '../server/service-supervisor.js';
import { proxyFailure } from '../server/launcher-proxy.js';
const backend='http://127.0.0.1:3100', renderer='http://127.0.0.1:3101', origin='http://127.0.0.1:3105';
const children=[];
const openBrowser=!process.argv.includes('--no-open');
async function ready(url){try{return (await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
function run(args){const child=spawn(process.execPath,args,{cwd:resolve('.'),windowsHide:true,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',LW_DEV_RENDERER:'1'}});children.push(child);child.on('error',error=>{console.error(error.message);process.exitCode=1;});return child;}
const supervisor=createServiceSupervisor({spawnService:run,stopService:stopProcess,onEvent:event=>console.log(JSON.stringify({launcher:event}))});
function open(){if(openBrowser&&process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',origin+'/admin'],{windowsHide:true,stdio:'ignore'});console.log(`Admin / live renderer: ${origin}/admin\nGame: ${backend}/\nKeep this window open. Ctrl+C stops services started here.`);}
let existing;try{existing=await (await fetch(origin+'/launcher-health',{signal:AbortSignal.timeout(1000)})).text();}catch{}
if(existing==='living-world-development-launcher'){open();}else{
  const lockPath=resolve('outputs/desktop-launcher.lock');await mkdir(resolve('outputs'),{recursive:true});
  let lock;
  try{lock=await openFile(lockPath,'wx');}catch(error){
    if(error.code!=='EEXIST')throw error;
    let alive=false;try{const pid=Number(await readFile(lockPath,'utf8'));if(Number.isInteger(pid)&&pid>0){process.kill(pid,0);alive=true;}}catch{}
    if(alive){console.log('Living World is already starting. Waiting for the existing launcher…');const deadline=Date.now()+300000;while(Date.now()<deadline){if(await ready(origin+'/launcher-health')){open();process.exit(0);}await new Promise(done=>setTimeout(done,500));}throw Error('The existing launcher did not become ready. Check its startup window.');}
    await unlink(lockPath);lock=await openFile(lockPath,'wx');
  }
  await lock.writeFile(String(process.pid));await lock.close();process.once('exit',()=>{try{unlinkSync(lockPath);}catch{}});
  const dockerBin=resolve(process.env.ProgramFiles||'C:/Program Files','Docker/Docker/resources/bin');
  if(existsSync(dockerBin))process.env.PATH=dockerBin+';'+process.env.PATH;
  const desktop=resolve(process.env.ProgramFiles||'C:/Program Files','Docker/Docker/Docker Desktop.exe');
  if(process.platform==='win32'&&existsSync(desktop)){
    const available=async()=>{try{return(await runProcess(resolve(dockerBin,'docker.exe'),['info','--format','{{.ServerVersion}}'],{timeoutMs:5000})).code===0;}catch{return false;}};
    if(!await available()){
      console.log('Starting Docker Desktop for the contained game and release runtime…');
      await runProcess('powershell.exe',['-NoProfile','-Command',"Start-Process -FilePath (Join-Path $env:ProgramFiles 'Docker\\Docker\\Docker Desktop.exe') -WindowStyle Hidden"],{timeoutMs:15000});
      const deadline=Date.now()+120000;while(!await available()){if(Date.now()>deadline)throw Error('Docker did not become ready. Open Docker Desktop and retry this launcher.');await new Promise(done=>setTimeout(done,1000));}
    }
  }
  if(!await ready(backend+'/healthz'))supervisor.start('owner',['scripts/site-preview.js']);
  if(!await ready(renderer+'/admin'))supervisor.start('renderer',['node_modules/next/dist/bin/next','dev','ui','--webpack','--hostname','127.0.0.1','--port','3101']);
  const deadline=Date.now()+300000;
  try{while(!await ready(backend+'/healthz')||!await ready(renderer+'/admin')){if(Date.now()>deadline)throw new Error('Startup failed; inspect service output above.');await new Promise(done=>setTimeout(done,500));}}
  catch(error){await supervisor.close();throw error;}
  const healthTimer=setInterval(()=>{void supervisor.checkHealth('owner',()=>ready(backend+'/healthz'));void supervisor.checkHealth('renderer',()=>ready(renderer+'/admin'));},15000);healthTimer.unref();
  function target(req){const path=new URL(req.url,origin);return path.pathname==='/admin'&&path.searchParams.get('preview-entry')!=='1'?backend:path.pathname.startsWith('/api/')||path.pathname==='/healthz'||path.pathname==='/art.json'?backend:renderer;}
  function headers(req,destination){return {...req.headers,host:new URL(destination).host,...(req.headers.origin?{origin:destination}:{})};}
  function permitted(req){return req.headers.host==='127.0.0.1:3105'&&(!req.headers.origin||req.headers.origin===origin)&&req.headers['sec-fetch-site']!=='cross-site';}
  const proxy=http.createServer((req,res)=>{
    if(!permitted(req)){res.writeHead(403);return res.end('Local launcher origin required');}
    if(req.url==='/launcher-health')return res.end('living-world-development-launcher');
    if(req.url==='/'){res.writeHead(302,{Location:backend+'/'});return res.end();}
    const destination=target(req),upstream=http.request(new URL(req.url,destination),{method:req.method,headers:headers(req,destination)},reply=>{const outgoing={...reply.headers};if(outgoing.location?.startsWith(backend))outgoing.location=outgoing.location.replace(backend,origin);res.writeHead(reply.statusCode,outgoing);reply.on('error',()=>proxyFailure(res));reply.pipe(res);});
    upstream.on('error',()=>proxyFailure(res));res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);
  });
  proxy.on('upgrade',(req,socket,head)=>{
    if(!permitted(req)||!req.url.startsWith('/_next/'))return socket.destroy();
    const upstream=http.request(new URL(req.url,renderer),{headers:headers(req,renderer)});
    upstream.on('upgrade',(reply,remote,initial)=>{socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(reply.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')}\r\n\r\n`);if(initial.length)socket.write(initial);if(head.length)remote.write(head);remote.pipe(socket);socket.pipe(remote);remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());});upstream.on('error',()=>socket.destroy());upstream.end();
  });
  proxy.on('error',error=>{console.error(error.message);void supervisor.close().finally(()=>{process.exitCode=1;});});
  proxy.listen(3105,'127.0.0.1',open);
  async function stop(){clearInterval(healthTimer);proxy.close();await supervisor.close();process.exit();}
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}

