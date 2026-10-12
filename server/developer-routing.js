const validEfforts=new Set(['low','medium','high']);
const rank=model=>{const id=model.id.toLowerCase();if(id.includes('astra'))return 600;if(id.includes('sol'))return 500;if(id.includes('terra'))return 400;if(id.includes('luna'))return 300;return 100;};
const demanding=/\b(migration|database|persist|auth|security|deploy|release|architecture|refactor|performance|recovery|compatib|multiplayer|protocol|audit|research|investigat)\b/i;
const routine=/\b(copy|label|wording|small|tiny|single color|rename)\b/i;

export const isRoutingModel=value=>value==='auto'||(typeof value==='string'&&/^[-a-zA-Z0-9_.:]{1,120}$/.test(value));
export const isRoutingEffort=value=>value==='auto'||validEfforts.has(value);

// The account catalog is authoritative. Automatic routing selects the
// strongest available model, then spends only the reasoning effort the task needs.
export function chooseDeveloperRoute({task='',models=[],model='auto',effort='auto'}={}){
  const candidates=models.filter(item=>item&&typeof item.id==='string'&&/^[-a-zA-Z0-9_.:]{1,120}$/.test(item.id));
  const selected=model==='auto'?[...candidates].sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id))[0]:candidates.find(item=>item.id===model);
  if(!selected)return null;
  const selectedEffort=effort==='auto'?(demanding.test(task)?'high':routine.test(task)?'low':'medium'):effort;
  return {model:selected.id,effort:selectedEffort,reason:model==='auto'?'automatic account-catalog routing':'saved model override'};
}
