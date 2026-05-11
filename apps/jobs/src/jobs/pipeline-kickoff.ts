// Cron / manual trigger: pipeline_kickoff.
//
// Selects up to 12 candidate companies and drives the full pipeline against
// each: analyze → go-no-go → develop → deploy → judge → self-improve loop.
//
// Idempotency: a Run row is keyed on `${companyId}:${batchLabel}` (B6). A
// duplicate kickoff with the same key is a no-op — we fetch the existing
// Run and skip. The partial-unique on (companyId, status IN pending|running)
// also enforces "one in-flight run per company"; we catch the unique-violation
// and treat it the same way.
//
// Span hierarchy:
//   whyc.cron.pipeline_kickoff
//     └── whyc.pipeline.run        (one per company)
//          └── whyc.analyze        (etc — emitted by stage modules)
//
// Dry-run: WHYC_DRY_RUN=true short-circuits Gemini calls and returns
// synthetic ProductSpec / JudgeOutput so we can integration-test the
// orchestration plumbing without burning credit.

import { CompanyStatus, NoGoReason, Prisma, RegenFlow, RunStatus } from '@prisma/client';
import { withSpan } from '../instrumentation/index.js';
import {
  closeIteration, loadRunContext, markRunStatus, prisma, recordIteration, withTotalCostUpdate,
} from '../util/db.js';
import { analyze } from '../pipeline/analyze.js';
import { goNoGo } from '../pipeline/go-no-go.js';
import { develop } from '../pipeline/develop.js';
import { deploy } from '../pipeline/deploy.js';
import { judge } from '../pipeline/judge.js';
import { introspect } from '../pipeline/introspect.js';
import { decideNext } from '../pipeline/self-improve.js';
import { StageError, type DevelopResult, type JudgeOutput, type NoGoCode, type ProductSpec, type TraceSummary } from '../pipeline/types.js';

const KICKOFF_BATCH_LABEL = process.env['WHYC_KICKOFF_BATCH'] ?? `kickoff-${new Date().toISOString().slice(0, 10)}`;
const DRY_RUN = process.env['WHYC_DRY_RUN'] === 'true';
const MAX_COMPANIES = 12;

interface CandidateCompany {
  id: string;
  slug: string;
  name: string;
  descriptionText: string | null;
  descriptionSourceUrl: string | null;
}

export async function run(): Promise<void> {
  await withSpan(
    'whyc.cron.pipeline_kickoff',
    { 'whyc.cron': 'pipeline-kickoff', 'whyc.batch_label': KICKOFF_BATCH_LABEL, 'whyc.dry_run': DRY_RUN },
    async () => {
      const candidates = await loadCandidates();
      if (candidates.length === 0) {
        console.log('[pipeline-kickoff] no candidates — exit');
        return;
      }
      console.log(`[pipeline-kickoff] candidates=${candidates.length} dry_run=${DRY_RUN}`);

      for (const company of candidates) {
        try {
          await runForCompany(company);
        } catch (err) {
          console.error(`[pipeline-kickoff] company=${company.slug} FAILED:`, err);
          // do not throw — let the rest of the batch proceed
        }
      }
    },
  );

  await prisma().$disconnect();
}

/** Stub-dataset filter: only operate on `tbd-*` slugs so this is safe to run
 *  against the placeholder seed. Real WK3 scrape phase replaces those rows. */
async function loadCandidates(): Promise<CandidateCompany[]> {
  const db = prisma();
  return db.company.findMany({
    where: {
      slug: { startsWith: 'tbd-' },
      status: { in: [CompanyStatus.ingested, CompanyStatus.no_go] },
      takedownState: 'active',
    },
    take: MAX_COMPANIES,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, slug: true, name: true,
      descriptionText: true, descriptionSourceUrl: true,
    },
  });
}

