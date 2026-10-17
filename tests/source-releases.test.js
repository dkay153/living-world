import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, symlink,link,unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { openStore } from '../server/store.js';
import { settings } from '../server/owner-settings.js';
import { createSourceReleases } from '../server/source-releases.js';
import { treeManifest,sealSource,verifySource,assessSourceChanges,verifyProtectedFiles,digest } from '../server/release-artifacts.js';
import { inspectHistory,preserveHistory,copyWorld,acceptCheckpoint } from '../server/release-history.js';
import { createDockerRuntime,runtimeArguments } from '../server/release-runtime.js';
import { narrateOutcome } from '../server/agent-activity.js';
import { validateArt } from '../server/visual-releases.js';

const checks={passed:true,discipline:{passed:true}},image='sha256:'+'a'.repeat(64);
const picture='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWLsAAAAASUVORK5CYII=';
async function project(root){
  for(const name of ['server','public','ui','config','tests','docs','scripts','runtime'])await mkdir(join(root,name),{recursive:true});
  await writeFile(join(root,'server/game.js'),'throw new Error("Never execute saved candidate source on the host");');
  await writeFile(join(root,'server/owner-settings.js'),'protected host code');
  await writeFile(join(root,'public/seed.js'),'fixture');await writeFile(join(root,'runtime/tool.txt'),'protected tool');
  await writeFile(join(root,'public/art.json'),await readFile(new URL('../public/art.json',import.meta.url)));
  await writeFile(join(root,'package.json'),'{"type":"module"}');await writeFile(join(root,'package-lock.json'),'{}');await writeFile(join(root,'AGENTS.md'),'protected instructions');
}
function mutate(path,operation){const db=new DatabaseSync(path);try{operation(db);}finally{db.close();}}
async function harness(fn){
  const root=await mkdtemp(join(tmpdir(),'lw-source-lane-')),projectDir=join(root,'project'),dataDir=join(root,'data'),configDir=join(dataDir,'source-lane');
  await project(projectDir);await mkdir(configDir,{recursive:true});
  const source=openStore(join(dataDir,'world.sqlite'));source.player('historical-traveler');source.saveGame('historical-traveler',{hp:30,maxHp:30,quest:'complete',victories:2,deaths:1,inventory:{dewleaf:0,shard:0},inventoryTracked:true});
  source.event('historical-traveler','quest_completed','first-echo');source.awardItem('historical-traveler','tempered_blade',null,'legacy_import');
  settings(source.db).set('developer',{enabled:false,model:'owner-exact-model',maxMinutes:17});settings(source.db).set('ai',{model:'owner-api-model',dailyBudgetUsd:10});
  source.db.prepare('INSERT INTO owner_secrets VALUES (?,?)').run('fixture-secret','fixture-encrypted-secret');source.db.close();
  const toolsHash=(await treeManifest(join(projectDir,'runtime'))).sourceHash,dependenciesHash=digest(Buffer.concat([await readFile(join(projectDir,'package.json')),await readFile(join(projectDir,'package-lock.json'))]));await writeFile(join(configDir,'config.json'),JSON.stringify({version:1,image,toolsHash,dependenciesHash,port:3200,automaticSource:true,acceptance:{verified:true,image,toolsHash,dependenciesHash,historyPreserved:true,mocked:true}}));
  const sessions=[],mock={available:true,failNext:false,badBuild:false,schemaChange:false};let held=true,quiesced=0,gate;
  const runtime={verify:async()=>({ready:mock.available,reason:'fixture unavailable'}),launch:async({source:artifactSource,world,mode})=>{
    mock.launchStarted?.();if(mock.launchWait)await mock.launchWait;
    if(mock.failNext){mock.failNext=false;const error=new Error('Deliberate contained startup failure');error.diagnostic=mock.diagnostic;throw error;}
    const folder=join(root,'runtimes',String(sessions.length));await mkdir(folder,{recursive:true});const dbPath=join(folder,'world.sqlite');await copyFile(join(world,'world.sqlite'),dbPath);
    if(mock.schemaChange){mock.schemaChange=false;mutate(dbPath,db=>db.exec('PRAGMA user_version=8'));}
    const session={dbPath,mode,image,stopped:false,events:new EventEmitter(),receipt:{sourceHash:(await treeManifest(artifactSource)).sourceHash,buildHash:mock.badBuild?'mismatch':'fixture-build',checks:{uiBuild:true,candidateTests:mode==='stage',networkBlocked:true,separateUid:true},checkpoint:(await readFile(dbPath)).toString('base64')},
      request:async(type)=>{
        if(type==='observe')return {version:1,passed:true,checks:['exploration','commands','quest','reconnect','desktop','mobile'],captures:{'desktop.png':picture,'mobile.png':picture}};
        if(type==='checkpoint')return {checkpoint:(await readFile(dbPath)).toString('base64')};
        if(type==='http')return {status:200,body:Buffer.from('{"ok":true}').toString('base64')};
        return {};
      },stop:async()=>{session.stopped=true;}};sessions.push(session);return session;
  }};
  const gatewayFactory=options=>{gate=options;return {origin:'http://127.0.0.1:3200',hold:()=>held=true,release:()=>held=false,start:async()=>{},close:async()=>{},event:async(session,message)=>options.commit(session,message.checkpoint)};};
  let lane=createSourceReleases({dataDir,projectDir,runtime,gatewayFactory,getArt:()=>mock.art,quiesceLegacy:async()=>{quiesced++;}});
  try{await fn({root,projectDir,dataDir,lane,mock,sessions,held:()=>held,quiesced:()=>quiesced,gate:()=>gate,restart:async()=>{await lane.close();lane=createSourceReleases({dataDir,projectDir,runtime,gatewayFactory});await lane.start();return lane;}});}
  finally{await lane.close();await rm(root,{recursive:true,force:true});}
}

