import {randomUUID} from 'node:crypto';
import {runProcess} from './codex-process.js';
export const packageSpec=value=>typeof value==='string'&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value);
export const packageName=value=>typeof value==='string'&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
// Registry downloads run separately from candidate code, with lifecycle scripts
// disabled. Only a private Docker volume crosses into the offline check worker.
export function developmentPackages({image,signal,runner=runProcess}){
  const volume='lw-devtools-'+randomUUID();let created=false,ready=false;const installed=new Map();
  const call=(args,options={})=>runner('docker',args,{timeoutMs:120000,maxBytes:32000,signal,...options});
  return {get volume(){return created?volume:null;},get profile(){return [...installed.values()];},get ready(){return ready;},
    async change({add=[],remove=[]}){
      if(!Array.isArray(add)||!Array.isArray(remove)||add.length+remove.length>8||!add.every(packageSpec)||!remove.every(packageName))throw Error('Use at most eight registry packages with exact versions; no paths, URLs or lifecycle scripts');
      const next=new Map(installed);for(const name of remove)next.delete(name);for(const spec of add)next.set(spec.slice(0,spec.lastIndexOf('@')),spec);
      if(next.size>16)throw Error('Development tool profile limit reached');
      ready=false;installed.clear();for(const [name,spec] of next)installed.set(name,spec);
      if(!created){const result=await call(['volume','create',volume]);if(result.code!==0)throw Error('Cannot create private tool profile');created=true;}
      const name='lw-provision-'+randomUUID();
      const script=`const fs=require('node:fs'),{spawn}=require('node:child_process');fs.chmodSync('/extra',0o777);process.setgroups([]);const c=spawn('/usr/local/bin/npm',['install','--ignore-scripts','--save-exact','--no-audit','--no-fund','--prefix','/extra',...JSON.parse(process.argv[1])],{uid:10002,gid:10002,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',NPM_CONFIG_CACHE:'/tmp/npm-cache',NPM_CONFIG_REGISTRY:'https://registry.npmjs.org'},stdio:['ignore','pipe','pipe']});c.stdout.pipe(process.stdout);c.stderr.pipe(process.stdout);c.on('error',()=>process.exit(1));c.on('exit',code=>process.exit(code??1));`;
      try{
        // Recreate the manifest/modules each time so removed transitive tools
        // cannot linger. This command executes no candidate code or scripts.
        const reset=await call(['run','--rm','--user','10002:10002','--network','none','--read-only','--cap-drop','ALL','--mount',`type=volume,source=${volume},target=/extra`,image,'node','-e',"const fs=require('node:fs');for(const p of fs.readdirSync('/extra'))fs.rmSync('/extra/'+p,{recursive:true,force:true});"]);if(reset.code!==0)throw Error('Cannot reset private tool profile');
        if(installed.size){
          const result=await call(['run','--rm','--name',name,'--read-only','--cap-drop','ALL','--cap-add','SETUID','--cap-add','SETGID','--security-opt','no-new-privileges','--pids-limit','128','--memory','2g','--cpus','2','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777','--mount',`type=volume,source=${volume},target=/extra`,image,'node','-e',script,JSON.stringify([...installed.values()])]);if(result.code!==0||result.timedOut||result.cancelled||result.overflow)throw Error('Registry tool installation failed: '+result.stdout.slice(-2000));
        }
        ready=true;return {passed:true,installed:[...installed.values()],scope:'Development tools only; production dependency-image promotion remains independently gated'};
      }finally{await runner('docker',['rm','--force',name],{timeoutMs:10000,maxBytes:2000});}
    },
    async close(){if(created){const result=await runner('docker',['volume','rm',volume],{timeoutMs:10000,maxBytes:2000});if(result.code!==0)throw Error('Private development tool profile cleanup failed');created=false;}}
  };
}
