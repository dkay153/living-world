// Run through the contained development command tool, never against live saves.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function validateJourney(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['route','width','height','steps','capture'].includes(k)))throw Error('Unknown journey fields');
  const journey={route:'/legacy/',width:1280,height:800,steps:[],capture:'.scratch/playthrough.png',...input};
  if(!['/','/legacy/'].includes(journey.route))throw Error('Choose a private game route');
  for(const k of ['width','height'])if(!Number.isInteger(journey[k])||journey[k]<320||journey[k]>1920)throw Error('Invalid viewport');
  if(!/^\.scratch\/[a-zA-Z0-9_-]+\.png$/.test(journey.capture))throw Error('Choose a scratch PNG');
  if(!Array.isArray(journey.steps)||journey.steps.length>60)throw Error('Choose up to sixty journey steps');
  for(const step of journey.steps){
    if(!step||typeof step!=='object'||Object.keys(step).some(k=>!['action','selector','value'].includes(k)))throw Error('Invalid journey step');
    if(!['press','click','text','visible','reload','wait'].includes(step.action))throw Error('Unknown journey action');
    if(step.selector!==undefined&&(typeof step.selector!=='string'||!step.selector||step.selector.length>300))throw Error('Invalid selector');
    if(['click','text','visible'].includes(step.action)&&!step.selector)throw Error('Action needs a selector');
    if(step.action==='press'&&(typeof step.value!=='string'||step.value.length>80))throw Error('Action needs a key');
    if(step.action==='text'&&(typeof step.value!=='string'||step.value.length>1000))throw Error('Action needs expected text');
    if(step.action==='wait'&&(!Number.isInteger(step.value)||step.value<0||step.value>3000))throw Error('Wait is bounded');
  }
  return journey;
}

export async function playGame(input){
  const journey=validateJourney(input);
  if(process.platform!=='linux'||process.getuid?.()!==10002)throw Error('Use the contained development command tool');
  const {chromium}=await import('playwright-core');
  const data=await mkdtemp(join(tmpdir(),'lw-play-'));
  const port=await new Promise((done,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):done(p));});});
  const base=`http://127.0.0.1:${port}`,report={passed:false,journey,steps:[],consoleErrors:[],pageErrors:[],failedRequests:[]};
  let browser,child,logs='';
  try{
    child=spawn(process.execPath,['server/index.js'],{cwd:resolve('.'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:base,DATA_DIR:data,BACKUP_DIR:join(data,'backups'),WORLD_FIXTURE:'micro',LW_SITE_PREVIEW:'',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-6000);});
    child.on('error',e=>{logs+=e.message;});
    let healthy=false;
    for(let i=0;i<100;i++){try{healthy=(await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(healthy)break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
    if(!healthy)throw Error('Private game failed startup: '+logs);
    browser=await chromium.launch({headless:true,chromiumSandbox:true});
    const page=await browser.newPage({viewport:{width:journey.width,height:journey.height},reducedMotion:'reduce'});
    page.on('pageerror',e=>report.pageErrors.push(e.message.slice(0,500)));
    page.on('console',m=>{if(m.type()==='error'&&report.consoleErrors.length<30)report.consoleErrors.push(m.text().slice(0,500));});
    page.on('requestfailed',r=>{if(report.failedRequests.length<30)report.failedRequests.push({url:r.url(),error:r.failure()?.errorText});});
    await page.goto(base+journey.route,{waitUntil:'networkidle',timeout:20000});
    const game=journey.route==='/'?page.frameLocator('iframe'):page;
    await game.locator('#connection').filter({hasText:'WORLD ONLINE'}).waitFor({timeout:15000});
    for(const [index,step] of journey.steps.entries()){
      if(step.action==='press')await (step.selector?game.locator(step.selector):game.locator('#world')).press(step.value);
      if(step.action==='click')await game.locator(step.selector).click({timeout:5000});
      if(step.action==='visible')await game.locator(step.selector).waitFor({state:'visible',timeout:5000});
      if(step.action==='text')await game.locator(step.selector).filter({hasText:step.value}).waitFor({timeout:5000});
      if(step.action==='wait')await page.waitForTimeout(step.value);
      if(step.action==='reload'){await page.reload({waitUntil:'networkidle'});await game.locator('#connection').filter({hasText:'WORLD ONLINE'}).waitFor({timeout:15000});}
      report.steps.push({index,action:step.action,passed:true});
    }
    report.text=(await game.locator('body').innerText()).slice(0,12000);
    report.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    await mkdir(resolve('.scratch'),{recursive:true});await page.screenshot({path:journey.capture,fullPage:true});report.capture=journey.capture;
    if(report.pageErrors.length)throw Error('Browser page errors');
    report.passed=true;
  }catch(e){report.error=String(e.message).slice(0,2000);}
  finally{
    await browser?.close();
    if(child&&child.exitCode===null){await new Promise(done=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('close',()=>{clearTimeout(timer);done();});child.kill('SIGTERM');});}
    await rm(data,{recursive:true,force:true});
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const report=await playGame(JSON.parse(process.argv[2]||'{}'));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
}
