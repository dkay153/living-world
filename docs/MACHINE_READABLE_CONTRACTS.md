# Machine-readable contracts

Living World now has three checked contract layers:

| File | Role |
| --- | --- |
| `config/constitution-fixtures.json` | The protected player commitments that every candidate and future release evaluator must preserve. |
| `config/state-registry.json` | The named state surfaces an ordinary feature must declare before changing them. |
| `config/feature-contracts/*.json` | Player promise, state impact, authority, intent, invariants, presentation, validation, recovery and retirement for a playable feature. |

Run `npm run contracts:check` to validate all three. The current `micro-world-core` contract describes the existing small exploration-to-encounter journey; it is a factual scope record, not a claim that the full game exists.

The contract files are versioned with the source for local development. They are not the future independent policy broker: an isolated candidate may edit its copied files, but it cannot alter the live project, and general source promotion remains unavailable. The later release broker must read the protected fixture version outside the candidate workspace and bind it to the evaluated artifact.

## Required workflow for an autonomous feature

Before an agent edits a feature, it creates or updates its feature contract, traces every listed state group and writes its impact plan. It also writes `state-impact.json` with the exact registered state groups and recovery story it intends to affect. The host maps changed Realm/client/studio files to their minimum state surfaces. A candidate missing one of those surfaces is stored as **incomplete**, not validated, and cannot publish even a visual pack.

This does not freeze ordinary evolution. A new mechanic, visual language, renderer, map system or content pipeline can add a state group by a versioned contract change, then provide its authority, visibility, transition, migration, presentation, test and retirement story.
