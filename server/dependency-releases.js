import {mkdir,readFile,writeFile,cp,rename,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest,treeManifest,atomicJson} from './release-artifacts.js';
import {runProcess} from './codex-process.js';
import {createDockerRuntime} from './release-runtime.js';
import {packageSpec,packageName} from './development-packages.js';

const registry='https://registry.npmjs.org/';
const exact=/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
export function validateProductionDependencies(original,manifest,lock){
  for(const key of new Set([...Object.keys(original),...Object.keys(manifest)])){
    if(!['dependencies','devDependencies'].includes(key)&&JSON.stringify(original[key])!==JSON.stringify(manifest[key]))throw Error('Dependency releases may only change dependency declarations: '+key);
  }
  for(const section of ['dependencies','devDependencies'])for(const [name,version] of Object.entries(manifest[section]||{})){
    if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)||typeof version!=='string'||version!==original[section]?.[name]&&!exact.test(version))throw Error('Changed production dependencies require exact registry versions');
  }
  if(lock.lockfileVersion!==3||!lock.packages||Object.keys(lock.packages).length>4000)throw Error('A bounded npm v3 lockfile is required');
  for(const section of ['dependencies','devDependencies'])if(JSON.stringify(lock.packages['']?.[section]||{})!==JSON.stringify(manifest[section]||{}))throw Error('Lockfile root does not match manifest');
  for(const [path,entry] of Object.entries(lock.packages)){
    if(path==='')continue;
    if(!/^node_modules\/(?:[^/]+\/)*[^/]+$/.test(path)||path.split('/').some(p=>p==='..'||p==='.')||path.includes('\\'))throw Error('Invalid dependency path');
    if(entry.inBundle===true){
      const at=path.lastIndexOf('/node_modules/'),parent=lock.packages[path.slice(0,at)],name=path.slice(at+14);
      if(at<0||!parent?.bundleDependencies?.includes(name)||!String(parent.resolved||'').startsWith(registry)||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(parent.integrity||'')||entry.resolved||entry.link||!exact.test(entry.version||''))throw Error('Bundled package lacks an integrity-locked registry parent');
      continue;
    }
    if(!/^node_modules\/(?:[^/]+\/)*[^/]+$/.test(path)||path.split('/').some(p=>p==='..'||p==='.')||path.includes('\\')||entry.link||!exact.test(entry.version||'')||!String(entry.resolved||'').startsWith(registry)||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity||''))throw Error('Only integrity-locked npm registry packages are deployable');
    const url=new URL(entry.resolved);if(url.origin!=='https://registry.npmjs.org'||url.username||url.password||url.search||url.hash)throw Error('Invalid registry package URL');
  }
  return true;
}

