import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class BatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.batch.findUnique({ where: { id } });
  }

  /**
   * Listing. Cursor pagination ordered by `demoDayAt DESC, id DESC`.
   * `id` is the deterministic tiebreaker (B8).
   */
  async findManyForList(args: {
    cursorDemoDayAt?: Date | null;
    cursorId?: string | null;
    limit: number;
  }) {
    const { cursorDemoDayAt, cursorId, limit } = args;
    const where: Prisma.BatchWhereInput | undefined =
      cursorDemoDayAt && cursorId
        ? {
            OR: [
              { demoDayAt: { lt: cursorDemoDayAt } },
              { demoDayAt: cursorDemoDayAt, id: { lt: cursorId } },
            ],
          }
        : undefined;

    return this.prisma.batch.findMany({
      where,
      orderBy: [{ demoDayAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        _count: { select: { companies: true } },
      },
    });
  }

  async countAll(): Promise<number> {
    return this.prisma.batch.count();
  }
}
