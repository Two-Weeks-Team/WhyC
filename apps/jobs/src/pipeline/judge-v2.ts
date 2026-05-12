// Stage 5 (v2): 5-critic judge panel — "PDD on Runtime".
//
// Five Gemini Pro critics — pitch_alignment, flows_present, design_quality,
// implementation, security — each independently score the 4 spec-fit axes for
// the deployed preview; the security critic additionally raises a pass/fail
// security_flag. The meta-tally averages the five critics per axis (immutable
// equal critic weights = 0.2 each), then computes spec_fit = Σ(axis_avg ×
// axis_weight) closed-form (the post-stage hook re-asserts this). After the
// panel, the `category-gate-security.py` hook fires: any security_flag → the
// run is marked for escalation to mitigation (not thrown — the dispatcher
// decides what to do with it).
//
// LLM calls go through callModel (OpenInference-instrumented → traces land in
// Phoenix). After the panel, the per-critic verdicts + the meta-tally are
// written back onto the traced spans as Phoenix span annotations
// (util/phoenix-annotate.ts → @arizeai/phoenix-client.logSpanAnnotations), so
// the evaluations are queryable in the Phoenix UI. Re-expressing the critics as
// @arizeai/phoenix-evals ClassificationEvaluator instances additionally needs an
// `ai`-SDK-compatible Vertex provider as the evaluator model — a follow-up; the
// evaluation results land in Phoenix via the annotation path either way.
//
// Dry-run (WHYC_DRY_RUN=true / no GOOGLE_CLOUD_PROJECT): deterministic
// synthetic critics derived from the manifest, so the panel runs without GCP.
//
// Spans: whyc.judge.v2 → whyc.judge.critic.<critic> ×5

import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { trace as otelTrace } from '@opentelemetry/api';
import { callModel } from '../util/gemini.js';
import { withSpan } from '../instrumentation/index.js';
import { runHook, hookPassed, runDir, patchRunState, appendDecision } from '../util/memory.js';
import { logSpanEvals, type SpanEval } from '../util/phoenix-annotate.js';
import { judgeCritics } from '../util/agents.js';
import {
  StageError,
  type ProductSpec,
  type DevelopResultV2,
  type JudgeAxisScore,
  type JudgePanelOutput,
  type CriticVerdict,
  type ManifestLine,
  type HookResult,
} from './types.js';

// ─── immutable weights ───────────────────────────────────────────────────────

const AXIS_NAMES = ['pitch_alignment', 'flows_present', 'design_quality', 'implementation'] as const;
type AxisName = typeof AXIS_NAMES[number];
const AXIS_WEIGHTS: Record<AxisName, number> = { pitch_alignment: 0.20, flows_present: 0.20, design_quality: 0.45, implementation: 0.15 };
const CRITIC_NAMES = ['pitch_alignment', 'flows_present', 'design_quality', 'implementation', 'security'] as const;
type CriticName = typeof CRITIC_NAMES[number];
const CRITIC_WEIGHT = 0.2; // equal, immutable
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// ─── per-critic LLM contract ─────────────────────────────────────────────────

const CriticOutputSchema = z.object({
  axes: z.array(z.object({
    axis: z.enum(AXIS_NAMES),
    score_0_1: z.number().min(0).max(1),
    rationale: z.string().min(1).max(220),
  })).length(4),
  security_flag: z.boolean(),
  rationale: z.string().min(1).max(280),
});

function criticSystemPrompt(critic: CriticName, bias: string): string {
  return `You are a WhyC judge-panel critic with the "${critic}" lens.
Your bias: ${bias}
Score the deployed preview against its ProductSpec on ALL FOUR axes (pitch_alignment, flows_present, design_quality, implementation), each 0..1, but weight your *attention* and strictness toward your lens. ${critic === 'security' ? 'You ALSO output security_flag = true if the preview could leak secrets / internal URLs / PII, echo unsanitised input, or reproduce the company\'s proprietary IP verbatim — be conservative, flag on any real concern. Otherwise security_flag = false.' : 'You always output security_flag = false (security is the security critic\'s call, not yours).'}
Output ONLY strict JSON:
{ "axes": [ {"axis":"pitch_alignment","score_0_1":<0..1>,"rationale":"<=200 chars"}, {"axis":"flows_present",...}, {"axis":"design_quality",...}, {"axis":"implementation",...} ], "security_flag": <bool>, "rationale": "<=240 chars overall" }`;
}

