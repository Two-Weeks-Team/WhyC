import type { AppliedSort, AvailableSort, PageEnvelope } from '@/dto/common.dto';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function clampLimit(raw: number | string | undefined): number {
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(n);
}

export interface BuildEnvelopeArgs {
  hasNext: boolean;
  hasPrev: boolean;
  startIndex: number;
  endIndex: number;
  totalEstimate?: number | null;
  appliedSort: AppliedSort[];
  availableSorts: AvailableSort[];
  nextCursor: string | null;
  prevCursor: string | null;
}

export function buildPageEnvelope(args: BuildEnvelopeArgs): PageEnvelope {
  const env: PageEnvelope = {
    next_cursor: args.nextCursor,
    prev_cursor: args.prevCursor,
    window: {
      start_index: args.startIndex,
      end_index: args.endIndex,
      has_prev: args.hasPrev,
      has_next: args.hasNext,
    },
    applied_sort: args.appliedSort,
    available_sorts: args.availableSorts,
    server_time: new Date().toISOString(),
  };
  if (args.totalEstimate != null) {
    env.total_estimate = args.totalEstimate;
    env.window.total_estimate = args.totalEstimate;
  }
  return env;
}
