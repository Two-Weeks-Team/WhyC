// Stage 3 (v2): multi-developer — "PDD on Runtime".
//
// N persona-flavored Gemini Pro advocates each produce a Next.js file manifest
// for the spec's 3 flows; manifests with byte-identical structural shape collapse
// (structural dedup); a single Gemini Pro "cross-picker" then chooses the one
// that best realises the spec, recording a verbatim rationale. Loser manifests
// are retained in the provenance (for the regen-heatmap + audit). The winner
// manifest's SHA-256 is written to runs/<id>/develop-winner.json so the
// pre-deploy hook can prove continuity into Stage 4. Wrapped by pre/post-stage
// hooks.
//
// Like analyze-v2 this is still a *manifest* model (v1's choice — see develop.ts
// header); real tarball generation + GCS upload is Phase 6. The artifact_sha256
// here is the sha of the winning manifest JSON.
//
// Dry-run (WHYC_DRY_RUN=true or no GOOGLE_CLOUD_PROJECT): synthetic per-persona
// manifests + deterministic cross-pick (fewest files), so the stage runs without
// GCP.
//
// Spans: whyc.develop.v2 → whyc.develop.advocate.<persona> ×N → whyc.develop.crosspick

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { trace as otelTrace } from '@opentelemetry/api';
import { callModel } from '../util/gemini.js';
import { withSpan } from '../instrumentation/index.js';
import { runHook, hookPassed, runDir, patchRunState, appendDecision } from '../util/memory.js';
import { advocatesForStage, agentByRole, agentsIndex } from '../util/agents.js';
import {
  StageError,
  type ProductSpec,
  type DevelopResultV2,
  type DevelopProvenance,
  type AdvocateContribution,
  type AdvocatePersona,
  type ManifestLine,
  type HookResult,
} from './types.js';

// ─── manifest shape ──────────────────────────────────────────────────────────

interface DevelopManifest {
  per_flow: ReadonlyArray<{
    flow: string;
    files: ReadonlyArray<{ path: string; lines: number; summary: string }>;
  }>;
}

const ManifestSchema = z.object({
  per_flow: z.array(z.object({
    flow: z.string().min(1).max(80),
    files: z.array(z.object({
      path: z.string().min(3).max(200),
      lines: z.number().int().min(1).max(2000),
      summary: z.string().min(3).max(160),
    })).min(1).max(20),
  })).min(1).max(8),
});

function parseManifestOrThrow(text: string, who: string): DevelopManifest {
  try {
    return ManifestSchema.parse(JSON.parse(text));
  } catch (err) {
    throw new StageError('develop', 'develop.parse_failure',
      `${who} manifest failed schema: ${err instanceof Error ? err.message : String(err)}. First 200 chars: ${text.slice(0, 200)}`, true);
  }
}

// ─── prompts ─────────────────────────────────────────────────────────────────

const BASE_RULES = `Given a ProductSpec (pitch + 3 user flows), produce a strict-JSON manifest of the Next.js (App Router) project files you would generate. Do NOT emit code; emit only the file listing with a one-line summary per file.

Hard rules:
  - Output ONLY JSON matching the schema. No prose.
  - One entry per flow in per_flow[], covering every flow in the spec.
  - For each flow list 3-8 files: at least one page (app/<route>/page.tsx), one component, and one server action or API route.
  - "lines" = integer estimated source lines (10-400). "summary" = one sentence <=120 chars. Paths use forward slashes, project-relative.

Schema:
{ "per_flow": [ { "flow": string, "files": [ { "path": string, "lines": integer, "summary": string } ] } ] }`;

function advocateSystemPrompt(persona: AdvocatePersona, bias: string): string {
  return `You are the WhyC build agent, ADVOCATING the "${persona}" lens.
Your bias: ${bias}
Let that lens shape which components you reach for and how you structure the routes — but every flow in the spec must still be reachable in the manifest.

${BASE_RULES}`;
}

const CROSSPICK_SYSTEM_PROMPT = `You are the WhyC develop cross-picker.
You are given a ProductSpec and several candidate Next.js file manifests written by advocates with different lenses. Pick the SINGLE manifest that best realises the spec's 3 flows on one coherent screen. Prefer the smallest manifest that still covers all flows (KISS); break ties toward fewer files.
Output ONLY strict JSON: { "winner_index": integer (0-based into the candidates list), "rationale": string (<=240 chars, why this one) }. No prose.`;

