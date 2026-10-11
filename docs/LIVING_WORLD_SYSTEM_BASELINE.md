# Living World system baseline

**Status — research baseline, 11 October 2026.** This is the shared system model for a persistent, AI-evolved, top-down RPG. It does not claim that every state below exists in the current prototype. It names the full contract that future game, client, Realm, content, AI-studio and operations work must extend safely.

The game is not a collection of sprites, text, statistics or prompts. It is a connected set of durable state machines. A health bar, for example, is the player-facing projection of an authoritative vitality state; an encounter command is an intent into a turn state machine; an AI-made art update is a versioned asset release with a proof that it remains readable in that state. Treating each in isolation is how a project becomes visually attractive but mechanically unreliable, or mechanically valid but not a game.

The protected identity comes from [CONSTITUTION.md](CONSTITUTION.md). This document makes its ordinary implementation surfaces explicit. It may evolve through the ordinary AI development process, but no proposal may weaken the constitutional fixtures or owner-controlled external authority.

## 1. What exists today, and what does not

The current browser prototype has a small authoritative Realm and local SQLite state. It already has server-validated tile movement, a shared map, vitality, deterministic creatures, command-driven turns, recoverable defeat, gathering, a three-state quest, item-instance provenance, discoveries, append-only gameplay events, NPC observations, a private journal, durable maintenance jobs and a narrow isolated developer-candidate pathway.

The following are **not** yet implemented and must never be implied by this document: accounts, parties, equipment, buffs/debuffs, cooldowns, abilities, a real content registry, procedural world simulation, AI world inference, generated quests/classes/items, semantic NPC memory, general source promotion, a content-release broker, a full Godot client, production deployment, payments, moderation operations, or a complete self-operating studio.

The baseline has two purposes:

1. make every new feature declare exactly which states it reads, writes and presents; and
2. give the autonomous developer a complete impact map before it edits code.

## 2. State rules that apply everywhere

Every persistent state record must have a stable ID, schema/version, owner or authority, visibility classification, creation source, update time, compatibility policy and deletion/retirement policy. Every state transition must have an actor, accepted intent or scheduler cause, preconditions, authoritative result, durable receipt, side effects, player-visible feedback, rollback/recovery behaviour and tests.

| Rule | Meaning |
| --- | --- |
| Realm authority | Client, model, asset metadata and player text are requests or data. The Realm validates and commits game facts. |
| One transition, one receipt | A logical player action has an idempotency key/action ID and records its before/after effects atomically. |
| Canonical facts separate beliefs | The server's fact, an NPC belief, a player discovery, a rumour and an AI hypothesis are distinct state kinds. |
| Definitions separate instances | A sword definition is a versioned content record. A particular earned sword is an immutable item instance with provenance. |
| Presentation never decides truth | A bar, animation, shader, tooltip, particle or client prediction may portray a state but cannot establish it. |
| Unknown stays unknown | Missing legacy origin, uncertain diagnosis and absent data are represented explicitly; no fabricated explanation. |
| Additive before destructive | New fields and readers precede backfills; readers must tolerate a compatible old state until migration is proven. |
| Every path is real | Refusal, malformed input, duplicate request, disconnect, reconnect, defeat, crash, migration failure, stale client and rollback are first-class paths. |

### State ownership and visibility

| Class | Examples | Write authority | Visibility |
| --- | --- | --- | --- |
| Protected policy | constitution version, provider access, money ceiling, release band | owner control plane | owner/audit only |
| Canonical world | terrain, spawn, item instance, combat outcome, quest consequence | Realm transaction | filtered public/player views |
| Personal canonical | identity evidence, inventory, journal, private quest branch | Realm transaction | owning player plus permitted services |
| Observed knowledge | NPC belief, player discovery, rumour confidence | Realm transaction | observer-scoped |
| Content definition | creature/skill/quest/map/asset revision | signed content registry | public only after release |
| Ephemeral session | connection, input buffer, camera interpolation, modal focus | client or connection service | session only |
| Studio work | proposal, plan, sandbox run, evidence, release candidate | isolated studio/control plane | Lab/audit only |
| Operational | health, backup receipt, alert, deployment, incident | operator control plane | Lab/audit only |

