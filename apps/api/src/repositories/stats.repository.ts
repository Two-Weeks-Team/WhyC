import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Single-row read: most recent PublicStatsSnapshot.
   * Per SPEC.md §9, the rebuild cron upserts daily so this is O(1).
   */
  async findLatestSnapshot() {
    return this.prisma.publicStatsSnapshot.findFirst({
      orderBy: { generatedAt: 'desc' },
    });
  }

  async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
