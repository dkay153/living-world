const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000;
const list=value=>Array.isArray(value)&&value.length>0&&value.every(text);
const signal=value=>value&&typeof value==='object'&&text(value.name)&&['available','unavailable'].includes(value.status)&&text(value.detail);

// This record is deliberately evidence-shaped. It makes a quiet, healthy cycle a
// first-class outcome instead of rewarding the developer for finding something to edit.
export function validateEvolutionReview(review){
  if(!review||typeof review!=='object'||Array.isArray(review))return false;
  const keys=['mode','problem','evidence','baseline','hypothesis','scope','guardrails','observation','noChangeCase'];
  if(Object.keys(review).length!==keys.length||!['autonomous','owner_directed'].includes(review.mode)||!text(review.problem)||!list(review.evidence)||!text(review.hypothesis)||!text(review.noChangeCase))return false;
  if(!review.baseline||typeof review.baseline!=='object'||!Array.isArray(review.baseline.signals)||review.baseline.signals.length<1||!review.baseline.signals.every(signal))return false;
  if(!review.scope||typeof review.scope!=='object'||!text(review.scope.primaryVariable)||!text(review.scope.cohort)||!['reversible','restart_required','migration'].includes(review.scope.reversibility))return false;
  if(!list(review.guardrails))return false;
  const observation=review.observation;
  return !!observation&&typeof observation==='object'&&list(observation.successSignals)&&list(observation.stopSignals)&&text(observation.window);
}

export function assessEvolutionReview(review,{origin='owner',hasLiveSignals=false}={}){
  if(!validateEvolutionReview(review))return {state:'incomplete',reason:'The change lacks a complete evidence, baseline, guardrail and observation record',automaticRelease:false};
  const available=review.baseline.signals.filter(item=>item.status==='available');
  if(origin==='autonomous'&&review.mode!=='autonomous')return {state:'incomplete',reason:'Independent work must label itself autonomous',automaticRelease:false};
  if(origin==='autonomous'&&!available.length)return {state:'observe',reason:'No measured baseline supports an autonomous intervention; retain a quiet observation instead',automaticRelease:false};
  if(origin==='autonomous'&&!hasLiveSignals)return {state:'observe',reason:'Live observation is not instrumented for this intervention; do not auto-release it',automaticRelease:false};
  return {state:'candidate',reason:'Evidence, a primary variable and reversal signals are recorded; outcome remains unverified',automaticRelease:review.scope.reversibility==='reversible'};
}

export function quietEvolutionRecord({problem='No measured regression or opportunity requires a change',evidence=['Current checks and available observations do not justify an intervention']}={}){
  return {mode:'autonomous',problem,evidence,baseline:{signals:[{name:'instrumentation',status:'unavailable',detail:'No live outcome cohort is available yet'}]},hypothesis:'Preserving the current version avoids unsupported churn.',scope:{primaryVariable:'No change',cohort:'All players retain the current experience',reversibility:'reversible'},guardrails:['Do not alter a healthy system without measured reason'],observation:{successSignals:['No new regression is introduced'],stopSignals:['Any evidence that a needed repair was missed'],window:'Review when new evidence arrives'},noChangeCase:'The current evidence supports observation rather than a speculative edit'};
}
