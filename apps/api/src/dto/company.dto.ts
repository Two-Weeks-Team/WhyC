import { tags } from 'typia';
import type {
  CompanyStatus,
  Links,
  NoGoReason,
  PageEnvelope,
  TakedownState,
} from '@/dto/common.dto';
import type { RunSummary } from '@/dto/run.dto';

/**
 * Public-source description (M4 supersede / B11).
 * Presence of any field implies presence of all (required by structure).
 */
export interface CompanyDescription {
  text: string & tags.MaxLength<2000>;
  /**
   * Public URL the description is quoted from. Required when text is present.
   */
  source_url: string & tags.Format<'uri'> & tags.Pattern<'^https?://'>;
  language: string & tags.Pattern<'^[a-zA-Z]{2,3}(-[A-Z]{2})?$'>;
}

export interface Company {
  id: string;
  slug: string & tags.Pattern<'^[a-z0-9][a-z0-9-]{0,63}$'>;
  /**
   * Plain-text company name. NO logo fields exist (M4).
   */
  name: string;
  name_pronunciation?: string | null;
  name_aria_label?: string | null;
  name_display_short?: string | null;
  batch_id: string;
  batch_label?: string;
  description?: CompanyDescription | null;
  hires_posted_count?: number & tags.Type<'int64'> & tags.Minimum<0>;
  /**
   * Excluded from ETag derivation (B5 — 6h cron churn).
   */
  last_hires_check_at?: string & tags.Format<'date-time'>;
  status: CompanyStatus;
  no_go_reason?: NoGoReason | null;
  takedown_state: TakedownState;
  takedown_requested_at?: (string & tags.Format<'date-time'>) | null;
  current_run?: RunSummary | null;
  /**
   * Optimistic-concurrency version (H-Y3). Read-only.
   */
  version: number & tags.Type<'int64'> & tags.Minimum<0>;
  created_at?: string & tags.Format<'date-time'>;
  updated_at?: string & tags.Format<'date-time'>;
  links?: Links;
}

/**
 * Lean projection used by `/companies` (SC6 medium).
 * Drops description, name pronunciation extras, version, and full timestamps.
 */
export interface CompanyListItem {
  id: string;
  slug: string & tags.Pattern<'^[a-z0-9][a-z0-9-]{0,63}$'>;
  name: string;
  name_aria_label?: string | null;
  batch_id: string;
  batch_label?: string;
  hires_posted_count?: number & tags.Type<'int64'> & tags.Minimum<0>;
  status: CompanyStatus;
  takedown_state: TakedownState;
  current_run?: RunSummary | null;
  links?: Links;
}

export interface CompanyList extends PageEnvelope {
  data: CompanyListItem[];
}
