// Stage 6 (v2): Phoenix introspection — "PDD on Runtime".
//
// Same job as introspect.ts (the agent reads its OWN run traces back and
// produces a TraceSummary that refines the regen target) but: it sources the
// trace IDs from the v2 judge panel's per-critic verdicts, it is wrapped by the
// pre-stage / post-stage hooks, and it persists the TraceSummary into the run
// dir so the audit page / replay can read it.
//
// The Phoenix read goes through util/phoenix-client.ts, which now uses
// @arizeai/phoenix-client's getSpans({ traceIds }). This stage scopes the
// self-query to the judge panel's recorded trace ID (falling back to the
// whyc.run_id attribute filter when Phoenix has no trace match), carries the
// self_query marker, and persists the refined TraceSummary into the run dir.
//
// Span: whyc.introspect.v2 (carries whyc.mcp.self_query=true)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { trace as otelTrace } from '@opentelemetry/api';
import { introspect } from './introspect.js';
import { runHook, hookPassed, runDir, appendDecision } from '../util/memory.js';
import { StageError, type JudgePanelOutput, type TraceSummary, type ManifestLine, type HookResult } from './types.js';

export interface IntrospectV2Args {
  runId: string;
  iterationId: string;
  /** The Stage-5 judge panel verdict — we pull weakest_flow + critic trace IDs from it. */
  judge: JudgePanelOutput;
  dryRun?: boolean;
}

export interface IntrospectV2Result {
  trace: TraceSummary;
  manifest_line: ManifestLine | null;
  hook_results: HookResult[];
}

export async function introspectV2(args: IntrospectV2Args): Promise<IntrospectV2Result> {
  const dir = runDir(args.runId);
  mkdirSync(dir, { recursive: true });

  const criticTraceIds = args.judge.critics.map((c) => c.trace_id).filter(Boolean);
  const inPath = join(dir, 'stage-6-introspect.input.json');
  writeFileSync(inPath, JSON.stringify({ run_id: args.runId, judge_trace_id: args.judge.trace_id, critic_trace_ids: criticTraceIds, judge_weakest_flow: args.judge.weakest_flow }, null, 2) + '\n');

  const hookResults: HookResult[] = [];
  const pre = await runHook('pre-stage', [dir, 'introspect', inPath]);
  hookResults.push(pre);
  if (!hookPassed(pre)) {
    throw new StageError('self_improve', 'introspect.pre_hook_refused', `pre-stage hook refused introspect: ${pre.stderr || pre.stdout}`, false);
  }

  // introspect() opens its own whyc.introspect span with the self_query marker.
  // Scope the read to the judge panel's trace (the panel + its 5 critic spans
  // live there); phoenix-client falls back to the whyc.run_id attribute filter
  // if that trace ID yields nothing.
  const judgeTraceIds = [args.judge.trace_id].filter(Boolean);
  const trace = await introspect({
    run_id: args.runId,
    judge_weakest_flow: args.judge.weakest_flow,
    ...(judgeTraceIds.length ? { trace_ids: judgeTraceIds } : {}),
  });

  const outPath = join(dir, 'stage-6-introspect.output.json');
  writeFileSync(outPath, JSON.stringify(trace, null, 2) + '\n');
  const traceId = otelTrace.getActiveSpan()?.spanContext().traceId ?? 'null';
  const post = await runHook('post-stage', [dir, 'introspect', outPath, traceId, '0']);
  hookResults.push(post);
  if (!hookPassed(post)) {
    throw new StageError('self_improve', 'introspect.post_hook_refused', `post-stage hook refused introspect output: ${post.stderr || post.stdout}`, true);
  }
  let manifestLine: ManifestLine | null = null;
  try { manifestLine = JSON.parse(post.stdout.trim().split('\n').filter(Boolean).pop() ?? '') as ManifestLine; } catch { /* file still written */ }
  appendDecision(args.runId, `introspect-v2: ${trace.span_count} spans, ${trace.errors.length} errors, trace_weakest_flow=${trace.trace_weakest_flow ?? '(none)'} console=${trace.phoenix_console_url}`);

  void args.dryRun; // introspect() reads DRY_RUN from env via phoenix-client
  return { trace, manifest_line: manifestLine, hook_results: hookResults };
}
