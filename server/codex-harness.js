import {createRpc,classifyCodexError} from './codex-process.js';
import {atomicJson} from './release-artifacts.js';

// Adapter only: Codex owns tools, skills and turn lifecycle. This layer retains
// public events and maps them to the existing Studio receipt format. It never
// grants permission in response to a model request.
export function harnessEvent(method,params){
  // Only the provider's readable summary stream is public. Raw reasoning
  // text/content is deliberately never mapped into Studio.
  if(method==='item/reasoning/summaryTextDelta')return {type:'summary.delta',itemId:params.itemId,index:params.summaryIndex,delta:params.delta};
  if(method==='item/reasoning/summaryPartAdded')return {type:'summary.part',itemId:params.itemId,index:params.summaryIndex};
  if(method==='item/started'||method==='item/completed'){
    const raw=params.item||{},types={agentMessage:'agent_message',commandExecution:'command_execution',fileChange:'file_change',mcpToolCall:'mcp_tool_call',webSearch:'web_search',imageView:'image_view'};
    const type=types[raw.type];if(!type||raw.type==='agentMessage'&&raw.phase==='analysis')return null;
    return {type:method.replace('/','.'),item:{id:raw.id,type,text:type==='agent_message'?raw.text:undefined,channel:raw.phase,command:raw.command,changes:raw.changes,server:raw.server,tool:raw.tool,status:raw.status,exit_code:raw.exitCode,error:raw.error}};
  }
  if(method==='turn/started')return {type:'turn.started'};
  if(method==='turn/completed')return {type:params.turn?.status==='completed'?'turn.completed':'turn.failed',error:params.turn?.status==='completed'?undefined:{message:'Codex turn '+params.turn?.status}};
  return null;
}
export async function runCodexHarness(binary,args,{cwd,env,input,onLine=()=>{},signal,timeoutMs=30000,harness={},rpcFactory=createRpc}={}){
  const value=flag=>args[args.indexOf(flag)+1];
  const model=value('-m'),effort=args.find(s=>s.startsWith('model_reasoning_effort='))?.split('=')[1];
  if(!model||!effort||!env?.CODEX_HOME)throw Error('Harness requires the saved resolved model, effort and project account home');
  let threadId=null,turnId=null,terminal=null,diagnostic=null,timedOut=false,cancelled=false,overflow=false,stdout='',bytes=0,finish;
  const completed=new Promise(done=>finish=done),state={version:1,cwd,model,effort,threadId:null,turnId:null,status:'starting'};
  let persistence=Promise.resolve();
  const persist=()=>{if(harness.stateFile){const copy=structuredClone(state);persistence=persistence.then(()=>atomicJson(harness.stateFile,copy));}};
  const emit=event=>{const line=JSON.stringify({...event,harness:true});bytes+=Buffer.byteLength(line);if(bytes>2*1024*1024){overflow=true;void interrupt();return;}stdout+=line+'\n';onLine(line);};
  const rpc=rpcFactory({home:env.CODEX_HOME,cwd,binary,environment:env,onClose(){if(!terminal)diagnostic='harness_transport_closed';finish();},onNotification(method,params){
    if(params.threadId&&threadId&&params.threadId!==threadId)return;
    if(method==='turn/started'){turnId=params.turn?.id||turnId;state.turnId=turnId;state.status='running';persist();}
    const event=harnessEvent(method,params);if(event)emit(event);
    if(method==='turn/completed'){terminal=params.turn?.status;diagnostic=classifyCodexError(JSON.stringify(params.turn?.error||''));state.status=terminal;state.turnId=params.turn?.id||turnId;persist();finish();}
  }});
  let interrupting=null;
  async function interrupt(){
    if(interrupting)return interrupting;
    interrupting=(async()=>{if(threadId&&turnId&&!terminal){await rpc.request('turn/interrupt',{threadId,turnId}).catch(()=>{});await Promise.race([completed,new Promise(done=>setTimeout(done,3000))]);}finish();})();return interrupting;
  }
  const cancel=()=>{cancelled=true;void interrupt();};signal?.addEventListener('abort',cancel,{once:true});
  const timer=timeoutMs===null?null:setTimeout(()=>{timedOut=true;void interrupt();},timeoutMs);timer?.unref?.();
  try{
    if(signal?.aborted){cancelled=true;return {code:1,stdout,timedOut,cancelled,overflow};}
    const settings={cwd,model,modelProvider:'openai',approvalPolicy:'never',config:{web_search:'live',model_reasoning_effort:effort,default_permissions:'living-world'}};
    // Fork only a host-recorded terminal thread, into the fresh sandbox. A fork
    // preserves conversation, never old source, leases, checks or authority.
    const prior=harness.previous;
    const result=prior?.threadId&&['completed','interrupted','failed'].includes(prior.status)
      ?await rpc.request('thread/fork',{...settings,threadId:prior.threadId,excludeTurns:true,ephemeral:false})
      :await rpc.request('thread/start',{...settings,ephemeral:false});
    threadId=result.thread?.id;if(!threadId)throw Error('Harness returned no thread');
    state.threadId=threadId;persist();emit({type:'thread.started',thread_id:threadId});
    const skills=await rpc.request('skills/list',{cwds:[cwd],forceReload:true});
    emit({type:'harness.skills',count:(skills.data||[]).reduce((n,row)=>n+(row.skills?.length||0),0)});
    if(signal?.aborted||timedOut)return {code:1,stdout,timedOut,cancelled,overflow};
    const images=[];for(let i=0;i<args.length;i++)if(args[i]==='--image'||args[i]==='-i')images.push({type:'localImage',path:args[++i]});
    const started=await rpc.request('turn/start',{threadId,cwd,model,effort,summary:'concise',approvalPolicy:'never',input:[{type:'text',text:input},...images]});
    turnId=started.turn?.id||turnId;state.turnId=turnId;state.status=terminal||'running';persist();
    if(signal?.aborted||timedOut)await interrupt();else await completed;
    return {code:terminal==='completed'&&!cancelled&&!timedOut&&!overflow?0:1,stdout,timedOut,cancelled,overflow,diagnostic,harness:{threadId,turnId,status:terminal||'uncertain'}};
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
    if(!terminal){state.status='uncertain';persist();}
    await rpc.close();await persistence;
  }
}
