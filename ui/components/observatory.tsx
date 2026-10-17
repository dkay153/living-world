"use client";

import {useEffect,useState} from "react";
import {StudioConversation} from "@/components/studio-conversation";
import {DeveloperEvidence,type DeveloperEvidenceState} from "@/components/developer-evidence";
import {StudioPreview} from "@/components/studio-preview";
import type {DeveloperSetup} from "@/components/codex-controls";
import {ConnectionsPanel,OperationsPanel,WorldDataPanel,CharterPanel} from "@/components/admin-panels";
import {ActivityIcon,BotIcon,DatabaseIcon,FileTextIcon,FlaskConicalIcon,Gamepad2Icon,KeyRoundIcon,ListTreeIcon,MessageCircleIcon} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {TooltipProvider} from "@/components/ui/tooltip";

type StudioMessage={id:string;speaker:"owner"|"agent"|"system";kind:string;body:string;status:string;created_at:number;evidence?:Record<string,unknown>};

type Narrative={title?:string;intent?:string;current?:string;next?:string;complete?:string;refreshSandbox?:boolean;agent?:string};

type Activity={runId?:string;state:string;phase:string;title?:string;intent?:string;current?:string;next?:string;complete?:string;active?:boolean;startedAt?:number;updatedAt?:number;elapsedSeconds?:number|null;detail?:string;agent?:string};

type Studio={resumeTarget?:{id:string;task:string};ready:boolean;reason:string;activity?:Activity;runs?:{id:string;task?:string;state?:string}[];messages:StudioMessage[]};

type StudioMode="ask"|"plan"|"agent";

type Overview={online:number;schemaVersion:number;uptimeSeconds:number;paused:boolean;worker?:{running?:boolean;queued?:number;failed?:number};ai?:{provider?:string;model?:string|null;dailyBudgetUsd?:number|null;credentialConfigured?:boolean;modelCallsEnabled?:boolean};backups?:{name:string;size:number}[];counts?:Record<string,number>;recentAudit?:{id:number;action:string;details:string;created_at?:number}[];developerActivity?:Activity;capabilities?:Record<string,unknown>};

type Connection={id:string;name:string;family:string;auth:string[];transport:string;status:"available"|"planned"|"configured";description:string;configuration:{endpoint:string;model:string;authMode:string};secretConfigured:boolean;execution:"disabled"};

type Developer=DeveloperSetup & DeveloperEvidenceState & {candidatePreview?:{state:string;url?:string|null;sourceHash?:string;updatedAt?:number;error?:string|null};connection?:{connected?:boolean;account?:{email?:string;planType?:string};login?:{url:string;userCode?:string;type:string};loginError?:string};activity?:Activity};

type DocumentSet=Record<"CONSTITUTION"|"BASELINE"|"MEMORY",string>;

type DataPage={table:string;page:number;total:number;pageSize:number;columns:string[];rows:Record<string,unknown>[]};

const DATA_TABLES=["events","players","gameplay","discoveries","environment","item_instances","knowledge","memories","jobs","checkpoints","improvements","developer_runs","developer_lessons","visual_releases","agent_messages","admin_audit"];

async function request(path:string,csrf:string,body?:unknown){

  const response=await fetch(`/api/admin/${path}`,{method:body===undefined?"GET":"POST",headers:body===undefined?undefined:{"Content-Type":"application/json","X-Owner-CSRF":csrf},body:body===undefined?undefined:JSON.stringify(body)});

  const data=await response.json().catch(()=>({error:"The local service returned an incomplete response."}));

  if(!response.ok)throw new Error(data.error||"Request failed");

  return data;

}

const human=(value?:string)=>!value?"Observing":value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

const narrativeOf=(message:StudioMessage)=>message.evidence?.presentation as Narrative|undefined;

