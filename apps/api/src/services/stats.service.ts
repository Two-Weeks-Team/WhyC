import { Injectable } from '@nestjs/common';
import { StatsRepository } from '@/repositories/stats.repository';
import type { PublicStats } from '@/dto/stats.dto';
import { errors } from '@/util/errors';
import { buildEtag } from '@/util/etag';

@Injectable()
export class StatsService {
  constructor(private readonly statsRepo: StatsRepository) {}

  async getStats(): Promise<{ body: PublicStats; etag: string; cacheControl: string }> {
    let snapshot;
    try {
      snapshot = await this.statsRepo.findLatestSnapshot();
    } catch {
      throw errors.dbUnavailable(5);
    }

    const now = new Date().toISOString();
    const generatedAt = snapshot?.generatedAt ?? new Date(0);

    const body: PublicStats = {
      total_companies_ingested: bigToNum(snapshot?.totalCompaniesIngested),
      total_runs_completed: bigToNum(snapshot?.totalRunsCompleted),
      total_shipped: bigToNum(snapshot?.totalShipped),
      total_no_go: bigToNum(snapshot?.totalNoGo),
      median_ship_time_seconds: bigToNum(snapshot?.medianShipTimeSeconds),
      median_run_cost_cents: bigToNum(snapshot?.medianRunCostCents),
      currency_code: 'USD',
      unit: {
        median_ship_time_seconds: 'seconds',
        median_run_cost_cents: 'usd_cents',
      },
      generated_at: generatedAt.toISOString(),
      server_time: now,
    };

    // Stats ETag = (snapshot.id, generatedAt). Snapshot rows are upserted once
    // per UTC day (SC5 medium daily-uniqueness invariant), so this only churns
    // at the nightly rebuild boundary.
    const etag = buildEtag({
      kind: 'id-updated-at',
      id: snapshot?.id ?? 'no-snapshot',
      updatedAt: generatedAt,
    });
    const cacheControl = 'public, max-age=3600, stale-while-revalidate=86400';

    return { body, etag, cacheControl };
  }
}

function bigToNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}
