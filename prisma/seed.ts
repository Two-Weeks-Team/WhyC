/**
 * WhyC — deterministic dev seed.
 *
 * Conventions:
 * - NO faker. Every value is a literal so the seed is byte-stable across runs.
 *   This is required by SPEC §11 reproducibility commitments and lets CI assert
 *   the seed snapshot via SHA-256.
 * - Slugs use the synthetic stem `tbd-w26-NN` (lowercased ASCII, hyphenated)
 *   per the SC4-medium normalization rule. Real YC company names are NOT used
 *   here because we cannot verify them inside this scaffold; the WK3 scrape
 *   phase replaces this row-set under PR review (see prisma/README.md).
 * - All description fields point at a placeholder workatastartup URL that
 *   matches the Postgres CHECK regex `^https?://`. The text body is the
 *   literal `[TBD …]` marker — the CHECK constraint accepts it because text
 *   is non-null AND source_url is a valid http URL.
 * - All money values are USD-cents (BigInt). All datetimes are UTC ISO-8601 Z.
 *
 * Run with: `pnpm db:seed`  (calls `tsx prisma/seed.ts`).
 */

import {
  PrismaClient,
  CompanyStatus,
  RunStatus,
  TakedownState,
  CommentKind,
  SpecFitState,
  JudgeVerdictLabel,
  RegenFlow,
} from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Static fixtures
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-05-07T12:00:00.000Z');

const BATCHES = [
  { label: 'W25', demoDay: '2025-03-20' },
  { label: 'S25', demoDay: '2025-09-18' },
  { label: 'W26', demoDay: '2026-03-19' },
] as const;

// 12 anonymized synthetic companies. Real names land in WK3 scrape (see README).
// Each entry MUST be reviewable by an editor; numbers/dates only.
const COMPANIES: Array<{
  slug: string;
  name: string; // text-only (M4) — synthetic placeholder
  batchLabel: 'W25' | 'S25' | 'W26';
  hires: number;
  status: CompanyStatus;
}> = [
  { slug: 'tbd-w26-01', name: 'Acme Robotics (TBD)',     batchLabel: 'W26', hires: 14, status: CompanyStatus.converged },
  { slug: 'tbd-w26-02', name: 'Birch Health (TBD)',      batchLabel: 'W26', hires:  9, status: CompanyStatus.deployed },
  { slug: 'tbd-w26-03', name: 'Cinder Logistics (TBD)',  batchLabel: 'W26', hires:  7, status: CompanyStatus.deployed },
  { slug: 'tbd-w26-04', name: 'Drift Studios (TBD)',     batchLabel: 'W26', hires: 11, status: CompanyStatus.building },
  { slug: 'tbd-s25-05', name: 'Ember Dataworks (TBD)',   batchLabel: 'S25', hires:  6, status: CompanyStatus.converged },
  { slug: 'tbd-s25-06', name: 'Forge Education (TBD)',   batchLabel: 'S25', hires:  4, status: CompanyStatus.deployed },
  { slug: 'tbd-s25-07', name: 'Glade Finance (TBD)',     batchLabel: 'S25', hires: 18, status: CompanyStatus.no_go },
  { slug: 'tbd-s25-08', name: 'Halt Insurance (TBD)',    batchLabel: 'S25', hires:  3, status: CompanyStatus.no_go },
  { slug: 'tbd-w25-09', name: 'Iron Compute (TBD)',      batchLabel: 'W25', hires: 22, status: CompanyStatus.converged },
  { slug: 'tbd-w25-10', name: 'Jade Bio (TBD)',          batchLabel: 'W25', hires:  5, status: CompanyStatus.deployed },
  { slug: 'tbd-w25-11', name: 'Knot Devices (TBD)',      batchLabel: 'W25', hires:  8, status: CompanyStatus.failed },
  { slug: 'tbd-w25-12', name: 'Lumen AI Tools (TBD)',    batchLabel: 'W25', hires: 12, status: CompanyStatus.converged },
];

