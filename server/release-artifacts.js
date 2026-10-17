import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, lstat, readFile, writeFile, copyFile, rename, open,realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import {canonicalNextTypes} from './next-generated.js';

export const digest=value=>createHash('sha256').update(value).digest('hex');
const roots=['server','public','ui','config','tests','docs','scripts','runtime'];
const skipped=name=>name.startsWith('.')||['node_modules','out','data','backups','work','outputs'].includes(name)||/\.(sqlite|db|key|log|env|tsbuildinfo)$/i.test(name);
const trustedScripts=new Set(['scripts/test.js','scripts/source-runtime.js','scripts/operator-runtime.js']);
const realmModules=new Set(['game','combat','world','store','migrations','memory','art-preview','contracts','development-capabilities']);
export const protectedSource=path=>path==='package.json'||path==='package-lock.json'||path==='AGENTS.md'||path==='docs/CONSTITUTION.md'||path==='config/constitution-fixtures.json'||path.startsWith('runtime/')||path.startsWith('operator-kernel/')||trustedScripts.has(path)||path.startsWith('server/')&&!realmModules.has(path.slice(7,-3));
// New game modules may be added; existing control-plane code cannot promote itself.
export function assessSourceChanges(changes,{dependencies=false}={}){
  if(changes.some(c=>c.path.startsWith('.agents/')&&!c.path.startsWith('.agents/skills/')))return {passed:false,forbidden:changes.filter(c=>c.path.startsWith('.agents/')&&!c.path.startsWith('.agents/skills/')).map(c=>c.path)};
  const forbidden=changes.filter(change=>!(dependencies&&['package.json','package-lock.json'].includes(change.path))&&protectedSource(change.path)&&!(change.kind==='added'&&change.path.startsWith('server/')&&!/release|developer|owner|sandbox|promotion|gateway/i.test(change.path))).map(change=>change.path);
  return {passed:forbidden.length===0,forbidden,limits:'Renderer, gameplay, documentation and ordinary tools may evolve. Host tools are retained in the artifact, not executed on the host. Account authority, independent validation, pinned dependencies and runtime policy remain external to candidate promotion.'};
}
export function verifyProtectedFiles(baseline,manifest,{dependencies=false}={}){
  const current=new Map(manifest.files.map(file=>[file.path,file.sha256]));
  const original=new Map(baseline.files.map(file=>[file.path,file.sha256]));
  for(const [path,sha] of original)if(protectedSource(path)&&!(dependencies&&['package.json','package-lock.json'].includes(path))&&current.get(path)!==sha)throw new Error('Protected sealed source changed: '+path);
  for(const [path] of current)if(!original.has(path)&&protectedSource(path)&&!assessSourceChanges([{path,kind:'added'}]).passed)throw new Error('Protected sealed source added: '+path);
  return true;
}
export async function treeManifest(directory){
  const root=resolve(directory),files=[];let bytes=0;
  async function visit(dir){
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=resolve(dir,entry.name),info=await lstat(file);
      if(info.isSymbolicLink())throw new Error('Release artifacts cannot contain symlinks');
      if(info.isDirectory())await visit(file);
      else if(info.isFile()){
        if(info.nlink!==1)throw new Error('Release artifacts cannot contain hard links');
        if(info.size>2*1024*1024||(bytes+=info.size)>40*1024*1024||files.length>=4000)throw new Error('Release source limits exceeded');
        files.push({path:relative(root,file).split(sep).join('/'),bytes:info.size,sha256:digest(await readFile(file))});
      }else throw new Error('Unsupported release file');
    }
  }
  await visit(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);return {files,sourceHash:digest(JSON.stringify(files))};
}
export async function sealSource({candidate,output,runId,baselineHash,policyHash,artOverlay}){
  const directory=resolve(output,`artifact-${randomUUID()}`),source=resolve(directory,'source');await mkdir(source,{recursive:true});
  if((await lstat(candidate)).isSymbolicLink())throw new Error('Candidate root symlink rejected');
  const allowed=await realpath(candidate);
  let capturedBytes=0,capturedFiles=0,directories=0;
  async function copy(from,to){
    const info=await lstat(from);if(info.isSymbolicLink())throw new Error('Candidate symlink rejected');
    const actual=await realpath(from);if(actual!==allowed&&!actual.startsWith(allowed+sep))throw new Error('Candidate escaped source root');
    if(info.isDirectory()){
      if(++directories>4000)throw new Error('Candidate directory limit exceeded');
      await mkdir(to,{recursive:true});for(const entry of await readdir(from))if(!skipped(entry))await copy(resolve(from,entry),resolve(to,entry));
    }else if(info.isFile()){
      if(info.nlink!==1)throw new Error('Candidate hard link rejected');
      if(info.size>2*1024*1024)throw new Error('Candidate source file too large');
      if(++capturedFiles>4000||(capturedBytes+=info.size)>40*1024*1024)throw new Error('Candidate source limits exceeded');
      const original=await lstat(from,{bigint:true}),file=await open(from,'r');
      try{
        const opened=await file.stat({bigint:true});
        if(original.isSymbolicLink()||opened.nlink!==1n||opened.ino!==original.ino||opened.dev!==original.dev)throw new Error('Candidate changed during capture');
        const bytes=await file.readFile(),after=await file.stat({bigint:true});
        if(after.size!==opened.size||after.mtimeNs!==opened.mtimeNs||bytes.length>2*1024*1024)throw new Error('Candidate changed during capture');
        await writeFile(to,relative(source,to).split(sep).join('/')==='ui/next-env.d.ts'?canonicalNextTypes(bytes):bytes,{flag:'wx'});
      }finally{await file.close();}
    }
    else throw new Error('Unsupported candidate entry');
  }
  for(const entry of [...roots,'package.json','package-lock.json','AGENTS.md'])await copy(resolve(candidate,entry),resolve(source,entry));
  for(const entry of ['start.bat','README.md','operator','.agents/skills']){try{await lstat(resolve(candidate,entry));}catch(error){if(error.code==='ENOENT')continue;throw error;}await copy(resolve(candidate,entry),resolve(source,entry));}
  if(artOverlay)await writeFile(resolve(source,'public/art.json'),JSON.stringify(artOverlay));
  const manifest={version:1,runId,baselineHash,policyHash,...await treeManifest(source)};
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  return {directory,source,manifest};
}
export async function verifySource(artifact){
  const actual=await treeManifest(artifact.source);
  if(actual.sourceHash!==artifact.manifest.sourceHash||JSON.stringify(actual.files)!==JSON.stringify(artifact.manifest.files))throw new Error('Sealed artifact changed');
  return true;
}
export async function atomicJson(path,value){
  const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});
  const handle=await open(temp,'r+');try{await handle.sync();}finally{await handle.close();}await rename(temp,path);
}