/** Single-company lifecycle. One outer span per company. */
async function runForCompany(company: CandidateCompany): Promise<void> {
  await withSpan(
    'whyc.pipeline.run',
    { 'whyc.company.slug': company.slug, 'whyc.company.id': company.id },
    async () => {
      const runRow = await ensureRun(company.id);
      if (runRow.alreadyDone) {
        console.log(`[pipeline-kickoff] company=${company.slug} run=${runRow.id} already settled (${runRow.status}) — skip`);
        return;
      }

      // Mark company as analyzing if it was 'ingested'.
      await prisma().company.updateMany({
        where: { id: company.id, status: CompanyStatus.ingested },
        data: { status: CompanyStatus.analyzing, currentRunId: runRow.id },
      });

      // ── iter 0: analyze + go/no-go + develop + deploy + judge ──────────
      const iter0 = await recordIteration(runRow.id, null, null);
      const ctx0 = await loadRunContext(runRow.id, iter0.id);

      // Stage 1: analyze
      const analyzeOut = await runAnalyze(ctx0.company);
      await withTotalCostUpdate(runRow.id, analyzeOut.cost_cents);

      // Stage 2: go/no-go
      const decision = await goNoGo({
        spec: analyzeOut.spec,
        iter_limit: Number(ctx0.run.iterLimit),
        cost_limit_cents: Number(ctx0.run.costLimitCents),
      });
      if (decision.verdict === 'no_go') {
        console.log(`[pipeline-kickoff] company=${company.slug} no_go code=${decision.code}`);
        await closeIteration(iter0.id, { cost_cents: analyzeOut.cost_cents });
        await markCompanyNoGo(company.id, decision.code);
        await markRunStatus(runRow.id, RunStatus.aborted);
        return;
      }

      // Stage 3+4+judge: develop → deploy → judge for iter 0
      const iter0Result = await runOneAttempt({
        runId: runRow.id,
        iterationId: iter0.id,
        spec: analyzeOut.spec,
        regen: null,
        priorDevelop: null,
        judgePromptVersion: ctx0.run.judgePromptVersion,
        costSoFar: analyzeOut.cost_cents,
        iterLimit: Number(ctx0.run.iterLimit),
        costLimit: Number(ctx0.run.costLimitCents),
        iterIdx: 0,
      });

      // Now drive the self-improve loop.
      let lastResult = iter0Result;
      let iterIdx = 1;
      while (lastResult.decision.kind === 'regen') {
        const parentId = lastResult.iterationId;
        const regenFlow = lastResult.decision.flow;
        const child = await recordIteration(runRow.id, parentId, RegenFlow.develop);
        const ctx = await loadRunContext(runRow.id, child.id);
        const result = await runOneAttempt({
          runId: runRow.id,
          iterationId: child.id,
          spec: analyzeOut.spec,
          regen: regenFlow,
          priorDevelop: lastResult.develop,
          judgePromptVersion: ctx.run.judgePromptVersion,
          costSoFar: Number(ctx.run.totalCostCents),
          iterLimit: Number(ctx.run.iterLimit),
          costLimit: Number(ctx.run.costLimitCents),
          iterIdx,
        });
        lastResult = result;
        iterIdx += 1;
      }

      // Settle the run.
      if (lastResult.decision.kind === 'converged') {
        await markRunStatus(runRow.id, RunStatus.converged, {
          final_spec_fit: lastResult.judge.spec_fit,
          deploy_url: lastResult.deployUrl,
          deploy_expires_at: new Date(lastResult.deployExpiresAt),
        });
        await prisma().company.update({
          where: { id: company.id },
          data: { status: CompanyStatus.converged },
        });
        console.log(`[pipeline-kickoff] company=${company.slug} CONVERGED spec_fit=${lastResult.judge.spec_fit.toFixed(3)}`);
      } else {
        // ceiling_hit
        await markRunStatus(runRow.id, RunStatus.ceiling_hit, {
          final_spec_fit: lastResult.judge.spec_fit,
          deploy_url: lastResult.deployUrl,
          deploy_expires_at: new Date(lastResult.deployExpiresAt),
        });
        await prisma().company.update({
          where: { id: company.id },
          data: { status: CompanyStatus.deployed },
        });
        console.log(`[pipeline-kickoff] company=${company.slug} CEILING_HIT reason=${lastResult.decision.reason}`);
      }
    },
  );
}

interface AttemptResult {
  iterationId: string;
  develop: DevelopResult;
  deployUrl: string;
  deployExpiresAt: string;
  judge: JudgeOutput;
  decision: ReturnType<typeof decideNext>;
  /** Phoenix MCP introspection summary, when the call succeeded. */
  trace?: TraceSummary | undefined;
}

interface AttemptArgs {
  runId: string;
  iterationId: string;
  spec: ProductSpec;
  regen: string | null;
  priorDevelop: DevelopResult | null;
  judgePromptVersion: string;
  costSoFar: number;
  iterLimit: number;
  costLimit: number;
  iterIdx: number;
}

