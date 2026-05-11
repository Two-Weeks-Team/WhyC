// Stage 5 (loop coordinator): self_improve
//
// Pure decision function. No side effects; the dispatcher calls this inline
// after each judge pass and acts on the returned LoopDecision. Kept pure so
// it's trivial to unit-test (import + table-driven assertions).
//
// SPEC §4 thresholds:
//   τ_converge = 0.92  → run.status = 'converged'
//   iter_limit hit OR cost_limit hit → run.status = 'ceiling_hit'
//   else → regen the judge-reported weakest flow

import type { JudgeOutput, LoopDecision, TraceSummary } from './types.js';

export const TAU_CONVERGE = 0.92;

export interface SelfImproveArgs {
  judge: Pick<JudgeOutput, 'spec_fit' | 'weakest_flow'>;
  iter_idx: number;          // 0-based ordinal of the iteration we just judged
  iter_limit: number;        // Run.iterLimit
  total_cost_cents: number;  // Run.totalCostCents (post-update)
  cost_limit_cents: number;  // Run.costLimitCents
  /** Phoenix MCP introspection result (M19 / SPEC §6 step 4).  Optional so
   *  the function still has a usable shape when introspect is skipped
   *  (e.g. Phoenix outage degraded path).  When present, `trace_weakest_flow`
   *  overrides judge.weakest_flow per the rules in `pipeline/introspect.ts`. */
  trace?: TraceSummary | undefined;
}

export function decideNext(args: SelfImproveArgs): LoopDecision {
  if (args.judge.spec_fit >= TAU_CONVERGE) {
    return { kind: 'converged' };
  }
  if (args.iter_idx + 1 >= args.iter_limit) {
    return { kind: 'ceiling_hit', reason: 'iter_limit' };
  }
  if (args.total_cost_cents >= args.cost_limit_cents) {
    return { kind: 'ceiling_hit', reason: 'cost_limit' };
  }
  // Trace-derived override (SPEC §6 step 4 — agent-initiated MCP query
  // can refine the regen target when observability disagrees with the
  // judge's verdict text).  Fallback chain: trace → judge → 'global'.
  const traceFlow = args.trace?.trace_weakest_flow ?? null;
  const flow = traceFlow ?? args.judge.weakest_flow ?? 'global';
  return { kind: 'regen', flow };
}
