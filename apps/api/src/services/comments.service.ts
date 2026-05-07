import { Injectable } from '@nestjs/common';
import { CommentsRepository } from '@/repositories/comments.repository';
import { CompaniesService } from '@/services/companies.service';
import { mapComment } from '@/services/mappers';
import { buildPageEnvelope, clampLimit } from '@/services/page.helper';
import { decodeCursor, encodeCursor } from '@/util/cursor';
import { buildEtag, filterHash, totalEstimateBucket } from '@/util/etag';
import { errors } from '@/util/errors';
import type { CommentList } from '@/dto/comment.dto';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly companiesService: CompaniesService,
  ) {}

  async listForCompanySlug(args: {
    companySlug: string;
    cursor: string | undefined;
    limit: number | undefined;
  }): Promise<{ body: CommentList; etag: string; cacheControl: string }> {
    if (!SLUG_PATTERN.test(args.companySlug)) {
      throw errors.invalidParam(`company_slug must match /^[a-z0-9][a-z0-9-]{0,63}$/.`);
    }
    const companyId = await this.companiesService.getCommentsCompanyId(args.companySlug);

    const limit = clampLimit(args.limit);
    const cursor = decodeCursor<[string, string]>(args.cursor);
    const cursorPostedAt = cursor ? new Date(cursor.k[0]) : null;
    const cursorId = cursor?.id ?? null;

    const rows = await this.repo.findManyForCompany({
      companyId,
      cursorPostedAt,
      cursorId,
      limit,
    });
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const data = page.map(mapComment);

    const totalEstimate = await this.repo.countForCompany(companyId);

    const last = page[page.length - 1];
    const nextCursor =
      hasNext && last
        ? encodeCursor<[string, string]>({
            k: [last.postedAt.toISOString(), last.id],
            id: last.id,
          })
        : null;

    const body: CommentList = {
      ...buildPageEnvelope({
        hasNext,
        hasPrev: cursor !== null,
        startIndex: 1,
        endIndex: page.length,
        totalEstimate,
        appliedSort: [
          {
            field: 'posted_at',
            direction: 'desc',
            label: 'Posted',
            aria_description: 'Sorted by post time, most recent first.',
          },
        ],
        availableSorts: [{ field: 'posted_at', label: 'Posted' }],
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
        company_slug: args.companySlug,
        cursor: args.cursor ?? null,
        limit,
      }),
      maxUpdatedAt,
      totalBucket: totalEstimateBucket(totalEstimate),
    });

    return { body, etag, cacheControl: 'public, max-age=60' };
  }
}
