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
