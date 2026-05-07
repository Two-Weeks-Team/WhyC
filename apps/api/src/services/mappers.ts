/**
 * Prisma row → DTO mappers. Centralized so all controllers/services agree on
 * field-by-field projection (especially the deploy_url omission rules + B5
 * meaningful_updated_at exclusion of last_hires_check_at).
 */

import type {
  Batch as DbBatch,
  Company as DbCompany,
  Comment as DbComment,
  Iteration as DbIteration,
  JudgeVerdict as DbJudgeVerdict,
  JudgePrompt as DbJudgePrompt,
  Run as DbRun,
} from '@prisma/client';

import type { Batch } from '@/dto/batch.dto';
import type { Comment, CommentKind } from '@/dto/comment.dto';
import type {
  Company,
  CompanyDescription,
  CompanyListItem,
} from '@/dto/company.dto';
import type {
  Iteration,
  IterationAudit,
  JudgeVerdict,
  SpecFitComponents,
} from '@/dto/iteration.dto';
import type { JudgePrompt } from '@/dto/judge.dto';
import type { Run, RunSummary } from '@/dto/run.dto';
import type {
  CompanyStatus,
  Links,
  NoGoReason,
  RegenFlow,
  RunStatus,
  SpecFitState,
  TakedownState,
} from '@/dto/common.dto';

const PHOENIX_CONSOLE_BASE =
  process.env.PHOENIX_CONSOLE_BASE ?? 'https://app.phoenix.arize.com/projects/whyc-prod/traces';

/** BigInt → number narrowing. All call sites are bounded by spec-imposed
 * minor-unit cents (≤500), seconds, or counters that fit in JS Number safely
 * for the demo dataset. */
function bn(v: bigint | number | null | undefined): number | undefined {
  if (v == null) return undefined;
  return typeof v === 'bigint' ? Number(v) : v;
}

