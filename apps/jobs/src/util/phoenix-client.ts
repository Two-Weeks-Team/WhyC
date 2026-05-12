// Phoenix Cloud client — the surface the WhyC agent uses to introspect its own
// traces (M19 / SPEC §6 step 4 / Arize-track criterion).
//
// Read path is now the official `@arizeai/phoenix-client`:
//   createClient({ options: { baseUrl, headers } })  +  getSpans({ traceIds })
// (the dep was already declared; this wires it up). The hand-rolled REST shim
// it replaces only ever had the degraded path working against Phoenix Cloud's
// real schema — getSpans speaks the generated OpenAPI types.
//
// Two backends:
//   - real:    @arizeai/phoenix-client.getSpans against ARIZE_PHOENIX_ENDPOINT.
//   - dry-run: synthetic spans deterministic on run_id, so the orchestrator
//              integration-test exercises the introspect path without a live
//              Phoenix project.
//
// Phoenix outage / auth failure is NON-FATAL: we warn and return [] so
// self-improve falls back to judge-only signal (SPEC §10 — phoenix.unavailable
// is a degraded read, not a pipeline halt).

import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';
import type { PhoenixSpanSummary } from '../pipeline/types.js';

// ARIZE_PHOENIX_ENDPOINT is sometimes set to the OTLP traces ingest URL
// (…/v1/traces) for the span exporter. The read API wants the server base, so
// strip a trailing /v1/traces or /v1.
function phoenixBaseUrl(): string {
  const raw = (process.env['ARIZE_PHOENIX_ENDPOINT'] ?? 'https://app.phoenix.arize.com').replace(/\/+$/, '');
  return raw.replace(/\/v1\/traces$/, '').replace(/\/v1$/, '');
}

const PHOENIX_BASE = phoenixBaseUrl();
const PHOENIX_API_KEY = process.env['ARIZE_PHOENIX_API_KEY'] ?? '';
const PHOENIX_PROJECT = process.env['ARIZE_PHOENIX_PROJECT'] ?? 'whyc-jobs';
const DRY_RUN = process.env['WHYC_DRY_RUN'] === 'true';

export interface QuerySpansArgs {
  /** Filter to spans tagged with this run_id attribute (`whyc.run_id`). */
  run_id: string;
  /** Preferred filter when known (e.g. critic verdict trace IDs): pull every
   *  span in these traces. Falls back to the run_id attribute filter when empty. */
  trace_ids?: string[];
  /** Keep only spans whose name starts with this prefix.  Default "whyc." —
   *  scopes down to our pipeline spans, not OTel auto-instrumented HTTP/DB. */
  name_prefix?: string;
  /** Max spans to return.  Cap = 200. */
  limit?: number;
}

export interface PhoenixProjectRef {
  project_id: string;
  console_url: string;
}

export function projectRef(): PhoenixProjectRef {
  return {
    project_id: PHOENIX_PROJECT,
    console_url: `${PHOENIX_BASE}/projects/${encodeURIComponent(PHOENIX_PROJECT)}`,
  };
}

export async function querySpans(args: QuerySpansArgs): Promise<PhoenixSpanSummary[]> {
  if (DRY_RUN) return synthesize(args);
  return queryReal(args);
}

// ── real backend: @arizeai/phoenix-client ────────────────────────────────────

function phoenixClient(): ReturnType<typeof createClient> {
  return createClient({
    options: {
      baseUrl: PHOENIX_BASE,
      headers: PHOENIX_API_KEY ? { Authorization: `Bearer ${PHOENIX_API_KEY}` } : {},
    },
  });
}

async function queryReal(args: QuerySpansArgs): Promise<PhoenixSpanSummary[]> {
  const limit = Math.min(args.limit ?? 200, 200);
  const namePrefix = args.name_prefix ?? 'whyc.';
  const traceIds = (args.trace_ids ?? []).filter(Boolean);

  try {
    const client = phoenixClient();
    const { spans } = await getSpans({
      client,
      project: { projectName: PHOENIX_PROJECT },
      limit,
      ...(traceIds.length > 0
        ? { traceIds }
        : { attributes: { 'whyc.run_id': args.run_id } }),
    });
    return spans
      .filter((s) => typeof s.name === 'string' && s.name.startsWith(namePrefix))
      .map(toSummary)
      .filter((s): s is PhoenixSpanSummary => s !== null);
  } catch (err) {
    console.warn(`[phoenix] getSpans failed (${err instanceof Error ? err.message : String(err)}) — falling back to empty trace summary`);
    return [];
  }
}

// Phoenix Span (generated OpenAPI shape): { id, name, context:{trace_id,span_id},
// span_kind, parent_id, start_time, end_time, status_code, attributes }.
interface PhoenixApiSpan {
  id?: string;
  name?: string;
  context?: { trace_id?: string; span_id?: string };
  span_kind?: string;
  start_time?: string;
  end_time?: string;
  status_code?: string;
  attributes?: Record<string, unknown>;
}

/** Read a (possibly nested) attribute path from a Phoenix span's attributes —
 *  handles both the dotted-flat form and the un-flattened nested form. */
function readAttr(attrs: Record<string, unknown> | undefined, dotted: string): unknown {
  if (!attrs) return undefined;
  if (dotted in attrs) return attrs[dotted];
  let cur: unknown = attrs;
  for (const seg of dotted.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function flatten(attrs: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, key);
      else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    }
  };
  walk(attrs ?? {}, '');
  return out;
}

function toSummary(raw: PhoenixApiSpan): PhoenixSpanSummary | null {
  const id = raw.context?.span_id ?? raw.id;
  const name = raw.name;
  if (!id || !name) return null;
  const start = raw.start_time ? Date.parse(raw.start_time) : 0;
  const end = raw.end_time ? Date.parse(raw.end_time) : 0;
  const duration_ms = end && start ? Math.max(0, end - start) : 0;
  const status: 'ok' | 'error' | 'unset' =
    raw.status_code === 'ERROR' ? 'error' : raw.status_code === 'OK' ? 'ok' : 'unset';

  const attrs = flatten(raw.attributes);
  // span_kind isn't an attribute on the API span — surface it like one so the
  // introspect heuristics that look at 'openinference.span.kind' keep working.
  if (raw.span_kind && !attrs['openinference.span.kind']) attrs['openinference.span.kind'] = raw.span_kind;

  const input = readAttr(raw.attributes, 'llm.token_count.prompt');
  const output = readAttr(raw.attributes, 'llm.token_count.completion');

  const summary: PhoenixSpanSummary = { span_id: id, name, duration_ms, status, attrs };
  if (typeof input === 'number') summary.input_tokens = input;
  if (typeof output === 'number') summary.output_tokens = output;
  return summary;
}

// ── dry-run synthetic backend ────────────────────────────────────────────────

function synthesize(args: QuerySpansArgs): PhoenixSpanSummary[] {
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