## 3. The player: complete playable state

The player is one durable identity with a current body, history and agency. A future account may authenticate it, but authentication must not replace the persistent character identity or its history.

### 3.1 Identity and lifecycle

| State group | Required fields and states | Transition examples |
| --- | --- | --- |
| Identity | `playerId`, display identity, creation version/time, account link when available, privacy/consent choices | guest created; account linked; account recovery; deactivated; restored |
| Presence | `offline`, `connecting`, `synchronizing`, `online`, `reconnecting`, `replaced-session`, `suspended` | one active session per identity; a replacement session receives a reason; disconnect preserves durable world state |
| Location | region/instance ID, tile or precise coordinate, facing, traversal mode, last safe location, spawn/return anchor | validated move; map transition; teleport only through explicit Realm rule; defeat recovery; reconnect restoration |
| Mobility | `free`, `interacting`, `encounter_locked`, `dialogue_locked`, `cutscene_locked`, `loading`, `downed`, `spectating`, `admin_blocked` | locks have source and expiry/release rule; an abandoned lock cannot strand a player |
| Discovery | discovered landmarks, routes, entities, map knowledge, lore knowledge, journal entries | discover; correct/revoke belief; migrate region; preserve history after content retirement |

The current prototype contains guest identity, one-session replacement, grid location and basic discovery. It does not yet contain accounts, facing, instances, consent settings, map transitions or most mobility states.

### 3.2 Body, vitality and health bars

Vitality is a server-owned bounded quantity. A bar is not merely red/green art; it must accurately represent an accessible, current, authoritative value.

| Authoritative body field | Meaning | Invariants |
| --- | --- | --- |
| `hp` | current vitality | integer/defined precision, always `0 <= hp <= maxHp` |
| `maxHp` | current maximum vitality | positive; changes have source/version and define clamp behaviour |
| `shield` / temporary vitality | optional absorb layer | never silently persists beyond its stated expiry; damage ordering is defined |
| `statusEffects[]` | typed conditions such as poison, guard, stun, regeneration | each has source, magnitude, start/end/turn rule, stacking rule, dispel rule and presentation token |
| `stamina` / action resource | optional exploration or skill resource | never required for basic escape from a broken scene; regeneration/time authority is defined |
| `lifeState` | `healthy`, `injured`, `downed`, `defeated`, `recovering`, `protected` | legal transitions only; a defeated player cannot issue combat results |
| recovery anchor | named safe spawn/respawn location and recovery rule | must remain reachable across map/content migration |

**Health-bar contract.** The visual UI receives `{current, maximum, temporary, state, lastChange, source}` from the Realm snapshot. It shows a labelled meter with numeric text or a user-selectable equivalent, clear low-vitality treatment that does not depend on colour alone, optional change animation, and reduced-motion behaviour. Damage/healing feedback is tied to a receipt; an unacknowledged predicted value is visually distinct from the confirmed value. A browser meter exposes its minimum, maximum and current value plus meaningful text; W3C distinguishes a bounded value meter from task progress and requires an accessible value representation. [W3C meter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/)

Health states to test: full; one point below full; threshold crossing; zero; overkill clamp; heal at full; heal from zero only when the recovery rule permits it; temporary shield; status icon overflow; effect expiry while disconnected; max-health migration; stale message; a screen reader value update; and narrow/mobile layouts. Current vitality in the prototype is `hp`/`maxHp` with rest/heal/defeat recovery; shield, statuses, bar semantics and prediction state are future work.

### 3.3 Progression and behavior-led identity

Identity is evidence, not a menu class selection. The system needs the following separate records:

