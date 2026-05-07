import { Injectable } from '@nestjs/common';
import { RunsRepository } from '@/repositories/runs.repository';
import { CompaniesService } from '@/services/companies.service';
import {
  isTerminalRunStatus,
  mapRun,
  mapRunSummary,
  runWarrantsConvergenceWarning,
} from '@/services/mappers';
import { buildPageEnvelope, clampLimit } from '@/services/page.helper';
import { decodeCursor, encodeCursor } from '@/util/cursor';
import { buildEtag, contentHashEtag, filterHash, totalEstimateBucket } from '@/util/etag';
import { errors } from '@/util/errors';
import type { Run, RunList } from '@/dto/run.dto';
import type { AvailableSort } from '@/dto/common.dto';

const RUN_AVAILABLE_SORTS: AvailableSort[] = [
  { field: 'started_at', label: 'Started' },
];

@Injectable()
export class RunsService {
  constructor(
    private readonly runsRepo: RunsRepository,
    private readonly companiesService: CompaniesService,
  ) {}

  async getById(id: string): Promise<{
    body: Run;
    etag: string;
    cacheControl: string;
    warning?: string;
  }> {
    const row = await this.runsRepo.findById(id);
    if (!row) throw errors.runNotFound(id);
    if (row.company.takedownState === 'removed') throw errors.companyTakedownRemoved();

    const sparkline = await this.runsRepo.findSparkline(id);
    const body = mapRun(row, row._count.iterations, sparkline);

    const terminal = isTerminalRunStatus(row.status);
    const cacheControl = terminal
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=30';

    const etag = terminal
      ? contentHashEtag(body)
      : buildEtag({ kind: 'id-updated-at', id: row.id, updatedAt: row.updatedAt });

    const warning = runWarrantsConvergenceWarning(row.status)
      ? '299 - "run terminated without convergence"'
      : undefined;

    return { body, etag, cacheControl, warning };
  }

  async listForCompany(args: {
    slug: string;
    cursor: string | undefined;
    limit: number | undefined;
  }): Promise<{ body: RunList; etag: string; cacheControl: string }> {
    const { companyId, companySlug } = await this.companiesService.listRunsForCompany(args.slug);
    const limit = clampLimit(args.limit);
    const cursor = decodeCursor<[string, string]>(args.cursor);
    const cursorStartedAt = cursor ? new Date(cursor.k[0]) : null;
    const cursorId = cursor?.id ?? null;

    const rows = await this.runsRepo.findManyForCompany({
      companyId,
      cursorStartedAt,
      cursorId,
      limit,
    });
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    const data = page.map((r) => mapRunSummary(r, r.company?.slug ?? companySlug));

    const totalEstimate = await this.runsRepo.countForCompany(companyId);

    const last = page[page.length - 1];
    const nextCursor =
      hasNext && last
        ? encodeCursor<[string, string]>({
            k: [last.startedAt.toISOString(), last.id],
            id: last.id,
          })
        : null;

    const body: RunList = {
      ...buildPageEnvelope({
        hasNext,
        hasPrev: cursor !== null,
        startIndex: 1,
        endIndex: page.length,
        totalEstimate,
        appliedSort: [
          {
            field: 'started_at',
            direction: 'desc',
            label: 'Started',
            aria_description: 'Sorted by start time, most recent first.',
          },
        ],
        availableSorts: RUN_AVAILABLE_SORTS,
        nextCursor,
        prevCursor: cursor ? '' : null,
      }),
      data,
    };

    const maxUpdatedAt = page.reduce(
      (acc, r) => (r.updatedAt > acc ? r.updatedAt : acc),
      new Date(0),
    );
    const etag = buildEtag({
      kind: 'collection',
      filterHash: filterHash({
        company_id: companyId,
        cursor: args.cursor ?? null,
        limit,
      }),
      maxUpdatedAt,
      totalBucket: totalEstimateBucket(totalEstimate),
    });

    return { body, etag, cacheControl: 'public, max-age=60' };
  }
}
