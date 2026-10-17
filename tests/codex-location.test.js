import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {codexBinary} from '../server/codex-process.js';

test('desktop Codex resolution survives a stale Explorer PATH and respects explicit configuration',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'lw-codex-location-'));
  try{
    for(const name of ['old','new','incomplete'])await mkdir(resolve(root,'OpenAI/Codex/bin',name),{recursive:true});
    const old=resolve(root,'OpenAI/Codex/bin/old/codex.exe'),latest=resolve(root,'OpenAI/Codex/bin/new/codex.exe');
    await writeFile(old,'fixture');await writeFile(latest,'fixture');await utimes(old,1,1);await utimes(latest,2,2);
    assert.equal(codexBinary({platform:'win32',env:{LOCALAPPDATA:root,PATH:''}}),latest);
    assert.equal(codexBinary({platform:'win32',env:{LOCALAPPDATA:root,LIVING_WORLD_CODEX_BIN:'explicit.exe'}}),'explicit.exe');
    assert.equal(codexBinary({platform:'linux',env:{LOCALAPPDATA:root}}),'codex');
    assert.equal(codexBinary({platform:'win32',env:{LOCALAPPDATA:resolve(root,'missing')}}),'codex.exe');
  }finally{await rm(root,{recursive:true,force:true});}
});
