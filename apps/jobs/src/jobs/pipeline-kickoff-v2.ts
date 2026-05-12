// Pipeline orchestrator (v2) — "PDD on Runtime".
//
// Wires the v2 stages end-to-end with the hook layer between every transition:
//
//   seedRunDir
//     → Stage 1  analyze-v2      (3 Flash advocates → I2 dedup → Pro synth)
//     → Stage 2  go-no-go-v2     (6 rules + IP-safety eval)         [no_go ⇒ stop]
//     → loop {
//         Stage 3  develop-v2     (5 Pro advocates → dedup → cross-pick)
//         Stage 4  deploy         (v1 stub URL; real Cloud Build/Run is Phase 6)
//                  [pre-deploy hook: winner manifest SHA-256 unchanged]
//         Stage 5  judge-v2       (5-critic panel + category-gate-security)
//         Stage 6  introspect-v2  (Phoenix self-query → TraceSummary)
//         Stage 7  self-improve-v2 (decideNextV2 + on-converge / on-cost-ceiling)
//       } until converged | ceiling_hit
//
// Postgres is not touched here — the v2 stages persist their state into the run
// directory (runs/<id>/...), which is the replayable record. Wiring this into
// the existing Postgres-backed dispatcher (pipeline-kickoff.ts) behind a flag is
// a small follow-up; this module is the self-contained, dry-run-testable
// orchestrator the v4 plan's Phase 8 calls for.
//
// Span: whyc.pipeline.v2

import { withSpan } from '../instrumentation/index.js';
import { seedRunDir, patchRunState, runDir, runHook, updateSessionHandoff } from '../util/memory.js';
import { loadLearningSignal } from '../util/bigquery-learning.js';
import { analyzeV2 } from '../pipeline/analyze-v2.js';
import { goNoGoV2 } from '../pipeline/go-no-go-v2.js';
import { developV2 } from '../pipeline/develop-v2.js';
import { judgeV2 } from '../pipeline/judge-v2.js';
import { introspectV2 } from '../pipeline/introspect-v2.js';
import { selfImproveV2 } from '../pipeline/self-improve-v2.js';
import { StageError, type GoNoGoDecision } from '../pipeline/types.js';

export interface KickoffV2Args {
  runId: string;
  companySlug: string;
  sourceUrl: string;
  body: string;
  iterLimit?: number;
  costLimitCents?: number;
  dryRun?: boolean;
}

export interface KickoffV2Result {
  status: 'converged' | 'ceiling_hit' | 'no_go';
  no_go?: GoNoGoDecision;
  iterations: number;
  total_cost_cents: number;
  final_spec_fit: number | null;
  run_dir: string;
}

function isDryRun(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env['WHYC_DRY_RUN'] === 'true' || !process.env['GOOGLE_CLOUD_PROJECT'];
}

