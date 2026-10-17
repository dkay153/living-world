// Build/enroll only the trusted runtime image. Never execute saved candidates.
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir,mkdtemp,copyFile,cp,readFile,writeFile } from 'node:fs/promises';
import { runProcess,stopProcess } from '../server/codex-process.js';
import { treeManifest, atomicJson,digest } from '../server/release-artifacts.js';
import { createDockerRuntime } from '../server/release-runtime.js';
import { proveRuntime } from '../server/release-enrollment.js';
const args=process.argv.slice(2);
if(args.length!==1||!['build','verify'].includes(args[0]))throw new Error('Usage: node scripts/source-runtime.js build|verify (requires Docker with Linux containers; both run real acceptance)');
const project=resolve('.'),root=resolve(process.env.DATA_DIR||'data','source-lane');
const tools=await treeManifest(resolve(project,'runtime'));
const dependenciesHash=digest(Buffer.concat([await readFile(resolve(project,'package.json')),await readFile(resolve(project,'package-lock.json'))]));
await mkdir(resolve(project,'outputs/runtime-build'),{recursive:true});const context=await mkdtemp(resolve(project,'outputs/runtime-build/build-'));
await copyFile(resolve(project,'package.json'),resolve(context,'package.json'));await copyFile(resolve(project,'package-lock.json'),resolve(context,'package-lock.json'));await cp(resolve(project,'runtime'),resolve(context,'runtime'),{recursive:true});
// This command builds trusted tooling only. Keep bounded Docker diagnostics;
// the account CLI runner deliberately discards stderr and is unsuitable here.
if(args[0]==='build'){
const result=await new Promise((done,reject)=>{
  const child=spawn('docker',['build',...(process.env.DOCKER_BUILDKIT==='0'?[]:['--progress=plain','--load']),'--build-arg','LW_TOOLS_HASH='+tools.sourceHash,'--build-arg','LW_DEPENDENCIES_HASH='+dependenciesHash,'--file','runtime/Dockerfile','--tag','living-world-runtime:local','.'],{cwd:context,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',bytes=0,timedOut=false,overflow=false;
  const timer=setTimeout(()=>{timedOut=true;void stopProcess(child);},1800000);
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){overflow=true;void stopProcess(child);}else{output+=chunk.toString();appendFileSync(resolve(context,'build.log'),chunk);}});
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',async code=>{clearTimeout(timer);try{await writeFile(resolve(context,'build.log'),output);await atomicJson(resolve(context,'build-result.json'),{code,timedOut,overflow,bytes});done({code,timedOut,overflow});}catch(error){reject(error);}});
});
if(result.code!==0||result.timedOut||result.overflow)throw new Error('Trusted runtime image build failed; source releases remain disabled');
}
const inspected=await runProcess('docker',['image','inspect','living-world-runtime:local','--format','{{.Id}}'],{timeoutMs:10000,maxBytes:4096});
const image=inspected.stdout.trim(),runtime=createDockerRuntime({image,toolsHash:tools.sourceHash,dependenciesHash});
if(!(await runtime.verify()).ready)throw new Error('Runtime image verification failed');
const acceptance=await proveRuntime({projectDir:project,directory:resolve(context,'acceptance-drill'),image,toolsHash:tools.sourceHash,dependenciesHash});
await mkdir(root,{recursive:true});await atomicJson(resolve(root,'config.json'),{version:1,image,toolsHash:tools.sourceHash,dependenciesHash,port:3200,automaticSource:true,acceptance});
console.log('Protected runtime image enrolled. Use the authenticated sourceBootstrap operation in the existing owner service to stage and import its world. Model and budget settings were not changed.');
