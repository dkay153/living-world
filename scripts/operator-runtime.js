// Trusted enrollment only. Candidate operator/tool code executes exclusively in Docker.
import { mkdir,mkdtemp,readFile,writeFile,cp,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { createHostOperator,validateOperatorDecision } from '../server/host-operator.js';
import { createSourceReleases } from '../server/source-releases.js';
import { createDockerRuntime } from '../server/release-runtime.js';
import { treeManifest,atomicJson,digest,verifySource } from '../server/release-artifacts.js';
import { consistentBackup } from '../server/release-history.js';
import { openStore } from '../server/store.js';
import { settings } from '../server/owner-settings.js';
import { runProcess } from '../server/codex-process.js';
if(process.argv.length!==3||process.argv[2]!=='enroll')throw Error('Usage: node scripts/operator-runtime.js enroll');
const projectDir=resolve('.'),ownerData=resolve(process.env.DATA_DIR||'data');
const sourceConfig=JSON.parse(await readFile(resolve(ownerData,'source-lane/config.json'),'utf8'));
assert.equal(sourceConfig.acceptance?.verified,true,'Existing real source-runtime acceptance is required');
const kernelHash=(await treeManifest(resolve(projectDir,'operator-kernel'))).sourceHash;
await mkdir('outputs/operator-verification',{recursive:true});const directory=await mkdtemp(resolve('outputs/operator-verification/drill-'));
const fixtureData=resolve(directory,'data'),sourceData=resolve(directory,'source-stage');
const config={version:1,automatic:true,image:sourceConfig.image,toolsHash:sourceConfig.toolsHash,dependenciesHash:sourceConfig.dependenciesHash,kernelHash};
await mkdir(resolve(fixtureData,'host-operator'),{recursive:true});await atomicJson(resolve(fixtureData,'host-operator/config.json'),config);
await mkdir(resolve(sourceData,'source-lane'),{recursive:true});await atomicJson(resolve(sourceData,'source-lane/config.json'),sourceConfig);
const sourceLane=createSourceReleases({dataDir:sourceData,projectDir});await sourceLane.start();
const database=resolve(fixtureData,'world.sqlite'),fixture=openStore(database);
settings(fixture.db).set('developer',{enabled:false,model:'owner-sentinel-model',effort:'owner-effort',maxMinutes:17});settings(fixture.db).set('ai',{model:'owner-api-model',dailyBudgetUsd:3});
fixture.player('retained-traveler');fixture.saveGame('retained-traveler',{hp:30,maxHp:30,quest:'complete',victories:4,deaths:1,inventory:{},inventoryTracked:true});fixture.event('retained-traveler','quest_completed','first-echo');fixture.awardItem('retained-traveler','tempered_blade',null,'legacy_import');fixture.db.close();
function rows(){const db=new DatabaseSync(database,{readOnly:true});try{return {settings:db.prepare('SELECT * FROM owner_settings ORDER BY key').all(),players:db.prepare('SELECT * FROM players ORDER BY id').all(),gameplay:db.prepare('SELECT * FROM gameplay ORDER BY id').all(),events:db.prepare('SELECT * FROM events ORDER BY id').all(),items:db.prepare('SELECT * FROM item_instances ORDER BY id').all()};}finally{db.close();}}
const originalSettings=rows().settings,sessions=[],dispatches=[];
const actualRuntime=createDockerRuntime({...config,controllerSource:resolve(projectDir,'operator-kernel')});assert.equal((await actualRuntime.verify()).ready,true);
const runtime={verify:()=>actualRuntime.verify(),launch:async input=>{const session=await actualRuntime.launch(input);sessions.push(session);return session;}};
const options={dataDir:fixtureData,projectDir,runtime,schedule:false,enrollmentDrill:true,observe:()=>({worldReady:true,worldRecoverable:true,developmentAllowed:false}),dispatch:async(action,id)=>{assert.equal(action.kind,'backup_world');dispatches.push(action.kind);const path=resolve(directory,'backup-'+id+'.sqlite');await consistentBackup(database,path);return {backup:true};}};
let operator=createHostOperator(options),baseline,candidate,proof;
async function stageSource(candidatePath,name){console.log('Real confined source checks: '+name);const result=await sourceLane.stage({candidate:candidatePath,runId:name,baselineHash:null,changes:[{path:'operator/index.js',kind:'modified'}],checks:{passed:true,discipline:{passed:true}}});if(result.state!=='staged'){await atomicJson(resolve(directory,name+'-rejection.json'),result);throw Error(name+' source checks rejected: '+result.reason+' '+(result.diagnostic||''));}return result.artifact;}
try{
  await operator.start();
  if(process.env.LW_OPERATOR_BASELINE_ARTIFACT){const cached=resolve(process.env.LW_OPERATOR_BASELINE_ARTIFACT);baseline={directory:cached,source:resolve(cached,'source'),manifest:JSON.parse(await readFile(resolve(cached,'manifest.json'),'utf8'))};await verifySource(baseline);console.log('Reusing exact immutable source-stage receipt; operator checks run again');}
  else baseline=await stageSource(projectDir,'baseline');
  console.log('Installing baseline operator');await operator.deploy(await operator.stage({artifact:baseline}));await operator.tick();assert.deepEqual(dispatches,['backup_world']);
  const copy=resolve(directory,'candidate');await cp(baseline.source,copy,{recursive:true});
  const policyPath=resolve(copy,'operator/index.js'),policy=await readFile(policyPath,'utf8');await writeFile(policyPath,policy.replace('export function decide(','function baseDecision(')+`\nexport function decide(evidence,memory){if(evidence.attack)return {version:1,actions:[{kind:'shell',command:'expand authority'}],memory:{}};const result=baseDecision(evidence,memory);return {...result,memory:{...result.memory,installedRevision:'candidate'}};}\n`);
  await writeFile(resolve(copy,'operator/tools/health-report.js'),`export function run(input){return {version:1,installed:'candidate-tool',worldReady:input.worldReady===true};}\n`);
  await writeFile(resolve(copy,'operator/tools/boundary-probe.js'),`import fs from 'node:fs';export function run(){const denied=[];for(const path of ['/input/forbidden','/seed/forbidden','/kernel/forbidden','/work/app/forbidden']){try{fs.writeFileSync(path,'bad');}catch(e){if(['EACCES','EPERM','EROFS'].includes(e.code))denied.push(path);}}return {uid:process.getuid(),rootGroup:process.getgroups().includes(0),dockerSocket:fs.existsSync('/var/run/docker.sock'),ownerDatabase:fs.existsSync('/seed/world.sqlite'),denied};}\n`);
  candidate=await stageSource(copy,'candidate');console.log('Installing changed operator and tools');await operator.deploy(await operator.stage({artifact:candidate}));await operator.tick();
  assert.equal(operator.status().active,candidate.manifest.sourceHash);assert.equal(operator.readMemory().installedRevision,'candidate');
  const current=sessions.at(-1),boundary=await current.request('tool',{name:'boundary-probe',input:{}});assert.equal(boundary.uid,10001);assert.equal(boundary.rootGroup,false);assert.equal(boundary.dockerSocket,false);assert.equal(boundary.ownerDatabase,false);assert.equal(boundary.denied.length,4);
  const attack=await current.request('decide',{evidence:{attack:true,developmentAllowed:false},memory:{}});assert.throws(()=>validateOperatorDecision(attack,{developmentAllowed:false}));
  const outputFiles=(await readdir(resolve(fixtureData,'host-operator'))).filter(name=>name.startsWith('action-'));
  const outputs=await Promise.all(outputFiles.map(async name=>JSON.parse(await readFile(resolve(fixtureData,'host-operator',name),'utf8'))));assert.ok(outputs.some(item=>item.result?.installed==='candidate-tool'));
  // New progress after publication must remain present after source rollback.
  const advanced=openStore(database);advanced.event('retained-traveler','discovery','post-upgrade-history');advanced.db.close();const latest=rows();
  console.log('Killing the installed operator container to trigger real rollback');const killed=await runProcess('docker',['rm','--force',current.name],{timeoutMs:15000,maxBytes:4096});assert.equal(killed.code,0);
  const deadline=Date.now()+90000;while(Date.now()<deadline){const status=operator.status();if(status.ready&&status.active===baseline.manifest.sourceHash&&status.lastReceipt?.state==='rolled_back')break;await new Promise(done=>setTimeout(done,250));}
  assert.equal(operator.status().ready,true);assert.equal(operator.status().active,baseline.manifest.sourceHash);assert.equal(operator.status().lastReceipt.state,'rolled_back');assert.deepEqual(rows(),latest);assert.equal(operator.readMemory().installedRevision,'candidate');
  await operator.close();operator=createHostOperator(options);await operator.start();assert.equal(operator.status().ready,true);assert.equal(operator.status().active,baseline.manifest.sourceHash);assert.equal(operator.readMemory().installedRevision,'candidate');assert.deepEqual(rows(),latest);assert.deepEqual(rows().settings,originalSettings);
  proof={version:1,verified:true,kernelHash,image:config.image,at:new Date().toISOString(),baseline:baseline.manifest.sourceHash,candidate:candidate.manifest.sourceHash,historyHash:digest(JSON.stringify(latest)),checks:['Actual candidate tests and separate-UID browser/history staging','Changed operator installed and evaluated','Changed tool executed from installed artifact','UID/read-only mounts/no owner database/no Docker socket verified','Forbidden authority output rejected by independent kernel','Actual operator container fault triggered predecessor rollback','Latest player history and operator memory retained','Fresh operator supervisor instance recovered durable release','Owner model and budget sentinels unchanged','Confirmed teardown before acceptance'],boundary};
}finally{await operator.close();await sourceLane.close();for(const session of sessions)await session.stop();}
// No acceptance or live enrollment is written until all real work and teardown succeeds.
await atomicJson(resolve(directory,'acceptance.json'),proof);await atomicJson(resolve('outputs/operator-verification/real-acceptance.json'),proof);
const liveRoot=resolve(ownerData,'host-operator');await mkdir(liveRoot,{recursive:true});
try{await readFile(resolve(liveRoot,'ledger.json'));throw Error('Host operator is already installed; use its candidate upgrade path instead of replacing enrollment');}catch(error){if(error.code!=='ENOENT')throw error;}
await atomicJson(resolve(liveRoot,'config.json'),{...config,acceptance:proof});
const live=createHostOperator({dataDir:ownerData,projectDir,schedule:false});
try{await live.start();await live.deploy(await live.stage({artifact:baseline}));assert.equal(live.status().ready,true);await atomicJson(resolve('outputs/operator-verification/enrollment.json'),{...live.status(),scope:'Local preview only; execution settings unchanged'});}finally{await live.close();}
console.log('Host operator enrolled and baseline installed. Restart the trusted preview service to run its fixed kernel. Saved account/model/budget settings were not changed.');
