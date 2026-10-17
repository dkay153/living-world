import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve,dirname,delimiter } from 'node:path';
import { mkdtemp,readFile,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runOwnedProcess } from '../server/owned-process.js';
import { codexEnvironment,prepareCodexHome } from '../server/codex-process.js';
test('the real watchdog bounds a long-running child without using a model',async()=>{
  const result=await runOwnedProcess(process.execPath,['-e','setInterval(()=>{},10000)'],{cwd:resolve('.'),env:codexEnvironment(resolve('work/unused-fixture')),timeoutMs:300});assert.equal(result.timedOut,true);assert.notEqual(result.code,0);
});
test('an unlimited owned process remains cancellable without a model',async()=>{
  const abort=new AbortController();let announced;
  const started=new Promise(accept=>announced=accept);
  const running=runOwnedProcess(process.execPath,['-e',"console.log('READY');setInterval(()=>{},10000)"],{cwd:resolve('.'),env:codexEnvironment(resolve('work/unused-fixture')),timeoutMs:null,signal:abort.signal,onLine:()=>announced()});
  await started;abort.abort();const result=await running;
  assert.equal(result.cancelled,true);assert.equal(result.timedOut,false);assert.notEqual(result.code,0);
});
test('a finished runner delivers its result before disconnecting',async()=>{
  for(let i=0;i<5;i++){
    const result=await runOwnedProcess(process.execPath,['-e',"console.log('COMPLETE')"],{cwd:resolve('.'),env:codexEnvironment(resolve('work/unused-fixture')),timeoutMs:null});
    assert.equal(result.code,0);assert.match(result.stdout,/COMPLETE/);assert.equal(result.timedOut,false);
  }
});
test('developer shell can find the permitted Node runtime without granting owner-home access',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'lw-node-permissions-'));try{
    await prepareCodexHome(directory);const config=await readFile(resolve(directory,'config.toml'),'utf8'),env=codexEnvironment(directory);
    assert.ok(env.PATH.startsWith(dirname(process.execPath)+delimiter));assert.equal(Object.hasOwn(env,'Path'),false);assert.ok(config.includes(JSON.stringify(dirname(process.execPath))+' = "read"'));assert.match(config,/":root" = "deny"/);assert.match(config,/enabled = false/);assert.equal(env.OPENAI_API_KEY,undefined);
    if(process.platform==='win32'){
      const shellDirectory=resolve(dirname(process.execPath),'../../native/powershell');
      try{await access(resolve(shellDirectory,'pwsh.exe'));assert.ok(config.includes(JSON.stringify(shellDirectory)+' = "read"'));}catch(error){if(error.code!=='ENOENT')throw error;}
      assert.ok(!config.includes(JSON.stringify(process.env.USERPROFILE)+' = "read"'));
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
