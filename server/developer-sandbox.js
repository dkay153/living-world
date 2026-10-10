import { mkdir,readdir,lstat,readFile,writeFile,copyFile,realpath,unlink } from 'node:fs/promises';
import { resolve,relative,join,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareCodexHome,codexEnvironment,codexBinary,runProcess } from './codex-process.js';

const roots=['server','public','tests','scripts','docs','config'];
const topFiles=['AGENTS.md','README.md','package.json','package-lock.json','.gitignore'];
const hash=data=>createHash('sha256').update(data).digest('hex');
const excluded=name=>name.startsWith('.')||['node_modules','data','backups','work','outputs'].includes(name)||/\.(sqlite|db|key|log)$/i.test(name);
export async function filesUnder(root,{limit=2000,exclude=true}={}) {
  const files=[];let bytes=0;
  async function visit(dir){for(const item of await readdir(dir,{withFileTypes:true})){
    if(exclude?excluded(item.name):['node_modules','.scratch'].includes(item.name))continue;
    const path=join(dir,item.name),info=await lstat(path);
    if(info.isSymbolicLink())throw new Error('Symbolic links are not allowed in developer copies');
    if(item.isDirectory())await visit(path);else if(item.isFile()){if(info.size>512*1024)throw new Error('Developer file exceeds 512 KB');bytes+=info.size;if(bytes>25*1024*1024)throw new Error('Developer copy exceeds 25 MB');files.push(relative(root,path).split(sep).join('/'));if(files.length>limit)throw new Error('Too many developer files');}
  }}
  await visit(root);return files.sort();
}
async function copyEntry(source,target,path) {
  const from=resolve(source,path),info=await lstat(from);
  const real=await realpath(from),root=await realpath(source);
  if(info.isSymbolicLink()||!(real===root||real.startsWith(root+sep)))throw new Error('Source escaped its directory');
  if(info.isDirectory()){for(const child of await filesUnder(from))await copyEntry(source,target,path+'/'+child);}
  else{if(info.size>512*1024)throw new Error('Source file exceeds 512 KB');await mkdir(resolve(target,path,'..'),{recursive:true});await copyFile(from,resolve(target,path));}
}
export async function snapshotProject(source,candidate,baseline) {
  await mkdir(candidate,{recursive:true});await mkdir(baseline,{recursive:true});
  for(const entry of [...topFiles,...roots]){
    try{await copyEntry(source,candidate,entry);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const files=[...(await filesUnder(candidate)),...(await lstat(resolve(candidate,'.gitignore')).then(()=>['.gitignore']).catch(()=>[]))];let bytes=0;
  const manifest=[];for(const path of files){const data=await readFile(resolve(candidate,path));bytes+=data.length;if(bytes>25*1024*1024)throw new Error('Source copy exceeds 25 MB');await mkdir(resolve(baseline,path,'..'),{recursive:true});await writeFile(resolve(baseline,path),data);manifest.push({path,sha256:hash(data),bytes:data.length});}
  // Use only the already installed dependency. No install scripts or network downloads.
  await copyEntry(source,candidate,'node_modules/ws');
  await mkdir(resolve(candidate,'.scratch'),{recursive:true});
  return {files:manifest,sourceHash:hash(Buffer.from(JSON.stringify(manifest)))};
}
export async function inspectChanges(candidate,baseline,manifest) {
  const paths=new Set([...manifest.files.map(f=>f.path),...await filesUnder(candidate,{exclude:false})]),changes=[];
  const binary=data=>data?.includes(0)||data?.length>256*1024;
  for(const path of paths){
    const before=await readFile(resolve(baseline,path)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    const info=await lstat(resolve(candidate,path)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(info?.isSymbolicLink())throw new Error('Candidate contains a symbolic link');
    const after=info?await readFile(resolve(candidate,path)):null;
    if(before&&after&&hash(before)===hash(after))continue;
    changes.push({path,kind:before?(after?'modified':'deleted'):'added',beforeHash:before?hash(before):null,afterHash:after?hash(after):null,...(!binary(before)&&!binary(after)?{before:before?.toString('utf8')??null,after:after?.toString('utf8')??null}:{binary:true})});
  }
  return changes;
}
export async function checkSandbox({home,candidate,protectedPaths,binary=codexBinary(),runner=runProcess}) {
  await mkdir(candidate,{recursive:true});await prepareCodexHome(home);
  const script=`const fs=require('node:fs'),net=require('node:net');let ok=true;const deny=${JSON.stringify(protectedPaths)};for(const p of deny){try{fs.readFileSync(p);ok=false;}catch(e){if(e.code==='ENOENT')ok=false;}}try{fs.writeFileSync('lw-canary.txt','sandbox');if(fs.readFileSync('lw-canary.txt','utf8')!=='sandbox')ok=false;}catch{ok=false;}const s=net.connect({host:'127.0.0.1',port:29877});s.on('connect',()=>{ok=false;s.destroy();});s.on('error',()=>{});s.on('close',()=>{console.log(ok?'LW_ISOLATION_OK':'LW_ISOLATION_FAILED');process.exit(ok?0:1);});setTimeout(()=>{s.destroy();ok=false;},2000);`;
  const {createServer}=await import('node:net');const listener=createServer(socket=>socket.end());
  await new Promise((accept,reject)=>{listener.once('error',reject);listener.listen(29877,'127.0.0.1',accept);});
  try{
    const result=await runner(binary,['sandbox','-C',candidate,'-P','living-world','--',process.execPath,'-e',script],{cwd:candidate,env:codexEnvironment(home,resolve(candidate,'.scratch')),timeoutMs:20000});
    if(result.code!==0||result.timedOut||result.cancelled||result.overflow||!result.stdout.includes('LW_ISOLATION_OK'))throw new Error('Isolation check failed. Developer execution stays blocked.');
    return {ok:true,checkedAt:Date.now(),platform:process.platform,filesystem:'restricted',network:'blocked'};
  }finally{await new Promise(accept=>listener.close(accept));await unlink(resolve(candidate,'lw-canary.txt')).catch(()=>{});}
}
