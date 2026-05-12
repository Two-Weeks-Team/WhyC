// WhyC pipeline contracts. Stable cross-stage interfaces.
//
// Stage chain (per SPEC.md §3):
//   analyze → go-no-go → develop → deploy → self-improve (loop) → done
//
// Every stage takes a typed input from the prior stage's output, performs an
// idempotent unit of work under one Phoenix span, and writes its result back to
// Postgres before yielding control. The dispatcher (jobs/pipeline-kickoff.ts)
// owns the run lifecycle and the SELECT FOR UPDATE on Run rows; individual
// stage modules MUST NOT touch Run state directly outside the contracts here.

import type { Company, Run, Iteration, JudgeVerdict } from '@prisma/client';

// ─── Stage 1: analyze ────────────────────────────────────────────────────────

/** Raw input to the pipeline. Sanitized BEFORE any LLM call (M5). */
export interface SanitizedInput {
  /** Public posting URL. May be `workatastartup.com/companies/<slug>` or own homepage. */
  source_url: string;
  /** Verbatim text (cleaned of HTML, BiDi, ZWSP, fake delimiters). */
  body: string;
  /** Tamper-evidence hash of `body`. */
  content_sha256: string;
  /** What the sanitizer stripped (audit trail). */
  strip_report: {
    html_removed: boolean;
    unicode_normalized: boolean;
    length_in: number;
    length_out: number;
  };
}

/** What `analyze` produces — the 14-line product spec. */
export interface ProductSpec {
  /** One-sentence elevator pitch derivable from the public posting. */
  pitch: string;
  /** Primary user persona, concrete. */
  persona: string;
  /** Job-to-be-done (functional). */
  jtbd_functional: string;
  /** Top-3 user flows the agent must produce in the preview. */
  flows: ReadonlyArray<{ name: string; trigger: string; outcome: string }>;
  /** Surface (web is the only acceptable bucket per H1). */
  surface: 'web';
  /** Hard tech constraints encoded by the analyzer. */
  constraints: {
    /** Domain regulated? (HIPAA / FedRAMP / PCI etc) */
    regulated_domain: boolean;
    /** Hardware-bound product? (lab equipment, robotics with no demo path) */
    hardware_bound: boolean;
    /** Stealth / pre-launch / closed-info posting? */
    stealth: boolean;
  };
  /** Optional: pinned colors / typography hints from public materials. */
  design_anchors?: DesignAnchors;
}

export interface DesignAnchors {
  primary_oklch?: string | undefined;
  mood?: string | undefined;
}

// ─── Stage 2: go-no-go ───────────────────────────────────────────────────────

export type NoGoCode =
  | 'regulated_domain'      // PII / HIPAA / FedRAMP — too risky
  | 'hardware_bound'         // demo requires hardware we don't have
  | 'stealth'                // public info insufficient to infer product
  | 'over_complexity'        // estimated > iter_limit (7) iterations
  | 'over_budget'            // estimated > cost_limit_cents ($5)
  | 'ip_safety_concern'      // generated preview would necessarily reproduce IP
  | 'other';                 // freeform, must include reason

export type GoNoGoDecision =
  | { verdict: 'go'; estimated_iterations: number; estimated_cost_cents: number }
  | { verdict: 'no_go'; code: NoGoCode; reason: string };

// ─── Stage 3: develop ────────────────────────────────────────────────────────

/** What `develop` produces — a buildable Next.js project tarball + manifest. */
export interface DevelopResult {
  /** Hex-encoded sha256 of the tarball; for cache + audit. */
  artifact_sha256: string;
  /** GCS object name where the tarball was uploaded for Cloud Run buildpack. */
  artifact_gcs_uri: string;
  /** Per-flow file count (for the regen heatmap on detail page). */
  per_flow: ReadonlyArray<{ flow: string; files_written: number }>;
  /** Token spend for this stage (Gemini call accounting). */
  cost_cents: number;
}

