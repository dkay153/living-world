type Execution = {
  stage?: string;
  tools?: {name:string;detail:string;stage:string;state:string;updatedAt:number}[];
  messages?: {text:string;stage:string;createdAt:number}[];
  workingNote?: {text:string;stage:string;updatedAt:number;source:string};
};

// Show the agent's public explanation of its work, not its tool traffic.
// Polls and tool activity cannot refresh an older narrative.
export function liveExecution(execution:Execution|null|undefined, now:number) {
  const stage=execution?.stage;
  const note=execution?.workingNote;
  const current=note?.source==='provider_summary'&&(!stage||note.stage===stage)?note:null;
  const at=current?.updatedAt;
  const age=at===undefined?null:Math.max(0,Math.floor((now-at)/1000));
  const quiet=age===null||age>=45;
  const compact=current?.text.replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
  const text=compact?compact.slice(-220):'Working…';
  return {text,age,quiet,at:at??null};
}
