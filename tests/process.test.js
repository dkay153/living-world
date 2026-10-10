import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runOwnedProcess } from '../server/owned-process.js';
import { codexEnvironment } from '../server/codex-process.js';
test('the real watchdog bounds a long-running child without using a model',async()=>{
  const result=await runOwnedProcess(process.execPath,['-e','setInterval(()=>{},10000)'],{cwd:resolve('.'),env:codexEnvironment(resolve('work/unused-fixture')),timeoutMs:300});assert.equal(result.timedOut,true);assert.notEqual(result.code,0);
});