// Only DATA from the candidate enters this build. The Dockerfile/controller
// come from this fixed host, never from candidate scripts or runtime files.
export async function buildDependencyRuntime({source,projectDir,directory,config,signal,runner=runProcess}){
  const packageBytes=await readFile(resolve(source,'package.json')),lockBytes=await readFile(resolve(source,'package-lock.json'));
  validateProductionDependencies(JSON.parse(await readFile(resolve(projectDir,'package.json'),'utf8')),JSON.parse(packageBytes),JSON.parse(lockBytes));
  const dependenciesHash=digest(Buffer.concat([packageBytes,lockBytes]));
  const context=resolve(directory,'dependencies-'+randomUUID());await mkdir(context,{recursive:true});
  await writeFile(resolve(context,'package.json'),packageBytes);await writeFile(resolve(context,'package-lock.json'),lockBytes);
  await cp(resolve(projectDir,'runtime'),resolve(context,'runtime'),{recursive:true});
  let controller=await readFile(resolve(context,'runtime/controller.mjs'),'utf8');
  // Root controller and observer retain their original ws/Playwright. Only
  // game/build/test dependencies are replaced. No candidate module runs root.
  controller=controller.replaceAll("readdir('/opt/lw-deps/node_modules')","readdir('/opt/lw-app-deps/node_modules')")
    .replaceAll("cp('/opt/lw-deps/node_modules/ws'","cp('/opt/lw-app-deps/node_modules/ws'")
    .replaceAll("symlink('/opt/lw-deps/node_modules/'","symlink('/opt/lw-app-deps/node_modules/'")
    .replaceAll("['/opt/lw-deps/node_modules/next/","['/opt/lw-app-deps/node_modules/next/")
    .replaceAll("symlink('/opt/lw-deps/node_modules'","symlink('/opt/lw-app-deps/node_modules'");
  await writeFile(resolve(context,'runtime/controller.mjs'),controller);
  const operatorKernel=resolve(context,'operator-kernel');await cp(resolve(projectDir,'operator-kernel'),operatorKernel,{recursive:true});
  const parentKernelHash=(await treeManifest(resolve(projectDir,'operator-kernel'))).sourceHash;
  await writeFile(resolve(operatorKernel,'controller.mjs'),(await readFile(resolve(operatorKernel,'controller.mjs'),'utf8')).replace("symlink('/opt/lw-deps/node_modules'","symlink('/opt/lw-app-deps/node_modules'"));
  const operatorKernelHash=(await treeManifest(operatorKernel)).sourceHash;
  const toolsHash=(await treeManifest(resolve(context,'runtime'))).sourceHash;
  if(!/^sha256:[a-f0-9]{64}$/.test(config.image))throw Error('A pinned parent image is required');
  const cachedPath=resolve(directory,'cache-'+digest(JSON.stringify({recipe:4,parent:config.image,toolsHash,dependenciesHash,operatorKernelHash}))+'.json');
  try{const cached=JSON.parse(await readFile(cachedPath,'utf8'));if(cached.parentImage===config.image&&cached.parentToolsHash===config.toolsHash&&cached.toolsHash===toolsHash&&cached.dependenciesHash===dependenciesHash&&(await createDockerRuntime({...cached,runner}).verify()).ready)return cached;}catch(error){if(error.code!=='ENOENT'&&error instanceof SyntaxError)throw error;}
  // Provision in a cgroup-limited container, never an unrestricted build RUN.
  // Only registry metadata crosses in; npm lifecycle scripts remain disabled.
  const name='lw-dependencies-'+randomUUID();
  const call=(args,options={})=>runner('docker',args,{timeoutMs:30000,maxBytes:64000,signal,dockerDiagnostics:true,...options});
  const checked=async(args,options)=>{const r=await call(args,options);if(r.code!==0||r.timedOut||r.cancelled||r.overflow){await atomicJson(resolve(context,'failure.json'),{args:args.slice(0,4),...r,stdout:r.stdout.slice(-12000)});throw Error('Contained dependency provisioning failed');}return r;};
  let image;
  try{
    await checked(['run','--detach','--name',name,'--user','10002:10002','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','4g','--cpus','2','--tmpfs','/tmp:rw,nosuid,nodev,size=512m,mode=1777','--tmpfs','/install:rw,nosuid,nodev,size=2g,mode=1777','--mount',`type=bind,source=${resolve(context,'runtime')},target=/assembly-runtime,readonly`,'--env','HOME=/tmp','--env','NPM_CONFIG_CACHE=/tmp/npm-cache',config.image,'node','-e','setInterval(()=>{},1000)']);
    const writer="const fs=require('node:fs');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const p=JSON.parse(input);fs.mkdirSync('/install/app');for(const n of ['package.json','package-lock.json'])fs.writeFileSync('/install/app/'+n,Buffer.from(p[n],'base64'));});";
    await checked(['exec','--interactive','--user','10002:10002',name,'node','-e',writer],{input:JSON.stringify({'package.json':packageBytes.toString('base64'),'package-lock.json':lockBytes.toString('base64')})});
    await checked(['exec','--user','10002:10002','--workdir','/install/app',name,'node','--max-old-space-size=1024','/usr/local/lib/node_modules/npm/bin/npm-cli.js','ci','--ignore-scripts','--no-audit','--no-fund','--maxsockets=4','--registry=https://registry.npmjs.org'],{timeoutMs:600000,maxBytes:1024*1024});
    const freeze="const fs=require('node:fs/promises');(async()=>{await fs.cp('/install/app','/opt/lw-app-deps',{recursive:true,dereference:false});async function lock(p){const i=await fs.lstat(p);if(i.isSymbolicLink())return;if(i.isDirectory()){for(const e of await fs.readdir(p))await lock(p+'/'+e);await fs.chmod(p,0o555);}else await fs.chmod(p,(i.mode&0o111)?0o555:0o444);}await lock('/opt/lw-app-deps');async function writable(p){const i=await fs.lstat(p);if(i.isSymbolicLink())return;if(i.isDirectory()){await fs.chmod(p,0o755);for(const e of await fs.readdir(p))await writable(p+'/'+e);}else await fs.chmod(p,0o644);}await writable('/opt/lw-tools');await fs.rm('/opt/lw-tools',{recursive:true,force:true});await fs.cp('/assembly-runtime','/opt/lw-tools',{recursive:true,dereference:false});await lock('/opt/lw-tools');})().catch(e=>{console.error(e.message);process.exitCode=1;});";
    await checked(['exec','--user','0:0',name,'node','-e',freeze],{timeoutMs:120000});
    const committed=await checked(['commit','--change','USER 0:0','--change','LABEL io.living-world.tools-hash='+toolsHash,'--change','LABEL io.living-world.dependencies-hash='+dependenciesHash,name],{timeoutMs:180000});
    image=committed.stdout.trim();if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Invalid dependency image identity');
    await writeFile(resolve(context,'image.id'),image);

  }finally{
    // Cleanup uses a new signal so cancellation cannot leave a networked worker.
    await runner('docker',['rm','--force',name],{timeoutMs:15000,maxBytes:4096});
    const observations=[];let confirmed=false;const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      const absent=await runner('docker',['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'],{timeoutMs:15000,maxBytes:4096});
      observations.push({code:absent.code,names:absent.stdout.trim().slice(0,200)});
      if(absent.code===0&&!absent.timedOut&&!absent.overflow&&!absent.stdout.trim()){confirmed=true;break;}
      if(observations.slice(-3).length===3&&observations.slice(-3).every(o=>o.code!==0))break;
      await new Promise(done=>setTimeout(done,1000));
    }
    await atomicJson(resolve(context,'cleanup.json'),{name,confirmed,observations});
    if(!confirmed)throw Error('Dependency provisioner cleanup is unconfirmed');
  }
  const result={version:1,image,toolsHash,dependenciesHash,parentImage:config.image,parentToolsHash:config.toolsHash,operatorKernel,operatorKernelHash,parentKernelHash};
  if(!(await createDockerRuntime({...result,runner}).verify()).ready)throw Error('Built dependency image verification failed');
  await atomicJson(resolve(context,'runtime.json'),result);await atomicJson(cachedPath,result);return result;
}

