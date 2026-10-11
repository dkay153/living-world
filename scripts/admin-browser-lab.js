import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { openStore } from '../server/store.js';
import { createOwnerTicket } from '../server/owner-auth.js';

const root=resolve('.');
const output=resolve('outputs','world-lab','admin');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){return new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolve(port));});});}
async function until(check,message){for(let attempt=0;attempt<80;attempt++){try{if(await check())return;}catch{/* server is starting */}await wait(100);}throw new Error(message);}

const port=await freePort(),base=`http://127.0.0.1:${port}`,data=await mkdtemp(join(tmpdir(),'living-world-admin-lab-'));
let server,browser;
try{
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,BACKUP_DIR:join(data,'backups'),PUBLIC_ORIGIN:base},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  await until(async()=>{const response=await fetch(`${base}/healthz`);return response.ok;},`Admin Lab Realm did not become healthy: ${stderr.slice(-1000)}`);
  const store=openStore(join(data,'world.sqlite'));let ticket;try{ticket=createOwnerTicket(store.db);}finally{store.db.close();}
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(`${base}/admin#ticket=${encodeURIComponent(ticket)}`,{waitUntil:'networkidle'});
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('[data-view="developer"]').click();
  await page.getByRole('heading',{name:'Codex developer'}).waitFor();
  await page.getByText('Developer execution',{exact:true}).waitFor();
  const body=await page.locator('body').innerText();
  const watchdog=page.locator('input[name="maxMinutes"]');
  const failures=[];
  if(body.includes('Account task allowance')||body.includes('Tasks per day')||body.includes('Reserved Codex minutes per day'))failures.push('stale local-cap controls are visible');
  if(await watchdog.getAttribute('min')!=='1'||await watchdog.getAttribute('max')!=='1440')failures.push('watchdog bounds are not rendered');
  const cadenceInput=page.locator('input').filter({hasText:''}).nth(1);
  if(await cadenceInput.getAttribute('min')!=='1')failures.push('autonomy cadence does not allow one minute');
  await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'developer-controls.png'),fullPage:true});
  const report={version:1,capturedAt:new Date().toISOString(),viewport:'1280x800',checks:{passed:failures.length===0,failed:failures},artifacts:{screenshot:'outputs/world-lab/admin/developer-controls.png'}};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  if(failures.length)throw new Error(`Admin browser Lab failed: ${failures.join('; ')}`);
  console.log('LW_ADMIN_BROWSER_LAB_OK');console.log(JSON.stringify(report));
}finally{
  await browser?.close();if(server&&!server.killed){server.kill('SIGTERM');await Promise.race([once(server,'exit'),wait(5000)]);if(!server.killed)server.kill('SIGKILL');}
  await rm(data,{recursive:true,force:true});
}
