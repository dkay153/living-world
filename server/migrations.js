export const SCHEMA_VERSION = 4;
export function migrate(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > SCHEMA_VERSION) throw new Error('Database is newer than this release; refusing to downgrade it.');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (version < 2) db.exec(`
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, player TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS discoveries (player TEXT NOT NULL, object TEXT NOT NULL, PRIMARY KEY(player,object));
      CREATE TABLE IF NOT EXISTS gameplay (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS environment (id TEXT PRIMARY KEY, state TEXT NOT NULL);
    `);
    if (version < 3) db.exec(`
      ALTER TABLE events ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE events ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
      CREATE INDEX events_player_id ON events(player,id);
      CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'History is append-only'); END;
      CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'History is append-only'); END;
      CREATE TABLE item_instances (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL,
        source_event INTEGER REFERENCES events(id), consumed_event INTEGER REFERENCES events(id),
        origin TEXT NOT NULL CHECK(origin IN ('earned','legacy_import'))
      );
      CREATE INDEX items_owner ON item_instances(owner,kind,consumed_event);
      CREATE TABLE knowledge (
        id INTEGER PRIMARY KEY, observer_kind TEXT NOT NULL, observer TEXT NOT NULL,
        subject TEXT NOT NULL, predicate TEXT NOT NULL, value TEXT NOT NULL,
        evidence INTEGER NOT NULL REFERENCES events(id),
        UNIQUE(observer_kind,observer,subject,predicate,evidence)
      );
      CREATE TABLE memories (player TEXT PRIMARY KEY, through_event INTEGER NOT NULL, summary TEXT NOT NULL);
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, unique_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, input TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed')),
        attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
        available_at INTEGER NOT NULL, lease_until INTEGER, lease_token TEXT,
        result TEXT, error TEXT, created_at INTEGER NOT NULL, finished_at INTEGER
      );
      CREATE INDEX jobs_available ON jobs(state,available_at);
      CREATE TABLE checkpoints (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE improvements (
        id TEXT PRIMARY KEY, unique_key TEXT NOT NULL UNIQUE, category TEXT NOT NULL, title TEXT NOT NULL,
        evidence TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', created_at INTEGER NOT NULL
      );
    `);
    if (version < 4) db.exec(`
      CREATE TABLE owner_tickets(hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,used_at INTEGER);
      CREATE TABLE owner_sessions(hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE owner_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE owner_secrets(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE admin_audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,details TEXT NOT NULL,at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TRIGGER audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
      CREATE TRIGGER audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
    `);
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
