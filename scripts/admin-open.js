import { resolve } from 'node:path';
import { mkdirSync,writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { openStore } from '../server/store.js';
import { createOwnerTicket } from '../server/owner-auth.js';
const store=openStore(resolve(process.env.DATA_DIR||'data','world.sqlite'));
try {
  const ticket=createOwnerTicket(store.db),origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${process.env.PORT||3000}`;
  const url=`${origin}/admin#ticket=${ticket}`;
  if(process.argv.includes('--prepare')){
    mkdirSync('work',{recursive:true});writeFileSync('work/admin-launch.json',JSON.stringify({url}),{mode:0o600});console.log('One-time owner login prepared. Expires in two minutes.');
  }else {
    console.log('Opening the owner dashboard with a single-use local login.');
    if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},error=>{if(error)console.error('Could not open browser. Use the --prepare option.');});
    else if(process.platform==='darwin')execFile('open',[url]);else execFile('xdg-open',[url]);
  }
}finally{store.db.close();}
