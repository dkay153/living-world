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

Before an agent edits a feature, a separate planning workspace creates `change-plan.json` and `state-impact.json`. The planning workspace may write only those two files; any source edit fails the attempt before the editable candidate is started. The host copies the validated records into the candidate’s private scratch area, maps changed Realm/client/studio files to their minimum state surfaces, and stores a candidate missing one of those surfaces as **incomplete**, not validated. It cannot publish even a visual pack.

This does not freeze ordinary evolution. A new mechanic, visual language, renderer, map system or content pipeline can add a state group by a versioned contract change, then provide its authority, visibility, transition, migration, presentation, test and retirement story.

The host's candidate evaluator is deliberately narrow. It can reject failed/protected/incomplete work, retain general source/content changes as inspectable proposals, and identify a sole `public/art.json` change as eligible for the existing independent visual-data validator. It cannot promote general source code; the future release broker remains a separate required compartment.
