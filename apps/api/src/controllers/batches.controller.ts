import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BatchesService } from '@/services/batches.service';
import type { Batch, BatchList } from '@/dto/batch.dto';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  /**
   * GET /api/v1/batches — list YC batches.
   */
  @Get()
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
  @Get(':batch_id')
  async getOne(
    @Param('batch_id') batchId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Batch | undefined> {
    const { body, etag, cacheControl } = await this.batches.getById(batchId);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
