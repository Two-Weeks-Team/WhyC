import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class IterationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.iteration.findUnique({
      where: { id },
      include: {
        run: {
          select: {
            id: true,
            company: { select: { slug: true, takedownState: true } },
          },
        },
      },
    });
  }

  async findManyForRun(runId: string) {
    return this.prisma.iteration.findMany({
      where: { runId },
      orderBy: { idx: 'asc' },
      include: {
        run: { select: { company: { select: { slug: true } } } },
      },
    });
  }

  async countForRun(runId: string): Promise<number> {
    return this.prisma.iteration.count({ where: { runId } });
  }

  /**
   * AUDIT — pure DB read (B9). One JOIN to JudgeVerdict. NO Phoenix HTTP call.
   *
   * If you ever add an outbound Phoenix call here, the integration test
   * `iteration-audit.test.ts` will fail (it asserts the audit handler does
   * not import any Phoenix HTTP client at module init time).
   */
  async findAuditPayload(iterId: string) {
    return this.prisma.iteration.findUnique({
      where: { id: iterId },
      include: {
        judgeVerdict: true,
        run: {
          select: {
            id: true,
            company: { select: { slug: true, takedownState: true } },
          },
        },
      },
    });
  }
}
