const transient=new Set(['development-result.json','change-plan.json','state-impact.json']);

export function evaluateCandidate({changes,checks,protectedFilesChanged=[]}){
  const substantive=changes.filter(change=>!transient.has(change.path));
  if(protectedFilesChanged.length)return {state:'blocked',reason:'Protected identity or instructions changed',substantiveChanges:substantive.map(change=>change.path),visualEligible:false};
  if(!checks?.passed)return {state:'rejected',reason:'Required candidate checks failed',substantiveChanges:substantive.map(change=>change.path),visualEligible:false};
  if(!checks?.discipline?.passed)return {state:'incomplete',reason:'State-impact declaration does not cover every changed surface',substantiveChanges:substantive.map(change=>change.path),visualEligible:false};
  if(!substantive.length)return {state:'no_change',reason:'No substantive candidate change was produced',substantiveChanges:[],visualEligible:false};
  const visualOnly=substantive.every(change=>change.path==='public/art.json');
  return {state:visualOnly?'visual_data_eligible':'proposal_retained',reason:visualOnly?'Only the validated visual-data surface changed':'Source or broader content changes remain an inspected proposal',substantiveChanges:substantive.map(change=>change.path),visualEligible:visualOnly};
}