// 30-line LLM-as-judge prompt body (v1). Frozen forever — version bumps create
// new rows, never edit. SHA-256 is computed over this exact byte sequence.
const JUDGE_PROMPT_V1_BODY = `# WhyC LLM-as-Judge Prompt — v1

You are an automated reviewer for the WhyC pipeline. Your job is to score a
single iteration on four numeric axes in [0, 1] and emit a strict JSON verdict.

You receive:
- The persisted Spec (extracted from the company's job description).
- A snapshot of the deployed preview (URL, screenshots, route 200/non-200 map).
- The implementation manifest (file tree + entry points).

Score each axis on [0.0, 1.0]:
- extraction       — does the persisted Spec faithfully capture the JD?
- design           — does the deployed UI match the Spec's stated flows?
- implementation   — do the implemented flows behave as the Spec describes?
- deploy           — is the URL reachable, fast (TTFB < 3 s), 200-OK on routes?

Emit JSON only, with this exact shape (no prose, no markdown fences):

{
  "extraction":     <number 0..1>,
  "design":         <number 0..1>,
  "implementation": <number 0..1>,
  "deploy":         <number 0..1>,
  "label":          "pass" | "partial" | "fail",
  "notes":          "<= 280 chars, plain text, English only"
}

Label rules:
- pass    if every axis >= 0.80 AND deploy >= 0.90.
- fail    if any axis < 0.30 OR the deploy URL is not 200-OK.
- partial otherwise.

Treat the Spec as ground truth. Do not penalize the agent for omissions the
Spec itself did not require. Do not invent flows. Be terse.
`;

const JUDGE_PROMPT_V1_SHA256 = createHash('sha256')
  .update(JUDGE_PROMPT_V1_BODY, 'utf8')
  .digest('hex');

