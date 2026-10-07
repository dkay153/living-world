import { randomUUID } from 'node:crypto';
import { createQueue } from './jobs.js';
import { saveMemory } from './memory.js';
import { settings } from './owner-settings.js';
export function createSteward(store,clock=Date.now) {
  const queue=createQueue(store.db,clock);
  const control=settings(store.db);
  function schedule() {
    store.db.exec('BEGIN IMMEDIATE');
    try{
      const checkpoint=Number(store.db.prepare("SELECT value FROM checkpoints WHERE key='memory_cursor'").get()?.value||0);
      const changed=store.db.prepare('SELECT player,MAX(id) AS latest FROM (SELECT * FROM events WHERE id>? ORDER BY id LIMIT 200) GROUP BY player').all(checkpoint);
      if(!changed.length){store.db.exec('COMMIT');return;}
      for(const row of changed)queue.enqueue('summarize_player',{player:row.player},`memory:${row.player}:${row.latest}`);
      store.db.prepare("INSERT INTO checkpoints VALUES ('memory_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(Math.max(...changed.map(r=>r.latest))));store.db.exec('COMMIT');
    }catch(e){store.db.exec('ROLLBACK');throw e;}
  }
  function inspect() {
    const defeats=store.db.prepare("SELECT id FROM events WHERE kind='defeat' ORDER BY id DESC LIMIT 20").all();
    if(defeats.length>=3)store.db.prepare('INSERT OR IGNORE INTO improvements(id,unique_key,category,title,evidence,created_at) VALUES (?,?,?,?,?,?)').run(randomUUID(),'review:defeat-onboarding','gameplay','Review defeat recovery and early encounter difficulty',JSON.stringify({eventIds:defeats.map(r=>r.id),interpretation:'Repeated defeats justify investigation; they do not prove the game is too hard.'}),clock());
    return {version:1,throughEvent:store.db.prepare('SELECT MAX(id) AS id FROM events').get().id||0,defeatsObserved:defeats.length};
  }
  function tick() {
    if(control.get('workerPaused',false))return;
    schedule();
    const slot=Math.floor(clock()/60000);queue.enqueue('inspect_world',{},`inspection:${slot}`);
    // Local deterministic handlers only. A model-backed developer is not running yet.
    for(let i=0;i<8;i++){
      const job=queue.claim(['summarize_player','inspect_world']);if(!job)break;
      store.db.exec('BEGIN IMMEDIATE');
      try{
        const result=job.kind==='summarize_player'?saveMemory(store,job.input.player):inspect();
        if(!queue.finish(job,result))throw new Error('Job lease lost');store.db.exec('COMMIT');
      }catch(e){store.db.exec('ROLLBACK');queue.fail(job,e.message);}
    }
  }
  function status(){return {mode:'local-memory-worker',provider:'openai',modelCallsEnabled:false,paused:control.get('workerPaused',false),jobs:queue.status(),proposals:store.db.prepare('SELECT category,title,status FROM improvements ORDER BY created_at DESC LIMIT 10').all()};}
  return {tick,status,queue};
}
