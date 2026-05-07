/**
 * Integration test (M4 supersede / B11 enforcement).
 *
 * Asserts that every served Company with `description.text != null` also has
 * a `description.source_url`. This complements the Postgres CHECK constraint
 * (defense in depth: structural enforcement at DB + service mapping layer).
 *
 * Test plan:
 *   1. Read every Company row that has descriptionText IS NOT NULL.
 *   2. Run mapCompany() on each and assert `description.source_url` is a valid
 *      https? URL.
 *   3. Optionally hit `/companies/{slug}` HTTP integration (skipped here —
 *      requires a running test DB; left for the e2e harness).
 *
 * NOTE: This test requires DATABASE_URL to point at a seeded test DB.
 *       Run via `pnpm test:integration`.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mapCompany } from '@/services/mappers';

const HTTPS_URL_PATTERN = /^https?:\/\/.+/;
const REQUIRE_DB = process.env.WHYC_INTEGRATION_DB === '1';

describe.runIf(REQUIRE_DB)('B11 — company description citation enforcement', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('every Company with description.text has a description.source_url', async () => {
    const rows = await prisma.company.findMany({
      where: { descriptionText: { not: null } },
      include: {
        batch: { select: { id: true, label: true } },
        currentRun: true,
      },
    });

    expect(rows.length).toBeGreaterThan(0); // sanity: seed must contain some.

    for (const row of rows) {
      const dto = mapCompany(row);
      // If text is present in the source row, the mapper MUST emit a
      // CompanyDescription with both `text` and `source_url`.
      expect(dto.description).not.toBeNull();
      expect(dto.description?.text).toBe(row.descriptionText);
      expect(dto.description?.source_url).toMatch(HTTPS_URL_PATTERN);
      expect(dto.description?.language).toMatch(/^[a-zA-Z]{2,3}(-[A-Z]{2})?$/);
    }
  });

  it('Company with description.text but null source_url is filtered (defensive)', async () => {
    // The DB CHECK constraint should make this impossible, but the mapper's
    // defensive guard MUST also drop the description.
    const synth = {
      id: 'test-synth',
      slug: 'test-synth',
      name: 'Synth',
      namePronunciation: null,
      nameAriaLabel: null,
      nameDisplayShort: null,
      batchId: 'test-batch',
      descriptionText: 'Some description without a citation.',
      descriptionSourceUrl: null,
      descriptionLanguage: 'en',
      hiresPostedCount: BigInt(0),
      lastHiresCheckAt: null,
      status: 'ingested' as const,
      noGoReason: null,
      takedownState: 'active' as const,
      takedownRequestedAt: null,
      takedownRemovedAt: null,
      takedownReason: null,
      version: BigInt(0),
      currentRunId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      batch: { id: 'test-batch', label: 'W26' },
      currentRun: null,
    };
    const dto = mapCompany(synth as never);
    expect(dto.description).toBeNull();
  });
});

describe.skipIf(REQUIRE_DB)('B11 (DB-skipped)', () => {
  it('skipped without WHYC_INTEGRATION_DB=1', () => {
    expect(true).toBe(true);
  });
});
