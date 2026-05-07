import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class RunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.run.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            takedownState: true,
          },
        },
        _count: { select: { iterations: true } },
      },
    });
  }

  /**
   * Runs for a company (most recent first).
   * Cursor: `(startedAt DESC, id DESC)`.
   */
  async findManyForCompany(args: {
    companyId: string;
    cursorStartedAt?: Date | null;
    cursorId?: string | null;
    limit: number;
  }) {
    const { companyId, cursorStartedAt, cursorId, limit } = args;
    const where: Prisma.RunWhereInput = { companyId };
    if (cursorStartedAt && cursorId) {
      where.OR = [
        { startedAt: { lt: cursorStartedAt } },
        { startedAt: cursorStartedAt, id: { lt: cursorId } },
      ];
    }

    return this.prisma.run.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        company: { select: { slug: true } },
      },
    });
  }

  async countForCompany(companyId: string): Promise<number> {
    return this.prisma.run.count({ where: { companyId } });
  }

  /**
   * Spec-fit sparkline source: per-iteration spec_fit in idx order.
   * Capped at 7 entries (M7 iter_limit).
   */
  async findSparkline(runId: string): Promise<(number | null)[]> {
    const rows = await this.prisma.iteration.findMany({
      where: { runId },
      orderBy: { idx: 'asc' },
      take: 7,
      select: { specFit: true },
    });
    return rows.map((r) => r.specFit);
  }
}
