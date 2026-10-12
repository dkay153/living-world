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
- **AI studio:** start a **Current-source World Lab** beside the primary Studio conversation, then walk the actual top-down basin, use its encounter controls and leave concrete observations. Each Lab runs the current source in a separate local process with fresh disposable data, a distinct localhost origin and no production player data, owner credentials or release authority. Reset destroys that Lab's temporary world and starts another fresh one. The composer has three explicit modes: **Ask** retains a question as context, **Plan** retains the desired outcome and constraints, and **Agent** is the only mode that tries to queue one isolated developer task. Ask and Plan cannot accidentally start source work. Agent work queues only after the project Codex account, task controls and isolation are ready; otherwise it remains retained with the real blocking reason. Recent Ask and Plan entries are passed as bounded data to the next Agent task and to the next self-selected cycle; they do not override the constitution, evidence threshold, or no-change case. The Studio records the evidence/observation outcome rather than inventing a chat reply.
- **Memory controls:** pause/resume automatically scheduled maintenance or perform one tick. Pause persists across restarts. The game and event recording continue while maintenance is paused.
- **AI connections:** save the owner's exact OpenAI model ID, daily USD ceiling and existing API key. An explicit credential check requests the [OpenAI model catalog](https://developers.openai.com/api/reference/resources/models/methods/list). It makes no generation request. Saving a key never sends a provider request by itself.
- **Codex developer:** browser/headless account sign-in, model catalog and account usage windows, verified native isolation, an owner-selected per-task watchdog, a durable development queue, cancellation and captured changes/test reports. Living World does not impose local daily task or minute caps. Execution starts paused and changes candidate copies only. See [CODEX_DEVELOPER.md](CODEX_DEVELOPER.md).
- **Backups & export:** create a consistent SQLite backup, download an existing snapshot, or export all listed world collections as NDJSON from a consistent snapshot. Exports exclude authentication/settings/secret tables, replace guest bearer IDs and protect lease tokens and credential-like fields. Database snapshots retain private data and encrypted secrets.
- **Constitution:** inspect protected identity, the baseline and memory documentation. This is a document viewer; independent constitutional release enforcement remains future work.

There is no arbitrary SQL console, live history editor or browser code executor. Owner mutations require both the independent owner session and a CSRF token with an exact matching origin. The backend records owner login/logout, worker controls, retries, proposal decisions, provider configuration/checks, exports and backup operations in append-only audit rows. Read-only inspection does not append an audit event per row.

## Provider secrets and recovery

The API key is encrypted with AES-256-GCM in `owner_secrets`. Its random encryption key is `DATA_DIR/owner-seal.key`; the API never returns a saved provider key. Protect both files with OS permissions. On Windows the files inherit the directory's ACL; Unix creates the seal file with mode 0600. An OS user who has both the database and seal file can decrypt the credential.

Keep a protected copy of `owner-seal.key` with the backup recovery materials. Losing it prevents provider credential recovery. A restored database with saved credentials and a missing seal fails at startup instead of silently generating a replacement. See [OPERATIONS.md](OPERATIONS.md) for offline restore and server transfer. Backups must remain private, and NDJSON is an inspection export, not a database restore format.

`owner_settings` contains actual saved connection and maintenance configuration. `config/intelligence.json` documents the initial provider decision; editing it does not update the runtime settings.

## Current limits and next integration

World/API model execution remains disabled in runtime behavior and owner APIs. Codex account development is a separate, explicitly enabled route without a local daily task/minute cap; the per-task watchdog and account availability remain active. As inspected on 7 October 2026, the owner has saved model `gpt-5.6-sol` and a $10 daily ceiling; `owner_settings` remains the authority for subsequent changes. A saved budget is a declaration for the future runtime, not an implemented spending limiter. No paid inference calls were used to build or test this dashboard; provider tests use a mock transport.

World interpretation, generated Recognition, general source releases, external asset-generation providers, API spending accounting and unattended operator recovery are not implemented. Owner and self-selected Codex development copies, outcome feedback and validated visual-data releases are implemented. Existing memory summaries and investigations are deterministic. The next provider milestone must implement metered durable model jobs, structured proposals, local validation, replay/deduplication and failure recovery before enabling inference. Codex development uses isolated workspaces; general source promotion still requires a separate protected runtime and independent compatibility/recovery gates under the constitution.

See [the researched autonomy architecture](AUTONOMY.md) for the complete learning and operating loop, future Observatory views, failure drills and implementation order.

This dashboard is locally operational. Public hosting still needs the launch gates in BASELINE.md, including real player accounts, HTTPS, explicit origin configuration, secure cookies, process supervision, permissions and capacity checks. Remote owner login currently requires trusted OS access to run the launcher; there is no account recovery, MFA or delegated admin account system. The container recipe is supplied but has not been built on this machine.

## Validation

Automated checks cover authentication separation, ticket reuse/expiry, session expiry, CSRF/origin rejection, persistent worker pause, data pagination/redaction, consistent export and backup recovery, encryption/recovery, disabled inference, local job retries, audited proposal decisions and migration rollback. Browser checks cover desktop/mobile presentation, searchable history, full evidence records, owner controls and backup creation.

## Independent work in v0.5.0

The Codex developer page now includes self-selected work, cadence, verified outcomes, validated visual-data publication and rollback. Every autonomous change must now declare its evidence baseline, primary variable, no-change case, guardrails and observation/stop signals; absent evidence results in observation rather than churn. These use the owner-selected account model and per-task watchdog, without a local daily cap. The current-source World Lab is a review sandbox, not the protected candidate runtime needed for general code promotion. The source-promotion broker still requires a separately verified staging runtime, immutable manifests, candidate World Lab evidence and migration recovery evidence; this host currently lacks Windows Sandbox, Hyper-V, Docker and Podman, so it remains blocked. General code releases, World Intelligence inference and unattended host restart/recovery remain future work. See [evolution governance](EVOLUTION_GOVERNANCE.md), [the development loop](DEVELOPER_LOOP.md) and [Codex development](CODEX_DEVELOPER.md). Schema 7 required the consistent backup created before this migration.
# Live developer transcript

AI Studio treats the developer feed as a conversation, not a process log. Every provider adapter must report the same host-owned activity shape: **intent**, **current step**, **next step**, and the **completion signal**. The host records a durable message only when the real phase changes, then presents one live message while work is active. The live message includes elapsed time and refreshes through the authenticated local event stream. It never displays raw provider JSON, private reasoning, tool arguments, secrets, or an invented completion estimate.

The final message distinguishes a retained candidate, an incomplete impact declaration, a failed check, a no-change decision, and a published visual-data release. It explains whether the World Lab changed. A provider may contribute a bounded public result summary, but it cannot replace the host’s evidence or claim a release before independent validation.

The World Lab uses fresh disposable save data. It hot-reloads **only** a host-validated visual-data release. Candidate source code remains isolated until the protected staging and source-promotion path exists; Studio explicitly says when the Lab is still showing its verified baseline. This prevents a visually stale frame from being mistaken for a preview, and prevents an unvalidated candidate from changing the running game.
