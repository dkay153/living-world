# Independent game development infrastructure audit

Inspected 15 October 2026. Scope: the current working tree, including pre-existing local changes, rather than only commit dd5ad793477514ee673b481157e9cffef2cf40e9. The goal is independent development and operation of the whole game. Adaptive quests are one consumer of that infrastructure.

## Conclusion and observed runtime

The project has a real isolated developer loop, but not an end-to-end autonomous game studio. It can select work, plan, edit source copies, run selected offline tests and retain outcomes. A narrow art-data lane can publish under owner policy. General source deployment, candidate browser evaluation and automatic service recovery are unfinished. Connecting or waking the account cannot by itself close these gaps.

Read-only aggregate inspection of `outputs/site-preview/data/world.sqlite` found schema 7, three attempts (one failed, two interrupted), three uncertain failure lessons, and zero visual releases. Execution is disabled; independent scheduling is enabled at 30 minutes with automatic visual publication configured. Three failures open the circuit. Saved automatic routing and unlimited task time were preserved. No secrets were read, no model job started and no database migrated. No database existed at the default `data/world.sqlite` path; this does not prove there are no other deployments.

## Infrastructure map

| Surface | Implemented evidence | Remaining gap or limit |
| --- | --- | --- |
| Authoritative game | `server/game.js`, `combat.js`, `world.js`: exploration, gathering, distinct command encounters, recovery, Mara and The First Echo | Small authored content set; no general quest/content registry or individualized proposal commit lane |
| Persistence and history | `server/store.js`, `migrations.js`: atomic actions, append-only events, item origins/consumption, NPC observations and versioned migrations | Accepted actions get random IDs; player requests lack retry receipts. Full event reconstruction and release migration/restore orchestration are absent |
| Knowledge and maintenance | `server/memory.js`, `steward.js`: private journals, fact dossiers and bounded durable jobs | Bounded recent event/item windows are not complete semantic history; dialogue remains authored; diagnostics are not AI Recognition |
| Task selection | `server/autonomy.js`, `developer.js`: aggregate observations, previous outcomes, Ask/Plan context, cadence and owner-task precedence | Mostly a fixed defeat investigation. Durable long-horizon goals, automatic diagnosis and causal learning are unfinished |
| Account and policy | `server/codex-connection.js`, `codex-process.js`, owner settings/authentication: per-project account, explicit settings, model catalog and provider limits | Cached account allowance checks are not transactional API spending reservations; World Intelligence inference stays disabled |
| Source and planning | `server/developer-sandbox.js`, `developer.js`: minimized copies, separate planning, declarations, state-impact checks and isolation canaries | UI source was missing; fixed here. Only ws is copied as a dependency, so React builds remain unavailable inside candidates. Godot source is outside current snapshot roots |
| Execution and durable work | `server/jobs.js`, `owned-process.js`, `developer-runner.js`: fencing, renewal, cancellation and process ownership | Uncertain attempts pause instead of replaying paid work. Native containment is not a complete CPU/memory-limited browser compartment |
| Candidate checks | `server/developer.js`, contracts and candidate evaluator: host dispatch of selected offline checks | Tests belong to the candidate and exclude React builds, HTTP/WebSocket and browser journeys. They are not independent protected source-release validation |
| World Lab | `server/world-lab.js`, `scripts/micro-world-lab.js`: fresh current-source world and actual browser baseline captures | The report read by a later attempt is not bound to its changed artifact. Baseline presence is not sufficient proof of relevant outcome measurement |
| Disposable VM | `server/sandbox-package.js`, `scripts/sandbox-review.mjs`: offline restricted-input package | Preparation is not execution verification. It reviews the legacy page, without building/testing the React Studio; evidence ingestion into the developer lane is unfinished |
| Publication | `server/visual-releases.js`, `candidate-evaluator.js`: typed art validation, stale-baseline rejection, immutable artifacts and rollback | Only art data publishes. No general source installer or protected production runtime. Structural readability does not prove artistic improvement |
| Promotion | `server/promotion-broker.js`: staging eligibility only | Default readiness is closed. Supplied runtime flags are not integrated attestation, and no production source installer exists. Its unprobed runtime-availability message was corrected here |
| Operations | Health endpoint, backup script, migration tests, cancellation and visual rollback | Health establishes database liveness, not whole-game readiness. Supervision, scheduled restore verification, service recovery and deployment drills are not integrated |

## Implemented corrections

1. Include React `ui/` source in isolated planning/implementation snapshots, excluding generated `out/`, `.next/` and TypeScript caches. UI edits must declare presentation impact. This adds source visibility and editing, not missing build dependencies or browser verification.
2. Record protected-boundary rejection as `candidate_blocked`, with honest progress and outcome wording. Previously it fell through to `candidate_validated`. Process completion remains separate from candidate approval; source stays unreleased.
3. Include the whole studio capability map and evidence-window totals/truncation in autonomous task dossiers, so selection can address infrastructure rather than infer readiness from a plan or green candidate tests.
4. Report staging as unverified instead of asserting that runtime products are unavailable without probing them. No deployment authority was granted.

## Ordered next work

1. Diagnose retained account attempts using sanitized phase/process evidence. Keep old receipts terminal and distinguish provider, planning-contract and process failures. Respect existing owner activation policy for any fresh attempt.
2. Integrate a verified disposable runtime with pinned UI dependencies, protected live-service boundaries, resource limits, candidate browser journeys and persistence/reconnect checks. Keep the trusted-current-source Lab as the baseline.
3. Bind checks, captures, source/content/dependency manifests and recovery evidence to exactly the reviewed artifact. Run independent protected checks; reject stale, missing or mismatched evidence.
4. Implement source deployment in a separate protected runtime with consistent pre-migration backups, versioned migration recovery, observation and rollback preserving acknowledged history. Prove deliberately failed deployments before automatic promotion.
5. Add the originally requested offline adaptive quests: scoped world evidence, exact references, uncertainty, proposed NPC motives, causal prerequisites, alternatives/refusal, bounded effects/rewards, commit-time validation and idempotent receipts. Verify different histories, privacy/contradiction attacks, duplicates and restart before inference.
6. Extend selection and outcome memory into durable goals and measured improvements across gameplay, narrative, art, accessibility and operations. Quiet observation is a legitimate result; activity is not delivery.

The adaptive-quest prototype was not implemented in this audit turn after the owner broadened the immediate priority to the entire infrastructure. World Intelligence inference and general source publication remain unimplemented. These local corrections are not a successful autonomous release.

## Verification

Retained evidence: `outputs/infrastructure-audit/` contains UI build, trusted top-level test output, contract validation, read-only aggregate runtime JSON, promotion regression output and disposable browser-Lab output. The full suite passed 80/80 tests. The browser Lab completed The First Echo, defeat recovery and reconnect with retained quest progress, and captured the actual scene at `outputs/world-lab/micro/micro-world.png`. Contract validation passed. The staging-message correction was then checked with its two focused tests.

The `npm test` script is UI build followed by `scripts/test.js`. npm was unavailable, so the same commands ran directly under installed Node 24.19.0. The package declares Node 22.18–22.x; this does not establish Node 22 or actual MXC/VM compatibility. Mock developer checks make no model calls and do not execute historical saved candidates on the host. An initial UI-copy check failed because generated output was included; that run was stopped, the exclusion fixed, and the full suite rerun successfully.
