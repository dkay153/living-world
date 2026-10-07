# Living World — baseline and delivery plan

## The promise
A persistent 2D top-down browser RPG where players begin ordinary. Their actions accumulate history; the World Intelligence interprets that history and can establish new classes, skills, artifacts, quests, factions and opportunities. The setting and art must be original. Classic handheld RPGs inform spatial readability, not copied content.

History → meaning → Recognition → possibilities → behavior → history.

The long-term destination is a fully AI-developed and AI-operated world. The intelligence owns the ongoing development backlog, creative direction, implementation, validation, releases and daily operation. Human review during bootstrap is a training and validation stage, not the permanent operating model. Humans set the initial constitution, resource budgets and access boundaries; routine work eventually runs independently within those boundaries.

## Design boundaries
The protected identity and freely replaceable implementation choices are defined in [CONSTITUTION.md](CONSTITUTION.md). Battle direction is now distinct, command-driven turn-based encounters inspired by classic handheld RPGs and early Final Fantasy.
- Explore a physical world; movement, interaction and combat must be enjoyable before AI complexity grows.
- Start with one settlement, nearby wilderness, inhabitants, creatures and a few mysteries.
- Identity emerges from behavior. No mandatory class selection; no published exhaustive evolution tree.
- Rarity can be historical: an artifact exists because an object earned a history.
- Consequences persist. NPC knowledge is incomplete; system facts, NPC beliefs and player rumors are distinct.
- Unique powers create choices and costs, not permanent numerical supremacy.
- Optimize for agency, discovery, coherent stories and world health. No streak pressure or engagement-maximizing AI objective.
- The world speaks sparingly. Players may fail, refuse a path, or remain ordinary.

## Architecture
Browser canvas client → same-origin HTTP/WebSocket service → authoritative world rules → durable database.

The server owns movement, collision, discovery and future combat/inventory state. Clients request actions; they cannot submit resulting rewards or positions. A versioned world snapshot and incremental messages drive presentation. SQLite is the initial single-instance store; migrations and storage adapters must precede larger schema changes. PostgreSQL and multiple simulation shards are future decisions triggered by measured concurrency, not baseline dependencies.

### World Intelligence loop
Observe recorded events → summarize relevant history → interpret → propose typed world changes → validate → commit atomically → record rationale and provenance → observe consequences.

AI output is untrusted input. It cannot execute arbitrary code, SQL or privileged operations. New content uses a bounded effect vocabulary with costs, limits, conditions and provenance. Unknown effects generate capability requests for the developer loop. Recognition is discretionary, not a guaranteed reward for repeating an action. Persist decisions with evidence and model/prompt versions; suppress duplicates; enforce world budgets and player agency. Players must be able to decline transformations with major identity consequences.

### Developer Intelligence loop
Capability request → isolated branch/workspace → implementation → tests and simulations → migration and rollback review → staged release → observe.

No runtime agent writes directly to the deployed source tree. Bootstrap validates the release pipeline with reviewed examples; the operating target is independent releases that pass automated checks, with resource ceilings, rollback and emergency stop. Humans do not approve each ordinary enhancement. The two loops have separate credentials and permissions.

### Creative and visual evolution
Visual improvement is a continuing responsibility of the Developer Intelligence, not a one-time human art pass. It can improve original tilesets, sprites, character and creature designs, animation, lighting, effects, maps, interface, accessibility, sound and music as the world develops. New entities and capabilities must receive usable presentation, not just descriptions or database entries.

Maintain a versioned art bible: palette, scale, silhouettes, tile conventions, animation timing, UI language and sound direction. The AI can evolve this direction deliberately, while keeping the world coherent and preserving recognizable player identities and historic artifacts. Generated assets must record origin, usage rights, generation settings and versions. Use available asset-generation tools through separate adapters and budgets.

Observe visual shortcomings → prioritize an improvement → create alternatives → implement assets and presentation → capture actual rendered scenes → evaluate readability, style, accessibility and performance → stage a versioned asset release → deploy → observe.

Validate sprite dimensions and animation frames, tile seams, collision alignment, legibility, contrast, reduced-motion behavior and representative desktop/mobile scenes. Compare before/after screenshots and frame performance. Keep previous asset bundles available for rollback; do not change simulation rules accidentally through an art update. Improvements follow evidence and creative needs rather than changing the style constantly for novelty.

### Operator Intelligence loop
Observe service health, errors, latency, concurrency, job queues, world consistency, backups and resource use → diagnose → choose a permitted action → execute → verify recovery → record the incident.

Routine responsibilities include supervised restarts, tested backup/restore procedures, release scheduling, cost control, world-job scheduling, content moderation within a written policy, performance maintenance and capacity planning. The operator can request software or visual improvements and verify their releases. Operational facts and player-submitted text remain untrusted inputs, not instructions that expand its access.

Durable jobs, leases, checkpoints and retry limits let work survive interruption. A provider outage leaves the deterministic game playable, pauses intelligence work and resumes from saved jobs. A failed release rolls back automatically when its health criteria fail. Separate runtime, developer, creative and operator roles can share an orchestrator and memory without sharing unrestricted credentials.

### Path to independent operation
Progress from shadow decisions, to reviewed execution, to automatic low-impact actions, then to autonomous releases and routine operation after repeated successful drills. Version the operating policy, allowed tools, budgets and acceptance gates. Test intentionally failed deployments, interrupted jobs, corrupt proposals and restore scenarios before expanding authority. Unresolved decisions outside the configured policy are escalated; everyday work does not require humans to keep prompting the system.

