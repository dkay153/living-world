import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync,rmSync,readFileSync,unlinkSync,writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createSteward } from '../server/steward.js';
import { createAdmin } from '../server/admin.js';
import { createOwnerTicket } from '../server/owner-auth.js';
import { createSecretStore,settings } from '../server/owner-settings.js';
import { publicIdentity } from '../server/memory.js';
import { migrate,SCHEMA_VERSION } from '../server/migrations.js';
async function harness(fn){
  const dir=mkdtempSync(join(tmpdir(),'lw-admin-')),store=openStore(join(dir,'world.sqlite'));let now=100000;
  const steward=createSteward(store,()=>now),calls=[];
  const admin=createAdmin({store,steward,dataDir:dir,backupDir:join(dir,'backups'),clock:()=>now,fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:[{id:'owner-chosen-model'}]})};}});
  const server=http.createServer(async(req,res)=>{if(!await admin.handle(req,res)){res.writeHead(404);res.end();}});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='',csrf='';
  async function request(path,body,headers={}){const response=await fetch(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json',Origin:base,'X-Owner-CSRF':csrf}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return response;}
  async function login(ticket=createOwnerTicket(store.db,()=>now)){const response=await request('login',{ticket});if(response.ok){cookie=response.headers.get('set-cookie').split(';')[0];csrf=(await response.json()).csrf;}return {response,ticket};}
  try{await fn({dir,store,steward,request,login,calls,advance:ms=>{now+=ms;},base});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();rmSync(dir,{recursive:true,force:true});}
}
test('owner data requires independent authentication and mutations require CSRF + origin',async()=>harness(async({request,login,base})=>{
  assert.equal((await request('overview')).status,401);
  assert.equal((await request('developer')).status,401);
  assert.equal((await request('developer/login',{type:'chatgpt'})).status,401);
  assert.equal((await request('overview',undefined,{Cookie:'lw_session='+('a'.repeat(64))})).status,401);
  const {ticket}=await login();assert.equal((await request('overview')).status,200);
  assert.equal((await request('login',{ticket})).status,401);
  assert.equal((await request('worker',{action:'pause'},{'X-Owner-CSRF':''})).status,403);
  assert.equal((await request('worker',{action:'pause'},{Origin:'http://untrusted.invalid'})).status,403);
  assert.equal((await request('developer/login',{type:'chatgpt'},{'X-Owner-CSRF':''})).status,403);
  assert.equal((await request('developer/tasks',{task:'Untrusted task',requestKey:'untrusted-request-001'},{Origin:'http://untrusted.invalid'})).status,403);
  assert.equal((await (await request('developer')).json()).config.enabled,false);
  assert.equal((await request('developer/tasks',{task:'Improve the game',requestKey:'disabled-request-001'})).status,400);
  assert.equal((await request('worker',{action:'pause'})).status,200);
  assert.equal((await (await request('overview')).json()).paused,true);
  assert.equal((await request('logout',{})).status,200);
  assert.equal((await request('overview')).status,401);
}));
test('login tickets and owner sessions expire; local worker pause persists',async()=>harness(async({store,steward,request,login,advance})=>{
  const expired=createOwnerTicket(store.db,()=>100000);advance(120001);assert.equal((await login(expired)).response.status,401);
  await login();await request('worker',{action:'pause'});store.event('a','defeat','warden');steward.tick();assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,0);
  assert.equal(settings(store.db).get('workerPaused'),true);await request('worker',{action:'resume'});steward.tick();assert.ok(store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count>0);
  advance(12*3600000+1);assert.equal((await request('overview')).status,401);
}));
test('data pagination, exports and audit do not disclose bearer identities or keys',async()=>harness(async({store,request,login,dir})=>{
  const identity='private-bearer-identity';store.player(identity);
  for(let i=0;i<35;i++)store.event(identity,'discovery','stone',{apiKey:'hidden',details:{player:identity}});
  await login();const page=await (await request('data?table=events')).json();assert.equal(page.rows.length,30);assert.equal(page.total,35);assert.equal(page.rows[0].player,'traveler-'+publicIdentity(identity));assert.equal(page.rows[0].payload.apiKey,'[protected]');assert.ok(!JSON.stringify(page).includes(identity));
  assert.equal((await request('data?table=owner_secrets')).status,400);
  assert.equal((await (await request('data?table=events&q='+encodeURIComponent('traveler-'+publicIdentity(identity)))).json()).total,35);
  const exportResponse=await request('export',{}),text=await exportResponse.text();assert.equal(exportResponse.status,200);assert.ok(!text.includes(identity));assert.ok(!text.includes('hidden'));assert.equal(text.trim().split('\n').map(l=>JSON.parse(l)).filter(r=>r.table==='events').length,35);
  const saved=await (await request('backup',{})).json();assert.ok(readFileSync(join(dir,'backups',saved.name)).length>0);
  const restored=openStore(join(dir,'backups',saved.name));
  try{assert.equal(restored.db.prepare('SELECT COUNT(*) AS count FROM events').get().count,35);assert.equal(restored.db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);assert.equal(restored.player(identity).id,identity);}finally{restored.db.close();}
  assert.equal((await request('backup/'+saved.name)).status,200);
  assert.throws(()=>store.db.exec("DELETE FROM admin_audit"),/append-only/);
}));
test('AI credentials are sealed and a catalog check is explicit; inference cannot be enabled',async()=>harness(async({store,request,login,calls,dir})=>{
  await login();const apiKey='fake-test-key-never-sent-externally';
  const response=await request('ai',{model:'owner-chosen-model',dailyBudgetUsd:2,apiKey});assert.equal(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes(apiKey));
  const sealed=store.db.prepare("SELECT value FROM owner_secrets WHERE key='openai'").get().value;assert.ok(!sealed.includes(apiKey));assert.equal(createSecretStore(store.db,dir).read(),apiKey);assert.equal(calls.length,0);
  const sealPath=join(dir,'owner-seal.key'),seal=readFileSync(sealPath);unlinkSync(sealPath);
  assert.throws(()=>createSecretStore(store.db,dir),/Credential seal is missing/);writeFileSync(sealPath,seal);assert.equal(createSecretStore(store.db,dir).read(),apiKey);
  assert.equal((await request('ai',{model:'x',dailyBudgetUsd:1,modelCallsEnabled:true})).status,400);
  const check=await (await request('ai/check',{})).json();assert.equal(check.modelAvailable,true);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/models');assert.equal(calls[0].options.headers.Authorization,'Bearer '+apiKey);
  const data=await (await request('ai')).json();assert.equal(data.modelCallsEnabled,false);assert.equal(data.dailyBudgetUsd,2);assert.ok(!JSON.stringify(data).includes(apiKey));
  assert.ok(!JSON.stringify(store.db.prepare('SELECT * FROM admin_audit').all()).includes(apiKey));
}));

