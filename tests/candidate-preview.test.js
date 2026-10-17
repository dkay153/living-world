import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createCandidatePreview} from '../server/candidate-preview.js';
import {snapshotProject} from '../server/developer-sandbox.js';
import {digest} from '../server/release-artifacts.js';
import {validateToolRequest} from '../server/developer-tools.js';

test('candidate preview seals source, uses fresh private history and retains last working view on build failure',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'lw-preview-')),dataDir=resolve(root,'data'),candidate=resolve(root,'candidate'),calls=[];
  await snapshotProject(resolve('.'),candidate,resolve(root,'baseline'));
  await mkdir(resolve(dataDir,'source-lane'),{recursive:true});
  const dependenciesHash=digest(Buffer.concat([await readFile(resolve(candidate,'package.json')),await readFile(resolve(candidate,'package-lock.json'))]));
  await writeFile(resolve(dataDir,'source-lane/config.json'),JSON.stringify({image:'fixture',toolsHash:'fixture',dependenciesHash}));
  let fail=false;
  const preview=createCandidatePreview({dataDir,projectDir:resolve('.'),portFactory:async()=>32123,
    runtimeFactory:()=>({verify:async()=>({ready:true}),launch:async input=>{calls.push(input);if(fail)throw Error('Build failed');return {events:new EventEmitter(),stop:async()=>calls.push('stopped')};}}),
    gatewayFactory:input=>({origin:'http://127.0.0.1:32123',start:async()=>calls.push('gateway started'),release:()=>{},event:async()=>{},close:async()=>calls.push('gateway closed')})});
  try{
    const view=await preview.request({candidate,runId:'fixture'});assert.equal(view.state,'running');
    assert.equal(calls[0].mode,'serve');assert.ok(calls[0].world.startsWith(resolve(dataDir,'development-previews')));assert.ok(!calls[0].world.includes('source-lane/history'));
    assert.notEqual(calls[0].source,candidate);assert.equal(await readFile(resolve(calls[0].world,'world.sqlite')).then(b=>b.length>0),true);
    await preview.request({candidate,runId:'fixture'});assert.equal(calls.filter(x=>typeof x==='object').length,1);
    await appendFile(resolve(candidate,'public/seed.js'),'\n// candidate change\n');fail=true;
    await assert.rejects(preview.request({candidate,runId:'fixture'}),/Build failed/);assert.equal(preview.status().url,view.url);assert.equal(preview.status().sourceHash,view.sourceHash);assert.match(preview.status().error,/Build failed/);
    assert.deepEqual(validateToolRequest({action:'preview'}),{action:'preview'});assert.throws(()=>validateToolRequest({action:'preview',argv:['node']}));
  }finally{await preview.close();await rm(root,{recursive:true,force:true});}
  assert.ok(calls.includes('gateway closed'));assert.ok(calls.includes('stopped'));assert.equal(preview.status().state,'stopped');
});