export async function pipelineKickoffV2(args: KickoffV2Args): Promise<KickoffV2Result> {
  const dry = isDryRun(args.dryRun);
  const iterLimit = args.iterLimit ?? 7;
  const costLimitCents = args.costLimitCents ?? 500;
  const dir = runDir(args.runId);

  return withSpan(
    'whyc.pipeline.v2',
    { 'whyc.run_id': args.runId, 'whyc.company_slug': args.companySlug, 'whyc.dry_run': dry, 'whyc.iter_limit': iterLimit, 'whyc.cost_limit_cents': costLimitCents },
    async () => {
      seedRunDir(args.runId, { iteration_id: `${args.runId}-iter-0`, company_slug: args.companySlug, iter_limit: iterLimit, cost_limit_cents: costLimitCents });
      updateSessionHandoff(args.runId, { status: 'starting', last_stage: '', iter: 0, logLine: `kickoff company=${args.companySlug} dry=${dry}` });

      let totalCost = 0;
      const learning = await loadLearningSignal(args.companySlug);

      // ── Stage 1: analyze ──
      const a = await analyzeV2({ source_url: args.sourceUrl, body: args.body, runId: args.runId, iterationId: `${args.runId}-iter-0`, companySlug: args.companySlug, dryRun: dry });
      totalCost += a.cost_cents;

      // ── Stage 2: go/no-go ──
      const g = await goNoGoV2({ spec: a.spec, runId: args.runId, iterationId: `${args.runId}-iter-0`, iter_limit: iterLimit, cost_limit_cents: costLimitCents, dryRun: dry });
      totalCost += g.cost_cents;
      patchRunState(args.runId, { total_cost_cents: totalCost });
      if (g.decision.verdict === 'no_go') {
        patchRunState(args.runId, { status: 'no_go' });
        updateSessionHandoff(args.runId, { status: 'no_go', last_stage: 'go_no_go', iter: 0, logLine: `NO_GO ${g.decision.code}` });
        return { status: 'no_go', no_go: g.decision, iterations: 0, total_cost_cents: totalCost, final_spec_fit: null, run_dir: dir };
      }

      // ── loop ──
      let advocateMode: 'multi' | 'single' = 'multi';
      let priorManifestSha: string | undefined;
      let mostRegen: string | null = null;
      let lastSpecFit: number | null = null;

      for (let iter = 0; iter < iterLimit; iter++) {
        const iterationId = `${args.runId}-iter-${iter}`;
        patchRunState(args.runId, { iteration_id: iterationId, iter });

        // Stage 3: develop
        const d = await developV2({ spec: a.spec, runId: args.runId, iterationId, advocateMode, ...(priorManifestSha ? { priorManifestSha256: priorManifestSha } : {}), dryRun: dry });
        priorManifestSha = d.result.manifest_sha256;
        totalCost += d.cost_cents;

        // Stage 4: deploy (v1 stub — Phase 6 makes this a real Cloud Build + Cloud Run)
        const deployUrl = `https://${args.companySlug}-r${iter}.preview.example.run.app`; // synthetic; replaced in Phase 6
        const pd = await runHook('pre-deploy', [dir, d.result.manifest_sha256]);
        if (pd.exit_code !== 0) {
          throw new StageError('deploy', 'deploy.pre_hook_refused', `pre-deploy hook refused (manifest tamper?): ${pd.stderr || pd.stdout}`, false);
        }

        // Stage 5: judge
        const j = await judgeV2({ spec: a.spec, develop: d.result, deploy_url: deployUrl, runId: args.runId, iterationId, dryRun: dry });
        totalCost += j.cost_cents;
        lastSpecFit = j.verdict.spec_fit;

        // Stage 6: introspect
        const ins = await introspectV2({ runId: args.runId, iterationId, judge: j.verdict, dryRun: dry });

        patchRunState(args.runId, { total_cost_cents: totalCost });

        // Stage 7: self-improve
        const si = await selfImproveV2({
          runId: args.runId, iterationId, companySlug: args.companySlug,
          judge: j.verdict, trace: ins.trace, iter_idx: iter, iter_limit: iterLimit,
          total_cost_cents: totalCost, cost_limit_cents: costLimitCents, learning,
          iterations_used: iter + 1, most_regenerated_flow: mostRegen,
        });
        if (si.downgrade === 'single_advocate') advocateMode = 'single';

        if (si.decision.kind === 'converged') {
          return { status: 'converged', iterations: iter + 1, total_cost_cents: totalCost, final_spec_fit: lastSpecFit, run_dir: dir };
        }
        if (si.decision.kind === 'ceiling_hit') {
          return { status: 'ceiling_hit', iterations: iter + 1, total_cost_cents: totalCost, final_spec_fit: lastSpecFit, run_dir: dir };
        }
        mostRegen = si.decision.flow;
      }

      // ran out of iterations without a terminal decision (shouldn't happen —
      // decideNext returns ceiling_hit at iter_limit — but be defensive)
      patchRunState(args.runId, { status: 'ceiling_hit' });
      return { status: 'ceiling_hit', iterations: iterLimit, total_cost_cents: totalCost, final_spec_fit: lastSpecFit, run_dir: dir };
    },
  );
}