// 12 comments — ~1 per company, English, plausible reactions. Mix of
// public_quote (with source_url) and team_note. body_language defaults to 'en'.
const COMMENTS: Array<{
  companySlug: string;
  kind: CommentKind;
  body: string;
  authorHandle: string;
  sourceUrl: string | null;
  postedDaysAgo: number;
}> = [
  { companySlug: 'tbd-w26-01', kind: CommentKind.public_quote, body: 'Their public roadmap mentions a v1 ship in Q3.',         authorHandle: '@founder',     sourceUrl: 'https://news.ycombinator.com/item?id=tbd-1', postedDaysAgo: 3 },
  { companySlug: 'tbd-w26-01', kind: CommentKind.team_note,    body: 'Strong demo loop; spec-fit converged at iter 4.',          authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 1 },
  { companySlug: 'tbd-w26-02', kind: CommentKind.public_quote, body: 'Hiring page lists 9 open SWE roles as of last week.',      authorHandle: '@watcher',     sourceUrl: 'https://www.workatastartup.com/companies/tbd', postedDaysAgo: 2 },
  { companySlug: 'tbd-w26-03', kind: CommentKind.team_note,    body: 'Deploy succeeded but TTFB is borderline.',                 authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 4 },
  { companySlug: 'tbd-w26-04', kind: CommentKind.public_quote, body: 'Founders posted launch teaser; no shipping date yet.',     authorHandle: '@launchnotes', sourceUrl: 'https://news.ycombinator.com/item?id=tbd-4', postedDaysAgo: 5 },
  { companySlug: 'tbd-s25-05', kind: CommentKind.public_quote, body: 'Their public spec aligns closely with our extracted JD.',  authorHandle: '@spec-reader', sourceUrl: 'https://www.ycombinator.com/companies/tbd-5', postedDaysAgo: 12 },
  { companySlug: 'tbd-s25-06', kind: CommentKind.team_note,    body: 'Education domain — kept the JTBD narrow.',                 authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 7 },
  { companySlug: 'tbd-s25-07', kind: CommentKind.team_note,    body: 'No-go: cost ceiling tripped on the analyze pass.',         authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 9 },
  { companySlug: 'tbd-s25-08', kind: CommentKind.team_note,    body: 'No-go: regulated domain (insurance compliance).',          authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 10 },
  { companySlug: 'tbd-w25-09', kind: CommentKind.public_quote, body: 'Cited by an external blog as a fast-shipping team.',       authorHandle: '@externblog',  sourceUrl: 'https://example.com/blog/tbd-9',              postedDaysAgo: 21 },
  { companySlug: 'tbd-w25-10', kind: CommentKind.team_note,    body: 'Bio domain — keep the deploy URL gated by Cloud Armor.',   authorHandle: 'whyc-team',    sourceUrl: null,                                          postedDaysAgo: 18 },
  { companySlug: 'tbd-w25-12', kind: CommentKind.public_quote, body: 'Their JTBD reads as developer-tools rather than AI tools.', authorHandle: '@analyst',    sourceUrl: 'https://www.workatastartup.com/companies/tbd-12', postedDaysAgo: 6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function placeholderDescription(slug: string): {
  text: string;
  sourceUrl: string;
  language: string;
} {
  // Source URL matches the CHECK regex `^https?://`. Replace during WK3 scrape.
  return {
    text: `[TBD — replace with verified public-source citation during WK3 scrape phase for ${slug}]`,
    sourceUrl: `https://www.workatastartup.com/companies/${slug}`,
    language: 'en',
  };
}

async function main(): Promise<void> {
  console.log('[seed] starting deterministic seed at', NOW.toISOString());

  // ── 1) Wipe in dependency order. SPEC §11 requires reproducibility; safe in
  //       dev/test only — the script refuses to run if NODE_ENV=production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] refusing to run in production');
  }
  await prisma.takedownEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.iteration.deleteMany();
  await prisma.judgeVerdict.deleteMany();
  // Break the Run ↔ Company.currentRunId circle before deleting either side.
  await prisma.company.updateMany({ data: { currentRunId: null } });
  await prisma.run.deleteMany();
  await prisma.company.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.judgePrompt.deleteMany();
  await prisma.publicStatsSnapshot.deleteMany();

  // ── 2) Batches.
  const batchByLabel = new Map<string, string>();
  for (const b of BATCHES) {
    const row = await prisma.batch.create({
      data: {
        label: b.label,
        demoDayAt: new Date(b.demoDay + 'T00:00:00.000Z'),
        sourceUrl: `https://www.ycombinator.com/companies?batch=${b.label}`,
      },
    });
    batchByLabel.set(b.label, row.id);
  }
  console.log('[seed] inserted', batchByLabel.size, 'batches');

  // ── 3) JudgePrompt v1.
  await prisma.judgePrompt.create({
    data: {
      version: 'v1',
      bodyMarkdown: JUDGE_PROMPT_V1_BODY,
      bodyLanguage: 'en',
      sha256: JUDGE_PROMPT_V1_SHA256,
      frozenAt: new Date('2026-05-07T00:00:00.000Z'),
    },
  });
  console.log('[seed] inserted JudgePrompt v1, sha256=', JUDGE_PROMPT_V1_SHA256);

  // ── 4) Companies + (per-company) one Run + a small iteration tail.
  const companyIdBySlug = new Map<string, string>();
  for (let i = 0; i < COMPANIES.length; i++) {
    const c = COMPANIES[i];
    const desc = placeholderDescription(c.slug);
    const batchId = batchByLabel.get(c.batchLabel);
    if (!batchId) throw new Error(`[seed] missing batch ${c.batchLabel}`);

    const company = await prisma.company.create({
      data: {
        slug: c.slug,
        name: c.name,
        batchId,
        descriptionText: desc.text,
        descriptionSourceUrl: desc.sourceUrl,
        descriptionLanguage: desc.language,
        hiresPostedCount: BigInt(c.hires),
        lastHiresCheckAt: daysAgo(0),
        status: c.status,
        takedownState: TakedownState.active,
        version: BigInt(0),
      },
    });
    companyIdBySlug.set(c.slug, company.id);

    // Skip the run for companies that no_go'd at analyze (status=no_go) and
    // for `failed` (run aborted before producing useful iterations).
    if (c.status === CompanyStatus.no_go) continue;

    const runStartedAt = daysAgo(7 + (i % 5));
    const runStatus: RunStatus =
      c.status === CompanyStatus.converged ? RunStatus.converged
      : c.status === CompanyStatus.failed ? RunStatus.failed
      : RunStatus.running;

    const finalSpecFit =
      c.status === CompanyStatus.converged ? 0.94
      : c.status === CompanyStatus.deployed ? 0.81
      : c.status === CompanyStatus.building ? 0.62
      : c.status === CompanyStatus.failed ? 0.31
      : null;
    const finalSpecFitState: SpecFitState | null =
      c.status === CompanyStatus.converged ? SpecFitState.converged
      : c.status === CompanyStatus.deployed ? SpecFitState.near
      : c.status === CompanyStatus.building ? SpecFitState.below_floor
      : c.status === CompanyStatus.failed ? SpecFitState.below_floor
      : null;

    const run = await prisma.run.create({
      data: {
        companyId: company.id,
        kickoffKey: `${company.id}:seed-batch-2026-05-07`,
        startedAt: runStartedAt,
        completedAt: runStatus === RunStatus.running ? null : daysAgo(i % 3),
        status: runStatus,
        iterLimit: BigInt(7),
        costLimitCents: BigInt(500),
        totalCostCents: BigInt(120 + (i * 17) % 360),
        finalSpecFit,
        finalSpecFitState,
        currencyCode: 'USD',
        deployUrl:
          c.status === CompanyStatus.converged ||
          c.status === CompanyStatus.deployed
            ? `https://whyc-preview-seed-${i}.run.app`
            : null,
        deployExpiresAt:
          c.status === CompanyStatus.converged ||
          c.status === CompanyStatus.deployed
            ? new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
            : null,
        judgePromptVersion: 'v1',
      },
    });

    // Wire current_run on Company (B6 — single tx in prod; here sequential is fine).
    await prisma.company.update({
      where: { id: company.id },
      data: { currentRunId: run.id },
    });

    // 2 iterations per non-no_go company: idx 0 (initial) + idx 1 (regen).
    const iter0 = await prisma.iteration.create({
      data: {
        runId: run.id,
        idx: BigInt(0),
        startedAt: runStartedAt,
        endedAt: new Date(runStartedAt.getTime() + 6 * 60 * 1000),
        specFit: 0.55,
        specFitState: SpecFitState.below_floor,
        costCents: BigInt(60),
        currencyCode: 'USD',
        phoenixTraceId: `trace-seed-${i}-iter0`,
        phoenixTraceIds: [`trace-seed-${i}-iter0`],
      },
    });
    await prisma.iteration.create({
      data: {
        runId: run.id,
        idx: BigInt(1),
        parentIterId: iter0.id,
        regenFlow: RegenFlow.develop,
        startedAt: new Date(runStartedAt.getTime() + 7 * 60 * 1000),
        endedAt: new Date(runStartedAt.getTime() + 14 * 60 * 1000),
        specFit: finalSpecFit ?? 0.55,
        specFitState: finalSpecFitState ?? SpecFitState.near,
        costCents: BigInt(60),
        currencyCode: 'USD',
        phoenixTraceId: `trace-seed-${i}-iter1`,
        phoenixTraceIds: [`trace-seed-${i}-iter1`],
      },
    });
  }
  console.log('[seed] inserted', companyIdBySlug.size, 'companies + runs + iterations');

  // ── 5) Comments.
  for (const c of COMMENTS) {
    const companyId = companyIdBySlug.get(c.companySlug);
    if (!companyId) throw new Error(`[seed] unknown company slug ${c.companySlug}`);
    await prisma.comment.create({
      data: {
        companyId,
        kind: c.kind,
        body: c.body,
        bodyLanguage: 'en',
        authorHandle: c.authorHandle,
        sourceUrl: c.sourceUrl,
        postedAt: daysAgo(c.postedDaysAgo),
      },
    });
  }
  console.log('[seed] inserted', COMMENTS.length, 'comments');

  // ── 6) PublicStatsSnapshot for /api/v1/stats.
  const totalConverged = COMPANIES.filter((c) => c.status === CompanyStatus.converged).length;
  const totalNoGo = COMPANIES.filter((c) => c.status === CompanyStatus.no_go).length;
  await prisma.publicStatsSnapshot.create({
    data: {
      totalCompaniesIngested: BigInt(COMPANIES.length),
      totalRunsCompleted: BigInt(COMPANIES.length - totalNoGo),
      totalShipped: BigInt(totalConverged),
      totalNoGo: BigInt(totalNoGo),
      // Median values are placeholders representative of the seed set.
      medianShipTimeSeconds: BigInt(840),
      medianRunCostCents: BigInt(180),
      currencyCode: 'USD',
      generatedAt: NOW,
    },
  });
  console.log('[seed] inserted PublicStatsSnapshot');
  console.log('[seed] done');
}

main()
  .catch((err) => {
    console.error('[seed] FAILED', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
