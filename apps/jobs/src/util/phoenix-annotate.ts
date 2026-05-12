// Phoenix span annotations — write the judge panel's structured verdicts back
// onto the traced spans, so they show up as queryable evaluations in the Phoenix
// UI (the Arize-track surface, R6).
//
// This uses the official @arizeai/phoenix-client (logSpanAnnotations). It is
// best-effort and NON-FATAL: a Phoenix outage, an unauthenticated client, or a
// span that has not been ingested yet (OTLP export is async) must not fail the
// run — we warn and move on. DRY_RUN short-circuits to a no-op.
//
// NOTE: the LLM-as-judge *engine* still runs through util/gemini.ts (callModel,
// OpenInference-instrumented). Re-expressing the critics as
// @arizeai/phoenix-evals ClassificationEvaluator instances would additionally
// require an `ai`-SDK-compatible Vertex provider as the evaluator model — a
// follow-up. The evaluation *results* land in Phoenix here either way.

import { createClient } from '@arizeai/phoenix-client';
import { logSpanAnnotations } from '@arizeai/phoenix-client/spans';

// The SpanAnnotation type is not re-exported from the /spans barrel; mirror the
// fields we use (the call below is still checked against the real param type).
interface PhoenixSpanAnnotation {
  spanId: string;
  name: string;
  annotatorKind?: 'LLM' | 'CODE' | 'HUMAN';
  label?: string;
  score?: number;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

function phoenixBaseUrl(): string {
  const raw = (process.env['ARIZE_PHOENIX_ENDPOINT'] ?? 'https://app.phoenix.arize.com').replace(/\/+$/, '');
  return raw.replace(/\/v1\/traces$/, '').replace(/\/v1$/, '');
}

const PHOENIX_API_KEY = process.env['ARIZE_PHOENIX_API_KEY'] ?? '';
const DRY_RUN = process.env['WHYC_DRY_RUN'] === 'true';

export interface SpanEval {
  /** OpenTelemetry span ID (hex, no 0x). */
  spanId: string;
  /** Annotation/metric name, e.g. "spec_fit" or "judge.design_quality". */
  name: string;
  /** Optional 0..1 score. */
  score?: number;
  /** Optional categorical label, e.g. "pass" / "flag". */
  label?: string;
  /** Optional short rationale. */
  explanation?: string;
  /** Optional structured metadata. */
  metadata?: Record<string, string | number | boolean>;
}

/** Log a batch of span evaluations to Phoenix. Returns the count actually sent
 *  (0 in DRY_RUN or on any failure). */
export async function logSpanEvals(evals: ReadonlyArray<SpanEval>): Promise<number> {
  const valid = evals.filter((e) => e.spanId && (e.score !== undefined || e.label || e.explanation));
  if (DRY_RUN || valid.length === 0) return 0;
  try {
    const client = createClient({
      options: {
        baseUrl: phoenixBaseUrl(),
        headers: PHOENIX_API_KEY ? { Authorization: `Bearer ${PHOENIX_API_KEY}` } : {},
      },
    });
    const spanAnnotations: PhoenixSpanAnnotation[] = valid.map((e) => ({
      spanId: e.spanId,
      name: e.name,
      annotatorKind: 'LLM' as const,
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.score !== undefined ? { score: e.score } : {}),
      ...(e.explanation !== undefined ? { explanation: e.explanation } : {}),
      ...(e.metadata !== undefined ? { metadata: e.metadata } : {}),
    }));
    await logSpanAnnotations({ client, spanAnnotations });
    return spanAnnotations.length;
  } catch (err) {
    console.warn(`[phoenix] logSpanAnnotations failed (${err instanceof Error ? err.message : String(err)}) — verdicts not annotated, run continues`);
    return 0;
  }
}
