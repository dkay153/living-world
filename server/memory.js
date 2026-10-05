import { createHash } from 'node:crypto';
export function publicIdentity(id) { return createHash('sha256').update(id).digest('hex').slice(0,12); }
export function describePlayer(store,id) {
  const counts=Object.fromEntries(store.db.prepare('SELECT kind,COUNT(*) AS count FROM events WHERE player=? GROUP BY kind').all(id).map(r=>[r.kind,r.count]));
  const evidence=store.db.prepare('SELECT id,kind,subject,version,payload,at FROM events WHERE player=? ORDER BY id DESC LIMIT 30').all(id).map(r=>({...r,payload:JSON.parse(r.payload)}));
  const latest=store.db.prepare('SELECT MAX(id) AS id FROM events WHERE player=?').get(id).id||0;
  return {version:1,traveler:publicIdentity(id),throughEvent:latest,counts,discoveries:store.discoveries(id),
    observed:store.knowledge('npc','keeper',id).map(f=>({...f,observer:'Mara, the Keeper'})),
    items:store.inventoryItems(id),recentEvidence:evidence,
    interpretation:'Observed facts only. No class, personality, intention or Recognition has been inferred.'};
}
export function saveMemory(store,id) {
  const summary=describePlayer(store,id);
  store.db.prepare('INSERT INTO memories VALUES (?,?,?) ON CONFLICT(player) DO UPDATE SET through_event=excluded.through_event,summary=excluded.summary').run(id,summary.throughEvent,JSON.stringify(summary));
  return summary;
}
// Browser view never includes actor tokens, full action payloads or other travelers' private histories.
export function personalJournal(store,id) {
  const rows=store.db.prepare("SELECT id,kind,subject,at,version FROM events WHERE player=? AND kind NOT IN ('action_committed','position_changed') ORDER BY id DESC LIMIT 20").all(id);
  const memory=store.db.prepare('SELECT through_event FROM memories WHERE player=?').get(id);
  const itemCount=store.db.prepare('SELECT COUNT(*) AS count FROM item_instances WHERE owner=? AND consumed_event IS NULL').get(id).count;
  return {entries:rows,rememberedThrough:memory?.through_event||0,trackedItems:itemCount};
}