/** One develop → deploy → judge → decide cycle. Used for iter 0 and every regen. */
async function runOneAttempt(args: AttemptArgs): Promise<AttemptResult> {
  // develop
  const developOut = DRY_RUN
    ? syntheticDevelop(args.spec)
    : await develop({
        spec: args.spec,
        ...(args.regen !== null ? { regen_flow: args.regen } : {}),
        // priorDevelop's manifest is opaque from this layer; we only carry forward
        // file counts via DevelopResult. The manifest itself is regenerated.
      });
  await withTotalCostUpdate(args.runId, developOut.cost_cents);

  // deploy
  const deployOut = await deploy({ run_id: args.runId, develop: developOut });

  // judge
  const judgeOut = DRY_RUN
    ? syntheticJudge(args.spec, args.iterIdx)
    : await judge({
        spec: args.spec,
        develop: developOut,
        deploy_url: deployOut.url,
        judge_prompt_version: args.judgePromptVersion,
      });
  const judgeCost = 'cost_cents' in judgeOut ? judgeOut.cost_cents : 0;
  await withTotalCostUpdate(args.runId, judgeCost);

  // Persist verdict and close the iteration. The FK lives on Iteration
  // (Iteration.judgeVerdictId) — JudgeVerdict only mirrors iteration_id as a
  // unique column. So we INSERT the verdict, then UPDATE the iteration to
  // point at it.
  const verdict = await prisma().judgeVerdict.create({
    data: {
      iterationId: args.iterationId,
      judgePromptVersion: judgeOut.judge_prompt_version,
      score: judgeOut.spec_fit,
      label: judgeOut.spec_fit >= 0.92 ? 'pass' : judgeOut.spec_fit >= 0.5 ? 'partial' : 'fail',
      verdictJson: judgeOut.axes as unknown as Prisma.InputJsonValue,
      traceId: judgeOut.trace_id,
    },
    select: { id: true },
  });
  await prisma().iteration.update({
    where: { id: args.iterationId },
    data: { judgeVerdictId: verdict.id },
  });
  await closeIteration(args.iterationId, {
    spec_fit: judgeOut.spec_fit,
    cost_cents: developOut.cost_cents + judgeCost,
    phoenix_trace_id: judgeOut.trace_id || null,
  });

  // Phoenix MCP introspection (SPEC §6 step 4 — Arize bonus criterion).
  // Agent reads its OWN trace tree back (M19) to refine the regen target.
  // Failure here is non-fatal: introspect returns an empty-shape summary
  // and self-improve falls back to judge.weakest_flow.
  let trace: TraceSummary | undefined;
  try {
    trace = await introspect({
      run_id: args.runId,
      judge_weakest_flow: judgeOut.weakest_flow,
    });
  } catch (err) {
    console.warn(`[pipeline-kickoff] introspect failed (non-fatal):`, err);
    trace = undefined;
  }

  // Pull the just-updated total for the loop decision.
  const totalCost = (await prisma().run.findUniqueOrThrow({
    where: { id: args.runId },
    select: { totalCostCents: true },
  })).totalCostCents;

  const decision = decideNext({
    judge: { spec_fit: judgeOut.spec_fit, weakest_flow: judgeOut.weakest_flow },
    iter_idx: args.iterIdx,
    iter_limit: args.iterLimit,
    total_cost_cents: Number(totalCost),
    cost_limit_cents: args.costLimit,
    ...(trace ? { trace } : {}),
  });

  return {
    iterationId: args.iterationId,
    develop: developOut,
    deployUrl: deployOut.url,
    deployExpiresAt: deployOut.expires_at,
    judge: judgeOut,
    decision,
    ...(trace ? { trace } : {}),
  };
}

/** Idempotent Run insert. Returns the run id and whether it was already settled. */
async function ensureRun(companyId: string): Promise<{ id: string; alreadyDone: boolean; status: RunStatus }> {
  const db = prisma();
  const kickoffKey = `${companyId}:${KICKOFF_BATCH_LABEL}`;
  try {
    const created = await db.run.create({
      data: {
        companyId,
        kickoffKey,
        startedAt: new Date(),
        status: RunStatus.running,
        judgePromptVersion: 'v1',
      },
      select: { id: true, status: true },
    });
    return { id: created.id, alreadyDone: false, status: created.status };
  } catch (err) {
    // Unique violation on kickoffKey OR partial-unique on (companyId, in-flight).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await db.run.findFirst({
        where: { OR: [{ kickoffKey }, { companyId, status: { in: [RunStatus.pending, RunStatus.running] } }] },
        select: { id: true, status: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!existing) throw err;
      const inFlight: RunStatus[] = [RunStatus.pending, RunStatus.running];
      const settled = !inFlight.includes(existing.status);
      return { id: existing.id, alreadyDone: settled, status: existing.status };
    }
    throw err;
  }
}

