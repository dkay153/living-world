import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectStagingRuntime,evaluatePromotion } from '../server/promotion-broker.js';

const manifest={sourceHash:'source',files:[],constitutionHash:'constitution'};
const checks={passed:true,discipline:{passed:true}};
const worldLab={checks:{passed:true},journey:{preserved:true}};

test('promotion stays closed without a separately verified runtime',()=>{
  const runtime=inspectStagingRuntime({platform:'win32',windowsSandbox:false,containerRuntime:false});
  assert.equal(runtime.ready,false);
  assert.equal(evaluatePromotion({runtime,manifest,checks,worldLab,constitutionHash:'constitution'}).state,'blocked');
});

test('a stageable candidate needs an immutable constitution manifest and recovery evidence',()=>{
  const runtime=inspectStagingRuntime({platform:'win32',windowsSandbox:true});
  assert.equal(evaluatePromotion({runtime,manifest,checks,worldLab,constitutionHash:'constitution'}).state,'staging_eligible');
  assert.equal(evaluatePromotion({runtime,manifest,checks,worldLab,migration:{required:true},constitutionHash:'constitution'}).state,'blocked');
  assert.equal(evaluatePromotion({runtime,manifest,checks,worldLab,migration:{required:true},backup:{consistent:true},restore:{passed:true},constitutionHash:'constitution'}).state,'staging_eligible');
});
