# Replaceable operator and installed tools

The autonomous developer can change `operator/index.js` and `operator/tools/*.js`, test the exact source, install it as the active operator, and continue using the replacement after restart. These are executable installed tools, not retained source proposals. They execute inside a separate Docker container. The game and operator have independent release pointers.

`operator/index.js` exports `decide(evidence, memory)` and returns `{version:1, actions:[], memory:{}}`. One action per cycle keeps host effects auditable. Supported actions are `backup_world`, `recover_world`, `develop` with a task, and `tool` with a simple name and bounded JSON input. A tool exports `run(input)` and may use installed locked dependencies, subprocesses and private scratch storage inside its container. Its bounded JSON output becomes a durable action report. Tools can implement diagnostics, generators, analyzers, build helpers and operational planning without obtaining host credentials.

The fixed kernel supplies current health and due-work flags, validates decisions twice, and dispatches permitted host effects. Development goes through the existing job queue and saved account/model/effort/time settings. Paused execution, provider limits, the failure circuit and the configured autonomy cadence still apply. The operator never selects account settings or connects an inference provider. A failed operator can be repaired by the existing developer loop under those same saved controls.

Tool results feed the next operator observation and the developer evidence dossier as bounded untrusted data. Tools needing specific inputs can declare a name-to-JSON-input map in `operator/tool-tests.json`; staging executes every installed public tool with its declared input (or `{worldReady:true}` by default). A tool cannot use this fixture to change what host actions are authorized.

## Installation and recovery

The exact source first passes the enrolled game lane's confined UI build, candidate tests, independent browser journeys and saved-history checks. The operator gate then launches that same sealed artifact, checks real UID/network/read-only confinement, exercises policy scenarios, and executes its tools. The receipt is bound to the source hash, image, kernel hash and current operator predecessor. Stage success requires confirmed container teardown.

Deployment starts and checks the new container without dispatch authority, persists a replacement intent, confirms that the old operator stopped, and commits the new pointer. Decisions and tools become active only after that commit. Stale receipts, changed artifacts and unsupported capabilities cannot install. Fault recovery starts the predecessor against the latest durable operator memory. It never rewinds a world database. Interrupted replacement recovers the durable predecessor; interrupted actions are retained as uncertain and are not automatically replayed. Repeated decision failures stop dispatch until a verified replacement is installed.

The kernel owns `server/host-operator.js`, `operator-kernel/`, account access, history protection and the promotion validator. It never imports candidate modules on the host. Docker receives read-only sealed source, read-only controller files and an empty read-only seed directory; no player database, owner account home, Docker socket, host write mount or external network is exposed. Runtime removal is positively confirmed by Docker before teardown succeeds.

## Real enrollment

With Docker running and the source lane already accepted:

```powershell
$env:DATA_DIR = Join-Path $PWD 'outputs/site-preview/data'
node scripts/operator-runtime.js enroll
```

This trusted command performs a disposable real deployment/fault/rollback/restart drill before enrolling or installing anything in the selected local preview. It changes no model or budget settings and makes no model call. Evidence is retained under `outputs/operator-verification/`. Restart the trusted owner service after first installation; normal subsequent operator releases run through the existing autonomous candidate pipeline without manual installation.

## Scope

Renderer and gameplay source use the realm lane. Installed operational policy and executable tools use this operator lane. External access and resource ceilings remain owner-controlled. Arbitrary Windows administrator commands, host package installation, credential changes, replacement of the independent kernel, pinned dependency-image changes and schema-changing migrations are not granted by a tool's JSON output. Those require an explicit kernel capability with its own verification; a candidate cannot turn an arbitrary script into host authority. The fixed local launcher remains the trusted bootstrap.


17 October extension: see [DEVELOPMENT_TOOLS.md](DEVELOPMENT_TOOLS.md#full-development-runtime-17-october) for the native Codex App Server execution adapter, immutable production dependency/image lane, typed Docker/realm repair, owned-service supervision and bounded fresh automatic recovery. This supersedes earlier statements that all dependency releases or recovery necessarily require a manual owner continuation. Schema-breaking migrations, independent kernel/account authority and arbitrary administrator installation remain outside these capabilities. Verification is retained under outputs/full-dev; do not treat a unit test or development-tool result as a publication receipt.
