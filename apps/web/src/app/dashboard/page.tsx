/**
 * /dashboard — P06 dense leaderboard.
 *
 * Strategy:
 *   - This file is a server component that performs the initial fetch of
 *     `/api/v1/companies` (with `current_run` joined per the B7 perf
 *     contract) and `/api/v1/batches`. It passes the result to a client
 *     component (`DashboardTable`) which owns the filter chips, sort
 *     toggling, and pagination.
 *   - All filter/sort state is URL-driven (searchParams). The Zustand store
 *     in `state/dashboard-filters.store.ts` mirrors the URL and is the
 *     single source of truth at runtime.
 *   - Empty/error/loading states (S2) are rendered here for the SSR shell.
 */

import type { Metadata } from 'next';
import { ApiError, type CompanyList, type BatchList } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { AppNav } from '@/components/app-nav';
import { DashboardTable } from './dashboard-table';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Dense leaderboard of every YC company WhyC has ingested. Sortable, filterable, with sparkline convergence per row.',
};

// Cloud Run handles cache; render dynamic so search params propagate.
export const dynamic = 'force-dynamic';

interface SearchParams {
  batch_id?: string;
  status?: string;
  sort?: string;
  cursor?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sort = params.sort ?? '-final_spec_fit';

  let companies: CompanyList | null = null;
  let batches: BatchList | null = null;
  let fetchError: string | null = null;

  try {
    const [companiesRes, batchesRes] = await Promise.all([
      api.listCompanies({
        batch_id: params.batch_id,
        status: isCompanyStatus(params.status) ? params.status : undefined,
        sort,
        cursor: params.cursor,
        limit: 50,
      }),
      api.listBatches({ limit: 50 }),
    ]);
    companies = companiesRes;
    batches = batchesRes;
  } catch (err) {
    fetchError =
      err instanceof ApiError
        ? `${err.problem.code}: ${err.problem.title}`
        : 'Failed to load companies. Try again in a moment.';
  }

  return (
    <div data-page="dashboard">
      <AppNav current="dashboard" />
      <div className="dash-shell">
        <header className="dash-head">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Receipts.</h1>
          </div>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: 'var(--ink-soft)',
              maxWidth: '42ch',
            }}
          >
            Every YC company WhyC has touched. Sort by spec-fit. Filter by
            batch. Click a row to open the receipt.
          </p>
        </header>

        {fetchError ? (
          <ErrorState message={fetchError} />
        ) : !companies ? (
          <EmptyState />
        ) : companies.data.length === 0 ? (
          <EmptyState />
        ) : (
          <DashboardTable
            initialData={companies}
            batches={batches?.data ?? []}
            initialSort={sort}
            initialBatch={params.batch_id ?? null}
            initialStatus={isCompanyStatus(params.status) ? params.status : null}
          />
        )}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: 32,
        border: '1px solid var(--rule)',
        borderRadius: 12,
        background: 'var(--paper-2)',
        fontFamily: 'var(--mono)',
        fontSize: 14,
        color: 'var(--ink-soft)',
        marginTop: 24,
      }}
    >
      <p style={{ color: 'var(--warn)', marginBottom: 8 }}>
        Could not load receipts.
      </p>
      <p>{message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 48,
        border: '1px dashed var(--rule)',
        borderRadius: 12,
        textAlign: 'center',
        marginTop: 24,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--display)',
          fontSize: 24,
          marginBottom: 8,
        }}
      >
        No companies match this filter.
      </p>
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: 'var(--ink-soft)',
        }}
      >
        Try clearing the batch or status filters.
      </p>
    </div>
  );
}

function isCompanyStatus(s: string | undefined): s is import('@/lib/api/types').CompanyStatus {
  return (
    s === 'ingested' ||
    s === 'analyzing' ||
    s === 'no_go' ||
    s === 'building' ||
    s === 'deployed' ||
    s === 'converged' ||
    s === 'failed'
  );
}
