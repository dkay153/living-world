import { randomBytes,createHash } from 'node:crypto';
export const hashToken=value=>createHash('sha256').update(value).digest('hex');
export function createOwnerTicket(db,clock=Date.now) {
  const ticket=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO owner_tickets VALUES (?,?,NULL)').run(hashToken(ticket),clock()+120000);
  return ticket;
}
export function createOwnerAuth(db,clock=Date.now) {
  return {
    exchange(ticket) {
      if(typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket))return null;
      db.exec('BEGIN IMMEDIATE');
      try {
        const changed=db.prepare('UPDATE owner_tickets SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>?').run(clock(),hashToken(ticket),clock()).changes;
        if(!changed){db.exec('COMMIT');return null;}
        const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
        db.prepare('INSERT INTO owner_sessions VALUES (?,?,?)').run(hashToken(token),csrf,clock()+12*3600000);
        db.prepare("INSERT INTO admin_audit(action,details) VALUES ('owner_login','{}')").run();
        db.exec('COMMIT');return {token,csrf};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    session(cookie) {
      const token=cookie?.match(/(?:^|;\s*)lw_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
      return token?db.prepare('SELECT hash,csrf,expires_at FROM owner_sessions WHERE hash=? AND expires_at>?').get(hashToken(token),clock()):null;
    },
    revoke(session){db.prepare('DELETE FROM owner_sessions WHERE hash=?').run(session.hash);}
  };
}
