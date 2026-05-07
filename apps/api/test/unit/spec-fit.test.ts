/**
 * Unit test (M11 — deterministic spec-fit formula).
 *
 * The formula MUST be a pure function of the verdict JSON. Re-derivability is
 * a hard auditability requirement (SPEC.md §4).
 */

import { describe, expect, it } from 'vitest';
import {
  SPEC_FIT_WEIGHTS,
  TAU_CONVERGE,
  TAU_FLOOR,
  computeSpecFit,
  deriveSpecFitState,
  specFitPercent,
} from '@/util/spec-fit';

describe('SPEC_FIT_WEIGHTS', () => {
  it('weights sum to 1.00', () => {
    const sum =
      SPEC_FIT_WEIGHTS.extraction +
      SPEC_FIT_WEIGHTS.design +
      SPEC_FIT_WEIGHTS.implementation +
      SPEC_FIT_WEIGHTS.deploy;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('implementation weight is the heaviest (deliberate)', () => {
    expect(SPEC_FIT_WEIGHTS.implementation).toBeGreaterThan(SPEC_FIT_WEIGHTS.extraction);
    expect(SPEC_FIT_WEIGHTS.implementation).toBeGreaterThan(SPEC_FIT_WEIGHTS.design);
    expect(SPEC_FIT_WEIGHTS.implementation).toBeGreaterThan(SPEC_FIT_WEIGHTS.deploy);
  });
});

describe('computeSpecFit', () => {
  it('all 1.0 axes → 1.0', () => {
    expect(
      computeSpecFit({ extraction: 1, design: 1, implementation: 1, deploy: 1 }),
    ).toBeCloseTo(1.0, 10);
  });
  it('all 0 axes → 0', () => {
    expect(computeSpecFit({ extraction: 0, design: 0, implementation: 0, deploy: 0 })).toBe(0);
  });
  it('worked example: 0.9 / 0.9 / 0.95 / 0.85 → 0.9175', () => {
    const v = computeSpecFit({
      extraction: 0.9,
      design: 0.9,
      implementation: 0.95,
      deploy: 0.85,
    });
    // 0.20*0.9 + 0.20*0.9 + 0.45*0.95 + 0.15*0.85 = 0.18 + 0.18 + 0.4275 + 0.1275 = 0.915
    expect(v).toBeCloseTo(0.915, 6);
  });
  it('clamps over-1 inputs to 1', () => {
    expect(
      computeSpecFit({ extraction: 5, design: 5, implementation: 5, deploy: 5 }),
    ).toBeCloseTo(1.0, 10);
  });
  it('clamps negative inputs to 0', () => {
    expect(
      computeSpecFit({ extraction: -1, design: -1, implementation: -1, deploy: -1 }),
    ).toBe(0);
  });
});

describe('deriveSpecFitState', () => {
  it('converged at score≥0.92 AND label=pass', () => {
    expect(deriveSpecFitState(TAU_CONVERGE, 'pass', 'converged')).toBe('converged');
    expect(deriveSpecFitState(0.95, 'pass', 'running')).toBe('converged');
  });
  it('not converged when label≠pass even if score≥0.92', () => {
    expect(deriveSpecFitState(0.95, 'partial', 'running')).toBe('near');
  });
  it('near when τ_floor ≤ score < τ_converge', () => {
    expect(deriveSpecFitState(0.7, 'partial', 'running')).toBe('near');
    expect(deriveSpecFitState(TAU_FLOOR, 'fail', 'running')).toBe('near');
  });
  it('below_floor when score < τ_floor', () => {
    expect(deriveSpecFitState(0.3, 'fail', 'running')).toBe('below_floor');
  });
  it('pending when running and no score yet', () => {
    expect(deriveSpecFitState(null, null, 'pending')).toBe('pending');
    expect(deriveSpecFitState(null, null, 'running')).toBe('pending');
  });
  it('n_a for aborted/failed', () => {
    expect(deriveSpecFitState(0.5, 'fail', 'aborted')).toBe('n_a');
    expect(deriveSpecFitState(null, null, 'failed')).toBe('n_a');
  });
});

describe('specFitPercent', () => {
  it('rounds to integer percent', () => {
    expect(specFitPercent(0.876)).toBe(88);
    expect(specFitPercent(0.0)).toBe(0);
    expect(specFitPercent(1.0)).toBe(100);
  });
  it('null passthrough', () => {
    expect(specFitPercent(null)).toBeNull();
  });
});
