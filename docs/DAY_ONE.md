# Living World day one quality requirements

Current implementation: v0.5.0 has bounded self-selected Codex work, outcome memory and validated visual-data releases. Read [CODEX_DEVELOPER.md](CODEX_DEVELOPER.md) for actual capabilities and remaining limits; the research and acceptance conditions below remain broader than the implemented slice.

The autonomous steward must preserve a playable, coherent world while learning and changing it. Its first independent release needs evidence about correctness, continuity, creative quality, spending and recovery. One successful demonstration is insufficient. The acceptance conditions below strengthen [AUTONOMY.md](AUTONOMY.md); they do not freeze replaceable mechanics or expand owner permissions.

Day one means the first release of each enabled capability. Model interpretation, content application, code execution, asset generation and release promotion have separate readiness gates. A disabled capability can remain honestly unavailable while the game runs. Perfection cannot be established in advance; known failure modes can be constrained and remaining uncertainty made visible.

## What the second investigation changes

The first architecture identified the necessary subsystems. The stricter baseline adds contracts between them, repeated evaluations, evidence coverage, explicit uncertainty, version compatibility, creative diversity and failure containment. These are prerequisites for credible independence, rather than optional polish.

| Finding | Architectural consequence |
| --- | --- |
| Success once differs from reliable repetition | Evaluate repeated outcomes and recovery, not the best attempt |
| Summaries can omit decisive facts | Every evidence packet declares scope, cutoff and completeness |
| Repeated retries can repeat effects | Stable command identity and recorded receipts must precede retryable execution |
| A shared world couples player outcomes | Choose experiments with suitable isolation; ordinary per-player A/B tests are insufficient for global mechanics |
| Repeated evaluation can overfit its own tests | Separate development feedback, regression fixtures and fresh evaluation scenarios |
| Simulated users can distort results | Evaluate simulator fidelity independently of the steward's success |
| Content, code and art evolve together | Release coherent bundles with compatibility and history contracts |
| Better scores can produce repetitive content | Preserve distinct high-quality alternatives and varied play opportunities |
| Long tasks outlive a context window | Persist structured handoffs and verify actual state when resuming |
| Infrastructure faults recur | Let reliability evidence redirect autonomous priorities toward repairs |

## Findings in the current implementation

These observations are from the repository on 7 October 2026. Characterization used an in-memory SQLite database; it did not mutate the live world or call a model.

- `describePlayer` returns the latest 30 events and at most 100 item records. A probe with 105 item instances returned 100 and no completeness field. These bounded views are acceptable for display, but a future interpreter must receive explicit coverage and a way to retrieve missing evidence.
- Two calls to `game.act` carrying the same illustrative client command ID advanced an encounter from turn 1 to 2, then 3. The current protocol does not implement such an ID, so this demonstrates a missing retry contract rather than a violation of an existing promise. Future transport retries need authoritative deduplication.
- Encounters store creature stats, but have no explicit rules/content version. Player strike damage reads current quest state through the running rules. Future engine changes therefore need battle compatibility rather than assuming stored battle data is sufficient.
- Creature respawn can write environment state through `snapshot` without an associated historical event. Full event reconstruction remains unavailable. Experiments must use consistent snapshots and recorded test actions until coverage is extended.
- Jobs have finite leases and retry limits but no lease renewal, long-task cancellation or provider request reconciliation. The game and deterministic worker share one process.
- Constitutional enforcement, metered calls, isolated candidate execution, automatic releases and operator recovery are not implemented. These remain readiness gaps, not capabilities implied by the dashboard.

The existing tests also verify private-journal separation, guest-token protection, persistence, stale-worker rejection and transaction rollback. Retain those protections while adding the missing contracts.

## Separate authority from creativity

Maintain an externally protected control boundary around owner authority, model/tool access, budgets, candidate isolation and release promotion. The developer can replace ordinary game and engineering systems inside that boundary. It cannot alter its own grants, erase contrary evidence or weaken constitutional checks.

