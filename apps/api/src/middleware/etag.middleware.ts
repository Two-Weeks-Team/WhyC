import type { NextFunction, Request, Response } from 'express';
import { ifNoneMatchMatches } from '@/util/etag';

/**
 * ETag middleware (B5 + H-P2 + H-P3).
 *
 * Services compute ETag + Cache-Control during handler execution and call
 * `res.locals.applyEtag(etag, cacheControl)`. This middleware:
 *  1. Provides `req.ifNoneMatch` to handlers (a string or undefined).
 *  2. Exposes `res.locals.applyEtag` which sets headers AND short-circuits
 *     to `304 Not Modified` (empty body) when If-None-Match matches.
 *
 * Handlers MUST call applyEtag BEFORE serializing their JSON body, then check
 * the boolean return: if it returned `true`, the response was already
 * short-circuited; the handler must `return` immediately without sending a body.
 *
 * Handlers that throw 304 short-circuit by setting `res.locals.shortCircuited`.
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ifNoneMatch = req.headers['if-none-match'];
  const ifNoneMatchValue = Array.isArray(ifNoneMatch) ? ifNoneMatch[0] : ifNoneMatch;
  (req as Request & { ifNoneMatch?: string }).ifNoneMatch = ifNoneMatchValue;

  /**
   * Returns `true` if the response was short-circuited to 304.
   * Returns `false` if the handler should send the full body.
   */
  res.locals.applyEtag = (etag: string, cacheControl: string): boolean => {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', cacheControl);

    if (ifNoneMatchValue && ifNoneMatchMatches(ifNoneMatchValue, etag)) {
      // 304 with empty body. ETag and Cache-Control are echoed (already set above).
      res.status(304);
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.end();
      res.locals.shortCircuited = true;
      return true;
    }
    return false;
  };

  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      applyEtag?: (etag: string, cacheControl: string) => boolean;
      shortCircuited?: boolean;
    }
  }
}
