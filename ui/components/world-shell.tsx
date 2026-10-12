"use client";
import { useState } from "react";
import { BookOpen, ChevronDown, Compass, Gamepad2, MessageCircle, Shield, Sparkles } from "lucide-react";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent } from "@/components/ai-elements/tool";

export function WorldShell(){
 const [open,setOpen]=useState(true);
 return <main className="world-shell">
  <header className="world-top"><a className="brand" href="/admin"><span className="brand-mark"><Compass size={18}/></span><span>Living World</span></a><div className="world-mode"><Sparkles size={14}/> Persistent local world</div><a className="quiet-link" href="/admin">AI Studio</a></header>
  <section className="world-stage"><iframe title="Living World" className="legacy-world" src="/legacy/"/>
   <aside className={`chronicle ${open?"open":""}`}><button onClick={()=>setOpen(!open)} className="chronicle-toggle"><BookOpen size={16}/><span>World chronicle</span><ChevronDown size={15}/></button>{open&&<div className="chronicle-inner"><Conversation><ConversationContent><Message from="assistant"><div className="message-meta"><span>World voice</span><span>persistent</span></div><MessageContent><MessageResponse>Walk the basin. Your choices become history; repeated behavior can become identity.</MessageResponse></MessageContent></Message><Message from="assistant"><Reasoning><ReasoningTrigger>Recognition remains earned</ReasoningTrigger><ReasoningContent>Archetypes are conclusions from persistent behavior, not a class menu. The system records evidence before a new identity is recognized.</ReasoningContent></Reasoning></Message><Tool defaultOpen><div className="tool-summary"><Shield size={15}/><b>Encounter command</b><span>authoritative</span></div><ToolContent>Battle actions, movement, and consequences continue inside the world screen. The server remains the source of truth.</ToolContent></Tool></ConversationContent></Conversation></div>}</aside>
   <div className="world-prompt"><Gamepad2 size={16}/><span>Explore with arrows or WASD  /  interact at world objects</span><MessageCircle size={15}/></div>
  </section>
 </main>;
}


