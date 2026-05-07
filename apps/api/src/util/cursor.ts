/**
 * Cursor encode/decode (B8).
 *
 * Format: `base64url(JSON.stringify({k: <sort_key_value_tuple>, id: <row_id>}))`.
 * Multi-key sort encodes the full key tuple plus `id` as tiebreaker.
 */

export interface CursorPayload<K = unknown> {
  /** Sort-key tuple value (single value or array for multi-key sort). */
  k: K;
  /** Row id (deterministic tiebreaker). */
  id: string;
}

export class InvalidCursorError extends Error {
  constructor(reason: string) {
    super(`request.invalid_cursor: ${reason}`);
    this.name = 'InvalidCursorError';
  }
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function encodeCursor<K>(payload: CursorPayload<K>): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeCursor<K = unknown>(raw: string | undefined | null): CursorPayload<K> | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let json: string;
  try {
    json = fromBase64Url(raw);
  } catch {
    throw new InvalidCursorError('Cursor failed base64url decode.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidCursorError('Cursor failed JSON decode.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('id' in parsed) ||
    !('k' in parsed) ||
    typeof (parsed as { id: unknown }).id !== 'string'
  ) {
    throw new InvalidCursorError('Cursor missing required fields {k, id}.');
  }
  return parsed as CursorPayload<K>;
}
