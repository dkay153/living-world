# Autonomous change control

The autonomous developer owns ordinary improvement decisions. It does not need a human task for safe, evidence-backed work inside the constitution. Its objective is durable progress: every change must preserve the player contract, server authority, recoverability and the game’s protected identity.

## 1. Classify before acting

| Class | Examples | Agent action | Live effect |
| --- | --- | --- | --- |
| A — candidate-only | source refactor, new mechanic proposal, content system, Godot/client work | plan, implement, test, retain proposal | none |
| B — reversible live data | validated `art.json`, copy changes, noncritical display tuning | test, publish immutable version, re-run Lab | no restart |
| C — hot configuration | an existing validated feature flag or numeric balancing value with a defined range | validate range, log change, observe metrics, retain rollback value | no restart |
| D — restart-required | server code, dependency lockfile, renderer boot code, WebSocket protocol-compatible behavior | build candidate, stage, back up, restart one local instance, smoke test, rollback on failure | brief restart |
| E — migration or protocol change | database schema, persistence format, save conversion, incompatible client/server protocol | backup, migration rehearsal, recovery drill, compatibility check, scheduled maintenance | planned downtime |
| F — protected/external authority | constitution, owner authentication, credentials, payment, budget, data export, destructive deletion | prepare evidence and proposal only | owner decision required |

If classification is uncertain, use the more conservative class. The developer must never relabel a class only to bypass a control.

## 2. Required record

Every candidate begins with `change-plan.json`, `state-impact.json` and `evolution-review.json`, then ends with a result record. The plan names the affected code and interfaces, invariants, removals, validation and rollback. The evolution review names the baseline, primary variable, guardrails, no-change case, observation window and stop signals. The result names what actually changed, checks run, observation window and remaining uncertainty. See [evolution governance](EVOLUTION_GOVERNANCE.md).

The agent checks the complete dependency path, not only files it edits: caller → server contract → persistence → client controls → browser rendering → tests → operator documentation. Replacement code is incomplete while obsolete callers, labels, flags, docs or tests remain.

## 3. Safe autonomous improvements

The agent may independently create and test a focused candidate whenever it has a concrete signal: failed check, World Lab capture, performance budget breach, player aggregate, operational error, stale dependency, visual readability issue or recorded proposal. It chooses one hypothesis at a time, avoids cosmetic churn, and records a quiet cycle when evidence does not justify a change.

Validated visual data is the present live-safe publication compartment. It must pass the host validator, create an immutable version and remain reversible. A follow-up World Lab capture checks that the active release actually renders and remains accessible.

## 4. Restart protocol

A restart is required when the active process cannot load a change dynamically: server code, lockfile/runtime dependency, boot configuration or static client delivery. The agent first confirms that the change is class D, then:

1. run the complete relevant test set and World Lab;
2. capture a recoverable state and exact running version;
3. prepare a bounded restart with a health deadline;
4. stop only the identified service instance;
5. start the approved build; verify health, WebSocket journey and admin accessibility;
6. restore the previous version immediately if any smoke check fails;
7. record duration, version, checks and rollback result.

Restarts must not overlap and must not silently discard active operations. The current implementation does not yet grant a candidate authority to restart the live host; it may design and validate the procedure until the protected runtime supplies that authority.

## 5. Scheduled downtime protocol

Downtime is justified only for class E work or a security/availability emergency that cannot be isolated. Before it begins, the agent must create a verified database backup, rehearse the migration against a copy, prove failure rollback, prepare compatibility messaging and set a maintenance window. During maintenance it stops player writes cleanly, applies one versioned migration, runs integrity and journey checks, then reopens only after all gates pass. Failure restores the backup and prior build.

No downtime is used for routine graphics, content, ordinary balancing, candidate code or an unverified convenience change.

## 6. Observation and repair

After every live effect, the agent observes defined signals: errors, latency, player action completion, World Lab comparison, accessibility checks and reversal indicators. It distinguishes a successful deployment from a successful outcome. If the evidence contradicts the hypothesis, it rolls back the reversible release or opens a repair candidate; it does not stack another speculative change on top.

Three uncertain execution failures pause automatic scheduling, but the owner or a future protected repair runtime can explicitly wake a new repair attempt. This prevents invisible repeated provider calls while preserving a clear intervention route.

## 7. Human controls

The owner retains payment, model/provider selection, credential administration, constitution changes, external accounts, production authority, data export and emergency stop. The agent can recommend each action with complete evidence but cannot redefine these boundaries.
