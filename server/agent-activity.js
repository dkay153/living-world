const clean=value=>typeof value==='string'?value.trim():'';

const phases={
  'Copying project source':{
    title:'Preparing an isolated working copy',
    intent:'Give the developer a safe, exact baseline before it studies or changes anything.',
    current:'Copying the current project into a disposable candidate workspace.',
    next:'It will map affected state and protected commitments before editing.',
    complete:'The candidate and its baseline manifest are recorded.'
  },
  'Planning state impact in a separate read-only candidate':{
    title:'Mapping the proposed change before editing',
    intent:'Trace the game state, public contracts, tests, and player history that the task could affect.',
    current:'The planner may only write its change plan, state-impact declaration, and evolution review.',
    next:'The host will reject the attempt if those declarations are incomplete or the planner changed source.',
    complete:'A complete plan, impact declaration, and no-change case are saved.'
  },
  'Checking this copy’s isolation':{
    title:'Verifying the candidate boundary',
    intent:'Keep live saves, credentials, and the running world outside the developer’s workspace.',
    current:'The host is checking that the editable copy cannot reach protected data or configuration.',
    next:'Only a passing containment check permits implementation to start.',
    complete:'The host accepts the isolated candidate boundary.'
  },
  'Codex is developing in the isolated copy':{
    title:'Implementing the approved change',
    intent:'Make one focused improvement inside the declared scope, then clean up the affected code path.',
    current:'The developer is reading and editing only the isolated candidate copy.',
    next:'It will write a result claim, then the host will capture every changed file.',
    complete:'The candidate has either recorded a focused result or stopped with an honest no-change case.'
  },
  'Capturing proposed changes':{
    title:'Recording the candidate result',
    intent:'Create auditable before-and-after evidence rather than trusting an agent summary.',
    current:'The host is comparing the candidate against its exact baseline.',
    next:'It will test the declared change and check state-impact coverage.',
    complete:'Changed files, visual artifacts, and the candidate claim are retained.'
  },
  'Testing the copy independently':{
    title:'Validating the candidate',
    intent:'Check gameplay, persistence, jobs, contracts, and declared state impact before any release decision.',
    current:'The host is running its fixed offline test suite inside the isolated environment.',
    next:'It will classify the candidate as retained, blocked, or eligible for the narrow visual lane.',
    complete:'The independent check result and limitations are recorded.'
  },
  'Waiting for provider allowance':{
    title:'Waiting for provider capacity',
    intent:'Avoid starting a task that the connected account cannot finish.',
    current:'The provider reports no usable account capacity for a new isolated task.',
    next:'Routing resumes when the provider exposes available capacity.',
    complete:'A selectable model and provider allowance are both available.'
  },
  'Waiting for a selectable model':{
    title:'Waiting for an account model',
    intent:'Use only a model explicitly returned by the connected account.',
    current:'The account has not supplied an eligible model for the saved routing settings.',
    next:'The host will route work after the account catalog is available.',
    complete:'A saved route resolves to a selectable account model.'
  },
  'Checking containment':{
    title:'Preparing the isolated environment',
    intent:'Prove containment before granting a developer task any editable workspace.',
    current:'The host is checking the local candidate environment.',
    next:'A passed isolation check enables a queued task; a failed check keeps execution paused.',
    complete:'The isolated environment is verified.'
  },
  'Checking project account':{
    title:'Checking the project account',
    intent:'Confirm the owner-connected development account is available without starting a model request.',
    current:'The host is reading account availability and the supported model catalog.',
    next:'It will either route a queued task or explain the exact account blocker.',
    complete:'Account connection and routing availability are known.'
  },
  'Ready for the next improvement':{
    title:'Ready for the next evidence-backed task',
    intent:'Start only a focused task that has a safe candidate boundary and a selectable route.',
    current:'No task is running; the developer is waiting for a direction or its next scheduled cycle.',
    next:'The next task begins with an impact plan, not an edit.',
    complete:'A task is queued and the isolated planner begins.'
  },
  Paused:{
    title:'Developer execution is paused',
    intent:'Respect the owner’s execution control.',
    current:'No model task can begin while execution remains paused.',
    next:'When the owner resumes execution, the host rechecks account and containment.',
    complete:'Execution is explicitly enabled and its prerequisites are verified.'
  }
};

const fallback={
  title:'Updating the development record',
  intent:'Keep the current task inspectable while the host coordinates its isolated work.',
  current:'The developer is advancing its current host-managed phase.',
  next:'The next recorded host phase will explain what happens after this check.',
  complete:'The host records a phase result or an explicit blocker.'
};

