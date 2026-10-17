// Protected image controller. Never imports candidate JS or candidate tests in
// this privileged process. All candidate execution drops to UID/GID 10001.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, cp, chown, chmod, symlink, readFile, writeFile, readdir, lstat, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { DatabaseSync, backup } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire('/opt/lw-deps/package.json'),{WebSocket}=require('ws');
if(process.platform!=='linux'||process.getuid()!==0||process.argv[2]!=='serve'&&process.argv[2]!=='stage')throw new Error('Protected Linux container controller required');
if(Number(process.versions.node.split('.')[0])!==22||Number(process.versions.node.split('.')[1])<18)throw new Error('The protected runtime requires Node 22.18 or newer in the 22.x line');
// Do not let candidate/observer children inherit supplementary root groups.
process.setgroups([]);
const stage=process.argv[2]==='stage',env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp/game',TMPDIR:'/tmp',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',PLAYWRIGHT_BROWSERS_PATH:'/opt/lw-browsers',WORLD_FIXTURE:'basin'};
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
let realm,sequence=0,chain=Promise.resolve(),stopping=false;const sockets=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
async function tree(dir,{source=false}={}){const files=[];async function visit(path,relative=''){for(const item of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(source&&(item.name==='node_modules'||item.name==='.next'||item.name==='out'||item.name.endsWith('.tsbuildinfo')))continue;const next=path+'/'+item.name,rel=relative?relative+'/'+item.name:item.name;const info=await lstat(next);if(info.isSymbolicLink())throw new Error('Symlink in sealed source');if(info.isDirectory())await visit(next,rel);else files.push({path:rel,bytes:info.size,sha256:hash(await readFile(next))});}}await visit(dir);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return hash(JSON.stringify(files));}
async function ownership(dir,uid,gid,writable){await chown(dir,0,0);await chmod(dir,0o755);for(const entry of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isSymbolicLink())continue;if(entry.isDirectory())await ownership(file,uid,gid,writable);else{await chown(file,0,0);await chmod(file,writable?0o644:0o444);await chown(file,uid,gid);}}await chmod(dir,writable?0o755:0o555);await chown(dir,uid,gid);}
async function run(binary,args,{cwd='/work/app',uid=10001,gid=10001,maxMs=120000}={}){
  return new Promise((accept,reject)=>{const child=spawn(binary,args,{cwd,uid,gid,env:{...env,HOME:uid===10002?'/tmp/observer':env.HOME},stdio:['ignore','pipe','pipe']});let bytes=0,tail='';const label=args[0]==='-e'?'identity canary':args[0];const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Contained check time limit: '+label));},maxMs);
    // Candidate output is data: only bounded JSON-escaped diagnostics may leave.
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{bytes+=data.length;tail=(tail+data.toString()).slice(-6000);if(bytes>2*1024*1024)child.kill('SIGKILL');});
    child.once('error',cause=>{clearTimeout(timer);const error=new Error('Contained check launch failed: '+label+' ('+String(cause.code||'unknown')+')');error.diagnostic=tail;reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code===0&&bytes<=2*1024*1024)accept();else{const error=new Error('Contained check failed: '+label+' (exit '+code+')');error.diagnostic=tail;reject(error);}});
  });
}
async function checkpoint(){
  const path='/work/protected/checkpoint-'+(++sequence)+'.sqlite',db=new DatabaseSync('/work/world/world.sqlite',{readOnly:true});
  try{await backup(db,path);}finally{db.close();}
  const bytes=await readFile(path);if(bytes.length>48*1024*1024)throw new Error('World checkpoint limit');
  await unlink(path);
  return bytes.toString('base64');
}
async function healthy(){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}await new Promise(done=>setTimeout(done,100));}throw new Error('Realm startup failed');}
function publishEvent(id,value){chain=chain.then(async()=>{if(stopping)return;send({type:'event',id,value,checkpoint:await checkpoint()});}).catch(error=>{send({type:'fatal',error:error.message});void shutdown();});}
async function shutdown(){stopping=true;for(const socket of sockets.values())socket.terminate();if(realm?.exitCode===null){realm.kill('SIGTERM');await new Promise(done=>{const timer=setTimeout(()=>{realm.kill('SIGKILL');done();},3000);realm.once('exit',()=>{clearTimeout(timer);done();});});}process.exit(0);}
async function egress(){return new Promise(done=>{const socket=createConnection({host:'1.1.1.1',port:443});const finish=connected=>{socket.destroy();done(connected);};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1500,()=>finish(true));});}
try{
  if(await egress())throw new Error('External network confinement failed');
  const sourceHash=await tree('/input');
  env.LW_RELEASE_BUILD_ID=sourceHash;
  await mkdir('/work/protected',{recursive:true});await chmod('/work/protected',0o700);await writeFile('/work/protected/controller-canary','protected');
  await mkdir('/work/control',{recursive:true});await chmod('/work/control',0o755);await writeFile('/work/control/memory-paused.json','true',{mode:0o444});
  await mkdir('/tmp/game',{recursive:true});await chown('/tmp/game',10001,10001);
  const canary=`const fs=require('node:fs');let ok=process.getuid()===10001&&process.getgid()===10001&&!process.getgroups().includes(0);for(const path of ['/input/lw-write-canary','/seed/lw-write-canary']){try{fs.writeFileSync(path,'must fail');ok=false;}catch(e){if(!['EACCES','EPERM','EROFS'].includes(e.code))ok=false;}}try{fs.readFileSync('/work/protected/controller-canary');ok=false;}catch(e){if(!['EACCES','EPERM'].includes(e.code))ok=false;}if(fs.existsSync('/var/run/docker.sock'))ok=false;fs.writeFileSync('/tmp/game/own-canary','ok');process.exit(ok?0:1);`;
  await run('/usr/local/bin/node',['-e',canary],{cwd:'/tmp/game',maxMs:10000});
  await mkdir('/work/app',{recursive:true});await cp('/input','/work/app',{recursive:true});
  await mkdir('/work/app/node_modules');
  for(const name of await readdir('/opt/lw-deps/node_modules')){
    if(name==='ws')await cp('/opt/lw-deps/node_modules/ws','/work/app/node_modules/ws',{recursive:true});
    else await symlink('/opt/lw-deps/node_modules/'+name,'/work/app/node_modules/'+name);
  }
  await ownership('/work/app',10001,10001,true);
  // Webpack supports the protected dependency links outside the source tree.
  await run('/usr/local/bin/node',['/opt/lw-deps/node_modules/next/dist/bin/next','build','ui','--webpack'],{maxMs:120000});
  const buildHash=await tree('/work/app/ui/out');
  if(stage){
    const tests=(await readdir('/work/app/tests')).filter(name=>name.endsWith('.test.js')).sort().map(name=>'tests/'+name);
    if(!tests.length)throw new Error('No candidate tests');await run('/usr/local/bin/node',['--test','--test-concurrency=2','--test-reporter=spec',...tests],{maxMs:120000});
  }
  if(await tree('/work/app',{source:true})!==sourceHash||await tree('/work/app/ui/out')!==buildHash)throw new Error('Build or tests changed sealed source/output');
  // Freeze ownership before copying: with capabilities dropped, Linux denies
  // copyFile's metadata operations on files still owned by the game UID.
  await ownership('/work/app',0,0,false);
  // A fresh copy severs every file descriptor retained by a candidate build or
  // test descendant. Test-modified dependencies never become runtime inputs.
  await mkdir('/work/realm',{recursive:true});await cp('/input','/work/realm',{recursive:true});
  await cp('/work/app/ui/out','/work/realm/ui/out',{recursive:true});
  if(await tree('/work/realm/ui/out')!==buildHash)throw new Error('Build changed during capture');
  await symlink('/opt/lw-deps/node_modules','/work/realm/node_modules');
  await ownership('/work/realm',0,0,false);
  // Protect built source from the running game and from test subprocesses.
  await mkdir('/work/world',{recursive:true});await cp('/seed/world.sqlite','/work/world/world.sqlite');await ownership('/work/world',10001,10001,true);
  await mkdir('/work/protected',{recursive:true});await chmod('/work/protected',0o700);
  realm=spawn('/usr/local/bin/node',['/opt/lw-tools/realm-entry.mjs'],{cwd:'/work/realm',uid:10001,gid:10001,env:{...env,WORLD_FIXTURE:stage?'micro':'basin'},stdio:['ignore','ignore','ignore']});
  realm.once('error',()=>send({type:'fatal',error:'Realm process unavailable'}));realm.once('exit',()=>{if(!stopping)send({type:'fatal',error:'Realm process exited'});});
  await healthy();
  send({type:'ready',sourceHash,buildHash,nodeVersion:process.version,checks:{uiBuild:true,candidateTests:stage,networkBlocked:true,separateUid:true},checkpoint:await checkpoint()});
  for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
    if(line.length>16384)throw new Error('Request limit');const message=JSON.parse(line);
    try{
      let value;
      if(message.type==='maintenance'){
        if(typeof message.paused!=='boolean')throw new Error('Invalid maintenance control');await chmod('/work/control/memory-paused.json',0o644);await writeFile('/work/control/memory-paused.json',JSON.stringify(message.paused));await chmod('/work/control/memory-paused.json',0o444);value={paused:message.paused};
      }else if(message.type==='http'){
        if(message.path.startsWith('/api/')||message.path.startsWith('/admin')||message.method!=='GET')throw new Error('Owner and mutation HTTP routes forbidden');
        const response=await fetch('http://127.0.0.1:3000'+message.path,{redirect:'manual',signal:AbortSignal.timeout(5000)});
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>4*1024*1024)throw new Error('Response size limit');
        value={status:response.status,contentType:response.headers.get('content-type'),body:bytes.toString('base64')};
      }else if(message.type==='checkpoint'){await chain;value={checkpoint:await checkpoint()};}
      else if(message.type==='observe'){
        await mkdir('/tmp/observer',{recursive:true});await chmod('/tmp/observer',0o700);await chown('/tmp/observer',10002,10002);
        // Controller reads reports through group 0; the game UID cannot enter.
        await mkdir('/work/observations',{recursive:true});await chmod('/work/observations',0o750);await chown('/work/observations',10002,0);
        try{await run('/usr/local/bin/node',['/opt/lw-tools/observe.mjs'],{cwd:'/opt/lw-tools',uid:10002,gid:10002,maxMs:120000});}catch(error){try{error.diagnostic=await readFile('/work/observations/report.json','utf8');}catch{}throw error;}
        value=JSON.parse(await readFile('/work/observations/report.json','utf8'));
        // The game UID cannot write the observer directory. Captures are data.
        value.captures={};for(const name of ['desktop.png','mobile.png'])value.captures[name]=(await readFile('/work/observations/'+name)).toString('base64');
      }else if(message.type==='ws_open'){
        if(!/^[a-f0-9]{64}$/.test(message.guest)||sockets.has(message.session))throw new Error('Invalid guest session');
        const socket=new WebSocket('ws://127.0.0.1:3000/world',{origin:'http://127.0.0.1:3000',headers:{Cookie:'lw_session='+message.guest},maxPayload:1024*1024});sockets.set(message.session,socket);
        socket.on('message',raw=>publishEvent(message.session,JSON.parse(raw.toString())));
        socket.on('close',()=>publishEvent(message.session,{type:'closed'}));socket.on('error',()=>publishEvent(message.session,{type:'closed'}));
        await new Promise((a,b)=>{socket.once('open',a);socket.once('error',b);});value={opened:true};
      }else if(message.type==='ws_send'){
        const socket=sockets.get(message.session);if(!socket||socket.readyState!==1||typeof message.payload!=='string'||Buffer.byteLength(message.payload)>1024)throw new Error('Invalid socket action');socket.send(message.payload);value={submitted:true};
      }else if(message.type==='ws_close'){sockets.get(message.session)?.close();sockets.delete(message.session);value={closed:true};}
      else throw new Error('Unknown protected runtime operation');
      send({type:'result',id:message.id,value});
    }catch(error){send({type:'result',id:message.id,error:String(error.message).slice(0,200),diagnostic:String(error.diagnostic||'').slice(-6000)});}
  }
  await shutdown();
}catch(error){send({type:'fatal',error:String(error.message).slice(0,200),diagnostic:String(error.diagnostic||'').slice(-6000)});await shutdown();}
