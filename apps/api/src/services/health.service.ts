import { Injectable } from '@nestjs/common';
import { StatsRepository } from '@/repositories/stats.repository';
import type { Health } from '@/dto/health.dto';
import { errors } from '@/util/errors';

@Injectable()
export class HealthService {
  constructor(private readonly statsRepo: StatsRepository) {}

  async getHealth(): Promise<Health> {
    const dbOk = await this.statsRepo.pingDb();
    if (!dbOk) {
      // /health is one of two endpoints permitted to emit 503 (the other is
      // /stats). Phoenix Cloud is NOT consulted live (B9).
      throw errors.dbUnavailable(5);
    }

    const now = new Date().toISOString();
    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? '1.0.0',
      commit_sha: process.env.GIT_SHA ?? undefined,
      db_ok: true,
      // phoenix_reachable is the LAST CACHED probe — refreshed by the
      // phoenix_health_probe cron (SPEC.md §9). NOT a live call from this
      // request handler. Until that cron is wired, default to undefined.
      phoenix_reachable: parsePhoenixCachedFlag(process.env.PHOENIX_REACHABLE_CACHED),
      server_time: now,
      checked_at: now,
    };
  }
}

function parsePhoenixCachedFlag(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}
