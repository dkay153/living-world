import {readFile,writeFile,mkdir,unlink,lstat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {digest,assessSourceChanges} from './release-artifacts.js';
import {inspectChanges} from './developer-sandbox.js';

// A completed model turn can still have an unsuccessful release check. Its
// source may be offered as untrusted data to a NEW owner-requested attempt;
// none of its checks, leases or publication authority are inherited.
export function recoverableRun(row){
  if(!row)return false;
  if(['failed','cancelled','interrupted'].includes(row.state))return true;
  if(row.state!=='succeeded')return false;
  let report;try{report=typeof row.report==='string'?JSON.parse(row.report):row.report;}catch{return false;}
  return report?.checks?.passed===true&&report.checks.discipline?.passed===true&&
    report.promotion?.state==='rejected'&&report.liveRelease===false&&
    report.release?.state==='not_requested';
}

// Data-only reuse in a fresh sandbox. Never execute a retained candidate here.
export async function recoverCandidateFiles({previous,candidate,approvedFiles}){
  const manifest=JSON.parse(await readFile(resolve(previous,'manifest.json'),'utf8'));
  const safe=path=>typeof path==='string'&&!path.includes('\\')&&!path.includes(':')&&!path.startsWith('/')&&!path.split('/').some(part=>part==='..'||part==='.'||!part);
  if(!Array.isArray(manifest.files)||manifest.files.some(file=>!safe(file.path)))throw Error('Invalid retained manifest path');
  const changes=(await inspectChanges(resolve(previous,'candidate'),resolve(previous,'baseline'),manifest))
    .filter(change=>change.path!=='development-result.json');
  if(!assessSourceChanges(changes,{dependencies:true}).passed)throw Error('Recovery cannot import protected source changes');
  const allowed=new Set(approvedFiles),pending=[];
  for(const change of changes){
    if(!allowed.has(change.path))throw Error('Recovered file is outside the fresh approved plan: '+change.path);
    if(!safe(change.path))throw Error('Invalid recovered path');
    const target=resolve(candidate,change.path);
    if(!target.startsWith(resolve(candidate)+sep))throw Error('Recovery escaped fresh candidate');
    // Check every parent before even reading or writing through it.
    let parent=dirname(target);while(parent!==resolve(candidate)){
      try{const info=await lstat(parent);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Recovery parent is not a plain directory');}catch(error){if(error.code!=='ENOENT')throw error;}parent=dirname(parent);
    }
    let hash=null;try{const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Recovery target is not a plain file');hash=digest(await readFile(target));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(hash!==change.beforeHash)throw Error('Recovery baseline changed: '+change.path);
    const bytes=change.afterHash===null?null:await readFile(resolve(previous,'candidate',change.path));
    if(bytes&&digest(bytes)!==change.afterHash)throw Error('Retained candidate changed during recovery');
    pending.push({change,target,bytes});
  }
  // No writes until all files and baseline hashes have been checked.
  for(const {change,target,bytes}of pending){if(bytes===null)await unlink(target);else{await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);} }
  return changes.map(({path,beforeHash,afterHash})=>({path,beforeHash,afterHash}));
}
