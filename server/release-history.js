import { DatabaseSync, backup } from 'node:sqlite';
import { readFile, writeFile, rename, mkdir, lstat, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { openStore } from './store.js';
import { digest } from './release-artifacts.js';

export const worldTables=['players','gameplay','events','discoveries','environment','item_instances','knowledge','memories'];
const retained=['events','discoveries','knowledge'];
const key=(table,row)=>table==='discoveries'?JSON.stringify([row.player,row.object]):String(row.id??row.player);
export function inspectHistory(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
    for(const table of worldTables)if(db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table)?.type!=='table')throw new Error('Canonical history must use real tables');
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('World database integrity failed');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    const rows=Object.fromEntries(worldTables.map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    // The runtime world never contains host owner credentials or paid-work jobs.
    for(const table of ['owner_settings','owner_secrets','owner_sessions','owner_tickets','developer_runs']){
      const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if(exists&&db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)throw new Error('Owner control data is forbidden in a released world');
    }
    const schema=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    return {version,rows,schemaHash:digest(JSON.stringify(schema)),hash:digest(JSON.stringify({version,rows}))};
  }finally{db.close();}
}
export function preserveHistory(before,after,{startup=false}={}){
  if(before.version!==after.version)throw new Error('Schema change needs a separately verified backward-compatible migration lane');
  if(before.schemaHash!==after.schemaHash)throw new Error('Unversioned schema changes are forbidden');
  for(const table of retained){
    const next=new Map(after.rows[table].map(row=>[key(table,row),row]));
    for(const row of before.rows[table])if(JSON.stringify(next.get(key(table,row)))!==JSON.stringify(row))throw new Error(`Historical ${table} changed or disappeared`);
  }
  const nextItems=new Map(after.rows.item_instances.map(row=>[row.id,row]));
  for(const row of before.rows.item_instances){
    const item=nextItems.get(row.id);
    if(!item||['id','owner','kind','source_event','origin'].some(field=>item[field]!==row[field])||row.consumed_event!==null&&item.consumed_event!==row.consumed_event)throw new Error('Item provenance or consumption regressed');
  }
  for(const table of ['players','gameplay']){
    const next=new Map(after.rows[table].map(row=>[row.id,row]));
    for(const row of before.rows[table]){
      const value=next.get(row.id);if(!value)throw new Error('Persistent traveler disappeared');
      if(startup&&JSON.stringify(row)!==JSON.stringify(value))throw new Error('Startup altered existing traveler progress');
      if(table==='gameplay'){
        const a=JSON.parse(row.state),b=JSON.parse(value.state);
        if(a.quest==='complete'&&b.quest!=='complete'||b.victories<a.victories||b.deaths<a.deaths)throw new Error('Historical gameplay progress regressed');
      }
    }
  }
  return true;
}
// Initial cutover copies only canonical world rows. The original mixed control
// database is backed up and left intact; no owner table or account home is mapped.
export async function copyWorld(sourcePath,destination){
  const source=new DatabaseSync(sourcePath,{readOnly:true});const target=openStore(destination);
  try{
    target.db.exec('BEGIN IMMEDIATE');
    for(const table of worldTables){
      const rows=source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      for(const row of rows){const columns=Object.keys(row);target.db.prepare(`INSERT INTO ${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
    }
    target.db.exec('COMMIT');
  }catch(error){target.db.exec('ROLLBACK');throw error;}
  finally{source.close();target.db.close();}
  return inspectHistory(destination);
}
export async function consistentBackup(source,output){
  const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,output);}finally{db.close();}
  return {path:output,sha256:digest(await readFile(output))};
}
export async function acceptCheckpoint({directory,encoded,before,startup=false}){
  if(typeof encoded!=='string'||encoded.length>64*1024*1024||encoded.length%4!==0||/[^A-Za-z0-9+/=]/.test(encoded))throw new Error('Invalid world checkpoint');
  const bytes=Buffer.from(encoded,'base64');if(bytes.length<100||bytes.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw new Error('Invalid SQLite checkpoint');
  if(bytes.toString('base64')!==encoded)throw new Error('Non-canonical checkpoint encoding');
  await mkdir(directory,{recursive:true});const temp=resolve(directory,`checkpoint-${randomUUID()}.sqlite`);await writeFile(temp,bytes,{flag:'wx'});
  const next=inspectHistory(temp);if(before)preserveHistory(before,next,{startup});
  // Host owns this file and never maps it writable into any candidate runtime.
  const handle=await open(temp,'r+');try{await handle.sync();}finally{await handle.close();}
  await rename(temp,resolve(directory,'world.sqlite'));return next;
}
export async function assertPlainFile(path){if(!(await lstat(path)).isFile()||(await lstat(path)).isSymbolicLink())throw new Error('Non-regular release input');}
