import { createHash } from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');

export function inspectStagingRuntime({platform=process.platform,windowsSandbox=false,containerRuntime=false}={}){
  if(platform!=='win32')return {ready:false,kind:'unverified',reason:'A separately verified candidate runtime is required before source promotion'};
  if(windowsSandbox)return {ready:true,kind:'windows_sandbox',reason:'Disposable Windows Sandbox runtime verified'};
  if(containerRuntime)return {ready:true,kind:'container',reason:'Disposable container runtime verified'};
  return {ready:false,kind:'none',reason:'Windows Sandbox, Hyper-V, Docker and Podman are unavailable on this host'};
}

// This broker never copies source into production. It only decides whether an
// artifact has enough independently produced evidence to enter staging.
export function evaluatePromotion({runtime,manifest,checks,worldLab,migration={required:false},backup=null,restore=null,constitutionHash}={}){
  const blocked=reason=>({state:'blocked',reason,eligible:false});
  if(!runtime?.ready)return blocked(runtime?.reason||'No protected staging runtime is available');
  if(!manifest?.sourceHash||!Array.isArray(manifest.files)||!constitutionHash)return blocked('A complete immutable source and constitution manifest is required');
  if(manifest.constitutionHash!==constitutionHash)return blocked('Constitution fixture hash does not match the protected broker');
  if(!checks?.passed||!checks?.discipline?.passed)return blocked('Candidate checks and declared state impact must pass');
  if(!worldLab?.checks?.passed||!worldLab?.journey?.preserved)return blocked('The candidate World Lab journey and history recovery evidence are required');
  if(migration.required&&(!backup?.consistent||!restore?.passed))return blocked('A schema change requires a consistent backup and a successful restore drill');
  return {state:'staging_eligible',reason:'Candidate may enter an isolated staging runtime; this is not production promotion',eligible:true,artifactHash:hash(JSON.stringify({sourceHash:manifest.sourceHash,files:manifest.files,constitutionHash}))};
}
