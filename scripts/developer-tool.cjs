// Transport only. The independent broker validates every request and executes
// candidate code exclusively in Docker. This helper confers no authority.
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
(async()=>{
  const root=path.basename(__dirname)==='.scratch'?__dirname:path.resolve('.scratch'),workspace=path.dirname(root);
  const argument=process.argv[2]||'{"action":"prepare"}';let input=JSON.parse(argument.startsWith('@')?await fs.readFile(path.resolve(workspace,argument.slice(1)),'utf8'):argument);const id=randomUUID();
  if(input.action==='command'&&Array.isArray(input.argv))input={...input,argv:['/bin/sh','-c','exec "$@" 2>&1','lw-tool',...input.argv]};
  const requests=path.join(root,'tool-requests'),responses=path.join(root,'tool-results');await fs.mkdir(requests,{recursive:true});
  const temp=path.join(requests,id+'.tmp');await fs.writeFile(temp,JSON.stringify(input));await fs.rename(temp,path.join(requests,id+'.json'));
  const deadline=Date.now()+1200000;
  while(Date.now()<deadline){try{const result=JSON.parse(await fs.readFile(path.join(responses,id+'.json'),'utf8'));console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;return;}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(done=>setTimeout(done,250));}
  throw Error('Development tool response timed out; do not claim this check passed');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
