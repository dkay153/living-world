// Kernel-owned worker; candidate module output remains untrusted data.
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const message=JSON.parse(raw);
let result;
if(message.type==='decide'){
  const module=await import('/work/app/operator/index.js');
  result=await module.decide(message.evidence,message.memory);
}else if(message.type==='tool'&&/^[a-z][a-z0-9-]{0,48}$/.test(message.name)){
  const module=await import('/work/app/operator/tools/'+message.name+'.js');
  result=await module.run(message.input);
}else throw new Error('Unknown operator worker request');
process.stdout.write(JSON.stringify(result));
