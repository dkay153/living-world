// Trusted-current-source UI verification only; never launches saved candidates.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { chromium } from '@playwright/test';
import { openStore } from '../server/store.js';
import { createOwnerTicket } from '../server/owner-auth.js';
const temp=await mkdtemp(join(tmpdir(),'lw-release-ui-')),output=resolve(process.env.LW_SOURCE_LAB_OUTPUT||'outputs/source-lane-verification');let server,browser;
try{
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(done=>probe.close(done));const base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATA_DIR:temp,BACKUP_DIR:join(temp,'backups'),PORT:String(port),HOST:'127.0.0.1',PUBLIC_ORIGIN:base},stdio:'ignore',windowsHide:true});
  let healthy=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){healthy=true;break;}}catch{}await new Promise(done=>setTimeout(done,100));}if(!healthy)throw new Error('Trusted UI server did not start');
  const store=openStore(join(temp,'world.sqlite'));let ticket;try{ticket=createOwnerTicket(store.db);}finally{store.db.close();}
  browser=await chromium.launch({headless:true,chromiumSandbox:process.env.LW_CONTAINED_BROWSER==='1'});const page=await browser.newPage({viewport:{width:1280,height:960},reducedMotion:'reduce'});
  await page.goto(base+'/admin#ticket='+ticket);await page.getByRole('tab',{name:'Operations',exact:true}).click();
  const panel=page.getByRole('region',{name:'Game releases'});await panel.waitFor();
  if(!await panel.getByRole('button',{name:'Verify protected runtime'}).isDisabled())throw new Error('Unenrolled runtime exposed cutover');
  if(!await panel.getByRole('button',{name:'Restore previous game'}).isDisabled())throw new Error('Missing rollback baseline exposed');
  await panel.scrollIntoViewIfNeeded();await mkdir(output,{recursive:true});await page.screenshot({path:join(output,'source-controls.png'),fullPage:true});
  await writeFile(join(output,'browser.json'),JSON.stringify({passed:true,scope:'Trusted current-source owner UI',checks:['Missing runtime is visible','Unenrolled cutover is disabled','Missing rollback baseline is disabled','Model and budget forms were not submitted']},null,2));
  console.log('SOURCE_LANE_UI_OK');
}finally{await browser?.close();if(server?.exitCode===null){server.kill();await Promise.race([once(server,'exit'),new Promise(done=>setTimeout(done,5000))]);}await rm(temp,{recursive:true,force:true});}
