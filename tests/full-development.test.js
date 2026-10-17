import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir,writeFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {validateProductionDependencies,buildDependencyRuntime} from '../server/dependency-releases.js';
import {runCodexHarness,harnessEvent} from '../server/codex-harness.js';
import {recoveryDecision} from '../server/automatic-recovery.js';
import {createHostRepair} from '../server/host-repair.js';
import {createServiceSupervisor} from '../server/service-supervisor.js';
import {validateToolRequest} from '../server/developer-tools.js';
import {snapshotProject,inspectChanges} from '../server/developer-sandbox.js';
import {assessSourceChanges,sealSource} from '../server/release-artifacts.js';

test('project skills survive source capture and edits are visible without admitting account configuration',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'lw-skill-capture-')),source=resolve(root,'source'),candidate=resolve(root,'candidate'),baseline=resolve(root,'baseline');
  try{
    for(const path of ['server','public','ui','config','tests','docs','scripts','runtime','node_modules/ws','.agents/skills/check'])await mkdir(resolve(source,path),{recursive:true});
    await writeFile(resolve(source,'package.json'),'{"type":"module","scripts":{"ui:build":"next build ui"}}');await writeFile(resolve(source,'package-lock.json'),'{}');await writeFile(resolve(source,'AGENTS.md'),'fixture');await writeFile(resolve(source,'node_modules/ws/package.json'),'{}');
    await writeFile(resolve(source,'.agents/skills/check/SKILL.md'),'---\nname: check\ndescription: Fixture\n---\nCheck the fixture.');
    const host=resolve(root,'host');await cp(source,host,{recursive:true});
    await mkdir(resolve(host,'.agents/skills/added'),{recursive:true});await writeFile(resolve(host,'.agents/skills/added/SKILL.md'),'New owner-provided skill');
    await writeFile(resolve(host,'.agents/skills/check/SKILL.md'),'Must not overwrite the existing evolved skill');await writeFile(resolve(host,'scripts/play-game.js'),'// helper fixture');
    await writeFile(resolve(host,'package.json'),'{"type":"module","scripts":{"ui:build":"next build ui --webpack"}}');
    const manifest=await snapshotProject(source,candidate,baseline,{dependencySource:host});assert.ok(manifest.files.some(f=>f.path==='.agents/skills/check/SKILL.md'));
    assert.equal(await readFile(resolve(candidate,'.agents/skills/added/SKILL.md'),'utf8'),'New owner-provided skill');assert.match(await readFile(resolve(candidate,'.agents/skills/check/SKILL.md'),'utf8'),/Check the fixture/);
    assert.equal(JSON.parse(await readFile(resolve(candidate,'package.json'),'utf8')).scripts['ui:build'],'next build ui --webpack');assert.equal(await readFile(resolve(candidate,'scripts/play-game.js'),'utf8'),'// helper fixture');
    await writeFile(resolve(candidate,'.agents/skills/check/SKILL.md'),'Updated fixture');const changes=await inspectChanges(candidate,baseline,manifest);assert.equal(changes[0].path,'.agents/skills/check/SKILL.md');
    assert.equal(assessSourceChanges(changes).passed,true);assert.equal(assessSourceChanges([{path:'.agents/config.toml',kind:'added'}]).passed,false);
    for(const path of ['server','public','ui','config','tests','docs','scripts','runtime'])await mkdir(resolve(candidate,path),{recursive:true});
    const artifact=await sealSource({candidate,output:resolve(root,'artifacts')});assert.ok(artifact.manifest.files.some(f=>f.path==='.agents/skills/check/SKILL.md'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('production dependencies retain host settings and reject registry, script, link and integrity escapes',async()=>{
  const p=JSON.parse(await readFile(new URL('../package.json',import.meta.url))),l=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url)));
  assert.equal(validateProductionDependencies(p,p,l),true);
  for(const mutate of [x=>x.scripts.test='evil',x=>x.engines.node='*',x=>x.overrides={ws:'file:evil'},x=>x.dependencies.ws='latest']){
    const next=structuredClone(p);mutate(next);assert.throws(()=>validateProductionDependencies(p,next,l));
  }
  for(const mutate of [x=>x.packages['node_modules/ws'].resolved='https://evil.test/a.tgz',x=>x.packages['node_modules/ws'].integrity='sha1-abc',x=>x.packages['node_modules/ws'].link=true,x=>x.packages['../escape']={version:'1.0.0'},x=>x.packages['node_modules/ws'].resolved='https://registry.npmjs.org@evil.test/a']){
    const next=structuredClone(l);mutate(next);assert.throws(()=>validateProductionDependencies(p,p,next));
  }
});