// ─── Stage 4: deploy ─────────────────────────────────────────────────────────

export interface DeployResult {
  /** Public URL judges visit. */
  url: string;
  /** Cloud Run service name (idempotent — `whyc-preview-${run_id}`). */
  service_name: string;
  /** Region. */
  region: string;
  /** ISO 8601 UTC; 24h after deploy time per M6. */
  expires_at: string;
  /** Revocation handle the sweeper uses. */
  service_uri: string;
}

// ─── Stage 5: self-improve / judge ───────────────────────────────────────────

export interface JudgeAxisScore {
  axis: 'pitch_alignment' | 'flows_present' | 'design_quality' | 'implementation';
  score_0_1: number;       // raw [0,1]
  weight: number;           // immutable per-run weights
  rationale: string;        // verbatim from LLM-as-judge
}

export interface JudgeOutput {
  /** Judge prompt version (e.g. "v1"). */
  judge_prompt_version: string;
  /** Per-axis scores. Sum of (score × weight) = spec_fit. */
  axes: ReadonlyArray<JudgeAxisScore>;
  /** Closed-form spec_fit ∈ [0,1] derivable from axes alone. */
  spec_fit: number;
  /** Which flow (or 'global') most dragged the score — guides next regen. */
  weakest_flow: string;
  /** Verbatim trace_id from Phoenix for this judge call. */
  trace_id: string;
}

// ─── Phoenix MCP introspection (SPEC §6 step 4 — Arize bonus criterion) ─────

/** Per-span summary the agent reads back from Phoenix MCP.  Kept small —
 *  judges grade the *fact that the agent reads its own trace*, not the volume
 *  of data we surface.  M19: this call originates from the agent itself, not
 *  from a sidecar. */
export interface PhoenixSpanSummary {
  /** Full span id from Phoenix Cloud. */
  span_id: string;
  /** Display name (e.g. "whyc.develop", "whyc.judge.model"). */
  name: string;
  /** Total duration in ms. */
  duration_ms: number;
  /** End status — "ok" | "error" | "unset". */
  status: 'ok' | 'error' | 'unset';
  /** Token spend captured by OpenInference, if any. */
  input_tokens?: number | undefined;
  output_tokens?: number | undefined;
  /** Free-form attributes the agent might inspect (already redacted at export
   *  time by RedactingSpanProcessor — so this is the *redacted* view). */
  attrs: Readonly<Record<string, string | number | boolean>>;
}

/** What `introspect` produces — the agent's self-introspection over the run's
 *  own Phoenix traces.  Feeds into self-improve's regen decision so the
 *  weakest_flow choice is grounded in real observability data, not only the
 *  judge's verdict text. */
export interface TraceSummary {
  /** Phoenix project id this trace lives under. */
  project_id: string;
  /** Total spans the agent inspected. */
  span_count: number;
  /** Most-expensive spans by duration_ms, capped at 5. */
  top_expensive: ReadonlyArray<PhoenixSpanSummary>;
  /** Any spans whose status is "error". */
  errors: ReadonlyArray<PhoenixSpanSummary>;
  /** Per-flow span breakdown: which flow's develop/judge span has the worst
   *  status or longest tail.  Feeds the regen-flow override. */
  per_flow: ReadonlyArray<{
    flow: string;
    total_duration_ms: number;
    error_count: number;
    has_high_latency: boolean;   // > 60s as proxy for "model hesitated"
  }>;
  /** Refined weakest-flow signal.  If the judge said 'global' but introspect
   *  finds one flow accounts for >70% of duration or all errors, override. */
  trace_weakest_flow: string | null;
  /** Live MCP audit URL — judges click this from the detail page (SPEC §6). */
  phoenix_console_url: string;
}

