# Living World AI interface

This is the production React presentation layer for the local Node game server.

`/admin` is one AI Studio: a persistent developer conversation and its evidence, an inspectable World Lab, and provider configuration sit in the same surface. The chat uses the official AI Elements registry sources directly: `conversation`, `message`, `prompt-input`, `reasoning`, and `shimmer`. Its evidence and developer views use the official AI Code Elements sources: `agent`, `task`, `checkpoint`, and `model-selector`, alongside the project’s shadcn primitives.

The registry source is kept in `ui/components/ai-elements` so the autonomous developer can inspect and improve the same components it uses. Build it with `npm run ui:build`; `npm start`, the test suite, and both browser labs do that first.