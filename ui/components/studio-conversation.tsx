"use client";
import { useEffect, useState } from "react";
import { liveExecution } from "@/lib/live-execution";

// Adapted from Vercel AI Elements examples/chatbot.tsx and v0-clone.tsx.
// Their compound component structure and spacing are retained. See ui/references/ai-elements.
import {  ChevronDownIcon, MessageCircleIcon, PlayIcon } from "lucide-react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputActionMenu, PromptInputActionMenuContent, PromptInputActionMenuItem, PromptInputActionMenuTrigger, PromptInputBody,  PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Plan, PlanAction, PlanContent, PlanDescription, PlanHeader, PlanTitle, PlanTrigger } from "@/components/ai-elements/plan";
import { Tool, ToolHeader, ToolContent, ToolOutput } from "@/components/ai-elements/tool";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { ModelPicker, EffortPicker, type AccountModel } from "@/components/model-picker";

type Mode = "ask" | "plan" | "agent";
type RecordMessage = { id:string; speaker:"owner"|"agent"|"system"; body:string; evidence?:Record<string,unknown> };
type ToolReceipt = {id:string;name:string;detail:string;stage:string;state:"running"|"completed"|"failed";source?:string;reportedType?:string;startedAt:number;updatedAt:number;exitCode?:number};
export type Execution = {current?:string;lastEventAt?:number;eventCount?:number;stage?:string;tools:ToolReceipt[];messages?:{id:string;text:string;stage:string;createdAt:number}[];workingNote?:{text:string;stage:string;updatedAt:number;source:string}};
type Activity = { active?:boolean; state?:string; phase?:string; model?:string; effort?:string; runId?:string; elapsedSeconds?:number|null; title?:string; current?:string; detail?:string; intent?:string; next?:string; complete?:string; execution?:Execution|null };
type Narrative = { intent?:string; current?:string; next?:string; complete?:string };

