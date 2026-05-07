/**
 * Typed fetch client for the WhyC public read API.
 *
 * Honors:
 *   - ETag / If-None-Match conditional revalidation (returns `null` on 304).
 *   - RFC 7807 Problem Details with the WhyC `code` extension (B3).
 *   - 410 Gone surfacing for takedown / expired deploys (B4).
 *   - Cache-Control hints via Next.js `fetch` `next.revalidate`.
 *
 * This is a thin layer; React Query handles client-side caching, and Next.js
 * server-component fetches reuse the same shape.
 */

import type {
  ApiProblem,
  BatchList,
  Batch,
  CommentList,
  Company,
  CompanyList,
  CompanyStatus,
  Health,
  Iteration,
  IterationAudit,
  IterationList,
  JudgePrompt,
  PublicStats,
  Run,
  RunList,
} from './types';
import { ApiError } from './types';

// In-browser fetches go through the Next.js `/api/*` rewrite (see
// next.config.ts). On the server, hit the backend directly when the
// internal URL is configured (avoids a round-trip through the loopback
// rewrite during SSR).
const SERVER_BASE =
  process.env.WHYC_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE ?? '';

function resolveBase(): string {
  if (typeof window === 'undefined') {
    // SSR: prefer direct backend URL when present.
    return SERVER_BASE.replace(/\/$/, '');
  }
  // Browser: rewrite layer terminates at `/api/v1/...`.
  return '';
}

interface RequestOptions {
  ifNoneMatch?: string;
  // Next.js fetch revalidate hint (seconds). null = no-store.
  revalidate?: number | false;
  signal?: AbortSignal;
  accept?: string;
}

export interface ApiResponse<T> {
  data: T;
  etag: string | null;
  cacheControl: string | null;
  warning: string | null;
}

/** Construct a path under `/api/v1/`. */
function v1(path: string): string {
  const trimmed = path.startsWith('/') ? path : `/${path}`;
  return `/api/v1${trimmed}`;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T> | null> {
  const headers: Record<string, string> = {
    Accept: options.accept ?? 'application/json',
  };
  if (options.ifNoneMatch) {
    headers['If-None-Match'] = options.ifNoneMatch;
  }

  const init: RequestInit & { next?: { revalidate?: number | false } } = {
    method: 'GET',
    headers,
    signal: options.signal,
  };

  if (typeof options.revalidate !== 'undefined' && typeof window === 'undefined') {
    init.next = { revalidate: options.revalidate };
  }

  const url = `${resolveBase()}${v1(path)}`;
  const res = await fetch(url, init);

  if (res.status === 304) {
    return null;
  }

  const etag = res.headers.get('etag');
  const cacheControl = res.headers.get('cache-control');
  const warning = res.headers.get('warning');

  if (!res.ok) {
    let problem: ApiProblem;
    try {
      problem = (await res.json()) as ApiProblem;
    } catch {
      problem = {
        type: 'about:blank',
        title: res.statusText || 'Request failed',
        status: res.status,
        code: 'http.unknown',
      };
    }
    throw new ApiError(problem);
  }

  if (options.accept === 'text/markdown') {
    const text = (await res.text()) as unknown as T;
    return { data: text, etag, cacheControl, warning };
  }

  const json = (await res.json()) as T;
  return { data: json, etag, cacheControl, warning };
}

// Convenience: just return `data`, throw on null (304 with no cached body).
async function requestData<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request<T>(path, options);
  if (!res) {
    throw new ApiError({
      type: 'about:blank',
      title: 'Unexpected 304 without cached body',
      status: 304,
      code: 'cache.unexpected_not_modified',
    });
  }
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────
// Endpoint helpers
// ─────────────────────────────────────────────────────────────────────

export const api = {
  health: (opts?: RequestOptions) => requestData<Health>('/health', { revalidate: 0, ...opts }),

  publicStats: (opts?: RequestOptions) =>
    requestData<PublicStats>('/stats', { revalidate: 3600, ...opts }),

  listBatches: (params?: { cursor?: string; limit?: number }, opts?: RequestOptions) =>
    requestData<BatchList>(buildPath('/batches', params), { revalidate: 60, ...opts }),

  getBatch: (batchId: string, opts?: RequestOptions) =>
    requestData<Batch>(`/batches/${encodeURIComponent(batchId)}`, { revalidate: 60, ...opts }),

  listCompanies: (
    params?: {
      batch_id?: string;
      status?: CompanyStatus;
      include_removed?: boolean;
      sort?: string;
      cursor?: string;
      limit?: number;
    },
    opts?: RequestOptions,
  ) => requestData<CompanyList>(buildPath('/companies', params), { revalidate: 60, ...opts }),

  getCompany: (slug: string, opts?: RequestOptions) =>
    requestData<Company>(`/companies/${encodeURIComponent(slug)}`, {
      revalidate: 60,
      ...opts,
    }),

  listCompanyRuns: (
    slug: string,
    params?: { cursor?: string; limit?: number },
    opts?: RequestOptions,
  ) =>
    requestData<RunList>(buildPath(`/companies/${encodeURIComponent(slug)}/runs`, params), {
      revalidate: 60,
      ...opts,
    }),

  getRun: (runId: string, opts?: RequestOptions) =>
    requestData<Run>(`/runs/${encodeURIComponent(runId)}`, { revalidate: 30, ...opts }),

  listRunIterations: (runId: string, opts?: RequestOptions) =>
    requestData<IterationList>(`/runs/${encodeURIComponent(runId)}/iterations`, {
      revalidate: 60,
      ...opts,
    }),

  getIteration: (iterId: string, opts?: RequestOptions) =>
    requestData<Iteration>(`/iterations/${encodeURIComponent(iterId)}`, {
      revalidate: 60,
      ...opts,
    }),

  getIterationAudit: (iterId: string, opts?: RequestOptions) =>
    requestData<IterationAudit>(`/iterations/${encodeURIComponent(iterId)}/audit`, {
      revalidate: 300,
      ...opts,
    }),

  getJudgePrompt: (version: string, opts?: RequestOptions) =>
    requestData<JudgePrompt>(`/judge/prompts/${encodeURIComponent(version)}`, {
      revalidate: 31_536_000,
      ...opts,
    }),

  listComments: (
    params: { company_slug: string; cursor?: string; limit?: number },
    opts?: RequestOptions,
  ) => requestData<CommentList>(buildPath('/comments', params), { revalidate: 60, ...opts }),
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function buildPath(
  base: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s.length > 0 ? `${base}?${s}` : base;
}

/** Format `total_cost_cents` per B2 SR phrasing rule ("0 dollars and 4 cents"). */
export function formatUsdCentsForSr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'cost not available';
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const dollarWord = dollars === 1 ? 'dollar' : 'dollars';
  const centWord = remainder === 1 ? 'cent' : 'cents';
  return `${dollars} ${dollarWord} and ${remainder} ${centWord}`;
}

/** Format `total_cost_cents` for visual display. */
export function formatUsdCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format median ship time (seconds) for SR per B2. */
export function formatShipTimeForSr(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'time not available';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} minutes ${s} seconds`;
}

/** Format median ship time for visual display. */
export function formatShipTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Format spec-fit float (0..1) as percent integer. */
export function formatSpecFitPct(specFit: number | null | undefined): string {
  if (specFit === null || specFit === undefined) return '—';
  return `${Math.round(specFit * 100)}%`;
}

/** Days between two ISO date-times (1-based, integer). */
export function daysBetween(startIso: string, endIso: string | undefined): number {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
