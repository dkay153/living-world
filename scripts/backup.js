import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const source=resolve(process.env.DATA_DIR || 'data','world.sqlite');
const backupDir=resolve(process.env.BACKUP_DIR||'backups');
mkdirSync(backupDir,{recursive:true});
const output=resolve(backupDir,`world-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
const db=new DatabaseSync(source,{readOnly:true});
try {await backup(db,output);console.log(`Backup saved: ${output}`);}finally{db.close();}
