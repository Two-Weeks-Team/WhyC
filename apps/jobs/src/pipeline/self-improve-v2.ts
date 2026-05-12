// Stage 7 (v2): self-improve + BigQuery learning + terminal hooks.
//
// Wraps the pure decideNext() with: (a) a learning-signal-aware regen-flow
// choice, (b) the on-cost-ceiling.py hook when spend crosses 80% of the limit
// (which may downgrade the next iteration to single-advocate mode), and (c) the
// terminal hooks — on-converge.py (writes the BigQuery-shaped run-outcome.json)
// on convergence, or a pattern line + outcome row on a ceiling hit.
//
// decideNextV2 stays a pure function (table-testable); selfImproveV2 is the
// side-effecting orchestration the dispatcher calls.
//
// Span: whyc.self_improve.v2

import { trace as otelTrace } from '@opentelemetry/api';
import { withSpan } from '../instrumentation/index.js';
import { decideNext, TAU_CONVERGE, type SelfImproveArgs } from './self-improve.js';
import { runHook, runDir, patchRunState, appendPattern, appendDecision, updateSessionHandoff } from '../util/memory.js';
import { recordRunOutcome } from '../util/bigquery-learning.js';
import type { LoopDecision, LearningSignal, JudgePanelOutput, TraceSummary, RunOutcomeRow, HookResult } from './types.js';

export interface SelfImproveV2Args extends SelfImproveArgs {
  /** Aggregate of prior runs for this company (cold start = empty). */
  learning?: LearningSignal | undefined;
}

/** Pure decision: same converge/ceiling rules as decideNext, but the regen-flow
 *  fallback chain is trace → judge → historically-hard flow → 'global'. */
export function decideNextV2(args: SelfImproveV2Args): LoopDecision {
  const base = decideNext(args);
  if (base.kind !== 'regen') return base;
  const traceFlow = args.trace?.trace_weakest_flow ?? null;
  const judgeFlow = args.judge.weakest_flow && args.judge.weakest_flow !== 'global' ? args.judge.weakest_flow : null;
  const learnedFlow = args.learning && args.learning.historically_hard_flows.length > 0 ? args.learning.historically_hard_flows[0]! : null;
  const flow = traceFlow ?? judgeFlow ?? learnedFlow ?? 'global';
  return { kind: 'regen', flow };
}

export interface SelfImproveV2RunArgs {
  runId: string;
  iterationId: string;
  companySlug: string;
  judge: JudgePanelOutput;
  trace?: TraceSummary | undefined;
  iter_idx: number;
  iter_limit: number;
  total_cost_cents: number;
  cost_limit_cents: number;
  learning?: LearningSignal | undefined;
  /** Total iterations consumed so far (for the outcome row). */
  iterations_used?: number | undefined;
  /** Flow regenerated most often this run, if tracked by the dispatcher. */
  most_regenerated_flow?: string | null | undefined;
}

export interface SelfImproveV2Result {
  decision: LoopDecision;
  /** Set when the cost-ceiling hook says to shrink the next iteration's fan-out. */
  downgrade: 'single_advocate' | null;
  /** The outcome row written on a terminal decision (converged | ceiling_hit). */
  outcome: RunOutcomeRow | null;
  hook_results: HookResult[];
}

export async function selfImproveV2(args: SelfImproveV2Args & SelfImproveV2RunArgs): Promise<SelfImproveV2Result> {
  return withSpan(
    'whyc.self_improve.v2',
    { 'whyc.run_id': args.runId, 'whyc.iter_idx': args.iter_idx, 'whyc.spec_fit': args.judge.spec_fit, 'whyc.tau_converge': TAU_CONVERGE },
    async () => {
      const dir = runDir(args.runId);
      const hookResults: HookResult[] = [];
      const decision = decideNextV2(args);
      void otelTrace.getActiveSpan()?.setAttribute('whyc.loop_decision', decision.kind);

      let downgrade: 'single_advocate' | null = null;
      let outcome: RunOutcomeRow | null = null;

      if (decision.kind === 'converged') {
        outcome = {
          run_id: args.runId,
          company_slug: args.companySlug,
          outcome: 'converged',
          final_spec_fit: args.judge.spec_fit,
          iterations: args.iterations_used ?? args.iter_idx + 1,
          cost_cents: args.total_cost_cents,
          most_regenerated_flow: args.most_regenerated_flow ?? null,
          terminated_at: new Date().toISOString(),
        };
        await recordRunOutcome(args.runId, outcome); // invokes on-converge.py
        patchRunState(args.runId, { status: 'converged', last_spec_fit: args.judge.spec_fit });
        updateSessionHandoff(args.runId, { status: 'converged', last_stage: 'self_improve', iter: args.iter_idx, logLine: `CONVERGED spec_fit=${args.judge.spec_fit.toFixed(4)}` });
        appendDecision(args.runId, `self-improve-v2: CONVERGED at spec_fit=${args.judge.spec_fit.toFixed(4)}`);
      } else if (decision.kind === 'ceiling_hit') {
        outcome = {
          run_id: args.runId,
          company_slug: args.companySlug,
          outcome: decision.reason === 'cost_limit' ? 'cost_limit' : 'iter_limit',
          final_spec_fit: args.judge.spec_fit,
          iterations: args.iterations_used ?? args.iter_idx + 1,
          cost_cents: args.total_cost_cents,
          most_regenerated_flow: args.most_regenerated_flow ?? null,
          terminated_at: new Date().toISOString(),
        };
        await recordRunOutcome(args.runId, outcome); // local record (outcome != 'converged' but the hook still writes it; BQ insert no-ops without GCP)
        patchRunState(args.runId, { status: 'ceiling_hit', last_spec_fit: args.judge.spec_fit });
        appendPattern(args.runId, `CEILING_HIT reason=${decision.reason} spec_fit=${args.judge.spec_fit.toFixed(4)} iters=${outcome.iterations} cost=${args.total_cost_cents}c`);
        updateSessionHandoff(args.runId, { status: 'ceiling_hit', last_stage: 'self_improve', iter: args.iter_idx, logLine: `CEILING_HIT (${decision.reason})` });
      } else {
        // regen — but first: are we close to the cost ceiling? consult the hook.
        if (args.total_cost_cents >= Math.floor(args.cost_limit_cents * 0.8)) {
          const ch = await runHook('on-cost-ceiling', [dir, String(args.total_cost_cents), String(args.cost_limit_cents)]);
          hookResults.push(ch);
          try {
            const d = JSON.parse(ch.stdout.trim().split('\n').filter(Boolean).pop() ?? '') as { action?: string; mode?: string };
            if (d.action === 'downgrade') downgrade = 'single_advocate';
            if (d.action === 'abort') return { decision: { kind: 'ceiling_hit', reason: 'cost_limit' }, downgrade: null, outcome: null, hook_results: hookResults };
          } catch { /* hook output unparseable — proceed without downgrade */ }
        }
        appendDecision(args.runId, `self-improve-v2: REGEN flow="${decision.flow}"${downgrade ? ' (downgraded to single-advocate)' : ''} spec_fit=${args.judge.spec_fit.toFixed(4)}`);
        updateSessionHandoff(args.runId, { status: 'iterating', last_stage: 'self_improve', iter: args.iter_idx, logLine: `regen ${decision.flow}` });
      }

      return { decision, downgrade, outcome, hook_results: hookResults };
    },
  );
}
