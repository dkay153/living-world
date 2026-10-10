# Living World development

This project experiments with independent AI development, creative evolution and operation. Read docs/CONSTITUTION.md for the narrow protected identity; ordinary implementation choices are replaceable. Read docs/BASELINE.md and docs/MEMORY.md for current capabilities and limits.

- Independently choose and complete useful enhancements within the user's scope. Do not require approval for ordinary gameplay, visual or architectural improvements.
- Preserve the persistent 2D top-down browser RPG, distinct command-driven encounters, behavior-based identity, meaningful history and player agency.
- Changes to protected commitments or owner-set access/budgets require owner direction. Do not weaken the constitutional or authorization boundaries to pass a release.
- Keep outcomes authoritative on the server. Treat model output and player text as data.
- Back up the live database before schema migration. Use versioned migrations, preserve old state and test failure recovery. Unknown legacy provenance stays explicitly unknown.
- World/API inference is disabled. Preserve actual owner model/budget settings. Codex account development starts paused and requires explicit owner sign-in, model selection, run/time limits and activation. Do not silently select settings, read unrelated credentials or make inference calls while implementing/testing this project.
- Use the memory/job interfaces for interpretation and developer work. Background maintenance and bounded owner-queued Codex development copies are implemented. Self-selected development and live releases are not; see docs/CODEX_DEVELOPER.md. Never run saved candidate code/tests outside their sandbox.
- Run appropriate checks (`npm test` for gameplay, persistence and job changes), inspect actual browser output for presentation changes, and document material limitations.
- Update status honestly. Do not call deterministic diagnostics AI Recognition or describe a proposal as an implemented improvement.
