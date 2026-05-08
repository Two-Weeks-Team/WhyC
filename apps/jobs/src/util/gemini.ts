// Gemini SDK wrapper — single point of model access for the pipeline.
//
// Why a wrapper rather than direct VertexAI calls in each stage:
//   - Centralized cost accounting (we tally tokens per call into Run.totalCostCents)
//   - Centralized retry policy (one place to change)
//   - Easy mock for unit tests (vitest replaces this module)
//   - Future model-router (analyze on Gemini Flash, develop on Gemini Pro)
//
// All calls pass through OpenInference auto-instrumentation via Vertex AI SDK.

import { VertexAI, type GenerativeModel, type GenerateContentResult } from '@google-cloud/vertexai';
import { withSpan } from '../instrumentation/index.js';

const PROJECT_ID = process.env['GOOGLE_CLOUD_PROJECT'] ?? '';
const LOCATION = process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1';

let _vertex: VertexAI | null = null;
function vertex(): VertexAI {
  if (!_vertex) {
    if (!PROJECT_ID) {
      throw new Error('GOOGLE_CLOUD_PROJECT not set — cannot instantiate VertexAI');
    }
    _vertex = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  }
  return _vertex;
}

export type ModelTier = 'flash' | 'pro';

const MODEL_NAMES: Record<ModelTier, string> = {
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
};

/** Approximate per-1k-token costs in USD-cents. Conservative.
 *  Used for the `Run.totalCostCents` ledger and the cost ceiling check (M7).
 *  Refresh quarterly. */
const COST_CENTS_PER_1K_TOKENS: Record<ModelTier, { input: number; output: number }> = {
  flash: { input: 0.0075, output: 0.030 },
  pro: { input: 0.125, output: 0.500 },
};

export interface ModelCallResult<T> {
  parsed: T;
  raw: GenerateContentResult;
  cost_cents: number;
  input_tokens: number;
  output_tokens: number;
  model: string;
}

export interface ModelCallOpts<T> {
  /** Logical name for the Phoenix span (e.g. "whyc.analyze"). */
  span_name: string;
  /** Tier to dispatch to. */
  tier: ModelTier;
  /** System instruction (model role). */
  system: string;
  /** User content (the actual prompt). */
  user: string;
  /** JSON parser; throws if model output isn't valid for the schema. */
  parse: (text: string) => T;
  /** Max retries on parse failure (we re-prompt with the parse error). */
  max_retries?: number;
  /** Generation config knobs. */
  temperature?: number;
  max_output_tokens?: number;
}

export async function callModel<T>(opts: ModelCallOpts<T>): Promise<ModelCallResult<T>> {
  const modelName = MODEL_NAMES[opts.tier];
  const model: GenerativeModel = vertex().getGenerativeModel({
    model: modelName,
    systemInstruction: opts.system,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.max_output_tokens ?? 4096,
      responseMimeType: 'application/json',
    },
  });

  return withSpan(
    opts.span_name,
    {
      'llm.system': 'gemini',
      'llm.model_name': modelName,
      'openinference.span.kind': 'LLM',
    },
    async () => {
      let lastError: unknown;
      const maxRetries = opts.max_retries ?? 1;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const userPrompt = attempt === 0
            ? opts.user
            : `${opts.user}\n\n[retry — your previous output failed JSON parse: ${String(lastError)}]`;

          const raw = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          });
          const text = extractText(raw);
          const parsed = opts.parse(text);

          const usage = raw.response.usageMetadata;
          const inputTokens = usage?.promptTokenCount ?? 0;
          const outputTokens = usage?.candidatesTokenCount ?? 0;
          const costRate = COST_CENTS_PER_1K_TOKENS[opts.tier];
          const costCents = Math.ceil(
            (inputTokens / 1000) * costRate.input + (outputTokens / 1000) * costRate.output,
          );

          return {
            parsed,
            raw,
            cost_cents: costCents,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            model: modelName,
          };
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  );
}

function extractText(result: GenerateContentResult): string {
  const cand = result.response.candidates?.[0];
  if (!cand) throw new Error('Gemini returned no candidates');
  const text = cand.content.parts.map((p) => ('text' in p ? p.text : '')).join('');
  if (!text) throw new Error('Gemini candidate had no text');
  return text;
}
