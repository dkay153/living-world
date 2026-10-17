"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const words=(value?:string)=>value?value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()):"Not recorded";
export const modelName=(id?:string,models?:{id:string;name?:string}[])=>id==="auto"?"Automatic":models?.find(m=>m.id===id)?.name||id||"Choose model";
export const effortName=(id?:string)=>({auto:"Automatic",low:"Low",medium:"Medium",high:"High"}[id||"auto"]||words(id));
export const dateTime=(value?:number|string)=>{if(!value)return "Not recorded";const parsed=new Date(typeof value==="string"&&/^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)?value.replace(" ","T")+"Z":value);return Number.isNaN(parsed.getTime())?"Not recorded":parsed.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});};
export function StatusBadge({state}:{state?:string}){return <Badge variant="outline" className="gap-1.5 font-normal"><span aria-hidden className={`size-1.5 rounded-full ${["running","ready","published","succeeded","connected"].includes(state||"")?"bg-emerald-400":["failed","interrupted","blocked"].includes(state||"")?"bg-amber-400":"bg-muted-foreground"}`}/>{words(state)}</Badge>;}
export function PageHeading({title,description,action}:{title:string;description:string;action?:ReactNode}){return <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-1.5"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">{description}</p></div>{action}</div>;}
export function Section({title,description,children,action}:{title:string;description?:string;children:ReactNode;action?:ReactNode}){return <Card role="region" aria-label={title} className="min-w-0 gap-5 shadow-none"><CardHeader className="flex flex-row items-start justify-between gap-4"><div className="space-y-1.5"><CardTitle role="heading" aria-level={2} className="text-base">{title}</CardTitle>{description&&<CardDescription className="leading-relaxed">{description}</CardDescription>}</div>{action}</CardHeader><CardContent className="space-y-5 min-w-0">{children}</CardContent></Card>;}
export function Stat({label,value,detail}:{label:string;value:ReactNode;detail:string}){return <div className="min-w-0 border-l pl-4 first:border-l-0 first:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className="my-2 text-xl font-semibold tracking-tight">{value}</p><p className="text-xs text-muted-foreground leading-relaxed">{detail}</p></div>;}
