import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createDockerRuntime} from '../server/release-runtime.js';

test('stage preparation can finish both check budgets and still has a bounded deadline',async t=>{
  const image='sha256:'+'a'.repeat(64),toolsHash='b'.repeat(64),dependenciesHash='c'.repeat(64);
  let child,notify;let spawned=new Promise(r=>{notify=r;});
  const runtime=createDockerRuntime({image,toolsHash,dependenciesHash,runner:async(_binary,args)=>{
    if(args[0]==='image')return {code:0,stdout:image+' linux '+toolsHash+' '+dependenciesHash};
    if(args[0]==='rm'){child.exitCode=0;child.emit('exit',0);return {code:0,stdout:''};}
    if(args[0]==='ps')return {code:0,stdout:''};throw Error('Unexpected command');
  },spawnProcess:()=>{child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;notify();return child;}});
  await runtime.verify();t.mock.timers.enable({apis:['setTimeout']});
  const ready=runtime.launch({source:'fixture-source',world:'fixture-world',mode:'stage'});let settled=false;ready.then(()=>{settled=true;},()=>{settled=true;});await spawned;
  t.mock.timers.tick(240001);await Promise.resolve();assert.equal(settled,false,'Build plus tests must not hit the shorter serve deadline');
  child.stdout.write('{"type":"ready","checks":{"uiBuild":true,"candidateTests":true}}\n');const session=await ready;assert.equal(session.receipt.checks.candidateTests,true);t.mock.timers.reset();await session.stop();
  spawned=new Promise(r=>{notify=r;});t.mock.timers.enable({apis:['setTimeout']});const stalled=runtime.launch({source:'fixture-source',world:'fixture-world',mode:'stage'});const rejected=assert.rejects(stalled,/preparation timed out/);await spawned;t.mock.timers.tick(300001);await rejected;t.mock.timers.reset();
});

test('abort and concurrent shutdown confirm one container removal despite delayed CLI exit',async()=>{
  const image='sha256:'+'a'.repeat(64),toolsHash='b'.repeat(64),dependenciesHash='c'.repeat(64);
  let child,removals=0,confirmations=0,spawns=0;
  const runner=async(_binary,args)=>{
    if(args[0]==='image')return {code:0,stdout:image+' linux '+toolsHash+' '+dependenciesHash};
    if(args[0]==='rm'){removals++;setTimeout(()=>{child.exitCode=0;child.emit('exit',0);},50);return {code:0,stdout:''};}
    if(args[0]==='ps'){confirmations++;return {code:0,stdout:confirmations===1?'teardown-still-visible':''};}
    throw Error('Unexpected command');
  };
  const runtime=createDockerRuntime({image,toolsHash,dependenciesHash,runner,spawnProcess:()=>{
    spawns++;child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
    queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'ready',sourceHash:'fixture'})+'\n'));return child;
  }});
  assert.equal((await runtime.verify()).ready,true);const controller=new AbortController();
  const session=await runtime.launch({source:'fixture-source',world:'fixture-world',signal:controller.signal});
  controller.abort();await Promise.all([session.stop(),session.stop()]);
  assert.equal(removals,1);assert.equal(confirmations,2);assert.equal(child.exitCode,0);
  await assert.rejects(runtime.launch({source:'fixture-source',world:'fixture-world',signal:AbortSignal.abort()}),/cancelled before launch/);assert.equal(spawns,1);
});

test('an unreachable Docker daemon cannot be reported as confirmed container shutdown',async()=>{
  const image='sha256:'+'a'.repeat(64),toolsHash='b'.repeat(64),dependenciesHash='c'.repeat(64);
  const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
  const runtime=createDockerRuntime({image,toolsHash,dependenciesHash,runner:async(_binary,args)=>args[0]==='image'?{code:0,stdout:image+' linux '+toolsHash+' '+dependenciesHash}:{code:1,stdout:''},spawnProcess:()=>{
    queueMicrotask(()=>child.stdout.write('{"type":"ready"}\n'));return child;
  }});
  await runtime.verify();const session=await runtime.launch({source:'fixture-source',world:'fixture-world'});
  await assert.rejects(session.stop(),/Cannot confirm container shutdown/);
  child.exitCode=0;child.emit('exit',0);
});
