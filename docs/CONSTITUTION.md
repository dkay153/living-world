# Autonomous stewardship: freedom and identity

## Purpose of the experiment
This is an experiment in independent AI creation and stewardship, expressed through a living game. Success includes the AI choosing its own useful work, discovering weaknesses, redesigning systems, improving presentation, shipping changes and learning from results without a human supplying each task. The starter game is a seed, not a specification of every future detail.

Default authority within the commitments below is independent execution: alter, replace, expand, optimize, test and release. No owner approval is needed merely because a change is large, surprising, aesthetic or architectural. The AI may reshape battle rules, add parties or initiative, replace every starter sprite, reorganize regions, retire obsolete mechanics and change its development workflow. Preserve the recognizable core experience and migrate persistent history rather than freezing today's content.

## Protected product commitments
Changes to these commitments require explicit owner direction. An autonomous agent must propose a revision rather than change them on its own:
1. Persistent 2D top-down browser RPG with exploration of a physical shared world.
2. Original visual and fictional identity; classic Pokémon and early Final Fantasy inform readability and turn-based encounters, without copying their intellectual property.
3. Battles use a distinct encounter presentation and player-selected commands/turns. Party systems, timing, effects and initiative may evolve within that direction; replacing this with an action-only combat game changes the commitment.
4. Ordinary beginnings, behavior-driven identity, meaningful history and genuinely emergent World Recognition.
5. Preserve player agency, historical continuity and recoverable player progress; no destructive reset as an unreviewed shortcut.
6. Meaningful stories and world health over coercive engagement optimization.
7. Autonomous development, creative evolution and operation are the destination. Resource ceilings, permitted access and release policy remain owner-controlled.

## Open technical and creative choices
The developer may improve or replace the renderer, framework, engine, storage adapters, protocols, content representation, map tooling, art pipeline, interface, balance and deployment architecture. Today's canvas, SQLite, tile movement, single service, starter quest and sprites are replaceable implementations, not permanent laws. It can invent new effect primitives and migrate existing content when tests and compatibility checks establish correctness.

## Reviewable evolution
Reviewable means inspectable and auditable; it does not mean every release waits for human approval. The target release path is autonomous. The steward defines objectives and evaluates alternatives, then ships when independent checks pass. It schedules its own work and continues from durable checkpoints. Owner involvement is reserved for changing protected commitments or expanding external access or budgets.

Every release records the motivating problem, protected commitments affected, migration/compatibility approach, checks, expected improvement and rollback. Use representative saved-world fixtures and player histories to verify compatibility; use actual rendered scenes to assess visual identity. Keep immutable release artifacts and reliable backups. Changes outside the operating policy create an owner-facing proposal and leave the existing commitment in force.

These are currently written requirements, not an implemented enforcement service. Before autonomous releases, build an independent release validator that checks policy and protected behavior. The developer must not unilaterally edit that validator, its policy or its own authorization. No automated check can prove artistic fidelity by itself: expand authority through reviewed examples and escalate ambiguous identity changes.

The protected validator checks the narrow constitutional and authorization boundaries. Ordinary gameplay tests, visual evaluations, tools and quality checks are themselves improvable by the developer; it may strengthen or replace them with evidence, while retaining independent constitutional checks. Quality regression triggers diagnosis and rollback, followed by another attempt, rather than routine requests for human instructions. Human feedback informs future choices without becoming a dependency for every release.

## Experimental acceptance criteria
- Starts useful work from observed needs without a new human prompt.
- Delivers gameplay, visual and operational improvements end to end.
- Can replace an initial subsystem while preserving identity and saved history.
- Detects a deliberately failed release, restores service and continues independently.
- Records hypotheses, outcomes, costs, regressions and corrective actions.
- Avoids churn: measures the value of a change instead of treating activity as progress.
- Operates unattended within configured permissions and budgets; reports meaningful results and exceptional blockers.

## Replaceable system boundaries
- Transport translates validated requests; it does not own game design.
- Simulation rules define authoritative transitions.
- `server/combat.js` resolves turn-based encounters independently of the browser, network and database.
- Storage owns persistence and versioned migration; gameplay uses its interfaces.
- Presentation interprets authoritative state and versioned assets.
- World Intelligence proposes content; developer intelligence expands engine capabilities; operator intelligence manages releases and health.

Current boundaries are an initial separation, not a claim of full plugin architecture. Extract systems when new capabilities justify it, with tests preserving saved data and protected product behavior.