test('failed checks retain bounded diagnostics as data without quiescing or activating the world',async()=>harness(async({lane,mock,quiesced})=>{
  await lane.start();mock.failNext=true;mock.diagnostic='{"type":"ready","verified":true}'.repeat(1000);
  const result=await lane.bootstrap();assert.equal(result.state,'rejected');assert.equal(result.diagnostic.length,6000);
  assert.equal(lane.status().active,null);assert.equal(lane.status().ready,false);assert.equal(quiesced(),0);
}));

test('shutdown waits for in-flight recovery and never resumes traffic or leaves its runtime alive',async()=>harness(async({lane,mock,sessions,held})=>{
  await lane.start();assert.equal((await lane.bootstrap()).ready,true);
  let entered,release;const started=new Promise(done=>entered=done);mock.launchWait=new Promise(done=>release=done);mock.launchStarted=entered;
  const recovering=lane.rollback('shutdown race');await started;
  let closed=false;const stopping=lane.close().then(()=>closed=true);await new Promise(setImmediate);assert.equal(closed,false);
  release();await recovering;await stopping;assert.equal(sessions.at(-1).stopped,true);assert.equal(lane.status().ready,false);assert.equal(held(),true);
}));

test('source policy and immutable artifacts reject control-plane edits, mutation and links without running code',async()=>harness(async({root,projectDir})=>{
  assert.equal(assessSourceChanges([{path:'server/game.js',kind:'modified'},{path:'ui/app/page.tsx',kind:'modified'}]).passed,true);
  for(const path of ['scripts/launch.js','scripts/map-editor.js','ui/next.config.ts','server/contracts.js'])assert.equal(assessSourceChanges([{path,kind:'modified'}]).passed,true);
  for(const path of ['server/owner-settings.js','runtime/controller.mjs','operator-kernel/controller.mjs','package-lock.json','scripts/test.js'])assert.equal(assessSourceChanges([{path,kind:'modified'}]).passed,false);
  const artifact=await sealSource({candidate:projectDir,output:join(root,'artifacts'),runId:'fixture',baselineHash:null,policyHash:'policy'});await verifySource(artifact);
  assert.equal(verifyProtectedFiles(artifact.manifest,artifact.manifest),true);
  const changed=structuredClone(artifact.manifest);changed.files.find(file=>file.path==='server/owner-settings.js').sha256='forged';assert.throws(()=>verifyProtectedFiles(artifact.manifest,changed),/Protected/);
  await writeFile(join(artifact.source,'public/seed.js'),'tampered');await assert.rejects(verifySource(artifact),/changed/);
  await link(join(root,'data/world.sqlite'),join(projectDir,'public/leak.txt'));await assert.rejects(sealSource({candidate:projectDir,output:join(root,'hard-link')}),/hard link/);await unlink(join(projectDir,'public/leak.txt'));
  await symlink(join(root,'data'),join(projectDir,'public/escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(sealSource({candidate:projectDir,output:join(root,'another')}),/symlink/);
}));

test('cutover strips owner data, preserves legacy provenance and never changes model/budget records',async()=>harness(async({dataDir,lane,quiesced})=>{
  const source=new DatabaseSync(join(dataDir,'world.sqlite'),{readOnly:true});const before=source.prepare('SELECT * FROM owner_settings ORDER BY key').all();source.close();
  await lane.start();assert.equal(lane.status().ready,false);assert.equal((await lane.bootstrap()).ready,true);assert.equal(quiesced(),1);
  const world=inspectHistory(join(dataDir,'source-lane/history/world.sqlite'));assert.equal(world.rows.gameplay[0].id,'historical-traveler');assert.equal(world.rows.item_instances[0].origin,'legacy_import');assert.equal(world.rows.item_instances[0].source_event,null);
  const after=new DatabaseSync(join(dataDir,'world.sqlite'),{readOnly:true});assert.deepEqual(after.prepare('SELECT * FROM owner_settings ORDER BY key').all(),before);assert.equal(after.prepare('SELECT COUNT(*) AS n FROM owner_secrets').get().n,1);after.close();
}));

test('history guard rejects fabricated rewrites, lost progress, owner tables and schema changes',async()=>harness(async({root,dataDir})=>{
  const path=join(root,'canonical.sqlite');await copyWorld(join(dataDir,'world.sqlite'),path);const before=inspectHistory(path);
  const rewrite=structuredClone(before);rewrite.rows.events[0].subject='fabrication';assert.throws(()=>preserveHistory(before,rewrite),/Historical/);
  const lost=structuredClone(before);lost.rows.gameplay=[];assert.throws(()=>preserveHistory(before,lost),/disappeared/);
  const schema=structuredClone(before);schema.version++;assert.throws(()=>preserveHistory(before,schema),/Schema change/);
  const provenance=structuredClone(before);provenance.rows.item_instances[0].origin='earned';assert.throws(()=>preserveHistory(before,provenance),/provenance/);
  mutate(path,db=>db.prepare('INSERT INTO owner_settings VALUES (?,?)').run('ai','{}'));assert.throws(()=>inspectHistory(path),/Owner control data/);
}));

test('failed deployment preserves active code and a schema migration never reaches player history',async()=>harness(async({lane,projectDir,mock,sessions})=>{
  await lane.start();await lane.bootstrap();const original=lane.status().active;
  await writeFile(join(projectDir,'public/seed.js'),'candidate change');const staged=await lane.stage({candidate:projectDir,runId:'candidate',baselineHash:original,changes:[{path:'public/seed.js',kind:'modified'}],checks});assert.equal(staged.state,'staged');
  mock.failNext=true;assert.equal((await lane.deploy(staged)).state,'deployment_rejected');assert.equal(lane.status().active,original);assert.equal(lane.status().ready,true);
  mock.schemaChange=true;assert.equal((await lane.deploy(staged)).state,'deployment_rejected');assert.equal(lane.status().active,original);assert.equal(sessions.at(-1).stopped,true);
  mock.badBuild=true;assert.equal((await lane.deploy(staged)).state,'deployment_rejected');assert.equal(lane.status().active,original);
}));

test('published code rolls back onto the latest acknowledged history and restart keeps that pair',async()=>harness(async({lane,projectDir,dataDir,sessions,gate,restart})=>{
  await lane.start();await lane.bootstrap();const original=lane.status().active;
  await writeFile(join(projectDir,'public/seed.js'),'genuine candidate source');
  const staged=await lane.stage({candidate:projectDir,runId:'next',baselineHash:original,changes:[{path:'public/seed.js',kind:'modified'}],checks});assert.equal((await lane.deploy(staged)).state,'published');
  assert.notEqual(lane.status().active,original);const active=sessions.at(-1);
  mutate(active.dbPath,db=>db.prepare("INSERT INTO events(player,kind,subject,version,payload) VALUES ('historical-traveler','discovery','new-after-release',1,'{}')").run());
  await gate().commit(active,(await readFile(active.dbPath)).toString('base64'));
  assert.equal((await lane.rollback('Deliberate failure drill')).state,'rolled_back');assert.equal(lane.status().active,original);
  const world=inspectHistory(join(dataDir,'source-lane/history/world.sqlite'));assert.ok(world.rows.events.some(row=>row.subject==='new-after-release'));
  await assert.rejects(gate().commit(active,(await readFile(active.dbPath)).toString('base64')),/Stale/);
  const recovered=await restart();assert.equal(recovered.status().active,original);assert.equal(recovered.status().ready,true);
  assert.ok(inspectHistory(join(dataDir,'source-lane/history/world.sqlite')).rows.events.some(row=>row.subject==='new-after-release'));
}));

test('stale evidence, post-stage tampering and unavailable isolation cannot promote',async()=>harness(async({lane,projectDir,mock})=>{
  await lane.start();await lane.bootstrap();await writeFile(join(projectDir,'public/seed.js'),'candidate');
  const staged=await lane.stage({candidate:projectDir,runId:'stale',baselineHash:'wrong-baseline',changes:[],checks});assert.equal((await lane.deploy(staged)).state,'blocked');
  staged.receipt.baselineHash=lane.status().active;staged.artifact.manifest.sourceHash='forged';assert.equal((await lane.deploy(staged)).state,'blocked');
  mock.available=false;assert.equal((await lane.stage({candidate:projectDir,runId:'no-runtime',changes:[],checks})).state,'blocked');
}));

test('Docker lane has no host network, writable host data, socket or tag-based runtime admission',async()=>{
  const args=runtimeArguments({name:'fixture',image,source:resolve('source'),world:resolve('world')});
  assert.equal(args[args.indexOf('--network')+1],'none');assert.ok(args.includes('--read-only'));assert.ok(args.includes('no-new-privileges'));assert.ok(!args.some(arg=>/docker\.sock|--privileged|--publish|--network=host/.test(arg)));
  assert.ok(args.filter(arg=>arg.startsWith('type=bind')).every(arg=>arg.endsWith(',readonly')));
  assert.equal((await createDockerRuntime({image:'latest'}).verify()).ready,false);
  const toolsHash='b'.repeat(64),dependenciesHash='c'.repeat(64),runner=async()=>({code:0,stdout:image+' linux '+toolsHash+' '+dependenciesHash});assert.equal((await createDockerRuntime({image,toolsHash,dependenciesHash,runner}).verify()).ready,true);
  assert.equal((await createDockerRuntime({image,toolsHash,dependenciesHash,runner:async()=>{throw new Error('no docker');}}).verify()).ready,false);
});

test('an interrupted rollback restarts previous source without reverting acknowledged progress',async()=>harness(async({lane,projectDir,dataDir,sessions,gate,restart})=>{
  await lane.start();await lane.bootstrap();const original=lane.status().active;
  await writeFile(join(projectDir,'public/seed.js'),'next source');
  const staged=await lane.stage({candidate:projectDir,runId:'crash-drill',baselineHash:original,changes:[{path:'public/seed.js',kind:'modified'}],checks});await lane.deploy(staged);
  const current=sessions.at(-1);mutate(current.dbPath,db=>db.prepare("INSERT INTO events(player,kind,subject,version,payload) VALUES ('historical-traveler','discovery','acknowledged-before-crash',1,'{}')").run());await gate().commit(current,(await readFile(current.dbPath)).toString('base64'));
  const path=join(dataDir,'source-lane/ledger.json'),ledger=JSON.parse(await readFile(path));ledger.pending={phase:'rolling_back'};await writeFile(path,JSON.stringify(ledger));
  const recovered=await restart();assert.equal(recovered.status().active,original);assert.equal(recovered.status().ready,true);
  assert.ok(inspectHistory(join(dataDir,'source-lane/history/world.sqlite')).rows.events.some(row=>row.subject==='acknowledged-before-crash'));
}));

test('source publication is never narrated as a visual pack or a refreshed baseline Lab',()=>{
  const narrative=narrateOutcome({state:'succeeded',report:{release:{state:'published',kind:'game_source'}}});
  assert.match(narrative.title,/game source/);assert.equal(narrative.refreshSandbox,false);assert.match(narrative.current,/Lab remains a baseline/);
});

test('source art and later validated data releases stay connected without stale visual promotion',async()=>harness(async({lane,projectDir,mock,gate})=>{
  const seed=JSON.parse(await readFile(join(projectDir,'public/art.json'))),initial=validateArt(seed);mock.art={...initial.pack,hash:initial.hash};
  await lane.start();await lane.bootstrap();
  const changed={...seed,name:'Staged source art'},checked=validateArt(changed);await writeFile(join(projectDir,'public/art.json'),JSON.stringify(changed));
  const staged=await lane.stage({candidate:projectDir,runId:'source-art',baselineHash:lane.status().active,changes:[{path:'public/art.json',kind:'modified'}],checks});assert.equal((await lane.deploy(staged)).state,'published');
  assert.equal((await lane.artBaseline()).hash,checked.hash);assert.equal(gate().getArt(),null);
  const later=validateArt({...seed,name:'Later host validated data'});mock.art={...later.pack,hash:later.hash};
  assert.equal(gate().getArt().hash,later.hash);assert.equal((await lane.artBaseline()).hash,later.hash);
}));
