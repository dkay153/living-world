import { randomUUID } from 'node:crypto';
export function createQueue(db,clock=Date.now) {
  return {
    enqueue(kind,input,key,maxAttempts=3) {
      const id=randomUUID(),now=clock();
      db.prepare('INSERT OR IGNORE INTO jobs(id,unique_key,kind,input,available_at,created_at,max_attempts) VALUES (?,?,?,?,?,?,?)').run(id,key,kind,JSON.stringify(input),now,now,maxAttempts);
      return db.prepare('SELECT id FROM jobs WHERE unique_key=?').get(key).id;
    },
    claim(kinds,leaseMs=30000) {
      const now=clock();db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare("UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,error='Worker lease expired',lease_token=NULL,lease_until=NULL WHERE state='running' AND lease_until<=?").run(now);
        const slots=kinds.map(()=>'?').join(',');
        const row=kinds.length?db.prepare(`SELECT * FROM jobs WHERE state='queued' AND available_at<=? AND attempts<max_attempts AND kind IN (${slots}) ORDER BY created_at,rowid LIMIT 1`).get(now,...kinds):null;
        if(!row){db.exec('COMMIT');return null;}
        const token=randomUUID();db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,lease_until=?,lease_token=? WHERE id=?").run(now+leaseMs,token,row.id);db.exec('COMMIT');
        return {...row,attempts:row.attempts+1,input:JSON.parse(row.input),token};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    finish(job,result) {
      return db.prepare("UPDATE jobs SET state='succeeded',result=?,finished_at=?,lease_until=NULL,lease_token=NULL WHERE id=? AND state='running' AND lease_token=? AND lease_until>?").run(JSON.stringify(result),clock(),job.id,job.token,clock()).changes===1;
    },
    fail(job,error) {
      return db.prepare("UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,error=?,available_at=?,lease_until=NULL,lease_token=NULL WHERE id=? AND state='running' AND lease_token=? AND lease_until>?").run(String(error).slice(0,500),clock()+Math.min(60000,1000*2**job.attempts),job.id,job.token,clock()).changes===1;
    },
    status(){return Object.fromEntries(db.prepare('SELECT state,COUNT(*) AS count FROM jobs GROUP BY state').all().map(r=>[r.state,r.count]));}
  };
}
