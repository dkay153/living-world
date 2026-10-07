import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
export function settings(db) {
  const initial={provider:'openai',model:null,dailyBudgetUsd:null,modelCallsEnabled:false};
  return {
    get(key,fallback=null){const row=db.prepare('SELECT value FROM owner_settings WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;},
    set(key,value){db.prepare('INSERT INTO owner_settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));},
    ai(){return this.get('ai',initial);}
  };
}
export function createSecretStore(db,dataDir) {
  mkdirSync(dataDir,{recursive:true});const path=resolve(dataDir,'owner-seal.key');
  if(!existsSync(path)){
    if(db.prepare('SELECT 1 FROM owner_secrets LIMIT 1').get())throw new Error('Credential seal is missing. Restore owner-seal.key alongside the database.');
    writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});
  }
  const key=readFileSync(path);if(key.length!==32)throw new Error('Invalid credential encryption key');
  return {
    configured(){return !!db.prepare("SELECT 1 FROM owner_secrets WHERE key='openai'").get();},
    save(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);const sealed=JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')});db.prepare("INSERT INTO owner_secrets VALUES ('openai',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(sealed);},
    read(){const row=db.prepare("SELECT value FROM owner_secrets WHERE key='openai'").get();if(!row)return null;const data=JSON.parse(row.value);const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'base64'));decipher.setAuthTag(Buffer.from(data.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(data.body,'base64')),decipher.final()]).toString('utf8');}
  };
}
