import { tags } from 'typia';

export interface PublicStatsUnit {
  median_ship_time_seconds: 'seconds';
  median_run_cost_cents: 'usd_cents';
}

/**
 * Numbers-only ledger for landing receipts (M4 receipts-only framing).
 * All monetary fields integer minor-unit cents; all durations integer seconds.
 */
export interface PublicStats {
  total_companies_ingested: number & tags.Type<'int64'> & tags.Minimum<0>;
  total_runs_completed: number & tags.Type<'int64'> & tags.Minimum<0>;
  total_shipped: number & tags.Type<'int64'> & tags.Minimum<0>;
  total_no_go: number & tags.Type<'int64'> & tags.Minimum<0>;
  median_ship_time_seconds: number & tags.Type<'int64'> & tags.Minimum<0>;
  median_run_cost_cents: number & tags.Type<'int64'> & tags.Minimum<0>;
  currency_code: 'USD';
  unit: PublicStatsUnit;
  generated_at: string & tags.Format<'date-time'>;
  server_time: string & tags.Format<'date-time'>;
}
