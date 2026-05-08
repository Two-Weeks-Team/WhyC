// Shared Prisma client + run/iteration lifecycle helpers.
//
// Why centralized: the Iteration.idx assignment protocol (H-Y1) and the
// total-cost ledger update (M7) both need to be done atomically and from
// exactly one code path. Stage modules MUST NOT touch Run/Iteration rows
// directly outside the helpers in this file (per types.ts contract note).

import { PrismaClient, type Prisma, RegenFlow, RunStatus } from '@prisma/client';
import type { RunContext } from '../pipeline/types.js';

// Singleton — every job module imports this one instance. Avoids exhausting
// the Cloud SQL connection pool when stages import each other.
let _prisma: PrismaClient | null = null;
export function prisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

/** Read all the row-level state a stage needs in one shot. The dispatcher
 *  always owns the Iteration row for the current attempt; we look it up by
 *  (runId, idx) which is uniquely indexed. */
export async function loadRunContext(runId: string, iterationId: string): Promise<RunContext> {
  const db = prisma();
  const run = await db.run.findUniqueOrThrow({
    where: { id: runId },
    select: {
      id: true, companyId: true, status: true,
      iterLimit: true, costLimitCents: true, totalCostCents: true,
      judgePromptVersion: true,
    },
  });
  const company = await db.company.findUniqueOrThrow({
    where: { id: run.companyId },
    select: { id: true, slug: true, name: true, descriptionText: true, descriptionSourceUrl: true },
  });
  const iteration = await db.iteration.findUniqueOrThrow({
    where: { id: iterationId },
    select: { id: true, idx: true, parentIterId: true, regenFlow: true },
  });

  // Latest verdict on this run (any iteration), used by self-improve to read
  // the previous score before deciding the next move.
  const lastVerdict = await db.judgeVerdict.findFirst({
    where: { iteration: { runId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, score: true, verdictJson: true },
  });

  return {
    run,
    company,
    iteration,
    ...(lastVerdict !== null ? { last_verdict: lastVerdict } : {}),
  };
}

/** H-Y1: insert a new Iteration row under SELECT FOR UPDATE on the Run row.
 *  Returns the new iteration's id. The dispatcher calls this once per attempt
 *  before invoking the stage chain. */
export async function recordIteration(
  runId: string,
  parentIterId: string | null,
  regenFlow: RegenFlow | null,
): Promise<{ id: string; idx: bigint }> {
  const db = prisma();
  return db.$transaction(async (tx) => {
    // Row-lock on the Run so a concurrent kickoff cannot allocate the same idx.
    await tx.$queryRaw`SELECT id FROM runs WHERE id = ${runId} FOR UPDATE`;
    const maxRow = await tx.iteration.aggregate({
      where: { runId },
      _max: { idx: true },
    });
    const nextIdx = (maxRow._max.idx ?? -1n) + 1n;
    const created = await tx.iteration.create({
      data: {
        runId,
        idx: nextIdx,
        parentIterId,
        regenFlow,
        startedAt: new Date(),
      },
      select: { id: true, idx: true },
    });
    return created;
  }, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
}

/** Close out an iteration: set ended_at, spec_fit, cost, phoenix trace. */
export async function closeIteration(
  iterationId: string,
  patch: { spec_fit?: number | null; cost_cents?: number; phoenix_trace_id?: string | null },
): Promise<void> {
  const db = prisma();
  const data: Prisma.IterationUpdateInput = { endedAt: new Date() };
  if (patch.spec_fit !== undefined && patch.spec_fit !== null) data.specFit = patch.spec_fit;
  if (patch.cost_cents !== undefined) data.costCents = BigInt(patch.cost_cents);
  if (patch.phoenix_trace_id !== undefined && patch.phoenix_trace_id !== null) {
    data.phoenixTraceId = patch.phoenix_trace_id;
  }
  await db.iteration.update({ where: { id: iterationId }, data });
}

/** Race-safe ledger increment for the cost ceiling (M7). UPDATE … SET col = col + delta
 *  in a single SQL statement so two concurrent stages cannot both read the
 *  pre-increment value and stomp each other. */
export async function withTotalCostUpdate(runId: string, deltaCents: number): Promise<bigint> {
  if (deltaCents < 0) throw new Error('withTotalCostUpdate: delta must be ≥ 0');
  const db = prisma();
  const rows = await db.$queryRaw<Array<{ total_cost_cents: bigint }>>`
    UPDATE runs
       SET total_cost_cents = total_cost_cents + ${BigInt(deltaCents)},
           updated_at = now()
     WHERE id = ${runId}
     RETURNING total_cost_cents
  `;
  const row = rows[0];
  if (!row) throw new Error(`withTotalCostUpdate: run ${runId} not found`);
  return row.total_cost_cents;
}

/** Terminal-state writers used by the dispatcher. Kept here so stages stay
 *  oblivious to RunStatus enum values. */
export async function markRunStatus(
  runId: string,
  status: RunStatus,
  patch: { final_spec_fit?: number; deploy_url?: string; deploy_expires_at?: Date } = {},
): Promise<void> {
  const db = prisma();
  const data: Prisma.RunUpdateInput = { status, completedAt: new Date() };
  if (patch.final_spec_fit !== undefined) data.finalSpecFit = patch.final_spec_fit;
  if (patch.deploy_url !== undefined) data.deployUrl = patch.deploy_url;
  if (patch.deploy_expires_at !== undefined) data.deployExpiresAt = patch.deploy_expires_at;
  await db.run.update({ where: { id: runId }, data });
}
