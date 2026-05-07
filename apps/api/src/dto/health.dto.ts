import { tags } from 'typia';

export interface Health {
  status: 'ok' | 'degraded';
  version: string;
  commit_sha?: string;
  db_ok?: boolean;
  /**
   * Last cached probe of Phoenix Cloud (B9). Refreshed by an internal cron,
   * NOT by this request.
   */
  phoenix_reachable?: boolean;
  server_time: string & tags.Format<'date-time'>;
  checked_at?: string & tags.Format<'date-time'>;
}
