import { Controller, Query, Res } from '@nestjs/common';
import { TypedParam, TypedRoute } from '@nestia/core';
import type { Response } from 'express';
import { BatchesService } from '@/services/batches.service';
import type { Batch, BatchList } from '@/dto/batch.dto';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  /**
   * GET /api/v1/batches — list YC batches.
   */
  @TypedRoute.Get()
  async list(
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BatchList | undefined> {
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;
    const { body, etag, cacheControl } = await this.batches.list({
      cursor,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/batches/{batch_id}.
   */
  @TypedRoute.Get(':batch_id')
  async getOne(
    @TypedParam('batch_id') batchId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Batch | undefined> {
    const { body, etag, cacheControl } = await this.batches.getById(batchId);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
