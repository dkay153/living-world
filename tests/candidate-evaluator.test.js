import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidate } from '../server/candidate-evaluator.js';

const checks={passed:true,discipline:{passed:true}};
test('only a validated art artifact can enter the narrow visual-release lane',()=>{
  assert.equal(evaluateCandidate({changes:[{path:'public/art.json'}],checks}).state,'observation_required');
  assert.equal(evaluateCandidate({changes:[{path:'public/art.json'}],checks,evolution:{automaticRelease:true,reason:'Baseline and stop signals are recorded'}}).state,'visual_data_eligible');
  assert.equal(evaluateCandidate({changes:[{path:'server/game.js'}],checks}).state,'proposal_retained');
  assert.equal(evaluateCandidate({changes:[{path:'development-result.json'}],checks}).state,'no_change');
});
test('the evaluator blocks protected, failed and undeclared candidates',()=>{
  assert.equal(evaluateCandidate({changes:[{path:'public/art.json'}],checks,protectedFilesChanged:['docs/CONSTITUTION.md']}).state,'blocked');
  assert.equal(evaluateCandidate({changes:[{path:'public/art.json'}],checks:{passed:false,discipline:{passed:true}}}).state,'rejected');
  assert.equal(evaluateCandidate({changes:[{path:'public/art.json'}],checks:{passed:true,discipline:{passed:false}}}).state,'incomplete');
});
