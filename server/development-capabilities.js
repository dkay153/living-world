// Architectural capability facts, not runtime probes or permission grants.
// Keep the self-directed developer aware of what its host can actually verify.
export function developmentCapabilities(){
  return {
    version:2,
    boundary:'This map describes implementation scope. It does not enable execution, inference, staging or promotion. Owner settings and independent host checks remain authoritative.',
    developmentScope:['renderer and framework implementation','gameplay and content','tooling and launchers','tests and documentation','operational implementation proposals'],
    source:{roots:['server','public','ui','tests','scripts','docs','config','runtime','.agents/skills'],uiBuildAvailable:false,containedUiBuild:'Pinned contained Node/npm/Next/Playwright/Chromium; current availability requires runtime verification'},
    capabilities:[
      {id:'independent_development',state:'implemented',evidence:'server/developer.js; server/autonomy.js',limits:'Requires owner-enabled account execution, current model catalog, verified isolation Ordinary selection respects the failure circuit; bounded fresh recovery diagnoses retained failures.'},
      {id:'codex_harness',state:'implemented',evidence:'server/codex-harness.js',limits:'Native App Server owns tools, skill discovery, durable threads, terminal forks and turn interruption. Fresh planning/implementation and independent release authority remain separate.'},
      {id:'developer_playthrough',state:'implemented_gated',evidence:'scripts/play-game.js; .agents/skills/game-development/SKILL.md; server/developer-tools.js',limits:'Contained Chromium drives private game keyboard/click journeys on desktop/mobile and exports screenshots, visible text and browser diagnostics. Arbitrary richer Playwright scripts run through contained command tools. No live player data or external account access; developer observations are not release receipts.'},
      {id:'production_dependencies',state:'implemented_gated',evidence:'server/dependency-releases.js',limits:'Exact registry package/lock changes, no lifecycle scripts, separate trusted observer dependencies, full artifact staging, immutable source/image rollback with latest history. No candidate Dockerfile or host install.'},
      {id:'outcome_memory',state:'implemented',evidence:'server/autonomy.js; developer_lessons',limits:'Aggregates and recent outcomes inform selection. Hypotheses are not verified causal learning.'},
      {id:'offline_candidate_checks',state:'partial',evidence:'server/developer.js',limits:'Selected candidate-owned offline tests run in MXC. React builds and HTTP/WebSocket/browser checks are excluded; they cannot establish independent release readiness.'},
      {id:'world_lab',state:'partial',evidence:'server/world-lab.js; scripts/micro-world-lab.js',limits:'Fresh trusted-current-source worlds and browser baseline captures exist. A baseline report does not verify a changed candidate artifact.'},
      {id:'candidate_browser_staging',state:'implemented_gated',evidence:'server/source-releases.js; runtime/controller.mjs; runtime/observe.mjs',limits:'Docker lane builds UI, runs candidate tests and separate-UID browser journeys with artifact-bound receipts. Requires actual runtime enrollment and acceptance; host mocks do not establish operational isolation.'},
      {id:'visual_data_release',state:'implemented',evidence:'server/visual-releases.js; server/candidate-evaluator.js',limits:'Only bounded art data can publish under saved owner policy. Structural readability guards do not establish aesthetic improvement.'},
      {id:'general_source_release',state:'implemented_gated',evidence:'server/source-releases.js; server/release-gateway.js',limits:'Renderer and realm source can deploy with latest-checkpoint rollback. Operator policy and executable tools can install in a separate confined runtime with predecessor rollback; availability is reported by hostOperator status. Account/budget authority and independent runtime validation remain protected; production dependency declarations have a separately built immutable image and exact-image rollback. Schema-changing migration requires an additional verified path.'},
      {id:'operator_self_upgrade',state:'implemented_gated',evidence:'server/host-operator.js; operator-kernel; docs/HOST_OPERATOR.md',limits:'Exact operator/tool artifacts install after independent source and policy checks. Host effects are typed capabilities; kernel/account/budget authority is not self-replaceable.'},
      {id:'operator_recovery',state:'implemented_gated',evidence:'server/developer.js; server/owned-process.js; scripts/backup.js',limits:'Cancellation, expired leases, process ownership, backups and visual rollback exist. Fresh diagnosis retries retain failed source as data, use backoff, recheck activation/model/provider allowance and pass every independent gate. Stop and account blockers never auto-resume. Typed Docker/realm repair and launcher-owned service supervision do not grant arbitrary host commands.'},
      {id:'adaptive_world_content',state:'unimplemented',evidence:'server/game.js; server/owner-settings.js',limits:'The First Echo is authored. Typed individualized quest proposals and their content commit lane remain future work; World Intelligence calls stay disabled.'}
    ],
    priorities:[
      'Diagnose retained failed attempts from sanitized evidence without replaying uncertain paid work.',
      'Integrate a separately verified disposable candidate runtime with UI dependencies and browser/persistence scenarios.',
      'Bind independent validation evidence to the exact candidate artifact, then prove backup, deployment and rollback before general source promotion.',
      'Add offline world-grounded quest proposals and authoritative content receipts as one consumer of the studio, rather than treating quests as the whole autonomy goal.'
    ]
  };
}
