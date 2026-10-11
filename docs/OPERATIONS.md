# Operations and server transfer

## Configuration
Default `HOST=127.0.0.1`, `PORT=3000`, `DATA_DIR=data`, `BACKUP_DIR=backups`. Optional `PUBLIC_ORIGIN` must equal the browser origin exactly (for example `https://game.example.com`); `COOKIE_SECURE=1` adds Secure cookies when behind HTTPS. Variables are read from the process environment; `.env` files are not loaded automatically. Use the same environment for server and owner launcher. Read [ADMIN.md](ADMIN.md) for owner access and AI setup.

```powershell
$env:HOST='127.0.0.1'
$env:PORT='3000'
npm start
```

The process runs until stopped. Health: `GET /healthz`. Logs go to standard output/error. Local automatic startup/restart is not configured; use an OS service supervisor for server deployment.

## Backup and restore
Run `npm run backup` while the server is running or stopped, or create a snapshot through the owner dashboard. Both use SQLite's online backup API, including committed WAL state. Backups are written under `BACKUP_DIR` (default `backups/`). Guest identity stays in browser cookies; copying a database does not transfer browser identity. Backups include private histories, owner settings/session records and encrypted provider credentials. Keep them private. Separately preserve `DATA_DIR/owner-seal.key`; a database backup alone cannot restore saved credentials.

To restore: stop the server; preserve the existing entire data folder as a recovery copy; create a fresh data folder; copy the chosen backup into it as `world.sqlite` and restore the matching `owner-seal.key`; set DATA_DIR to that folder; start and check health, discoveries and admin login. Do not overwrite an open database. Never mix an old database with newer WAL/SHM files. A backup can contain still-valid owner sessions; restrict access to the restore and revoke sessions/tickets in the restored database before a hosted recovery. The NDJSON world export is for inspection, not restore.

## First server deployment
1. Complete the public-launch gates in BASELINE.md, especially real account authentication.
2. Install the pinned Node 22 runtime; transfer source and package-lock.json; run `npm ci --omit=dev`.
3. Restore a consistent backup and its credential seal into a durable directory; point DATA_DIR at it. Set a durable, writable BACKUP_DIR. Keep one application instance.
4. Set HOST to loopback behind a reverse proxy. Configure TLS, WebSocket upgrade forwarding and PUBLIC_ORIGIN. Use COOKIE_SECURE=1 on HTTPS. Only trust proxy headers after implementing explicit proxy trust.
5. Run under a service supervisor with restart limits and separate unprivileged credentials. Restrict database permissions. Schedule backups, retain off-host copies and rehearse restore.
6. Check health, multiplayer, persistence, reconnect and backup/restore before inviting players.

No container engine is installed on this machine. A Linux container recipe is supplied but has not been built locally. Its database, credential seal and backups use the `/app/data` volume (`BACKUP_DIR=/app/data/backups`) and must survive container replacement. The current local process is not a Windows Sandbox VM.


## Codex development state

Schema 5 persists owner-queued Codex development attempts. Keep `DATA_DIR/developer-runs` for source manifests, candidate copies and changes. `DATA_DIR/codex-home` contains a separate Codex credential cache; protect it like a password and never include it in public artifacts. SQLite backups do not include this cache or candidate directories. Prefer a fresh device-code sign-in on the destination server. Preserve the existing API seal separately as described above.

After a server restart, developer isolation must be verified again before queued tasks can dispatch. Expired attempts become interrupted and disable execution; they do not retry account usage automatically. The per-task watchdog is a recovery boundary, not the API dollar budget; Living World has no local daily developer cap. Public-server isolation, service staging and automatic promotion/rollback remain unimplemented. See [Codex operating details](CODEX_DEVELOPER.md).

## Independent work in v0.5.0

The Codex developer page now includes self-selected work, cadence, verified outcomes, validated visual-data publication and rollback. These use the owner-selected account model and existing run/time limits. General code releases, World Intelligence inference and unattended host restart/recovery remain future work. See [the development loop](DEVELOPER_LOOP.md) and [Codex development](CODEX_DEVELOPER.md). Schema 6 requires a consistent backup before migration.
