import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.js';
import { createGame } from '../server/game.js';
import { createSteward } from '../server/steward.js';
import { describePlayer,personalJournal } from '../server/memory.js';
import { settings } from '../server/owner-settings.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/first-echo.json',import.meta.url)));
function harness(fn){const dir=mkdtempSync(join(tmpdir(),'lw-memory-'));const store=openStore(join(dir,'world.sqlite'));try{fn(store,dir);}finally{store.db.close();rmSync(dir,{recursive:true,force:true});}}
test('recorded quest fixture establishes item provenance and bounded NPC knowledge',()=>harness(store=>{
  const game=createGame(store,()=>1000),player=store.player('private-identity');
  for(const step of fixture.steps){player.x=step.at[0];player.y=step.at[1];store.move(player.id,player.x,player.y);for(let i=0;i<(step.repeat||1);i++)game.act(player,{type:step.command});}
  const state=store.loadGame(player.id);assert.equal(state.quest,fixture.expected.quest);assert.equal(state.victories,fixture.expected.victories);
  assert.equal(state.inventory.dewleaf,0);assert.equal(state.inventory.shard,0);
  const items=store.inventoryItems(player.id);assert.equal(items.filter(i=>i.kind==='tempered_blade'&&!i.consumed_event).length,1);
  for(const item of items){assert.ok(item.source_event);const e=store.db.prepare('SELECT kind FROM events WHERE id=?').get(item.source_event);assert.ok(['gathering','victory','quest_completed'].includes(e.kind));}
  assert.equal(items.filter(i=>i.consumed_event).length,4);
  const npc=store.knowledge('npc','keeper',player.id);assert.ok(npc.some(f=>f.predicate==='delivered_first_echo'));assert.ok(!npc.some(f=>f.predicate.includes('victory')));
  const summary=describePlayer(store,player.id);assert.equal(summary.counts.victory,2);assert.equal(summary.counts.quest_completed,1);assert.ok(!JSON.stringify(summary).includes(player.id));
  const journal=personalJournal(store,'another-traveler');assert.equal(journal.entries.length,0);
  const steward=createSteward(store,()=>1000);steward.tick();assert.equal(steward.status().jobs.queued||0,0);assert.ok(store.db.prepare('SELECT summary FROM memories WHERE player=?').get(player.id));
  const jobCount=store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count;steward.tick();assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,jobCount);
}));
test('delegated world stops legacy memory writes without changing history or owner model settings',()=>harness(store=>{
  store.player('traveler');store.event('traveler','discovery','well');
  const control=settings(store.db);control.set('developer',{enabled:false,model:'owner-model',maxMinutes:17});
  const worker=createSteward(store,()=>1000);worker.tick();
  store.event('traveler','discovery','stone');control.set('sourceLaneOwnsWorld',true);
  const snapshot=()=>JSON.stringify(['events','memories','jobs','checkpoints'].map(table=>store.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  const before=snapshot();worker.tick();worker.tick();assert.equal(snapshot(),before);
  assert.deepEqual(control.get('developer'),{enabled:false,model:'owner-model',maxMinutes:17});
  control.set('sourceLaneOwnsWorld',false);worker.tick();assert.notEqual(snapshot(),before);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM events').get().n,2);
}));

test('failed action rolls back state, provenance, knowledge and history together',()=>harness(store=>{
  const game=createGame(store),p=store.player('a');p.x=21;p.y=9;
  const award=store.awardItem;store.awardItem=()=>{throw new Error('simulated item failure');};
  assert.throws(()=>game.act(p,{type:'interact'}),/simulated/);assert.equal(store.loadGame(p.id).inventory.dewleaf,0);assert.equal(store.loadEnvironment('herb-a'),null);assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count,0);
  store.awardItem=award;game.act(p,{type:'interact'});assert.equal(store.inventoryItems(p.id).length,1);
}));
test('legacy version-2 database migrates without inventing missing evidence',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lw-legacy-')),file=join(dir,'legacy.sqlite');let db=new DatabaseSync(file);
  db.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,x INTEGER,y INTEGER);CREATE TABLE events(id INTEGER PRIMARY KEY,player TEXT,kind TEXT,subject TEXT,at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE discoveries(player TEXT,object TEXT,PRIMARY KEY(player,object));CREATE TABLE gameplay(id TEXT PRIMARY KEY,state TEXT);CREATE TABLE environment(id TEXT PRIMARY KEY,state TEXT);PRAGMA user_version=2;INSERT INTO players VALUES ('legacy',9,12);INSERT INTO events(player,kind,subject) VALUES ('legacy','victory','moss-1');`);
  db.prepare('INSERT INTO gameplay VALUES (?,?)').run('legacy',JSON.stringify({hp:30,maxHp:30,inventory:{dewleaf:2,shard:0},quest:'active',victories:1,deaths:0}));db.close();
  const store=openStore(file);
  try{const game=createGame(store);game.act(store.player('legacy'),{type:'heal'});const items=store.inventoryItems('legacy');assert.equal(items.length,2);assert.ok(items.every(i=>i.origin==='legacy_import'&&i.source_event===null));assert.equal(store.db.prepare('SELECT version FROM events WHERE id=1').get().version,0);assert.throws(()=>store.db.exec("UPDATE events SET kind='fake' WHERE id=1"),/append-only/);assert.throws(()=>store.db.exec('DELETE FROM events WHERE id=1'),/append-only/);}
  finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('memory worker proposes an investigation from evidence and does not repeat it',()=>harness(store=>{
 store.player('a');for(let i=0;i<3;i++)store.event('a','defeat','warden',{location:{x:25,y:16}});
 let now=1000;const steward=createSteward(store,()=>now);steward.tick();now+=60000;steward.tick();
 const proposals=store.db.prepare('SELECT title,evidence FROM improvements').all();assert.equal(proposals.length,1);assert.equal(JSON.parse(proposals[0].evidence).eventIds.length,3);assert.match(JSON.parse(proposals[0].evidence).interpretation,/do not prove/);
}));
test('failed combat reward restores shared creature cache and active encounter',()=>harness(store=>{
 const game=createGame(store,()=>1000),p=store.player('a');p.x=25;p.y=9;
 game.act(p,{type:'attack'});game.act(p,{type:'attack'});game.act(p,{type:'attack'});
 const before=store.loadGame(p.id),eventCount=store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count,award=store.awardItem;
 store.awardItem=()=>{throw new Error('reward failure');};assert.throws(()=>game.act(p,{type:'attack'}),/reward failure/);
 assert.deepEqual(store.loadGame(p.id),before);assert.equal(game.snapshot().find(c=>c.id==='moss-1').hp,12);assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count,eventCount);
 store.awardItem=award;game.act(p,{type:'attack'});assert.equal(store.loadGame(p.id).victories,1);
}));
test('newer schema is rejected rather than silently downgraded',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lw-future-')),file=join(dir,'future.sqlite');const db=new DatabaseSync(file);db.exec('PRAGMA user_version=99');db.close();
 try{assert.throws(()=>openStore(file),/newer/);}finally{rmSync(dir,{recursive:true,force:true});}
});
