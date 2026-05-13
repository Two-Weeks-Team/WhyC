import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StatsService } from '@/services/stats.service';
import type { PublicStats } from '@/dto/stats.dto';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /**
   * GET /api/v1/stats — public ledger for landing receipts.
   * Cache-Control: public, max-age=3600, stale-while-revalidate=86400.
   */
  @Get()
  async getStats(@Res({ passthrough: true }) res: Response): Promise<PublicStats | undefined> {
    const { body, etag, cacheControl } = await this.stats.getStats();
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