test('production installer has hard resource bounds, no candidate scripts/mounts and confirmed cleanup',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'lw-dependency-recipe-')),calls=[],image='sha256:'+'b'.repeat(64);let tools,dependencies;
  // Candidate copies deliberately exclude the independent operator kernel.
  // This mocked image recipe needs synthetic kernel data, never owner files.
  const trustedFixture=resolve(directory,'trusted-fixture');
  await mkdir(resolve(trustedFixture,'operator-kernel'),{recursive:true});
  await cp(resolve('runtime'),resolve(trustedFixture,'runtime'),{recursive:true});
  await cp(resolve('package.json'),resolve(trustedFixture,'package.json'));
  await writeFile(resolve(trustedFixture,'operator-kernel/controller.mjs'),"// Synthetic non-executed kernel fixture\nconst dependencyPath='/opt/lw-deps/node_modules';\n");
  const runner=async(binary,args,options)=>{calls.push({args,options});
    if(args[0]==='commit'){tools=args.find(v=>v.startsWith('LABEL io.living-world.tools-hash=')).split('=')[1];dependencies=args.find(v=>v.startsWith('LABEL io.living-world.dependencies-hash=')).split('=')[1];return {code:0,stdout:image};}
    if(args[0]==='build'){const file=await readFile(args[args.indexOf('--file')+1],'utf8');assert.ok(!file.includes('RUN npm'));tools=file.match(/tools-hash=([a-f0-9]+)/)[1];dependencies=file.match(/dependencies-hash=([a-f0-9]+)/)[1];await writeFile(args[args.indexOf('--iidfile')+1],image);}
    if(args[0]==='image'&&args[1]==='inspect')return {code:0,stdout:image+' linux '+tools+' '+dependencies};
    return {code:0,stdout:''};
  };
  try{const r=await buildDependencyRuntime({source:resolve('.'),projectDir:trustedFixture,directory,config:{image:'sha256:'+'a'.repeat(64),toolsHash:'d'.repeat(64)},runner});assert.equal(r.image,image);
    const provision=calls.find(c=>c.args[0]==='run').args;assert.ok(provision.includes('4g'));assert.ok(provision.includes('2'));assert.ok(provision.includes('128'));assert.equal(provision.filter(s=>s.includes('type=bind')).length,1);assert.ok(provision.some(s=>s.endsWith('target=/assembly-runtime,readonly')));assert.ok(!provision.some(s=>s.includes('world.sqlite')));
    assert.ok(calls.some(c=>c.args.some(v=>v.includes('(i.mode&0o111)?0o555:0o444'))));const install=calls.find(c=>c.args.includes('ci')).args;assert.ok(install.includes('--ignore-scripts'));assert.ok(install.includes('10002:10002'));
    assert.ok(calls.some(c=>c.args[0]==='rm'&&c.args[1]==='--force'));assert.ok(calls.some(c=>c.args[0]==='ps'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('native harness retains terminal thread, fixed model/profile and only public item events',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'lw-harness-')),calls=[],events=[];let notify;
  const rpcFactory=options=>{notify=options.onNotification;return {request:async(method,params)=>{calls.push({method,params});
    if(method==='thread/fork')return {thread:{id:'native-thread'}};
    if(method==='skills/list')return {data:[{skills:[{name:'project-check'}]}]};
    if(method==='turn/start'){setImmediate(()=>{notify('item/completed',{threadId:'native-thread',item:{id:'public',type:'agentMessage',text:'Tests passed',phase:'commentary'}});notify('item/completed',{item:{id:'private',type:'reasoning',text:'secret'}});notify('turn/completed',{threadId:'native-thread',turn:{id:'turn1',status:'completed'}});});return {turn:{id:'turn1'}};}
    return {};},close:async()=>{}};};
  try{
    const stateFile=resolve(directory,'state.json'),result=await runCodexHarness('codex',['exec','-m','owner-model','-c','model_reasoning_effort=high'],{cwd:directory,env:{CODEX_HOME:directory},input:'repair',harness:{stateFile,previous:{threadId:'retained',status:'interrupted'}},rpcFactory,onLine:s=>events.push(JSON.parse(s))});
    assert.equal(result.code,0);assert.equal(JSON.parse(await readFile(stateFile,'utf8')).status,'completed');
    assert.equal(calls[0].method,'thread/fork');assert.equal(calls[0].params.cwd,directory);assert.equal(calls[0].params.model,'owner-model');assert.equal(calls[0].params.config.default_permissions,'living-world');assert.equal(calls[0].params.sandbox,undefined);
    assert.equal(calls.find(c=>c.method==='turn/start').params.effort,'high');assert.ok(events.some(e=>e.item?.text==='Tests passed'));assert.ok(!JSON.stringify(events).includes('secret'));
    assert.equal(calls.find(c=>c.method==='turn/start').params.summary,'concise');assert.equal(calls[0].params.config.web_search,'live');
    assert.equal(harnessEvent('item/reasoning/textDelta',{delta:'private'}),null);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Stop uses native interrupt and an uncertain old thread is never forked or replayed',async()=>{
  const abort=new AbortController(),calls=[];let notify;
  const rpcFactory=options=>{notify=options.onNotification;return {request:async(method,params)=>{calls.push(method);
    if(method==='thread/start')return {thread:{id:'fresh'}};
    if(method==='turn/start'){setImmediate(()=>abort.abort());return {turn:{id:'turn'}};}
    if(method==='turn/interrupt')notify('turn/completed',{threadId:'fresh',turn:{id:'turn',status:'interrupted'}});
    return {};},close:async()=>{}};};
  const result=await runCodexHarness('codex',['exec','-m','saved','-c','model_reasoning_effort=high'],{cwd:process.cwd(),env:{CODEX_HOME:process.cwd()},signal:abort.signal,input:'new diagnosis',harness:{previous:{threadId:'uncertain',status:'uncertain'}},rpcFactory});
  assert.equal(result.cancelled,true);assert.equal(result.code,1);assert.ok(calls.includes('turn/interrupt'));assert.ok(!calls.includes('thread/fork'));
});

test('automatic recovery backs off, never changes settings and skips questions, Stop and account blockers',()=>{
  const row={id:'run',state:'failed',origin:'autonomous',task:'Improve commands',created_at:0,finished_at:1000,error:'Contained check failed',context:'{}'};
  assert.equal(recoveryDecision(row,1001).ready,false);assert.equal(recoveryDecision(row,301000).ready,true);
  const repeated={...row,context:JSON.stringify({automaticRecovery:{attempt:2,rootRun:'root'}})};
  assert.equal(recoveryDecision(repeated,301000).ready,false);assert.equal(recoveryDecision(repeated,21601000).ready,true);assert.equal(recoveryDecision(repeated,21601000).attempt,3);
  for(const patch of [{state:'cancelled'},{origin:'owner_question'},{error:'account_auth'},{error:'account_limit'},{state:'running'}])assert.equal(recoveryDecision({...row,...patch},99999999),null);
  assert.equal(row.context,'{}');assert.match(recoveryDecision(row,301000).task,/NEW checked attempt/);
});

test('typed host repair verifies readiness, records effects, backs off and rejects arbitrary host commands',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'lw-host-repair-'));let ready=false,recovered=0;
  try{
    const repair=createHostRepair({directory,sources:{status:()=>({ready,configured:true}),refresh:async()=>({ready:false,configured:true}),rollback:async()=>{recovered++;ready=true;}},clock:()=>1000000});
    assert.equal((await repair.request({service:'realm',operation:'repair'})).passed,true);assert.equal(recovered,1);
    assert.equal((await repair.request({service:'realm',operation:'repair'})).changed,false);
    ready=false;await assert.rejects(repair.request({service:'realm',operation:'repair'}),/backoff/);
    await assert.rejects(repair.request({service:'shell',operation:'repair'}),/Unknown/);
    assert.throws(()=>validateToolRequest({action:'host',service:'realm',operation:'repair',argv:['evil']}));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('launcher restarts only owned children with backoff and never restarts after shutdown',async()=>{
  const children=[],timers=[],stopped=[];
  const supervisor=createServiceSupervisor({spawnService:args=>{const child=new EventEmitter();child.args=args;children.push(child);return child;},stopService:async child=>{stopped.push(child);child.emit('exit',0);},setTimer:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimer:t=>{if(t)t.cancelled=true;}});
  supervisor.start('renderer',['trusted-renderer']);children[0].emit('exit',1);assert.equal(timers[0].ms,1000);timers[0].fn();assert.deepEqual(children[1].args,['trusted-renderer']);
  children[1].emit('exit',1);assert.equal(timers[1].ms,5000);timers[1].fn();await supervisor.close();assert.equal(stopped.length,1);assert.equal(children.length,3);assert.equal(timers.length,2);
  await assert.rejects(supervisor.repair('unowned'),/not owned/);
});