// ─── dry-run synthetic critics ───────────────────────────────────────────────

function isDryRun(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env['WHYC_DRY_RUN'] === 'true' || !process.env['GOOGLE_CLOUD_PROJECT'];
}

function syntheticCritic(critic: CriticName, spec: ProductSpec, develop: DevelopResultV2): { axes: Array<{ axis: AxisName; score_0_1: number; rationale: string }>; security_flag: boolean; rationale: string } {
  const flowSet = new Set(spec.flows.map((f) => f.name));
  const covered = develop.per_flow.filter((e) => flowSet.has(e.flow)).length;
  const flowsPresent = covered / Math.max(1, spec.flows.length);
  const avgFiles = develop.per_flow.reduce((n, e) => n + e.files_written, 0) / Math.max(1, develop.per_flow.length);
  const designQ = Math.min(1, avgFiles / 5);                 // proxy: richer manifest ⇒ more finished
  const impl = develop.per_flow.length === spec.flows.length ? 0.85 : 0.6;
  const pitch = spec.pitch.length > 20 ? 0.8 : 0.6;
  // each critic nudges its own axis slightly to reflect its strictness
  const nudge: Record<CriticName, AxisName | null> = { pitch_alignment: 'pitch_alignment', flows_present: 'flows_present', design_quality: 'design_quality', implementation: 'implementation', security: null };
  const base: Record<AxisName, number> = { pitch_alignment: pitch, flows_present: flowsPresent, design_quality: designQ, implementation: impl };
  const my = nudge[critic];
  const axes = AXIS_NAMES.map((axis) => {
    let s = base[axis];
    if (my === axis) s = round4(Math.max(0, s - 0.05)); // the lens owner is stricter
    return { axis, score_0_1: round4(s), rationale: `${critic} view of ${axis}: ${(s).toFixed(2)} (synthetic)` };
  });
  return { axes, security_flag: false, rationale: `${critic} synthetic verdict (dry-run)` };
}

// ─── main ────────────────────────────────────────────────────────────────────

export interface JudgeV2Args {
  spec: ProductSpec;
  develop: DevelopResultV2;
  deploy_url: string;
  runId: string;
  iterationId: string;
  judge_prompt_version?: string;
  dryRun?: boolean;
}

export interface JudgeV2Result {
  verdict: JudgePanelOutput;
  cost_cents: number;
  escalate_security: boolean;
  manifest_line: ManifestLine | null;
  hook_results: HookResult[];
}

