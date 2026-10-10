# World memory and background work

## Running now
The server records authoritative events, item provenance and observed knowledge. Schema 6 retains the owner sessions, configuration, encrypted credentials and audit records from schema 4 and adds durable Codex development attempts. An integrated local worker wakes every two seconds, summarizes changed player histories and inspects the world once per minute. It uses durable jobs and event checkpoints; it needs no API key and makes no network/model calls. The owner can pause/resume it through the Observatory; pause persists across restarts.

The owner selected OpenAI. `config/intelligence.json` records the initial decision; actual owner configuration is now stored in `owner_settings` and managed through the [Observatory](ADMIN.md). Actual model and dollar-budget settings are owner-controlled in the database; do not replace them from the initial configuration file. Credentials can be stored encrypted and explicitly checked against the model catalog. Inference is not implemented and cannot be enabled by saving settings. No model selection, hidden inference or paid call is made by this milestone. Future structured proposals will follow [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), with local validation before applying changes.

## History and provenance
- Events include schema version, kind, subject and supporting payload. Gameplay events in a single action share an action ID and location.
- Accepted state changes store before/after snapshots in an `action_committed` event. Movement stores its from/to positions. Battle turns store the chosen command, vitality changes and outcome.
- Actions commit gameplay, resource state, events, item transfers and knowledge atomically. Failed actions restore in-memory state as well as rolling back SQLite.
- Dewleaf, shards and the rewarded blade are persistent item instances with source-event references. Consumed items reference the healing or delivery event that used them.
- Existing inventories are imported once, lazily on the player's next gameplay action. Their unknown sources are marked `legacy_import`; history is not fabricated.
- Event rows are append-only through database triggers. This protects against ordinary application mistakes, not an unrestricted administrator. Restoring a backup or a reviewed schema migration remains possible.

## Knowledge boundaries
Player discovery creates player knowledge. Mara learns that someone spoke to her, accepted her quest, or delivered its materials. She does not learn wilderness battle outcomes simply because the server knows them. Knowledge carries supporting event IDs. NPC conversation text is still authored; memory-based model dialogue is future work.

Summaries are fact dossiers, not inferred personalities or automatic class assignments. They retain counts, recent supporting events, discoveries and item provenance. The browser receives a private journal for its own guest identity; it never receives the full ledger, other players' private dossiers, job inputs or bearer identity tokens. The shared chronicle shows the existing selected world events only.

## Jobs and improvement proposals
Jobs use unique keys, finite attempts, expiring leases and per-claim tokens. Expired jobs can be reclaimed after restart; an old worker cannot mark a new worker's job complete. Results and errors persist. Summaries and job completion commit together. A repeated tick without new evidence does not enqueue the same work twice.

The initial inspector creates one investigation proposal if it observes at least three defeat events. Its evidence is recorded and its wording deliberately avoids concluding that difficulty is wrong. This is a deterministic diagnostic, not AI design judgment. The Codex work loop can use these proposals as evidence when choosing a task. They are investigations, not proven diagnoses. The queue/handler boundary can later accept model interpretation, visual evaluation and developer jobs without changing gameplay transport.

`npm run steward:status` reports aggregate work counts without printing private dossiers. `npm run steward:once` performs one local maintenance tick and then reports its status. The server already runs this worker; the one-shot command is useful for offline maintenance or recovery.

## Verification and limits
The First Echo fixture exercises item origins, consumption and observed knowledge. Tests cover old-database migration, atomic rollback, append-only events, private-journal isolation, job deduplication, expired-worker recovery, stale completion rejection and finite retries.

This is the initial history substrate. It does not yet include trading/ownership transfers, NPC belief correction, rumors, semantic long-term compression, LLM Recognition, World Intelligence inference, model weight training or general autonomous source-code releases. Bounded owner and self-selected Codex tasks, empirical outcome memory and validated visual-data releases now work; see [CODEX_DEVELOPER.md](CODEX_DEVELOPER.md). Replay fixtures currently exercise authoritative rules and inspect supporting records; full event-based world reconstruction is not implemented. Storage retention and summary batching need capacity work before a public server.

Developer outcomes are stored in `developer_lessons`, with checks, release receipts and explicitly unverified model hypotheses. They feed later cycles. This is feedback memory, not a completed causal learning engine or trained model.
