# Change discipline

Every autonomous change begins with an impact map, not an edit. Before touching source, the developer identifies the goal, all affected files, callers, public contracts, persistent state, tests, visuals, documentation and code that may become obsolete.

The candidate writes `change-plan.json` before its first source edit. It names the invariants that must remain true, what must be removed or reconciled, and the exact validation required. A broad rewrite is not a plan; split it into focused candidates.

After implementation, the developer reads every changed file and direct caller again. It updates related tests, controls, documentation and labels; removes dead or duplicate paths; and records unresolved effects rather than leaving them implicit. A passing test alone does not establish completeness.

The host records this plan with the candidate evidence. Missing or malformed plans prevent automatic visual publication. General source promotion remains protected by its separate runtime.