export async function judgeV2(args: JudgeV2Args): Promise<JudgeV2Result> {
  const dry = isDryRun(args.dryRun);
  const dir = runDir(args.runId);
  mkdirSync(dir, { recursive: true });
  patchRunState(args.runId, { iteration_id: args.iterationId });

  const inPath = join(dir, 'stage-5-judge.input.json');
  writeFileSync(inPath, JSON.stringify({ spec: args.spec, develop_per_flow: args.develop.per_flow, deploy_url: args.deploy_url }, null, 2) + '\n');
  const hookResults: HookResult[] = [];
  const pre = await runHook('pre-stage', [dir, 'judge', inPath]);
  hookResults.push(pre);
  if (!hookPassed(pre)) {
    throw new StageError('judge', 'judge.pre_hook_refused', `pre-stage hook refused judge: ${pre.stderr || pre.stdout}`, false);
  }

  return withSpan(
    'whyc.judge.v2',
    { 'whyc.deploy_url': args.deploy_url, 'whyc.flows.count': args.spec.flows.length, 'whyc.judge_prompt_version': args.judge_prompt_version ?? 'v1', 'whyc.dry_run': dry },
    async () => {
      const critics = judgeCritics();
      const known = new Set<string>(CRITIC_NAMES);
      let costCents = 0;

      const verdicts: CriticVerdict[] = await Promise.all(critics.map(async (agent) => {
        const critic = agent.critic_axis as CriticName;
        if (!known.has(critic)) throw new StageError('judge', 'judge.unknown_critic', `agents/v4-index.json has critic "${critic}" not in the panel set`, false);
        return runCritic(critic, agent.bias, args.spec, args.develop, args.deploy_url, dry);
      })).then((arr) => arr.map((v) => { costCents += v.cost_cents; return v.verdict; }));

      // ── meta-tally: consensus per axis = mean of the 5 critics ──
      const consensusAxes: JudgeAxisScore[] = AXIS_NAMES.map((axis) => {
        const scores = verdicts.map((v) => v.axes.find((a) => a.axis === axis)?.score_0_1 ?? 0);
        const mean = round4(scores.reduce((s, x) => s + x, 0) / scores.length);
        return { axis, score_0_1: mean, weight: AXIS_WEIGHTS[axis], rationale: `meta-tally mean of ${scores.length} critics = ${mean.toFixed(4)}` };
      });
      const specFit = round4(consensusAxes.reduce((s, a) => s + a.score_0_1 * a.weight, 0));

      // closed-form drift self-check (the post-stage hook also schema-checks)
      const recomputed = round4(consensusAxes.reduce((s, a) => s + a.score_0_1 * a.weight, 0));
      if (Math.abs(recomputed - specFit) > 1e-6) {
        throw new StageError('judge', 'judge.formula_mismatch', `spec_fit ${specFit} ≠ Σ(axis×weight) ${recomputed}`, false);
      }

      const weakestFlow = pickWeakestFlow(args.spec, args.develop);
      const anyFlag = verdicts.some((v) => v.security_flag);
      const panelSpanId = otelTrace.getActiveSpan()?.spanContext().spanId ?? '';
      const verdict: JudgePanelOutput = {
        judge_prompt_version: args.judge_prompt_version ?? 'v1',
        axes: consensusAxes,
        spec_fit: specFit,
        weakest_flow: weakestFlow,
        trace_id: otelTrace.getActiveSpan()?.spanContext().traceId ?? '',
        critics: verdicts,
        critic_weights: { pitch_alignment: CRITIC_WEIGHT, flows_present: CRITIC_WEIGHT, design_quality: CRITIC_WEIGHT, implementation: CRITIC_WEIGHT, security: CRITIC_WEIGHT },
        any_security_flag: anyFlag,
      };

      // ── post-stage gate ──
      const outPath = join(dir, 'stage-5-judge.output.json');
      writeFileSync(outPath, JSON.stringify(verdict, null, 2) + '\n');
      patchRunState(args.runId, { total_cost_cents: costCents, last_spec_fit: specFit });
      const traceId = verdict.trace_id || 'null';
      const post = await runHook('post-stage', [dir, 'judge', outPath, traceId, String(costCents)]);
      hookResults.push(post);
      if (!hookPassed(post)) {
        throw new StageError('judge', 'judge.post_hook_refused', `post-stage hook refused judge output: ${post.stderr || post.stdout}`, true);
      }
      let manifestLine: ManifestLine | null = null;
      try { manifestLine = JSON.parse(post.stdout.trim().split('\n').filter(Boolean).pop() ?? '') as ManifestLine; } catch { /* hook still wrote the file */ }

      // ── category gate: security ──
      const gate = await runHook('category-gate-security', [dir, outPath]);
      hookResults.push(gate);
      const escalate = gate.exit_code === 2;
      appendDecision(args.runId, `judge-v2: spec_fit=${specFit.toFixed(4)} weakest=${weakestFlow} security_flag=${anyFlag} gate=${escalate ? 'ESCALATE' : 'clear'}`);

      // ── Phoenix span annotations: write the verdicts back onto the traced
      //    spans so they're queryable as evaluations (best-effort, non-fatal). ──
      const evals: SpanEval[] = [];
      if (panelSpanId) {
        evals.push({ spanId: panelSpanId, name: 'spec_fit', score: specFit, label: specFit >= 0.92 ? 'converged' : 'below_tau', explanation: `meta-tally of ${verdicts.length} critics; weakest_flow=${weakestFlow}`, metadata: { weakest_flow: weakestFlow, judge_prompt_version: verdict.judge_prompt_version, any_security_flag: anyFlag } });
        for (const a of consensusAxes) evals.push({ spanId: panelSpanId, name: `axis.${a.axis}`, score: a.score_0_1, metadata: { weight: a.weight } });
        evals.push({ spanId: panelSpanId, name: 'security', label: anyFlag ? 'flag' : 'clear', explanation: anyFlag ? 'one or more critics raised security_flag' : 'no security concerns raised' });
      }
      for (const v of verdicts) {
        if (!v.trace_id) continue; // runCritic stores the critic span_id here
        evals.push({ spanId: v.trace_id, name: `critic.${v.critic}.spec_fit`, score: v.spec_fit, explanation: v.rationale });
        if (v.critic === 'security') evals.push({ spanId: v.trace_id, name: 'security_flag', label: v.security_flag ? 'flag' : 'clear', explanation: v.rationale });
      }
      const annotated = await logSpanEvals(evals);
      if (annotated > 0) appendDecision(args.runId, `judge-v2: ${annotated} Phoenix span annotation(s) written`);

      return { verdict, cost_cents: costCents, escalate_security: escalate, manifest_line: manifestLine, hook_results: hookResults };
    },
  );
}

