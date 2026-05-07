import { Controller, Query, Res } from '@nestjs/common';
import { TypedRoute } from '@nestia/core';
import type { Response } from 'express';
import { CommentsService } from '@/services/comments.service';
import { errors } from '@/util/errors';
import type { CommentList } from '@/dto/comment.dto';

@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /**
   * GET /api/v1/comments?company_slug=<slug>.
   *
   * `company_slug` is REQUIRED by spec; missing it returns 410 Gone with
   * `code: comments.use_company_path` (deprecated alias guard).
   */
  @TypedRoute.Get()
  async list(
    @Query('company_slug') companySlug: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CommentList | undefined> {
    if (!companySlug || companySlug.length === 0) {
      // Deprecated bare-aggregate use → 410 directing to company path.
      throw errors.useCompanyPath();
    }
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;
    const { body, etag, cacheControl } = await this.comments.listForCompanySlug({
      companySlug,
      cursor,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    if (res.locals.applyEtag?.(etag, cacheControl)) return undefined;
    return body;
  }
}
