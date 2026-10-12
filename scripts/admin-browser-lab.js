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
async function until(check,message){for(let attempt=0;attempt<80;attempt++){try{if(await check())return;}catch{/* server starts asynchronously */}await wait(100);}throw new Error(message);}

const port=await freePort(),base=`http://127.0.0.1:${port}`,data=await mkdtemp(join(tmpdir(),'living-world-admin-lab-'));
let server,browser;
try{
  server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,BACKUP_DIR:join(data,'backups'),PUBLIC_ORIGIN:base},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
  await until(async()=>{const response=await fetch(`${base}/healthz`);return response.ok;},`Admin Lab did not become healthy: ${stderr.slice(-1000)}`);
  const store=openStore(join(data,'world.sqlite'));let ticket;try{ticket=createOwnerTicket(store.db);}finally{store.db.close();}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
  page.setDefaultTimeout(8000);
  await page.goto(`${base}/admin#ticket=${encodeURIComponent(ticket)}`,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Studio conversation'}).waitFor();
  const failures=[];
  if(!await page.getByRole('link',{name:'Open world'}).count())failures.push('player-world entry point is absent');
  if(!await page.getByRole('tab',{name:'Conversation'}).count())failures.push('conversation tab is absent');
  if(!await page.getByText('Codex',{exact:true}).count())failures.push('agent identity is absent');
  await page.getByRole('tab',{name:'Evidence'}).click();
  await page.getByRole('heading',{name:'Evidence'}).waitFor();
  await page.getByText('Current development context',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Operations'}).click();
  await page.getByRole('heading',{name:'Operations'}).waitFor();
  await page.getByRole('button',{name:'Create backup'}).waitFor();
  await page.getByRole('tab',{name:'World data'}).click();
  await page.getByRole('heading',{name:'World data'}).waitFor();
  await page.getByText('Read-only, redacted records from the persistent local world.').waitFor();
  await page.getByRole('tab',{name:'Charter'}).click();
  await page.getByRole('heading',{name:'Charter'}).waitFor();
  await page.getByRole('button',{name:'Constitution'}).waitFor();
  await page.getByRole('tab',{name:'Connections'}).click();
  await page.getByRole('heading',{name:'Connections'}).waitFor();
  if(!await page.getByText('Codex CLI',{exact:true}).count())failures.push('Codex connection is absent');
  if(!await page.getByText('Claude Code',{exact:true}).count())failures.push('Claude Code connection is absent');
  if(!await page.getByText('OpenRouter',{exact:true}).count())failures.push('OpenRouter connection is absent');
  await page.getByRole('button',{name:'Switch connection'}).click();
  await page.getByPlaceholder('Find a connection...').waitFor();
  await page.getByRole('listbox',{name:'Suggestions'}).getByText('Google Gemini',{exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByText('Google Gemini',{exact:true}).first().waitFor();
  await page.getByRole('tab',{name:'Conversation'}).click();
  await page.getByRole('heading',{name:'Studio conversation'}).waitFor();
  await mkdir(output,{recursive:true});
  await page.screenshot({path:join(output,'developer-controls.png'),fullPage:true});
  await page.getByRole('button',{name:'Start Lab'}).first().click();
  await page.locator('iframe[title="Current-source disposable world"]').waitFor();
  await page.screenshot({path:join(output,'lab-loading.png'),fullPage:true});
  const labSource=await page.locator('iframe[title="Current-source disposable world"]').getAttribute('src');
  const labResponse=labSource?await fetch(labSource):null;
  if(!labResponse?.ok)throw new Error(`World Lab frame did not respond: ${labSource||'missing frame source'}`);
  const labCanvas=page.frameLocator('iframe[title="Current-source disposable world"]').locator('#world');
  await labCanvas.waitFor({timeout:15000});
  if(!await labCanvas.evaluate(canvas=>canvas.ownerDocument.documentElement.classList.contains('studio-embed')))throw new Error('World Lab compact shell did not activate');
  await until(async()=>labCanvas.evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let index=0;index<pixels.length;index+=64)if(pixels[index]||pixels[index+1]||pixels[index+2])return true;return false;}),'World Lab map did not render');
  const direction='Observe the first encounter and retain it unless the World Lab shows a real issue.';
  await page.locator('textarea').fill(direction);
  await page.locator('form').last().evaluate(form=>form.requestSubmit());
  await page.getByText(direction,{exact:true}).waitFor();
  const studioBody=await page.locator('body').innerText();
  if(!studioBody.includes('A living operator transcript for questions, planning context, and isolated autonomous work.'))failures.push('studio does not explain the live developer conversation');
  if(!studioBody.includes('Ask')||!studioBody.includes('Plan')||!studioBody.includes('Agent'))failures.push('studio does not expose the three composer modes');
  if(!studioBody.includes('Refreshes after a verified visual release'))failures.push('studio does not show the running review sandbox');
  await page.screenshot({path:join(output,'studio.png'),fullPage:true});
  const report={version:4,capturedAt:new Date().toISOString(),viewport:'1280x800',checks:{passed:failures.length===0,failed:failures},artifacts:{studioScreenshot:'outputs/world-lab/admin/studio.png'}};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  if(failures.length)throw new Error(`Admin browser Lab failed: ${failures.join('; ')}`);
  console.log('LW_ADMIN_BROWSER_LAB_OK');console.log(JSON.stringify(report));
}finally{
  await browser?.close();
  if(server&&!server.killed){server.kill('SIGTERM');await Promise.race([once(server,'exit'),wait(5000)]);if(!server.killed)server.kill('SIGKILL');}
  await rm(data,{recursive:true,force:true});
}
