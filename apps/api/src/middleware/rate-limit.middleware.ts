import type { NextFunction, Request, Response } from 'express';
import { errors } from '@/util/errors';

/**
 * App-level rate limiting (defense-in-depth — Cloud Armor at LB is primary, H-S4).
 *
 *  - 60 req/min/IP for `/api/v1/companies*` and `/api/v1/runs*`
 *  - 600 req/min/IP for `/api/v1/health` and `/api/v1/stats`
 *  - 600 req/min/IP default for everything else (catalog/audit/judge/comments)
 *
 * Implementation: per-instance in-memory token bucket. With Cloud Run
 * `max-instances=5` and `concurrency=80`, this is sufficient as the second
 * line of defense — Cloud Armor handles the cross-instance enforcement.
 */

interface BucketState {
  /** Tokens currently available. */
  tokens: number;
  /** Bucket capacity (also refill target). */
  capacity: number;
  /** Refill rate in tokens-per-millisecond. */
  ratePerMs: number;
  /** Last refill timestamp (ms since epoch). */
  lastRefillMs: number;
}

type LimitTier = { perMin: number };

const TIER_HIGH: LimitTier = { perMin: 600 };
const TIER_LOW: LimitTier = { perMin: 60 };

function tierForPath(path: string): LimitTier {
  // path is the full URL path; we only care about the suffix after /api/v1/.
  if (path.startsWith('/api/v1/health') || path.startsWith('/api/v1/stats')) return TIER_HIGH;
  if (path.startsWith('/api/v1/companies') || path.startsWith('/api/v1/runs')) return TIER_LOW;
  return TIER_HIGH;
}

const buckets = new Map<string, BucketState>();
const MAX_TRACKED_KEYS = 50_000;

function getClientIp(req: Request): string {
  // Express sets req.ip when `trust proxy` is on. Falls back to socket address.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function getOrInitBucket(key: string, perMin: number): BucketState {
  let bucket = buckets.get(key);
  const now = Date.now();
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Evict oldest entry to bound memory.
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (oldestKey) buckets.delete(oldestKey);
    }
    bucket = {
      tokens: perMin,
      capacity: perMin,
      ratePerMs: perMin / 60_000,
      lastRefillMs: now,
    };
    buckets.set(key, bucket);
  } else if (bucket.capacity !== perMin) {
    // Tier changed for this key (different endpoint family); reset.
    bucket.capacity = perMin;
    bucket.ratePerMs = perMin / 60_000;
    if (bucket.tokens > perMin) bucket.tokens = perMin;
  }
  // Refill.
  const elapsed = now - bucket.lastRefillMs;
  if (elapsed > 0) {
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.ratePerMs);
    bucket.lastRefillMs = now;
  }
  return bucket;
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tier = tierForPath(req.path);
  const ip = getClientIp(req);
  const key = `${tier.perMin}:${ip}`;
  const bucket = getOrInitBucket(key, tier.perMin);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    next();
    return;
  }

  // Compute Retry-After: how long until 1 token is available.
  const msUntilOne = (1 - bucket.tokens) / bucket.ratePerMs;
  const retryAfterSeconds = Math.max(1, Math.ceil(msUntilOne / 1000));

  // Hand to the global filter for RFC 7807 formatting + Retry-After header.
  next(errors.rateLimited(retryAfterSeconds));
}

/**
 * Test-only: clear bucket state.
 */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
