// Replaceable operator policy. Inputs are observations; the kernel checks every action.
// This module and operator/tools run only in the confined operator container.
export function decide(evidence, memory = {}) {
  if (evidence.worldRecoverable && !evidence.worldReady) return {version:1,actions:[{kind:'recover_world'}],memory};
  if (evidence.backupDue) return {version:1,actions:[{kind:'backup_world'}],memory};
  if (evidence.developmentAllowed) return {version:1,actions:[{kind:'develop',task:'Independently choose and complete the most useful renderer, gameplay, tooling or operational improvement. Use actual evidence, preserve history and owner settings, test the exact artifact and release through the independent kernel.'}],memory};
  if (evidence.toolDue) return {version:1,actions:[{kind:'tool',name:'health-report',input:{worldReady:evidence.worldReady}}],memory};
  return {version:1,actions:[],memory};
}