An owner instruction must carry authenticated origin and a policy version. A player, retrieved document, generated lesson or candidate source file claiming to be the owner has no such authority. Interpretation never upgrades an untrusted statement into a permission grant.

Grants should identify the principal, allowed operation, resource scope, limits, expiry and policy version. Recheck immediately before a privileged side effect. Revoke grants with a generation/fencing value so an old worker cannot publish after a stop or policy change. Validate and promote the exact artifact that passed checks; copying different files after approval creates a new unvalidated candidate.

Broad implementation freedom belongs inside the isolated environment. New engine capabilities, tools and quality tests remain possible. A genuinely new external destination, provider, credential or protected-policy change requires owner direction. Work already inside authority continues independently.

## Make world changes transactional and retry safe

A command needs an authenticated actor, stable command ID, expected state/version, validated payload and a durable result receipt. The server records the receipt and all associated mutations atomically. A retry returns the original outcome; it does not consume another item or advance another turn. Reusing an ID with a different payload is an error.

Do not deduplicate merely because two messages look identical: a player may deliberately strike twice. Identity expresses whether this is a repeat delivery of one command or a second intended action. Define retention and behavior for delayed retries. The same rules apply to Recognition, quest rewards, content application and release requests. AWS documents the distinction between semantic intent, client request identifiers and safe retries. [Idempotent API design](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).

Commit world state and the durable event indicating that work should happen in the same transaction. A separate worker can relay that event to the steward and clients. Consumers remember what they processed. An outbox closes the gap between a successful state write and a crash before notification; delivery may repeat, so consumers still need deduplication. This pattern can use local tables without introducing a message-broker cluster. [Transactional outbox](https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos).

After reconnect, the client must obtain a consistent state and know whether pending commands committed. It must not infer success from a local animation or assume silence means failure. Reward uniqueness and world-state consistency are server responsibilities.

## Establish versions that preserve continuity

Record engine, transport protocol, content, effect, asset, schema and operating-policy versions. A release manifest identifies compatible combinations. Experiments also identify their world snapshot, clock and random seed.

An active battle needs an explicit policy: finish under retained rules, or migrate through a tested adapter. An existing quest needs valid references and reachable outcomes after a map or NPC update. Old clients need compatible messages or a controlled refresh/reconnect path. Cached assets must match the definitions that reference them.

Stable IDs preserve player, item, lineage and event identity. Retiring a definition cannot strand a historic item or make an event uninterpretable. Preserve a readable historical definition or a documented successor. This does not guarantee that every old numerical balance value survives forever; compatible rebalancing can retain earned identity and meaningful history.

Release code, definitions and assets as one coherent manifest. A creature introduced with an ability and quest also needs presentation, localization-ready text, collision data and lifecycle rules. Missing references, orphaned stages and invalid asset anchors block promotion.

## Treat evidence packets as incomplete unless specified

Each retrieved packet declares its subject, access scope, source IDs, observation interval, world/version cutoff, total eligible records where known, returned count, truncation and unresolved gaps. It must distinguish absent evidence from a confirmed negative fact.

Provide aggregate inventory/ownership facts alongside paginated provenance. A packet containing the newest 100 objects cannot establish that the player has exactly 100 objects. A recent event window cannot establish that an action never happened earlier.

Before a consequential proposal, test whether the necessary evidence was covered. Retrieve more, reduce the claim or abstain when it was not. Application rechecks authoritative state because the world can change during interpretation. Generated explanations reference actual evidence, not decorative event IDs.