const CrosspickSchema = z.object({
  winner_index: z.number().int().min(0),
  rationale: z.string().min(3).max(280),
});

// ─── dry-run synthetic developers ────────────────────────────────────────────

function isDryRun(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env['WHYC_DRY_RUN'] === 'true' || !process.env['GOOGLE_CLOUD_PROJECT'];
}

function syntheticManifest(persona: AdvocatePersona, spec: ProductSpec): DevelopManifest {
  // base: per flow → page + component + action. Persona tweaks add/remove files.
  const extraByPersona: Record<AdvocatePersona, (flow: string) => Array<{ path: string; lines: number; summary: string }>> = {
    designer: (f) => [{ path: `src/components/${slug(f)}/hero.tsx`, lines: 90, summary: `editorial hero for the ${f} flow` }, { path: `src/components/${slug(f)}/ledger.tsx`, lines: 70, summary: `receipts ledger panel` }],
    spreadsheet_jockey: (f) => [{ path: `src/components/${slug(f)}/data-grid.tsx`, lines: 140, summary: `dense sortable grid for ${f}` }],
    pragmatist: () => [],
    mobile_first: (f) => [{ path: `src/components/${slug(f)}/bottom-sheet.tsx`, lines: 60, summary: `mobile bottom-sheet for ${f}` }],
    data_nerd: (f) => [{ path: `src/components/${slug(f)}/kpi-strip.tsx`, lines: 80, summary: `KPI strip for ${f}` }, { path: `src/lib/analytics/${slug(f)}.ts`, lines: 40, summary: `flow instrumentation` }],
  };
  return {
    per_flow: spec.flows.map((f) => ({
      flow: f.name,
      files: [
        { path: `src/app/${slug(f.name)}/page.tsx`, lines: 110, summary: `page for the ${f.name} flow — ${f.outcome}`.slice(0, 119) },
        { path: `src/components/${slug(f.name)}/index.tsx`, lines: 95, summary: `main component for ${f.name}` },
        { path: `src/app/${slug(f.name)}/actions.ts`, lines: 45, summary: `server action: ${f.trigger}`.slice(0, 119) },
        ...extraByPersona[persona](f.name),
      ],
    })),
  };
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow';
}

// ─── structural dedup ────────────────────────────────────────────────────────

/** DOM-tree-shape proxy: the sorted multiset of (flow → sorted file paths,
 *  route-collapsed). Two manifests with the same shape are duplicates. */