function ExecutionTimeline({execution,finished=false}:{execution?:Execution|null;finished?:boolean}){
  const events=[...(execution?.messages||[]).map(message=>({kind:"message" as const,at:message.createdAt,id:message.id,message})),...(execution?.tools||[]).map(tool=>({kind:"tool" as const,at:tool.startedAt,id:tool.id,tool}))].sort((a,b)=>a.at-b.at);
  const groups:({kind:"tools";id:string;tools:ToolReceipt[]}|Extract<typeof events[number],{kind:"message"}>)[]=[];
  for(const event of events){if(event.kind==="message")groups.push(event);else{const last=groups.at(-1);if(last?.kind==="tools")last.tools.push(event.tool);else groups.push({kind:"tools",id:event.id,tools:[event.tool]});}}
  return <div className="space-y-4">{groups.map(event=>event.kind==="message"?<div key={event.id} className="space-y-2"><span className="text-xs text-muted-foreground">Agent update · {event.message.stage}</span><MessageResponse>{event.message.text}</MessageResponse></div>:<details key={event.id} className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer text-muted-foreground">{event.tools.length} tool {event.tools.length===1?"call":"calls"}{event.tools.some(tool=>tool.state==="running")&&!finished?" · working":""} · View details</summary><div className="mt-3 space-y-2"><ToolCalls finished={finished} execution={{tools:event.tools}}/></div></details>)}</div>;
}

const copy = {
  ask:{label:"Ask",placeholder:"Ask about the world, the Lab, or a result…",detail:"Ask the connected agent about the project. Uses your saved model and limits; no source release."},
  plan:{label:"Plan",placeholder:"Describe the outcome and constraints…",detail:"Stored as planning context. No source task is started."},
  agent:{label:"Agent",placeholder:"What would you like to build?",detail:"Queues isolated work when your configured developer account is ready."}
};

export function ToolCalls({execution,finished=false}:{execution?:Execution|null;finished?:boolean}) {
  return <>{execution?.tools.map(tool=><Tool key={tool.id} defaultOpen={false}><ToolHeader type="dynamic-tool" toolName={tool.name} title={`${tool.name}${tool.source==="codex_cli"&&tool.detail.startsWith("Executable: ")?` · ${tool.detail.slice(12)}`:""}`} state={tool.state==="running"?(finished?"input-streaming":"input-available"):tool.state==="failed"?"output-error":"output-available"}/><ToolContent><p className="text-sm">{!tool.source&&tool.detail.startsWith("Executable: ")?"Legacy executable label cannot be verified: the original command was not retained.":tool.detail}</p><p className="text-muted-foreground text-xs">Stored CLI receipt: {tool.id}. Raw tool arguments and output were not recorded.</p><ToolOutput output={{reportedState:tool.state,exitCode:tool.exitCode??null,lastObservedAt:new Date(tool.updatedAt).toISOString()}} errorText={undefined}/>{finished&&tool.state==="running"&&<p className="text-sm">This attempt ended without a completion receipt for this tool.</p>}<p className="text-muted-foreground text-xs">{tool.stage} · Last receipt {new Date(tool.updatedAt).toLocaleTimeString()}{tool.exitCode!==undefined?` · Exit code ${tool.exitCode}`:""}</p></ToolContent></Tool>)}</>;
}

export function StudioConversation({messages,activity,mode,draft,busy,onModeChange,onDraftChange,onSubmit,onCancel,onResume,resumable,model,effort,models,onModelChange,onEffortChange}:{messages:RecordMessage[];activity?:Activity;mode:Mode;draft:string;busy:boolean;onModeChange:(mode:Mode)=>void;onDraftChange:(text:string)=>void;onSubmit:(message:{text:string})=>Promise<void>;onCancel:()=>void;onResume:()=>void;resumable?:boolean;model?:string;effort?:string;models?:AccountModel[];onModelChange:(value:string)=>void;onEffortChange:(value:string)=>void}) {
  const hasConversation = messages.some(message=>message.speaker !== "system");
  const [now,setNow]=useState(0);
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const live=liveExecution(activity?.execution,now);
  const eventAge=live.age,quiet=live.quiet;
  return (
    <div className="relative flex size-full min-h-0 min-w-0 flex-col divide-y overflow-hidden">
      <Conversation className="min-h-0">
        <ConversationContent className="min-w-0 [overflow-wrap:anywhere]">
          {!hasConversation && <div className="mt-8 text-center font-semibold"><p className="mt-4 text-3xl">What can we build together?</p></div>}
          {messages.map(message=>{
            const narrative = message.evidence?.presentation as Narrative|undefined;
            const isPlan = message.speaker === "owner" && message.evidence?.interaction === "plan";
            return <Message from={message.speaker==="owner"?"user":"assistant"} key={message.id}>
              {message.speaker==="system" && <span className="text-xs text-muted-foreground">World host</span>}
              {isPlan ? <Plan defaultOpen><PlanHeader><div><PlanTitle>Owner plan</PlanTitle><PlanDescription>Retained planning context</PlanDescription></div><PlanAction><PlanTrigger/></PlanAction></PlanHeader><PlanContent><MessageResponse>{message.body}</MessageResponse></PlanContent></Plan> : <MessageContent><MessageResponse>{message.body}</MessageResponse></MessageContent>}
              {narrative?.current&&<p className="text-muted-foreground text-sm">{narrative.current}</p>}
              {narrative?.intent&&<p className="text-sm">{narrative.intent}</p>}
              {narrative?.next&&<p className="text-sm"><span className="text-muted-foreground">Next: </span>{narrative.next}</p>}
              <ExecutionTimeline finished execution={message.evidence?.execution?{...(message.evidence.execution as Execution),messages:(message.evidence.execution as Execution).messages?.filter(update=>update.text.trim()!==message.body.trim())}:undefined}/>
            </Message>;
          })}
          {activity?.active&&<Message from="assistant"><MessageContent><p className="font-medium">{activity.title}</p>{activity.detail&&<p className="text-sm text-muted-foreground">{activity.detail}</p>}<p>{activity.current}</p>{activity.next&&<p className="text-sm">Next: {activity.next}</p>}</MessageContent><ExecutionTimeline execution={activity.execution}/></Message>}
        </ConversationContent>
        <ConversationScrollButton/>
      </Conversation>
      <div className="grid shrink-0 gap-4 pt-4">
        <div className="space-y-2 px-4" role="status" aria-live="polite">
          {activity?.active?<><div aria-live="polite" aria-atomic="true">{quiet?<p className="text-muted-foreground text-sm">Working · waiting for a fresh working note</p>:<Shimmer>{live.text}</Shimmer>}</div><p className="text-muted-foreground text-xs">{activity.elapsedSeconds??0}s elapsed · {eventAge!==null?`Last update ${eventAge}s ago`:"No working note yet"}</p>{quiet&&eventAge!==null&&<p className="text-muted-foreground text-xs">Last working note: {live.text}</p>}</>:<p className="text-muted-foreground text-sm">{activity?.current||"No developer task is running."}</p>}
        </div>
        {!hasConversation && <Suggestions className="px-4"><Suggestion onClick={onDraftChange} suggestion="Review the current World Lab."/><Suggestion onClick={onDraftChange} suggestion="Plan a visual improvement."/><Suggestion onClick={onDraftChange} suggestion="Inspect the latest developer result."/></Suggestions>}
        <div className="w-full px-4 pb-4">
          <PromptInput maxFiles={0} onSubmit={onSubmit}>
            <PromptInputBody><PromptInputTextarea aria-label="Studio message" disabled={busy} onChange={event=>onDraftChange(event.target.value)} placeholder={copy[mode].placeholder} value={draft}/></PromptInputBody>
            <PromptInputFooter className="flex-wrap gap-2">
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger aria-label="Choose Studio mode"><MessageCircleIcon className="size-4"/><span>{copy[mode].label}</span><ChevronDownIcon className="size-3"/></PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent>{(["ask","plan","agent"] as Mode[]).map(item=><PromptInputActionMenuItem key={item} onSelect={()=>onModeChange(item)}>{copy[item].label}</PromptInputActionMenuItem>)}</PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <ModelPicker value={model||"auto"} models={models} onChange={onModelChange} disabled={busy} compact runningModel={activity?.active?activity.model:undefined}/>
                <EffortPicker value={effort||"auto"} onChange={onEffortChange} disabled={busy} compact runningEffort={activity?.active?activity.effort:undefined}/>
              </PromptInputTools>
              <div className="flex items-center gap-2">{resumable&&!activity?.active&&<Button type="button" disabled={busy} onClick={onResume} size="sm" variant="outline" title="Start a fresh continuation with retained source and new checks"><PlayIcon className="size-4"/>Resume</Button>}{activity?.active&&draft.trim().length>=2&&<Button type="button" disabled={busy} onClick={onCancel} size="sm" variant="outline">Stop</Button>}<PromptInputSubmit disabled={busy||(!activity?.active&&draft.trim().length<2)} status={busy?"submitted":activity?.active&&draft.trim().length<2?"streaming":"ready"} onStop={onCancel} aria-label={activity?.active&&draft.trim().length<2?"Stop run":activity?.active?"Send follow-up":"Send message"}/></div>
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-xs text-muted-foreground">{copy[mode].detail}</p>
          {resumable&&!activity?.active&&<p className="mt-1 text-xs text-muted-foreground">Resume returns to your suspended task even after questions. It starts a fresh reviewed attempt using retained work and your saved settings. Your draft adds a follow-up.</p>}
          {activity?.active&&<p className="mt-1 text-xs text-muted-foreground">Stop pauses development and automatic work. You can still Ask questions, then Resume the suspended task. New messages queue follow-up work.</p>}
        </div>
      </div>
    </div>
  );
}


