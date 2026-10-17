import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {validateToolRequest,createDeveloperTools} from '../server/developer-tools.js';

test('long development work can continue past twelve serial requests without changing owner limits',async()=>{
  const candidate=await mkdtemp(join(tmpdir(),'lw-tool-continuation-'));
  const broker=createDeveloperTools({candidate,directory:join(candidate,'evidence'),dataDir:join(candidate,'private'),perform:async input=>({passed:input.action==='prepare'})});
  try{await broker.start();const ids=Array.from({length:13},()=>randomUUID());for(const id of ids)await writeFile(join(candidate,'.scratch/tool-requests',id+'.json'),JSON.stringify({action:'prepare'}));await broker.flush();for(const id of ids)assert.equal(JSON.parse(await readFile(join(candidate,'.scratch/tool-results',id+'.json'))).passed,true);}
  finally{await broker.close();await rm(candidate,{recursive:true,force:true});}
});
import {canonicalNextTypes} from '../server/next-generated.js';
test('development tools accept structured capabilities, never commands or escaped tests',()=>{
  assert.deepEqual(validateToolRequest({action:'test',tests:['tests/game.test.js']}),{action:'test',tests:['tests/game.test.js']});
  for(const input of [{action:'shell',command:'echo bad'},{action:'test',tests:['../secret.test.js']},{action:'test',tests:['tests/a.test.js;bad']},{action:'prepare',tests:[]},{action:'test',tests:[]},{action:'build',image:'evil'}])assert.throws(()=>validateToolRequest(input));
});
test('tool transport returns source-bound results and denies escaped test paths',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lw-tools-'));let calls=0;const broker=createDeveloperTools({candidate:dir,perform:async input=>{calls++;return {passed:true,sourceHash:'fixture',action:input.action};}});
  try{await mkdir(join(dir,'.scratch'),{recursive:true});await broker.start();const id=randomUUID();await writeFile(join(dir,'.scratch/tool-requests',id+'.json'),JSON.stringify({action:'prepare'}));
    await broker.flush();const result=JSON.parse(await readFile(join(dir,'.scratch/tool-results',id+'.json'),'utf8'));assert.equal(result.passed,true);assert.equal(calls,1);
    const bad=randomUUID();await writeFile(join(dir,'.scratch/tool-requests',bad+'.json'),JSON.stringify({action:'test',tests:['tests/../../bad']}));await broker.flush();const denied=JSON.parse(await readFile(join(dir,'.scratch/tool-results',bad+'.json'),'utf8'));assert.equal(calls,1);assert.equal(denied.passed,false);
  }finally{await broker.close();await rm(dir,{recursive:true,force:true});}
});
test('only exact generated Next type references normalize; extra declarations stay visible',()=>{
  const text='/// <reference types="next" />\n/// <reference types="next/image-types/global" />\nimport "./.next-dev/dev/types/routes.d.ts";\nimport "./.next-dev/dev/types/root-params.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
  const normalized=canonicalNextTypes(Buffer.from(text)).toString();assert.ok(normalized.includes('./.next/types/routes'));assert.ok(!normalized.includes('.next-dev'));assert.equal(canonicalNextTypes(Buffer.from(text+'declare const hidden: string;')).toString(),text+'declare const hidden: string;');assert.deepEqual(canonicalNextTypes(Buffer.from(normalized)),Buffer.from(normalized));
});

import {packageSpec,packageName,developmentPackages} from '../server/development-packages.js';
test('tool installs require exact registry versions, forbid URLs/paths/options and remove transitives',async()=>{
  assert.ok(packageSpec('@scope/tool@1.2.3'));for(const spec of ['evil;cmd@1.0.0','--registry=x@1.0.0','tool@latest','tool@file:/secret','https://evil/tool','../tool@1.0.0'])assert.equal(packageSpec(spec),false);
  const calls=[];const profile=developmentPackages({image:'sha256:fixture',runner:async(binary,args)=>{calls.push(args);return {code:0,stdout:''};}});
  try{await assert.rejects(()=>profile.change({add:['x@latest']}),/exact versions/);assert.equal(calls.length,0);await profile.change({add:['example@1.2.3']});assert.equal(profile.profile[0],'example@1.2.3');const install=calls.find(args=>args.includes('--name'));assert.ok(install.includes('--read-only'));assert.ok(install.includes('--cap-drop'));assert.ok(install.some(s=>s.includes('--ignore-scripts')));assert.ok(!install.some(s=>s.includes('source=')&&s.includes('type=bind')));await profile.change({remove:['example']});assert.deepEqual(profile.profile,[]);assert.ok(calls.some(args=>args.some(s=>s.includes("fs.rmSync('/extra/'"))));}finally{await profile.close();}assert.ok(calls.at(-1).includes('volume'));
});

test('generic commands stay in the worker and image export paths cannot escape scratch',()=>{
  assert.deepEqual(validateToolRequest({action:'command',argv:['node','--version'],artifacts:['.scratch/capture.png']}).argv,['node','--version']);
  for(const input of [{action:'command',argv:['docker','run']},{action:'command',argv:['node','x\0bad']},{action:'command',argv:['node','--version'],artifacts:['../owner.png']},{action:'command',argv:['node','--version'],artifacts:['.scratch/../owner.png']},{action:'build',argv:['node','--version']},{action:'packages',add:['--offline@1.0.0']}])assert.throws(()=>validateToolRequest(input));
});

test('trusted helper anchors requests to its workspace even when the shell starts elsewhere',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lw-transport-')),candidate=join(dir,'workspace'),outside=join(dir,'elsewhere');await mkdir(join(candidate,'.scratch'),{recursive:true});await mkdir(outside);const helper=join(candidate,'.scratch/developer-tool.cjs');await writeFile(helper,await readFile(new URL('../scripts/developer-tool.cjs',import.meta.url)));await writeFile(join(candidate,'.scratch/request.json'),JSON.stringify({action:'prepare'}));const broker=createDeveloperTools({candidate,perform:async()=>({passed:true,sourceHash:'transport-fixture'})});await broker.start();
 try{const {execFile}=await import('node:child_process');const stdout=await new Promise((accept,reject)=>execFile(process.execPath,[helper,'@.scratch/request.json'],{cwd:outside,timeout:8000},(error,stdout)=>error?reject(error):accept(stdout)));assert.equal(JSON.parse(stdout).sourceHash,'transport-fixture');await assert.rejects(()=>readFile(join(outside,'.scratch/request.json')),/ENOENT/);}finally{await broker.close();await rm(dir,{recursive:true,force:true});}
});
