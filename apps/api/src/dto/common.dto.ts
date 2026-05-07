import { tags } from 'typia';

/**
 * RFC 7807 Problem Details with WhyC `code` extension (B3).
 * `code` is a closed-vocabulary string drawn from SPEC.md §8.1.
 */
export interface Problem {
  type: string & tags.Format<'uri'>;
  title: string;
  status: number & tags.Type<'int32'> & tags.Minimum<100> & tags.Maximum<599>;
  detail?: string;
  instance?: string;
  /**
   * Pattern: `^[a-z]+(\.[a-z_]+)+$`. See SPEC.md §8.1.
   */
  code: string & tags.Pattern<'^[a-z]+(\\.[a-z_]+)+$'>;
}

/**
 * Localized natural-language string (BCP-47 language tag).
 */
export interface LocalizedString {
  text: string;
  language: string & tags.Pattern<'^[a-zA-Z]{2,3}(-[A-Z]{2})?$'>;
}

/**
 * Hypermedia links for cross-resource navigation (H-D4).
 */
export interface Links {
  self?: string;
  run?: string;
  company?: string;
  audit?: string;
  iterations?: string;
  verdict?: string;
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

export interface PageWindow {
  start_index: number & tags.Type<'int64'> & tags.Minimum<1>;
  end_index: number & tags.Type<'int64'> & tags.Minimum<0>;
  total_estimate?: number & tags.Type<'int64'> & tags.Minimum<0>;
  has_prev: boolean;
  has_next: boolean;
}

/**
 * Reusable list-envelope mixin (H-D2).
 * Concrete list schemas extend this with a `data` array.
 */
export interface PageEnvelope {
  next_cursor: string | null;
  prev_cursor: string | null;
  total_estimate?: number & tags.Type<'int64'> & tags.Minimum<0>;
  window: PageWindow;
  applied_sort: AppliedSort[];
  available_sorts: AvailableSort[];
  server_time: string & tags.Format<'date-time'>;
}

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

/**
 * SR-determinable label alongside the `final_spec_fit` float (B1).
 */
export type SpecFitState = 'converged' | 'near' | 'below_floor' | 'pending' | 'n_a';

export type JudgeVerdictLabel = 'pass' | 'partial' | 'fail';
