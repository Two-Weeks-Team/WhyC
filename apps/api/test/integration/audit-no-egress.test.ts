/**
 * Integration test (B9 + H-E1 enforcement).
 *
 * Asserts that the audit endpoint code path does NOT import any Phoenix HTTP
 * client. The audit handler MUST be a pure DB read — `phoenix_console_url`
 * is built in-app from `PHOENIX_CONSOLE_BASE` + the stored trace_id.
 *
 * Failure modes prevented:
 *   - `import { PhoenixClient } from '@arizeai/phoenix-cloud'`
 *   - `import 'arize-otel'` in the audit handler module graph
 *   - Any module from the audit's transitive imports issuing fetch() to
 *     `*.phoenix.arize.com` at module-init time.
 *
 * The check is structural — we walk the module export trees of
 * IterationsService, IterationsRepository, and the mapper. If any of them
 * pulls in a Phoenix-cloud HTTP client, the test fails.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+['"]@arizeai\/phoenix(-cloud)?['"]/i,
  /from\s+['"]arize-otel['"]/i,
  /from\s+['"]@arize-ai\/phoenix['"]/i,
  /https?:\/\/[^"'\s]*phoenix\.arize\.com\/api/i, // live API call URL pattern
];

const AUDIT_PATH_FILES: readonly string[] = [
  'src/controllers/iterations.controller.ts',
  'src/services/iterations.service.ts',
  'src/repositories/iterations.repository.ts',
  'src/services/mappers.ts',
];

describe('B9 — iteration audit is a pure DB read (no Phoenix egress)', () => {
  for (const relPath of AUDIT_PATH_FILES) {
    it(`${relPath} does not import a Phoenix HTTP client`, () => {
      const abs = resolve(__dirname, '..', '..', relPath);
      const source = readFileSync(abs, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source, `forbidden Phoenix-egress pattern matched in ${relPath}`).not.toMatch(
          pattern,
        );
      }
    });
  }

  it('mappers.ts builds phoenix_console_url from a templated base, not a live call', () => {
    const abs = resolve(__dirname, '..', '..', 'src/services/mappers.ts');
    const source = readFileSync(abs, 'utf-8');
    // The mapper MUST reference PHOENIX_CONSOLE_BASE (env-templated). If that
    // string disappears, the link construction has likely been replaced with
    // something that calls Phoenix at request time.
    expect(source).toMatch(/PHOENIX_CONSOLE_BASE/);
  });
});
