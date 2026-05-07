/**
 * Sparkline — SVG-based per-iteration spec-fit history.
 *
 * Backed by `RunSummary.spec_fit_sparkline` (max 7 points, H-P1).
 *
 * A11y posture (per A11y deferred-low item in SPEC.md):
 *   - The visual SVG is `aria-hidden`.
 *   - The wrapping `<span>` carries `role='img'` plus a generated
 *     `aria-label` summarising the iteration count and final spec-fit
 *     percent so SR users hear something meaningful in a dense row. The
 *     full per-iteration breakdown is available on the dedicated
 *     `/api/v1/runs/{id}/iterations` view.
 *
 * Last point is highlighted in `--good` color so the converged value reads
 * cleanly in a dense leaderboard row.
 */

import type { SpecFitState } from '@/lib/api/types';

export interface SparklineProps {
  values: Array<number | null> | undefined; // 0..1, max 7
  width?: number;
  height?: number;
  finalState?: SpecFitState | undefined;
  /** Optional aria description. */
  caption?: string;
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  finalState,
  caption,
}: SparklineProps) {
  const points = (values ?? []).filter(
    (v): v is number => typeof v === 'number',
  );

  if (points.length === 0) {
    return (
      <span className="sparkline" role="img" aria-label="No iteration history yet">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <line
            className="axis"
            x1={0}
            y1={height - 2}
            x2={width}
            y2={height - 2}
          />
        </svg>
      </span>
    );
  }

  const padX = 2;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const denom = Math.max(points.length - 1, 1);
  const coords = points.map((v, i) => {
    const x = padX + (i / denom) * innerW;
    const y = padY + (1 - v) * innerH;
    return { x, y, v };
  });

  const path = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ');

  const last = coords[coords.length - 1];

  return (
    <span className="sparkline" role="img" aria-label={caption ?? `Spec-fit per iteration; ${points.length} points; final ${Math.round((points[points.length - 1] ?? 0) * 100)} percent`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <line
          className="axis"
          x1={0}
          y1={height - 2}
          x2={width}
          y2={height - 2}
        />
        <path className="line" d={path} />
        {coords.map((c, i) => {
          const isLast = i === coords.length - 1;
          return (
            <circle
              key={i}
              className={`point${isLast ? ' last' : ''}`}
              cx={c.x}
              cy={c.y}
              r={isLast ? 2.5 : 1.6}
            />
          );
        })}
        {last && finalState === 'converged' && (
          <circle
            className="point last"
            cx={last.x}
            cy={last.y}
            r={3.5}
            fill="none"
            stroke="var(--good)"
            strokeWidth={1}
          />
        )}
      </svg>
    </span>
  );
}
