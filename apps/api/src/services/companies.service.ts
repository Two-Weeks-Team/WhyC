import { Injectable } from '@nestjs/common';
import { CompaniesRepository, type CompanyListSort } from '@/repositories/companies.repository';
import { mapCompany, mapCompanyListItem, meaningfulCompanyUpdatedAt } from '@/services/mappers';
import { buildPageEnvelope, clampLimit } from '@/services/page.helper';
import { decodeCursor, encodeCursor } from '@/util/cursor';
import { buildEtag, filterHash, totalEstimateBucket } from '@/util/etag';
import type { Company, CompanyList } from '@/dto/company.dto';
import type { AvailableSort, AppliedSort, CompanyStatus } from '@/dto/common.dto';
import { errors } from '@/util/errors';

const ALLOWED_SORTS: ReadonlyArray<{
  field: CompanyListSort['field'];
  label: string;
}> = [
  { field: 'name', label: 'Name' },
  { field: 'final_spec_fit', label: 'Spec-fit' },
  { field: 'started_at', label: 'Started' },
  { field: 'total_cost_cents', label: 'Cost' },
  { field: 'hires_posted_count', label: 'Hires' },
];

const AVAILABLE_SORTS: AvailableSort[] = ALLOWED_SORTS.map((s) => ({
  field: s.field,
  label: s.label,
}));

const SORT_FIELD_PATTERN = /^-?[a-z_]+(,-?[a-z_]+){0,3}$/;
const COMPANY_STATUSES: ReadonlySet<string> = new Set([
  'ingested',
  'analyzing',
  'no_go',
  'building',
  'deployed',
  'converged',
  'failed',
]);

@Injectable()
export class CompaniesService {
  constructor(private readonly repo: CompaniesRepository) {}

  async getBySlug(
    slug: string,
  ): Promise<{ body: Company; etag: string; cacheControl: string }> {
    const row = await this.repo.findBySlug(slug);
    if (!row) throw errors.companyNotFound(slug);
    if (row.takedownState === 'removed') throw errors.companyTakedownRemoved();

    const body = mapCompany(row);
    // ETag uses meaningful_updated_at (B5 — excludes last_hires_check_at).
    const etag = buildEtag({
      kind: 'id-updated-at',
      id: row.id,
      updatedAt: meaningfulCompanyUpdatedAt(row),
    });
    return { body, etag, cacheControl: 'public, max-age=60' };
  }

