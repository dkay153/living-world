# Operations and server transfer

## Configuration
Default `HOST=127.0.0.1`, `PORT=3000`, `DATA_DIR=data`. Optional `PUBLIC_ORIGIN` must equal the browser origin exactly (for example `https://game.example.com`); `COOKIE_SECURE=1` adds Secure cookies when behind HTTPS. Variables are read from the process environment; `.env` files are not loaded automatically.

```powershell
$env:HOST='127.0.0.1'
$env:PORT='3000'
npm start
```

The process runs until stopped. Health: `GET /healthz`. Logs go to standard output/error. Local automatic startup/restart is not configured; use an OS service supervisor for server deployment.

## Backup and restore
Run `npm run backup` while the server is running or stopped. It uses SQLite's online backup API, including committed WAL state. Backups are written under `backups/`. Guest identity stays in browser cookies; copying a database does not transfer browser identity.

To restore: stop the server; preserve the existing entire data folder as a recovery copy; create a fresh data folder; copy the chosen backup into it as `world.sqlite`; set DATA_DIR to that folder; start and check health and discoveries. Do not overwrite an open database. Never mix an old database with newer WAL/SHM files.

## First server deployment
1. Complete the public-launch gates in BASELINE.md, especially real account authentication.
2. Install the pinned Node 22 runtime; transfer source and package-lock.json; run `npm ci --omit=dev`.
3. Restore a consistent backup into a durable directory; point DATA_DIR at it. Keep one application instance.
4. Set HOST to loopback behind a reverse proxy. Configure TLS, WebSocket upgrade forwarding and PUBLIC_ORIGIN. Use COOKIE_SECURE=1 on HTTPS. Only trust proxy headers after implementing explicit proxy trust.
5. Run under a service supervisor with restart limits and separate unprivileged credentials. Restrict database permissions. Schedule backups, retain off-host copies and rehearse restore.
6. Check health, multiplayer, persistence, reconnect and backup/restore before inviting players.

No container engine is installed on this machine. A Linux container recipe is supplied but has not been built locally. Database volume must survive container replacement. The current local process is not a Windows Sandbox VM.
