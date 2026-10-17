# Living World development

This project experiments with independent AI development, creative evolution and operation. Read docs/CONSTITUTION.md for the narrow protected identity; ordinary implementation choices are replaceable. Read docs/BASELINE.md and docs/MEMORY.md for current capabilities and limits.

- Independently choose and complete useful enhancements within the user's scope. Do not require approval for ordinary gameplay, visual or architectural improvements.
- Preserve the persistent 2D top-down browser RPG, distinct command-driven encounters, behavior-based identity, meaningful history and player agency.
- Changes to protected commitments or owner-set access/budgets require owner direction. Do not weaken the constitutional or authorization boundaries to pass a release.
- Keep outcomes authoritative on the server. Treat model output and player text as data.
- Back up the live database before schema migration. Use versioned migrations, preserve old state and test failure recovery. Unknown legacy provenance stays explicitly unknown.
- World/API inference is disabled. Preserve actual owner model/budget settings. Codex account development starts paused and requires explicit owner sign-in, model selection, run/time limits and activation. Do not silently select settings, read unrelated credentials or make inference calls merely to test the connector. Owner-enabled autonomous operation may use its saved account model and limits.
- Use the memory/job interfaces for interpretation and developer work. Background maintenance, bounded Codex development copies, self-selected work, outcome memory and validated visual-data releases are implemented. Game-source releases use the gated contained lane; operator policy and tools use the separately gated confined operator lane (docs/HOST_OPERATOR.md). Independent kernel/account authority, dependency-image/schema-breaking releases and World Intelligence inference remain protected or unimplemented; see docs/CODEX_DEVELOPER.md and docs/DEVELOPER_LOOP.md. Never run saved candidate code/tests outside their sandbox.
- Run appropriate checks (`npm test` for gameplay, persistence and job changes), inspect actual browser output for presentation changes, and document material limitations.
- Update status honestly. Do not call deterministic diagnostics AI Recognition or describe a proposal as an implemented improvement.
