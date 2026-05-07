/**
 * Unit test (B5 + H-P3) — ETag derivation strategy.
 */

import { describe, expect, it } from 'vitest';
import {
  buildEtag,
  contentHashEtag,
  filterHash,
  ifNoneMatchMatches,
  totalEstimateBucket,
} from '@/util/etag';

describe('buildEtag', () => {
  it('content-hash form is `"sha256:<hex>"`', () => {
    expect(buildEtag({ kind: 'content-hash', hash: 'abc123' })).toBe('"sha256:abc123"');
  });
  it('id-updated-at form is `"r:<id>:<unix>"`', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(buildEtag({ kind: 'id-updated-at', id: 'cuid-1', updatedAt: d })).toBe(
      `"r:cuid-1:${Math.floor(d.getTime() / 1000)}"`,
    );
  });
  it('collection form is `"c:<filterHash>:<unix>:<bucket>"`', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(
      buildEtag({
        kind: 'collection',
        filterHash: 'abcd',
        maxUpdatedAt: d,
        totalBucket: 2,
      }),
    ).toBe(`"c:abcd:${Math.floor(d.getTime() / 1000)}:2"`);
  });
});

describe('contentHashEtag', () => {
  it('canonicalizes key order', () => {
    const a = contentHashEtag({ x: 1, y: 2 });
    const b = contentHashEtag({ y: 2, x: 1 });
    expect(a).toBe(b);
  });
});

describe('filterHash', () => {
  it('produces stable 16-char output', () => {
    const h = filterHash({ batch_id: 'W26', status: 'converged' });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('totalEstimateBucket', () => {
  it.each([
    [null, 0],
    [0, 1],
    [49, 1],
    [50, 2],
    [199, 2],
    [200, 3],
    [999, 3],
    [1000, 4],
    [4999, 4],
    [5000, 5],
    [99999, 5],
  ] as const)('%j → %j', (input, expected) => {
    expect(totalEstimateBucket(input)).toBe(expected);
  });
});

describe('ifNoneMatchMatches', () => {
  it('matches a single quoted etag', () => {
    expect(ifNoneMatchMatches('"sha256:abc"', '"sha256:abc"')).toBe(true);
  });
  it('matches against `*`', () => {
    expect(ifNoneMatchMatches('*', '"r:1:1"')).toBe(true);
  });
  it('matches a comma-separated list', () => {
    expect(ifNoneMatchMatches('"r:1:1", "r:2:2"', '"r:2:2"')).toBe(true);
  });
  it('fails on missing header', () => {
    expect(ifNoneMatchMatches(undefined, '"r:1:1"')).toBe(false);
  });
  it('fails on no overlap', () => {
    expect(ifNoneMatchMatches('"r:9:9"', '"r:1:1"')).toBe(false);
  });
});
