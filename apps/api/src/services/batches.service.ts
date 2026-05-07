import { Injectable } from '@nestjs/common';
import { BatchesRepository } from '@/repositories/batches.repository';
import type { Batch, BatchList } from '@/dto/batch.dto';
import { errors } from '@/util/errors';
import { decodeCursor, encodeCursor } from '@/util/cursor';
import { mapBatch } from '@/services/mappers';
import { buildPageEnvelope, clampLimit } from '@/services/page.helper';
import { buildEtag, filterHash, totalEstimateBucket } from '@/util/etag';
import type { AvailableSort } from '@/dto/common.dto';

const BATCH_AVAILABLE_SORTS: AvailableSort[] = [
  { field: 'demo_day_at', label: 'Demo Day' },
];

@Injectable()
export class BatchesService {
  constructor(private readonly batchesRepo: BatchesRepository) {}

  async getById(id: string): Promise<{ body: Batch; etag: string; cacheControl: string }> {
    const row = await this.batchesRepo.findById(id);
    if (!row) throw errors.batchNotFound(id);
    const body = mapBatch(row);
    const etag = buildEtag({
      kind: 'id-updated-at',
      id: row.id,
      updatedAt: row.updatedAt,
    });
    return { body, etag, cacheControl: 'public, max-age=60' };
  }

  async list(args: {
    cursor: string | undefined;
    limit: number | undefined;
  }): Promise<{ body: BatchList; etag: string; cacheControl: string }> {
    const limit = clampLimit(args.limit);
    const cursor = decodeCursor<[string, string]>(args.cursor);
    const cursorDemoDayAt = cursor ? new Date(cursor.k[0]) : null;
    const cursorId = cursor?.id ?? null;

    const rows = await this.batchesRepo.findManyForList({
      cursorDemoDayAt,
      cursorId,
      limit,
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const data = page.map(mapBatch);

    const totalEstimate = await this.batchesRepo.countAll();

    const last = page[page.length - 1];
    const nextCursor =
      hasNext && last
        ? encodeCursor<[string, string]>({
            k: [last.demoDayAt.toISOString(), last.id],
            id: last.id,
          })
        : null;

    const startIndex = cursor ? 1 : 1; // cursor opacity — we don't track absolute index
    const endIndex = page.length;

    const body: BatchList = {
      ...buildPageEnvelope({
        hasNext,
        hasPrev: cursor !== null,
        startIndex,
        endIndex,
        totalEstimate,
        appliedSort: [
          {
            field: 'demo_day_at',
            direction: 'desc',
            label: 'Demo Day',
            aria_description: 'Sorted by Demo Day, most recent first.',
          },
        ],
        availableSorts: BATCH_AVAILABLE_SORTS,
        nextCursor,
        prevCursor: cursor ? '' : null,
      }),
      data,
    };

    // Collection ETag.
    const maxUpdatedAt = page.reduce(
      (acc, r) => (r.updatedAt > acc ? r.updatedAt : acc),
      new Date(0),
    );
    const etag = buildEtag({
      kind: 'collection',
      filterHash: filterHash({ cursor: args.cursor ?? null, limit }),
      maxUpdatedAt,
      totalBucket: totalEstimateBucket(totalEstimate),
    });

    return { body, etag, cacheControl: 'public, max-age=60' };
  }
}
