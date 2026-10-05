# Living World

Persistent local 2D RPG foundation. Read [the baseline plan](docs/BASELINE.md) for the complete concept, architecture, milestones and launch gates.

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

World memory now records versioned action evidence, item origins and NPC observations. Your private journal appears beside the map. A durable local worker maintains fact summaries and investigation proposals without model calls. Read [memory and work-loop details](docs/MEMORY.md); inspect work with `npm run steward:status`. OpenAI is selected; model, daily budget and API integration are still pending.
