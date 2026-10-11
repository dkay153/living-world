import { settings } from './owner-settings.js';

export const autonomyDefaults={enabled:false,intervalMinutes:30,automaticVisuals:false};
export function createAutonomy(store,clock=Date.now){
  const db=store.db,control=settings(db);
  const config=()=>({...autonomyDefaults,...control.get('autonomy',{})});
  function evidence(){
    // Aggregate facts only: no player bearer identities, private text or account credentials.
    const proposals=db.prepare("SELECT id,category,title,evidence,status FROM improvements WHERE status IN ('proposed','accepted') ORDER BY created_at DESC LIMIT 10").all().map(p=>({...p,evidence:JSON.parse(p.evidence)}));
    const outcomes=db.prepare('SELECT run_id,outcome,finding,evidence,created_at FROM developer_lessons ORDER BY created_at DESC,rowid DESC LIMIT 8').all().map(l=>({...l,evidence:JSON.parse(l.evidence)}));
    const counts=Object.fromEntries(['players','events','item_instances','memories'].map(t=>[t,db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
    const events=db.prepare('SELECT kind,COUNT(*) AS count FROM events GROUP BY kind').all();
    return {version:1,capturedAt:clock(),counts,eventCounts:events,proposals,outcomes,limits:'Aggregate observations are evidence, not proof of causation. Model hypotheses are unverified until measured.'};
  }
  function status(){
    const c=config(),last=db.prepare("SELECT created_at FROM developer_runs WHERE origin='autonomous' ORDER BY created_at DESC LIMIT 1").get();
    const recent=db.prepare("SELECT outcome FROM developer_lessons ORDER BY created_at DESC,rowid DESC LIMIT 3").all();
    const failures=recent.length===3&&recent.every(r=>r.outcome==='execution_failed'||r.outcome==='interrupted');
    return {config:c,nextAt:last?last.created_at+c.intervalMinutes*60000:clock(),circuitOpen:failures,lessons:db.prepare('SELECT run_id,outcome,finding,created_at FROM developer_lessons ORDER BY created_at DESC,rowid DESC LIMIT 12').all(),generalCodeReleases:false};
  }
  function ready(){const s=status();return s.config.enabled&&!s.circuitOpen&&clock()>=s.nextAt&&!db.prepare("SELECT 1 FROM developer_runs WHERE state IN ('queued','running')").get();}
  function save(input){
    if(typeof input.enabled!=='boolean'||typeof input.automaticVisuals!=='boolean'||!Number.isInteger(input.intervalMinutes)||input.intervalMinutes<1||input.intervalMinutes>1440)throw Object.assign(new Error('Set autonomy, visual releases and a 1–1,440 minute interval'),{status:400});
    control.set('autonomy',{enabled:input.enabled,automaticVisuals:input.automaticVisuals,intervalMinutes:input.intervalMinutes});
    db.prepare('INSERT INTO admin_audit(action,details) VALUES (?,?)').run('autonomy_settings_saved',JSON.stringify(input));return status();
  }
  function learn(runId,outcome,finding,evidence){db.prepare('INSERT OR IGNORE INTO developer_lessons VALUES (?,?,?,?,?)').run(runId,outcome,finding,JSON.stringify(evidence),clock());}
  return {config,evidence,status,ready,save,learn};
}
