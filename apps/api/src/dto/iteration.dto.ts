import { tags } from 'typia';
import type {
  JudgeVerdictLabel,
  Links,
  PageEnvelope,
  RegenFlow,
  SpecFitState,
} from '@/dto/common.dto';

export interface JudgeVerdict {
  id: string;
  iteration_id: string;
  judge_prompt_version: string & tags.Pattern<'^v[0-9]+$'>;
  /**
   * Same scale as spec_fit. 0..1.
   */
  score: number & tags.Minimum<0> & tags.Maximum<1>;
  spec_fit_state?: SpecFitState;
  label: JudgeVerdictLabel;
  /**
   * Per-flow breakdown (analyze/design/develop/deploy → score).
   */
  verdict_json?: Record<string, unknown>;
  trace_id?: string | null;
  created_at?: string & tags.Format<'date-time'>;
}

export interface Iteration {
  id: string;
  run_id: string;
  company_slug?: string | null;
  /**
   * 0-based ordinal within the run.
   */
  idx: number & tags.Type<'int64'> & tags.Minimum<0>;
  /**
   * M12 — regen lineage. Null for `idx=0`.
   */
  parent_iter_id?: string | null;
  started_at: string & tags.Format<'date-time'>;
  ended_at?: (string & tags.Format<'date-time'>) | null;
  spec_fit?: (number & tags.Minimum<0> & tags.Maximum<1>) | null;
  spec_fit_state?: SpecFitState;
  regen_flow?: RegenFlow | null;
  cost_cents?: number & tags.Type<'int64'> & tags.Minimum<0>;
  currency_code: 'USD';
  judge_verdict_id?: string | null;
  /**
   * Pinned at iteration creation; never reused on regen (SC5 medium).
   */
  phoenix_trace_id?: string | null;
  phoenix_trace_ids?: string[];
  created_at?: string & tags.Format<'date-time'>;
  updated_at?: string & tags.Format<'date-time'>;
  links?: Links;
}

export interface IterationList extends PageEnvelope {
  data: Iteration[];
  /**
   * Exact count (iterations bounded by iter_limit ≤ 7 — H-D2).
   */
  count: number & tags.Type<'int64'> & tags.Minimum<0>;
}

export interface SpecFitComponents {
  axis_extraction?: number & tags.Minimum<0> & tags.Maximum<1>;
  axis_design?: number & tags.Minimum<0> & tags.Maximum<1>;
  axis_implementation?: number & tags.Minimum<0> & tags.Maximum<1>;
  axis_deploy?: number & tags.Minimum<0> & tags.Maximum<1>;
}

/**
 * Audit endpoint payload. PURE DB read (B9).
 */
export interface IterationAudit {
  iteration_id: string;
  phoenix_trace_ids: string[];
  phoenix_project?: string;
  /**
   * Deep link to Phoenix console. Constructed in-app from a templated base URL
   * + stored trace_id. This endpoint does NOT call Phoenix at request time (B9).
   */
  phoenix_console_url?: string & tags.Format<'uri'>;
  judge_verdict?: JudgeVerdict;
  spec_fit_components?: SpecFitComponents;
  links?: Links;
}
