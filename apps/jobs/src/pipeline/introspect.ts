// Stage 4.5 / SPEC §6 step 4 — Phoenix MCP introspection.
//
// Runs AFTER judge and BEFORE self-improve.  The agent queries Phoenix Cloud
// for its own trace data (M19: the agent itself, not a sidecar) and produces
// a TraceSummary that self-improve consumes alongside the judge verdict.
//
// Why this exists as a discrete stage:
//   1. It's the Arize-track scoring criterion — judges read SPEC §6 step 4
//      and the convergence chart on the project detail page to verify the
//      agent actually does this.
//   2. It enriches the regen decision.  Judge says "weakest_flow=core" based
//      on rendered output; introspect can disagree if traces show, e.g., the
//      "core" develop span succeeded but the "review" judge span errored —
//      regen the *correct* flow.
//   3. It makes the trace surface available on /api/v1/iterations/{id}/audit
//      (the API stores the phoenix_console_url returned by this stage).
//
// Phoenix span: "whyc.introspect"
// Cost: zero LLM, only a Phoenix REST call (or synthetic in DRY_RUN).

import { withSpan } from '../instrumentation/index.js';
import { querySpans, projectRef } from '../util/phoenix-client.js';
import type { PhoenixSpanSummary, TraceSummary } from './types.js';

const HIGH_LATENCY_MS = 60_000;
const DOMINANT_FLOW_RATIO = 0.7;

export interface IntrospectArgs {
  run_id: string;
  /** Whatever the judge surfaced.  introspect may override. */
  judge_weakest_flow: string;
  /** Optional: trace IDs to scope the self-query to (e.g. the judge panel's
   *  trace). When empty, querySpans falls back to the whyc.run_id attribute
   *  filter (covers every pipeline span of the run). */
  trace_ids?: string[];
}

export async function introspect(args: IntrospectArgs): Promise<TraceSummary> {
  return withSpan(
    'whyc.introspect',
    {
      'whyc.run_id': args.run_id,
      'whyc.judge.weakest_flow': args.judge_weakest_flow,
      // Marker attribute judges look for in the trace tree to confirm the
      // agent self-introspected.  See SPEC §6 "step 4 — agent-initiated MCP
      // query, not sidecar".
      'whyc.mcp.self_query': true,
    },
    async () => {
      const traceIds = (args.trace_ids ?? []).filter(Boolean);
      const spans = await querySpans({ run_id: args.run_id, name_prefix: 'whyc.', limit: 200, ...(traceIds.length ? { trace_ids: traceIds } : {}) });
      const project = projectRef();

      const summary: TraceSummary = {
        project_id: project.project_id,
        span_count: spans.length,
        top_expensive: rankByDuration(spans, 5),
        errors: spans.filter((s) => s.status === 'error'),
        per_flow: groupByFlow(spans),
        trace_weakest_flow: chooseTraceWeakestFlow(spans, args.judge_weakest_flow),
        phoenix_console_url: project.console_url,
      };
      return summary;
    },
  );
}

function rankByDuration(spans: ReadonlyArray<PhoenixSpanSummary>, top: number): PhoenixSpanSummary[] {
  return [...spans].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, top);
}

interface FlowAgg {
  flow: string;
  total_duration_ms: number;
  error_count: number;
  has_high_latency: boolean;
}

function groupByFlow(spans: ReadonlyArray<PhoenixSpanSummary>): FlowAgg[] {
  const byFlow = new Map<string, FlowAgg>();
  for (const s of spans) {
    const flowAttr = s.attrs['whyc.flow'];
    const flow = typeof flowAttr === 'string' && flowAttr ? flowAttr : 'global';
    let agg = byFlow.get(flow);
    if (!agg) {
      agg = { flow, total_duration_ms: 0, error_count: 0, has_high_latency: false };
      byFlow.set(flow, agg);
    }
    agg.total_duration_ms += s.duration_ms;
    if (s.status === 'error') agg.error_count += 1;
    if (s.duration_ms >= HIGH_LATENCY_MS) agg.has_high_latency = true;
  }
  return [...byFlow.values()].sort((a, b) => b.total_duration_ms - a.total_duration_ms);
}

/** Override the judge's weakest_flow if introspect finds strong trace evidence
 *  that another flow is the real problem.  Three triggers:
 *    1. One flow accounts for >70% of total duration → it's the bottleneck.
 *    2. A flow has ≥1 error spans while judge_weakest has 0 → errors dominate.
 *    3. judge said 'global' AND introspect has a clear leader → use the leader.
 *  Otherwise return null (self-improve will keep the judge's choice). */
function chooseTraceWeakestFlow(
  spans: ReadonlyArray<PhoenixSpanSummary>,
  judgeWeakest: string,
): string | null {
  const flows = groupByFlow(spans);
  if (flows.length === 0) return null;

  const total = flows.reduce((acc, f) => acc + f.total_duration_ms, 0);
  if (total === 0) return null;

  const dominant = flows[0];
  if (!dominant) return null;

  // Trigger 1: dominant by duration.
  if (dominant.total_duration_ms / total >= DOMINANT_FLOW_RATIO && dominant.flow !== judgeWeakest) {
    return dominant.flow;
  }

  // Trigger 2: error-bearing flow ≠ judgeWeakest.
  const errored = flows.find((f) => f.error_count > 0);
  if (errored && errored.flow !== judgeWeakest) {
    return errored.flow;
  }

  // Trigger 3: judge said global, pick dominant.
  if (judgeWeakest === 'global' && dominant.flow !== 'global') {
    return dominant.flow;
  }

  return null;
}
