// Stage 2: go_no_go
//
// Pure function over the ProductSpec. No LLM call here — the four predicates
// from SPEC.md §5 are deterministic. Wrapped in a span so Phoenix shows the
// stage in the trace tree even though it's cheap.
//
// Phoenix span: "whyc.go_no_go"

import { withSpan } from '../instrumentation/index.js';
import type { GoNoGoDecision, ProductSpec } from './types.js';

/** Heuristic estimators used both for the no_go thresholds and to seed the
 *  pipeline's rough budget. Coefficients are intentionally simple in v1 —
 *  the SPEC §5 mentions a future regression in /eval/cost_estimator.v1.json. */
export function estimateIterations(spec: ProductSpec): number {
  // 3 base + ⌈flows/2⌉. A 3-flow spec ≈ 5 iters (well under the limit of 7).
  return 3 + Math.ceil(spec.flows.length / 2);
}

export function estimateCostCents(spec: ProductSpec): number {
  // 50 base + 30 per flow. 3 flows ≈ 140 cents (= $1.40).
  return 50 + spec.flows.length * 30;
}

const IP_RED_FLAGS = ['verbatim', 'exact replica', '1:1', 'pixel-perfect clone'];

/** Heuristic 6: if the pitch advertises a verbatim copy of an existing UI,
 *  or 3+ flows describe reproducing existing UI elements, refuse on IP grounds. */
function ipSafetyFlagged(spec: ProductSpec): boolean {
  const haystack = spec.pitch.toLowerCase();
  if (IP_RED_FLAGS.some((flag) => haystack.includes(flag))) return true;
  const reproOutcomes = spec.flows.filter((f) =>
    /reproduc|replica|clone|copy of (the )?ui/i.test(f.outcome),
  ).length;
  return reproOutcomes >= 3;
}

export interface GoNoGoArgs {
  spec: ProductSpec;
  iter_limit: number;       // typically Run.iterLimit (default 7)
  cost_limit_cents: number; // typically Run.costLimitCents (default 500)
}

export async function goNoGo(args: GoNoGoArgs): Promise<GoNoGoDecision> {
  return withSpan(
    'whyc.go_no_go',
    {
      'whyc.flows.count': args.spec.flows.length,
      'whyc.constraints.regulated_domain': args.spec.constraints.regulated_domain,
      'whyc.constraints.hardware_bound': args.spec.constraints.hardware_bound,
      'whyc.constraints.stealth': args.spec.constraints.stealth,
    },
    async () => {
      // Short-circuit, in spec order.
      if (args.spec.constraints.regulated_domain) {
        return { verdict: 'no_go', code: 'regulated_domain', reason: 'spec.constraints.regulated_domain=true' };
      }
      if (args.spec.constraints.hardware_bound) {
        return { verdict: 'no_go', code: 'hardware_bound', reason: 'spec.constraints.hardware_bound=true' };
      }
      if (args.spec.constraints.stealth) {
        return { verdict: 'no_go', code: 'stealth', reason: 'spec.constraints.stealth=true' };
      }

      const iters = estimateIterations(args.spec);
      if (iters > args.iter_limit) {
        return {
          verdict: 'no_go',
          code: 'over_complexity',
          reason: `estimated ${iters} iterations > limit ${args.iter_limit}`,
        };
      }

      const cost = estimateCostCents(args.spec);
      if (cost > args.cost_limit_cents) {
        return {
          verdict: 'no_go',
          code: 'over_budget',
          reason: `estimated ${cost} cents > limit ${args.cost_limit_cents}`,
        };
      }

      if (ipSafetyFlagged(args.spec)) {
        return {
          verdict: 'no_go',
          code: 'ip_safety_concern',
          reason: 'pitch or ≥3 flow outcomes indicate verbatim reproduction of existing IP',
        };
      }

      return {
        verdict: 'go',
        estimated_iterations: iters,
        estimated_cost_cents: cost,
      };
    },
  );
}
