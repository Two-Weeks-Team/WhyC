import { createHash } from 'crypto';

/**
 * ETag derivation (B5). All ETags are STRONG (no `W/` prefix).
 *
 * Strategies:
 *  1. content-hash (immutable resources):  `"sha256:<hex>"`  — terminal runs, judge prompt
 *  2. id+updated_at:                         `"r:<id>:<unix-seconds>"` — single non-terminal
 *  3. collection:                            `"c:<filter_hash>:<max_updated_unix>:<bucket>"`
 *
 * Always emitted *quoted*.
 */

export type EtagStrategy =
  | { kind: 'content-hash'; hash: string }
  | { kind: 'id-updated-at'; id: string; updatedAt: Date }
  | { kind: 'collection'; filterHash: string; maxUpdatedAt: Date; totalBucket: number };

export function buildEtag(strategy: EtagStrategy): string {
  switch (strategy.kind) {
    case 'content-hash':
      return `"sha256:${strategy.hash}"`;
    case 'id-updated-at': {
      const ts = Math.floor(strategy.updatedAt.getTime() / 1000);
      return `"r:${strategy.id}:${ts}"`;
    }
    case 'collection': {
      const ts = Math.floor(strategy.maxUpdatedAt.getTime() / 1000);
      return `"c:${strategy.filterHash}:${ts}:${strategy.totalBucket}"`;
    }
  }
}

/**
 * Content-hash for immutable resources. Uses the canonical JSON body.
 */
export function contentHashEtag(body: unknown): string {
  const json = canonicalJson(body);
  const hex = createHash('sha256').update(json).digest('hex');
  return buildEtag({ kind: 'content-hash', hash: hex });
}

export function filterHash(filter: Record<string, unknown>): string {
  const json = canonicalJson(filter);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/**
 * Bucket total_estimate so cache-key churn is bounded:
 *   <50, <200, <1000, <5000, ≥5000
 */
export function totalEstimateBucket(total: number | null | undefined): number {
  if (total == null) return 0;
  if (total < 50) return 1;
  if (total < 200) return 2;
  if (total < 1000) return 3;
  if (total < 5000) return 4;
  return 5;
}

/**
 * Canonical JSON: deterministic key ordering for stable hashes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * If-None-Match comparison per RFC 9110 §13.1.2.
 * Strong-comparison only (no `W/` prefix on either side).
 * `If-None-Match: *` matches any current representation.
 */
export function ifNoneMatchMatches(ifNoneMatch: string | undefined, currentEtag: string): boolean {
  if (!ifNoneMatch) return false;
  const trimmed = ifNoneMatch.trim();
  if (trimmed === '*') return true;
  // Header may be a comma-separated list.
  const tokens = trimmed.split(',').map((t) => t.trim());
  return tokens.some((t) => t === currentEtag);
}
