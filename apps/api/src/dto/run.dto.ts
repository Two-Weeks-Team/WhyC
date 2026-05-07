import { tags } from 'typia';
import type { Links, PageEnvelope, RunStatus, SpecFitState } from '@/dto/common.dto';

export interface RunSummary {
  id: string;
  status: RunStatus;
  started_at: string & tags.Format<'date-time'>;
  completed_at?: (string & tags.Format<'date-time'>) | null;
  /**
   * Deterministic spec-fit (SPEC.md §4). 0..1.
   */
  final_spec_fit?: (number & tags.Minimum<0> & tags.Maximum<1>) | null;
  spec_fit_state?: SpecFitState;
  /**
   * Per-iteration spec-fit history (H-P1). Max 7 points; index 0 is iter 0.
   */
  spec_fit_sparkline?: ((number & tags.Minimum<0> & tags.Maximum<1>) | null)[] &
    tags.MaxItems<7>;
  total_cost_cents?: (number & tags.Type<'int64'> & tags.Minimum<0>) | null;
  currency_code: 'USD';
  /**
   * Omitted if `deploy_expires_at` has passed or `deploy_revoked_at` is set.
   */
  deploy_url?: (string & tags.Format<'uri'>) | null;
  deploy_expires_at?: (string & tags.Format<'date-time'>) | null;
  company_slug?: string | null;
  links?: Links;
}

export interface Run extends RunSummary {
  company_id: string;
  /**
   * M7 hard ceiling.
   */
  iter_limit: number & tags.Type<'int64'> & tags.Minimum<1> & tags.Maximum<7>;
  /**
   * M7 hard ceiling ($5 in `currency_code` minor unit).
   */
  cost_limit_cents: number & tags.Type<'int64'> & tags.Minimum<0> & tags.Maximum<500>;
  /**
   * M10 — pinned at run start.
   */
  judge_prompt_version: string & tags.Pattern<'^v[0-9]+$'>;
  deploy_revoked_at?: (string & tags.Format<'date-time'>) | null;
  deploy_revoked_confirmed_at?: (string & tags.Format<'date-time'>) | null;
  iteration_count?: number & tags.Type<'int64'> & tags.Minimum<0>;
  kickoff_key?: string & tags.Pattern<'^[a-z0-9]+:[a-z0-9]+$'>;
}

export interface RunList extends PageEnvelope {
  data: RunSummary[];
}