async function runAnalyze(company: { name: string; descriptionText: string | null; descriptionSourceUrl: string | null }): Promise<{ spec: ProductSpec; cost_cents: number }> {
  if (DRY_RUN) {
    return { spec: syntheticSpec(company.name), cost_cents: 1 };
  }
  // The seed dataset has placeholder description_text values; in production
  // the WK3 scraper populates real JD bodies. If absent we synthesize a
  // single-line stub so analyze can still run end-to-end.
  const body = company.descriptionText ?? `${company.name} — public posting body unavailable in this dataset.`;
  const url = company.descriptionSourceUrl ?? 'https://example.com/tbd';
  const out = await analyze({ source_url: url, body });
  return { spec: out.spec, cost_cents: out.cost_cents };
}

async function markCompanyNoGo(companyId: string, code: NoGoCode): Promise<void> {
  // Map our internal NoGoCode → DB enum NoGoReason. The DB enum was seeded
  // with a smaller vocabulary; collapse the extra codes to the closest match.
  const reason: NoGoReason =
    code === 'regulated_domain'   ? NoGoReason.regulated_domain
    : code === 'over_budget'      ? NoGoReason.cost_over_ceiling
    : code === 'over_complexity'  ? NoGoReason.complexity_over_ceiling
    : code === 'ip_safety_concern'? NoGoReason.ip_unsafe
    : code === 'hardware_bound'   ? NoGoReason.not_demoable
    : code === 'stealth'          ? NoGoReason.not_demoable
    :                                NoGoReason.not_demoable;
  await prisma().company.update({
    where: { id: companyId },
    data: { status: CompanyStatus.no_go, noGoReason: reason },
  });
}

// ── Dry-run synthetics ──────────────────────────────────────────────────────

function syntheticSpec(name: string): ProductSpec {
  return {
    pitch: `${name} helps small teams ship faster with an AI-powered workflow tool.`,
    persona: 'A solo founder running a 5-person seed-stage startup',
    jtbd_functional: 'Give me one place to plan, ship, and review weekly progress',
    flows: [
      { name: 'Plan week', trigger: 'User opens the app', outcome: 'Sees the week\'s checklist' },
      { name: 'Log update', trigger: 'User clicks "log"', outcome: 'Update appears on the timeline' },
      { name: 'Review week', trigger: 'User opens Friday view', outcome: 'Sees a generated summary' },
    ],
    surface: 'web',
    constraints: { regulated_domain: false, hardware_bound: false, stealth: false },
  };
}

function syntheticDevelop(spec: ProductSpec): DevelopResult {
  return {
    artifact_sha256: 'dryrun-' + spec.flows.map((f) => f.name).join('-'),
    artifact_gcs_uri: 'gs://placeholder/dry-run',
    per_flow: spec.flows.map((f) => ({ flow: f.name, files_written: 4 })),
    cost_cents: 0,
  };
}

function syntheticJudge(spec: ProductSpec, iterIdx: number): JudgeOutput & { cost_cents: number } {
  // Walk score upward each iteration so the loop converges deterministically
  // around iter 3, exercising both the regen path and the converged exit.
  const base = 0.65 + iterIdx * 0.10;
  const score = Math.min(0.97, base);
  const axes = [
    { axis: 'pitch_alignment' as const, score_0_1: score, weight: 0.20, rationale: 'dry-run' },
    { axis: 'flows_present' as const,   score_0_1: score, weight: 0.20, rationale: 'dry-run' },
    { axis: 'design_quality' as const,  score_0_1: score, weight: 0.45, rationale: 'dry-run' },
    { axis: 'implementation' as const,  score_0_1: score, weight: 0.15, rationale: 'dry-run' },
  ];
  const spec_fit = Math.round(score * 1.0 * 10000) / 10000;
  return {
    judge_prompt_version: 'v1',
    axes,
    spec_fit,
    weakest_flow: spec.flows[0]?.name ?? 'global',
    trace_id: `dryrun-trace-${iterIdx}`,
    cost_cents: 0,
  };
}

// Allow StageError to propagate as-is to callers; avoid silent swallow.
export { StageError };