// ─── critic runner ───────────────────────────────────────────────────────────

async function runCritic(
  critic: CriticName, bias: string, spec: ProductSpec, develop: DevelopResultV2, deployUrl: string, dry: boolean,
): Promise<{ verdict: CriticVerdict; cost_cents: number }> {
  return withSpan(
    `whyc.judge.critic.${critic}`,
    { 'whyc.judge.critic': critic, 'openinference.span.kind': 'LLM' },
    async () => {
      const spanId = otelTrace.getActiveSpan()?.spanContext().spanId ?? '';
      let raw: z.infer<typeof CriticOutputSchema>;
      let cost: number;
      if (dry) {
        raw = syntheticCritic(critic, spec, develop);
        cost = 1;
      } else {
        const r = await callModel<z.infer<typeof CriticOutputSchema>>({
          span_name: `whyc.judge.critic.${critic}.model`,
          tier: 'pro',
          system: criticSystemPrompt(critic, bias),
          user: `ProductSpec:\n${JSON.stringify(spec, null, 2)}\n\nDevelopResult.per_flow:\n${JSON.stringify(develop.per_flow, null, 2)}\n\nWinner manifest sha256: ${develop.manifest_sha256}\nDeployed URL (informational — do NOT fetch): ${deployUrl}\n\nEmit your strict JSON verdict now.`,
          max_retries: 1, temperature: 0.2, max_output_tokens: 1024,
          parse: (text) => {
            try { return CriticOutputSchema.parse(JSON.parse(text)); }
            catch (err) { throw new StageError('judge', 'judge.critic_parse_failure', `critic ${critic} output bad: ${err instanceof Error ? err.message : String(err)}`, true); }
          },
        });
        raw = r.parsed;
        cost = r.cost_cents;
      }
      // security_flag: only the security critic may set it true
      const security_flag = critic === 'security' ? raw.security_flag : false;
      const axes: JudgeAxisScore[] = raw.axes.map((a) => ({ axis: a.axis, score_0_1: round4(a.score_0_1), weight: AXIS_WEIGHTS[a.axis], rationale: a.rationale }));
      const critSpecFit = round4(axes.reduce((s, a) => s + a.score_0_1 * a.weight, 0));
      return { verdict: { critic, axes, spec_fit: critSpecFit, security_flag, trace_id: spanId, rationale: raw.rationale }, cost_cents: cost };
    },
  );
}

function pickWeakestFlow(spec: ProductSpec, develop: DevelopResultV2): string {
  // proxy: the flow with the fewest generated files (or 'global' if uniform)
  if (develop.per_flow.length === 0) return 'global';
  let min = develop.per_flow[0]!;
  let uniform = true;
  for (const e of develop.per_flow) { if (e.files_written !== min.files_written) uniform = false; if (e.files_written < min.files_written) min = e; }
  void spec;
  return uniform ? 'global' : min.flow;
}
