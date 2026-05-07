/**
 * /company/[slug] — Project detail page.
 *
 * Composite of:
 *   - P10 hero (live progress visualization, scope-cut to current run)
 *   - P13 KPI tiles (4 tiles: spec-fit, cost, ship time, iterations)
 *   - P04 cost ledger row (receipt-style)
 *   - P15 read-only reaction wall
 *   - Run history listing (links to per-run iteration timelines)
 *
 * Server component — three parallel fetches: company, runs, comments.
 * `notFound()` for 404, `gone()` (custom render) for 410 takedown.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ApiError, type Company, type RunList, type CommentList } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import {
  daysBetween,
  formatShipTime,
  formatShipTimeForSr,
  formatSpecFitPct,
  formatUsdCents,
  formatUsdCentsForSr,
} from '@/lib/api/client';
import { AppNav } from '@/components/app-nav';
import { SpecFitBar } from '@/components/spec-fit-bar';
import { Sparkline } from '@/components/sparkline';
import { Wall } from '@/components/wall';

export const dynamic = 'force-dynamic';

interface Params {
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const company = await api.getCompany(slug);
    return {
      title: company.name,
      description: company.description?.text?.slice(0, 200) ?? `WhyC receipt for ${company.name}`,
    };
  } catch {
    return { title: slug };
  }
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  let company: Company;
  let runs: RunList | null = null;
  let comments: CommentList | null = null;

  try {
    [company, runs, comments] = await Promise.all([
      api.getCompany(slug),
      api.listCompanyRuns(slug, { limit: 20 }).catch(() => null),
      api.listComments({ company_slug: slug, limit: 50 }).catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.problem.status === 404) notFound();
      if (err.problem.status === 410) {
        return <GoneState code={err.problem.code} detail={err.problem.detail} />;
      }
    }
    throw err;
  }

  const run = company.current_run ?? null;
  const shipTimeSec =
    run?.completed_at && run?.started_at
      ? Math.floor(
          (new Date(run.completed_at).getTime() -
            new Date(run.started_at).getTime()) /
            1000,
        )
      : null;
  const daysSinceStart = run ? daysBetween(run.started_at, run.completed_at ?? undefined) : null;

  return (
    <div data-page="detail">
      <AppNav current="detail" />
      <div className="detail-shell">
        <p className="breadcrumb">
          <a href="/dashboard">← All receipts</a>
        </p>

        <header
          className="detail-hero"
          aria-labelledby="detail-title"
          lang={company.description?.language ?? 'en'}
        >
          <div>
            <p className="batch-line">
              YC {company.batch_label ?? company.batch_id} ·{' '}
              <span aria-label={`status ${company.status}`}>
                {company.status.replace('_', '-')}
              </span>
            </p>
            <h1
              id="detail-title"
              {...(company.name_aria_label ? { 'aria-label': company.name_aria_label } : {})}
            >
              {company.name}
            </h1>
            {company.description ? (
              <blockquote className="quote" lang={company.description.language || 'en'}>
                "{company.description.text}"
                <cite>
                  Source:{' '}
                  <a
                    href={company.description.source_url}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label="Public description source (opens in a new window)"
                  >
                    {new URL(company.description.source_url).hostname} ↗
                  </a>
                </cite>
              </blockquote>
            ) : null}
          </div>

          <aside aria-label="Run-summary receipt">
            <article className="receipt-card" aria-label={`Receipt for ${company.name}`}>
              <h5>Current run</h5>
              <p className="batch">
                {run?.status ?? 'no run yet'} ·{' '}
                {run?.started_at
                  ? new Date(run.started_at).toISOString().slice(0, 10)
                  : '—'}
              </p>
              <dl>
                <dt>Days since start</dt>
                <dd>{daysSinceStart ?? '—'}</dd>
                <dt>Hires posted</dt>
                <dd>{company.hires_posted_count ?? '—'}</dd>
                <dt>WhyC ship time</dt>
                <dd aria-label={shipTimeSec === null ? 'time not available' : formatShipTimeForSr(shipTimeSec)}>
                  {shipTimeSec === null ? '—' : formatShipTime(shipTimeSec)}
                </dd>
                <dt>spec-fit</dt>
                <dd>{formatSpecFitPct(run?.final_spec_fit ?? null)}</dd>
                <dt>Cost</dt>
                <dd aria-label={formatUsdCentsForSr(run?.total_cost_cents ?? null)}>
                  {formatUsdCents(run?.total_cost_cents ?? null)}
                </dd>
              </dl>
              {run?.deploy_url && run.deploy_expires_at &&
              new Date(run.deploy_expires_at).getTime() > Date.now() ? (
                <a
                  href={run.deploy_url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="footer"
                  style={{ color: 'var(--accent)' }}
                  aria-label={`Open the deployed preview for ${company.name} (opens in a new window)`}
                >
                  Open preview ↗
                </a>
              ) : null}
            </article>
          </aside>
        </header>

        {/* P04 cost ledger row */}
        {run ? (
          <section
            className="ledger-row"
            aria-label="Run cost ledger"
            role="region"
          >
            <div>
              <dt>Run id</dt>
              <dd>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {run.id}
                </code>
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{new Date(run.started_at).toISOString()}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>
                {run.completed_at
                  ? new Date(run.completed_at).toISOString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd aria-label={formatUsdCentsForSr(run.total_cost_cents ?? null)}>
                {formatUsdCents(run.total_cost_cents ?? null)}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{run.status}</dd>
            </div>
          </section>
        ) : null}

        {/* P13 KPI tiles */}
        {run ? (
          <section className="kpis" aria-label="Run KPIs">
            <div className="kpi">
              <p className="label">Spec-fit</p>
              <p
                className={`value ${run.spec_fit_state === 'converged' ? 'good' : run.spec_fit_state === 'below_floor' ? 'warn' : ''}`}
              >
                {formatSpecFitPct(run.final_spec_fit ?? null)}
              </p>
              <SpecFitBar
                value={run.final_spec_fit ?? null}
                state={run.spec_fit_state}
              />
            </div>
            <div className="kpi">
              <p className="label">Convergence</p>
              <div style={{ marginTop: 8 }}>
                <Sparkline
                  values={run.spec_fit_sparkline}
                  width={160}
                  height={48}
                  finalState={run.spec_fit_state}
                  caption={`Spec-fit per iteration for ${company.name}`}
                />
              </div>
            </div>
            <div className="kpi">
              <p className="label">Cost</p>
              <p
                className="value"
                aria-label={formatUsdCentsForSr(run.total_cost_cents ?? null)}
              >
                {formatUsdCents(run.total_cost_cents ?? null)}
              </p>
            </div>
            <div className="kpi">
              <p className="label">Ship time</p>
              <p
                className="value"
                aria-label={shipTimeSec === null ? 'time not available' : formatShipTimeForSr(shipTimeSec)}
              >
                {shipTimeSec === null ? '—' : formatShipTime(shipTimeSec)}
              </p>
            </div>
          </section>
        ) : null}

        {/* Run history */}
        {runs && runs.data.length > 0 ? (
          <section aria-labelledby="runs-title">
            <h2 id="runs-title" className="section-title">
              <span className="eyebrow">Run history</span>
              All runs for {company.name}
            </h2>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                fontFamily: 'var(--mono)',
                fontSize: 13,
              }}
            >
              {runs.data.map((r) => (
                <li
                  key={r.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--rule)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <span style={{ color: 'var(--ink-soft)' }}>
                      {new Date(r.started_at).toISOString().slice(0, 19).replace('T', ' ')}
                    </span>
                    <span style={{ marginLeft: 16 }}>{r.status}</span>
                  </span>
                  <span
                    style={{ display: 'flex', alignItems: 'center', gap: 16 }}
                  >
                    <SpecFitBar
                      value={r.final_spec_fit ?? null}
                      state={r.spec_fit_state}
                      compact
                    />
                    <span aria-label={formatUsdCentsForSr(r.total_cost_cents ?? null)}>
                      {formatUsdCents(r.total_cost_cents ?? null)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* P15 wall */}
        {comments && comments.data.length > 0 ? (
          <Wall
            comments={comments.data}
            heading={`Reactions about ${company.name}`}
            headingLevel="h2"
          />
        ) : null}
      </div>
    </div>
  );
}

function GoneState({ code, detail }: { code: string; detail: string | undefined }) {
  const isTakedown = code === 'company.takedown_removed';
  return (
    <div data-page="detail">
      <AppNav current="detail" />
      <div className="detail-shell">
        <p className="breadcrumb">
          <a href="/dashboard">← All receipts</a>
        </p>
        <div
          role="alert"
          style={{
            padding: 48,
            border: '1px dashed var(--rule)',
            borderRadius: 12,
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: 40,
              marginBottom: 16,
            }}
          >
            {isTakedown ? 'Removed at request.' : 'Preview expired.'}
          </h1>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 14,
              color: 'var(--ink-soft)',
              maxWidth: '60ch',
              margin: '0 auto',
            }}
          >
            {detail ??
              (isTakedown
                ? 'This entry was removed in response to a takedown request. We honor takedowns within 1 hour.'
                : 'The 24-hour preview window has elapsed.')}
          </p>
        </div>
      </div>
    </div>
  );
}
