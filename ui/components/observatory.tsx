"use client";



import { useEffect, useMemo, useState } from "react";

import {

  ActivityIcon,

  ArchiveIcon,

  BotIcon,

  CircleDotIcon,

  CompassIcon,

  DatabaseIcon,

  FileTextIcon,

  FlaskConicalIcon,

  Gamepad2Icon,

  KeyRoundIcon,

  ListTreeIcon,

  MessageCircleIcon,

  PlayIcon,

  RefreshCwIcon,

  RotateCcwIcon,

  ServerCogIcon,

  ShieldCheckIcon,

  SquareIcon,

  WorkflowIcon,

} from "lucide-react";

import { Agent, AgentContent, AgentHeader, AgentInstructions } from "@/components/ai-elements/agent";

import { Checkpoint, CheckpointIcon, CheckpointTrigger } from "@/components/ai-elements/checkpoint";

import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

import { ModelSelector, ModelSelectorContent, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorInput, ModelSelectorItem, ModelSelectorList, ModelSelectorName, ModelSelectorTrigger } from "@/components/ai-elements/model-selector";

import { PromptInput, PromptInputActionMenu, PromptInputActionMenuContent, PromptInputActionMenuItem, PromptInputActionMenuTrigger, PromptInputFooter, PromptInputHeader, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";

import { Plan, PlanContent, PlanDescription, PlanHeader, PlanTitle, PlanTrigger } from "@/components/ai-elements/plan";

import { Queue, QueueItem, QueueItemContent, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "@/components/ai-elements/queue";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";


import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";

import { Shimmer } from "@/components/ai-elements/shimmer";

import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";

import { Terminal } from "@/components/ai-elements/terminal";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TooltipProvider } from "@/components/ui/tooltip";



type StudioMessage={id:string;speaker:"owner"|"agent"|"system";kind:string;body:string;status:string;created_at:number;evidence?:Record<string,unknown>};

type Narrative={title?:string;intent?:string;current?:string;next?:string;complete?:string;refreshSandbox?:boolean;agent?:string};

type Activity={state:string;phase:string;title?:string;intent?:string;current?:string;next?:string;complete?:string;active?:boolean;startedAt?:number;updatedAt?:number;elapsedSeconds?:number|null;detail?:string;agent?:string};

type Studio={ready:boolean;reason:string;activity?:Activity;runs?:{id:string;task?:string;state?:string}[];messages:StudioMessage[]};

type StudioMode="ask"|"plan"|"agent";

type Overview={online:number;schemaVersion:number;uptimeSeconds:number;paused:boolean;worker?:{running?:boolean;queued?:number;failed?:number};ai?:{provider?:string;model?:string|null;dailyBudgetUsd?:number|null;credentialConfigured?:boolean;modelCallsEnabled?:boolean};backups?:{name:string;size:number}[];counts?:Record<string,number>;recentAudit?:{id:number;action:string;details:string;created_at?:number}[];developerActivity?:Activity;capabilities?:Record<string,unknown>};

type Connection={id:string;name:string;family:string;auth:string[];transport:string;status:"available"|"planned"|"configured";description:string;configuration:{endpoint:string;model:string;authMode:string};secretConfigured:boolean;execution:"disabled"};

type Developer={connection?:{connected?:boolean;account?:{email?:string;planType?:string};login?:{url:string;userCode?:string;type:string};loginError?:string};activity?:Activity};

type DocumentSet=Record<"CONSTITUTION"|"BASELINE"|"MEMORY",string>;

type DataPage={table:string;page:number;total:number;pageSize:number;columns:string[];rows:Record<string,unknown>[]};



const DATA_TABLES=["events","players","gameplay","discoveries","environment","item_instances","knowledge","memories","jobs","checkpoints","improvements","developer_runs","developer_lessons","visual_releases","agent_messages","admin_audit"];

async function request(path:string,csrf:string,body?:unknown){

  const response=await fetch(`/api/admin/${path}`,{method:body===undefined?"GET":"POST",headers:body===undefined?undefined:{"Content-Type":"application/json","X-Owner-CSRF":csrf},body:body===undefined?undefined:JSON.stringify(body)});

  const data=await response.json().catch(()=>({error:"The local service returned an incomplete response."}));

  if(!response.ok)throw new Error(data.error||"Request failed");

  return data;

}

const time=(value:number)=>new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

const human=(value?:string)=>!value?"Observing":value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

const author=(message:StudioMessage)=>message.speaker==="owner"?"You":message.speaker==="agent"?"Autonomous developer":"World host";

const narrativeOf=(message:StudioMessage)=>message.evidence?.presentation as Narrative|undefined;

const modeOf=(message:StudioMessage)=>message.evidence?.interaction as StudioMode|undefined;

const MODE_COPY:Record<StudioMode,{label:string;placeholder:string;detail:string;submit:string}>={ask:{label:"Ask",placeholder:"Ask about the Lab, evidence, a trade-off, or a result...",detail:"Retains a question as context. It does not queue source work.",submit:"Send question"},plan:{label:"Plan",placeholder:"Describe the desired outcome, constraints, and what must be protected...",detail:"Retains planning context. It does not queue source work.",submit:"Save plan"},agent:{label:"Agent",placeholder:"Give the autonomous developer one bounded task to inspect, improve, and validate...",detail:"Queues an isolated task only when the configured account and sandbox are ready.",submit:"Start task"}};

const duration=(seconds?:number|null)=>{if(seconds===null||seconds===undefined)return "Just updated";const minutes=Math.floor(seconds/60),remaining=seconds%60;return minutes?`${minutes}m ${String(remaining).padStart(2,"0")}s`:`${remaining}s`;};

function NarrativeDetails({narrative,live=false}:{narrative?:Narrative|Activity;live?:boolean}){

  if(!narrative)return null;

  return <div className="mt-3 grid gap-3 rounded-xl border bg-card/50 p-3 text-sm"><div><p className="text-muted-foreground text-xs">Intent</p><p className="mt-1">{narrative.intent||"Keep this step inspectable and contained."}</p></div><div><p className="text-muted-foreground text-xs">Now</p><p className="mt-1">{narrative.current||narrative.title||"The host is updating this task."}</p></div><div><p className="text-muted-foreground text-xs">Next</p><p className="mt-1">{narrative.next||"The next recorded step will explain the result."}</p></div>{live&&<div><p className="text-muted-foreground text-xs">Completion signal</p><p className="mt-1">{narrative.complete||"The host records a result or a specific blocker."}</p></div>}</div>;

}

const compact=(value?:number)=>value===undefined?"-":new Intl.NumberFormat().format(value);



export function Observatory(){

  const [csrf,setCsrf]=useState("");

  const [studio,setStudio]=useState<Studio|null>(null);

  const [overview,setOverview]=useState<Overview|null>(null);

  const [lab,setLab]=useState<{state?:string;url?:string;visualRevision?:string|null}|null>(null);

  const [labFrameUrl,setLabFrameUrl]=useState("");

  const [developer,setDeveloper]=useState<Developer|null>(null);

  const [connections,setConnections]=useState<Connection[]>([]);

  const [documents,setDocuments]=useState<DocumentSet|null>(null);

  const [data,setData]=useState<DataPage|null>(null);

  const [view,setView]=useState("conversation");

  const [mode,setMode]=useState<StudioMode>("ask");

  const [draft,setDraft]=useState("");

  const [selectedConnection,setSelectedConnection]=useState("openai");

  const [selectedDocument,setSelectedDocument]=useState<keyof DocumentSet>("BASELINE");

  const [selectedTable,setSelectedTable]=useState("events");

  const [error,setError]=useState("");

  const [busy,setBusy]=useState(false);

  const [ticket,setTicket]=useState("");

  const sandboxRefresh=(studio?.messages||[]).some(message=>narrativeOf(message)?.refreshSandbox===true);



  const refresh=async(currentCsrf=csrf)=>{

    try{

      const [nextOverview,nextStudio,nextLab,nextDeveloper,nextConnections]=await Promise.all([

        request("overview",currentCsrf),request("studio",currentCsrf),request("studio/lab",currentCsrf),request("developer",currentCsrf),request("connections",currentCsrf),

      ]);

      setOverview(nextOverview);setStudio(nextStudio);setLab(nextLab);setDeveloper(nextDeveloper);setConnections(nextConnections.connections);setError("");

    }catch(cause){setError(cause instanceof Error?cause.message:"Could not refresh AI Studio.");}

  };

  const inspectData=async(table=selectedTable)=>{if(!csrf)return;setBusy(true);try{setData(await request(`data?table=${encodeURIComponent(table)}`,csrf));}catch(cause){setError(cause instanceof Error?cause.message:"Could not read the selected world records.");}finally{setBusy(false);}};

  const inspectDocuments=async()=>{if(!csrf||documents)return;try{setDocuments(await request("documents",csrf));}catch(cause){setError(cause instanceof Error?cause.message:"Could not read the project documents.");}};



  useEffect(()=>{

    const next=new URLSearchParams(location.hash.slice(1)).get("ticket");

    if(next){setTicket(next);request("login","",{ticket:next}).then(data=>{setCsrf(data.csrf);history.replaceState(null,"",location.pathname);return refresh(data.csrf);}).catch(cause=>setError(cause.message));}

    else request("session","").then(data=>{setCsrf(data.csrf);return refresh(data.csrf);}).catch(()=>setError("Use the one-time local owner link to open AI Studio."));

  },[]);

  useEffect(()=>{if(!csrf)return;const id=window.setInterval(()=>refresh(),5000);return()=>window.clearInterval(id);},[csrf]);

  useEffect(()=>{

    if(!csrf)return;

    const stream=new EventSource("/api/admin/studio/live");

    stream.addEventListener("studio",event=>{try{const live=JSON.parse((event as MessageEvent).data);if(live.studio)setStudio(live.studio);if(live.lab)setLab(live.lab);setError("");}catch{/* The five-second Studio refresh is a safe fallback. */}});

    stream.onerror=()=>{/* Regular refresh remains active when the live channel reconnects. */};

    return()=>stream.close();

  },[csrf]);

  useEffect(()=>{if(view==="data")inspectData();if(view==="charter")inspectDocuments();},[view,selectedTable,csrf]);

  useEffect(()=>{

    if(lab?.state!=="running"||!lab.url){setLabFrameUrl("");return;}

    const next=`${lab.url}/legacy/?studio=1&visual=${encodeURIComponent(lab.visualRevision||"baseline")}&refresh=${sandboxRefresh?"verified":"baseline"}`;

    setLabFrameUrl(current=>current===next?current:next);

  },[lab?.state,lab?.url,lab?.visualRevision,sandboxRefresh]);



  const activity=studio?.activity||overview?.developerActivity||developer?.activity;

  const selected=connections.find(item=>item.id===selectedConnection)||connections[0];

  const developerMessages=studio?.messages||[];

  const evidenceMessages=developerMessages.filter(message=>message.evidence&&Object.keys(message.evidence).length>0);

  const connectionGroups=useMemo(()=>({developer:connections.filter(item=>item.family==="Developer account"),model:connections.filter(item=>item.family!=="Developer account")}),[connections]);



  const send=async(message:{text:string})=>{if(!message.text.trim())return;setBusy(true);try{await request("studio/messages",csrf,{body:message.text,mode});setDraft("");await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Message could not be stored.");}finally{setBusy(false);}};

  const changeLab=async(action:"start"|"reset"|"stop")=>{setBusy(true);try{await request("studio/lab",csrf,{action});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"World Lab could not change state.");}finally{setBusy(false);}};

  const saveConnection=async(form:FormData)=>{if(!selected)return;setBusy(true);try{await request(`connections/${selected.id}`,csrf,{endpoint:String(form.get("endpoint")||""),model:String(form.get("model")||""),authMode:String(form.get("authMode")||""),apiKey:String(form.get("apiKey")||"")});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Connection could not be saved.");}finally{setBusy(false);}};

  const codexLogin=async(type:"chatgpt"|"chatgptDeviceCode")=>{setBusy(true);try{await request("developer/login",csrf,{type});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Codex sign-in could not begin.");}finally{setBusy(false);}};

  const operate=async(path:string,body:Record<string,unknown>)=>{setBusy(true);try{await request(path,csrf,body);await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"The operation could not be completed.");}finally{setBusy(false);}};



  if(!csrf)return <main className="grid min-h-screen place-items-center bg-background p-6 text-center"><div className="space-y-3"><BotIcon className="mx-auto size-8 text-muted-foreground"/><h1 className="font-semibold text-xl">Living World AI Studio</h1><p className="max-w-sm text-muted-foreground text-sm">{error||"Preparing the local owner session..."}</p>{ticket&&<p className="text-muted-foreground text-xs">Redeeming the local owner link.</p>}</div></main>;



  return <TooltipProvider><main className="flex h-dvh flex-col overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 text-foreground max-[900px]:h-dvh max-[900px]:overflow-hidden">

    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur"><a className="flex items-center gap-2 font-semibold tracking-tight" href="/"><span className="grid size-7 place-items-center rounded-lg border bg-primary/10 text-primary"><CompassIcon className="size-4"/></span><span>Living World</span></a><Badge className="hidden sm:inline-flex" variant="secondary">AI Studio</Badge><div className="ml-auto flex items-center gap-2 text-muted-foreground text-xs"><span className={`size-2 rounded-full ${activity?.active?"animate-pulse bg-primary shadow-[0_0_12px_var(--primary)]":"bg-muted-foreground"}`}/><span className="hidden md:inline">{activity?.title||human(activity?.phase)}</span></div><Button asChild size="sm" variant="outline"><a href="/"><Gamepad2Icon/>Open world</a></Button><Button disabled={busy} onClick={()=>changeLab(lab?.state==="running"?"reset":"start")} size="sm"><PlayIcon/>{lab?.state==="running"?"Reset Lab":"Start Lab"}</Button></header>

    {error&&<div className="border-b bg-destructive/10 px-4 py-2 text-destructive text-sm" role="alert">{error}</div>}

    <Tabs className="min-h-0 flex-1 gap-0 max-[900px]:flex-1 max-[900px]:flex-col" orientation="vertical" onValueChange={setView} value={view}>

      <aside className="flex w-60 shrink-0 flex-col border-r bg-card/40 p-3 backdrop-blur max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:p-2">

        <div className="mb-5 flex items-center gap-3 px-2 max-[900px]:hidden"><span className="grid size-9 place-items-center rounded-xl border bg-primary/10 text-primary"><BotIcon className="size-5"/></span><div className="min-w-0"><p className="font-semibold text-sm">Codex</p><p className="truncate text-muted-foreground text-xs">Autonomous developer</p></div><span className="ml-auto size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"/></div>

        <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground max-[900px]:hidden">Studio</p>

        <TabsList className="h-auto w-full items-stretch gap-1 bg-transparent p-0 max-[900px]:!flex-row" variant="line"><TabsTrigger value="conversation"><MessageCircleIcon/>Conversation</TabsTrigger><TabsTrigger value="evidence"><ListTreeIcon/>Evidence</TabsTrigger><TabsTrigger value="operations"><ActivityIcon/>Operations</TabsTrigger></TabsList>

        <p className="mt-5 px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground max-[900px]:hidden">Control room</p>

        <TabsList className="h-auto w-full items-stretch gap-1 bg-transparent p-0 max-[900px]:!flex-row" variant="line"><TabsTrigger value="connections"><KeyRoundIcon/>Connections</TabsTrigger><TabsTrigger value="data"><DatabaseIcon/>World data</TabsTrigger><TabsTrigger value="charter"><FileTextIcon/>Charter</TabsTrigger></TabsList>

        <div className="mt-auto space-y-3 border-t pt-4 text-muted-foreground text-xs max-[900px]:hidden"><div className="flex gap-2 px-2"><ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary"/><p>Evidence stays with the work. Protected game commitments remain in force.</p></div><Button className="w-full justify-start" disabled={busy} onClick={()=>refresh()} size="sm" variant="ghost"><RefreshCwIcon/>Refresh studio</Button></div>

      </aside>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="conversation"><section className="flex h-full min-h-0 min-w-0 flex-1 flex-col border-r"><header className="flex shrink-0 items-center justify-between gap-4 border-b bg-card/30 px-5 py-2.5"><div><div className="flex items-center gap-2"><h1 className="font-semibold">Conversation</h1><Badge variant="secondary">{MODE_COPY[mode].label} mode</Badge></div></div><Badge variant="outline">{human(activity?.state)}</Badge></header><div className="hidden shrink-0 border-b bg-primary/[0.035] px-5 py-3"><div className="mx-auto flex max-w-4xl items-start gap-3"><span className={`mt-1 size-2 shrink-0 rounded-full ${activity?.active?"animate-pulse bg-primary shadow-[0_0_12px_var(--primary)]":"bg-muted-foreground"}`}/><div className="min-w-0"><p className="text-sm font-medium">{activity?.active?<Shimmer duration={2.4}>{activity.title||"The autonomous developer is working in its isolated environment."}</Shimmer>:activity?.title||studio?.reason||"The Studio is ready for the next observation."}</p><p className="mt-1 text-muted-foreground text-xs">{activity?.active?`${activity.current||activity.detail||"The host will keep this narration current."} / ${duration(activity.elapsedSeconds)}`:studio?.reason}</p></div></div></div><div className="hidden shrink-0 px-5 pt-3"><div className="mx-auto max-w-4xl"><Queue><QueueSection defaultOpen={false}><QueueSectionTrigger><QueueSectionLabel count={studio?.runs?.length||0} icon={<CircleDotIcon className="size-3.5"/>} label="developer runs"/></QueueSectionTrigger><QueueSectionContent><QueueList>{(studio?.runs||[]).slice(0,5).map((run:{id:string;task?:string;state?:string})=><QueueItem key={run.id}><span className="flex gap-2"><QueueItemContent completed={run.state==="succeeded"}>{run.task||"Isolated developer task"}</QueueItemContent><Badge className="shrink-0" variant="outline">{human(run.state)}</Badge></span></QueueItem>)}{!(studio?.runs||[]).length&&<QueueItem><QueueItemContent>No durable developer task is queued.</QueueItemContent></QueueItem>}</QueueList></QueueSectionContent></QueueSection></Queue></div></div><Conversation className="studio-chat-scroll min-h-0 flex-1"><ConversationContent className="mx-auto w-full max-w-5xl gap-7 px-6 py-7">{!developerMessages.length&&<ConversationEmptyState description="Use Ask to retain an observation, Plan to preserve the approach, or Agent to hand off a bounded task." icon={<BotIcon className="size-6"/>} title="The autonomous developer is ready to observe."/>}{developerMessages.map(message=>{const narrative=narrativeOf(message),messageMode=modeOf(message),isPlan=message.speaker==="owner"&&messageMode==="plan";const explanation=[narrative?.intent&&`**Intent**  ${narrative.intent}`,narrative?.current&&`**Current**  ${narrative.current}`,narrative?.next&&`**Next**  ${narrative.next}`,narrative?.complete&&`**Completion signal**  ${narrative.complete}`].filter(Boolean).join("\n\n");return <Message from={message.speaker==="owner"?"user":"assistant"} key={message.id}><div className="flex items-center gap-2 text-muted-foreground text-xs"><span>{author(message)}</span>{messageMode&&<Badge className="h-5 px-1.5 text-[10px]" variant="outline">{MODE_COPY[messageMode].label}</Badge>}<span>/ {human(message.status)} / {time(message.created_at)}</span></div>{isPlan?<Plan defaultOpen><PlanHeader className="pb-3"><div><PlanTitle>Owner plan</PlanTitle><PlanDescription>Retained planning context; no source task was started.</PlanDescription></div><PlanTrigger/></PlanHeader><PlanContent><MessageResponse>{message.body}</MessageResponse></PlanContent></Plan>:<MessageContent><MessageResponse>{message.body}</MessageResponse></MessageContent>}{explanation&&<Reasoning defaultOpen={false} isStreaming={false}><ReasoningTrigger getThinkingMessage={()=>"Work context"}/><ReasoningContent>{explanation}</ReasoningContent></Reasoning>}</Message>})}{activity?.active&&<Message from="assistant"><div className="flex items-center gap-2 text-muted-foreground text-xs"><span>{activity.agent||"Autonomous developer"}</span><span>/ live / {duration(activity.elapsedSeconds)}</span></div><MessageContent><Shimmer duration={2.4}>{activity.title||"The autonomous developer is advancing its isolated task."}</Shimmer><p className="text-muted-foreground text-sm">{activity.current||activity.detail||"The next host update will name the completed step or a concrete blocker."}</p></MessageContent><Reasoning isStreaming><ReasoningTrigger getThinkingMessage={()=>"Live work narration"}/><ReasoningContent>{[activity.intent&&`**Intent**  ${activity.intent}`,activity.next&&`**Next**  ${activity.next}`,activity.complete&&`**Completion signal**  ${activity.complete}`].filter(Boolean).join("\n\n")||"The host is waiting for the next inspectable milestone."}</ReasoningContent></Reasoning></Message>}</ConversationContent><ConversationScrollButton/></Conversation><div className="shrink-0 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto max-w-4xl space-y-3"><Suggestions className="hidden"><Suggestion onClick={setDraft} suggestion="Review the current World Lab for visual clarity."/><Suggestion onClick={setDraft} suggestion="Plan a safer command-battle readability pass."/><Suggestion onClick={setDraft} suggestion="Inspect the latest developer result and explain the next useful step."/></Suggestions><PromptInput maxFiles={0} onSubmit={send}><PromptInputHeader><div className="flex flex-wrap items-center gap-2"><PromptInputTools><PromptInputActionMenu><PromptInputActionMenuTrigger tooltip="Choose Studio mode"><MessageCircleIcon className="size-4"/></PromptInputActionMenuTrigger><PromptInputActionMenuContent><PromptInputActionMenuItem onSelect={()=>setMode("ask")}>Ask - retain a question</PromptInputActionMenuItem><PromptInputActionMenuItem onSelect={()=>setMode("plan")}>Plan - retain constraints</PromptInputActionMenuItem><PromptInputActionMenuItem onSelect={()=>setMode("agent")}>Agent - queue isolated work</PromptInputActionMenuItem></PromptInputActionMenuContent></PromptInputActionMenu></PromptInputTools>{(["ask","plan","agent"] as StudioMode[]).map(item=><Button key={item} onClick={()=>setMode(item)} size="sm" type="button" variant={mode===item?"secondary":"ghost"}>{MODE_COPY[item].label}</Button>)}</div></PromptInputHeader><PromptInputTextarea disabled={busy} onChange={event=>setDraft(event.target.value)} placeholder={MODE_COPY[mode].placeholder} value={draft}/><PromptInputFooter><span className="max-w-[75%] text-muted-foreground text-xs">{MODE_COPY[mode].detail} Enter to {MODE_COPY[mode].submit.toLowerCase()} / Shift+Enter for a new line</span><PromptInputSubmit disabled={busy||draft.trim().length<2}/></PromptInputFooter></PromptInput></div></div></section></TabsContent>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="evidence"><section className="h-full min-h-0 overflow-auto border-r p-5"><div className="mx-auto max-w-3xl space-y-6"><div><h1 className="font-semibold">Evidence</h1><p className="mt-1 text-muted-foreground text-sm">Observed facts and inspectable task context, kept separate from the conversation.</p></div><Agent><AgentHeader name="Autonomous developer"/><AgentContent><AgentInstructions>Inspect affected source, preserve the constitution, and record evidence before a contained change.</AgentInstructions></AgentContent></Agent><Task defaultOpen><TaskTrigger title="Current development context"/><TaskContent><TaskItem>{activity?.title||human(activity?.phase)} / {human(activity?.state)}</TaskItem><TaskItem>World Lab: {lab?.state==="running"?`running${lab.visualRevision?" with verified visual data":""}`:"no staging world is running"}</TaskItem><TaskItem>Versioned server schema: {overview?.schemaVersion??"loading"}</TaskItem></TaskContent></Task><Checkpoint><CheckpointIcon/><CheckpointTrigger tooltip="A durable observation checkpoint.">Conversation and evidence are recorded locally</CheckpointTrigger></Checkpoint><div className="space-y-5">{evidenceMessages.map(message=>{const narrative=narrativeOf(message);return <Message from="assistant" key={message.id}><div className="text-muted-foreground text-xs">{author(message)} / {time(message.created_at)}</div><MessageContent><MessageResponse>{message.body}</MessageResponse>{narrative&&<NarrativeDetails narrative={narrative}/>}</MessageContent>{narrative&&<Reasoning defaultOpen={false}><ReasoningTrigger getThinkingMessage={()=>"Why this record exists"}/><ReasoningContent>{narrative.intent||"This is a retained host record."}</ReasoningContent></Reasoning>}</Message>})}{!evidenceMessages.length&&<p className="text-muted-foreground text-sm">No evidence records have been stored yet.</p>}</div></div></section></TabsContent>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="operations"><section className="h-full min-h-0 overflow-auto border-r p-5"><div className="mx-auto max-w-3xl space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-semibold">Operations</h1><p className="mt-1 text-muted-foreground text-sm">Live service status, durable memory maintenance, and recoverable local backups.</p></div><Button disabled={busy} onClick={()=>refresh()} size="sm" variant="outline"><RefreshCwIcon/>Refresh</Button></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-card/60 p-4 shadow-sm"><p className="text-muted-foreground text-xs">World service</p><p className="mt-2 font-semibold text-2xl">{compact(overview?.online)}</p><p className="mt-1 text-muted-foreground text-xs">travelers online / schema {overview?.schemaVersion??"-"}</p></div><div className="rounded-xl border bg-card/60 p-4 shadow-sm"><p className="text-muted-foreground text-xs">Memory worker</p><p className="mt-2 font-semibold text-2xl">{overview?.paused?"Paused":"Ready"}</p><p className="mt-1 text-muted-foreground text-xs">{overview?.worker?.queued??0} queued / {overview?.worker?.failed??0} failed</p></div><div className="rounded-xl border bg-card/60 p-4 shadow-sm"><p className="text-muted-foreground text-xs">AI runtime</p><p className="mt-2 font-semibold text-2xl">{overview?.ai?.modelCallsEnabled?"Enabled":"Disabled"}</p><p className="mt-1 text-muted-foreground text-xs">{overview?.ai?.credentialConfigured?"Credential stored":"No credential stored"}</p></div><div className="rounded-xl border bg-card/60 p-4 shadow-sm"><p className="text-muted-foreground text-xs">Backups</p><p className="mt-2 font-semibold text-2xl">{compact(overview?.backups?.length)}</p><p className="mt-1 text-muted-foreground text-xs">recoverable local snapshots</p></div></div><Agent><AgentHeader name="Operator controls"/><AgentContent><AgentInstructions>Routine service checks are visible here. Model calls remain disabled until their provider adapter and owner settings explicitly allow execution.</AgentInstructions><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>operate("worker",{action:overview?.paused?"resume":"pause"})} variant="outline">{overview?.paused?"Resume worker":"Pause worker"}</Button><Button disabled={busy||overview?.paused} onClick={()=>operate("worker",{action:"tick"})} variant="outline"><WorkflowIcon/>Run maintenance</Button><Button disabled={busy} onClick={()=>operate("backup",{})} variant="outline"><ArchiveIcon/>Create backup</Button></div></AgentContent></Agent><Task defaultOpen><TaskTrigger title="Recent operator records"/><TaskContent>{(overview?.recentAudit||[]).slice(0,8).map(entry=><TaskItem key={entry.id}>{human(entry.action)}</TaskItem>)}{!(overview?.recentAudit||[]).length&&<TaskItem>No operator records yet.</TaskItem>}</TaskContent></Task></div></section></TabsContent>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="connections"><section className="h-full min-h-0 overflow-auto border-r p-5"><div className="mx-auto max-w-3xl space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-semibold">Connections</h1><p className="mt-1 text-muted-foreground text-sm">Developer accounts and model providers. Saving a key stays local and never makes a model call.</p></div><ModelSelector><ModelSelectorTrigger asChild><Button variant="outline">Switch connection</Button></ModelSelectorTrigger><ModelSelectorContent title="Switch AI connection"><ModelSelectorInput placeholder="Find a connection..."/><ModelSelectorList><ModelSelectorEmpty>No connection found.</ModelSelectorEmpty><ModelSelectorGroup heading="Developer accounts">{connectionGroups.developer.map(item=><ModelSelectorItem key={item.id} onSelect={()=>setSelectedConnection(item.id)} value={item.name}><ModelSelectorName>{item.name}</ModelSelectorName><Badge variant="secondary">{item.status}</Badge></ModelSelectorItem>)}</ModelSelectorGroup><ModelSelectorGroup heading="Model providers">{connectionGroups.model.map(item=><ModelSelectorItem key={item.id} onSelect={()=>setSelectedConnection(item.id)} value={item.name}><ModelSelectorName>{item.name}</ModelSelectorName><Badge variant="secondary">{item.secretConfigured?"key saved":item.status}</Badge></ModelSelectorItem>)}</ModelSelectorGroup></ModelSelectorList></ModelSelectorContent></ModelSelector></div><div className="grid gap-2 sm:grid-cols-2">{connections.map(item=><Button className="h-auto justify-start py-3 text-left" key={item.id} onClick={()=>setSelectedConnection(item.id)} variant={item.id===selected?.id?"secondary":"outline"}><span className="min-w-0"><span className="block truncate">{item.name}</span><span className="mt-1 block truncate text-muted-foreground text-xs">{item.transport} / {item.secretConfigured?"key saved":item.status}</span></span></Button>)}</div>{selected&&<div className="space-y-4 rounded-xl border bg-card/60 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{selected.name}</p><p className="mt-1 max-w-xl text-muted-foreground text-sm">{selected.description}</p></div><Badge variant="secondary">{selected.execution==="disabled"?"Execution disabled":selected.execution}</Badge></div>{selected.id==="codex"?<div className="space-y-3"><p className="text-muted-foreground text-sm">Project-scoped Codex account for isolated developer work.</p>{developer?.connection?.connected?<Badge variant="secondary">Connected{developer.connection.account?.email?` as ${developer.connection.account.email}`:""}</Badge>:developer?.connection?.login?<div className="space-y-2"><p className="text-muted-foreground text-sm">Complete the sign-in, then this panel refreshes automatically.</p><Button asChild><a href={developer.connection.login.url} rel="noreferrer" target="_blank">Continue Codex sign-in</a></Button>{developer.connection.login.userCode&&<p className="font-mono text-sm">Code: {developer.connection.login.userCode}</p>}</div>:<div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>codexLogin("chatgpt")}>Browser sign-in</Button><Button disabled={busy} onClick={()=>codexLogin("chatgptDeviceCode")} variant="outline">Headless sign-in</Button></div>}</div>:selected.id==="claude-code"?<form className="grid gap-4" onSubmit={event=>{event.preventDefault();saveConnection(new FormData(event.currentTarget));}}><p className="border-l pl-3 text-muted-foreground text-sm">Claude Code account preferences are retained here. Its isolated runner is not connected in this build, so this UI never claims it is operating.</p><label className="grid gap-2 text-sm">Connection method<Select defaultValue={selected.configuration.authMode} name="authMode"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{selected.auth.map(mode=><SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-2 text-sm">Model hint<Input defaultValue={selected.configuration.model} key={`${selected.id}-model`} name="model" placeholder="Optional account model hint"/></label><input name="endpoint" type="hidden" value="" readOnly/><Button disabled={busy} type="submit">Save account preference</Button></form>:<form className="grid gap-4" onSubmit={event=>{event.preventDefault();saveConnection(new FormData(event.currentTarget));}}><label className="grid gap-2 text-sm">Connection method<Select defaultValue={selected.configuration.authMode} name="authMode"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{selected.auth.map(mode=><SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-2 text-sm">Model hint<Input defaultValue={selected.configuration.model} key={`${selected.id}-model`} name="model" placeholder="Leave blank until its adapter selects a model"/></label><label className="grid gap-2 text-sm">HTTPS endpoint<Input defaultValue={selected.configuration.endpoint} key={`${selected.id}-endpoint`} name="endpoint" placeholder="https://..."/></label><label className="grid gap-2 text-sm">API key<Input name="apiKey" placeholder={selected.secretConfigured?"A sealed key is already stored; enter one only to rotate it":"Stored sealed on this local host"} type="password"/></label><div className="flex flex-wrap items-center gap-3"><Button disabled={busy} type="submit">Save local configuration</Button><span className="text-muted-foreground text-xs">{selected.secretConfigured?"Key is sealed locally":"No key stored"}</span></div></form>}</div>}</div></section></TabsContent>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="data"><section className="h-full min-h-0 overflow-auto border-r p-5"><div className="mx-auto max-w-3xl space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-semibold">World data</h1><p className="mt-1 text-muted-foreground text-sm">Read-only, redacted records from the persistent local world.</p></div><Button disabled={busy} onClick={()=>inspectData()} size="sm" variant="outline"><RefreshCwIcon/>Refresh</Button></div><div className="flex max-w-sm gap-2"><Select onValueChange={setSelectedTable} value={selectedTable}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{DATA_TABLES.map(table=><SelectItem key={table} value={table}>{table.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></div><div className="rounded-xl border bg-card/60 p-4 shadow-sm"><div className="mb-3 flex items-center justify-between text-sm"><span className="font-medium">{data?.table||selectedTable}</span><span className="text-muted-foreground">{compact(data?.total)} records</span></div><Terminal output={JSON.stringify(data?.rows||[],null,2)}/></div></div></section></TabsContent>



      <TabsContent className="m-0 min-w-0 max-[900px]:min-h-[620px]" value="charter"><section className="h-full min-h-0 overflow-auto border-r p-5"><div className="mx-auto max-w-3xl space-y-6"><div><h1 className="font-semibold">Charter</h1><p className="mt-1 text-muted-foreground text-sm">The durable game identity, delivery baseline, and memory contract that guide autonomous work.</p></div><div className="flex flex-wrap gap-2">{(["CONSTITUTION","BASELINE","MEMORY"] as const).map(name=><Button key={name} onClick={()=>setSelectedDocument(name)} size="sm" variant={name===selectedDocument?"secondary":"outline"}>{name[0]+name.slice(1).toLowerCase()}</Button>)}</div><Message from="assistant"><MessageContent className="w-full max-w-full rounded-xl border bg-card/60 p-5 shadow-sm"><MessageResponse>{documents?.[selectedDocument]||"Loading the selected project document..."}</MessageResponse></MessageContent></Message></div></section></TabsContent>



      <aside className="flex w-[min(34vw,540px)] shrink-0 flex-col border-l bg-card/30 backdrop-blur max-[900px]:hidden"><header className="flex items-center justify-between gap-3 border-b bg-background/70 px-4 py-3"><div><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><FlaskConicalIcon className="size-4"/></span><p className="font-semibold text-sm">World Lab</p></div><p className="mt-1 text-muted-foreground text-xs">{lab?.state==="running"?lab.visualRevision?"Verified visual release loaded":"Isolated current-source staging world":"No staging world is running"}</p></div>{lab?.state==="running"?<div className="flex gap-2"><Button disabled={busy} onClick={()=>changeLab("reset")} size="sm" variant="outline"><RotateCcwIcon/>Reset</Button><Button disabled={busy} onClick={()=>changeLab("stop")} size="sm" variant="outline"><SquareIcon/>Stop</Button></div>:<Button disabled={busy} onClick={()=>changeLab("start")} size="sm"><FlaskConicalIcon/>Start Lab</Button>}</header>{labFrameUrl?<iframe className="min-h-0 flex-1 border-0 bg-muted" src={labFrameUrl} title="Current-source disposable world"/>:<div className="grid flex-1 place-items-center p-8 text-center"><div className="space-y-3"><span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-primary/10 text-primary"><FlaskConicalIcon className="size-6"/></span><p className="font-semibold text-sm">Explore before directing.</p><p className="max-w-xs text-muted-foreground text-sm">Launch a fresh staging world, walk through it, and bring any observation into the conversation.</p><Button disabled={busy} onClick={()=>changeLab("start")}><PlayIcon/>Launch World Lab</Button></div></div>}<footer className="border-t bg-background/70 px-4 py-2 text-muted-foreground text-xs">{lab?.state==="running"?lab.visualRevision?"Refreshes after a verified visual release":"Current verified baseline / candidate source remains isolated":"Lab is offline"}</footer></aside>
    </Tabs>

  </main></TooltipProvider>;

}


