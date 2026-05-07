import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { CompanyStatus, Prisma } from '@prisma/client';

export type CompanySortField =
  | 'name'
  | 'final_spec_fit'
  | 'started_at'
  | 'total_cost_cents'
  | 'hires_posted_count';

export interface CompanyListSort {
  field: CompanySortField;
  direction: 'asc' | 'desc';
}

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    return this.prisma.company.findUnique({
      where: { slug },
      include: {
        batch: { select: { id: true, label: true } },
        currentRun: true,
      },
    });
  }

  async findBySlugWithRunCount(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      include: {
        batch: { select: { id: true, label: true } },
      },
    });
    if (!company) return null;
    return company;
  }

  /**
   * Dashboard list (B7 N+1 prevention).
   *
   * CRITICAL: `include: { currentRun: true }` is the entire point of the
   * `Company.currentRunId` denormalization (data-model.prisma `@unique`).
   * This forms a single LEFT JOIN — zero per-row run queries.
   *
   * Per SC6 B7: query plan must be ≤2 logical queries (1 for companies +
   * currentRun, 1 for total_estimate if not cached) regardless of row count.
   */
  async findManyForList(args: {
    batchId?: string;
    status?: CompanyStatus;
    includeRemoved: boolean;
    sort: CompanyListSort[];
    cursor: { keys: unknown[]; id: string } | null;
    limit: number;
  }) {
    const { batchId, status, includeRemoved, sort, cursor, limit } = args;

    const where: Prisma.CompanyWhereInput = {};
    if (batchId !== undefined) where.batchId = batchId;
    if (status !== undefined) where.status = status;
    if (!includeRemoved) where.takedownState = { not: 'removed' };

    // Cursor where-clause built from sort tuple (B8).
    if (cursor) {
      const cursorWhere = buildCursorWhere(sort, cursor);
      if (cursorWhere) where.AND = [cursorWhere];
    }

    const orderBy: Prisma.CompanyOrderByWithRelationInput[] = sort.map((s) => orderForSort(s));
    // Always tiebreak on id with same direction as primary sort.
    const tieDirection = sort[0]?.direction ?? 'desc';
    orderBy.push({ id: tieDirection });

    return this.prisma.company.findMany({
      where,
      include: {
        batch: { select: { id: true, label: true } },
        currentRun: true,
      },
      orderBy,
      take: limit + 1,
    });
  }

  async countForList(args: {
    batchId?: string;
    status?: CompanyStatus;
    includeRemoved: boolean;
  }): Promise<number> {
    const where: Prisma.CompanyWhereInput = {};
    if (args.batchId !== undefined) where.batchId = args.batchId;
    if (args.status !== undefined) where.status = args.status;
    if (!args.includeRemoved) where.takedownState = { not: 'removed' };
    return this.prisma.company.count({ where });
  }

  async countDescriptionRows(): Promise<number> {
    return this.prisma.company.count({ where: { descriptionText: { not: null } } });
  }

  async findAllWithDescriptions() {
    return this.prisma.company.findMany({
      where: { descriptionText: { not: null } },
      select: {
        id: true,
        slug: true,
        descriptionText: true,
        descriptionSourceUrl: true,
        descriptionLanguage: true,
      },
    });
  }
}

function orderForSort(s: CompanyListSort): Prisma.CompanyOrderByWithRelationInput {
  switch (s.field) {
    case 'name':
      return { name: s.direction };
    case 'hires_posted_count':
      return { hiresPostedCount: s.direction };
    case 'final_spec_fit':
      return { currentRun: { finalSpecFit: s.direction } };
    case 'started_at':
      return { currentRun: { startedAt: s.direction } };
    case 'total_cost_cents':
      return { currentRun: { totalCostCents: s.direction } };
  }
}

function buildCursorWhere(
  sort: CompanyListSort[],
  cursor: { keys: unknown[]; id: string },
): Prisma.CompanyWhereInput | null {
  // Single-key cursor only; multi-key sort builds nested OR chain.
  if (sort.length === 0) return null;
  const primary = sort[0]!;
  const value = cursor.keys[0];
  const op = primary.direction === 'desc' ? 'lt' : 'gt';

  const primaryStrict = primaryFieldStrictWhere(primary.field, value, op);
  const primaryEq = primaryFieldEqWhere(primary.field, value);
  if (!primaryStrict || !primaryEq) return null;

  return {
    OR: [
      primaryStrict,
      {
        AND: [primaryEq, { id: op === 'lt' ? { lt: cursor.id } : { gt: cursor.id } }],
      },
    ],
  };
}

function primaryFieldStrictWhere(
  field: CompanySortField,
  value: unknown,
  op: 'lt' | 'gt',
): Prisma.CompanyWhereInput | null {
  switch (field) {
    case 'name':
      return typeof value === 'string' ? { name: { [op]: value } } : null;
    case 'hires_posted_count':
      return typeof value === 'number' || typeof value === 'string'
        ? { hiresPostedCount: { [op]: BigInt(value as never) } }
        : null;
    case 'final_spec_fit':
      return typeof value === 'number' ? { currentRun: { finalSpecFit: { [op]: value } } } : null;
    case 'started_at':
      return typeof value === 'string'
        ? { currentRun: { startedAt: { [op]: new Date(value) } } }
        : null;
    case 'total_cost_cents':
      return typeof value === 'number' || typeof value === 'string'
        ? { currentRun: { totalCostCents: { [op]: BigInt(value as never) } } }
        : null;
  }
}

function primaryFieldEqWhere(
  field: CompanySortField,
  value: unknown,
): Prisma.CompanyWhereInput | null {
  switch (field) {
    case 'name':
      return typeof value === 'string' ? { name: value } : null;
    case 'hires_posted_count':
      return typeof value === 'number' || typeof value === 'string'
        ? { hiresPostedCount: BigInt(value as never) }
        : null;
    case 'final_spec_fit':
      return typeof value === 'number' ? { currentRun: { finalSpecFit: value } } : null;
    case 'started_at':
      return typeof value === 'string' ? { currentRun: { startedAt: new Date(value) } } : null;
    case 'total_cost_cents':
      return typeof value === 'number' || typeof value === 'string'
        ? { currentRun: { totalCostCents: BigInt(value as never) } }
        : null;
  }
}
