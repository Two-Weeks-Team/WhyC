/**
 * TypeScript types mirroring `runs/r-20260506T122526Z/specs/openapi.yaml`.
 *
 * Hand-typed (not generated from OpenAPI); kept in sync with v1 lock.
 * SDK team will replace this with a Nestia-generated client; until then
 * the FE owns these contracts.
 */

// ─────────────────────────────────────────────────────────────────────
// Primitives & shared
// ─────────────────────────────────────────────────────────────────────

export type IsoDateTime = string; // ISO 8601 UTC with trailing Z
export type IsoDate = string; // YYYY-MM-DD
export type Bcp47 = string; // e.g. 'en', 'ko-KR'
export type CurrencyCode = 'USD';

export interface LocalizedString {
  text: string;
  language: Bcp47;
}

export interface CompanyDescription {
  text: string;
  source_url: string; // required when text is present (B11)
  language: Bcp47;
}

export interface Links {
  self?: string;
  run?: string;
  company?: string;
  audit?: string;
  iterations?: string;
  verdict?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────

export type CompanyStatus =
  | 'ingested'
  | 'analyzing'
  | 'no_go'
  | 'building'
  | 'deployed'
  | 'converged'
  | 'failed';

export type NoGoReason =
  | 'cost_over_ceiling'
  | 'complexity_over_ceiling'
  | 'ip_unsafe'
  | 'not_demoable'
  | 'regulated_domain';

export type TakedownState = 'active' | 'requested' | 'removed';

export type RegenFlow = 'analyze' | 'design' | 'develop' | 'deploy' | 'full';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'converged'
  | 'ceiling_hit'
  | 'failed'
  | 'aborted';

export type SpecFitState =
  | 'converged'
  | 'near'
  | 'below_floor'
  | 'pending'
  | 'n_a';

export type JudgeVerdictLabel = 'pass' | 'partial' | 'fail';

// ─────────────────────────────────────────────────────────────────────
// Pagination envelope (Page mixin)
// ─────────────────────────────────────────────────────────────────────

export interface PageWindow {
  start_index: number;
  end_index: number;
  total_estimate?: number;
  has_prev: boolean;
  has_next: boolean;
}

export interface AppliedSort {
  field: string;
  direction: 'asc' | 'desc';
  label: string;
  aria_description: string;
}

export interface AvailableSort {
  field: string;
  label: string;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
  prev_cursor: string | null;
  total_estimate?: number;
  window: PageWindow;
  applied_sort: AppliedSort[];
  available_sorts: AvailableSort[];
  server_time: IsoDateTime;
}

// ─────────────────────────────────────────────────────────────────────
// Domain entities
// ─────────────────────────────────────────────────────────────────────

export interface Health {
  status: 'ok' | 'degraded';
  version: string;
  commit_sha?: string;
  db_ok?: boolean;
  phoenix_reachable?: boolean;
  server_time: IsoDateTime;
  checked_at?: IsoDateTime;
}

export interface PublicStatsUnit {
  median_ship_time_seconds: 'seconds';
  median_run_cost_cents: 'usd_cents';
}

export interface PublicStats {
  total_companies_ingested: number;
  total_runs_completed: number;
  total_shipped: number;
  total_no_go: number;
  median_ship_time_seconds: number;
  median_run_cost_cents: number;
  currency_code: CurrencyCode;
  unit: PublicStatsUnit;
  generated_at: IsoDateTime;
  server_time: IsoDateTime;
}

export interface Batch {
  id: string;
  label: string; // e.g. 'W26'
  demo_day_at: IsoDate;
  source_url?: string;
  company_count?: number;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
  links?: Links;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  started_at: IsoDateTime;
  completed_at?: IsoDateTime | null;
  final_spec_fit?: number | null; // 0..1
  spec_fit_state?: SpecFitState;
  spec_fit_sparkline?: Array<number | null>;
  total_cost_cents?: number | null;
  currency_code: CurrencyCode;
  deploy_url?: string | null;
  deploy_expires_at?: IsoDateTime | null;
  company_slug?: string | null;
  links?: Links;
}

export interface Run extends RunSummary {
  company_id: string;
  iter_limit: number;
  cost_limit_cents: number;
  judge_prompt_version: string;
  deploy_revoked_at?: IsoDateTime | null;
  deploy_revoked_confirmed_at?: IsoDateTime | null;
  iteration_count?: number;
  kickoff_key?: string;
}

export interface Company {
  id: string;
  slug: string;
  name: string;
  name_pronunciation?: string | null;
  name_aria_label?: string | null;
  name_display_short?: string | null;
  batch_id: string;
  batch_label?: string;
  description?: CompanyDescription | null;
  hires_posted_count?: number;
  last_hires_check_at?: IsoDateTime;
  status: CompanyStatus;
  no_go_reason?: NoGoReason | null;
  takedown_state: TakedownState;
  takedown_requested_at?: IsoDateTime | null;
  current_run?: RunSummary | null;
  version: number;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
  links?: Links;
}

export interface CompanyListItem {
  id: string;
  slug: string;
  name: string;
  name_aria_label?: string | null;
  batch_id: string;
  batch_label?: string;
  hires_posted_count?: number;
  status: CompanyStatus;
  takedown_state: TakedownState;
  current_run?: RunSummary | null;
  links?: Links;
}

export interface Iteration {
  id: string;
  run_id: string;
  company_slug?: string | null;
  idx: number;
  parent_iter_id?: string | null;
  started_at: IsoDateTime;
  ended_at?: IsoDateTime | null;
  spec_fit?: number | null;
  spec_fit_state?: SpecFitState;
  regen_flow?: RegenFlow | null;
  cost_cents?: number;
  currency_code?: CurrencyCode;
  judge_verdict_id?: string | null;
  phoenix_trace_id?: string | null;
  phoenix_trace_ids?: string[];
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
  links?: Links;
}

export interface JudgeVerdict {
  id: string;
  iteration_id: string;
  judge_prompt_version: string;
  score: number;
  spec_fit_state?: SpecFitState;
  label: JudgeVerdictLabel;
  verdict_json?: Record<string, unknown>;
  trace_id?: string | null;
  created_at?: IsoDateTime;
}

export interface IterationAudit {
  iteration_id: string;
  phoenix_trace_ids: string[];
  phoenix_project?: string;
  phoenix_console_url?: string;
  judge_verdict?: JudgeVerdict;
  spec_fit_components?: {
    axis_extraction?: number;
    axis_design?: number;
    axis_implementation?: number;
    axis_deploy?: number;
  };
  links?: Links;
}

export interface JudgePrompt {
  version: string;
  body: LocalizedString;
  sha256: string;
  frozen_at: IsoDateTime;
}

export interface Comment {
  id: string;
  company_id: string;
  company_slug?: string | null;
  kind: 'public_quote' | 'team_note';
  body: LocalizedString;
  author_handle?: string | null;
  source_url?: string | null;
  posted_at: IsoDateTime;
  links?: Links;
}

// ─────────────────────────────────────────────────────────────────────
// Concrete page types
// ─────────────────────────────────────────────────────────────────────

export type BatchList = Page<Batch>;
export type CompanyList = Page<CompanyListItem>;
export type RunList = Page<RunSummary>;
export type IterationList = Page<Iteration> & { count: number };
export type CommentList = Page<Comment>;

// ─────────────────────────────────────────────────────────────────────
// RFC 7807 Problem
// ─────────────────────────────────────────────────────────────────────

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
}

export class ApiError extends Error {
  readonly problem: ApiProblem;
  constructor(problem: ApiProblem) {
    super(`${problem.code}: ${problem.title}`);
    this.problem = problem;
    this.name = 'ApiError';
  }
}