function structuralSignature(m: DevelopManifest): string {
  const shape = m.per_flow
    .map((e) => ({ flow: e.flow.toLowerCase().trim(), files: e.files.map((f) => f.path.toLowerCase().replace(/\d+/g, '#')).sort() }))
    .sort((a, b) => a.flow.localeCompare(b.flow));
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

function totalFiles(m: DevelopManifest): number {
  return m.per_flow.reduce((n, e) => n + e.files.length, 0);
}

// ─── main ────────────────────────────────────────────────────────────────────

export interface DevelopV2Args {
  spec: ProductSpec;
  runId: string;
  iterationId: string;
  /** 'single' shrinks the advocate fan-out to 1 (cost-ceiling downgrade). */
  advocateMode?: 'multi' | 'single';
  /** SHA-256 of the prior iteration's winning manifest, if this is a regen. */
  priorManifestSha256?: string;
  dryRun?: boolean;
}

export interface DevelopV2Result {
  result: DevelopResultV2;
  cost_cents: number;
  manifest_line: ManifestLine | null;
  hook_results: HookResult[];
}

export async function developV2(args: DevelopV2Args): Promise<DevelopV2Result> {
  const dry = isDryRun(args.dryRun);
  const dir = runDir(args.runId);
  mkdirSync(dir, { recursive: true });
  patchRunState(args.runId, { iteration_id: args.iterationId });

  // pre-stage gate (input = the spec)
  const inPath = join(dir, 'stage-3-develop.input.json');
  writeFileSync(inPath, JSON.stringify(args.spec, null, 2) + '\n');
  const hookResults: HookResult[] = [];
  const pre = await runHook('pre-stage', [dir, 'develop', inPath]);
  hookResults.push(pre);
  if (!hookPassed(pre)) {
    throw new StageError('develop', 'develop.pre_hook_refused', `pre-stage hook refused develop: ${pre.stderr || pre.stdout}`, false);
  }

  return withSpan(
    'whyc.develop.v2',
    { 'whyc.flows.count': args.spec.flows.length, 'whyc.advocate_mode': args.advocateMode ?? 'multi', 'whyc.dry_run': dry, ...(args.priorManifestSha256 ? { 'whyc.prior_manifest_sha256': args.priorManifestSha256 } : {}) },
    async () => {
      const count = args.advocateMode === 'single' ? 1 : agentsIndex().stage_config.develop.advocate_count;
      const roster = advocatesForStage('develop', count);

      // advocate fan-out (each produces a manifest)
      let costCents = 0;
      const contributions: AdvocateContribution<{ artifact_sha256: string; per_flow: ReadonlyArray<{ flow: string; files_written: number }> }>[] = [];
      const manifests: DevelopManifest[] = [];
      const results = await Promise.all(roster.map((agent) => runAdvocate(agent.persona as AdvocatePersona, agent.bias, args.spec, dry)));
      for (const r of results) {
        costCents += r.cost_cents;
        manifests.push(r.manifest);
        const json = JSON.stringify(r.manifest);
        contributions.push({
          persona: r.persona,
          span_id: r.span_id,
          payload: { artifact_sha256: createHash('sha256').update(json).digest('hex'), per_flow: r.manifest.per_flow.map((e) => ({ flow: e.flow, files_written: e.files.length })) },
          cost_cents: r.cost_cents,
          dedup_cluster: -1,
        });
      }

      // structural dedup
      const clusterOf = new Map<string, number>();
      let nextCluster = 0;
      const sigByIdx: number[] = [];
      manifests.forEach((m, i) => {
        const sig = structuralSignature(m);
        if (!clusterOf.has(sig)) clusterOf.set(sig, nextCluster++);
        const c = clusterOf.get(sig)!;
        contributions[i]!.dedup_cluster = c;
        sigByIdx[i] = c;
      });
      const survivorIdx: number[] = [];
      const seen = new Set<number>();
      manifests.forEach((_m, i) => { if (!seen.has(sigByIdx[i]!)) { seen.add(sigByIdx[i]!); survivorIdx.push(i); } });

      // cross-pick winner among survivors
      const chooser = agentByRole('chooser', 'stage:develop');
      const { winnerSurvivorPos, rationale, span_id: cpSpanId, cost_cents: cpCost } = await runCrosspick(
        survivorIdx.map((i) => manifests[i]!), args.spec, dry, chooser.model_tier,
      );
      costCents += cpCost;
      const winnerIdx = survivorIdx[winnerSurvivorPos] ?? survivorIdx[0]!;
      const winnerManifest = manifests[winnerIdx]!;
      const winnerPersona = contributions[winnerIdx]!.persona;
      const winnerJson = JSON.stringify(winnerManifest);
      const winnerSha = createHash('sha256').update(winnerJson).digest('hex');

      // write develop-winner.json (pre-deploy hook re-hashes this)
      const winnerPath = join(dir, 'develop-winner.json');
      writeFileSync(winnerPath, winnerJson + '\n');
      const winnerFileSha = createHash('sha256').update(winnerJson + '\n').digest('hex');

      const provenance: DevelopProvenance = {
        advocates: contributions,
        surviving_clusters: survivorIdx.map((i) => ({ cluster: contributions[i]!.dedup_cluster, representative: contributions[i]!.persona })),
        winner_persona: winnerPersona,
        winner_rationale: rationale,
        ...(args.priorManifestSha256 ? { prior_manifest_sha256: args.priorManifestSha256 } : {}),
      };
      const result: DevelopResultV2 = {
        artifact_sha256: winnerSha,
        artifact_gcs_uri: 'gs://placeholder/v2-no-tarball-yet', // Phase 6: real tarball + upload
        per_flow: winnerManifest.per_flow.map((e) => ({ flow: e.flow, files_written: e.files.length })),
        cost_cents: costCents,
        manifest_sha256: winnerFileSha, // sha of the on-disk develop-winner.json
        _provenance: provenance,
      };

      // post-stage gate
      const outPath = join(dir, 'stage-3-develop.output.json');
      writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
      patchRunState(args.runId, { total_cost_cents: costCents, develop_winner_manifest_sha256: winnerFileSha });
      const traceId = otelTrace.getActiveSpan()?.spanContext().traceId ?? 'null';
      const post = await runHook('post-stage', [dir, 'develop', outPath, traceId, String(costCents)]);
      hookResults.push(post);
      if (!hookPassed(post)) {
        throw new StageError('develop', 'develop.post_hook_refused', `post-stage hook refused develop output: ${post.stderr || post.stdout}`, true);
      }
      let manifestLine: ManifestLine | null = null;
      try { manifestLine = JSON.parse(post.stdout.trim().split('\n').filter(Boolean).pop() ?? '') as ManifestLine; } catch { /* hook still wrote the file */ }
      appendDecision(args.runId, `develop-v2: ${survivorIdx.length}/${contributions.length} manifest clusters; winner=${winnerPersona} (${totalFiles(winnerManifest)} files); cp span=${cpSpanId.slice(0, 8)}`);

      return { result, cost_cents: costCents, manifest_line: manifestLine, hook_results: hookResults };
    },
  );
}

// ─── runners ─────────────────────────────────────────────────────────────────

async function runAdvocate(
  persona: AdvocatePersona, bias: string, spec: ProductSpec, dry: boolean,
): Promise<{ persona: AdvocatePersona; span_id: string; manifest: DevelopManifest; cost_cents: number }> {
  return withSpan(
    `whyc.develop.advocate.${persona}`,
    { 'whyc.advocate.persona': persona, 'openinference.span.kind': 'LLM' },
    async () => {
      const spanId = otelTrace.getActiveSpan()?.spanContext().spanId ?? '';
      if (dry) return { persona, span_id: spanId, manifest: syntheticManifest(persona, spec), cost_cents: 1 };
      const userPrompt = `Pitch: ${spec.pitch}\nPersona: ${spec.persona}\nJTBD: ${spec.jtbd_functional}\n\nFlows (${spec.flows.length}):\n${spec.flows.map((f, i) => `  ${i + 1}. ${f.name} — trigger: ${f.trigger} → outcome: ${f.outcome}`).join('\n')}\n\nEmit the JSON manifest now, through the ${persona} lens.`;
      const r = await callModel<DevelopManifest>({
        span_name: `whyc.develop.advocate.${persona}.model`,
        tier: 'pro', system: advocateSystemPrompt(persona, bias), user: userPrompt,
        max_retries: 1, temperature: 0.5, max_output_tokens: 4096,
        parse: (text) => parseManifestOrThrow(text, `advocate:${persona}`),
      });
      return { persona, span_id: spanId, manifest: r.parsed, cost_cents: r.cost_cents };
    },
  );
}

async function runCrosspick(
  survivors: DevelopManifest[], spec: ProductSpec, dry: boolean, tier: 'flash' | 'pro',
): Promise<{ winnerSurvivorPos: number; rationale: string; span_id: string; cost_cents: number }> {
  return withSpan(
    'whyc.develop.crosspick',
    { 'whyc.crosspick.candidates': survivors.length, 'openinference.span.kind': 'LLM' },
    async () => {
      const spanId = otelTrace.getActiveSpan()?.spanContext().spanId ?? '';
      if (survivors.length === 1) return { winnerSurvivorPos: 0, rationale: 'only one structural candidate after dedup', span_id: spanId, cost_cents: 0 };
      if (dry) {
        // deterministic: fewest files; tie → lowest index
        let best = 0;
        for (let i = 1; i < survivors.length; i++) if (totalFiles(survivors[i]!) < totalFiles(survivors[best]!)) best = i;
        return { winnerSurvivorPos: best, rationale: `dry-run: smallest manifest (${totalFiles(survivors[best]!)} files) that covers all ${spec.flows.length} flows`, span_id: spanId, cost_cents: 0 };
      }
      const cands = survivors.map((m, i) => `Candidate ${i}:\n${JSON.stringify(m)}`).join('\n\n');
      const r = await callModel<z.infer<typeof CrosspickSchema>>({
        span_name: 'whyc.develop.crosspick.model',
        tier, system: CROSSPICK_SYSTEM_PROMPT,
        user: `ProductSpec:\n${JSON.stringify({ pitch: spec.pitch, flows: spec.flows })}\n\nCandidates:\n\n${cands}\n\nPick the winner now.`,
        max_retries: 1, temperature: 0.1, max_output_tokens: 512,
        parse: (text) => {
          try { return CrosspickSchema.parse(JSON.parse(text)); }
          catch (err) { throw new StageError('develop', 'develop.crosspick_parse_failure', `cross-pick output bad: ${err instanceof Error ? err.message : String(err)}`, true); }
        },
      });
      const pos = Math.min(r.parsed.winner_index, survivors.length - 1);
      return { winnerSurvivorPos: pos, rationale: r.parsed.rationale, span_id: spanId, cost_cents: r.cost_cents };
    },
  );
}
