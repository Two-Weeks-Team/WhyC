/**
 * Unit test (B8) — cursor is opaque base64url(JSON({k, id})).
 */

import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, InvalidCursorError } from '@/util/cursor';

describe('cursor', () => {
  it('round-trips a single-key cursor', () => {
    const raw = encodeCursor({ k: ['2026-01-01T00:00:00Z'], id: 'cuid-1' });
    const decoded = decodeCursor<string[]>(raw);
    expect(decoded).toEqual({ k: ['2026-01-01T00:00:00Z'], id: 'cuid-1' });
  });

  it('round-trips a multi-key cursor', () => {
    const payload = { k: [0.87, 'name', 12], id: 'cuid-2' };
    const raw = encodeCursor(payload);
    const decoded = decodeCursor<unknown[]>(raw);
    expect(decoded).toEqual(payload);
  });

  it('returns null for empty / undefined', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('throws InvalidCursorError on garbage', () => {
    expect(() => decodeCursor('!!!not-base64')).toThrow(InvalidCursorError);
    expect(() => decodeCursor('aGVsbG8=')).toThrow(InvalidCursorError); // valid b64 but not JSON
  });

  it('throws InvalidCursorError on missing fields', () => {
    const bad = Buffer.from('{"x":1}', 'utf8').toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(InvalidCursorError);
  });
});
