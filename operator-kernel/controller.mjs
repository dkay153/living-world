// Independent root controller. Candidate policy/tools execute only as UID 10001.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cp,mkdir,chown,chmod,readdir,lstat,readFile,symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
if(process.platform!=='linux'||process.getuid()!==0)throw Error('Linux kernel controller required');
process.setgroups([]);
const hash=value=>createHash('sha256').update(value).digest('hex');
async function tree(root){const files=[];async function walk(path,prefix=''){for(const item of await readdir(path,{withFileTypes:true})){const file=path+'/'+item.name,relative=prefix+item.name,info=await lstat(file);if(info.isSymbolicLink()||info.nlink>1&&!info.isDirectory())throw Error('Unsafe source link');if(info.isDirectory())await walk(file,relative+'/');else files.push({path:relative,bytes:info.size,sha256:hash(await readFile(file))});}}await walk(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return hash(JSON.stringify(files));}
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
let child=null;
async function run(message){
  return new Promise((accept,reject)=>{
    child=spawn('/usr/local/bin/node',['/kernel/worker.mjs'],{cwd:'/tmp/operator',uid:10001,gid:10001,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp/operator',TMPDIR:'/tmp/operator',NODE_ENV:'production'},stdio:['pipe','pipe','pipe']});
    const current=child;let output='',bytes=0,diagnostic='';const timer=setTimeout(()=>current.kill('SIGKILL'),10000);
    current.stdout.on('data',data=>{bytes+=data.length;if(bytes>65536)current.kill('SIGKILL');else output+=data;});
    current.stderr.on('data',data=>{bytes+=data.length;diagnostic=(diagnostic+data.toString()).slice(-2000);if(bytes>65536)current.kill('SIGKILL');});
    current.stdin.on('error',()=>{});current.stdin.end(JSON.stringify(message));
    current.once('error',error=>{clearTimeout(timer);reject(error);});current.once('exit',code=>{clearTimeout(timer);child=null;if(code!==0||bytes>65536)return reject(Error('Confined operator failed: '+diagnostic));try{accept(JSON.parse(output));}catch{reject(Error('Invalid operator JSON output'));}});
  });
}
async function freeze(path){await chown(path,0,0);await chmod(path,0o555);for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isSymbolicLink())continue;if(entry.isDirectory())await freeze(file);else{await chown(file,0,0);await chmod(file,0o444);}}}
try{
  const connected=await new Promise(done=>{const socket=createConnection({host:'1.1.1.1',port:443});const finish=value=>{socket.destroy();done(value);};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(true));});if(connected)throw Error('Operator network confinement failed');
  const sourceHash=await tree('/input');
  // libuv enters cwd before dropping UID; the capability-dropped controller
  // also needs traverse permission. No secrets live in candidate scratch.
  await mkdir('/tmp/operator');await chmod('/tmp/operator',0o755);await chown('/tmp/operator',10001,10001);
  await cp('/input','/work/app',{recursive:true});await symlink('/opt/lw-deps/node_modules','/work/app/node_modules');await freeze('/work/app');
  // A separately launched UID canary verifies the actual boundary, not a policy claim.
  await new Promise((accept,reject)=>{const probe=spawn('/usr/local/bin/node',['-e',`const fs=require('fs');let ok=process.getuid()===10001&&!process.getgroups().includes(0)&&!fs.existsSync('/var/run/docker.sock');for(const p of ['/input/forbidden','/seed/forbidden','/work/app/forbidden']){try{fs.writeFileSync(p,'bad');ok=false;}catch(e){if(!['EACCES','EPERM','EROFS'].includes(e.code))ok=false;}}process.exit(ok?0:1);`],{cwd:'/tmp/operator',uid:10001,gid:10001,env:{PATH:'/usr/local/bin'},stdio:'ignore'});probe.once('exit',code=>code===0?accept():reject(Error('Operator UID confinement failed')));probe.once('error',reject);});
  send({type:'ready',sourceHash,buildHash:await tree('/input/operator'),checks:{networkBlocked:true,separateUid:true,readOnlySource:true,noOwnerMount:true}});
  for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
    if(line.length>32768)throw Error('Operator request too large');const message=JSON.parse(line);
    try{if(!['decide','tool','health'].includes(message.type))throw Error('Unknown kernel request');const value=message.type==='health'?{ok:true}:await run(message);send({type:'result',id:message.id,value});}catch(error){send({type:'result',id:message.id,error:String(error.message).slice(-2000)});}
  }
}catch(error){send({type:'fatal',error:String(error.message).slice(-2000)});}
finally{child?.kill('SIGKILL');process.exit(0);}
