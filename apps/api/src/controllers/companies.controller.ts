import { Controller, Query, Res } from '@nestjs/common';
import { TypedParam, TypedRoute } from '@nestia/core';
import type { Response } from 'express';
import { CompaniesService } from '@/services/companies.service';
import { RunsService } from '@/services/runs.service';
import { CommentsService } from '@/services/comments.service';
import type { Company, CompanyList } from '@/dto/company.dto';
import type { RunList } from '@/dto/run.dto';
import type { CommentList } from '@/dto/comment.dto';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly runs: RunsService,
    private readonly comments: CommentsService,
  ) {}

  /**
   * GET /api/v1/companies — sortable, filterable dashboard list.
   * SC6 B7: companies + currentRun resolved via single LEFT JOIN.
   */
  @TypedRoute.Get()
  async list(
    @Query('batch_id') batchId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('include_removed') includeRemoved: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CompanyList | undefined> {
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;
    const { body, etag, cacheControl } = await this.companies.list({
      batchId,
      status,
      includeRemoved: parseBool(includeRemoved),
      sort,
      cursor,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/companies/{slug}.
   */
  @TypedRoute.Get(':slug')
  async getOne(
    @TypedParam('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Company | undefined> {
    const { body, etag, cacheControl } = await this.companies.getBySlug(slug);
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/companies/{slug}/runs.
   */
  @TypedRoute.Get(':slug/runs')
  async listRuns(
    @TypedParam('slug') slug: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RunList | undefined> {
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;
    const { body, etag, cacheControl } = await this.runs.listForCompany({
      slug,
      cursor,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }

  /**
   * GET /api/v1/companies/{slug}/comments.
   *
   * Convenience nested alias kept consistent with `/companies/{slug}/runs`
   * — same service path, same ETag, same Cache-Control. The canonical
   * dispatch lives in CommentsController at `/comments?company_slug=…`
   * (BE_LEAD note: spec keeps the flat path canonical for backward compat
   * per SC2 LOW; FE may use either freely).
   */
  @TypedRoute.Get(':slug/comments')
  async listComments(
    @TypedParam('slug') slug: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CommentList | undefined> {
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;
    const { body, etag, cacheControl } = await this.comments.listForCompanySlug({
      companySlug: slug,
      cursor,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}

function parseBool(v: string | undefined): boolean {
  if (v === undefined) return false;
  if (v === 'true' || v === '1') return true;
  return false;
}
