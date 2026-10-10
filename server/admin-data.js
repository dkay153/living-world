import { publicIdentity } from './memory.js';
export const DATA_TABLES=['players','gameplay','events','discoveries','environment','item_instances','knowledge','memories','jobs','checkpoints','improvements','admin_audit','developer_runs'];
const jsonFields=new Set(['state','payload','input','result','value','summary','evidence','details','report']);
export function createRedactor(db){
  const identities=new Map(db.prepare('SELECT id FROM players').all().map(r=>[r.id,`traveler-${publicIdentity(r.id)}`]));
  function clean(value,key=''){
    if(/lease_token|csrf|api.?key|authorization|password|secret/i.test(key))return '[protected]';
    if(value===null)return null;
    if(Array.isArray(value))return value.map(v=>clean(v));
    if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k)]));
    if(typeof value==='string'){
      if(jsonFields.has(key)){try{return clean(JSON.parse(value));}catch{ /* not a JSON field in this row */ }}
      for(const [id,alias] of identities)if(value.includes(id))value=value.replaceAll(id,alias);
      return value;
    }
    return value;
  }
  return clean;
}
export function tablePage(db,table,page=0,query=''){
  const invalid=message=>Object.assign(new Error(message),{status:400});
  if(!DATA_TABLES.includes(table))throw invalid('Unknown data collection');
  page=Number(page);if(!Number.isInteger(page)||page<0||page>1000000)throw invalid('Invalid page');
  if(typeof query!=='string'||query.length>200)throw invalid('Search is too long');
  // Search owner-visible aliases without exposing the underlying guest bearer identity.
  if(query.startsWith('traveler-')){
    const matching=db.prepare('SELECT id FROM players').all().find(r=>`traveler-${publicIdentity(r.id)}`===query);
    if(matching)query=matching.id;
  }
  const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);
  // Table and column names originate only from the allowlist/schema. Values are bound.
  const where=query?` WHERE ${columns.filter(c=>c!=='lease_token').map(c=>`CAST("${c}" AS TEXT) LIKE ?`).join(' OR ')}`:'';
  const bindings=query?columns.filter(c=>c!=='lease_token').map(()=>`%${query}%`):[];
  const total=db.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`).get(...bindings).count;
  const rows=db.prepare(`SELECT * FROM ${table}${where} ORDER BY rowid DESC LIMIT 30 OFFSET ?`).all(...bindings,page*30);
  const redact=createRedactor(db);return {table,page,total,pageSize:30,columns,rows:rows.map(row=>redact(row))};
}
