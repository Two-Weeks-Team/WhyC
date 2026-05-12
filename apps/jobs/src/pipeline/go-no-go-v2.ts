// Stage 2 (v2): go/no-go — "PDD on Runtime".
//
// The six deterministic rules from go-no-go.ts (regulated / hardware / stealth /
// over-complexity / over-budget / IP-red-flags) PLUS an LLM IP-safety eval: a
// Gemini Pro "safety judge" that decides whether building a public preview from
// this spec would *necessarily* reproduce the company's proprietary IP verbatim.
// That call goes through callModel (OpenInference-instrumented) — the realistic
// "Vertex AI Evaluation"-style check we can run today; wiring the full Vertex AI
// Evaluation Service (@google-cloud/aiplatform pipelines) is a follow-up that
// arrives with the GCP provisioning in Phase 6. Wrapped by the pre/post-stage
// hooks.
//
// Dry-run (WHYC_DRY_RUN=true / no GOOGLE_CLOUD_PROJECT): the LLM eval is skipped
// (treated as "no concern"); the deterministic rules still run.
//
// Span: whyc.go_no_go.v2 → whyc.go_no_go.ip_safety_eval (LLM, when not dry)

import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { trace as otelTrace } from '@opentelemetry/api';
import { callModel } from '../util/gemini.js';
import { withSpan } from '../instrumentation/index.js';
import { goNoGo, estimateIterations, estimateCostCents } from './go-no-go.js';
import { runHook, hookPassed, runDir, appendDecision } from '../util/memory.js';
import { StageError, type GoNoGoDecision, type ProductSpec, type ManifestLine, type HookResult } from './types.js';

const IP_EVAL_SYSTEM = `You are the WhyC IP-safety evaluator.
Given a ProductSpec for which we are about to auto-generate a small public web preview, decide: would building a faithful preview of these 3 flows NECESSARILY reproduce the company's proprietary, copyrighted, or trade-secret material verbatim (e.g. their actual codebase, exact UI down to pixel, confidential data)? A preview that merely *resembles* a generic SaaS pattern is fine. Be conservative only when reproduction is genuinely unavoidable.
Output ONLY strict JSON: { "concern": <boolean>, "reason": "<=200 chars" }.`;

const IpEvalSchema = z.object({ concern: z.boolean(), reason: z.string().min(1).max(220) });

function isDryRun(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env['WHYC_DRY_RUN'] === 'true' || !process.env['GOOGLE_CLOUD_PROJECT'];
}

export interface GoNoGoV2Args {
  spec: ProductSpec;
  runId: string;
  iterationId: string;
  iter_limit: number;
  cost_limit_cents: number;
  dryRun?: boolean;
}

export interface GoNoGoV2Result {
  decision: GoNoGoDecision;
  cost_cents: number;
  manifest_line: ManifestLine | null;
  hook_results: HookResult[];
}

export async function goNoGoV2(args: GoNoGoV2Args): Promise<GoNoGoV2Result> {
  const dry = isDryRun(args.dryRun);
  const dir = runDir(args.runId);
  mkdirSync(dir, { recursive: true });

  const inPath = join(dir, 'stage-2-gonogo.input.json');
  writeFileSync(inPath, JSON.stringify({ spec: args.spec, iter_limit: args.iter_limit, cost_limit_cents: args.cost_limit_cents }, null, 2) + '\n');
  const hookResults: HookResult[] = [];
  const pre = await runHook('pre-stage', [dir, 'go_no_go', inPath]);
  hookResults.push(pre);
  if (!hookPassed(pre)) {
    throw new StageError('go_no_go', 'gonogo.pre_hook_refused', `pre-stage hook refused go_no_go: ${pre.stderr || pre.stdout}`, false);
  }

  return withSpan(
    'whyc.go_no_go.v2',
    { 'whyc.flows.count': args.spec.flows.length, 'whyc.dry_run': dry },
    async () => {
      // 1. deterministic rules (reuse v1)
      let decision = await goNoGo({ spec: args.spec, iter_limit: args.iter_limit, cost_limit_cents: args.cost_limit_cents });
      let costCents = 0;

      // 2. LLM IP-safety eval — only if the deterministic pass said 'go'
      if (decision.verdict === 'go' && !dry) {
        const evalRes = await withSpan('whyc.go_no_go.ip_safety_eval', { 'openinference.span.kind': 'LLM' }, async () => {
          return callModel<z.infer<typeof IpEvalSchema>>({
            span_name: 'whyc.go_no_go.ip_safety_eval.model',
            tier: 'pro', system: IP_EVAL_SYSTEM,
            user: `ProductSpec:\n${JSON.stringify(args.spec, null, 2)}\n\nEmit the JSON verdict now.`,
            max_retries: 1, temperature: 0.1, max_output_tokens: 256,
            parse: (text) => {
              try { return IpEvalSchema.parse(JSON.parse(text)); }
              catch (err) { throw new StageError('go_no_go', 'gonogo.ip_eval_parse_failure', `IP-safety eval output bad: ${err instanceof Error ? err.message : String(err)}`, true); }
            },
          });
        });
        costCents += evalRes.cost_cents;
        if (evalRes.parsed.concern) {
          decision = { verdict: 'no_go', code: 'ip_safety_concern', reason: `Vertex-style IP-safety eval: ${evalRes.parsed.reason}` };
        }
      }

      // 3. post-stage gate
      const outPath = join(dir, 'stage-2-gonogo.output.json');
      writeFileSync(outPath, JSON.stringify(decision, null, 2) + '\n');
      const traceId = otelTrace.getActiveSpan()?.spanContext().traceId ?? 'null';
      const post = await runHook('post-stage', [dir, 'go_no_go', outPath, traceId, String(costCents)]);
      hookResults.push(post);
      if (!hookPassed(post)) {
        throw new StageError('go_no_go', 'gonogo.post_hook_refused', `post-stage hook refused go_no_go output: ${post.stderr || post.stdout}`, true);
      }
      let manifestLine: ManifestLine | null = null;
      try { manifestLine = JSON.parse(post.stdout.trim().split('\n').filter(Boolean).pop() ?? '') as ManifestLine; } catch { /* file still written */ }
      const detail = decision.verdict === 'go'
        ? `GO (est ${decision.estimated_iterations} iters / ${decision.estimated_cost_cents}c)`
        : `NO_GO ${decision.code}: ${decision.reason}`;
      appendDecision(args.runId, `go-no-go-v2: ${detail}${dry ? '' : ' (incl. IP-safety eval)'}`);

      return { decision, cost_cents: costCents, manifest_line: manifestLine, hook_results: hookResults };
    },
  );
}

export { estimateIterations, estimateCostCents };
