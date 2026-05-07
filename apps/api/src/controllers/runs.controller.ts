import { Controller, Res } from '@nestjs/common';
import { TypedParam, TypedRoute } from '@nestia/core';
import type { Response } from 'express';
import { RunsService } from '@/services/runs.service';
import { IterationsService } from '@/services/iterations.service';
import type { Run } from '@/dto/run.dto';
import type { IterationList } from '@/dto/iteration.dto';

@Controller('runs')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly iterations: IterationsService,
  ) {}

  /**
   * GET /api/v1/runs/{run_id}.
   * Cache-Control varies by status: terminal → immutable; non-terminal → max-age=30.
   * Sends `Warning: 299` when status ∈ {ceiling_hit, aborted}.
   */
  @TypedRoute.Get(':run_id')
  async getOne(
    @TypedParam('run_id') runId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Run | undefined> {
    const { body, etag, cacheControl, warning } = await this.runs.getById(runId);
    if (warning) res.setHeader('Warning', warning);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/runs/{run_id}/iterations.
   */
  @TypedRoute.Get(':run_id/iterations')
  async listIterations(
    @TypedParam('run_id') runId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IterationList | undefined> {
    const { body, etag, cacheControl } = await this.iterations.listForRun(runId);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
