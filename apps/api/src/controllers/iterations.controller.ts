import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IterationsService } from '@/services/iterations.service';
import type { Iteration, IterationAudit } from '@/dto/iteration.dto';

@Controller('iterations')
export class IterationsController {
  constructor(private readonly iterations: IterationsService) {}

  /**
   * GET /api/v1/iterations/{iter_id} — first-class iteration access (H-D3).
   */
  @Get(':iter_id')
  async getOne(
    @Param('iter_id') iterId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Iteration | undefined> {
    const { body, etag, cacheControl } = await this.iterations.getById(iterId);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/iterations/{iter_id}/audit — Phoenix trace ids + judge verdict.
   *
   * B9: PURE DB read. Single Postgres query joining Iteration → JudgeVerdict.
   * NO outbound Phoenix Cloud call at request time. The console URL is
   * built in-app by templating PHOENIX_CONSOLE_BASE + stored trace_id.
   *
   * No 503 in this code path (only /health and /stats emit 503).
   */
  @Get(':iter_id/audit')
  async getAudit(
    @Param('iter_id') iterId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IterationAudit | undefined> {
    const { body, etag, cacheControl } = await this.iterations.getAudit(iterId);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