  async list(args: {
    batchId?: string;
    status?: string;
    includeRemoved?: boolean;
    sort?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ body: CompanyList; etag: string; cacheControl: string }> {
    const includeRemoved = !!args.includeRemoved;

    // ── Validate status filter ──────────────────────────────────────────
    let statusFilter: CompanyStatus | undefined;
    if (args.status !== undefined) {
      if (!COMPANY_STATUSES.has(args.status)) {
        throw errors.invalidParam(`Unknown status='${args.status}'.`);
      }
      statusFilter = args.status as CompanyStatus;
    }

    // 422: mutually exclusive combo. (`status=removed` doesn't exist as a
    // CompanyStatus, but if someone tries `?include_removed=false` with a
    // takedown-related filter we 422.) The OpenAPI lifecycle uses
    // takedown_state separately; we keep the example from §8.1 by rejecting
    // include_removed=false combined with anything that explicitly demands
    // removed rows.
    // (No first-class `removed` filter today; left as guardrail for v2.)

    // ── Parse sort ──────────────────────────────────────────────────────
    const sort = parseSort(args.sort);

    // ── Decode cursor (B8) ─────────────────────────────────────────────
    const cursor = decodeCursor<unknown[]>(args.cursor);
    const limit = clampLimit(args.limit);

    const rows = await this.repo.findManyForList({
      batchId: args.batchId,
      status: statusFilter,
      includeRemoved,
      sort,
      cursor: cursor ? { keys: cursor.k as unknown[], id: cursor.id } : null,
      limit,
    });
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const data = page.map(mapCompanyListItem);

    const totalEstimate = await this.repo.countForList({
      batchId: args.batchId,
      status: statusFilter,
      includeRemoved,
    });

    const last = page[page.length - 1];
    const nextCursor =
      hasNext && last
        ? encodeCursor({
            k: [readSortKey(last, sort[0]!)],
            id: last.id,
          })
        : null;

    const appliedSort: AppliedSort[] = sort.map((s) => ({
      field: s.field,
      direction: s.direction,
      label: ALLOWED_SORTS.find((a) => a.field === s.field)?.label ?? s.field,
      aria_description: `Sorted by ${
        ALLOWED_SORTS.find((a) => a.field === s.field)?.label ?? s.field
      }, ${s.direction === 'desc' ? 'descending' : 'ascending'}.`,
    }));

    const body: CompanyList = {
      ...buildPageEnvelope({
        hasNext,
        hasPrev: cursor !== null,
        startIndex: 1,
        endIndex: page.length,
        totalEstimate,
        appliedSort,
        availableSorts: AVAILABLE_SORTS,
        nextCursor,
        prevCursor: cursor ? '' : null,
      }),
      data,
    };

    const maxUpdatedAt = page.reduce(
      (acc, r) => {
        const u = meaningfulCompanyUpdatedAt(r);
        return u > acc ? u : acc;
      },
      new Date(0),
    );
    const etag = buildEtag({
      kind: 'collection',
      filterHash: filterHash({
        batch_id: args.batchId ?? null,
        status: statusFilter ?? null,
        include_removed: includeRemoved,
        sort: args.sort ?? '-final_spec_fit',
        cursor: args.cursor ?? null,
        limit,
      }),
      maxUpdatedAt,
      totalBucket: totalEstimateBucket(totalEstimate),
    });

    return { body, etag, cacheControl: 'public, max-age=60' };
  }

  async listRunsForCompany(slug: string): Promise<{ companyId: string; companySlug: string }> {
    const row = await this.repo.findBySlug(slug);
    if (!row) throw errors.companyNotFound(slug);
    if (row.takedownState === 'removed') throw errors.companyTakedownRemoved();
    return { companyId: row.id, companySlug: row.slug };
  }

  async getCommentsCompanyId(slug: string): Promise<string> {
    const row = await this.repo.findBySlug(slug);
    if (!row) throw errors.companyNotFound(slug);
    if (row.takedownState === 'removed') throw errors.companyTakedownRemoved();
    return row.id;
  }
}

function parseSort(raw: string | undefined): CompanyListSort[] {
  const value = raw && raw.length > 0 ? raw : '-final_spec_fit';
  if (!SORT_FIELD_PATTERN.test(value)) {
    throw errors.invalidSort(
      `Sort syntax invalid: '${value}'. Allowed pattern: '^-?[a-z_]+(,-?[a-z_]+){0,3}$'.`,
    );
  }

  const allowed = new Set(ALLOWED_SORTS.map((s) => s.field));
  const parts = value.split(',');
  if (parts.length === 0) {
    throw errors.invalidSort(`Sort empty: '${value}'.`);
  }
  return parts.map((p) => {
    const direction: 'asc' | 'desc' = p.startsWith('-') ? 'desc' : 'asc';
    const field = (p.startsWith('-') ? p.slice(1) : p) as CompanyListSort['field'];
    if (!allowed.has(field)) {
      throw errors.invalidSort(
        `Unknown sort field '${field}'. Allowed: ${Array.from(allowed).join(', ')}.`,
      );
    }
    return { field, direction };
  });
}

function readSortKey(
  row: Awaited<ReturnType<CompaniesRepository['findManyForList']>>[number],
  sort: CompanyListSort,
): string | number | null {
  switch (sort.field) {
    case 'name':
      return row.name;
    case 'hires_posted_count':
      return Number(row.hiresPostedCount);
    case 'final_spec_fit':
      return row.currentRun?.finalSpecFit ?? null;
    case 'started_at':
      return row.currentRun?.startedAt.toISOString() ?? null;
    case 'total_cost_cents':
      return row.currentRun?.totalCostCents == null
        ? null
        : Number(row.currentRun.totalCostCents);
  }
}
