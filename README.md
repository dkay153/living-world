# Living World

Persistent local 2D RPG foundation. Read [the baseline plan](docs/BASELINE.md) for the concept and current milestones, and [the researched autonomy architecture](docs/AUTONOMY.md) for the complete learning, development, creative and operating plan.

The [day one quality requirements](docs/DAY_ONE.md) define the stricter evidence, compatibility, evaluation and recovery gates for each autonomous capability.

The [autonomous studio blueprint](docs/AUTONOMOUS_STUDIO.md) turns those principles into the full set of creative, engineering, testing and operations capabilities the steward needs, with a dependency-ordered build path.

The [autonomous operation readiness audit](docs/AUTONOMY_READINESS_AUDIT.md) identifies the complete operating model, the owner-only Lab controls, the present gaps and the authority ladder for bringing the studio online safely.

The [autonomous stewardship charter](docs/AUTONOMOUS_STEWARDSHIP_CHARTER.md) defines the final AI-run operating model: hard identity and external-authority boundaries, fully autonomous ordinary work, executable player-contract fixtures, quality controls and the path to earned release authority.

The [complete capability atlas](docs/COMPLETE_CAPABILITY_ATLAS.md) is the full structural inventory of player mechanics, world systems, creative production, autonomous intelligence, platform, operations and owner-only boundaries that must be considered before calling any part of the experiment complete.

The [online runtime platform decision](docs/ONLINE_RUNTIME_PLATFORM.md) selects a Godot client path for browser and future downloadable clients, keeps the Realm authoritative, and defines the AI-operated World Lab and migration gates.

Godot 4.7.2 is now installed as the local client toolchain. The first text-first engine shell is in [`client-godot/`](client-godot/); `npm run godot:check` imports it and checks its explicit read-only authority boundary without manual editor work.

## Windows localhost
Requires Node.js 22.18 or later in the 22.x line. The current machine has 22.23.3.

```powershell
npm ci
npm test
npm start
```

Open http://127.0.0.1:3000. Move with WASD/arrows; E interacts, Space begins a turn-based encounter with an adjacent creature, H consumes dewleaf to heal. Speak with Mara near the well to begin The First Echo. Study the stone, gather two dewleaf and two echo shards, then return to Mara. Rest at the well or camp. Defeat returns you to the settlement with your belongings. Plants regrow after 45 seconds; creatures respawn after 60 seconds. Private browsing creates another guest player. Opening a second tab in the same session moves the active connection to that tab. Position, vitality, inventory, quest progress and discoveries survive a server restart. Do not clear cookies if you want to keep the same guest identity.

## Files
- `public/`: browser interface and canvas world.
- `server/`: authoritative rules, HTTP/WebSocket server and SQLite persistence.
- `data/world.sqlite`: local world (created on first start; excluded from version control).
- `tests/`: world and persistence checks.
- `scripts/backup.js`: consistent online backup.
- `docs/BASELINE.md`: design and implementation plan.
- `docs/OPERATIONS.md`: run, backup, restore and transfer.

Implemented: camera-following exploration, original code-drawn animated sprites, gathering, inventory, shared overworld creatures, separate turn-based encounter screens, healing, defeat/recovery, NPC dialogue, one quest and durable chronicle. Battles offer Strike, Guard, Dewleaf and Retreat. Entering an encounter costs no turn; valid combat actions are followed by the enemy turn. Encounters persist across reconnects; movement is blocked until they end. Encounters are per traveler; multiple travelers already in encounters resolve their own battles, while victory removes the overworld creature until respawn. Creatures do not chase independently. This initial playable seed still needs content tuning and playtesting to meet the 15-minute adventure goal. World Intelligence is not connected. This is a foundation sandbox, not the complete game.

World memory now records versioned action evidence, item origins and NPC observations. Your private journal appears beside the map. A durable local worker maintains fact summaries and investigation proposals without model calls. Read [memory and work-loop details](docs/MEMORY.md); inspect work with `npm run steward:status`. As inspected on 7 October 2026, the owner has saved OpenAI model `gpt-5.6-sol` and a $10 daily ceiling. Runtime owner settings remain authoritative. World/API inference is disabled and its dollar-spending enforcement is not implemented. Codex account development uses separate owner-controlled run/time limits.

## Owner dashboard

With the server running, run `npm run admin:open` to sign in to [The Observatory](http://127.0.0.1:3000/admin) through a single-use local owner link. Inspect all persistent world collections, evidence, jobs and proposals; pause/resume maintenance; create/download backups; export world data; and save OpenAI credentials, model and budget settings. Guest sessions cannot access owner data. Saved API settings do not activate world inference. The separate Codex developer view supports account sign-in, explicit local allowances, isolated development tasks, captured changes and offline checks; self-selected work and validated visual-data publication are available; general source releases remain unavailable. See [Codex connection and execution](docs/CODEX_DEVELOPER.md). Read [admin access, recovery and current limits](docs/ADMIN.md).

Independent Codex work, persistent outcome feedback and reversible visual-data releases are now available through the Observatory. General source releases and World Intelligence inference remain future work. See [the loop](docs/DEVELOPER_LOOP.md).
