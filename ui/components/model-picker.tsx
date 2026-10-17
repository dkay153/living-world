"use client";

import {useState} from "react";
import {CheckIcon,ChevronDownIcon,BotIcon} from "lucide-react";
import {ModelSelector,ModelSelectorContent,ModelSelectorEmpty,ModelSelectorGroup,ModelSelectorInput,ModelSelectorItem,ModelSelectorList,ModelSelectorName,ModelSelectorTrigger} from "@/components/ai-elements/model-selector";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {modelName,effortName} from "@/components/admin-ui";

export type AccountModel={id:string;name?:string};
export function ModelPicker({value,models=[],onChange,disabled,compact=false,runningModel}:{value:string;models?:AccountModel[];onChange:(value:string)=>void;disabled?:boolean;compact?:boolean;runningModel?:string}){
 const [open,setOpen]=useState(false);
 const choices=[{id:"auto",name:"Automatic",description:"Choose from the connected account for each task."},...models.map(m=>({...m,description:m.id}))];
 if(value!=="auto"&&!models.some(m=>m.id===value))choices.push({id:value,name:value,description:"Saved model · not in the current account catalog"});
 return <ModelSelector open={open} onOpenChange={setOpen}><ModelSelectorTrigger asChild><Button type="button" disabled={disabled} variant={compact?"ghost":"outline"} size="sm" className={compact?"max-w-44 gap-1.5 px-2":"h-9 w-full justify-between"} aria-label="Choose developer model"><span className="flex min-w-0 items-center gap-2"><BotIcon className="size-4 shrink-0"/><span className="truncate">{modelName(runningModel||value,models)}</span></span><ChevronDownIcon className="size-3 shrink-0"/></Button></ModelSelectorTrigger><ModelSelectorContent title="Developer model"><div className="px-4 pt-4 pb-2"><p className="text-sm font-medium">Developer model</p><p className="mt-1 text-xs text-muted-foreground">Saved selection: {modelName(value,models)}. Changes apply to new runs.</p></div><ModelSelectorInput placeholder="Search account models…"/><ModelSelectorList><ModelSelectorEmpty>No matching model in this account.</ModelSelectorEmpty><ModelSelectorGroup heading="Connected account">{choices.map(m=><ModelSelectorItem key={m.id} value={`${m.name} ${m.id}`} onSelect={()=>{onChange(m.id);setOpen(false);}}><div className="min-w-0 flex-1"><ModelSelectorName>{m.name||m.id}</ModelSelectorName><p className="mt-1 truncate text-xs text-muted-foreground">{m.description}</p></div>{value===m.id&&<CheckIcon className="size-4" aria-label="Selected"/>}</ModelSelectorItem>)}</ModelSelectorGroup></ModelSelectorList></ModelSelectorContent></ModelSelector>;
}
export function EffortPicker({value,onChange,disabled,compact=false,runningEffort}:{value:string;onChange:(value:string)=>void;disabled?:boolean;compact?:boolean;runningEffort?:string}){return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label="Reasoning effort" className={compact?"h-8 gap-1 border-0 bg-transparent! px-2 text-xs shadow-none":"w-full"}><SelectValue>{value==="auto"&&runningEffort?`Auto · ${effortName(runningEffort)}`:effortName(value)}</SelectValue></SelectTrigger><SelectContent>{["auto","low","medium","high"].map(e=><SelectItem key={e} value={e}>{effortName(e)}</SelectItem>)}</SelectContent></Select>;}