| Record | Purpose |
| --- | --- |
| Behaviour evidence | source action/event IDs, context, repetition, counter-evidence, time window and confidence; never a free-form model claim |
| Recognition candidate | proposed interpretation, evidence set, alternatives, player impact, duplicate key, expiry and abstention reason |
| Recognition decision | accepted/rejected/deferred/withdrawn, ruleset version, rationale, effect receipt and reversal/migration policy |
| Capability/lineage | a named ability or path definition, acquisition rule, teacher/origin, revisions and compatibility states |
| Player choice | consent, refusal, delay, respec/migration choice and explanation receipt where identity impact is major |

No behaviour counter automatically becomes a class. The future World Intelligence can propose and evaluate a Recognition only through typed effects and player-agency rules. The current deterministic landmark discovery is not Recognition.

### 3.4 Inventory, equipment and unique history

| State | Minimum future model | Critical rules |
| --- | --- | --- |
| Item definition | stable kind ID, revision, presentation, behaviour/effect vocabulary, stack rule, scarcity/category | definition edits are versioned and compatible with surviving instances |
| Item instance | immutable UUID, definition revision, owner/container, source event, origin class, acquired time, state/durability/custom properties | no client grant; instance provenance is never rewritten |
| Container | character inventory, equipment slot, bank, trade escrow, world container, destroyed/archived | capacity, access, lock and transaction semantics are explicit |
| Ownership | owner identity, restrictions, bind/trade rules, transfer history | transfers use atomic compare-and-update / version checks, never a read-modify-write race |
| Consumable state | available, reserved, consumed, destroyed, expired | consumption receipt references the exact instance(s) |
| Equipment | slot, loadout revision, compatibility, visual binding, stat/effect projection | equipping validates slots, required state and conflict effects; unequip has a safe fallback |

