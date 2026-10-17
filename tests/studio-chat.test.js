import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createStudioChat } from '../server/studio-chat.js';

test('Ask queues a read-only conversation with the ready saved account, while Plan remains context',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lw-studio-ask-')),store=openStore(join(dir,'world.sqlite'));try{
  let calls=0;const developer={status:()=>({config:{enabled:true,model:'saved-model'},models:[{id:'saved-model'}],connection:{connected:true},sandbox:{ok:true},limits:[],runs:[]}),enqueue:async(input,origin)=>{calls++;assert.equal(origin,'owner_question');store.db.prepare("INSERT INTO jobs(id,kind,input,unique_key,created_at,available_at) VALUES ('question','codex_development','{}','question-fixture',1000,1000)").run();store.db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at) VALUES ('question',?,?,'saved-model',1,'queued',1000)").run(input.requestKey,input.task);return {id:'question'};}};
  const studio=createStudioChat({store,developer,clock:()=>1000});const reply=await studio.post({mode:'ask',body:'What does the Warden recovery turn do?'});assert.equal(reply.posted.queued,true);await studio.post({mode:'plan',body:'Keep saved progress safe.'});assert.equal(calls,1);assert.equal(studio.status().messages.find(m=>m.speaker==='owner'&&m.evidence.interaction==='ask').run_id,'question');
 }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('owner direction is retained when the autonomous developer is unavailable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-studio-')),store=openStore(join(dir,'world.sqlite'));
  try{
    const developer={status:()=>({config:{enabled:false},connection:{connected:false},sandbox:{ok:false},staging:{ready:false,reason:'No staging runtime'}}),enqueue:async()=>{throw Object.assign(new Error('Connect developer first'),{status:400});}};
    const studio=createStudioChat({store,developer,clock:()=>1000});const result=await studio.post({mode:'agent',body:'Observe the first encounter and retain it unless evidence shows a real issue.'});
    assert.equal(result.posted.queued,false);const message=studio.status().messages[0];assert.equal(message.speaker,'owner');assert.equal(message.status,'blocked');assert.match(result.posted.reason,/Connect developer/);
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('Ask and Plan retain durable context without queuing the autonomous developer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-studio-')),store=openStore(join(dir,'world.sqlite'));
  try{
    let queued=0;const developer={status:()=>({config:{enabled:false},connection:{connected:false},sandbox:{ok:false},staging:{ready:false,reason:'No staging runtime'}}),enqueue:async()=>{queued++;}};
    const studio=createStudioChat({store,developer,clock:()=>1000});
    const question=await studio.post({mode:'ask',body:'Does the current lab make encounter commands readable?' });
    const plan=await studio.post({mode:'plan',body:'Keep command-driven battles; improve legibility before adding more systems.' });
    assert.equal(question.posted.mode,'ask');assert.equal(plan.posted.mode,'plan');assert.equal(question.posted.queued,false);assert.equal(plan.posted.queued,false);assert.equal(queued,0);
    const owner=studio.status().messages.filter(message=>message.speaker==='owner');
    assert.deepEqual(owner.map(message=>message.evidence.interaction),['ask','plan']);
    assert.match(studio.status().messages.find(message=>message.evidence?.interaction==='plan'&&message.speaker==='system').body,/Plan context retained/);
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('a completed developer attempt becomes an evidence-labelled studio finding',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-studio-')),store=openStore(join(dir,'world.sqlite'));
  try{
    store.db.prepare("INSERT INTO jobs(id,unique_key,kind,input,available_at,created_at) VALUES ('run','unique','codex_development','{}',0,0)").run();
    store.db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at,report) VALUES ('run','request','task','model',1,'succeeded',0,?)").run(JSON.stringify({decision:{title:'Candidate finding'},evaluation:{state:'proposal_retained'},promotion:{state:'blocked'}}));
    const developer={status:()=>({config:{enabled:false},connection:{connected:false},sandbox:{ok:false},staging:{ready:false,reason:'No staging runtime'}}),enqueue:async()=>{}};
    const studio=createStudioChat({store,developer,clock:()=>1000});const finding=studio.status().messages.find(message=>message.speaker==='agent');assert.equal(finding.body,'Candidate finding');assert.equal(finding.status,'completed');assert.equal(finding.evidence.verified,false);
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('World Lab status is retained as a host conversation observation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-studio-')),store=openStore(join(dir,'world.sqlite'));
  try{
    const developer={status:()=>({config:{enabled:false},connection:{connected:false},sandbox:{ok:false},staging:{ready:false,reason:'No staging runtime'}}),enqueue:async()=>{}};
    const studio=createStudioChat({store,developer,clock:()=>1000});studio.recordSystem({body:'A fresh Current-source World Lab is running.',status:'working',evidence:{source:'world_lab',action:'start'}});
    const entry=studio.status().messages.find(message=>message.speaker==='system');assert.equal(entry.kind,'status');assert.equal(entry.status,'working');assert.deepEqual(entry.evidence,{source:'world_lab',action:'start'});
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('developer activity becomes one durable transcript event per real state change',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-studio-')),store=openStore(join(dir,'world.sqlite'));
  try{
    const activity={state:'waiting_allowance',phase:'Waiting for provider allowance',narration:'The connected account is waiting for provider capacity.',detail:'Reset recorded by provider.'};
    const developer={activity:()=>activity,status:()=>({config:{enabled:true,model:'auto'},models:[{id:'gpt'}],limits:[],connection:{connected:true},sandbox:{ok:true},staging:{ready:false,reason:'No staging runtime'},runs:[]}),enqueue:async()=>{}};
    const studio=createStudioChat({store,developer,clock:()=>1000});
    const first=studio.status().messages.filter(message=>message.evidence.source==='developer_activity');
    assert.equal(first.length,1);assert.equal(first[0].body,'Waiting for provider capacity');assert.equal(first[0].evidence.presentation.next,'Routing resumes when the provider exposes available capacity.');
    assert.equal(studio.status().messages.filter(message=>message.evidence.source==='developer_activity').length,1);
    activity.phase='Checking project account';activity.narration='The host is checking account state.';
    assert.equal(studio.status().messages.filter(message=>message.evidence.source==='developer_activity').length,2);
  }finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});

test('paused questions keep the suspended task; Agent follow-up resumes that exact task',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lw-paused-studio-')),store=openStore(join(dir,'world.sqlite'));let asked=0,resumed=0;
 for(const id of ['answer','continued']){store.db.prepare("INSERT INTO jobs(id,kind,input,unique_key,created_at,available_at) VALUES (?,'codex_development','{}',?,1000,1000)").run(id,id);store.db.prepare("INSERT INTO developer_runs(id,request_key,task,model,max_minutes,state,created_at) VALUES (?,?,'fixture','saved',1,'queued',1000)").run(id,id);}
 const target={id:'earlier-task',task:'Improve encounters',state:'cancelled'};
 const developer={status:()=>({config:{enabled:false,model:'saved'},models:[{id:'saved'}],connection:{connected:true},sandbox:{ok:true},limits:[],runs:[{id:'newer-question'}],resumeTarget:target}),enqueue:async(input,origin,context)=>{asked++;assert.equal(origin,'owner_question');assert.deepEqual(context.suspendedTask,target);return {id:'answer'};},resumeRun:async input=>{resumed++;assert.equal(input.id,'earlier-task');assert.equal(input.text,'Continue the earlier task');return {id:'continued'};}};
 try{const studio=createStudioChat({store,developer});assert.equal(studio.status().ready,false);assert.equal(studio.status().questionReady,true);assert.equal((await studio.post({mode:'ask',body:'What remains?'})).posted.queued,true);assert.equal(asked,1);assert.equal(resumed,0);assert.equal((await studio.post({mode:'agent',body:'Continue the earlier task'})).posted.queued,true);assert.equal(resumed,1);assert.equal(asked,1);assert.equal(developer.status().config.enabled,false);}finally{store.db.close();await rm(dir,{recursive:true,force:true});}
});
