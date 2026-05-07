/**
 * Deterministic spec-fit formula (SPEC.md §4, M11).
 *
 * Pure function over JudgeVerdict.verdict_json. NOT sampled, NOT stochastic,
 * NOT dependent on agent self-report. Re-derivable from the verdict alone.
 */

import type { SpecFitState } from '@/dto/common.dto';

export const SPEC_FIT_WEIGHTS = Object.freeze({
  extraction: 0.2,
  design: 0.2,
  implementation: 0.45,
  deploy: 0.15,
});

export const TAU_CONVERGE = 0.92;
export const TAU_FLOOR = 0.5;

export interface VerdictAxes {
  extraction?: number;
  design?: number;
  implementation?: number;
  deploy?: number;
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Compute spec_fit ∈ [0, 1] from verdict axes.
 * Missing axes contribute 0 (never undefined — clamped).
 */
export function computeSpecFit(v: VerdictAxes): number {
  const e = clamp01(v.extraction ?? 0);
  const d = clamp01(v.design ?? 0);
  const i = clamp01(v.implementation ?? 0);
  const p = clamp01(v.deploy ?? 0);
  const raw =
    SPEC_FIT_WEIGHTS.extraction * e +
    SPEC_FIT_WEIGHTS.design * d +
    SPEC_FIT_WEIGHTS.implementation * i +
    SPEC_FIT_WEIGHTS.deploy * p;
  return clamp01(raw);
}

/**
 * Map (specFit, judgeLabel, runStatus) → SpecFitState (B1).
 *
 *  - `converged`   : score ≥ τ_converge AND label = pass
 *  - `near`        : τ_floor ≤ score < τ_converge
 *  - `below_floor` : score < τ_floor
 *  - `pending`     : run is still running, score not yet computed
 *  - `n_a`         : run aborted/failed before any verdict (e.g. no_go)
 */
export function deriveSpecFitState(
  score: number | null | undefined,
  judgeLabel: 'pass' | 'partial' | 'fail' | null | undefined,
  runStatus:
    | 'pending'
    | 'running'
    | 'converged'
    | 'ceiling_hit'
    | 'failed'
    | 'aborted'
    | null
    | undefined,
): SpecFitState {
  if (runStatus === 'aborted' || runStatus === 'failed') return 'n_a';
  if (score === null || score === undefined) {
    return runStatus === 'pending' || runStatus === 'running' ? 'pending' : 'n_a';
  }
  if (score >= TAU_CONVERGE && judgeLabel === 'pass') return 'converged';
  if (score < TAU_FLOOR) return 'below_floor';
  return 'near';
}

/**
 * UI display: integer percent (round-half-to-even via Math.round bias is fine
 * for receipts framing; SR phrasing already drops decimals — see openapi.yaml).
 */
export function specFitPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null;
  return Math.round(clamp01(score) * 100);
}
