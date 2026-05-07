/**
 * PagePagination — cursor-based pagination control with SR live region.
 *
 * Reads the `Page.window` envelope returned by every list endpoint and
 * surfaces it as both a visual "showing 51-100 of 487" string and an
 * `aria-live="polite"` announcement so SR users hear the new range when
 * paging (H-A2).
 */

'use client';

import type { PageWindow } from '@/lib/api/types';

export interface PagePaginationProps {
  window: PageWindow;
  nextCursor: string | null;
  prevCursor: string | null;
  onCursor: (cursor: string | null) => void;
  /** Singular/plural noun, e.g. "company" / "companies". */
  noun?: { one: string; many: string };
}

export function PagePagination({
  window: w,
  nextCursor,
  prevCursor,
  onCursor,
  noun = { one: 'item', many: 'items' },
}: PagePaginationProps) {
  const total = w.total_estimate;
  const totalLabel =
    total === undefined
      ? null
      : `${total} ${total === 1 ? noun.one : noun.many}`;
  const rangeLabel = `${w.start_index}–${w.end_index}`;
  const visualText = totalLabel
    ? `Showing ${rangeLabel} of ${totalLabel}`
    : `Showing ${rangeLabel}`;

  const srAnnouncement = totalLabel
    ? `Showing ${noun.many} ${w.start_index} through ${w.end_index} of ${totalLabel}.`
    : `Showing ${noun.many} ${w.start_index} through ${w.end_index}.`;

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="window">{visualText}</span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </span>
      <span className="controls">
        <button
          type="button"
          onClick={() => onCursor(prevCursor)}
          disabled={!w.has_prev || !prevCursor}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => onCursor(nextCursor)}
          disabled={!w.has_next || !nextCursor}
          aria-label="Next page"
        >
          Next →
        </button>
      </span>
    </nav>
  );
}
