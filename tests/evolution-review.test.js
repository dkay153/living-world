import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvolutionReview,assessEvolutionReview,quietEvolutionRecord } from '../server/evolution-review.js';

const review={mode:'autonomous',problem:'A measured encounter action fails unexpectedly',evidence:['World Lab replay reproduces the failure'],baseline:{signals:[{name:'journey completion',status:'available',detail:'The replay fails before the quest completion transition'}]},hypothesis:'Repairing the transition restores completion without changing combat rules.',scope:{primaryVariable:'Quest completion transition',cohort:'Players entering the affected encounter',reversibility:'reversible'},guardrails:['Turn-based commands remain legal','Existing completed quests remain complete'],observation:{successSignals:['Journey completion succeeds','No increase in command errors'],stopSignals:['History recovery fails','Command error rate rises'],window:'Observe the next staged journey set'},noChangeCase:'Leaving the known failure unresolved harms the affected journey'};

test('an autonomous evolution needs measured baseline evidence before it can become a release candidate',()=>{
  assert.equal(validateEvolutionReview(review),true);
  assert.equal(assessEvolutionReview(review,{origin:'autonomous',hasLiveSignals:true}).state,'candidate');
  assert.equal(assessEvolutionReview({...review,baseline:{signals:[{name:'player feedback',status:'unavailable',detail:'No cohort is instrumented'}]}},{origin:'autonomous',hasLiveSignals:false}).state,'observe');
});

test('a quiet observation is a valid durable decision rather than a failed development cycle',()=>{
  const quiet=quietEvolutionRecord({});
  assert.equal(validateEvolutionReview(quiet),true);
  assert.equal(assessEvolutionReview(quiet,{origin:'autonomous',hasLiveSignals:false}).state,'observe');
});
