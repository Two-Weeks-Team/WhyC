/**
 * SpecFitBar — accessible spec-fit progress indicator.
 *
 * Renders the float `final_spec_fit` (0..1) as a percent bar with the
 * SR-determinable `spec_fit_state` label per A11y B1.
 *
 * Canonical aria-label template (openapi.yaml `SpecFitState`):
 *   `"Spec-fit <int>%, <label>"`
 *   e.g. `"Spec-fit 87 percent, near convergence threshold of 92 percent"`.
 */

import type { SpecFitState } from '@/lib/api/types';

export interface SpecFitBarProps {
  value: number | null | undefined; // 0..1
  state: SpecFitState | undefined;
  /** Compact mode for table cells (default: false). */
  compact?: boolean;
  /** Override floor / converge thresholds for the SR description. */
  thresholds?: { converge: number; floor: number };
}

const DEFAULT_THRESHOLDS = { converge: 0.92, floor: 0.5 };

export function SpecFitBar({
  value,
  state,
  compact = false,
  thresholds = DEFAULT_THRESHOLDS,
}: SpecFitBarProps) {
  const pct = value === null || value === undefined ? null : Math.round(value * 100);
  const effectiveState: SpecFitState = state ?? (pct === null ? 'pending' : 'pending');

  const ariaLabel = buildAriaLabel(pct, effectiveState, thresholds);

  return (
    <div
      className="spec-fit-bar"
      role="progressbar"
      aria-valuenow={pct ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      style={compact ? { gap: 6 } : undefined}
    >
      <div className="track" aria-hidden="true">
        <span
          className={`fill ${effectiveState}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <span className="pct" aria-hidden="true">
        {pct === null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}

function buildAriaLabel(
  pct: number | null,
  state: SpecFitState,
  thresholds: { converge: number; floor: number },
): string {
  if (pct === null) {
    if (state === 'pending') return 'Spec-fit pending, run still in progress';
    if (state === 'n_a') return 'Spec-fit not applicable for this run';
    return 'Spec-fit not available';
  }
  const convergePct = Math.round(thresholds.converge * 100);
  const floorPct = Math.round(thresholds.floor * 100);
  switch (state) {
    case 'converged':
      return `Spec-fit ${pct} percent, converged at or above ${convergePct} percent`;
    case 'near':
      return `Spec-fit ${pct} percent, near convergence threshold of ${convergePct} percent`;
    case 'below_floor':
      return `Spec-fit ${pct} percent, below floor threshold of ${floorPct} percent`;
    case 'pending':
      return `Spec-fit ${pct} percent, still iterating`;
    case 'n_a':
      return `Spec-fit ${pct} percent, not applicable`;
    default:
      return `Spec-fit ${pct} percent`;
  }
}