test('failed owner migration rolls back new tables and preserves the prior world for retry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lw-admin-migration-')),db=new DatabaseSync(join(dir,'world.sqlite'));
  try{
    migrate(db);db.exec(`INSERT INTO players VALUES ('historic',9,12);INSERT INTO events(player,kind,subject) VALUES ('historic','discovery','stone');
      DROP TABLE agent_messages;DROP TABLE developer_lessons;DROP TABLE visual_releases;DROP TABLE developer_runs;DROP TABLE owner_tickets;DROP TABLE owner_sessions;DROP TABLE owner_secrets;DROP TABLE admin_audit;
      PRAGMA user_version=3;`);
    // An unexpected pre-existing table simulates an interrupted/invalid migration prerequisite.
    assert.throws(()=>migrate(db),/owner_settings.*already exists/);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name IN ('owner_tickets','owner_sessions')").get().count,0);
    assert.equal(db.prepare('SELECT kind FROM events').get().kind,'discovery');
    assert.equal(db.prepare('SELECT x FROM players').get().x,9);
    db.exec('DROP TABLE owner_settings');migrate(db);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count,1);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('retry accepts only failed local jobs; proposal decisions leave a durable audit',async()=>harness(async({store,steward,request,login})=>{
 await login();const id=steward.queue.enqueue('inspect_world',{},'test-job');store.db.prepare("UPDATE jobs SET state='failed',attempts=3 WHERE id=?").run(id);
 assert.equal((await request('jobs/retry',{id})).status,200);assert.equal(store.db.prepare('SELECT state FROM jobs WHERE id=?').get(id).state,'queued');assert.equal((await request('jobs/retry',{id})).status,400);
 store.db.prepare("INSERT INTO improvements VALUES ('p','p','gameplay','Check balance','{}','proposed',0)").run();assert.equal((await request('proposals',{id:'p',status:'accepted'})).status,200);assert.equal(store.db.prepare("SELECT status FROM improvements WHERE id='p'").get().status,'accepted');
 assert.equal((await request('proposals',{id:'p',status:'completed'})).status,400);assert.ok(store.db.prepare("SELECT 1 FROM admin_audit WHERE action='proposal_status'").get());
}));

test('AI connection registry seals provider keys and keeps every provider runtime disabled',async()=>harness(async({store,request,login,dir})=>{
  await login();const catalog=await (await request('connections')).json();assert.ok(catalog.connections.some(connection=>connection.id==='codex'&&connection.status==='available'));assert.ok(catalog.connections.some(connection=>connection.id==='google'));assert.ok(catalog.connections.some(connection=>connection.id==='openrouter'));
  const key='google-test-key-never-sent';const response=await request('connections/google',{authMode:'Authorization key',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-test',apiKey:key});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.execution,'disabled');assert.ok(!JSON.stringify(saved).includes(key));assert.equal(createSecretStore(store.db,dir).read('connection:google'),key);
  const listed=await (await request('connections')).json();const google=listed.connections.find(connection=>connection.id==='google');assert.equal(google.secretConfigured,true);assert.equal(google.configuration.model,'gemini-test');assert.equal(google.execution,'disabled');assert.ok(!JSON.stringify(listed).includes(key));
  assert.equal((await request('connections/openai-compatible',{endpoint:'http://127.0.0.1:11434',model:'local'})).status,400);
}));
