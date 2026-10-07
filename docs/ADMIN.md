# The Observatory — owner administration

The Observatory is the local owner dashboard at `/admin`. It uses the real application database and backend. It is separate from guest game identity. This release provides one owner authority; developer, administrator and supervisor are responsibilities shown to that owner, not separate user accounts or permission tiers.

## Sign in

With the server running, open a terminal in the project folder and run:

```powershell
npm run admin:open
```

The launcher uses the configured `DATA_DIR` and `PUBLIC_ORIGIN`/`PORT`. It opens a single-use login link that expires after two minutes. The dashboard removes the ticket fragment from the address before exchanging it. Tickets and session bearer tokens are stored as hashes. The owner session lasts twelve hours; Sign out revokes it. There is no shared/default admin password and no elevation from a guest game cookie.

`npm run admin:prepare` writes the link to ignored `work/admin-launch.json` for a local browser launcher. Treat that file as a temporary credential, never commit or share it. It is not printed to the console. Anyone able to run the launcher against the live database can become the owner: protect OS access and the data directory.

## Available controls and data

- **Overview:** real player/event/item counts, online connections, job outcomes, service uptime, worker status, provider readiness and recent owner actions.
- **World data:** searchable, paginated players, character state, events, discoveries, environment state, item instances, knowledge, summaries, jobs, checkpoints, improvement proposals and audit records. Open shows a complete row and parsed evidence. Guest bearer identities use stable traveler aliases; aliases can be searched. Static maps and authored content still live in source files.
- **Work & proposals:** inspect recent job outcomes, retry failed supported memory jobs, accept or dismiss investigations and inspect their evidence. Accepting a proposal records a decision; it does not execute code or implement an improvement. Older work is accessible through World data.
- **Memory controls:** pause/resume automatically scheduled maintenance or perform one tick. Pause persists across restarts. The game and event recording continue while maintenance is paused.
- **AI connections:** save the owner's exact OpenAI model ID, daily USD ceiling and existing API key. An explicit credential check requests the [OpenAI model catalog](https://developers.openai.com/api/reference/resources/models/methods/list). It makes no generation request. Saving a key never sends a provider request by itself.
- **Backups & export:** create a consistent SQLite backup, download an existing snapshot, or export all listed world collections as NDJSON from a consistent snapshot. Exports exclude authentication/settings/secret tables, replace guest bearer IDs and protect lease tokens and credential-like fields. Database snapshots retain private data and encrypted secrets.
- **Constitution:** inspect protected identity, the baseline and memory documentation. This is a document viewer; independent constitutional release enforcement remains future work.

There is no arbitrary SQL console, live history editor or browser code executor. Owner mutations require both the independent owner session and a CSRF token with an exact matching origin. The backend records owner login/logout, worker controls, retries, proposal decisions, provider configuration/checks, exports and backup operations in append-only audit rows. Read-only inspection does not append an audit event per row.

## Provider secrets and recovery

The API key is encrypted with AES-256-GCM in `owner_secrets`. Its random encryption key is `DATA_DIR/owner-seal.key`; the API never returns a saved provider key. Protect both files with OS permissions. On Windows the files inherit the directory's ACL; Unix creates the seal file with mode 0600. An OS user who has both the database and seal file can decrypt the credential.

Keep a protected copy of `owner-seal.key` with the backup recovery materials. Losing it prevents provider credential recovery. A restored database with saved credentials and a missing seal fails at startup instead of silently generating a replacement. See [OPERATIONS.md](OPERATIONS.md) for offline restore and server transfer. Backups must remain private, and NDJSON is an inspection export, not a database restore format.

`owner_settings` contains actual saved connection and maintenance configuration. `config/intelligence.json` documents the initial provider decision; editing it does not update the runtime settings.

## Current limits and next integration

Model execution is disabled in both runtime behavior and owner APIs. Model and budget remain unset until the owner supplies them. A saved budget is a declaration for the future runtime, not an implemented spending limiter. No paid inference calls were used to build or test this dashboard; provider tests use a mock transport.

World interpretation, generated Recognition, autonomous coding, asset generation, independent releases, spending accounting and operator recovery are not implemented. Existing memory summaries and investigations are deterministic. The next provider milestone must implement metered durable model jobs, structured proposals, local validation, replay/deduplication and failure recovery before enabling inference. Developer execution requires isolated workspaces and a tested release/rollback path under the constitution.

This dashboard is locally operational. Public hosting still needs the launch gates in BASELINE.md, including real player accounts, HTTPS, explicit origin configuration, secure cookies, process supervision, permissions and capacity checks. Remote owner login currently requires trusted OS access to run the launcher; there is no account recovery, MFA or delegated admin account system. The container recipe is supplied but has not been built on this machine.

## Validation

Automated checks cover authentication separation, ticket reuse/expiry, session expiry, CSRF/origin rejection, persistent worker pause, data pagination/redaction, consistent export and backup recovery, encryption/recovery, disabled inference, local job retries, audited proposal decisions and migration rollback. Browser checks cover desktop/mobile presentation, searchable history, full evidence records, owner controls and backup creation.
