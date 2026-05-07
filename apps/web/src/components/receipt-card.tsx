/**
 * ReceiptCard — the receipt-style component used in:
 *   - landing wall (P15-light)
 *   - dashboard hover preview
 *   - detail page aside
 *
 * Pure presentation. Renders SR-friendly phrasing for cents and times
 * via the helpers in `lib/api/client.ts`.
 */

import Link from 'next/link';
import type { CompanyListItem } from '@/lib/api/types';
import {
  daysBetween,
  formatShipTime,
  formatShipTimeForSr,
  formatSpecFitPct,
  formatUsdCents,
  formatUsdCentsForSr,
} from '@/lib/api/client';

export interface ReceiptCardProps {
  company: CompanyListItem;
  /** When set, the footer link uses an explicit href (otherwise /company/{slug}). */
  href?: string;
  /** Industry / category one-liner (optional, derived from description in v1.1). */
  category?: string;
}

export function ReceiptCard({ company, href, category }: ReceiptCardProps) {
  const run = company.current_run ?? null;
  const isShipped = company.status === 'converged' || company.status === 'deployed';
  const isNoGo = company.status === 'no_go';

  const daysSinceStart = run ? daysBetween(run.started_at, run.completed_at ?? undefined) : null;
  const shipTime =
    run && run.completed_at
      ? Math.floor(
          (new Date(run.completed_at).getTime() -
            new Date(run.started_at).getTime()) /
            1000,
        )
      : null;

  const target = href ?? `/company/${company.slug}`;
  const ariaName = company.name_aria_label ?? company.name;

  return (
    <article
      className="receipt-card"
      aria-label={`Receipt for ${ariaName}`}
      lang="en"
    >
      <h5>{company.name}</h5>
      <p className="batch">
        YC {company.batch_label ?? company.batch_id}
        {category ? ` · ${category}` : ''}
      </p>
      <dl>
        {daysSinceStart !== null && (
          <>
            <dt>Days since DD</dt>
            <dd>{daysSinceStart}</dd>
          </>
        )}
        {company.hires_posted_count !== undefined && (
          <>
            <dt>Hires posted</dt>
            <dd>{company.hires_posted_count}</dd>
          </>
        )}
        {!isNoGo && shipTime !== null && (
          <>
            <dt>WhyC ship time</dt>
            <dd aria-label={formatShipTimeForSr(shipTime)}>{formatShipTime(shipTime)}</dd>
          </>
        )}
        {isNoGo ? (
          <>
            <dt>WhyC verdict</dt>
            <dd>No-Go</dd>
          </>
        ) : (
          <>
            <dt>spec-fit</dt>
            <dd>{formatSpecFitPct(run?.final_spec_fit ?? null)}</dd>
          </>
        )}
        {run?.total_cost_cents !== undefined && run.total_cost_cents !== null && (
          <>
            <dt>Cost</dt>
            <dd aria-label={formatUsdCentsForSr(run.total_cost_cents)}>
              {formatUsdCents(run.total_cost_cents)}
            </dd>
          </>
        )}
      </dl>
      <div className="footer">
        <span
          className={`badge ${isShipped ? 'shipped' : isNoGo ? 'nogo' : ''}`}
        >
          {isShipped ? 'shipped' : isNoGo ? 'no-go' : company.status}
        </span>
        <Link
          href={target}
          aria-label={`${isNoGo ? 'See why' : 'View receipt for'} ${ariaName}`}
        >
          {isNoGo ? 'why ↗' : 'view ↗'}
        </Link>
      </div>
    </article>
  );
}
