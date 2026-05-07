'use client';

/**
 * DashboardTable — interactive client wrapper around the dense leaderboard.
 *
 * Owns:
 *   - filter chip state (batch + status) via Zustand
 *   - sort toggling (URL-driven)
 *   - pagination cursor
 *
 * The first page comes from the server component (SSR ETag-friendly); paging
 * + filtering re-fetches on the client through `/api/*` rewrite.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import type {
  Batch,
  CompanyList,
  CompanyStatus,
  CompanyListItem,
} from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { useDashboardFilters } from '@/state/dashboard-filters.store';
import type { SortKey } from '@/state/dashboard-filters.store';
import { SpecFitBar } from '@/components/spec-fit-bar';
import { Sparkline } from '@/components/sparkline';
import { PagePagination } from '@/components/page-pagination';
import { formatUsdCents, formatUsdCentsForSr } from '@/lib/api/client';

export interface DashboardTableProps {
  initialData: CompanyList;
  batches: Batch[];
  initialSort: string;
  initialBatch: string | null;
  initialStatus: CompanyStatus | null;
}

const STATUS_FILTERS: Array<{ value: CompanyStatus; label: string }> = [
  { value: 'converged', label: 'converged' },
  { value: 'deployed', label: 'deployed' },
  { value: 'building', label: 'building' },
  { value: 'analyzing', label: 'analyzing' },
  { value: 'no_go', label: 'no-go' },
  { value: 'failed', label: 'failed' },
];

export function DashboardTable({
  initialData,
  batches,
  initialSort,
  initialBatch,
  initialStatus,
}: DashboardTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const filters = useDashboardFilters();
  const [page, setPage] = useState<CompanyList>(initialData);
  const [loading, setLoading] = useState(false);

  // Hydrate the store from the server-rendered URL on mount.
  useEffect(() => {
    filters.hydrate({
      batchId: initialBatch,
      status: initialStatus,
      sort: (initialSort as SortKey) ?? '-final_spec_fit',
      cursor: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (after hydrate).
  useEffect(() => {
    let cancelled = false;
    async function reload() {
      setLoading(true);
      try {
        const next = await api.listCompanies({
          batch_id: filters.batchId ?? undefined,
          status: filters.status ?? undefined,
          sort: filters.sort,
          cursor: filters.cursor ?? undefined,
          limit: 50,
        });
        if (!cancelled) setPage(next);
      } catch {
        // Surface a soft error inline; primary error path is the SSR boundary.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    // Skip the first run (the SSR fetch already populated `page`).
    if (
      filters.batchId === initialBatch &&
      filters.status === initialStatus &&
      filters.sort === initialSort &&
      filters.cursor === null
    ) {
      return;
    }
    void reload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.batchId, filters.status, filters.sort, filters.cursor]);

  // Sync URL whenever filters change (shareable links).
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.batchId) qs.set('batch_id', filters.batchId);
    if (filters.status) qs.set('status', filters.status);
    if (filters.sort && filters.sort !== '-final_spec_fit') qs.set('sort', filters.sort);
    if (filters.cursor) qs.set('cursor', filters.cursor);
    const url = qs.toString() ? `${pathname}?${qs.toString()}` : pathname;
    startTransition(() => router.replace(url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.batchId, filters.status, filters.sort, filters.cursor]);

  const sortHandlers = useMemo(() => {
    function makeSorter(field: SortKey extends `${'' | '-'}${infer F}` ? F : never) {
      const desc = `-${field}` as SortKey;
      const asc = field as unknown as SortKey;
      return () => {
        const current = filters.sort;
        if (current === desc) filters.setSort(asc);
        else filters.setSort(desc);
      };
    }
    return {
      name: makeSorter('name'),
      hires_posted_count: makeSorter('hires_posted_count'),
      final_spec_fit: makeSorter('final_spec_fit'),
      total_cost_cents: makeSorter('total_cost_cents'),
      started_at: makeSorter('started_at'),
    };
  }, [filters]);

  const sortFor = (
    field: 'name' | 'hires_posted_count' | 'final_spec_fit' | 'total_cost_cents' | 'started_at',
  ): 'ascending' | 'descending' | 'none' => {
    if (filters.sort === field) return 'ascending';
    if (filters.sort === `-${field}`) return 'descending';
    return 'none';
  };

  return (
    <>
      <FilterBar batches={batches} />
      <div className="table-wrap" aria-busy={loading}>
        <table className="grid-table" aria-label="WhyC company leaderboard">
          <thead>
            <tr>
              <th scope="col" className="sticky-col" aria-sort={sortFor('name')}>
                <SortButton ariaSort={sortFor('name')} onClick={sortHandlers.name}>
                  Company
                </SortButton>
              </th>
              <th scope="col">Batch</th>
              <th scope="col">Status</th>
              <th scope="col" className="num" aria-sort={sortFor('hires_posted_count')}>
                <SortButton
                  ariaSort={sortFor('hires_posted_count')}
                  onClick={sortHandlers.hires_posted_count}
                >
                  Hires
                </SortButton>
              </th>
              <th scope="col" aria-sort={sortFor('final_spec_fit')}>
                <SortButton
                  ariaSort={sortFor('final_spec_fit')}
                  onClick={sortHandlers.final_spec_fit}
                >
                  Spec-fit
                </SortButton>
              </th>
              <th scope="col">Convergence</th>
              <th scope="col" className="num" aria-sort={sortFor('total_cost_cents')}>
                <SortButton
                  ariaSort={sortFor('total_cost_cents')}
                  onClick={sortHandlers.total_cost_cents}
                >
                  Cost
                </SortButton>
              </th>
              <th scope="col" aria-sort={sortFor('started_at')}>
                <SortButton ariaSort={sortFor('started_at')} onClick={sortHandlers.started_at}>
                  Started
                </SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.data.map((c) => (
              <Row key={c.id} item={c} />
            ))}
          </tbody>
        </table>
        <PagePagination
          window={page.window}
          nextCursor={page.next_cursor}
          prevCursor={page.prev_cursor}
          onCursor={(c) => filters.setCursor(c)}
          noun={{ one: 'company', many: 'companies' }}
        />
      </div>
    </>
  );
}

function SortButton({
  ariaSort,
  onClick,
  children,
}: {
  ariaSort: 'ascending' | 'descending' | 'none';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="sort"
      aria-sort={ariaSort}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Row({ item }: { item: CompanyListItem }) {
  const run = item.current_run;
  const ariaName = item.name_aria_label ?? item.name;
  return (
    <tr>
      <td className="sticky-col">
        <Link
          href={`/company/${item.slug}`}
          aria-label={`Open receipt for ${ariaName}`}
        >
          {item.name}
        </Link>
      </td>
      <td>{item.batch_label ?? item.batch_id}</td>
      <td>
        <span
          className={`badge-status ${item.status}`}
          aria-label={`status ${item.status}`}
        >
          {item.status.replace('_', '-')}
        </span>
      </td>
      <td className="num">{item.hires_posted_count ?? '—'}</td>
      <td>
        <SpecFitBar
          value={run?.final_spec_fit ?? null}
          state={run?.spec_fit_state}
          compact
        />
      </td>
      <td>
        <Sparkline
          values={run?.spec_fit_sparkline}
          finalState={run?.spec_fit_state}
          caption={`Spec-fit per iteration for ${ariaName}`}
        />
      </td>
      <td
        className="num"
        aria-label={formatUsdCentsForSr(run?.total_cost_cents ?? null)}
      >
        {formatUsdCents(run?.total_cost_cents ?? null)}
      </td>
      <td>
        {run?.started_at ? (
          <time dateTime={run.started_at}>
            {new Date(run.started_at).toISOString().slice(0, 10)}
          </time>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function FilterBar({ batches }: { batches: Batch[] }) {
  const filters = useDashboardFilters();
  return (
    <div className="filter-bar" role="region" aria-label="Filter chips">
      <div className="filter-group">
        <span className="label">Batch</span>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.batchId === null}
          onClick={() => filters.setBatch(null)}
        >
          All
        </button>
        {batches.map((b) => (
          <button
            key={b.id}
            type="button"
            className="chip"
            aria-pressed={filters.batchId === b.id}
            onClick={() => filters.setBatch(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="filter-group">
        <span className="label">Status</span>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.status === null}
          onClick={() => filters.setStatus(null)}
        >
          Any
        </button>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            className="chip"
            aria-pressed={filters.status === s.value}
            onClick={() => filters.setStatus(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
