// Stage 3: develop
//
// v1 MVP: emits a JSON manifest of pseudo-files per flow rather than a real
// Next.js tarball. The judge scores the manifest description alone, which is
// sufficient for the demo dataset. Real tarball generation + GCS upload is
// deferred to v2; the SPEC notes "Next.js source tree on Cloud Storage" as
// the eventual contract (§3 row "Develop").
//
// TODO(v2): replace the manifest model with an actual Next.js scaffold
// generator (pnpm create next-app + per-flow page injection), tar+gzip,
// upload to gs://whyc-artifacts/<run_id>/<sha>.tgz, and return that URI.
//
// Phoenix span: "whyc.develop"
// Model tier:   pro (the heaviest stage)

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { callModel } from '../util/gemini.js';
import { withSpan } from '../instrumentation/index.js';
import { StageError, type DevelopResult, type ProductSpec } from './types.js';

const SYSTEM_PROMPT = `You are the WhyC build agent.

Given a ProductSpec (pitch + 3 user flows), produce a strict-JSON manifest of
the Next.js project files you would generate. Do NOT emit code; emit only the
file listing with a one-line summary per file.

Hard rules:
  - Output ONLY JSON matching the schema below. No prose.
  - Cover every flow in the input spec — one entry per flow in per_flow[].
  - For each flow, list 3–8 files: at least one page (app/<route>/page.tsx),
    one component, and one server action or API route.
  - Each file's "lines" estimate is the integer number of source lines you
    would write (10–400).
  - "summary" is one sentence ≤120 chars describing the file's purpose.
  - File paths use forward slashes and are project-relative.

Output schema (strict):
{
  "per_flow": [
    {
      "flow": string,
      "files": [
        { "path": string, "lines": integer, "summary": string }
      ]
    }
  ]
}`;

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

export interface DevelopArgs {
  spec: ProductSpec;
  /** When set, only this flow is regenerated; other flows in `prior` are
   *  carried forward unchanged. Used by self-improve loop iterations. */
  regen_flow?: string;
  /** Prior manifest (when regenerating a single flow). */
  prior?: DevelopManifest;
}

export async function develop(args: DevelopArgs): Promise<DevelopResult> {
  return withSpan(
    'whyc.develop',
    {
      'whyc.flows.count': args.spec.flows.length,
      'whyc.regen_flow': args.regen_flow ?? '(full)',
    },
    async () => {
      const focusFlows = args.regen_flow
        ? args.spec.flows.filter((f) => f.name === args.regen_flow)
        : args.spec.flows;

      if (focusFlows.length === 0) {
        throw new StageError('develop', 'develop.regen_flow_not_found',
          `regen_flow="${args.regen_flow}" not present in spec.flows`, false);
      }

      const userPrompt = `Pitch: ${args.spec.pitch}
Persona: ${args.spec.persona}
JTBD: ${args.spec.jtbd_functional}

Flows to generate (${focusFlows.length}):
${focusFlows.map((f, i) => `  ${i + 1}. ${f.name} — trigger: ${f.trigger} → outcome: ${f.outcome}`).join('\n')}

Emit the JSON manifest now.`;

      const result = await callModel<DevelopManifest>({
        span_name: 'whyc.develop.model',
        tier: 'pro',
        system: SYSTEM_PROMPT,
        user: userPrompt,
        max_retries: 1,
        temperature: 0.4,
        max_output_tokens: 4096,
        parse: (text) => {
          try {
            return ManifestSchema.parse(JSON.parse(text));
          } catch (err) {
            throw new StageError('develop', 'develop.parse_failure',
              `Manifest failed schema: ${err instanceof Error ? err.message : String(err)}`, true);
          }
        },
      });

      // Merge with prior when this is a partial regen.
      const merged: DevelopManifest = args.regen_flow && args.prior
        ? mergeManifest(args.prior, result.parsed, args.regen_flow)
        : result.parsed;

      const manifestJson = JSON.stringify(merged);
      const artifact_sha256 = createHash('sha256').update(manifestJson).digest('hex');

      return {
        artifact_sha256,
        artifact_gcs_uri: 'gs://placeholder/v1-no-tarball', // TODO(v2): real upload
        per_flow: merged.per_flow.map((entry) => ({
          flow: entry.flow,
          files_written: entry.files.length,
        })),
        cost_cents: result.cost_cents,
      };
    },
  );
}

function mergeManifest(prior: DevelopManifest, regen: DevelopManifest, flow: string): DevelopManifest {
  const replacement = regen.per_flow.find((e) => e.flow === flow);
  if (!replacement) return prior; // model didn't return the requested flow; keep prior
  return {
    per_flow: prior.per_flow.map((e) => (e.flow === flow ? replacement : e)),
  };
}
