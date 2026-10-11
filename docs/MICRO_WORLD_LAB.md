# Micro World Lab

`npm run lab:micro` boots the real authoritative Realm in a disposable **18×14 micro map**, opens an actual Chromium client, checks the WebSocket/player contract, captures a real scene and measures baseline visual/accessibility signals. It writes a screenshot and report under `outputs/world-lab/micro/`.

The fixture contains the settlement well, Mara, the Unnamed Stone, four dewleaf nodes, mosslings, the sealed ruin and a bridge. It is intentionally small enough that an autonomous developer can reason about a complete exploration-to-encounter journey, while using the exact movement, WorldSocket, quest, combat and persistence code paths of the game.

The harness is a **trusted-baseline** environment. It never runs saved AI candidate code on the host. Candidate Realm/browser execution remains blocked until a disposable Windows Sandbox or container runtime is enabled and verified. The harness records that limitation in every report rather than pretending it can safely stage arbitrary candidate source today.

## What it proves now

- The real browser client connects to the real isolated Realm.
- The micro fixture preserves its expected dimensions and narrative anchors, and a WebSocket move is accepted only when the authoritative Realm broadcasts the resulting position.
- A second WebSocket traveler performs the actual First Echo path: speaks with Mara, gathers two dewleaf, discovers the stone, earns two shards, completes the quest, is defeated by the Warden, and reconnects at the safe anchor with the completed history intact.
- The rendered scene is nonblank, has a basic color/luminance range, retains the canvas label and primary interaction control, and fits the reference viewport.
- The run produces a screenshot and structured report. A successful report and capture are attached to the next isolated developer run as evidence, so the developer can choose its own focused hypothesis without a human-authored improvement task.

## What it does not prove yet

It is not a visual-art critic, balance simulator, player study, general source-release gate or candidate-code sandbox. Those become separate World Lab layers. The point of this first harness is to make the present game observable and to establish an honest test seam before granting an AI more power.