/** Decision the loop makes after each judge pass. */
export type LoopDecision =
  | { kind: 'converged' }                                  // spec_fit ≥ τ_converge (0.92)
  | { kind: 'regen'; flow: string }                        // re-run develop on this flow
  | { kind: 'ceiling_hit'; reason: 'iter_limit' | 'cost_limit' };

// ─── Persistence boundary ────────────────────────────────────────────────────

/** What every stage writes to Postgres before yielding (besides Phoenix span). */
export interface StageOutcome<TPayload = unknown> {
  iteration_id: string;
  span_name: string;
  payload: TPayload;
  cost_cents_delta: number;
  duration_ms: number;
}

/** Read-side: stage modules receive this rather than the full Prisma row. */
export interface RunContext {
  run: Pick<Run, 'id' | 'companyId' | 'status' | 'iterLimit' | 'costLimitCents' | 'totalCostCents' | 'judgePromptVersion'>;
  company: Pick<Company, 'id' | 'slug' | 'name' | 'descriptionText' | 'descriptionSourceUrl'>;
  /** Iteration we're currently inside; created by the dispatcher. */
  iteration: Pick<Iteration, 'id' | 'idx' | 'parentIterId' | 'regenFlow'>;
  /** Latest verdict, if any, used by self-improve to decide next move. */
  last_verdict?: Pick<JudgeVerdict, 'id' | 'score' | 'verdictJson'>;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Throw from a stage to surface a domain error. The dispatcher catches and
 * emits a Problem-shaped row in `iteration_errors` (out of MVP — for now we
 * log to span attributes). */
export class StageError extends Error {
  constructor(
    public readonly stage: 'analyze' | 'go_no_go' | 'develop' | 'deploy' | 'self_improve' | 'judge',
    public readonly code: string,
    message: string,
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = 'StageError';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// v4 runtime — "PDD on Runtime" contract extensions
//
// These are ADDITIVE to the v1 contracts above. v1 stage modules keep working;
// the v2 stage modules (Phases 2-5 of master-plan-v4) populate the new
// `_provenance` fields and the panel/hook structures. Nothing here changes an
// existing field's type or removes one — the v1 single-LLM path stays valid
// and is used as the dry-run fallback.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Advocate personas (shared by multi-analyzer & multi-developer) ──────────

/** A persona lens an advocate runs under. Mirrors the pf-plugin advocate roster
 *  but pared to the few that matter for a single-screen preview. Each advocate
 *  call is a distinct Phoenix span tagged `whyc.advocate.persona=<this>`. */
export type AdvocatePersona =
  | 'designer'            // P18 — editorial / visual storytelling
  | 'spreadsheet_jockey'  // P06 — dense data grid power user
  | 'pragmatist'          // P11 — ship-today, smallest viable surface
  | 'mobile_first'        // P07 — phone-frame, touch targets
  | 'data_nerd';          // P13 — analytics / KPI strip first

/** One advocate's contribution at a multi-advocate stage, before dedup/synth. */
export interface AdvocateContribution<TPayload> {
  persona: AdvocatePersona;
  /** Phoenix span id for this advocate's model call. */
  span_id: string;
  /** The advocate's own draft (ProductSpec draft for Stage 1, manifest for Stage 3). */
  payload: TPayload;
  /** Token spend for this advocate. */
  cost_cents: number;
  /** I2-dedup cluster this advocate landed in (advocates in the same cluster
   *  produced near-identical output; only the cluster representative survives). */
  dedup_cluster: number;
}

// ─── Stage 1 v2: multi-analyzer ──────────────────────────────────────────────

/** Provenance block attached to a `ProductSpec` produced by the v2 multi-analyzer.
 *  Post-hook asserts this is present and that the 9 ProductSpec semantic fields
 *  are all non-empty (`pitch`, `persona`, `jtbd_functional`, 3× `flows`,
 *  `surface`, `constraints`, plus the chosen `design_anchors` or explicit null). */
export interface AnalyzeProvenance {
  /** Per-advocate ProductSpec drafts before synthesis. */
  advocates: ReadonlyArray<AdvocateContribution<ProductSpec>>;
  /** Distinct dedup clusters that survived (cluster id → representative persona). */
  surviving_clusters: ReadonlyArray<{ cluster: number; representative: AdvocatePersona }>;
  /** Phoenix span id of the single Gemini Pro synthesis call that merged the
   *  surviving cluster reps into the final spec. */
  synth_span_id: string;
  /** Phoenix Prompts version pin for the synth prompt. */
  synth_prompt_version: string;
  /** Phoenix Datasets row id this analysis was logged under. */
  phoenix_dataset_row_id?: string | undefined;
}

/** ProductSpec as produced by the v2 multi-analyzer. v1 callers may still
 *  return a bare `ProductSpec`; v2 returns this. */
export interface ProductSpecV2 extends ProductSpec {
  _provenance: AnalyzeProvenance;
}

// ─── Stage 3 v2: multi-developer ─────────────────────────────────────────────

/** Provenance block for a `DevelopResult` produced by the v2 multi-developer.
 *  Post-hook records the winner manifest SHA-256 and asserts every loser
 *  manifest SHA-256 is also retained (for the regen-heatmap + audit). */
export interface DevelopProvenance {
  /** Per-advocate manifest attempts (payload = artifact sha256 + per-flow counts). */
  advocates: ReadonlyArray<AdvocateContribution<{
    artifact_sha256: string;
    per_flow: ReadonlyArray<{ flow: string; files_written: number }>;
  }>>;
  /** Structural dedup: advocates with byte-identical DOM tree shape collapse. */
  surviving_clusters: ReadonlyArray<{ cluster: number; representative: AdvocatePersona }>;
  /** Persona whose manifest won the cross-pick. */
  winner_persona: AdvocatePersona;
  /** Why it won (cross-pick rationale — verbatim from the Pro chooser call). */
  winner_rationale: string;
  /** Phoenix Experiments id under which the advocate A/B was logged. */
  phoenix_experiment_id?: string | undefined;
  /** SHA-256 of the *prior* iteration's winning manifest, if this is a regen
   *  (lets the pre-deploy hook prove continuity). */
  prior_manifest_sha256?: string | undefined;
}

/** DevelopResult as produced by the v2 multi-developer. */
export interface DevelopResultV2 extends DevelopResult {
  /** SHA-256 of the winning manifest (the one that gets deployed). Distinct
   *  from `artifact_sha256` (the tarball) — the manifest is the file list. */
  manifest_sha256: string;
  _provenance: DevelopProvenance;
}

// ─── Stage 5 v2: 5-critic judge panel ────────────────────────────────────────

/** One critic's verdict in the panel. Each critic is a Gemini Pro call routed
 *  through `@arizeai/phoenix-evals`; the meta-tally weights the five. */
export interface CriticVerdict {
  /** Critic persona — the five lenses of the judge panel. */
  critic: 'pitch_alignment' | 'flows_present' | 'design_quality' | 'implementation' | 'security';
  /** Per-axis [0,1] scores this critic assigned (same axis set as JudgeAxisScore,
   *  minus 'security' which is pass/fail not a score). */
  axes: ReadonlyArray<JudgeAxisScore>;
  /** Closed-form spec_fit from *this critic's* axes alone. */
  spec_fit: number;
  /** True iff this critic raised a security flag — triggers
   *  `category-gate-security.py` escalation regardless of score. */
  security_flag: boolean;
  /** Phoenix span / eval id for this critic call. */
  trace_id: string;
  /** Verbatim critic rationale. */
  rationale: string;
}

/** JudgeOutput as produced by the v2 5-critic panel. The top-level `spec_fit`
 *  is the weighted meta-tally; per-critic detail lives in `critics`. */
export interface JudgePanelOutput extends JudgeOutput {
  /** The five per-critic verdicts. */
  critics: ReadonlyArray<CriticVerdict>;
  /** Immutable per-critic weights used for the meta-tally (sum = 1). The
   *  post-hook asserts these match the run's pinned weights byte-for-byte. */
  critic_weights: Readonly<Record<CriticVerdict['critic'], number>>;
  /** True iff any critic raised `security_flag`. */
  any_security_flag: boolean;
}

// ─── Stage 7 v2: BigQuery learning signal ────────────────────────────────────

/** One row in `whyc_learning.run_outcomes` — inserted when a run terminates
 *  (converged | ceiling_hit). Read back by `decideNext` on subsequent runs to
 *  bias the regen-flow choice. Empty result set is a valid cold-start state. */
export interface RunOutcomeRow {
  run_id: string;
  company_slug: string;
  /** Terminal decision. */
  outcome: 'converged' | 'iter_limit' | 'cost_limit';
  /** Final spec_fit at termination. */
  final_spec_fit: number;
  /** Iterations consumed. */
  iterations: number;
  /** Total cents spent. */
  cost_cents: number;
  /** The flow that was regenerated most often this run (the "hard" flow). */
  most_regenerated_flow: string | null;
  /** ISO 8601 UTC terminate time. */
  terminated_at: string;
}

/** Learning signal `decideNext` receives — aggregate of prior `RunOutcomeRow`s
 *  for the same company (or empty on cold start). */
export interface LearningSignal {
  /** Prior runs found for this company. 0 = cold start, fall through to
   *  judge+trace signals only. */
  prior_run_count: number;
  /** Flows that historically needed the most regen passes, most-first. */
  historically_hard_flows: ReadonlyArray<string>;
  /** Best final spec_fit ever achieved for this company. */
  best_prior_spec_fit: number | null;
}

// ─── v4 hook layer (mechanical stage gates) ──────────────────────────────────

/** The seven hook scripts under `hooks/` (created in Phase 0.5). The pipeline
 *  shells out to these; a non-zero exit fails the stage transition. */
export type HookName =
  | 'pre-stage'           // budget headroom + contract loaded + URL allow-list
  | 'post-stage'          // output schema-valid + manifest line written
  | 'pre-deploy'          // manifest SHA-256 matches Stage 3 output
  | 'category-gate-security' // any critic security_flag → escalate
  | 'on-converge'         // run terminated converged → BigQuery insert + memory write
  | 'on-fail'             // retriable failure exhausted budget → memory write + alert
  | 'on-cost-ceiling';    // cost ceiling hit → downgrade to single-advocate, else abort

/** Result of invoking a hook script. */
export interface HookResult {
  hook: HookName;
  /** Process exit code. 0 = pass; anything else fails the transition. */
  exit_code: number;
  /** Captured stdout (structured lines the pipeline may parse, e.g. a written
   *  manifest line or a downgrade directive). */
  stdout: string;
  /** Captured stderr (diagnostics). */
  stderr: string;
  /** Wall-clock ms the hook ran. */
  duration_ms: number;
}

/** One line appended to a run's append-only manifest file
 *  (`runs/<run_id>/manifest.jsonl`) by `post-stage`. The pipeline-kickoff
 *  orchestrator and the audit page both replay this. */
export interface ManifestLine {
  /** Correlation id — equals the run id; lets memory files cross-link. */
  run_id: string;
  /** Iteration id this line belongs to. */
  iteration_id: string;
  /** Pipeline stage that just completed. */
  stage: 'pre_flight' | 'analyze' | 'go_no_go' | 'develop' | 'deploy' | 'judge' | 'introspect' | 'self_improve';
  /** ISO 8601 UTC. */
  ts: string;
  /** SHA-256 of the stage's canonical output (spec hash, manifest hash, …). */
  output_sha256: string;
  /** Phoenix trace id covering this stage. */
  trace_id: string | null;
  /** Cumulative cents spent through this stage. */
  cost_cents_cumulative: number;
}