export async function prepareProductionDependencies({candidate,projectDir,config,add=[],remove=[],signal,runner=runProcess}){
  if(!Array.isArray(add)||!Array.isArray(remove)||add.length+remove.length<1||add.length+remove.length>8||!add.every(packageSpec)||!remove.every(packageName))throw Error('Choose 1-8 exact registry dependency additions/removals');
  const names=['package.json','package-lock.json'];
  async function capture(){const out={};for(const name of names){const path=resolve(candidate,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>2*1024*1024||await realpath(path)!==path)throw Error('Dependency input must be a bounded plain file');out[name]=await readFile(path);}return out;}
  const before=await capture(),original=JSON.parse(await readFile(resolve(projectDir,'package.json'),'utf8'));
  validateProductionDependencies(original,JSON.parse(before[names[0]]),JSON.parse(before[names[1]]));
  const script=`const fs=require('node:fs'),cp=require('node:child_process');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const p=JSON.parse(input);fs.mkdirSync('/tmp/meta');for(const n of ['package.json','package-lock.json'])fs.writeFileSync('/tmp/meta/'+n,Buffer.from(p.files[n],'base64'));for(const [verb,specs]of [['uninstall',p.remove],['install',p.add]]){if(!specs.length)continue;const r=cp.spawnSync('npm',[verb,...specs,'--save-exact','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],{cwd:'/tmp/meta',env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',NPM_CONFIG_CACHE:'/tmp/npm-cache'},encoding:'utf8',maxBuffer:1048576});if(r.status!==0){console.log('Registry lock generation failed');process.exit(1);}}console.log(JSON.stringify(Object.fromEntries(['package.json','package-lock.json'].map(n=>[n,fs.readFileSync('/tmp/meta/'+n,'base64')]))));});`;
  const name='lw-lock-'+randomUUID();let result;
  try{result=await runner('docker',['run','--rm','--name',name,'--interactive','--read-only','--user','10002:10002','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g','--cpus','2','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777',config.image,'node','-e',script],{timeoutMs:120000,maxBytes:4*1024*1024,signal,input:JSON.stringify({files:Object.fromEntries(names.map(n=>[n,before[n].toString('base64')])),add,remove}),dockerDiagnostics:true});}
  finally{
    await runner('docker',['rm','--force',name],{timeoutMs:15000,maxBytes:4096});let absent=false;const deadline=Date.now()+30000;
    while(Date.now()<deadline){const checked=await runner('docker',['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'],{timeoutMs:10000,maxBytes:4096});if(checked.code===0&&!checked.timedOut&&!checked.stdout.trim()){absent=true;break;}await new Promise(done=>setTimeout(done,1000));}
    if(!absent)throw Error('Dependency metadata worker cleanup unconfirmed');
  }
  if(result.code!==0||result.cancelled||result.timedOut||result.overflow)throw Error('Registry lock generation did not complete');
  const raw=JSON.parse(result.stdout),after=Object.fromEntries(names.map(n=>[n,Buffer.from(raw[n],'base64')]));
  validateProductionDependencies(original,JSON.parse(after[names[0]]),JSON.parse(after[names[1]]));
  const current=await capture();if(names.some(n=>digest(before[n])!==digest(current[n])))throw Error('Dependency declarations changed during registry preparation; retry from current data');
  for(const name of names){const path=resolve(candidate,name),temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,after[name],{flag:'wx'});await rename(temp,path);}
  return {passed:true,add,remove,dependenciesHash:digest(Buffer.concat(names.map(n=>after[n]))),scope:'Candidate package/lock data only; no live installation or release authority'};
}