export function Observatory(){

  const [csrf,setCsrf]=useState("");

  const [studio,setStudio]=useState<Studio|null>(null);

  const [overview,setOverview]=useState<Overview|null>(null);

  const [lab,setLab]=useState<{state?:string;url?:string;visualRevision?:string|null}|null>(null);

  const [labFrameUrl,setLabFrameUrl]=useState("");
  const [labStarting,setLabStarting]=useState(false);

  const [developer,setDeveloper]=useState<Developer|null>(null);

  const [connections,setConnections]=useState<Connection[]>([]);

  const [documents,setDocuments]=useState<DocumentSet|null>(null);

  const [data,setData]=useState<DataPage|null>(null);

  const [view,setView]=useState("conversation");

  const [mode,setMode]=useState<StudioMode>("ask");

  const [draft,setDraft]=useState("");

  const [selectedConnection,setSelectedConnection]=useState("codex");


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

  const inspectData=async(table=selectedTable,page=0,query="")=>{if(!csrf)return;setBusy(true);try{setData(await request(`data?table=${encodeURIComponent(table)}&page=${page}&q=${encodeURIComponent(query)}`,csrf));}catch(cause){setError(cause instanceof Error?cause.message:"Could not read the selected world records.");}finally{setBusy(false);}};

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

    if(labStarting)return;
    if(lab?.state!=="running"||!lab.url){setLabFrameUrl("");return;}

    const next=`${lab.url}/?visual=${encodeURIComponent(lab.visualRevision||"baseline")}&refresh=${sandboxRefresh?"verified":"baseline"}`;

    setLabFrameUrl(current=>current===next?current:next);

  },[lab?.state,lab?.url,lab?.visualRevision,sandboxRefresh,labStarting]);

  const observedActivity=studio?.activity||overview?.developerActivity||developer?.activity;
  const activeRun=developer?.runs?.find(run=>run.id===observedActivity?.runId);
  const activity=observedActivity?{...observedActivity,effort:activeRun?.effort}:undefined;

  const selected=connections.find(item=>item.id===selectedConnection)||connections[0];

  const developerMessages=studio?.messages||[];



  const send=async(message:{text:string})=>{if(!message.text.trim())return;setBusy(true);try{await request("studio/messages",csrf,{body:message.text,mode});setDraft("");await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Message could not be stored.");}finally{setBusy(false);}};

  const resume=async()=>{setBusy(true);try{const run=studio?.resumeTarget;if(run)await request("developer/resume",csrf,{id:run.id,text:draft});else if(developer?.config)await request("developer/settings",csrf,{...developer.config,enabled:true});setDraft("");await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Could not resume execution.");}finally{setBusy(false);}};
  const changeLab=async(action:"start"|"reset"|"stop")=>{setBusy(true);setLabStarting(action!=="stop");try{await request("studio/lab",csrf,{action});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"World Lab could not change state.");}finally{setLabStarting(false);setBusy(false);}};

  const saveConnection=async(form:FormData)=>{if(!selected)return;setBusy(true);try{await request(`connections/${selected.id}`,csrf,{endpoint:String(form.get("endpoint")||""),model:String(form.get("model")||""),authMode:String(form.get("authMode")||""),apiKey:String(form.get("apiKey")||"")});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Connection could not be saved.");}finally{setBusy(false);}};

  const codexLogin=async(type:"chatgpt"|"chatgptDeviceCode")=>{setBusy(true);try{await request("developer/login",csrf,{type});await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Codex sign-in could not begin.");}finally{setBusy(false);}};

  const operate=async(path:string,body:Record<string,unknown>)=>{setBusy(true);try{await request(path,csrf,body);await refresh();}catch(cause){setError(cause instanceof Error?cause.message:"The operation could not be completed.");}finally{setBusy(false);}};

  if(!csrf)return <main className="grid min-h-screen place-items-center bg-background p-6 text-center"><div className="space-y-3"><BotIcon className="mx-auto size-8 text-muted-foreground"/><h1 className="font-semibold text-xl">Living World AI Studio</h1><p className="max-w-sm text-muted-foreground text-sm">{error||"Preparing the local owner session..."}</p>{ticket&&<p className="text-muted-foreground text-xs">Redeeming the local owner link.</p>}</div></main>;

  return <TooltipProvider><main className="admin-studio flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <a className="flex shrink-0 items-center gap-2 text-sm font-medium" href="/"><BotIcon className="size-4"/>AI Studio</a>
      <Badge className="ml-auto max-w-40 truncate" variant="secondary">{human(activity?.state)}</Badge>
      <Button asChild size="sm" variant="ghost"><a href="/" aria-label="Open world"><Gamepad2Icon/><span className="hidden sm:inline">Open world</span></a></Button>
    </header>
    {error&&<div className="shrink-0 border-b px-4 py-2 text-sm text-destructive" role="alert">{error}</div>}
    <Tabs className="min-h-0 flex-1 flex-col gap-0" onValueChange={setView} value={view}>
      <div className="shrink-0 overflow-x-auto border-b px-4">
        <TabsList className="h-11 w-max min-w-full justify-start gap-4 bg-transparent p-0" variant="line">
          <TabsTrigger value="conversation"><MessageCircleIcon/>Conversation</TabsTrigger>
          <TabsTrigger value="lab"><FlaskConicalIcon/>World Lab</TabsTrigger>
          <TabsTrigger value="evidence"><ListTreeIcon/>Evidence</TabsTrigger>
          <TabsTrigger value="operations"><ActivityIcon/>Operations</TabsTrigger>
          <TabsTrigger value="connections"><KeyRoundIcon/>Connections</TabsTrigger>
          <TabsTrigger value="data"><DatabaseIcon/>World data</TabsTrigger>
          <TabsTrigger value="charter"><FileTextIcon/>Charter</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="conversation">
        <div className="flex size-full min-h-0 min-w-0 divide-x">
          <div className="min-h-0 min-w-0 flex-1"><StudioConversation onCancel={()=>{if(activity?.runId)void operate("developer/stop",{id:activity.runId});}} resumable={developer?.config?.enabled===false} onResume={()=>void resume()} models={developer?.models} onModelChange={value=>{if(developer?.config)void operate("developer/settings",{...developer.config,model:value});}} onEffortChange={value=>{if(developer?.config)void operate("developer/settings",{...developer.config,effort:value});}} model={developer?.config?.model} effort={developer?.config?.effort} messages={developerMessages} activity={activity} mode={mode} draft={draft} busy={busy} onModeChange={setMode} onDraftChange={setDraft} onSubmit={send}/></div>
          <div className="hidden min-h-0 min-w-0 flex-1 md:flex"><StudioPreview candidate={developer?.candidatePreview} starting={labStarting} url={labStarting?"":labFrameUrl} running={lab?.state==="running"} busy={busy} onChange={changeLab}/></div>
        </div>
      </TabsContent>
      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="lab"><StudioPreview candidate={developer?.candidatePreview} starting={labStarting} url={labStarting?"":labFrameUrl} running={lab?.state==="running"} busy={busy} onChange={changeLab}/></TabsContent>
      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="evidence"><section className="h-full min-h-0 overflow-auto p-5 sm:p-8 lg:p-10"><DeveloperEvidence developer={developer} inspect={id=>request(`developer/report?id=${encodeURIComponent(id)}`,csrf)}/></section></TabsContent>

      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="operations"><section className="h-full min-h-0 overflow-auto p-5 sm:p-8 lg:p-10"><OperationsPanel overview={overview} developer={developer} busy={busy} operate={operate} refresh={()=>void refresh()}/></section></TabsContent>

      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="connections"><section className="h-full min-h-0 overflow-auto p-5 sm:p-8 lg:p-10"><ConnectionsPanel connections={connections} selectedId={selectedConnection} onSelect={setSelectedConnection} developer={developer} busy={busy} operate={operate} save={saveConnection} login={codexLogin}/></section></TabsContent>

      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="data"><section className="h-full min-h-0 overflow-auto p-5 sm:p-8 lg:p-10"><WorldDataPanel data={data} tables={DATA_TABLES} table={selectedTable} onTable={value=>{setData(null);setSelectedTable(value);}} busy={busy} load={(page,query)=>void inspectData(selectedTable,page,query)}/></section></TabsContent>

      <TabsContent className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden" value="charter"><section className="h-full min-h-0 overflow-auto p-5 sm:p-8 lg:p-10"><CharterPanel documents={documents} selected={selectedDocument} onSelect={setSelectedDocument}/></section></TabsContent>

    </Tabs>
  </main></TooltipProvider>;
}

