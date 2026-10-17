# Official AI Elements source baseline

Source repository: https://github.com/vercel/ai-elements

The included `chatbot.tsx.txt` and `v0-clone.tsx.txt` are unchanged source examples captured from `packages/examples/src/` on 13 October 2026, stored as reference text rather than executable application modules. Their repository license is retained in `LICENSE`. Follow that license and the source website's terms when reusing the examples.

Living World's `studio-conversation.tsx` adapts the chatbot conversation/composer compound structure and the v0 empty-state copy. `studio-preview.tsx` adapts the v0 `WebPreview` composition. The installed registry components stay intact.

Necessary adaptations: real history instead of demo messages; Ask/Plan/Agent instead of attachment/search actions; Codex connection entry instead of an invented model catalogue; real host milestones instead of simulated reasoning; start/reset/stop controls for the real disposable world; existing admin navigation; and a separate World Lab tab when a narrow viewport cannot show both panes. No demo model API, v0 API, fabricated sources, or mock inference is connected.

The admin palette was read from the official examples' rendered CSS variables. Its Geist variable font was copied from their observed Next static assets; the font's SIL Open Font License is retained in `ui/fonts/OFL.txt`. Source screenshots live in the ignored `outputs/ai-elements-reference/` folder.

On 14 October, execution disclosures were corrected to the official Tool / ToolHeader / ToolContent composition from https://elements.ai-sdk.dev/components/tool. The installed components remain unchanged. Live host narration and Shimmer stay visible above the composer as requested by the owner; they are not model reasoning or a collapsible context summary. Receipts include tool identity, reported lifecycle, stage, exit code and timestamps; sensitive raw inputs and outputs are omitted. The source Reasoning documentation describes a collapsible thinking block, so that component is deliberately no longer used for host execution context.

Evidence integration now maps actual saved developer plans to Plan, retained attempt boundaries to Checkpoint, host check/release facts to Task, CLI result receipts to ToolOutput, and real check logs to Terminal. The CodeBlock presentation is preserved, with one runtime adaptation: Shiki uses its supported JavaScript regex engine because this app's CSP disallows WebAssembly evaluation. No unsafe-eval or wasm-unsafe-eval permission was added.
