/**
 * Dashboard filter / sort state (Zustand).
 *
 * Server-state (the actual rows) lives in React Query; this store only
 * tracks the user-driven filter chips, sort key, and pagination cursor.
 * URL is the source of truth for shareable state — the dashboard page
 * syncs this store to/from `searchParams` on mount and on changes.
 */

'use client';

import { create } from 'zustand';
import type { CompanyStatus } from '@/lib/api/types';

export type SortKey =
  | 'name'
  | '-name'
  | 'final_spec_fit'
  | '-final_spec_fit'
  | 'started_at'
  | '-started_at'
  | 'total_cost_cents'
  | '-total_cost_cents'
  | 'hires_posted_count'
  | '-hires_posted_count';

export interface DashboardFilters {
  batchId: string | null;
  status: CompanyStatus | null;
  sort: SortKey;
  cursor: string | null;
}

export interface DashboardFiltersStore extends DashboardFilters {
  setBatch: (id: string | null) => void;
  setStatus: (s: CompanyStatus | null) => void;
  setSort: (s: SortKey) => void;
  setCursor: (c: string | null) => void;
  reset: () => void;
  hydrate: (next: Partial<DashboardFilters>) => void;
}

const DEFAULTS: DashboardFilters = {
  batchId: null,
  status: null,
  sort: '-final_spec_fit',
  cursor: null,
};

export const useDashboardFilters = create<DashboardFiltersStore>((set) => ({
  ...DEFAULTS,
  setBatch: (id) => set({ batchId: id, cursor: null }),
  setStatus: (s) => set({ status: s, cursor: null }),
  setSort: (s) => set({ sort: s, cursor: null }),
  setCursor: (c) => set({ cursor: c }),
  reset: () => set({ ...DEFAULTS }),
  hydrate: (next) => set(next),
}));

/** Toggle helper — clicking the active sort flips direction. */
export function toggleSort(current: SortKey, field: SortKey extends `${'' | '-'}${infer F}` ? F : never): SortKey {
  const desc = `-${field}` as SortKey;
  const asc = field as unknown as SortKey;
  if (current === desc) return asc;
  if (current === asc) return desc;
  return desc;
}