The end state is one coherent autonomous steward with specialized responsibilities: it plays the role of world director, artist, engineer, tester, release manager and operator. It continuously selects useful work and finishes it, rather than merely answering requests.

### Persistent domain to introduce progressively
Players and sessions; world regions and entities; action/event ledger; item instances and ownership; creature populations; NPC memories and relationships; knowledge claims; content definitions and effect versions; Recognition proposals/decisions; quests and causality; world capabilities and release records.

## Delivery milestones and acceptance gates
1. **Local operational foundation — implemented.** Production start command, shared map, server-controlled tile movement, guest identity, persistent positions/discoveries, chronicle, health endpoint, backup tool. Gate: restart preserves state; separate sessions see each other; malformed actions cannot teleport; duplicate discovery does not duplicate history.
2. **Playable seed — initial slice implemented; playtesting gate remains open.** Improve movement/camera/art; inventory, resources, separate command-driven turn-based encounters, creatures, death/recovery, NPC conversation and a small quest. The owner selected classic handheld / early Final Fantasy-style battle systems. Expand initiative, party and skill systems within that direction. Gate: a satisfying 15-minute exploration/combat loop and reproducible state tests.
3. **History substrate — initial implementation complete.** Versioned action events and before/after evidence, item origins/consumption, bounded NPC observations, fact summaries, private journals and a replay fixture. Durable local jobs update memory automatically. See MEMORY.md. Further history systems and full event replay remain future work.
4. **Bounded World Intelligence — owner controls implemented; inference remains future work.** The Observatory exposes world records, worker controls, proposals, encrypted OpenAI setup, backups and audit. See ADMIN.md. Next: metered provider adapter and durable model jobs; begin with shadow proposals before applying content. Introduce one genuinely generated skill and one personal quest through validated primitives. Gate: simulated abuse, duplicate handling, latency/cost ceilings, declined transformations, audited application and rollback.
5. **Consequences and shared stories.** Ecology, relationships, teaching/lineages and causally connected player quests. Gate: long-running simulation remains coherent; scarcity and asymmetric power retain counterplay.
6. **Server launch.** Account authentication/recovery, HTTPS, authorization, proxy origin configuration, connection limits, per-account abuse controls, backups with restore drills, metrics, alerts and process supervision. Gate: deployment from clean checkout, preserved data on redeploy, load test at declared capacity, tested rollback. Invite-only alpha first.
7. **Developer Intelligence.** Self-selected improvement and capability queue, isolated changes, simulations and reviewable releases. Gate: no direct production mutation, reversible migration, a validated autonomous deployment path and working emergency stop. Reviewable means auditable, not approval-dependent.
8. **Creative evolution.** Versioned art bible, asset generation adapters, visual improvement backlog, screenshot evaluation and reversible asset releases. Gate: the AI independently delivers a measurable visual improvement and the presentation for a new world entity without breaking style, accessibility or frame performance.
9. **Autonomous stewardship.** Durable orchestrator, operator runbooks, automatic prioritization and policy-controlled releases. Gate: a sustained unattended local run completes development and visual work, handles a simulated failure, respects budgets, restores from backup and produces an auditable activity record. Carry the same operating model to the hosted server after its launch gates pass.

## What “production on localhost” means
Run the actual persistent server with the same command and application files intended for the first server. No mock API or disposable browser-only state. Local address binding prevents accidental public exposure. Environment variables control host, port, database location, external origin and secure cookies. Transfer code, dependency lockfile and a consistent database backup; never copy a live SQLite file without its WAL or backup API.

This milestone is locally operational, not yet approved for public production. Guest bearer cookies are suitable for the local sandbox; account authentication, operational hardening, monitoring, and capacity work remain launch gates. Windows Sandbox VM isolation is not configured: this is a project-local application sandbox on the Windows host.

## Current limits and open decisions
The owner dashboard and encrypted OpenAI configuration/catalog check are implemented. No LLM inference, generated classes, autonomous coding, visual improvement agent, operator orchestrator, player account system or final art yet. Autonomous stewardship is the intended destination, not a capability already running. Landmark discovery is deterministic and must not be presented as AI Recognition. As inspected on 7 October 2026, the owner has saved OpenAI model `gpt-5.6-sol` and a $10 daily ceiling; current runtime owner settings remain authoritative. Inference is still disabled and the saved budget does not yet enforce spending. Select asset providers and spend ceilings before connecting creative generation. Select first hosting target and expected player count before public rollout. Keep one server and one SQLite volume initially; do not scale replicas against the same file.

## Researched autonomy architecture

[AUTONOMY.md](AUTONOMY.md) audits the implemented foundation and specifies the remaining memory, learning, orchestration, simulation, developer, visual, release and operating systems. Its build order starts with durable learning records and metered shadow work, then proves complete content, code, art and recovery cycles. It is proposed architecture, not a claim that those capabilities have been implemented.

[DAY_ONE.md](DAY_ONE.md) adds the capability acceptance gates and contracts for evidence coverage, retry-safe mutations, compatible world versions, repeated evaluation, creative diversity and recovery. These remain implementation requirements, not passed checks.

## Technology references
- Node 22 SQLite API: https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html (experimental in this baseline runtime; pin and test upgrades).
- WebSocket library: https://www.npmjs.com/package/ws
