import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createGame } from '../server/game.js';
import { objects,creatureSeeds,canMove,WIDTH,HEIGHT } from '../server/world.js';
test('all quest and creature locations are reachable from the settlement',()=>{
 const seen=new Set(['9,12']),queue=[[9,12]];while(queue.length){const [x,y]=queue.shift();for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const a=x+dx,b=y+dy,key=`${a},${b}`;if(a>=0&&b>=0&&a<WIDTH&&b<HEIGHT&&canMove(a,b)&&!seen.has(key)){seen.add(key);queue.push([a,b]);}}}for(const o of [...objects,...creatureSeeds])assert.ok(seen.has(`${o.x},${o.y}`),o.id);
});
test('gathering, shared combat, quest reward, defeat and regrowth persist',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lw-game-'));let store=openStore(join(dir,'game.sqlite'));let now=1000;let game=createGame(store,()=>now);const p=store.player('hero');const act=type=>game.act(p,{type});const place=(x,y)=>{p.x=x;p.y=y;store.move(p.id,x,y);};
 try{
 place(12,10);assert.equal(act('interact').state.quest,'active');
 place(21,9);assert.equal(act('interact').state.inventory.dewleaf,1);assert.equal(act('interact').state.inventory.dewleaf,1);
 place(28,12);assert.equal(act('interact').state.inventory.dewleaf,2);
 place(23,5);act('interact');place(25,9);act('attack');for(let i=0;i<3;i++)act('attack');assert.equal(store.loadGame(p.id).inventory.shard,1);act('attack');assert.equal(store.loadGame(p.id).inventory.shard,1);
 place(30,15);act('attack');for(let i=0;i<3;i++)act('attack');assert.equal(store.loadGame(p.id).inventory.shard,2);
 place(12,10);assert.equal(act('interact').state.quest,'complete');assert.equal(act('interact').state.inventory.shard,0);assert.equal(store.history().filter(h=>h.kind==='quest_completed').length,1);
 place(25,16);const damaged=store.loadGame(p.id);damaged.hp=1;store.saveGame(p.id,damaged);act('attack');const defeated=act('attack');assert.equal(defeated.state.deaths,1);assert.equal(p.x,9);assert.equal(p.y,12);assert.equal(defeated.state.hp,30);
 store.db.close();store=openStore(join(dir,'game.sqlite'));game=createGame(store,()=>now);assert.equal(store.loadGame(p.id).quest,'complete');assert.equal(game.snapshot().find(c=>c.id==='moss-1').hp,0);now+=61000;assert.equal(game.snapshot().find(c=>c.id==='moss-1').hp,12);place(21,9);assert.equal(act('interact').state.inventory.dewleaf,1);
 const state=store.loadGame(p.id);state.hp=10;store.saveGame(p.id,state);assert.equal(act('heal').state.hp,22);assert.equal(store.loadGame(p.id).inventory.dewleaf,0);
 }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
