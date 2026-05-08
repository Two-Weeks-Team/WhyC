// LLM-as-Judge stage.
//
// Phoenix span: "whyc.judge"
// Model tier:   pro (we want the best reasoning on scoring)
//
// The prompt body below is the v1 frozen prompt. The same body lives in
// prisma/seed.ts as JudgePrompt.bodyMarkdown — keep them in sync.
//
// SPEC §4 weights (immutable):
//   pitch_alignment 0.20  ·  flows_present 0.20  ·  design_quality 0.45  ·  implementation 0.15
// (Note: the SPEC's earlier table uses extraction/design/implementation/deploy
// labels; this judge prompt collapses to four axes as documented in v1.)

import { z } from 'zod';
import { trace as otelTrace } from '@opentelemetry/api';
import { callModel } from '../util/gemini.js';
import { withSpan } from '../instrumentation/index.js';
import { StageError, type DevelopResult, type JudgeOutput, type ProductSpec } from './types.js';

export const JUDGE_PROMPT_V1 = `You are the WhyC LLM-as-Judge. Your single job: score whether a deployed preview matches its product spec.

Inputs:
- ProductSpec (the 14-line spec analyze emitted)
- DevelopResult.per_flow (the manifest of generated files)
- The deployed URL (informational; you do not fetch it)

Output strict JSON:
{
  "judge_prompt_version": "v1",
  "axes": [
    { "axis": "pitch_alignment", "score_0_1": <0..1>, "weight": 0.20, "rationale": "<≤200 chars>" },
    { "axis": "flows_present",   "score_0_1": <0..1>, "weight": 0.20, "rationale": "<≤200 chars>" },
    { "axis": "design_quality",  "score_0_1": <0..1>, "weight": 0.45, "rationale": "<≤200 chars>" },
    { "axis": "implementation",  "score_0_1": <0..1>, "weight": 0.15, "rationale": "<≤200 chars>" }
  ],
  "spec_fit": <sum of axis.score × axis.weight, rounded to 4 decimals>,
  "weakest_flow": "<name of the worst-performing flow, or 'global' if all uniformly weak>"
}

Hard rules:
- Weights are immutable — output them verbatim.
- spec_fit must equal the closed-form sum (you may round to 4 decimals).
- Be strict on design_quality (the heaviest weight) — favor finished work, penalize wireframe-y output.`;

const AXIS_NAMES = ['pitch_alignment', 'flows_present', 'design_quality', 'implementation'] as const;
const AXIS_WEIGHTS: Record<typeof AXIS_NAMES[number], number> = {
  pitch_alignment: 0.20,
  flows_present: 0.20,
  design_quality: 0.45,
  implementation: 0.15,
};

const JudgeOutputSchema = z.object({
  judge_prompt_version: z.string().min(1),
  axes: z.array(z.object({
    axis: z.enum(AXIS_NAMES),
    score_0_1: z.number().min(0).max(1),
    weight: z.number().min(0).max(1),
    rationale: z.string().min(1).max(200),
  })).length(4),
  spec_fit: z.number().min(0).max(1),
  weakest_flow: z.string().min(1),
});

export interface JudgeArgs {
  spec: ProductSpec;
  develop: DevelopResult;
  deploy_url: string;
  judge_prompt_version: string;
}

export async function judge(args: JudgeArgs): Promise<JudgeOutput & { cost_cents: number }> {
  return withSpan(
    'whyc.judge',
    {
      'whyc.judge_prompt_version': args.judge_prompt_version,
      'whyc.deploy_url': args.deploy_url,
      'whyc.flows.count': args.spec.flows.length,
    },
    async () => {
      const userPrompt = `ProductSpec:
${JSON.stringify(args.spec, null, 2)}

DevelopResult.per_flow:
${JSON.stringify(args.develop.per_flow, null, 2)}

Deployed URL (informational only — do NOT fetch it):
${args.deploy_url}

Emit the strict JSON now.`;

      const result = await callModel({
        span_name: 'whyc.judge.model',
        tier: 'pro',
        system: JUDGE_PROMPT_V1,
        user: userPrompt,
        max_retries: 1,
        temperature: 0.2,
        max_output_tokens: 1024,
        parse: (text) => {
          try {
            return JudgeOutputSchema.parse(JSON.parse(text));
          } catch (err) {
            throw new StageError('judge', 'judge.parse_failure',
              `Judge output failed schema: ${err instanceof Error ? err.message : String(err)}`, true);
          }
        },
      });

      // Validate weights match the immutable v1 spec.
      for (const ax of result.parsed.axes) {
        const expected = AXIS_WEIGHTS[ax.axis];
        if (Math.abs(ax.weight - expected) > 1e-6) {
          throw new StageError('judge', 'judge.weight_drift',
            `Axis ${ax.axis} weight ${ax.weight} ≠ expected ${expected}`, false);
        }
      }

      // Validate spec_fit matches closed-form sum (within rounding tolerance).
      const computed = result.parsed.axes.reduce((acc, a) => acc + a.score_0_1 * a.weight, 0);
      if (Math.abs(computed - result.parsed.spec_fit) > 1e-3) {
        throw new StageError('judge', 'judge.formula_mismatch',
          `spec_fit ${result.parsed.spec_fit} ≠ Σ(score×weight) ${computed.toFixed(4)}`, false);
      }

      // Pull the active span's trace_id for the audit trail.
      const span = otelTrace.getActiveSpan();
      const trace_id = span?.spanContext().traceId ?? '';

      return {
        judge_prompt_version: result.parsed.judge_prompt_version,
        axes: result.parsed.axes,
        spec_fit: result.parsed.spec_fit,
        weakest_flow: result.parsed.weakest_flow,
        trace_id,
        cost_cents: result.cost_cents,
      };
    },
  );
}