The prototype already stores individual dewleaf, shard and blade instances, source events and consumption events. Equipment, trading, containers, stateful items and concurrency controls remain future work. The future inventory service needs optimistic concurrency or equivalent transactional protection when multiple requests can touch an item; version tags/ETags are a proven read-modify-write conflict guard in game-economy APIs. [PlayFab concurrency guidance](https://learn.microsoft.com/en-us/xbox/playfab/economy-monetization/economy-v2/tutorials/etags-and-concurrency-control)

### 3.5 Quest, dialogue, journal and player agency

Each quest is a named versioned state machine, never a single text paragraph. Required lifecycle states are `unavailable`, `offered`, `accepted`, `active`, `paused`, `blocked_with_explanation`, `ready_to_resolve`, `resolved_success`, `resolved_alternate`, `declined`, `expired`, `failed_recoverable`, `retired_compatible` and `migrating`.

Every quest branch defines prerequisites, start/advance/resolve events, refusal path, delay/expiry policy, failure/recovery path, concurrent-player implications, world/NPC consequence, reward transaction, journal entry, localization/presentation, replay fixture and retirement/migration rule. Dialogue has `not_loaded`, `available`, `presenting`, `awaiting_choice`, `resolved`, `interrupted`, `resumed`, `unavailable_fallback`; it displays only facts and beliefs the speaker is allowed to know.

The current First Echo is a real but minimal `unstarted → active → complete` path. It needs refusal, migration, explicit alternate resolution, failure/reconnect fixtures and versioned content before it can be the pattern for autonomous narrative.

## 4. Encounters, combat and the classic command loop

The protected promise is a distinct command-driven encounter, readable in the tradition of classic handheld RPGs and early Final Fantasy while remaining original. The encounter system is a separate bounded state machine attached to the world; it is not an action overlay where the client selects results.

### 4.1 Encounter lifecycle

`absent → trigger_pending → opening → command_select → intent_submitted → validating → resolving → presenting_result → next_turn | victory | retreat | defeat | cancelled_recovery → archived`

| State | Realm responsibility | Player presentation |
| --- | --- | --- |
| trigger pending/opening | select legal opponent/participants and freeze correct world reference | clear opponent, reason for encounter and input transition |
| command select | compute legal commands, target choices, resources, cooldowns and time policy | menu focus, keyboard/touch/controller support, action descriptions and visible costs |
| intent submitted/validating | deduplicate and validate actor, encounter version, turn owner, command, target, resource and rate | pending confirmation; no false result shown as final |
| resolving | execute ordered effects in a transaction, record RNG seed/receipt when applicable | readable ordered log, damage/heal/status/counter feedback |
| presenting result | publish confirmed snapshot and wait for allowed continuation | animation/audio may run, skip/reduce motion available |
| terminal | atomically award/consume/restore/despawn/respawn/return and release movement lock | victory, retreat or defeat explanation and next-world location |

### 4.2 Required combat state

Each encounter records `encounterId`, ruleset/content versions, map source, participant IDs, participant snapshots/references, phase, turn/round, active actor, legal intents, intent IDs, command targets, ordered effects, deterministic/randomness receipt, timeout/deadline, combat log, result and cleanup receipt. A combatant projects vitality, temporary vitality, resources, stats, status effects, cooldowns, action locks, equipment effects, targeting state and presentation references.

Core command categories begin with Attack, Guard, Skill, Item and Retreat. Every command states availability, target rule, cost, priority/timing, effect list, miss/critical/variance policy, counterplay, status interaction, error message and test cases. Guard must provide a meaningful defensive/alternative decision; Retreat has a legal chance/cost/explanation; Item consumption is an atomic inventory operation; commands cannot duplicate on retry. The current prototype has Attack, Guard, Heal and Retreat and basic turn resolution, but no general skill model, party model, combat versioning, targeting or authoritative timeouts.

Test each command across valid, invalid, duplicate, stale-turn, stale-encounter, disconnected, reconnect, victory, retreat, defeat, zero resource, full health, invalid target, content-revision and database rollback paths.

## 5. The shared physical world

### 5.1 Map, terrain and traversal

World geography is a versioned spatial graph, not only an image. Regions contain map revision, coordinate system, tiles/cells, collision/traversal rule, portals, points of interest, safe anchors, encounter zones, resource nodes, ambient conditions, navigation representation and content/asset references.

Cells may be `void`, `blocked`, `walkable`, `water`, `bridge`, `hazard`, `door`, `event`, `reserved`, `temporarily_changed` or future typed terrain. Each has collision, movement cost/mode, interaction, rendering layer and accessibility description. Traversal evaluates region/revision, current body/mobility state, bounds, collision, portal condition, rate limit and potential trigger in one authoritative move transition. It records source/destination and either an accepted receipt or a reasoned refusal.

Every map must test boundary, every impassable cell, every one-way/portal path, every safe spawn, a player entering during a content migration, return from encounter, return from defeat, two simultaneous players, reconnect, camera clamp, keyboard/touch/controller route, and a route with colour/motion alternatives. Simple collision data must remain separate from elaborate visual geometry; Godot's navigation guidance makes the same performance case for simple collision/navigation source shapes. [Godot navigation performance](https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_optimizing_performance.html)

### 5.2 World entities

| Entity | Lifecycle states | Canonical state |
| --- | --- | --- |
| Creature | seeded, alive, engaged, defeated, respawning, despawned, migrated, retired | type/version, location/spawn rule, vitality, AI/encounter profile, respawn timestamp, provenance |
| NPC | absent, present, busy, travelling, unavailable, retired/migrated | identity/version, location, canonical commitments, belief records, dialogue/quest availability, presentation |
| Resource | available, reserved, harvested, regrowing, depleted, transformed, retired | node ID/type, yield rule, state timer, ownership/visibility, source content revision |
| Landmark | hidden, discovered-by-player, altered, inaccessible, restored, retired | stable landmark ID, location/revision, interaction result, canonical history link |
| Container | sealed, accessible, reserved, emptied, replenishing, destroyed | contents transaction version, access/lock state, reset rule |
| Environmental event | inactive, scheduled, active, resolving, resolved, reverted, archived | scope, causal event, start/end, effects, content version, player notice policy |

Population/ecology is future work. When introduced, it must have aggregate state (population, habitat, resource pressure, migration, spawn budget, intervention history) and cannot simulate an individual creature indefinitely without an explicit gameplay reason.

### 5.3 Canonical history and knowledge

The event ledger is append-only for ordinary game transitions. An event has a schema version, event ID, causal action ID, subject(s), actor, time, world location/revision, typed payload, content/ruleset versions and link to before/after state when the action changes state. Snapshots accelerate reads; they do not replace the evidence trail.

Knowledge records state the observer, subject, predicate, value, evidence, confidence, freshness, visibility and correction/retraction history. They prevent Mara knowing a battle she did not observe, prevent a player from seeing another player’s journal, and permit future misinformation/rumours without corrupting canonical facts. An event-sourced record is valuable because it explains not only the current world but how it reached that state; it must be paired with snapshots, retention and privacy policy rather than used as an excuse to retain everything forever. [Fowler on event sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)

## 6. Player presentation, interface and accessibility states

The client owns responsiveness and presentation state, but maps every meaningful visible state to an authoritative snapshot, an explicit pending request or an accessible fallback.

| UI surface | Required visible states |
| --- | --- |
| World view | loading, initial sync, live, reconnecting, stale, offline-safe explanation, map transition, performance fallback, unsupported-client block |
| HUD | confirmed/pending vitality, resource states, status summary, location/goal context, notification queue, focus mode, compact/mobile layout |
| Encounter view | opening, command focus, target focus, command pending, resolving, result, victory/retreat/defeat, reconnect/recovery, reduced-motion mode |
| Dialogue | speaker/portrait state, text reveal/instant text, choice focus, unavailable choice reason, pause/resume, history/journal link |
| Inventory | loading, empty, populated, selected, reserved/pending, operation accepted/rejected, stale revision/reload, filtered/sorted, accessible list fallback |
| Map/journal | unknown/known distinction, objective state, historic record, player-only data, content migration notice |
| Settings | input modality/remapping, audio groups, text scale, contrast/theme, reduced motion/flash, screen-reader text, privacy/consent, reset defaults |
| Errors | malformed action, rejected action with reason, lost connection, restart maintenance, incompatible client, recoverable crash, safe support/export route |

Each dynamic browser status message uses an appropriate accessible status/live region without stealing focus. A live region is appropriate for advisory updates; critical time-sensitive failures use a distinct alert path. [W3C ARIA status guidance](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA25)

Visual quality is also stateful: palette/theme revision, sprite/animation frame, directional/facing state, lighting quality tier, VFX intensity, UI scale, contrast mode, reduced-motion setting, platform capability and asset-load fallback. For a 2D client, each asset declares pixel scale, dimensions, layers, alpha/palette, animation clips, collision/link anchors, import revision, memory/download budget, fallback and provenance. Lighting has a quality tier and a readability test; real-time 2D light can improve depth, while additive sprite effects may be the fast tier for short-lived effects. [Godot 2D lights](https://docs.godotengine.org/en/stable/tutorials/2d/2d_lights_and_shadows.html)

## 7. Network, persistence, migration and recovery

### 7.1 Connection and protocol state

Client connection state is `new → authenticating/guest-creating → connected → synchronizing → ready → reconnecting → incompatible → closing → closed`. Each message has protocol version, type, correlation/action ID, payload schema, visibility scope and idempotency/retry rule. Client messages carry **intent** (for example `move:right` or `command:guard`), never authoritative position, item grant, random result or final combat state. Server snapshots/deltas carry a sequence/version so stale data is rejected or resynced.

Godot’s multiplayer guidance is clear that high-level networking does not make gameplay secure by itself: validate input/RPC arguments, rate-limit frequent actions and let the server decide gameplay-critical state. [Godot secure multiplayer design](https://docs.godotengine.org/en/latest/tutorials/networking/high_level_multiplayer.html)

### 7.2 Database state and migrations

Persistent schemas need a migration registry: ID, checksum, predecessor version, forward operation, verification, compatible read window, backfill/checkpoint, rollback/restore approach, data owner and completed receipt. Before a live migration: create a consistent backup, test the migration on a copy, run invariant and query checks, perform a restoration drill, then execute a transaction or a resumable staged migration. A migration that cannot safely reverse must have a tested restore route and scheduled maintenance/compatibility plan.

Minimum stores are: identity/session, characters, world regions/entity state, gameplay state, item instances/transactions, events/snapshots, knowledge, content definitions/revisions, asset manifests, jobs/leases, studio proposals/evidence, release records, audit records, owner policy and backup/restore receipts. SQLite is correct for the initial single Realm but all access must pass an adapter/transaction boundary; expanding to multi-writer hosted infrastructure requires a deliberately tested persistence topology, not copying a live database file.

### 7.3 Backups, restore and failures

| Failure state | Required response |
| --- | --- |
| action transaction fails | no partial movement/item/world/event mutation; client gets a recoverable result; error is recorded |
| process dies mid-job | lease expires; a new worker can reclaim; old claimant cannot complete it |
| process dies mid-release | release is `interrupted`, artifact and evidence retained, live target returns to last known-good state |
| database corruption/unavailable | stop writes, choose tested backup/restore or read-only maintenance state, verify integrity and publish recovery receipt |
| stale client/protocol | reject unsupported mutation, offer compatible update or maintenance explanation, preserve character history |
| content removed | migrate references or retain archived definition/presentation, never turn a historic item/quest into an unresolvable null |
| model/provider unavailable | deterministic game remains playable; studio/world job pauses with a durable reason; no invented result |

## 8. Content, art and narrative production state

AI autonomy needs real content packages, not arbitrary code/text/image blobs. A package has package ID, semantic version, dependency range, stable IDs, manifest, source/provenance and license record, validation report, presentation captures, ruleset/data migration, release status and retirement strategy.

| Package type | Required contents |
| --- | --- |
| Map/place | topology/collision, route contract, anchors, entity placements, encounter/resource zones, art/audio references, reachability suite |
| Creature | visual/animation/audio, encounter profile, stats/effects, behaviour constraints, spawn rules, drops, accessibility text |
| Quest/narrative | fact dependencies, belief permissions, complete state graph, dialogue branches, journal, consequence/effect set, contradiction/refusal/reconnect suite |
| Ability/item | definition/effects, costs/targets/limits, visual/audio feedback, instances/migration, balance fixture, accessibility description |
| Art bundle | source/derivative/provenance, technical metadata, sprite/tile/animation manifest, palette/style-bible reference, performance and scene captures |
| Audio bundle | source/provenance, loop/mix metadata, trigger states, volume group, captions/alternative feedback, device fallback |

Art style can change, but it is an evidence-backed migration of a coherent art bible: colour/palette, scale, silhouette, tile language, UI language, animation timing, lighting, shader/effect vocabulary, typography, sound direction and quality tiers. It compares named scenes before/after, checks visual identity and overlap/collision anchors, preserves prior bundles for rollback and records why the change serves the player promise. Visual screenshot comparisons are useful regression evidence when run in a pinned environment, but are not the sole creative judgment; browser/host differences otherwise change the image baseline. [Playwright visual-comparison guidance](https://playwright.dev/docs/test-snapshots)

## 9. Autonomous studio state machines

### 9.1 A change is a controlled object

Every autonomous improvement is a durable candidate with this state graph:

`observed → triaged → research_ready → hypothesis_ready → plan_ready → sandbox_prepared → implementing → locally_validated → independently_evaluated → release_ready → staged → observing → promoted | rolled_back | rejected | blocked | archived`

It carries the goal, player promise, category, affected state groups/files/contracts, constitutional assessment, risk/blast radius, alternatives, predicted outcome, success/failure metrics, pre-change baseline, exact workspace/artifact, plan, migration/release/rollback plan, evidence, cost/time reservation, outcome, lesson and regression fixture.

The present developer loop asks a candidate to create an impact plan and preserves its result; it is not yet a protected two-phase system that proves the plan existed before any edit. The next implementation must separate a read-only planning phase from the edit-capable phase, bind the approved plan hash to the workspace and reject source writes before the plan receipt.

### 9.2 Roles and their legal state

| Role | May create | May not decide alone |
| --- | --- | --- |
| Observer/analyst | measurements, defects, hypotheses, uncertainty records | a diagnosis presented as fact |
| Designer | feature/content contract, alternatives, balance model | arbitrary authoritative effects |
| Developer | isolated patch, tests, migration proposal, repair candidate | production source/data mutation |
| Artist/technical artist | art brief, alternatives, manifest, scene evidence | asset release without provenance/validation |
| Narrative/world director | fact-grounded proposal, typed quest/world effect | canonical fact invented from prose |
| QA/evaluator | reproducible finding, independent evaluation report | changing the candidate or weakening its own gate |
| Release operator | exact staged artifact, canary, rollback/incident action | protected policy/budget/credential expansion |
| Memory curator | evidence summary, lesson, retrieval index | rewriting raw history or declaring causality without evidence |

The roles may use one model sequentially, but their data and permissions remain separated. A developer’s self-review is evidence, never its only release gate. The evaluation harness must validate its own setup as well as the candidate: agent-system quality can fail through tool routing, external state or an invalid evaluator, not only through a poor model response. [OpenAI governing agentic systems](https://cdn.openai.com/papers/practices-for-governing-agentic-ai-systems.pdf)

### 9.3 Learning without pretend self-training

Learning records are `observation`, `hypothesis`, `alternative`, `decision`, `prediction`, `evaluation`, `outcome`, `incident`, `rollback`, `lesson`, `regression_fixture` and `confidence_update`. They retain source, scope, uncertainty, counter-evidence and expiry. They improve task selection, bibles, tests, prompts and tools; they do not claim model-weight training or let a self-written compliment authorise promotion.

Analytics taxonomy starts small and semantic: sessions, progression start/fail/complete, resource source/sink, design events, errors and client performance. Coordinates, timestamps and procedural IDs belong in payload/value fields or sampled traces rather than high-cardinality event names. [GameAnalytics event-taxonomy guidance](https://docs.gameanalytics.com/getting-started/plan-your-sdk-implementation/) New content/mechanic experiments define one primary changed variable, segment, eligibility, baseline, guardrails, duration, decision rule and rollback rule before exposure; this avoids a false conclusion from multiple simultaneous changes. [GameAnalytics A/B guidance](https://docs.gameanalytics.com/products-and-features/segment-iq/ab-testing/overview-and-use-cases/)

## 10. Release, live operations and owner control

### 10.1 Release lifecycle

`draft → built → reproducible → independently_validated → backed_up → staged → canary → observing → promoted | halted | rolling_back → rolled_back → postmortem → archived`

A release record names artifact hashes, code/content/asset/data revisions, target/environment, feature flags, compatibility range, backup receipt, validation results, health thresholds, observation window, rollback artifact and outcome. It cannot be rewritten after promotion; a correction is a later record.

Release type determines its required path:

| Type | Examples | Minimum gate |
| --- | --- | --- |
| Presentation-only | CSS, sprite, animation, audio mix | screenshot/scene/performance/accessibility evidence; exact asset rollback |
| Additive content | new creature/map/quest with no existing mutation | content validation, routes, player-history compatibility, staged exposure |
| Rules/tuning | combat values, effect change, spawn frequency | simulation/replay/intent-player evidence, balance guardrails, reversible flag/old ruleset |
| Schema/state | data migration, persistent item/quest change | backup, migration copy test, restore drill, compatible reader, failure recovery |
| Runtime/protocol | server/client/network/dependency change | integration/load/security/reconnect/rollback evidence, controlled restart |
| Protected/external | provider, spend, payment, constitution, hosting authority | owner control plane only |

Feature flags are temporary, named, owned, scoped and expiry-dated; they are not a permanent untracked alternate codebase. A deployment pipeline should progress from fast checks to slower confidence tests and leave a traceable artifact trail. [Fowler on deployment pipelines](https://martinfowler.com/bliki/DeploymentPipeline.html)

### 10.2 Service/runtime states

The local sandbox and future hosted service expose `booting`, `healthy`, `degraded`, `draining`, `maintenance_scheduled`, `maintenance_active`, `recovering`, `rolling_back`, `read_only_protection`, `failed` and `retired`. Health is layered: process, database, migration/version, WebSocket journey, game action journey, job lease health, backup freshness, latency/error, client performance and player-experience signals.

An agent may restart only through a declared runbook that says why a restart is necessary, drain behaviour, expected downtime, health deadline, rollback action and player communication. Data migrations and incompatible protocol changes need a planned maintenance window or compatible rolling path. A cosmetic content update that does not affect runtime state usually should not restart the Realm. Three unknown failed repair/release attempts pause automatic retry and surface a durable incident.

The owner keeps policy, provider/model choice, spending/payment, credentials, external accounts/hosting signing authority, data export, constitution revisions and emergency stop. The Lab shows evidence, not an unrestricted production shell or raw SQL console.

## 11. Definition of done for any future feature

No feature is done until its contract includes all applicable answers below:

1. Which player promise and protected-loop role does it serve?
2. Which state groups/fields does it read, write, derive, display, retain and retire?
3. Who has authority, who can see it and what is the data classification?
4. What are every legal lifecycle state, transition precondition, rejection and recovery path?
5. What is the exact client intent, server response, version/retry/reconnect behaviour?
6. What persists, how does it migrate, and how does an old character/content revision remain meaningful?
7. What art/audio/UI/accessibility/presentation states make it readable, including the healthbar/status/focus/mobile cases it affects?
8. What malformed, duplicate, concurrent, stale, disconnect, defeat, restore and rollback paths are tested?
9. What metrics/evidence distinguish success, no effect, regression and harmful optimisation?
10. What package/release/rollback/retirement path returns the world to safety?

This is deliberately exhaustive as a vocabulary, while remaining extensible. A new state is allowed only by registering its owner, schema, transitions, visibility, presentation, tests, migration and retirement story. That is how the AI can improve mechanics, visuals, world content and infrastructure freely without losing track of the health bar, player history, quest branch, item provenance, old client or backup that the change also touched.

## 12. Build order from this baseline

1. Convert the current micro World Lab into a state-coverage harness: exhaustive movement/collision, vitality, encounter, gathering, quest, defeat/reconnect and persisted-history routes, plus fixed visual/accessibility assertions.
2. Implement a schema/content registry and feature-contract format before adding broad mechanics. Start with typed status effects, item definitions/instances and encounter ruleset versions.
3. Build a protected two-phase autonomous change flow: read-only impact plan, isolated edit workspace, independent evaluation and an immutable evidence record.
4. Add a client protocol contract and a Godot/browser parity fixture before changing renderers or adding a downloadable client.
5. Add content/asset manifests and a versioned art bible; prove one end-to-end vertical slice with scene, gameplay, accessibility, persistence and rollback evidence.
6. Only then enable a shadow World Intelligence to create proposals against typed effects. It earns world mutation authority one bounded capability at a time through repeated evidence.
7. Build staged deployment, backup/restore and operator runbooks before hosting public players; accounts, HTTPS, capacity, abuse controls and observability are launch gates.

The next autonomous work item is therefore not “make more random content.” It is to turn this baseline into machine-readable contracts and fixtures around the already-playable micro world, then use those contracts to prove a single high-quality, recoverable vertical slice.
