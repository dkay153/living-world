import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';

const root=resolve('.');
const output=resolve('outputs','world-lab','micro');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(error=>error?reject(error):resolve(port));});});}
async function until(check,message){for(let attempt=0;attempt<80;attempt++){try{const value=await check();if(value)return value;}catch{/* server is still starting */}await wait(100);}throw new Error(message);}
async function welcome(url,origin){return new Promise((resolve,reject)=>{const socket=new WebSocket(url,{origin});const timer=setTimeout(()=>{socket.terminate();reject(new Error('World Lab WebSocket welcome timed out'));},5000);socket.once('error',reject);socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='welcome'){clearTimeout(timer);socket.close();resolve(message);}});});}
async function exerciseMovement(url,origin){return new Promise((resolve,reject)=>{const socket=new WebSocket(url,{origin});let id='',moved=false;const timer=setTimeout(()=>{socket.terminate();reject(new Error('World Lab server-authoritative movement timed out'));},5000);socket.once('error',reject);socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='welcome'){id=message.id;socket.send(JSON.stringify({type:'move',direction:'right'}));moved=true;return;}if(moved&&message.type==='state'&&message.players.some(player=>player.id===id&&player.x===4&&player.y===10)){clearTimeout(timer);socket.close();resolve({id,x:4,y:10});}});});}

const port=await freePort(),base=`http://127.0.0.1:${port}`,data=await mkdtemp(join(tmpdir(),'living-world-micro-lab-'));
let server,browser;
try{
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,BACKUP_DIR:join(data,'backups'),PUBLIC_ORIGIN:base,WORLD_FIXTURE:'micro'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  await until(async()=>{const response=await fetch(`${base}/healthz`);return response.ok;},`Micro Realm did not become healthy: ${stderr.slice(-1000)}`);
  const protocol=await welcome(base.replace('http','ws')+'/world',base);
  if(protocol.width!==18||protocol.height!==14)throw new Error(`Micro fixture dimensions changed: ${protocol.width}×${protocol.height}`);
  if(!protocol.objects.some(object=>object.id==='keeper')||!protocol.objects.some(object=>object.id==='stone'))throw new Error('Micro fixture lost its narrative anchors');
  const movement=await exerciseMovement(base.replace('http','ws')+'/world',base);

  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#connection')?.textContent==='WORLD ONLINE');
  await page.locator('#world').click();await page.keyboard.press('ArrowRight');await wait(250);
  const metrics=await page.evaluate(()=>{
    const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();let opaque=0,luminanceMin=255,luminanceMax=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]){opaque++;colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);const l=Math.round(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]);luminanceMin=Math.min(luminanceMin,l);luminanceMax=Math.max(luminanceMax,l);}}
    return {canvas:{width:canvas.width,height:canvas.height,aria:canvas.getAttribute('aria-label')},colors:colors.size,opaqueRatio:opaque/(canvas.width*canvas.height),luminanceRange:luminanceMax-luminanceMin,connection:document.querySelector('#connection')?.textContent,buttons:[...document.querySelectorAll('button')].map(button=>button.textContent.trim()),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
  });
  const failed=[];
  if(metrics.connection!=='WORLD ONLINE')failed.push('client did not reach the Realm');
  if(!metrics.canvas.aria)failed.push('world canvas has no accessible label');
  if(metrics.colors<16)failed.push(`scene uses too few visible colors (${metrics.colors})`);
  // The fixed 768×512 canvas is intentionally larger than the 18×14 fixture;
  // a complete micro map therefore occupies roughly two thirds of its pixels.
  if(metrics.opaqueRatio<0.50)failed.push(`micro map covers too little of the canvas (${metrics.opaqueRatio})`);
  if(metrics.luminanceRange<70)failed.push(`scene lacks readable luminance range (${metrics.luminanceRange})`);
  if(!metrics.buttons.includes('Interact'))failed.push('primary interaction control is absent');
  if(metrics.horizontalOverflow)failed.push('page has horizontal overflow at the reference viewport');
  await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'micro-world.png'),fullPage:true});
  const report={version:1,capturedAt:new Date().toISOString(),fixture:'micro',realm:{base,layout:`${protocol.width}x${protocol.height}`,objects:protocol.objects.map(object=>object.id),serverAuthoritativeMove:movement},browser:{engine:'playwright-chromium',viewport:'1280x800',reducedMotion:true},metrics,checks:{passed:failed.length===0,failed},artifacts:{screenshot:'outputs/world-lab/micro/micro-world.png'},candidateExecution:'blocked: Windows Sandbox/container isolation is not configured; this trusted-baseline harness never runs saved AI candidate code on the host.',nextAutonomousQuestion:'Inspect the actual micro-world capture and report. Choose one focused, falsifiable visual, interaction or encounter improvement only after candidate execution is available in a disposable runtime.'};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  if(failed.length)throw new Error(`Micro World Lab failed: ${failed.join('; ')}`);
  console.log('LW_MICRO_WORLD_LAB_OK');console.log(JSON.stringify(report));
}finally{
  await browser?.close();if(server&&!server.killed){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),wait(5000)]);if(!server.killed)server.kill('SIGKILL');}
  await rm(data,{recursive:true,force:true});
}
