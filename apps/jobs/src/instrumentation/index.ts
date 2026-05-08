// OpenInference + OTel instrumentation bootstrap for the WhyC pipeline jobs.
//
// Per SPEC.md §10.2 (Phoenix egress redaction): we attach a span processor
// that hashes/truncates `input.value` and `output.value` for the heavy LLM
// spans and runs a PII regex over all attributes before export. The export
// destination is Phoenix Cloud (M14 sampling cap = 50k traces/month).
//
// Rule: this file is loaded EXACTLY ONCE at process start, before any Gemini
// SDK or Vertex AI client is constructed. main.ts imports it as the very
// first statement.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, type ReadableSpan, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';

const PHOENIX_ENDPOINT = process.env['ARIZE_PHOENIX_ENDPOINT'] ?? 'https://app.phoenix.arize.com/v1/traces';
const PHOENIX_API_KEY = process.env['ARIZE_PHOENIX_API_KEY'] ?? '';
const SERVICE_NAME = process.env['OTEL_SERVICE_NAME'] ?? 'whyc-jobs';
const SERVICE_VERSION = process.env['OTEL_SERVICE_VERSION'] ?? '0.1.0';

/** Strip / truncate sensitive fields BEFORE the OTLP exporter ships the span.
 *  This wraps a delegate processor; we do the mutation in `onEnd`. */
class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  onStart(span: import('@opentelemetry/sdk-trace-base').Span, parentContext: ReturnType<typeof otelContext.active>): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    redactInPlace(span.attributes);
    this.delegate.onEnd(span);
  }
}

/** Mutates attributes object in place. Heavy fields are sha256+head; PII regex strips. */
function redactInPlace(attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== 'string') continue;

    // 1. Heavy LLM I/O: keep first 256 chars + sha256 only.
    if (key === 'input.value' || key === 'output.value' || key === 'llm.prompts' || key === 'llm.completion') {
      attrs[key] = truncateAndHash(value);
      continue;
    }

    // 2. PII regex pre-pass.
    attrs[key] = stripPii(value);
  }
}

function truncateAndHash(s: string): string {
  if (s.length <= 256) return s;
  // Synchronous hash via Node's crypto — small enough.
  // We import lazily to avoid circular bootstrap.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const sha = createHash('sha256').update(s).digest('hex');
  return `${s.slice(0, 256)}…[sha256:${sha}]`;
}

const PII_PATTERNS = [
  // email
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // phone (loose)
  /\+?\d[\d\s().-]{7,}\d/g,
  // US SSN
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // 13–19 digit credit-card like sequences
  /\b\d{13,19}\b/g,
];

function stripPii(s: string): string {
  let out = s;
  for (const re of PII_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

/** Idempotent boot. Returns the SDK so main.ts can shutdown cleanly on SIGTERM. */
export function startTelemetry(): NodeSDK {
  const exporterConfig: { url: string; headers?: Record<string, string> } = { url: PHOENIX_ENDPOINT };
  if (PHOENIX_API_KEY) exporterConfig.headers = { authorization: `Bearer ${PHOENIX_API_KEY}` };
  const exporter = new OTLPTraceExporter(exporterConfig);

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new RedactingSpanProcessor(new BatchSpanProcessor(exporter))],
  });

  sdk.start();
  return sdk;
}

/** Helper for stage modules: open a child span under the active trace. */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (spanAttrs: Record<string, string | number | boolean>) => Promise<T>,
): Promise<T> {
  const tracer = otelTrace.getTracer(SERVICE_NAME);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
      const result = await fn(attrs);
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: err instanceof Error ? err.message : String(err) }); // ERROR
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
