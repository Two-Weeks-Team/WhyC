import { Injectable } from '@nestjs/common';
import { IterationsRepository } from '@/repositories/iterations.repository';
import { RunsRepository } from '@/repositories/runs.repository';
import { mapIteration, mapIterationAudit } from '@/services/mappers';
import { buildPageEnvelope } from '@/services/page.helper';
import { buildEtag, contentHashEtag, filterHash, totalEstimateBucket } from '@/util/etag';
import { errors } from '@/util/errors';
import type { Iteration, IterationAudit, IterationList } from '@/dto/iteration.dto';

@Injectable()
export class IterationsService {
  constructor(
    private readonly iterationsRepo: IterationsRepository,
    private readonly runsRepo: RunsRepository,
  ) {}

  async getById(
    id: string,
  ): Promise<{ body: Iteration; etag: string; cacheControl: string }> {
    const row = await this.iterationsRepo.findById(id);
    if (!row) throw errors.iterationNotFound(id);
    if (row.run?.company?.takedownState === 'removed') {
      throw errors.companyTakedownRemoved();
    }

    const body = mapIteration(row);
    const etag = buildEtag({
      kind: 'id-updated-at',
      id: row.id,
      updatedAt: row.updatedAt,
    });
    return { body, etag, cacheControl: 'public, max-age=60' };
  }

  async listForRun(
    runId: string,
  ): Promise<{ body: IterationList; etag: string; cacheControl: string }> {
    const run = await this.runsRepo.findById(runId);
    if (!run) throw errors.runNotFound(runId);
    if (run.company.takedownState === 'removed') throw errors.companyTakedownRemoved();

    const rows = await this.iterationsRepo.findManyForRun(runId);
    const data = rows.map(mapIteration);
    const count = data.length;

    const body: IterationList = {
      ...buildPageEnvelope({
        hasNext: false, // bounded by iter_limit ≤ 7
        hasPrev: false,
        startIndex: count > 0 ? 1 : 1,
        endIndex: count,
        totalEstimate: count,
        appliedSort: [
          {
            field: 'idx',
            direction: 'asc',
            label: 'Iteration',
            aria_description: 'Ordered by iteration index, ascending.',
          },
        ],
        availableSorts: [{ field: 'idx', label: 'Iteration' }],
        nextCursor: null,
        prevCursor: null,
      }),
      data,
      count,
    };

    const maxUpdatedAt = rows.reduce(
      (acc, r) => (r.updatedAt > acc ? r.updatedAt : acc),
      new Date(0),
    );
    const etag = buildEtag({
      kind: 'collection',
      filterHash: filterHash({ run_id: runId }),
      maxUpdatedAt,
      totalBucket: totalEstimateBucket(count),
    });

    return { body, etag, cacheControl: 'public, max-age=60' };
  }

  /**
   * Audit (B9 + H-E1).
   *
   * PURE DB read — single Postgres query joining Iteration to JudgeVerdict.
   * NO outbound Phoenix Cloud call. The console URL is *templated* in-app
   * from `process.env.PHOENIX_CONSOLE_BASE` + the stored trace_id.
   *
   * If you ever introduce a live Phoenix HTTP client into this code path,
   * the integration test in `test/integration/audit-no-egress.test.ts`
   * will fail.
   */
  async getAudit(
    iterId: string,
  ): Promise<{ body: IterationAudit; etag: string; cacheControl: string }> {
    const row = await this.iterationsRepo.findAuditPayload(iterId);
    if (!row) throw errors.iterationNotFound(iterId);
    if (row.run?.company?.takedownState === 'removed') throw errors.companyTakedownRemoved();

    const body = mapIterationAudit({ iteration: row, verdict: row.judgeVerdict ?? null });
    // Audit is effectively immutable post-iteration completion (verdicts +
    // trace ids are write-once). Use content-hash ETag.
    const etag = contentHashEtag(body);
    return { body, etag, cacheControl: 'public, max-age=300' };
  }
}