Separate when something happened from when someone learned or recorded it. Add fictional world time separately from service time where needed. An NPC learning yesterday about an older event did not know it last week. Corrections supersede current belief while retaining the history of what was believed. Bitemporal history provides a useful representation for these two timelines. [Bitemporal history](https://martinfowler.com/articles/bitemporal-history.html).

## Protect memory from becoming an instruction channel

Store trusted policy, authoritative evidence, user-authored text, model hypotheses and executable procedures in distinguishable categories. Retrieved prose cannot become system instructions. A proposed reusable skill receives permitted tools and evaluation independently; it does not inherit permissions from the text that described it.

Source trust alone is insufficient. A once-correct procedure can become obsolete, and a valid observation can support an invalid generalization. Skills and lessons need version compatibility, applicability, expiry/review conditions and contrary evidence. Check scope before retrieval, not after disclosing private content.

AgentPoison demonstrates attacks through poisoned memory or retrieval stores without retraining the underlying model. The relevant lesson is that memory is part of the input boundary, not an automatically trusted archive. Its reported attack rates are specific to those experiments, not a forecast for this game. [AgentPoison](https://arxiv.org/abs/2407.12784).

Preserve independent raw evidence and review derived beliefs when contradicted. Never count multiple summaries of the same source as multiple independent observations. Do not mix real-player experiences, simulation traces and invented examples into one unlabeled learning dataset. Research on recursive synthetic-data training also motivates careful provenance if weight training is eventually introduced; ordinary memory drift is a different mechanism. [Research on recursive training data](https://www.nature.com/articles/s41586-024-07566-y).

## Resume from inspectable handoffs

At task boundaries, persist the goal, completion criteria, completed actions, current artifacts, pending hypotheses, failed attempts, remaining resources and next verification step. Keep links to source evidence and execution receipts. On resume, verify the repository, deployment and job state rather than trusting a narrative summary alone.

Context compaction helps the current session continue; persistent memory helps later sessions reuse lessons. Neither replaces authoritative task state. OpenAI's memory/compaction example makes this distinction, while Anthropic's long-task work shows the value of structured progress artifacts between sessions. [OpenAI memory and compaction](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction), [Long-running agent handoffs](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

An interrupted task can be resumed, superseded, cancelled or awaiting reconciliation. Those states differ. A cancelled model request may still incur charges; a cancelled deployment may already have changed service state. Establish facts before choosing another action.

## Measure reliability across repeated work

Evaluate outcomes in the environment: saved world state, installed artifact, rendered scene and actual recovery. A transcript saying the task succeeded is not the outcome. Separate capability tests from regression tests, and distinguish finding one successful attempt from performing consistently across trials. [Agent evaluation methods](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [Tau bench](https://arxiv.org/abs/2406.12045).

Long action chains compound uncertainty. Illustratively, 100 independent steps each succeeding with probability 0.99 yield about 0.366 probability that all succeed. Real failures may be correlated; this is not a measured estimate for our model. Checkpoints, verification and bounded retries reduce dependence on an uninterrupted perfect chain.

Report trial count, scenarios, attempts, cost, severity and recovery outcomes. Zero failures does not prove zero risk. Under independent, representative Bernoulli trials, zero failures in 100 trials gives a one-sided 95% upper bound of about 2.95% for the failure probability: `1 - 0.05^(1/100)`. Repeating one easy scenario is weaker evidence than that assumption requires.

Require all deterministic constitutional and authorization checks to pass. For stochastic quality, define acceptable evidence and uncertainty per capability. Record inconclusive results instead of quietly redefining success. Do not convert a 72-hour trial into a guarantee about months of operation.

## Prevent evaluation from becoming the target

Keep three separate uses of scenarios: development feedback, stable regression checks and fresh assessment. Record evaluation-suite changes. Refresh realistic scenarios as the world changes and restrict sensitive hidden fixtures to the independent runner. Limit detailed leakage from protected tests while giving useful failure categories and reproducible non-sensitive examples.

Repeatedly adapting to the same holdout can overfit it even when the holdout was initially independent. Rotating fixtures and limiting feedback are practical mitigations, not a claim to implement the mathematical guarantees of reusable-holdout research. [Adaptive data analysis](https://arxiv.org/abs/1506.02629).

Use independent facts and multiple quality dimensions rather than a single critic score. Correctness, readability, player agency, continuity, fairness and cost can conflict. A higher score on one cannot excuse a constitutional violation. Reward-tampering experiments support protecting the evaluator's authority, while their training conditions and definitions do not establish that our chosen model will tamper. [Reward-tampering research](https://arxiv.org/abs/2406.10162).

Test the tests: a known-good reference must pass, and intentionally broken candidates must fail for the intended reason. A gate that rejects everything or accepts corrupted history is itself defective.

## Make experimentation valid in a shared world

Predefine the hypothesis, primary measure, guardrails, comparison, observation window and stopping conditions. Preserve negative and inconclusive results. Multiple simultaneous changes confound attribution; test a small intervention before bundling unrelated mechanics.

Players interact through resources, encounters, relationships and future trade. A mechanic assigned to one player can change another player's experience. Network-interference research explains why ordinary independent-unit experimental assumptions can fail. [Experiments with interacting units](https://arxiv.org/abs/1404.7530).

Use copied worlds for broad mechanics and migrations. Where a live comparison is appropriate, choose units with suitable isolation and record spillovers. Region or cohort separation is not automatically sufficient if rewards and players move across boundaries. Time comparisons also face novelty, population changes and persistent consequences. Never describe before/after correlation as proof of causality.

In a small alpha, retain qualified case evidence rather than manufacture statistical certainty. A causal-model library cannot supply missing identification assumptions or missing players. Choose enough evidence to support the scale and reversibility of the proposed action.

## Evaluate the simulated players too

Bots need explicit goals, knowledge, skill, resources and interaction limits. They must not receive the answer, hidden Recognition criteria or capabilities real players lack. Script important adversarial scenarios; supplement them with varied behavior rather than relying solely on fluent model improvisation.

Audit simulator fidelity separately from agent success. A helpful simulated player may accidentally reveal required information or avoid difficult behavior, making the steward look better. A recent UserProxyBench preprint found outcome differences when changing only the simulated user; it is useful corroboration, not a validated estimate for RPG players. [User simulator fidelity](https://arxiv.org/abs/2609.38043).

Synthetic play can test conservation, reachability, tactical options and incidents. It cannot replace first-time human comprehension or establish emotional satisfaction. Owner/player feedback calibrates future choices without making routine releases permanently approval-dependent.

## Preserve creativity through a portfolio

A single maximum score encourages convergence on one pattern. Preserve alternatives that meet quality floors while differing meaningfully: atmosphere, tactical role, exploration structure, social consequences, visual silhouette and narrative purpose. Track similarity and repeated templates, not just volume produced.

Quality-diversity research seeks sets of good, distinct solutions. Adopt the archive principle before deciding whether a full MAP-Elites algorithm is justified. The creative dimensions themselves remain revisable; they are not new constitutional locks. [MAP Elites](https://arxiv.org/abs/1504.04909), [Quality diversity for game content](https://arxiv.org/abs/1907.04053).

Give exploration a bounded share of available resources. Keep unusual successful ideas, including those with narrower audiences. Fairness and coherence remain floors: novelty does not justify deleting history, overpowering early players or repeatedly disrupting a familiar visual identity.

## Build stories with causes and intentions

Separate authoritative events, character beliefs, planned possibilities and prose presentation. An attractive description of a sealed ruin does not establish that the player opened it. A director can plan possibilities; player decisions and valid world actions determine what becomes history.

Record open threads, participants, motivations, prerequisites, unresolved consequences and escape/refusal paths. Revalidate a quest when its assumptions change. Avoid forcing the same dramatic conclusion after the player refuses its premise. Quiet exploration and ordinary outcomes remain valid experiences.

Narrative planning research emphasizes causal progression and comprehensible character intentions. It supports these design concerns without requiring us to adopt its planner or predetermine the whole story. [Narrative planning](https://arxiv.org/abs/1401.3841).

Recognition should consider meaningful alternatives, costs, context and counter-evidence rather than raw activity frequency or eloquent dialogue. Audit whether accessibility choices, cautious play or lower connectivity inadvertently exclude players. Owner/test bots must remain distinguishable from real originators. Preserve opportunities for later arrivals to establish new paths; historical rarity need not become permanent numerical dominance.

## Evaluate battle decisions and playable quality

For the first combat expansion, identify situations where each command has a useful role, its cost and counterplay. Check dominant strategies, unavoidable damage, resource loops, enemy readability and recoverable failure. Increasing animation or statistical complexity alone does not establish tactical depth.

Use a small reference adventure to check exploration, conversation, resource use, a distinct command-driven encounter, a consequence and a return to the world. Include a refusal or alternative route. Assess comprehension with a first-time player, then preserve relevant mechanical scenarios as regression fixtures.

Artwork needs its own measurable checks: complete directions/frames, stable anchors, silhouette readability, tile seams, collision alignment, text fit, effect clarity, contrast, motion comfort and performance on declared devices. Inspect screenshots and short animation captures from real execution.

Keyboard and touch alternatives, visible focus, readable text and controllable animation belong in the initial design. Canvas alone does not establish accessible semantics; menus and relevant world information need appropriate alternatives. Apply relevant W3C criteria and game-specific guidelines without claiming full conformance before assessment. [WCAG guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/).

## Validate the small critical state machines

Represent budget reservation, lease/cancellation, world-command receipts and release promotion as explicit state machines. Define illegal transitions and invariants. Examples: settlement cannot expand the owner's ceiling or discard unresolved charges, a stale worker cannot publish, and one command cannot award the same unique object twice.

Generate varied action sequences and interleavings, including crashes between steps. Preserve and minimize failing sequences so the next attempt can reproduce them. A test model must be simpler and independent of implementation, not a second copy of the same mistake. Fast-check documents this approach and is an optional local implementation tool. [Model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/).

Consider formal model checking for the narrow budget/promotion protocols once their specification stabilizes. It can explore combinations difficult to enumerate manually. Proofs concern the specified model and properties; they do not prove that a game is fun or every implementation dependency is correct. AWS's automated-reasoning experience is a useful precedent for critical boundaries. [Automated reasoning at AWS](https://aws.amazon.com/blogs/security/an-unexpected-discovery-automated-reasoning-often-makes-systems-more-efficient-and-easier-to-maintain/).

## Bind releases to verified artifacts

Record source revision, dependencies, build environment, tests, content/asset manifest, migrations and immutable artifact hashes. The independent runner checks the candidate; promotion installs exactly that artifact. Do not rebuild a different package after testing and assume it is equivalent.

Provenance establishes where an artifact came from; it does not establish that its behavior is correct. The initial local broker can protect manifests and hashes without claiming SLSA certification. Keep dependency and tool versions visible so reproducibility and later investigations have enough context. [SLSA provenance](https://slsa.dev/spec/v1.2/provenance).

Candidate environments receive synthetic or explicitly minimized fixtures, not an unrestricted live backup containing owner sessions and encrypted credentials. Removing secrets includes logs, environment variables, snapshots and output artifacts. Recovery validation that needs protected data runs under the independent operator's identity, outside candidate write access.

## Contain incidents and preserve progress

Define service states with evidence: healthy, degraded, contained, recovering and requiring an exception outside authority. Distinguish liveness, readiness, model availability and world consistency. A successful `SELECT 1` is not proof that combat, event delivery or recovery works.

Monitor action latency, errors, queue age, stuck leases, database pressure, disk, backup verification, cost and failed promotion attempts. Choose targets for a declared workload and device; do not copy uptime figures from a large provider. Track deterioration against a stable baseline.

When reliability deteriorates, prioritize repairs and limit new feature releases while permitting justified recovery work. Google's error-budget policy illustrates this balance. Our exact local policy and thresholds require measured baselines. [SRE error-budget policy](https://sre.google/workbook/error-budget-policy/).

Disaster recovery needs explicit recovery time and tolerated data-loss targets. Ordinary controlled restart/release drills should preserve every acknowledged committed action. Host/disk loss is a different case: a backup interval establishes a possible loss window unless another durable record closes it. Restore the appropriate code, definitions, assets and schema as well as the database. A restored file is insufficient until representative gameplay and history checks pass.

## Handle resources and provider drift honestly

Preserve the current owner-selected `gpt-5.6-sol` and $10 daily ceiling. Keep inference disabled until its gate is implemented and activation is authorized. Internal scheduling can prioritize permitted work; it cannot increase the ceiling, select a different provider or silently fund raster/audio generation.

Persist reservations, actual usage and unresolved charges across restart and midnight. Use precise accounting units and a defined budget timezone. Clock changes must not create a new spending allowance. Distinguish repeat submission of a provider request from repeat application of its result; local deduplication alone cannot establish remote billing semantics.

Reserve enough task resources to evaluate a candidate, not just generate it. Record completed useful outcomes per cost, not token activity. Expensive multi-role harnesses can outperform simple loops in specific demonstrations, but also incur substantially greater cost. Anthropic's reported retro-game-maker example cost $200 with its full harness versus $9 solo; those figures are not estimates for our selected model or daily productivity. Test additions and removals rather than importing the entire architecture. [Harness design experiments](https://www.anthropic.com/engineering/harness-design-long-running-apps).

Record returned model/version identifiers where exposed, prompts, tool versions and evaluation versions. Provider behavior can change even while a configured model name remains the same. Regression checks can contain a degraded capability; selecting a replacement remains an owner decision.

Windows sleep, network loss and shutdown interrupt local operation. Persist work and make resumption automatic under the configured service policy. A localhost trial cannot claim uninterrupted 24-hour operation unless the machine actually remained available. Protect game responsiveness from candidate CPU/disk pressure as well as model latency.

## Day one acceptance gates

These are proposed implementation gates. They have not passed simply because the requirements are written. Mocked deterministic tests can run without paid inference; stochastic model trials remain within authorized daily spending.

| Capability | Evidence required before enabling it |
| --- | --- |
| Evidence retrieval | Truncation declared; stale/contradictory/private facts handled; missing evidence produces retrieval or abstention |
| Provider execution | Atomic reservations, bounded retries, uncertain charges, restart/day-boundary/clock tests, redacted traces and revocation |
| Long-running work | Lease renewal, checkpoints, cancellation, stale-worker fencing and verified context handoff |
| World proposals | Valid references/effects, explicit versions, costs/counterplay, consent where needed and rejection of instruction-bearing data |
| World application | Atomic receipts, same-ID conflict rejection, duplicate/reorder/reconnect trials and preserved reward/history invariants |
| Candidate development | Verified OS isolation, approved tools/network scope, minimized fixtures, resource limits and no access to promotion policy |
| Visual release | Actual before/after captures, functional sprite/asset checks, readable controls and performance evidence |
| Release promotion | Exact tested artifact, compatible active battles/quests/clients, backup, migration-failure and recovery drills |
| Operator recovery | Detected service faults, bounded actions, verified restoration and retained newly committed progress |
| Learned lesson | Linked observations, qualified comparison, contrary evidence, applicability and uncertainty |
| Independent operation | Repeated end-to-end work, deliberate failures, productive resumption, spending compliance and no unbounded churn |

Use explicit checks to distinguish safety from availability. No unauthorized call or history deletion is allowed; a capability waiting safely after failure is a different outcome from a successful completed task. Report both, including how often work requires recovery.

## Revised first implementation package

The next package should establish these contracts in one observable slice:

1. Versioned evidence packets and complete/partial retrieval, with memory correction cases.
2. Goals, attempts, experiments and qualified lessons linked to durable evidence.
3. Provider admission/reservation/settlement with mocked failure and clock scenarios; inference still off.
4. Long-task renewal, cancellation, fencing and structured handoffs in a separate worker boundary.
5. Authoritative command/proposal receipts and version expectations, with duplicate/conflict/reconnect checks.
6. Observatory views showing evidence coverage, expected versus observed outcomes, pending charges and capability readiness.

Then prove one content cycle, one code/art cycle and one release/recovery cycle as specified in AUTONOMY.md. Those slices provide concrete evidence before a sustained unattended trial and server transfer. External asset services, distributed storage and model training remain optional decisions with their own readiness and access conditions.

The day-one standard is a capable seed with honest status, enforceable authority, coherent change contracts and demonstrated recovery. The steward's freedom can grow through demonstrated competence without requiring the owner to design every enhancement or pretending that uncertainty has disappeared.
