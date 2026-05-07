import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Comments for a company. Cursor: `(postedAt DESC, id DESC)`.
   */
  async findManyForCompany(args: {
    companyId: string;
    cursorPostedAt?: Date | null;
    cursorId?: string | null;
    limit: number;
  }) {
    const { companyId, cursorPostedAt, cursorId, limit } = args;
    const where: Prisma.CommentWhereInput = { companyId };
    if (cursorPostedAt && cursorId) {
      where.OR = [
        { postedAt: { lt: cursorPostedAt } },
        { postedAt: cursorPostedAt, id: { lt: cursorId } },
      ];
    }
    return this.prisma.comment.findMany({
      where,
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        company: { select: { slug: true } },
      },
    });
  }

  async countForCompany(companyId: string): Promise<number> {
    return this.prisma.comment.count({ where: { companyId } });
  }
}