function bnOrNull(v: bigint | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === 'bigint' ? Number(v) : v;
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function isoOrUndef(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

// ── Batch ─────────────────────────────────────────────────────────────────

export function mapBatch(
  row: DbBatch & { _count?: { companies: number } },
): Batch {
  return {
    id: row.id,
    label: row.label as Batch['label'],
    demo_day_at: row.demoDayAt.toISOString().slice(0, 10),
    source_url: row.sourceUrl ?? undefined,
    company_count: row._count?.companies ?? undefined,
    created_at: isoOrUndef(row.createdAt),
    updated_at: isoOrUndef(row.updatedAt),
    links: { self: `/api/v1/batches/${row.id}` },
  };
}

// ── Company ───────────────────────────────────────────────────────────────

function mapDescription(row: {
  descriptionText: string | null;
  descriptionSourceUrl: string | null;
  descriptionLanguage: string | null;
}): CompanyDescription | null {
  if (row.descriptionText == null) return null;
  // B11: text without source_url is illegal at DB level; defensive guard here
  // mirrors the integration test in test/integration/company-description.test.ts.
  if (!row.descriptionSourceUrl) return null;
  return {
    text: row.descriptionText,
    source_url: row.descriptionSourceUrl as CompanyDescription['source_url'],
    language: (row.descriptionLanguage ?? 'en') as CompanyDescription['language'],
  };
}

type CompanyWithRelations = DbCompany & {
  batch?: { id: string; label: string } | null;
  currentRun?: DbRun | null;
};

export function mapCompany(row: CompanyWithRelations): Company {
  const links: Links = {
    self: `/api/v1/companies/${row.slug}`,
    iterations: row.currentRun ? `/api/v1/runs/${row.currentRun.id}/iterations` : undefined,
  };
  if (row.currentRun) links.run = `/api/v1/runs/${row.currentRun.id}`;

  return {
    id: row.id,
    slug: row.slug as Company['slug'],
    name: row.name,
    name_pronunciation: row.namePronunciation ?? null,
    name_aria_label: row.nameAriaLabel ?? null,
    name_display_short: row.nameDisplayShort ?? null,
    batch_id: row.batchId,
    batch_label: row.batch?.label,
    description: mapDescription(row),
    hires_posted_count: bn(row.hiresPostedCount),
    last_hires_check_at: isoOrUndef(row.lastHiresCheckAt) as Company['last_hires_check_at'],
    status: row.status as CompanyStatus,
    no_go_reason: (row.noGoReason as NoGoReason | null) ?? null,
    takedown_state: row.takedownState as TakedownState,
    takedown_requested_at: isoOrNull(row.takedownRequestedAt) as Company['takedown_requested_at'],
    current_run: row.currentRun ? mapRunSummary(row.currentRun, row.slug) : null,
    version: bn(row.version) ?? 0,
    created_at: isoOrUndef(row.createdAt),
    updated_at: isoOrUndef(row.updatedAt),
    links,
  };
}

export function mapCompanyListItem(
  row: CompanyWithRelations,
): CompanyListItem {
  const links: Links = {
    self: `/api/v1/companies/${row.slug}`,
  };
  if (row.currentRun) {
    links.run = `/api/v1/runs/${row.currentRun.id}`;
    links.iterations = `/api/v1/runs/${row.currentRun.id}/iterations`;
  }
  return {
    id: row.id,
    slug: row.slug as CompanyListItem['slug'],
    name: row.name,
    name_aria_label: row.nameAriaLabel ?? null,
    batch_id: row.batchId,
    batch_label: row.batch?.label,
    hires_posted_count: bn(row.hiresPostedCount),
    status: row.status as CompanyStatus,
    takedown_state: row.takedownState as TakedownState,
    current_run: row.currentRun ? mapRunSummary(row.currentRun, row.slug) : null,
    links,
  };
}

/**
 * "Meaningful" updated_at for ETag derivation (B5).
 * EXPLICITLY excludes `last_hires_check_at` (the 6h refresh cron churns this
 * column without semantic change).
 */
export function meaningfulCompanyUpdatedAt(row: CompanyWithRelations): Date {
  // Use updatedAt (which is touched by status / takedown / description changes
  // but NOT by hires-check-only updates because the cron writes via a SQL
  // statement that updates only `hiresPostedCount` and `lastHiresCheckAt`
  // without bumping `updated_at` — see SPEC.md §7 + B5).
  return row.updatedAt;
}

// ── Run ───────────────────────────────────────────────────────────────────

type RunWithCompanyOpt = DbRun & {
  company?: { slug?: string | null } | null;
  _count?: { iterations: number };
};

export function mapRunSummary(
  row: DbRun,
  companySlug?: string | null,
  sparkline?: (number | null)[],
): RunSummary {
  const links: Links = {
    self: `/api/v1/runs/${row.id}`,
    iterations: `/api/v1/runs/${row.id}/iterations`,
  };
  if (companySlug) links.company = `/api/v1/companies/${companySlug}`;

  const out: RunSummary = {
    id: row.id,
    status: row.status as RunStatus,
    started_at: row.startedAt.toISOString(),
    completed_at: isoOrNull(row.completedAt) as RunSummary['completed_at'],
    final_spec_fit: row.finalSpecFit ?? null,
    spec_fit_state: (row.finalSpecFitState as SpecFitState | null) ?? undefined,
    total_cost_cents: bnOrNull(row.totalCostCents) as RunSummary['total_cost_cents'],
    currency_code: 'USD',
    deploy_url: deployUrlIfActive(row),
    deploy_expires_at: isoOrNull(row.deployExpiresAt) as RunSummary['deploy_expires_at'],
    company_slug: companySlug ?? null,
    links,
  };
  if (sparkline) {
    out.spec_fit_sparkline = sparkline as RunSummary['spec_fit_sparkline'];
  }
  return out;
}

export function mapRun(
  row: RunWithCompanyOpt,
  iterationCount: number,
  sparkline: (number | null)[],
): Run {
  const slug = row.company?.slug ?? null;
  const summary = mapRunSummary(row, slug, sparkline);
  return {
    ...summary,
    company_id: row.companyId,
    iter_limit: bn(row.iterLimit) as Run['iter_limit'],
    cost_limit_cents: bn(row.costLimitCents) as Run['cost_limit_cents'],
    judge_prompt_version: row.judgePromptVersion as Run['judge_prompt_version'],
    deploy_revoked_at: isoOrNull(row.deployRevokedAt) as Run['deploy_revoked_at'],
    deploy_revoked_confirmed_at: isoOrNull(
      row.deployRevokedConfirmedAt,
    ) as Run['deploy_revoked_confirmed_at'],
    iteration_count: iterationCount,
    kickoff_key: row.kickoffKey as Run['kickoff_key'],
  };
}

/**
 * Deploy URL gating (M6). Omitted when:
 *  - deploy_revoked_at is set, OR
 *  - deploy_expires_at < now()
 */
export function deployUrlIfActive(row: DbRun): string | null {
  if (!row.deployUrl) return null;
  if (row.deployRevokedAt) return null;
  if (row.deployExpiresAt && row.deployExpiresAt.getTime() < Date.now()) return null;
  return row.deployUrl;
}

/**
 * Terminal-status check for run (Cache-Control gating).
 */
export function isTerminalRunStatus(s: string): boolean {
  return s === 'converged' || s === 'ceiling_hit' || s === 'failed' || s === 'aborted';
}

/**
 * Whether the W:299 warning header should be sent (SPEC.md §6.6 / SC3 medium).
 */
export function runWarrantsConvergenceWarning(s: string): boolean {
  return s === 'ceiling_hit' || s === 'aborted';
}

// ── Iteration ─────────────────────────────────────────────────────────────

type IterationWithRun = DbIteration & {
  run?: { company?: { slug?: string | null } | null } | null;
};

export function mapIteration(row: IterationWithRun): Iteration {
  const slug = row.run?.company?.slug ?? null;
  const links: Links = {
    self: `/api/v1/iterations/${row.id}`,
    run: `/api/v1/runs/${row.runId}`,
    audit: `/api/v1/iterations/${row.id}/audit`,
  };
  if (slug) links.company = `/api/v1/companies/${slug}`;

  return {
    id: row.id,
    run_id: row.runId,
    company_slug: slug,
    idx: bn(row.idx) ?? 0,
    parent_iter_id: row.parentIterId ?? null,
    started_at: row.startedAt.toISOString(),
    ended_at: isoOrNull(row.endedAt) as Iteration['ended_at'],
    spec_fit: row.specFit ?? null,
    spec_fit_state: (row.specFitState as SpecFitState | null) ?? undefined,
    regen_flow: (row.regenFlow as RegenFlow | null) ?? null,
    cost_cents: bn(row.costCents) ?? 0,
    currency_code: 'USD',
    judge_verdict_id: row.judgeVerdictId ?? null,
    phoenix_trace_id: row.phoenixTraceId ?? null,
    phoenix_trace_ids: row.phoenixTraceIds ?? [],
    created_at: isoOrUndef(row.createdAt),
    updated_at: isoOrUndef(row.updatedAt),
    links,
  };
}

export function mapJudgeVerdict(row: DbJudgeVerdict): JudgeVerdict {
  return {
    id: row.id,
    iteration_id: row.iterationId,
    judge_prompt_version: row.judgePromptVersion as JudgeVerdict['judge_prompt_version'],
    score: row.score,
    spec_fit_state: (row.specFitState as SpecFitState | null) ?? undefined,
    label: row.label as JudgeVerdict['label'],
    verdict_json: row.verdictJson as Record<string, unknown>,
    trace_id: row.traceId ?? null,
    created_at: isoOrUndef(row.createdAt),
  };
}

export function mapIterationAudit(args: {
  iteration: IterationWithRun;
  verdict: DbJudgeVerdict | null;
}): IterationAudit {
  const { iteration, verdict } = args;
  const slug = iteration.run?.company?.slug ?? null;

  // Build the deep link (B9: NO live Phoenix call — just template the trace_id).
  let consoleUrl: string | undefined;
  if (iteration.phoenixTraceId) {
    consoleUrl = `${PHOENIX_CONSOLE_BASE}/${encodeURIComponent(iteration.phoenixTraceId)}`;
  }

  const links: Links = {
    self: `/api/v1/iterations/${iteration.id}/audit`,
    run: `/api/v1/runs/${iteration.runId}`,
    iterations: `/api/v1/runs/${iteration.runId}/iterations`,
  };
  if (slug) links.company = `/api/v1/companies/${slug}`;
  if (verdict) links.verdict = `/api/v1/iterations/${iteration.id}`;

  // Spec-fit components from verdict_json (per SPEC.md §4 verdict shape).
  let components: SpecFitComponents | undefined;
  if (verdict && verdict.verdictJson && typeof verdict.verdictJson === 'object') {
    const v = verdict.verdictJson as Record<string, unknown>;
    components = {
      axis_extraction: typeof v.extraction === 'number' ? v.extraction : undefined,
      axis_design: typeof v.design === 'number' ? v.design : undefined,
      axis_implementation: typeof v.implementation === 'number' ? v.implementation : undefined,
      axis_deploy: typeof v.deploy === 'number' ? v.deploy : undefined,
    };
  }

  return {
    iteration_id: iteration.id,
    phoenix_trace_ids: iteration.phoenixTraceIds ?? [],
    phoenix_project: 'whyc-prod',
    phoenix_console_url: consoleUrl,
    judge_verdict: verdict ? mapJudgeVerdict(verdict) : undefined,
    spec_fit_components: components,
    links,
  };
}

// ── Judge prompt ──────────────────────────────────────────────────────────

export function mapJudgePrompt(row: DbJudgePrompt): JudgePrompt {
  return {
    version: row.version as JudgePrompt['version'],
    body: {
      text: row.bodyMarkdown,
      language: row.bodyLanguage as JudgePrompt['body']['language'],
    },
    sha256: row.sha256 as JudgePrompt['sha256'],
    frozen_at: row.frozenAt.toISOString(),
  };
}

// ── Comment ───────────────────────────────────────────────────────────────

type CommentWithCompany = DbComment & {
  company?: { slug?: string | null } | null;
};

export function mapComment(row: CommentWithCompany): Comment {
  const slug = row.company?.slug ?? null;
  const links: Links = { self: `/api/v1/comments?company_slug=${slug ?? ''}` };
  if (slug) links.company = `/api/v1/companies/${slug}`;

  return {
    id: row.id,
    company_id: row.companyId,
    company_slug: slug,
    kind: row.kind as CommentKind,
    body: {
      text: row.body,
      language: row.bodyLanguage as Comment['body']['language'],
    },
    author_handle: row.authorHandle ?? null,
    source_url: (row.sourceUrl as Comment['source_url']) ?? null,
    posted_at: row.postedAt.toISOString(),
    links,
  };
}
