import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { createQueue } from '../server/jobs.js';
test('jobs deduplicate, recover expired leases after restart and reject stale workers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lw-jobs-'));let store=openStore(join(dir,'world.sqlite'));let now=1000,queue=createQueue(store.db,()=>now);
 try{const id=queue.enqueue('test',{},'once');assert.equal(queue.enqueue('test',{},'once'),id);const stale=queue.claim(['test'],100);assert.equal(queue.claim(['test']),null);
 store.db.close();store=openStore(join(dir,'world.sqlite'));queue=createQueue(store.db,()=>now);now=1200;const fresh=queue.claim(['test'],100);assert.equal(fresh.id,id);assert.notEqual(fresh.token,stale.token);assert.equal(queue.finish(stale,{bad:true}),false);assert.equal(queue.finish(fresh,{ok:true}),true);assert.equal(queue.status().succeeded,1);assert.equal(queue.claim(['test']),null);
 }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('repeated failures stop at a finite retry limit with durable errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lw-retry-'));const store=openStore(join(dir,'world.sqlite'));let now=1000;const queue=createQueue(store.db,()=>now);
 try{queue.enqueue('failure',{},'failure',2);const first=queue.claim(['failure']);assert.equal(queue.fail(first,'first failure'),true);assert.equal(queue.claim(['failure']),null);now+=10000;const second=queue.claim(['failure']);queue.fail(second,'second failure');assert.equal(queue.status().failed,1);assert.equal(queue.claim(['failure']),null);assert.equal(store.db.prepare("SELECT error FROM jobs WHERE unique_key='failure'").get().error,'second failure');}
 finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
