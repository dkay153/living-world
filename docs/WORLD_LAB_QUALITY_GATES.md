# World Lab quality gates

`npm run lab:full` is the repeatable local test entry point. It first runs the entire repository suite, then starts a disposable authoritative micro Realm and opens a real Chromium player client. No live player data, guest identity, Codex credentials or production database participates.

## Gates that run now

| Gate | Evidence | Failure means |
| --- | --- | --- |
| Player contract | Gameplay, combat, persistence and WebSocket tests | A core player action or saved history regressed. |
| Owner boundary | Admin, auth, redaction and secret-handling tests | The Lab cannot proceed as a valid owner control plane. |
| Candidate boundary | Developer isolation, account limits and visual-release tests | A candidate must remain a proposal. |
| Micro Realm contract | 18×14 topology, narrative anchors, spawn and authoritative move | The compact stage no longer represents a playable journey. |
| Journey persistence | WebSocket path completes First Echo, survives defeat, reconnects at the safe anchor and retains quest history | A core state transition, recovery path or saved journey regressed. |
| Browser smoke | Chromium connects, renders, accepts input and fits the reference viewport | The real client cannot present the stage reliably. |
| Observatory controls | Chromium owner journey reaches the developer controls and checks the rendered watchdog/cadence contract | The owner control plane is stale or cannot present its actual runtime policy. |
| Visual floor | Color count, opaque coverage, luminance range and canvas label | The scene is blank, unreadable or inaccessible. |
| Evidence | Timestamped JSON report and screenshot | A run cannot be compared or handed to a developer. |

## How an autonomous improvement is evaluated

1. The Lab captures the active release, including a screenshot and measured baseline.
2. A self-directed Codex run receives that evidence in its isolated copy and chooses one falsifiable change.
3. Its candidate tests run inside the existing Codex sandbox. Source remains an inspectable proposal.
4. If the candidate changes `public/art.json`, the independent visual validator may publish that data according to owner policy.
5. The Lab runs again against the active release. The before/after reports establish only measurable changes; artistic or gameplay superiority needs player evidence or a dedicated evaluation.

## Deliberately blocked until a disposable candidate runtime exists

Candidate HTTP/WebSocket/browser execution, arbitrary source release, balance conclusions from one replay, and claims that a visual change is better. A Windows Sandbox or container runtime must be enabled, isolated and verified before the Lab executes saved candidate source as a Realm.

## Next gates

- keyboard-only and narrow-viewport browser checks;
- screenshot comparison with semantic regions rather than brittle pixel matching;
- encounter outcome distributions across fixed random seeds;
- performance budgets for server ticks, WebSocket broadcasts and render frames;
- candidate staging in a verified disposable runtime;
- opt-in player telemetry and feedback, aggregated before an autonomous change is judged successful.
