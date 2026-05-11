// Phoenix Cloud HTTP client — the surface the WhyC agent uses to introspect
// its own traces (M19 / SPEC §6 step 4 / Arize-track bonus criterion).
//
// Phoenix MCP server (https://arize.com/docs/phoenix/integrations/phoenix-mcp-server)
// is a thin protocol layer over the same Phoenix backend.  For Cloud Run jobs
// running outside a workstation, the most reliable transport is the
// public REST API.  This module is the seam: when we move to a Cloud Run
// stack that can host the MCP stdio bridge, swap the implementation here
// without touching `pipeline/introspect.ts`.
//
// Two backends:
//   - real:    HTTP against ARIZE_PHOENIX_ENDPOINT with bearer token.
//   - dry-run: synthetic spans deterministic on run_id.  Lets the orchestrator
//              integration-test exercise the introspect path without a live
//              Phoenix project.

import type { PhoenixSpanSummary } from '../pipeline/types.js';

const PHOENIX_ENDPOINT = process.env['ARIZE_PHOENIX_ENDPOINT'] ?? 'https://app.phoenix.arize.com';
const PHOENIX_API_KEY = process.env['ARIZE_PHOENIX_API_KEY'] ?? '';
const PHOENIX_PROJECT = process.env['ARIZE_PHOENIX_PROJECT'] ?? 'whyc-jobs';
const DRY_RUN = process.env['WHYC_DRY_RUN'] === 'true';

export interface QuerySpansArgs {
  /** Filter to spans tagged with this run_id attribute (`whyc.run_id`). */
  run_id: string;
  /** Optional: only spans whose name starts with this prefix.  Defaults to
   *  "whyc." to scope down to our pipeline spans, not OTel auto-instrumented
   *  HTTP / DB chatter. */
  name_prefix?: string;
  /** Max spans to return.  Cap = 100 (we never need more than this for one run). */
  limit?: number;
}

export interface PhoenixProjectRef {
  /** Project id we surface to judges via the audit URL. */
  project_id: string;
  /** Click-through URL for the detail page (M19). */
  console_url: string;
}

/** Returns the project descriptor (so introspect can pass it to TraceSummary). */
export function projectRef(): PhoenixProjectRef {
  const base = PHOENIX_ENDPOINT.replace(/\/$/, '');
  return {
    project_id: PHOENIX_PROJECT,
    console_url: `${base}/projects/${encodeURIComponent(PHOENIX_PROJECT)}`,
  };
}

export async function querySpans(args: QuerySpansArgs): Promise<PhoenixSpanSummary[]> {
  if (DRY_RUN) return synthesize(args);
  return queryReal(args);
}

// ── real HTTP backend ────────────────────────────────────────────────────────

async function queryReal(args: QuerySpansArgs): Promise<PhoenixSpanSummary[]> {
  const limit = Math.min(args.limit ?? 100, 100);
  const namePrefix = args.name_prefix ?? 'whyc.';
  const url = `${PHOENIX_ENDPOINT.replace(/\/$/, '')}/v1/spans`;

  // Phoenix REST surface accepts an attribute filter via query params.
  // We rely on attribute `whyc.run_id` which the dispatcher stamps onto
  // every pipeline span via withSpan(... { 'whyc.run_id': runRow.id }).
  const params = new URLSearchParams({
    project: PHOENIX_PROJECT,
    limit: String(limit),
    'filter.attribute.whyc.run_id': args.run_id,
    'filter.name_prefix': namePrefix,
  });

  const res = await fetch(`${url}?${params}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(PHOENIX_API_KEY ? { authorization: `Bearer ${PHOENIX_API_KEY}` } : {}),
    },
  });

  if (!res.ok) {
    // Don't fail the run — surface a warning and return empty.  Self-improve
    // falls back to judge-only signal.  Phoenix outage is non-fatal (SPEC §10
    // — phoenix.unavailable is a degraded read, not a pipeline halt).
    console.warn(`[phoenix] querySpans ${res.status} ${res.statusText} — falling back to empty trace summary`);
    return [];
  }

  const json = (await res.json()) as { spans?: RawSpan[] };
  const raw = json.spans ?? [];
  return raw.map(toSummary).filter((s): s is PhoenixSpanSummary => s !== null);
}

interface RawSpan {
  span_id?: string;
  name?: string;
  start_time?: string;
  end_time?: string;
  status_code?: string;
  attributes?: Record<string, unknown>;
}

function toSummary(raw: RawSpan): PhoenixSpanSummary | null {
  const id = raw.span_id;
  const name = raw.name;
  if (!id || !name) return null;
  const start = raw.start_time ? Date.parse(raw.start_time) : 0;
  const end = raw.end_time ? Date.parse(raw.end_time) : 0;
  const duration_ms = end && start ? Math.max(0, end - start) : 0;
  const status: 'ok' | 'error' | 'unset' =
    raw.status_code === 'ERROR' ? 'error' : raw.status_code === 'OK' ? 'ok' : 'unset';

  const attrs: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw.attributes ?? {})) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attrs[k] = v;
  }

  const input = attrs['llm.token_count.prompt'];
  const output = attrs['llm.token_count.completion'];

  const summary: PhoenixSpanSummary = {
    span_id: id,
    name,
    duration_ms,
    status,
    attrs,
  };
  if (typeof input === 'number') summary.input_tokens = input;
  if (typeof output === 'number') summary.output_tokens = output;
  return summary;
}

// ── dry-run synthetic backend ────────────────────────────────────────────────

function synthesize(args: QuerySpansArgs): PhoenixSpanSummary[] {
  // Deterministic on run_id so integration tests are reproducible.
  const seed = hashString(args.run_id);
  const flows = ['onboarding', 'core', 'review'];
  const spans: PhoenixSpanSummary[] = [];
  let cursor = seed;
  for (let i = 0; i < 12; i++) {
    cursor = (cursor * 1103515245 + 12345) & 0x7fffffff;
    const flow = flows[cursor % flows.length] ?? 'core';
    const stage = ['develop', 'judge', 'analyze'][cursor % 3] ?? 'develop';
    const isErr = (cursor % 11) === 0;
    spans.push({
      span_id: `synth-${args.run_id.slice(0, 8)}-${i.toString().padStart(2, '0')}`,
      name: `whyc.${stage}`,
      duration_ms: 800 + (cursor % 30000),
      status: isErr ? 'error' : 'ok',
      input_tokens: 200 + (cursor % 1200),
      output_tokens: 100 + (cursor % 600),
      attrs: {
        'whyc.run_id': args.run_id,
        'whyc.flow': flow,
        'openinference.span.kind': stage === 'analyze' ? 'CHAIN' : 'LLM',
      },
    });
  }
  return spans;
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}