export function narrateActivity(activity={},now=Date.now){
  const timestamp=typeof now==='function'?now():Number.isFinite(now)?now:Date.now();
  const phase=clean(activity.phase)||'Working';
  const template=phases[phase]||fallback;
  const active=['running','working','queued'].includes(activity.state);
  const startedAt=Number(activity.startedAt)||Number(activity.updatedAt)||null;
  return {
    agent:clean(activity.agent)||'Autonomous developer',
    provider:clean(activity.provider)||'connected provider',
    state:clean(activity.state)||'waiting',
    phase,
    title:template.title,
    intent:template.intent,
    current:template.current,
    next:template.next,
    complete:template.complete,
    active,
    runId:activity.runId||null,
    startedAt,
    updatedAt:Number(activity.updatedAt)||startedAt||timestamp,
    elapsedSeconds:startedAt?Math.max(0,Math.floor((timestamp-startedAt)/1000)):null,
    detail:clean(activity.detail)
  };
}

export function narrateOutcome({state,error,report={}}={}){
  const evaluation=clean(report.evaluation?.state),release=clean(report.release?.state),promotion=clean(report.promotion?.state);
  const changed=Array.isArray(report.changedFiles)?report.changedFiles.length:0;
  if(release==='published')return {
    title:'Verified visual data is now in the World Lab',
    body:'The candidate passed the narrow visual-data gate. The Lab will reload the validated visual release; source-code changes remain a retained proposal.',
    intent:'Release only the independently validated visual artifact.',
    current:'The host recorded the immutable release and preserved the previous visual pack for rollback.',
    next:'Observe the refreshed Lab and retain player feedback before another visual change.',
    complete:'The Lab reports the new visual release revision.',
    refreshSandbox:true
  };
  if(state==='failed'||state==='interrupted'||state==='cancelled')return {
    title:state==='cancelled'?'The development attempt was stopped':state==='interrupted'?'The development attempt was interrupted':'The development attempt stopped before a usable result',
    body:error||'The host retained the attempt record and did not change the World Lab.',
    intent:'Keep partial work inspectable without treating it as a game change.',
    current:changed?`${changed} candidate file${changed===1?' was':'s were'} captured for inspection.`:'No candidate change was accepted.',
    next:'A later task must begin with a fresh evidence review rather than replaying this attempt.',
    complete:'The failed attempt is durable and no release was made.',
    refreshSandbox:false
  };
  if(evaluation==='incomplete')return {
    title:'The candidate stopped before its impact evidence was complete',
    body:'The host retained the proposal but did not accept it as a validated improvement.',
    intent:'Prevent a change from escaping review when it did not declare every affected game surface.',
    current:changed?`${changed} changed file${changed===1?' was':'s were'} retained in the isolated candidate.`:'No substantive candidate change was accepted.',
    next:'The next attempt must map missing state impact before it can implement or release anything.',
    complete:'The current world and Lab baseline remain unchanged.',
    refreshSandbox:false
  };
  if(evaluation==='rejected')return {
    title:'The candidate failed independent checks',
    body:'The host rejected the proposed change and left the current world untouched.',
    intent:'Keep a failed candidate from becoming a game change.',
    current:'Its test outcome and changed files are retained as evidence.',
    next:'A later task can diagnose the recorded failure with a new isolated plan.',
    complete:'No Lab refresh occurs because no release was made.',
    refreshSandbox:false
  };
  if(evaluation==='observation_required'||evaluation==='no_change')return {
    title:evaluation==='no_change'?'The developer kept the current experience':'The developer needs more evidence before changing the experience',
    body:evaluation==='no_change'?'The candidate did not identify a justified substantive change.':'The proposal is retained, but current observations do not justify an automatic release.',
    intent:'Avoid change for its own sake.',
    current:'The current world and Lab baseline remain in place.',
    next:'Gather a concrete observation or test signal before choosing another intervention.',
    complete:'No release was made.',
    refreshSandbox:false
  };
  return {
    title:'Candidate work was retained for the protected release path',
    body:clean(report.decision?.title)||'The isolated candidate finished its host checks, but source release is not yet available.',
    intent:'Preserve the candidate and its evidence without suggesting it has changed the running game.',
    current:changed?`${changed} changed file${changed===1?' is':'s are'} recorded in the isolated candidate.`:'No source change was released.',
    next:promotion==='blocked'?'A protected staging runtime and compatibility drill are required before source promotion.':clean(report.decision?.nextStep)||'Use the recorded outcome when selecting the next bounded task.',
    complete:'The World Lab remains on its current verified baseline.',
    refreshSandbox:false
  };
}
