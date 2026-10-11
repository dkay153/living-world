import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate } from './migrations.js';
import { SPAWN } from './world.js';
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try { migrate(db); } catch(error) { db.close(); throw error; }
  return {
    db,
    player(id) { db.prepare('INSERT OR IGNORE INTO players VALUES (?,?,?)').run(id,SPAWN.x,SPAWN.y); return db.prepare('SELECT * FROM players WHERE id=?').get(id); },
    move(id,x,y) { db.prepare('UPDATE players SET x=?,y=? WHERE id=?').run(x,y,id); },
    loadGame(id) { const row=db.prepare('SELECT state FROM gameplay WHERE id=?').get(id);return row?JSON.parse(row.state):{hp:30,maxHp:30,inventory:{dewleaf:0,shard:0},quest:'unstarted',victories:0,deaths:0}; },
    saveGame(id,state) { db.prepare('INSERT INTO gameplay VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(id,JSON.stringify(state)); },
    loadEnvironment(id) {const row=db.prepare('SELECT state FROM environment WHERE id=?').get(id);return row?JSON.parse(row.state):null;},
    saveEnvironment(id,state) {db.prepare('INSERT INTO environment VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(id,JSON.stringify(state));},
    event(id,kind,subject,payload={}) {
      return Number(db.prepare('INSERT INTO events(player,kind,subject,version,payload) VALUES (?,?,?,1,?)').run(id,kind,subject,JSON.stringify(payload)).lastInsertRowid);
    },
    awardItem(owner,kind,evidence,origin='earned') {
      const id=randomUUID(); db.prepare('INSERT INTO item_instances(id,owner,kind,source_event,origin) VALUES (?,?,?,?,?)').run(id,owner,kind,evidence,origin); return id;
    },
    consumeItems(owner,kind,count,evidence) {
      const rows=db.prepare('SELECT id FROM item_instances WHERE owner=? AND kind=? AND consumed_event IS NULL ORDER BY rowid LIMIT ?').all(owner,kind,count);
      if(rows.length!==count)throw new Error('Inventory provenance disagrees with quantity');
      for(const row of rows)db.prepare('UPDATE item_instances SET consumed_event=? WHERE id=?').run(evidence,row.id);
      return rows.map(row=>row.id);
    },
    inventoryItems(owner) {
      return db.prepare('SELECT id,kind,source_event,consumed_event,origin FROM item_instances WHERE owner=? ORDER BY rowid DESC LIMIT 100').all(owner);
    },
    importInventory(owner,state) {
      if(state.inventoryTracked)return;
      for(const [kind,count] of Object.entries(state.inventory))for(let i=0;i<count;i++)this.awardItem(owner,kind,null,'legacy_import');
      if(state.quest==='complete')this.awardItem(owner,'tempered_blade',null,'legacy_import');
      state.inventoryTracked=true;
    },
    learn(observerKind,observer,subject,predicate,value,evidence) {
      db.prepare('INSERT OR IGNORE INTO knowledge(observer_kind,observer,subject,predicate,value,evidence) VALUES (?,?,?,?,?,?)').run(observerKind,observer,subject,predicate,JSON.stringify(value),evidence);
    },
    knowledge(observerKind,observer,subject) {
      return db.prepare('SELECT predicate,value,evidence FROM knowledge WHERE observer_kind=? AND observer=? AND subject=? ORDER BY id').all(observerKind,observer,subject).map(row=>({...row,value:JSON.parse(row.value)}));
    },
    discover(id,object) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const fresh = db.prepare('INSERT OR IGNORE INTO discoveries VALUES (?,?)').run(id,object).changes > 0;
        if(fresh) this.event(id,'discovery',object);
        db.exec('COMMIT'); return fresh;
      } catch(e) { db.exec('ROLLBACK'); throw e; }
    },
    history() { return db.prepare("SELECT id,kind,subject,at FROM events WHERE kind IN ('discovery','gathering','victory','defeat','healing','quest_started','quest_completed','encounter','retreat') ORDER BY id DESC LIMIT 12").all(); },
    discoveries(id) { return db.prepare('SELECT object FROM discoveries WHERE player=?').all(id).map(r=>r.object); }
  };
}
