"use client";
import {useState} from 'react';

// Preview composition copied from the official v0-clone example.
import { PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import { WebPreview, WebPreviewBody, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl } from "@/components/ai-elements/web-preview";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { FlaskConicalIcon } from "lucide-react";

export function StudioPreview({url,running,busy,starting=false,onChange,candidate}:{candidate?:{state:string;url?:string|null;sourceHash?:string;updatedAt?:number;error?:string|null};starting?:boolean;url:string;running:boolean;busy:boolean;onChange:(action:"start"|"reset"|"stop")=>Promise<void>}) {
  const [follow,setFollow]=useState(true);
  const following=follow&&!!candidate?.url;
  const displayed=following?candidate!.url!:url;
  return <div className="flex size-full min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs"><Button size="sm" variant={follow?'secondary':'ghost'} onClick={()=>setFollow(true)}>Follow agent</Button><Button size="sm" variant={!follow?'secondary':'ghost'} onClick={()=>setFollow(false)}>World Lab</Button><span className="text-muted-foreground">{follow?(candidate?.state==='building'?'Building updated candidate…':following?'Latest built candidate':'Waiting for a candidate preview'):'Current checkout'}</span></div>
    <WebPreview className="rounded-none border-0" defaultUrl={displayed} key={displayed}>
      <WebPreviewNavigation>
        {!following&&<WebPreviewNavigationButton disabled={busy} onClick={()=>onChange(running?"reset":"start")} tooltip={running?"Reset Lab":"Start Lab"} aria-label={running?"Reset Lab":"Start Lab"}>{running?<RotateCcwIcon className="size-4"/>:<PlayIcon className="size-4"/>}</WebPreviewNavigationButton>}
        <WebPreviewUrl aria-label="World preview address" placeholder="Start World Lab to preview" value={displayed} readOnly/>
        {running&&!following && <WebPreviewNavigationButton disabled={busy} onClick={()=>onChange("stop")} tooltip="Stop Lab" aria-label="Stop Lab"><SquareIcon className="size-4"/></WebPreviewNavigationButton>}
      </WebPreviewNavigation>
      {displayed?<WebPreviewBody src={displayed} title={following?"Agent candidate world":"Current-source disposable world"} {...(following?{sandbox:"allow-scripts allow-same-origin"}:{})}/>:<Empty className="rounded-none"><EmptyHeader><EmptyMedia variant="icon"><FlaskConicalIcon/></EmptyMedia><EmptyTitle>{starting?"Starting your World Lab…":"A world to experiment in"}</EmptyTitle><EmptyDescription>Explore the current checkout with disposable history. The protected game and its player saves stay separate.</EmptyDescription></EmptyHeader><EmptyContent><Button disabled={busy||starting} size="sm" onClick={()=>onChange("start")}><PlayIcon/>Start World Lab</Button></EmptyContent></Empty>}
      {displayed&&<p className="border-t px-4 py-2 text-xs text-muted-foreground">{following?`Agent candidate ${candidate?.sourceHash?.slice(0,10)||''} · Refreshes after successful builds`:'Current checkout preview'} · Disposable history · Not a published release{candidate?.error&&following?` · Update failed: ${candidate.error}`:''}</p>}
    </WebPreview>
  </div>;
}
